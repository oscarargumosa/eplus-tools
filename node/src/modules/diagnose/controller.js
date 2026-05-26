/* ── Diagnose controller — admin endpoints for pattern_library + letters ─── */
const model = require('./model');
const engine = require('./engine');
const importer = require('./import/import-proposal');
const letterImporter = require('./import/import-letter');
const proposer = require('./engine/proposer');
const applicator = require('./engine/applicator');

function ok(res, data) {
  return res.json({ ok: true, data });
}
function bad(res, code, message, status = 400) {
  return res.status(status).json({ ok: false, error: { code, message } });
}

exports.listPatterns = async (req, res, next) => {
  try {
    const activeOnly = req.query.all !== '1';
    const data = await model.listAllPatterns({ activeOnly });
    ok(res, data);
  } catch (e) { next(e); }
};

exports.listPatternsForCall = async (req, res, next) => {
  try {
    const callId = req.params.callId;
    if (!callId) return bad(res, 'BAD_REQUEST', 'callId is required');
    const data = await model.listPatternsForCall(callId);
    ok(res, data);
  } catch (e) { next(e); }
};

exports.listPatternsByProgrammeCode = async (req, res, next) => {
  try {
    const code = req.params.programmeCode;
    if (!code) return bad(res, 'BAD_REQUEST', 'programmeCode is required');
    const data = await model.listPatternsByProgrammeCode(code);
    ok(res, data);
  } catch (e) { next(e); }
};

exports.listLetters = async (req, res, next) => {
  try {
    const data = await model.listLetters();
    ok(res, data);
  } catch (e) { next(e); }
};

exports.getLetter = async (req, res, next) => {
  try {
    const id = req.params.id;
    const data = await model.getLetterWithFindings(id);
    if (!data) return bad(res, 'NOT_FOUND', 'Letter not found', 404);
    ok(res, data);
  } catch (e) { next(e); }
};

exports.getStats = async (req, res, next) => {
  try {
    const data = await model.getStats();
    ok(res, data);
  } catch (e) { next(e); }
};

/* ── Diagnose engine endpoints (Fase 2) ─────────────────────────────── */

exports.runDiagnosis = async (req, res, next) => {
  try {
    const { projectId } = req.body || {};
    if (!projectId) return bad(res, 'BAD_REQUEST', 'projectId is required');
    const run = await engine.runDiagnosis(projectId, { userId: req.user?.id });
    ok(res, run);
  } catch (e) {
    if (/not found|nothing to diagnose/i.test(e.message)) {
      return bad(res, 'NOT_FOUND', e.message, 404);
    }
    next(e);
  }
};

exports.getRun = async (req, res, next) => {
  try {
    const run = await engine.getRunWithFindings(req.params.runId);
    if (!run) return bad(res, 'NOT_FOUND', 'Run not found', 404);
    ok(res, run);
  } catch (e) { next(e); }
};

exports.getLatestRunForProject = async (req, res, next) => {
  try {
    const run = await engine.getLatestRunForProject(req.params.projectId);
    if (!run) return ok(res, null);
    ok(res, run);
  } catch (e) { next(e); }
};

