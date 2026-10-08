/* ── Evaluator Controller ─────────────────────────────────────── */
const path = require('path');
const m = require('./model');
const docModel = require('../documents/model');
const intakeModel = require('../intake/model');
const pool = require('../../utils/db');
const { extractText } = require('../../services/vectorize');
const { processDocument } = require('../../services/vectorize');

const ok  = (res, data) => res.json({ ok: true, data });
const { sendError } = require('../../utils/httpError');
// 5xx: mensaje genérico + requestId (el detalle va al log). Ver utils/httpError.
const err = (res, msg, status = 400) => sendError(res, status, { message: msg });

/* ── Programs ────────────────────────────────────────────────── */

exports.listPrograms = async (req, res) => {
  try { ok(res, await m.listAvailablePrograms()); }
  catch (e) { err(res, e.message, 500); }
};

/* ── Form Instances ──────────────────────────────────────────── */

exports.createInstance = async (req, res) => {
  try {
    const { program_id, template_id, title } = req.body;
    if (!program_id || !template_id) return err(res, 'program_id and template_id required');
    const inst = await m.createUserFormInstance({
      userId: req.user.id,
      programId: program_id,
      templateId: template_id,
      title: title || null,
    });
    ok(res, inst);
  } catch (e) { err(res, e.message, 500); }
};

exports.listInstances = async (req, res) => {
  try { ok(res, await m.listUserFormInstances(req.user.id)); }
  catch (e) { err(res, e.message, 500); }
};

exports.getInstance = async (req, res) => {
  try {
    const inst = await m.getUserFormInstance(req.params.id, req.user.id);
    if (!inst) return err(res, 'Not found', 404);
    ok(res, inst);
  } catch (e) { err(res, e.message, 500); }
};

exports.getValues = async (req, res) => {
  try {
    // Verify ownership first
    const inst = await m.getUserFormInstance(req.params.id, req.user.id);
    if (!inst) return err(res, 'Not found', 404);
    ok(res, await m.getFormValues(req.params.id));
  } catch (e) { err(res, e.message, 500); }
};

exports.saveValues = async (req, res) => {
  try {
    const inst = await m.getUserFormInstance(req.params.id, req.user.id);
    if (!inst) return err(res, 'Not found', 404);
    await m.saveFormValues(req.params.id, req.body.values);
    ok(res, { saved: true });
  } catch (e) { err(res, e.message, 500); }
};

/* ── Upload + Parse ──────────────────────────────────────────── */

exports.uploadAndParse = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file provided');

    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(req.file.mimetype)) return err(res, 'Only PDF and DOCX files are allowed');

    // Verify ownership
    const inst = await m.getUserFormInstance(req.params.id, req.user.id);
    if (!inst) return err(res, 'Not found', 404);

    // Save file to disk
    const ext = path.extname(req.file.originalname);
    const filename = `eval-${req.user.id}-${Date.now()}${ext}`;
    const storagePath = await docModel.saveFile(req.file.buffer, filename);

    // Create document record
    const doc = await docModel.createDocument({
      owner_type: 'user_private',
      owner_id: req.user.id,
      doc_type: 'evaluation',
      title: req.file.originalname,
      description: `Evaluated project for ${inst.program_name || 'program'}`,
      file_type: req.file.mimetype,
      file_size_bytes: req.file.size,
      storage_path: storagePath,
      tags: JSON.stringify(['evaluation', 'auto-parsed']),
      status: 'processing',
    });

    // Vectorize in background
    processDocument(doc.id, { storage_path: storagePath, file_type: req.file.mimetype })
      .then(() => docModel.updateDocument(doc.id, { status: 'active' }))
      .catch(e => { console.error('[EVAL-VECTORIZE]', e.message); docModel.updateDocument(doc.id, { status: 'error' }); });

    // Create parse job
    const job = await m.createParseJob({
      instanceId: req.params.id,
      userId: req.user.id,
      documentPath: storagePath,
    });

    // For DOCX: use deterministic parser (instant, no AI needed)
    const isDocx = req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (isDocx) {
      try {
        const { parseFormB } = require('../../services/parse-form-b');
        const parsed = await parseFormB(req.file.buffer);

        // Map parser keys to template field IDs
        const SECTION_MAP = {
          'project_summary':  { section: 'summary',   field: 'summary_text' },
          'sec_1':            { section: 'sec_1_1',   field: 's1_1_text' },
          'sec_1_sub':        null, // duplicate of sec_1
          'sec_1_3':          { section: 'sec_1_3',   field: 's1_3_text' },
          'sec_2_1_1':        { section: 'sec_2_1_1', field: 's2_1_1_text' },
          'sec_2_1_2':        { section: 'sec_2_1_2', field: 's2_1_2_text' },
          'sec_2_1_3_staff': { section: 'sec_2_1_3', field: 's2_1_3_text' },
          'sec_2_2':          { section: 'sec_2_2_1', field: 's2_2_1_text' },
          'sec_2_1_4':        { section: 'sec_2_1_4', field: 's2_1_4_text' },
          'sec_2_1_5':        { section: 'sec_2_1_5', field: 's2_1_5_text' },
          'sec_3_1':          { section: 'sec_3_1',   field: 's3_1_text' },
          'sec_3_2':          { section: 'sec_3_2',   field: 's3_2_text' },
          'sec_3_3':          { section: 'sec_3_3',   field: 's3_3_text' },
          'sec_4':            { section: 'sec_4_1',   field: 's4_1_text' },
          'sec_5_1':          { section: 'sec_5_1',   field: 's5_1_text' },
          'sec_5_2':          { section: 'sec_5_2',   field: 's5_2_text' },
          'sec_6':            { section: 'sec_6_1',   field: 's6_1_details' },
        };

        // Save parsed sections as form values with correct template keys
        const values = {};
        for (const [parserKey, content] of Object.entries(parsed.sections)) {
          const mapping = SECTION_MAP[parserKey];
          if (!mapping) continue;
          values[mapping.section + '.' + mapping.field] = content;
        }

        // Cover page fields
        if (parsed.cover) {
          if (parsed.cover.project_name) values['cover.project_title'] = parsed.cover.project_name;
          if (parsed.cover.acronym) values['cover.project_acronym'] = parsed.cover.acronym;
          if (parsed.cover.coordinator) {
            const parts = parsed.cover.coordinator.split(',').map(s => s.trim());
            if (parts[0]) values['cover.coordinator_name'] = parts[0];
            if (parts[1]) values['cover.coordinator_org'] = parts[1];
            if (parts[2]) values['cover.coordinator_email'] = parts[2];
          }
        }

        // Use pre-split sections from parser
        if (parsed.sections['sec_2_2_1']) values['sec_2_2_1.s2_2_1_text'] = parsed.sections['sec_2_2_1'];
        if (parsed.sections['sec_2_2_2']) values['sec_2_2_2.s2_2_2_text'] = parsed.sections['sec_2_2_2'];
        if (parsed.sections['sec_1_1']) values['sec_1_1.s1_1_text'] = parsed.sections['sec_1_1'];
        if (parsed.sections['sec_1_2']) values['sec_1_2.s1_2_text'] = parsed.sections['sec_1_2'];

        // Tables — convert objects to arrays for the table renderer
        if (parsed.risk_table?.length) {
          values['sec_2_1_5.s2_1_5_risk_table'] = parsed.risk_table.map(r =>
            [r.number || '', r.description || '', r.wp || '', r.mitigation || '']
          );
        }
        if (parsed.staff_table?.length) {
          values['sec_2_1_3.s2_1_3_staff_table'] = parsed.staff_table.map(s =>
            [s.name || '', s.organisation || '', s.role || '', s.profile || '']
          );
        }

        // Work packages
        for (const wp of parsed.work_packages) {
          const wpKey = 'wp_' + wp.number;
          values[wpKey + '.name'] = wp.name;
          values[wpKey + '.duration'] = wp.duration || '';
          values[wpKey + '.lead'] = wp.lead || '';
          values[wpKey + '.objectives'] = wp.objectives || '';
          if (wp.tasks.length) values[wpKey + '.tasks'] = wp.tasks;
          if (wp.milestones.length) values[wpKey + '.milestones'] = wp.milestones;
          if (wp.deliverables.length) values[wpKey + '.deliverables'] = wp.deliverables;
        }
        if (parsed.events_table?.length) values['sec_4.events_table'] = parsed.events_table;

        await m.saveFormValues(req.params.id, values);
        await m.updateParseJob(job.id, { status: 'complete', progress: 100, current_section: 'Done' });

        ok(res, { jobId: job.id, documentId: doc.id, instant: true });
      } catch (e) {
        console.error('[DOCX-PARSE] Error:', e.message);
        await m.updateParseJob(job.id, { status: 'error', error_message: e.message });
        ok(res, { jobId: job.id, documentId: doc.id });
      }
    } else {
      // For PDF: fall back to AI parsing
      try {
        const text = await extractText(req.file.buffer, req.file.mimetype);
        if (!text || text.trim().length < 100) return err(res, 'Could not extract enough text from document');

        const aiParse = require('../../services/ai-parse');
        aiParse.parseDocument({
          jobId: job.id,
          instanceId: req.params.id,
          documentText: text,
          templateJson: inst.template_json,
        }).catch(e => {
          console.error('[AI-PARSE] Fatal:', e.message);
          m.updateParseJob(job.id, { status: 'error', error_message: e.message });
        });
      } catch (e) {
        console.error('[AI-PARSE] Module not available:', e.message);
        m.updateParseJob(job.id, { status: 'error', error_message: 'AI parsing service not configured' });
      }
      ok(res, { jobId: job.id, documentId: doc.id });
    }
  } catch (e) { err(res, e.message, 500); }
};