// Return the current form_field_values + template structure for the Diagnose
// split-layout (Fase 5). Lets the UI render the editor with the section nav.
exports.getProjectWorkspace = async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const pool = require('../../utils/db');

    // Load project + form instance
    const [projectRows] = await pool.query(
      `SELECT p.id, p.name, p.full_name, p.origin, p.source_evaluation_id,
              fi.id AS instance_id, fi.program_id, fi.template_id,
              ip.program_id AS programme_code, ip.name AS programme_name
       FROM projects p
       LEFT JOIN form_instances fi ON fi.project_id = p.id
       LEFT JOIN intake_programs ip ON fi.program_id = ip.id
       WHERE p.id = ?
       ORDER BY fi.updated_at DESC
       LIMIT 1`,
      [projectId]
    );
    if (projectRows.length === 0) return bad(res, 'NOT_FOUND', 'Project not found', 404);
    const proj = projectRows[0];

    // Load field values
    let fields = [];
    if (proj.instance_id) {
      const [rows] = await pool.query(
        `SELECT field_id, section_path, value_text, value_json
         FROM form_field_values
         WHERE instance_id = ?`,
        [proj.instance_id]
      );
      fields = rows;
    }

    // Load template structure for section nav (subset of template_json)
    let templateSections = [];
    if (proj.template_id) {
      const [tRows] = await pool.query(
        `SELECT template_json FROM form_templates WHERE id = ?`,
        [proj.template_id]
      );
      if (tRows[0]?.template_json) {
        try {
          const tpl = JSON.parse(tRows[0].template_json);
          templateSections = (tpl.sections || []).map(s => ({
            id: s.id,
            number: s.number,
            title: s.title,
            subsections: (s.subsections || []).map(ss => ({
              id: ss.id,
              number: ss.number,
              title: ss.title,
              field_ids: (ss.fields || []).map(f => f.id),
            })),
          }));
        } catch (e) { /* malformed json — ignore */ }
      }
    }

    ok(res, {
      project: {
        id: proj.id,
        name: proj.name,
        full_name: proj.full_name,
        origin: proj.origin,
        source_evaluation_id: proj.source_evaluation_id,
      },
      instance: proj.instance_id ? {
        id: proj.instance_id,
        program_id: proj.program_id,
        programme_code: proj.programme_code,
        programme_name: proj.programme_name,
      } : null,
      template_sections: templateSections,
      fields,
    });
  } catch (e) { next(e); }
};

/* ── Import proposal (Fase 3) — Door B / Door C ─────────────────────── */

exports.uploadProposal = async (req, res, next) => {
  try {
    if (!req.file) return bad(res, 'BAD_REQUEST', 'A .docx file is required (multipart field "file").');
    const { programId, projectName } = req.body || {};
    if (!programId) return bad(res, 'BAD_REQUEST', 'programId is required.');

    const out = await importer.importWordProposal({
      buffer: req.file.buffer,
      programId,
      userId: req.user?.id,
      projectName,
    });
    ok(res, out);
  } catch (e) {
    if (/not found|did not yield/i.test(e.message)) {
      return bad(res, 'BAD_REQUEST', e.message);
    }
    next(e);
  }
};

exports.pasteProposal = async (req, res, next) => {
  try {
    const { programId, projectName, fields } = req.body || {};
    if (!programId) return bad(res, 'BAD_REQUEST', 'programId is required.');
    if (!fields || typeof fields !== 'object') {
      return bad(res, 'BAD_REQUEST', 'fields object (field_id -> text) is required.');
    }
    const out = await importer.importPasteProposal({
      fields,
      programId,
      userId: req.user?.id,
      projectName,
    });
    ok(res, out);
  } catch (e) {
    if (/not found|must contain/i.test(e.message)) {
      return bad(res, 'BAD_REQUEST', e.message);
    }
    next(e);
  }
};

/* ── Upload evaluator letter (Fase 4) — Door C reciclaje ─────────────── */

exports.uploadLetter = async (req, res, next) => {
  try {
    if (!req.file) return bad(res, 'BAD_REQUEST', 'A file is required (multipart field "file").');
    const { programId, projectId, proposalNumber, proposalAcronym, result } = req.body || {};
    if (!programId) return bad(res, 'BAD_REQUEST', 'programId is required.');

    const out = await letterImporter.importLetterFromFile(
      req.file.buffer,
      req.file.originalname,
      programId,
      {
        projectId: projectId || null,
        userId: req.user?.id,
        proposalNumber,
        proposalAcronym,
        result,
      }
    );

    // Trigger pattern library refresh in the background (don't await)
    triggerPatternRebuild().catch(err => console.warn('Pattern rebuild failed:', err.message));

    ok(res, out);
  } catch (e) {
    if (/not found|required/i.test(e.message)) {
      return bad(res, 'BAD_REQUEST', e.message);
    }
    next(e);
  }
};

exports.pasteLetter = async (req, res, next) => {
  try {
    const { programId, projectId, text, proposalNumber, proposalAcronym, result } = req.body || {};
    if (!programId) return bad(res, 'BAD_REQUEST', 'programId is required.');
    if (!text || typeof text !== 'string' || text.length < 100) {
      return bad(res, 'BAD_REQUEST', 'text must be at least 100 characters.');
    }
    const out = await letterImporter.importLetterFromText(text, programId, {
      projectId: projectId || null,
      userId: req.user?.id,
      proposalNumber,
      proposalAcronym,
      result,
    });
    triggerPatternRebuild().catch(err => console.warn('Pattern rebuild failed:', err.message));
    ok(res, out);
  } catch (e) {
    if (/not found|required|at least/i.test(e.message)) {
      return bad(res, 'BAD_REQUEST', e.message);
    }
    next(e);
  }
};

// Background helper: kick off the pattern library rebuild script.
// Non-blocking. If a real job queue exists later, route through there.
async function triggerPatternRebuild() {
  const { spawn } = require('child_process');
  const path = require('path');
  const script = path.join(__dirname, '..', '..', '..', '..', 'scripts', 'diagnose', 'build-pattern-library.js');
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(__dirname))))),
  });
  child.unref();
}

/* ── Improvement actions (Fase 5) — propose / accept / reject ───────── */

exports.proposeForFinding = async (req, res, next) => {
  try {
    const findingId = req.params.findingId;
    if (!findingId) return bad(res, 'BAD_REQUEST', 'findingId is required.');
    const action = await proposer.proposeForFinding(findingId, req.user?.id);
    ok(res, action);
  } catch (e) {
    if (/not found|empty — nothing|no target field/i.test(e.message)) {
      return bad(res, 'BAD_REQUEST', e.message);
    }
    next(e);
  }
};

exports.getAction = async (req, res, next) => {
  try {
    const action = await applicator.loadAction(req.params.actionId);
    if (!action) return bad(res, 'NOT_FOUND', 'Action not found', 404);
    ok(res, action);
  } catch (e) { next(e); }
};

exports.acceptAction = async (req, res, next) => {
  try {
    const r = await applicator.applyAction(req.params.actionId, req.user?.id);
    ok(res, r);
  } catch (e) {
    if (/not found|does not modify|not found in this project|before.*text was not found|whitespace is collapsed/i.test(e.message)) {
      return bad(res, 'BAD_REQUEST', e.message);
    }
    next(e);
  }
};

exports.rejectAction = async (req, res, next) => {
  try {
    const r = await applicator.rejectAction(req.params.actionId, req.user?.id);
    ok(res, r);
  } catch (e) {
    if (/not found/i.test(e.message)) return bad(res, 'NOT_FOUND', e.message, 404);
    next(e);
  }
};

exports.modifyAction = async (req, res, next) => {
  try {
    const { after } = req.body || {};
    if (typeof after !== 'string') return bad(res, 'BAD_REQUEST', '"after" string is required.');
    const r = await applicator.modifyAction(req.params.actionId, after, req.user?.id);
    ok(res, r);
  } catch (e) { next(e); }
};

/* ── Versioning (Fase 5) ─────────────────────────────────────────────── */

exports.listVersions = async (req, res, next) => {
  try {
    const rows = await applicator.listVersions(req.params.projectId);
    ok(res, rows);
  } catch (e) { next(e); }
};

exports.rollbackToVersion = async (req, res, next) => {
  try {
    const { versionId } = req.body || {};
    if (!versionId) return bad(res, 'BAD_REQUEST', 'versionId is required.');
    const r = await applicator.rollbackToVersion(req.params.projectId, versionId, req.user?.id);
    ok(res, r);
  } catch (e) {
    if (/not found|malformed/i.test(e.message)) return bad(res, 'BAD_REQUEST', e.message);
    next(e);
  }
};