/* ── Parse Job Status ────────────────────────────────────────── */

exports.getParseStatus = async (req, res) => {
  try {
    const job = await m.getParseJob(req.params.jobId);
    if (!job) return err(res, 'Job not found', 404);
    if (job.user_id !== req.user.id) return err(res, 'Forbidden', 403);
    ok(res, job);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Delete instance ─────────────────────────────────────────── */
exports.deleteInstance = async (req, res) => {
  try {
    const removed = await m.deleteUserFormInstance(req.params.id, req.user.id);
    if (!removed) return err(res, 'Not found', 404);
    ok(res, { id: req.params.id });
  } catch (e) { err(res, e.message, 500); }
};

/* ── Promote evaluation → editable project ────────────────────────
   Creates a new project (origin='imported') seeded from a form_instance
   the user uploaded for evaluation. Lets the user "rewrite" an old
   proposal using the platform.
   ────────────────────────────────────────────────────────────── */
exports.promoteToProject = async (req, res) => {
  try {
    const inst = await m.getUserFormInstance(req.params.id, req.user.id);
    if (!inst) return err(res, 'Evaluation not found', 404);

    const projectName = (inst.title || inst.program_name || 'Imported project').toString().slice(0, 200);

    const project = await intakeModel.createProject(req.user.id, {
      name: projectName,
      type: inst.action_type || null,
      proposal_lang: 'en',
    });

    // Mark provenance: this project was imported from an evaluation.
    await pool.query(
      `UPDATE projects SET origin = 'imported', source_evaluation_id = ? WHERE id = ? AND user_id = ?`,
      [inst.id, project.id, req.user.id]
    );

    ok(res, { id: project.id, name: projectName, origin: 'imported', source_evaluation_id: inst.id });
  } catch (e) { err(res, e.message, 500); }
};
