/* ═══════════════════════════════════════════════════════════════
   Master Document — Controller (HTTP layer)
   ═══════════════════════════════════════════════════════════════
   Stubs CRUD. NO conecta LLM todavía. Las funciones de regeneración,
   diagnóstico, compresión y export se añaden en la fase siguiente
   (ver docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md).

   Convención de respuesta (CLAUDE.md §"Cómo trabajar con el código"):
     { ok: true, data: ... } | { ok: false, error: ... }
   ═══════════════════════════════════════════════════════════════ */

const model = require('./model');
const cag = require('./cag-pipeline');
const developerModel = require('../developer/model');
const pool = require('../../utils/db');
const genUUID = require('../../utils/uuid');
const { ENFORCE_CAPS, FIELD_CHAR_LIMITS, getFieldLimit, truncate, estimatePages } = require('../exporter/field-limits');

function ok(res, data) { res.json({ ok: true, data }); }
function bad(res, status, error) { res.status(status).json({ ok: false, error }); }

/* ── Documents ───────────────────────────────────────────────── */

async function listMasterDocuments(req, res) {
  try {
    const docs = await model.listMasterDocumentsByProject(req.params.projectId);
    ok(res, docs);
  } catch (e) { bad(res, 500, e.message); }
}

async function getMasterDocument(req, res) {
  try {
    const doc = await model.getMasterDocument(req.params.id);
    if (!doc) return bad(res, 404, 'master_document not found');
    const chapters = await model.listChapters(doc.id);
    ok(res, { ...doc, chapters });
  } catch (e) { bad(res, 500, e.message); }
}

async function createMasterDocument(req, res) {
  try {
    const projectId = req.params.projectId;
    const { versionTag, versionLabel, language, parentId } = req.body || {};
    const doc = await model.createMasterDocument({ projectId, versionTag, versionLabel, language, parentId });
    ok(res, doc);
  } catch (e) { bad(res, 500, e.message); }
}

async function updateMasterDocument(req, res) {
  try {
    const doc = await model.updateMasterDocument(req.params.id, req.body || {});
    if (!doc) return bad(res, 404, 'master_document not found');
    ok(res, doc);
  } catch (e) { bad(res, 500, e.message); }
}

async function deleteMasterDocument(req, res) {
  try {
    await model.deleteMasterDocument(req.params.id);
    ok(res, { deleted: true });
  } catch (e) { bad(res, 500, e.message); }
}

/* ── Chapters ────────────────────────────────────────────────── */

async function listChapters(req, res) {
  try {
    const chapters = await model.listChapters(req.params.id);
    ok(res, chapters);
  } catch (e) { bad(res, 500, e.message); }
}

async function createChapter(req, res) {
  try {
    const masterDocId = req.params.id;
    const body = req.body || {};
    if (!body.chapterKey || !body.chapterType || !body.title) {
      return bad(res, 400, 'chapterKey, chapterType and title are required');
    }
    const chapter = await model.createChapter({ masterDocId, ...body });
    ok(res, chapter);
  } catch (e) { bad(res, 500, e.message); }
}

async function updateChapter(req, res) {
  try {
    const actor = req.body && req.body._actor === 'ai' ? 'ai' : 'human';
    // Normaliza body para que use snake_case en la BD
    const patch = {};
    const b = req.body || {};
    for (const [src, dst] of Object.entries({
      chapterKey: 'chapter_key', chapterType: 'chapter_type', title: 'title',
      body: 'body', sortOrder: 'sort_order', parentChapterId: 'parent_chapter_id',
      refEntityType: 'ref_entity_type', refEntityId: 'ref_entity_id'
    })) {
      if (b[src] !== undefined) patch[dst] = b[src];
    }
    const chapter = await model.updateChapter(req.params.id, patch, { actor });
    if (!chapter) return bad(res, 404, 'chapter not found');
    ok(res, chapter);
  } catch (e) { bad(res, 500, e.message); }
}

async function deleteChapter(req, res) {
  try {
    await model.deleteChapter(req.params.id);
    ok(res, { deleted: true });
  } catch (e) { bad(res, 500, e.message); }
}

/* ── Exports ─────────────────────────────────────────────────── */

async function listExports(req, res) {
  try {
    const rows = await model.listExports(req.params.projectId);
    ok(res, rows);
  } catch (e) { bad(res, 500, e.message); }
}

/**
 * Exporta el Master entero como Markdown (vista amplia, para revisión humana).
 * Devuelve text/markdown como body. Si ?download=1, fuerza descarga.
 */
async function exportMasterAsMarkdown(req, res) {
  try {
    const masterDocId = req.params.id;
    const doc = await model.getMasterDocument(masterDocId);
    if (!doc) return bad(res, 404, 'master_document not found');
    const chapters = await model.listChapters(masterDocId);

    const [projRows] = await pool.query('SELECT name FROM projects WHERE id = ?', [doc.project_id]);
    const projectName = projRows[0]?.name || 'Proyecto';

    let md = `# Documento Maestro — ${projectName}\n\n`;
    md += `*Versión: ${doc.version_tag}${doc.version_label ? ' — ' + doc.version_label : ''}*  \n`;
    md += `*Idioma: ${doc.language}*  \n`;
    md += `*Estado: ${doc.status}*  \n`;
    md += `*Total caracteres: ${doc.total_chars}*  \n`;
    md += `*Generado: ${new Date(doc.updated_at).toLocaleString('es')}*\n\n`;
    md += `---\n\n`;
    md += `## Índice\n\n`;
    for (let i = 0; i < chapters.length; i++) {
      md += `${i + 1}. [${chapters[i].title}](#cap-${i + 1})\n`;
    }
    md += `\n---\n\n`;
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      md += `\n<a id="cap-${i + 1}"></a>\n\n`;
      md += `# ${i + 1}. ${ch.title}\n\n`;
      md += (ch.body || '(vacío)') + '\n\n---\n';
    }

    if (req.query.download === '1') {
      const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
      res.setHeader('Content-Disposition', `attachment; filename="master_${safeName}_${doc.version_tag}.md"`);
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(md);
  } catch (e) {
    console.error('[exportMasterAsMarkdown] error:', e);
    bad(res, 500, e.message);
  }
}

async function markExportReady(req, res) {
  try {
    const row = await model.markExportReady(req.params.id);
    if (!row) return bad(res, 404, 'export not found');
    ok(res, row);
  } catch (e) { bad(res, 500, e.message); }
}

/* ── Chat ────────────────────────────────────────────────────── */

async function getOrCreateMainThread(req, res) {
  try {
    const projectId = req.params.projectId;
    const phase = req.query.phase || 'perfect';
    const thread = await model.getOrCreateMainThread(projectId, req.user.id, phase);
    ok(res, thread);
  } catch (e) { bad(res, 500, e.message); }
}

async function listMessages(req, res) {
  try {
    const messages = await model.listMessages(req.params.id, {
      limit: parseInt(req.query.limit, 10) || 200,
      before: req.query.before || null,
    });
    ok(res, messages);
  } catch (e) { bad(res, 500, e.message); }
}

async function appendMessage(req, res) {
  try {
    const threadId = req.params.id;
    const msg = req.body || {};
    if (!msg.role || !msg.content) return bad(res, 400, 'role and content are required');
    if (!['user', 'assistant', 'system'].includes(msg.role)) {
      return bad(res, 400, 'invalid role');
    }
    const saved = await model.appendMessage(threadId, msg);
    ok(res, saved);
  } catch (e) { bad(res, 500, e.message); }
}

/* ── Form templates & mapping ────────────────────────────────── */

async function listFormTemplates(req, res) {
  try {
    const templates = await model.listFormTemplates(req.params.callId);
    ok(res, templates);
  } catch (e) { bad(res, 500, e.message); }
}

async function getFormTemplateFull(req, res) {
  try {
    const tpl = await model.getFormTemplate(req.params.id);
    if (!tpl) return bad(res, 404, 'form template not found');
    const questions = await model.listFormQuestions(tpl.id);
    const mapping = await model.listMappingForTemplate(tpl.id);
    ok(res, { ...tpl, questions, mapping });
  } catch (e) { bad(res, 500, e.message); }
}

/* ── CAG document sources (read-only inventory) ──────────────── */

async function listCagDocumentsForProject(req, res) {
  try {
    const docs = await model.listProjectCagDocuments(req.params.projectId);
    const totalChars = docs.reduce((acc, d) => acc + (d.body_text_chars || 0), 0);
    const totalTokens = docs.reduce((acc, d) => acc + (d.tokens_estimated || 0), 0);
    ok(res, { docs, total_chars: totalChars, total_tokens_estimated: totalTokens });
  } catch (e) { bad(res, 500, e.message); }
}

/* ── Diagnoses ───────────────────────────────────────────────── */

async function listDiagnoses(req, res) {
  try {
    const rows = await model.listDiagnoses(req.params.id);
    ok(res, rows);
  } catch (e) { bad(res, 500, e.message); }
}

async function getDiagnosis(req, res) {
  try {
    const diag = await model.getDiagnosisWithItems(req.params.id);
    if (!diag) return bad(res, 404, 'diagnosis not found');
    ok(res, diag);
  } catch (e) { bad(res, 500, e.message); }
}

/**
 * PATCH /v1/master/diagnosis-items/:id
 * Body: { state }
 *   state ∈ open | resolved | dismissed
 *   - resolved → marca como abordado (vía chat o aplicación manual)
 *   - dismissed → marca como descartado por el usuario
 *   - open → reabre el item
 */
async function patchDiagnosisItemState(req, res) {
  try {
    const itemId = req.params.id;
    const { state } = req.body || {};
    if (!['open', 'resolved', 'dismissed'].includes(state)) {
      return bad(res, 400, 'state must be one of: open, resolved, dismissed');
    }
    const userId = req.user.id;
    const resolvedAt = state === 'open' ? null : new Date();
    const resolvedBy = state === 'open' ? null : userId;
    const [result] = await pool.query(
      `UPDATE master_diagnosis_items
         SET state = ?, resolved_at = ?, resolved_by_user_id = ?
       WHERE id = ?`,
      [state, resolvedAt, resolvedBy, itemId]
    );
    if (!result.affectedRows) return bad(res, 404, 'diagnosis_item not found');
    const [[item]] = await pool.query(
      `SELECT * FROM master_diagnosis_items WHERE id = ?`,
      [itemId]
    );
    ok(res, item);
  } catch (e) { bad(res, 500, e.message); }
}

/**
 * POST /v1/master/diagnoses/:id/items
 * Body: { classification?, severity?, title, detail?, suggestion?, anchor_kind?, anchor_id?, anchor_label? }
 * Crea un item personalizado en un diagnosis existente (el usuario quiere
 * abordar algo que el diagnóstico automático no detectó).
 */
async function createCustomDiagnosisItem(req, res) {
  try {
    const diagnosisId = req.params.id;
    const [[diag]] = await pool.query(
      `SELECT id FROM master_diagnoses WHERE id = ?`,
      [diagnosisId]
    );
    if (!diag) return bad(res, 404, 'diagnosis not found');

    const {
      classification = 'narrative',
      severity = 'warning',
      title,
      detail = null,
      suggestion = null,
      anchor_kind = null,
      anchor_id = null,
      anchor_label = null,
    } = req.body || {};

    if (!title || !title.trim()) return bad(res, 400, 'title is required');
    if (!['narrative', 'economic'].includes(classification)) {
      return bad(res, 400, 'classification must be narrative or economic');
    }
    if (!['info', 'warning', 'critical'].includes(severity)) {
      return bad(res, 400, 'severity must be info, warning or critical');
    }

    const [[maxRow]] = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
         FROM master_diagnosis_items WHERE diagnosis_id = ?`,
      [diagnosisId]
    );

    const id = genUUID();
    await pool.query(
      `INSERT INTO master_diagnosis_items
         (id, diagnosis_id, classification, severity, title, detail, suggestion,
          anchor_kind, anchor_id, anchor_label, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, diagnosisId, classification, severity, title.trim(),
       detail, suggestion, anchor_kind, anchor_id, anchor_label, maxRow.next_order]
    );
    const [[item]] = await pool.query(
      `SELECT * FROM master_diagnosis_items WHERE id = ?`,
      [id]
    );
    ok(res, item);
  } catch (e) { bad(res, 500, e.message); }
}

/* ── LLM-powered endpoints (CAG pipeline) ─────────────────────── */

/**
 * Compila la primera versión del Master Document para un proyecto.
 * Idempotente: si ya existe un Master ready, devuelve 409.
 *
 * Inputs (req.body opcional):
 *   - dryRun: si true, devuelve solo estimación de coste sin tirar la llamada
 *   - force: si true, ignora idempotencia y crea otra versión
 */
async function compileMasterV1(req, res) {
  const masterDocId = req.params.id;
  const wantStream = req.query.stream === '1';

  // Helper para SSE
  let sseStarted = false;
  function sseStart() {
    if (sseStarted) return;
    sseStarted = true;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
    res.flushHeaders?.();
  }
  function sseSend(eventType, dataObj) {
    if (!wantStream) return;
    if (!sseStarted) sseStart();
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
  }
  function sseEnd(finalObj, status = 200) {
    if (!wantStream) return false;
    sseSend('done', finalObj);
    res.end();
    return true;
  }
  function sseErrorEnd(message, status = 500) {
    if (!wantStream) return false;
    sseSend('error', { message, status });
    res.end();
    return true;
  }

  try {
    const masterDoc = await model.getMasterDocument(masterDocId);
    if (!masterDoc) {
      if (wantStream) return sseErrorEnd('master_document not found', 404);
      return bad(res, 404, 'master_document not found');
    }

    const projectId = masterDoc.project_id;
    const userId = req.user.id;
    const { dryRun = false, force = false } = req.body || {};

    // Política:
    //   - force=true  → borrar capítulos existentes y compilar todos
    //   - force=false → modo "resume": solo compilar los capítulos faltantes
    //                   (si ya hay 3 capítulos, genera del 4 al 10)
    const existingChapters = await model.listChapters(masterDocId);
    const existingKeys = new Set();
    if (force) {
      for (const ch of existingChapters) await model.deleteChapter(ch.id);
    } else {
      for (const ch of existingChapters) existingKeys.add(ch.chapter_key);
    }

    // Construir el contexto enriquecido del proyecto (sin truncar — ver fix)
    const enrichedContext = await developerModel.buildEnrichedContext(projectId, userId);

    // Resumen ejecutivo del proyecto (lo que el usuario rellena en Step 5 del Intake).
    // Vive en projects.interview_summary + projects.description y es la voz del
    // coordinador sobre el proyecto, no el desglose técnico — debe alimentar
    // SIEMPRE al compile como variable propia, no diluida en enriched_context.
    const [projRows] = await pool.query(
      `SELECT name, acronym, interview_summary, description FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );
    let projectExecutiveSummary = '(no executive summary provided yet)';
    if (projRows.length) {
      const p = projRows[0];
      const parts = [];
      if (p.acronym || p.name) parts.push(`PROJECT: ${p.acronym ? p.acronym + ' — ' : ''}${p.name || ''}`.trim());
      if (p.interview_summary && p.interview_summary.trim()) {
        parts.push(`\nUSER-WRITTEN PROJECT SUMMARY (Intake Step 5):\n${p.interview_summary.trim()}`);
      }
      if (p.description && p.description.trim()) {
        parts.push(`\nADDITIONAL DESCRIPTION:\n${p.description.trim()}`);
      }
      if (parts.length > 1) projectExecutiveSummary = parts.join('\n');
    }

    // Cargar documentos CAG: call docs (programme guide, call PDF…) vinculados a
    // la convocatoria + project docs core subidos por el usuario.
    const cagDocs = await model.loadProjectCagBundle(projectId);
    const cagBundle = cagDocs.length
      ? cagDocs.map(d => {
          const header = d.origin === 'call' ? 'CALL DOCUMENT' : 'PROJECT DOCUMENT';
          const kind = d.source_kind ? ` · ${d.source_kind}` : '';
          return `═════ ${header}: ${d.title}${kind} ═════\n${d.body_text}`;
        }).join('\n\n')
      : '(no call or project documents with extracted text available)';

    // Cargar interviews del Prep Studio
    const [interviewRows] = await pool.query(
      `SELECT question_text, answer_text, tab FROM writer_interviews
       WHERE project_id = ? AND answer_text IS NOT NULL AND LENGTH(answer_text) > 10
       ORDER BY tab, sort_order`,
      [projectId]
    );
    const interviews = interviewRows.map(r =>
      `[${(r.tab || 'general').toUpperCase()}]\nQ: ${r.question_text}\nA: ${r.answer_text}`
    ).join('\n\n');

    // Cargar secciones existentes del Writer cascada (si las hay)
    const [writerRows] = await pool.query(
      `SELECT ws.section_id, ws.body
       FROM writer_sections ws
       JOIN form_instances fi ON fi.id = ws.instance_id
       WHERE fi.project_id = ?
       ORDER BY ws.section_id`,
      [projectId]
    ).catch(() => [[]]);
    const writerDraft = writerRows.map(r => `=== ${r.section_id} ===\n${r.body || ''}`).join('\n\n');

    // Contexto de calidad: criterios de evaluación FULL (con intent/elements/
    // example_strong/avoid + general_context + writing_guidance + connects)
    // y reglas transversales de la convocatoria (writing_style,
    // additional_rules, ai_detection_rules).
    const qCtx = await model.loadProjectQualityContext(projectId);

    const vars = {
      call_code: qCtx.callCode || '',
      criteria: qCtx.criteriaFullText,
      call_writing_style: qCtx.transversal.writing_style || '(no specific writing style defined for this call)',
      call_additional_rules: qCtx.transversal.additional_rules || '(no additional rules)',
      call_ai_detection_rules: qCtx.transversal.ai_detection_rules || '(no specific anti-AI-detection rules)',
      call_documents: cagBundle,
      project_executive_summary: projectExecutiveSummary,
      enriched_context: enrichedContext,
      writer_draft: writerDraft || '(no writer draft yet)',
      interviews: interviews || '(no interviews yet)',
    };

    // Dry-run: devolver previsión sin tirar la llamada
    if (dryRun) {
      const preview = cag.dryRun('01_compile_master_v1', vars, { maxTokens: 60000 });
      return ok(res, { dryRun: true, ...preview });
    }

    // Marcar como compiling
    await model.updateMasterDocument(masterDocId, { status: 'compiling' });

    // Iniciar SSE si el cliente lo pidió
    if (wantStream) {
      sseStart();
      sseSend('status', { phase: 'started', message: 'Cargado el contexto, contactando con el modelo...' });
    }

    // Plan de capítulos del Master — estructura literal del formulario
    // EACEA "ERASMUS BB and LS Type II" (universal para calls gestionadas
    // por EACEA). 17 capítulos fijos + 1 capítulo por cada WP del proyecto.
    // Cada capítulo es PROSA — sin tablas (las tablas las arma el exporter
    // desde Calculator/Intake).
    const [wpRows] = await pool.query(
      `SELECT id, code, title, order_index FROM work_packages
       WHERE project_id = ? ORDER BY order_index, code`,
      [projectId]
    );

    // Pre-cargar tasks/milestones/deliverables por WP para inyectar el
    // listado COMPLETO al capítulo de ese WP (no diluido en enriched_context).
    async function getWpItemsBlock(wpId, wpCode, wpTitle) {
      const [tasks] = await pool.query(
        `SELECT t.id, t.title, t.description, t.is_subcontracted,
                GROUP_CONCAT(DISTINCT CONCAT(pa.name, ' [', wtp.role, ']') SEPARATOR ' · ') AS participants
           FROM wp_tasks t
           LEFT JOIN wp_task_participants wtp ON wtp.task_id = t.id
           LEFT JOIN partners pa ON pa.id = wtp.partner_id
          WHERE t.work_package_id = ?
          GROUP BY t.id
          ORDER BY t.sort_order, t.created_at`,
        [wpId]
      ).catch(() => [[]]);
      const [miles] = await pool.query(
        `SELECT title, description, due_month, means_of_verification
           FROM milestones WHERE work_package_id = ?
           ORDER BY due_month, sort_order`,
        [wpId]
      ).catch(() => [[]]);
      const [delivs] = await pool.query(
        `SELECT code, title, description, type, dissemination_level, due_month, format
           FROM deliverables WHERE work_package_id = ?
           ORDER BY due_month, sort_order`,
        [wpId]
      ).catch(() => [[]]);

      const parts = [`### EXPLICIT ITEMS OF ${wpCode} ${wpTitle} — develop one narrative paragraph for each`];
      parts.push(`\n#### TASKS (${tasks.length}) — Activities and division of work`);
      if (!tasks.length) parts.push('(none defined yet — flag as NEEDS ENRICHMENT)');
      tasks.forEach((t, i) => {
        parts.push(`\nTASK ${i+1}: ${t.title || '(no title)'}`);
        if (t.description) parts.push(`  Description: ${t.description}`);
        if (t.participants) parts.push(`  Participants: ${t.participants}`);
        if (t.is_subcontracted) parts.push(`  ⚠️ Subcontracted — justify why and how Best-Value-for-Money is ensured`);
      });

      parts.push(`\n#### MILESTONES (${miles.length})`);
      if (!miles.length) parts.push('(none defined yet — flag as NEEDS ENRICHMENT)');
      miles.forEach((m, i) => {
        parts.push(`\nMILESTONE ${i+1}: ${m.title || '(no title)'}`);
        if (m.due_month) parts.push(`  Due: M${m.due_month}`);
        if (m.description) parts.push(`  Description: ${m.description}`);
        if (m.means_of_verification) parts.push(`  Means of verification: ${m.means_of_verification}`);
      });

      parts.push(`\n#### DELIVERABLES (${delivs.length})`);
      if (!delivs.length) parts.push('(none defined yet — flag as NEEDS ENRICHMENT)');
      delivs.forEach((d, i) => {
        parts.push(`\nDELIVERABLE ${i+1}${d.code ? ' ['+d.code+']' : ''}: ${d.title || '(no title)'}`);
        if (d.type) parts.push(`  Type: ${d.type}`);
        if (d.dissemination_level) parts.push(`  Dissemination: ${d.dissemination_level}`);
        if (d.due_month) parts.push(`  Due: M${d.due_month}`);
        if (d.format) parts.push(`  Format: ${d.format}`);
        if (d.description) parts.push(`  Description: ${d.description}`);
      });
      return parts.join('\n');
    }

    // CHAPTER_PLAN con target_words por capítulo (suman ~120 págs · ~250 words/pág)
    // y section_code para mapear con qCtx.criteriaIndex.
    const wpsPerWpWords = Math.max(2500, Math.round(4500 / Math.max(1, wpRows.length)) * 1.5); // ~12-18 págs/WP

    const CHAPTER_PLAN = [
      { key: 'ch_summary', type: 'summary', section_code: 'PS', target_words: 600,
        title: 'Project Summary — Resumen ejecutivo ampliado',
        focus: 'Extended executive overview: acronym, full title, what the project does, why it matters now, target groups, expected change, consortium spine, expected impact. Self-contained 2-page brief that an evaluator can read in 5 min and grasp the proposal.' },

      // 1. RELEVANCE — total ~12-15 págs (3.500 words split)
      { key: 'ch_1_1_background', type: 'relevance', section_code: '1.1', target_words: 1200,
        title: '1.1 — Contexto y objetivos generales',
        focus: 'Background and rationale of the project. How it is relevant to the SCOPE of the call. How it addresses the GENERAL OBJECTIVES of the call. Project contribution to the call PRIORITIES (if applicable).' },
      { key: 'ch_1_2_needs', type: 'relevance', section_code: '1.2', target_words: 1400,
        title: '1.2 — Análisis de necesidades y objetivos específicos',
        focus: 'Sound needs analysis aligned with the specific objectives of the call. What issue/challenge/gap the project addresses. Each project-specific objective stated CLEARLY, MEASURABLE, REALISTIC and ACHIEVABLE within the duration; for each one, the indicators of achievement (unit of measurement, baseline, target).' },
      { key: 'ch_1_3_complementarity', type: 'relevance', section_code: '1.3', target_words: 1100,
        title: '1.3 — Complementariedad, innovación y valor añadido europeo',
        focus: 'How the project builds on results of past activities in the field; innovative aspects (if any). Complementarity with activities by other organisations. Trans-national dimension; impact across the EU; potential to use results in other countries; cross-border cooperation among Programme and Partner countries.' },

      // 2.1 QUALITY — total ~22-25 págs
      { key: 'ch_2_1_1_concept', type: 'quality', section_code: '2.1.1', target_words: 1400,
        title: '2.1.1 — Concepto y metodología',
        focus: 'Approach and methodology behind the project. Why they are the most suitable for achieving the objectives. Theory of change, design principles, methodological choices, conceptual articulation across WPs.' },
      { key: 'ch_2_1_2_management', type: 'quality', section_code: '2.1.2', target_words: 1300,
        title: '2.1.2 — Gestión del proyecto, aseguramiento de calidad, seguimiento y evaluación',
        focus: 'Measures to ensure high-quality, on-time implementation. Quality control, monitoring, planning. Evaluation methods and indicators (quantitative+qualitative) — unit of measurement, baseline, target.' },
      { key: 'ch_2_1_3_staff', type: 'quality', section_code: '2.1.3', target_words: 1500,
        title: '2.1.3 — Equipos, personal y expertos del proyecto',
        focus: 'Describe project teams and how they work together. List ALL key staff (budget category A) by function/profile — ONE NARRATIVE PARAGRAPH PER PERSON: name and function, organisation, role/tasks in this project, professional profile and expertise. NO TABLES. Close with a paragraph on team complementarity.' },
      { key: 'ch_2_1_4_cost_effectiveness', type: 'quality', section_code: '2.1.4', target_words: 700,
        title: '2.1.4 — Coste-eficacia y gestión financiera',
        focus: 'Measures to ensure most cost-effective achievement. Financial management arrangements. Do NOT include numbers; explain qualitatively why the budget is cost-effective.' },
      { key: 'ch_2_1_5_risk', type: 'quality', section_code: '2.1.5', target_words: 1400,
        title: '2.1.5 — Gestión de riesgos',
        focus: 'Critical risks. ONE PARAGRAPH PER RISK: description, WP affected, impact (H/M/L), likelihood (H/M/L) post-mitigation, mitigation measures, contingency. NO TABLES.' },

      // 2.2 QUALITY — total ~8-12 págs
      { key: 'ch_2_2_1_consortium_setup', type: 'consortium', section_code: '2.2.1', target_words: 1500,
        title: '2.2.1 — Configuración del consorcio',
        focus: 'Participants and how they work together. For each partner: a narrative paragraph with role, expertise contributed, complementarity, valid role and adequate resources. NO TABLES. Close with a paragraph on the consortium as a whole.' },
      { key: 'ch_2_2_2_consortium_management', type: 'consortium', section_code: '2.2.2', target_words: 1000,
        title: '2.2.2 — Gestión del consorcio y toma de decisiones',
        focus: 'Management structures and decision-making. How decisions are taken; communication (frequency, format); planning and control methods.' },

      // 3. IMPACT — total ~14-18 págs
      { key: 'ch_3_1_impact', type: 'impact', section_code: '3.1', target_words: 1600,
        title: '3.1 — Impacto y ambición',
        focus: 'Expected SHORT-, MEDIUM-, LONG-term effects. Target groups (concrete) and HOW they benefit. What changes for them. Quantitative KPIs where possible. Tie back to objectives stated in 1.2.' },
      { key: 'ch_3_2_dissemination', type: 'impact', section_code: '3.2', target_words: 1300,
        title: '3.2 — Comunicación, diseminación y visibilidad',
        focus: 'Communication/dissemination to maximise impact: to whom, format, volume, channels and why. Reaching target groups, stakeholders, policymakers, general public. EU funding visibility plan.' },
      { key: 'ch_3_3_sustainability', type: 'impact', section_code: '3.3', target_words: 1300,
        title: '3.3 — Sostenibilidad y continuación',
        focus: 'Follow-up after EU funding ends. How impact is sustained. What needs to be done, by whom, with what resources. Continuation plan. Synergies with other (EU-funded) activities building on results.' },

      // 4. WORK PLAN
      { key: 'ch_4_1_workplan', type: 'workplan', section_code: '4.1', target_words: 600,
        title: '4.1 — Plan de trabajo (visión general)',
        focus: 'Overall structure of the work plan: list of WPs at a glance, interdependencies, project rhythm (kick-off, mid-term, final), articulation with objectives. PROSE, no Gantt.' },

      // 4.2 — Work Packages (dynamic, one chapter per WP, ~12-18 págs each)
      ...wpRows.map(wp => ({
        key: `ch_4_2_wp_${(wp.code || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_') || wp.id.slice(0, 6)}`,
        type: 'wp',
        section_code: '4.2',
        target_words: Math.round(wpsPerWpWords),
        title: `4.2 — ${wp.code || ''} ${wp.title}`,
        focus: `Develop Work Package "${wp.code} ${wp.title}" in full narrative form. Cover: WP objectives, lead beneficiary and rationale, duration, articulation with other WPs. Then THREE NARRATIVE SUBSECTIONS — Activities, Milestones, Deliverables — with ONE PARAGRAPH PER ITEM listed in the EXPLICIT ITEMS block below. Do NOT skip any item. No tables — use ## Activities, ## Milestones, ## Deliverables as light headings.`,
        ref_entity_type: 'work_package',
        ref_entity_id: wp.id,
        _wpData: { id: wp.id, code: wp.code, title: wp.title },
      })),

      // 5. OTHER
      { key: 'ch_5_1_ethics', type: 'other', section_code: '5.1', target_words: 500,
        title: '5.1 — Ética',
        focus: 'Ethics issues during implementation and measures. Gender mainstreaming. Children\'s rights if applicable. Data protection. Inclusion. If none apply, say so explicitly.' },
      { key: 'ch_5_2_security', type: 'other', section_code: '5.2', target_words: 300,
        title: '5.2 — Seguridad',
        focus: 'Security issues if applicable (sensitive data, critical infrastructure, dual-use). Most civil projects answer "Not applicable".' },
    ];

    // Pre-cargar items por cada WP (paralelo)
    const wpItemsBlocks = {};
    for (const ch of CHAPTER_PLAN) {
      if (ch.type === 'wp' && ch._wpData) {
        wpItemsBlocks[ch.key] = await getWpItemsBlock(ch._wpData.id, ch._wpData.code, ch._wpData.title);
      }
    }

    if (wantStream) {
      sseSend('plan', { total: CHAPTER_PLAN.length, chapters: CHAPTER_PLAN.map(c => ({ key: c.key, title: c.title })) });
    }

    let lastSseAt = 0;
    let pendingChunkText = '';
    function flushPendingChunk(chapterKey) {
      if (pendingChunkText && wantStream) {
        sseSend('chunk', { text: pendingChunkText, chapter_key: chapterKey });
        pendingChunkText = '';
        lastSseAt = Date.now();
      }
    }

    const fs = require('fs');
    const path = require('path');
    const tmpDir = path.join(__dirname, '..', '..', '..', '..', 'tmp');
    const sessionTag = Date.now();

    let totalChars = 0;
    let totalCostUsd = 0;
    let totalDurationMs = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const createdChapters = [];
    const previousSummaries = []; // para alimentar al siguiente capítulo

    // Si estamos en modo resume, los capítulos ya existentes alimentan
    // previousSummaries para que los nuevos sean coherentes con ellos.
    if (!force && existingChapters.length > 0) {
      for (const ex of existingChapters) {
        previousSummaries.push({ title: ex.title || '', body: ex.body || '' });
        createdChapters.push({ key: ex.chapter_key, title: ex.title, char_count: ex.char_count || 0 });
        totalChars += ex.char_count || 0;
      }
      if (wantStream) {
        for (const ex of existingChapters) {
          sseSend('chapter_already_exists', { chapter_key: ex.chapter_key, title: ex.title, char_count: ex.char_count || 0 });
        }
      }
    }

    for (let i = 0; i < CHAPTER_PLAN.length; i++) {
      const ch = CHAPTER_PLAN[i];

      // Skip si ya existe (modo resume)
      if (existingKeys.has(ch.key)) {
        continue;
      }

      if (wantStream) {
        sseSend('chapter_started', { index: i, total: CHAPTER_PLAN.length, chapter_key: ch.key, title: ch.title });
      }

      // Resumen de capítulos previos (solo títulos + primeras 200 chars de body)
      const previousSummary = previousSummaries.length
        ? previousSummaries.map((p, j) => `[${j + 1}] ${p.title}\n${(p.body || '').substring(0, 200)}...`).join('\n\n')
        : '(none yet — this is the first chapter)';

      // Bloque específico de la subsección (criterios + guidance + connects)
      const sectionBlock = (ch.section_code && qCtx.criteriaIndex[ch.section_code])
        ? qCtx.criteriaIndex[ch.section_code].block
        : '(no specific criteria block loaded for this section)';

      // Para capítulos de WP, lista explícita de tasks/milestones/deliverables
      const wpItems = wpItemsBlocks[ch.key] || '';

      const chapterVars = {
        ...vars,
        chapter_key: ch.key,
        chapter_type: ch.type,
        chapter_title: ch.title,
        chapter_focus: ch.focus,
        section_specific_block: sectionBlock,
        wp_explicit_items: wpItems,
        target_words: String(ch.target_words || 1000),
        previous_chapters_summary: previousSummary,
      };

      try {
        const result = await cag.runPrompt('01b_compile_single_chapter', chapterVars, {
          maxTokens: 6000,
          temperature: 0.4,
          ctx: { projectId, userId },
          endpoint: `/v1/master/documents/:id/compile-v1#${ch.key}`,
          onText: wantStream
            ? (delta) => {
                pendingChunkText += delta;
                const now = Date.now();
                if (now - lastSseAt >= 50) flushPendingChunk(ch.key);
              }
            : undefined,
        });
        flushPendingChunk(ch.key);

        // Persistir raw del capítulo SIEMPRE
        try {
          fs.writeFileSync(path.join(tmpDir, `master_chapter_${masterDocId}_${ch.key}_${sessionTag}.txt`), result.text || '', 'utf8');
        } catch (_) {}

        // Parse del capítulo: tolerante a 3 shapes posibles del LLM:
        //   A) { chapter_key, chapter_type, title, body, ... } ← shape esperada
        //   B) { chapters: [{...A}] } ← LLM se confunde y mete en array
        //   C) [{...A}] ← LLM devuelve array directo
        let parsedCh = result.parsed;
        if (parsedCh && Array.isArray(parsedCh)) parsedCh = parsedCh[0];
        else if (parsedCh && Array.isArray(parsedCh.chapters) && parsedCh.chapters.length) {
          parsedCh = parsedCh.chapters[0];
        }
        if (!parsedCh || typeof parsedCh !== 'object' || !parsedCh.body) {
          throw new Error(`Chapter ${ch.key}: parse fail or empty body`);
        }

        // El plan usa tipos descriptivos (relevance, quality, consortium,
        // workplan, other) que no caben en el ENUM de la BD. Mapeamos al
        // enum existente (summary/wp/partner/impact/budget/qa/custom) sin
        // perder la pista (el chapter_key conserva la jerarquía EACEA).
        const TYPE_MAP = {
          summary: 'summary',
          relevance: 'qa',
          quality: 'qa',
          workplan: 'qa',
          consortium: 'partner',
          impact: 'impact',
          wp: 'wp',
          other: 'custom',
        };
        const dbChapterType = TYPE_MAP[ch.type] || 'custom';

        const savedCh = await model.createChapter({
          masterDocId,
          chapterKey: parsedCh.chapter_key || ch.key,
          chapterType: dbChapterType,
          title: parsedCh.title || ch.title,
          body: parsedCh.body || '',
          sortOrder: i,
          refEntityType: ch.ref_entity_type || null,
          refEntityId: ch.ref_entity_id || null,
        });

        const len = (parsedCh.body || '').length;
        totalChars += len;
        totalCostUsd += result.costUsd || 0;
        totalDurationMs += result.durationMs || 0;
        const inT = (result.usage?.input_tokens || 0) + (result.usage?.cache_creation_input_tokens || 0) + (result.usage?.cache_read_input_tokens || 0);
        const outT = result.usage?.output_tokens || 0;
        totalInputTokens += inT;
        totalOutputTokens += outT;

        previousSummaries.push({ title: parsedCh.title || ch.title, body: parsedCh.body || '' });
        createdChapters.push({ key: ch.key, title: parsedCh.title || ch.title, char_count: len });

        if (wantStream) {
          sseSend('chapter_done', {
            index: i, total: CHAPTER_PLAN.length,
            chapter_key: ch.key, title: parsedCh.title || ch.title,
            char_count: len, cost_usd: result.costUsd, duration_ms: result.durationMs,
            cache_read_tokens: result.usage?.cache_read_input_tokens || 0,
          });
        }
      } catch (chapErr) {
        console.error(`[compileMasterV1] chapter ${ch.key} failed:`, chapErr.message);
        if (wantStream) {
          sseSend('chapter_failed', { index: i, chapter_key: ch.key, error: chapErr.message });
        }
        // Seguimos al siguiente capítulo — los anteriores ya están persistidos.
      }
    }

    await model.updateMasterDocument(masterDocId, {
      status: createdChapters.length > 0 ? 'ready' : 'draft',
      total_chars: totalChars,
    });

    const summary = {
      master_doc_id: masterDocId,
      chapters_created: createdChapters.length,
      chapters_failed: CHAPTER_PLAN.length - createdChapters.length,
      total_chars: totalChars,
      cost_usd: totalCostUsd,
      duration_ms: totalDurationMs,
      usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
    };

    if (wantStream) return sseEnd(summary);
    ok(res, summary);
  } catch (e) {
    console.error('[compileMasterV1] error:', e);
    try { await model.updateMasterDocument(masterDocId, { status: 'draft' }); } catch (_) {}
    if (wantStream) return sseErrorEnd(e.message, e.status || 500);
    bad(res, e.status || 500, e.message);
  }
}

/**
 * Diagnóstico inicial sobre el Master v1. Detecta huecos y contradicciones,
 * clasificadas en narrative vs economic.
 */
async function runDiagnosis(req, res) {
  const masterDocId = req.params.id;
  try {
    const masterDoc = await model.getMasterDocument(masterDocId);
    if (!masterDoc) return bad(res, 404, 'master_document not found');

    const projectId = masterDoc.project_id;
    const userId = req.user.id;
    const { kind = 'initial', dryRun = false } = req.body || {};

    if (!['initial', 'advanced'].includes(kind)) {
      return bad(res, 400, 'kind must be "initial" or "advanced"');
    }

    const chapters = await model.listChapters(masterDocId);
    if (chapters.length === 0) {
      return bad(res, 409, 'Master document has no chapters yet. Compile first.');
    }

    // Caps agresivos: el diagnóstico debe caber en 200k tokens junto con
    // los criterios oficiales (~15k tokens). Reservamos ~50k tokens para
    // master_document (lo que se diagnostica), 30k para CAG bundle (call
    // docs + project docs) y 25k para el design snapshot.
    const TOKEN = 4; // ~4 chars / token (estimación conservadora)
    const MASTER_CAP_CHARS    = 50_000 * TOKEN; // 200k chars
    const CAG_CAP_CHARS       = 30_000 * TOKEN; // 120k chars
    const DESIGN_CAP_CHARS    = 25_000 * TOKEN; // 100k chars

    function trimWithNote(text, maxChars, label) {
      if (!text) return text || '';
      if (text.length <= maxChars) return text;
      return text.slice(0, maxChars) + `\n\n[…${label} truncado: ${text.length - maxChars} chars omitidos para encajar en la ventana del modelo…]`;
    }

    const masterTextFull = chapters
      .map(c => `## ${c.title}\n\n${c.body || ''}`)
      .join('\n\n---\n\n');
    const masterText = trimWithNote(masterTextFull, MASTER_CAP_CHARS, 'Master document');

    // Design snapshot conciso para cross-checks
    const designSnapshotFull = await developerModel.buildEnrichedContext(projectId, userId);
    const designSnapshot = trimWithNote(designSnapshotFull, DESIGN_CAP_CHARS, 'Design snapshot');

    // Contexto de calidad: criterios FULL + reglas transversales de la call
    const qCtx = await model.loadProjectQualityContext(projectId);

    // Cargar bundle CAG (call docs + project docs core), con cap propio
    const cagDocs = await model.loadProjectCagBundle(projectId, { maxChars: CAG_CAP_CHARS });
    const cagBundle = cagDocs.length
      ? cagDocs.map(d => {
          const header = d.origin === 'call' ? 'CALL DOCUMENT' : 'PROJECT DOCUMENT';
          const kind = d.source_kind ? ` · ${d.source_kind}` : '';
          return `═════ ${header}: ${d.title}${kind} ═════\n${d.body_text}`;
        }).join('\n\n')
      : '(no call or project documents with extracted text available)';

    const vars = {
      call_code: qCtx.callCode || '',
      criteria: qCtx.criteriaFullText,
      call_documents: cagBundle,
      master_document: masterText,
      design_snapshot: designSnapshot,
    };

    const promptKey = kind === 'initial' ? '02_diagnosis_initial' : '04_diagnosis_advanced';

    if (dryRun) {
      const preview = cag.dryRun(promptKey, vars, { maxTokens: 12000 });
      return ok(res, { dryRun: true, ...preview });
    }

    // Crear registro de diagnosis con status running
    const genUUID = require('../../utils/uuid');
    const diagnosisId = genUUID();
    await pool.query(
      `INSERT INTO master_diagnoses (id, master_doc_id, project_id, diagnosis_kind, status)
       VALUES (?, ?, ?, ?, 'running')`,
      [diagnosisId, masterDocId, projectId, kind === 'initial' ? 'initial' : 'advanced']
    );

    try {
      const result = await cag.runPrompt(promptKey, vars, {
        maxTokens: 12000,
        temperature: 0.3,
        ctx: { projectId, userId },
        endpoint: `/v1/master/documents/:id/diagnose:${kind}`,
      });

      if (!result.parsed) {
        await pool.query(
          `UPDATE master_diagnoses SET status='failed', finished_at=NOW() WHERE id=?`,
          [diagnosisId]
        );
        return bad(res, 502, `LLM output not parseable. Raw: ${result.text.substring(0, 500)}`);
      }

      // Tolerancia de shape para el output del diagnóstico:
      //   A) { items: [...] }                         ← shape esperada
      //   B) { narrative: [...], economic: [...] }    ← LLM agrupa por classification
      //   C) [...]                                    ← LLM devuelve solo array
      let items = [];
      if (Array.isArray(result.parsed.items)) {
        items = result.parsed.items;
      } else if (Array.isArray(result.parsed.narrative) || Array.isArray(result.parsed.economic)) {
        items = [
          ...(result.parsed.narrative || []).map(x => ({ ...x, classification: 'narrative' })),
          ...(result.parsed.economic || []).map(x => ({ ...x, classification: 'economic' })),
        ];
      } else if (Array.isArray(result.parsed)) {
        items = result.parsed;
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await pool.query(
          `INSERT INTO master_diagnosis_items
             (id, diagnosis_id, classification, severity, title, detail, suggestion,
              anchor_kind, anchor_id, anchor_label, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [genUUID(), diagnosisId,
           it.classification || 'narrative',
           it.severity || 'warning',
           it.title || 'Sin título',
           it.detail || null,
           it.suggestion || null,
           it.anchor_kind || null,
           it.anchor_id || null,
           it.anchor_label || null,
           i]
        );
      }

      await pool.query(
        `UPDATE master_diagnoses
         SET status='ready',
             summary=?,
             llm_model=?,
             llm_input_tokens=?,
             llm_output_tokens=?,
             finished_at=NOW()
         WHERE id=?`,
        [
          result.parsed.summary || null,
          result.model,
          (result.usage?.input_tokens || 0) + (result.usage?.cache_creation_input_tokens || 0) + (result.usage?.cache_read_input_tokens || 0),
          result.usage?.output_tokens || 0,
          diagnosisId,
        ]
      );

      const full = await model.getDiagnosisWithItems(diagnosisId);
      ok(res, { ...full, cost_usd: result.costUsd, duration_ms: result.durationMs });
    } catch (e) {
      await pool.query(
        `UPDATE master_diagnoses SET status='failed', finished_at=NOW() WHERE id=?`,
        [diagnosisId]
      ).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error('[runDiagnosis] error:', e);
    bad(res, e.status || 500, e.message);
  }
}

/* ── Refine chapter (chat-based, Paso 9) ────────────────────────
   POST /v1/master/chapters/:id/refine
   Body: { message, mode? = 'free' | 'validate' | 'rewrite' }
   - 'free':     el usuario escribe libre, el LLM responde + opcional proposed_edit
   - 'validate': fuerza al LLM a validar el capítulo contra criterios y listar gaps
   - 'apply':    body { new_body } → guarda el nuevo body en master_chapters
*/
async function refineChapter(req, res) {
  try {
    const chapterId = req.params.id;
    const userId = req.user.id;
    const { message, mode = 'free', new_body = null, apply = false } = req.body || {};

    const chapter = await model.getChapter(chapterId);
    if (!chapter) return bad(res, 404, 'Chapter not found');

    // Apply directo: persistimos new_body en el chapter y registramos el evento.
    if (apply && new_body) {
      await model.updateChapter(chapterId, { body: new_body }, { actor: 'ai' });
      return ok(res, { applied: true, char_count: new_body.length });
    }

    if (!message || typeof message !== 'string') {
      return bad(res, 400, 'message is required');
    }

    const masterDoc = await model.getMasterDocument(chapter.master_doc_id);
    if (!masterDoc) return bad(res, 404, 'Master document not found');
    const projectId = masterDoc.project_id;

    const qCtx = await model.loadProjectQualityContext(projectId);
    const designSnapshot = await developerModel.buildEnrichedContext(projectId, userId);
    const cagDocs = await model.loadProjectCagBundle(projectId);
    const cagBundle = cagDocs.length
      ? cagDocs.map(d => `═════ ${d.origin === 'call' ? 'CALL DOC' : 'PROJECT DOC'}: ${d.title} ═════\n${d.body_text}`).join('\n\n')
      : '(no docs)';

    // Bloque de criterios específico de la subsección del capítulo
    const sectionCode = extractSectionCodeFromKey(chapter.chapter_key);
    const sectionBlock = sectionCode && qCtx.criteriaIndex[sectionCode]
      ? qCtx.criteriaIndex[sectionCode].block
      : '(no specific criteria for this section)';

    // Otros capítulos del Master (para coherencia)
    const allChapters = await model.listChapters(chapter.master_doc_id);
    const otherChaptersSummary = allChapters
      .filter(c => c.id !== chapterId)
      .map(c => `### ${c.title}\n${(c.body || '').substring(0, 1200)}${(c.body || '').length > 1200 ? '... [truncated]' : ''}`)
      .join('\n\n---\n\n');

    // Historial de mensajes anteriores del chat para este capítulo
    const [threads] = await pool.query(
      `SELECT id FROM chat_threads WHERE project_id = ? AND phase = 'perfect' AND is_archived = 0 ORDER BY created_at LIMIT 1`,
      [projectId]
    );
    let threadId = threads[0]?.id;
    if (!threadId) {
      const genUUID = require('../../utils/uuid');
      threadId = genUUID();
      await pool.query(
        `INSERT INTO chat_threads (id, project_id, user_id, phase) VALUES (?, ?, ?, 'perfect')`,
        [threadId, projectId, userId]
      );
    }
    const [history] = await pool.query(
      `SELECT role, content, anchor_id, anchor_label FROM chat_messages
       WHERE thread_id = ? AND (anchor_id = ? OR anchor_id IS NULL)
       ORDER BY created_at ASC LIMIT 20`,
      [threadId, chapterId]
    );

    // Prompt user effective según mode
    let effectiveMessage = message;
    if (mode === 'validate') {
      effectiveMessage = `Por favor valida este capítulo contra los criterios oficiales de evaluación de su subsección (los recibes arriba). Para cada criterio, responde con TRES bullets: (1) ¿lo cumple este capítulo?, (2) qué gaps detectas, (3) propuesta concreta de mejora citando texto exacto a añadir/cambiar. Sé exhaustivo y rigurioso. Si encuentras mejoras mayores, emite también el bloque proposed_edit con la versión revisada COMPLETA del capítulo.`;
    } else if (mode === 'rewrite') {
      effectiveMessage = `Reescribe el capítulo completo siguiendo esta instrucción: "${message}". Mantén todos los hechos concretos del original. Devuelve el proposed_edit con la nueva versión completa.`;
    }

    // Construir vars para el prompt 08
    const vars = {
      call_code: qCtx.callCode || '',
      criteria: qCtx.criteriaFullText,
      call_writing_style: qCtx.transversal.writing_style || '',
      call_additional_rules: qCtx.transversal.additional_rules || '',
      call_ai_detection_rules: qCtx.transversal.ai_detection_rules || '',
      call_documents: cagBundle,
      enriched_context: designSnapshot,
      current_chapter_title: chapter.title,
      current_chapter_key: chapter.chapter_key,
      current_chapter_body: chapter.body || '',
      section_specific_block: sectionBlock,
      other_chapters_summary: otherChaptersSummary || '(no other chapters yet)',
      chat_history: history.map(h => `[${h.role}] ${h.content}`).join('\n\n') || '(start of conversation)',
      anchor_kind: 'chapter',
      anchor_label: chapter.title,
      anchor_id: chapterId,
      user_message: effectiveMessage,
    };

    // Persistir mensaje del usuario
    const genUUID2 = require('../../utils/uuid');
    await pool.query(
      `INSERT INTO chat_messages (id, thread_id, role, content, anchor_kind, anchor_id, anchor_label) VALUES (?, ?, 'user', ?, 'chapter', ?, ?)`,
      [genUUID2(), threadId, message, chapterId, chapter.title]
    );

    // Llamar al LLM
    const result = await cag.runPrompt('08_chat_refinement', vars, {
      maxTokens: 6000,
      temperature: 0.5,
      ctx: { projectId, userId },
      endpoint: `/v1/master/chapters/:id/refine`,
    });

    const replyText = result.text || '';

    // Parse opcional de proposed_edit
    let proposedEdit = null;
    const editMatch = replyText.match(/```(?:json )?proposed_edit\s*([\s\S]*?)```/);
    if (editMatch) {
      try { proposedEdit = JSON.parse(editMatch[1].trim()); } catch (_) { /* ignore parse fail */ }
    }

    // Persistir mensaje del assistant
    const assistantMsgId = genUUID2();
    await pool.query(
      `INSERT INTO chat_messages (id, thread_id, role, content, anchor_kind, anchor_id, anchor_label, llm_model, llm_input_tokens, llm_output_tokens, llm_cached_tokens) VALUES (?, ?, 'assistant', ?, 'chapter', ?, ?, ?, ?, ?, ?)`,
      [
        assistantMsgId, threadId, replyText, chapterId, chapter.title,
        result.model,
        (result.usage?.input_tokens || 0) + (result.usage?.cache_creation_input_tokens || 0),
        result.usage?.output_tokens || 0,
        result.usage?.cache_read_input_tokens || 0,
      ]
    );

    ok(res, {
      message_id: assistantMsgId,
      reply: replyText,
      proposed_edit: proposedEdit,
      thread_id: threadId,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
    });
  } catch (e) {
    console.error('[refineChapter] error:', e);
    bad(res, 500, e.message || String(e));
  }
}

/**
 * POST /v1/master/chapters/:id/propose-rewrite
 * Body: { instruction, attempt? }
 * Devuelve { rationale, new_body, cost_usd, duration_ms } — sin chat.
 * Prompt 10_propose_rewrite garantiza JSON limpio.
 */
async function proposeRewrite(req, res) {
  try {
    const chapterId = req.params.id;
    const userId = req.user.id;
    const { instruction, attempt = 1 } = req.body || {};
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return bad(res, 400, 'instruction is required');
    }

    const chapter = await model.getChapter(chapterId);
    if (!chapter) return bad(res, 404, 'Chapter not found');

    const masterDoc = await model.getMasterDocument(chapter.master_doc_id);
    if (!masterDoc) return bad(res, 404, 'Master document not found');
    const projectId = masterDoc.project_id;

    const qCtx = await model.loadProjectQualityContext(projectId);
    const sectionCode = extractSectionCodeFromKey(chapter.chapter_key);
    const sectionBlock = sectionCode && qCtx.criteriaIndex[sectionCode]
      ? qCtx.criteriaIndex[sectionCode].block
      : '(no specific criteria for this section)';

    const attemptNote = attempt > 1
      ? `=== NOTE: VARIANT #${attempt} ===\nThis is variant number ${attempt}. Generate a DISTINCT alternative from any previous output: different angle, structure, emphasis or rhetorical strategy.`
      : '';

    // Cap del chapter body para mantener latencia razonable (~50k chars máx)
    const chapterBody = chapter.body || '';
    const cappedBody = chapterBody.length > 200000
      ? chapterBody.slice(0, 200000) + '\n\n[…truncado…]'
      : chapterBody;

    const vars = {
      section_specific_block: sectionBlock,
      call_writing_style: qCtx.transversal.writing_style || '(no specific style)',
      chapter_title: chapter.title || '',
      chapter_body: cappedBody,
      instruction: instruction.trim(),
      attempt_note: attemptNote,
    };

    const result = await cag.runPrompt('10_propose_rewrite', vars, {
      maxTokens: 8000,
      temperature: 0.55,
      ctx: { projectId, userId },
      endpoint: '/v1/master/chapters/:id/propose-rewrite',
    });

    // Intentar parse del JSON estructurado
    let rationale = '';
    let new_body = '';
    if (result.parsed && typeof result.parsed === 'object' && !Array.isArray(result.parsed)) {
      rationale = result.parsed.rationale || '';
      new_body = result.parsed.new_body || '';
    }

    // Fallback: si parse falla, intentar regex sobre el texto crudo
    if (!new_body && result.text) {
      const raw = result.text.trim();
      // Caso A: JSON con bloque ```json envolvente
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      const candidate = fenced ? fenced[1] : raw;
      try {
        const obj = JSON.parse(candidate);
        if (obj && typeof obj === 'object') {
          rationale = obj.rationale || rationale;
          new_body = obj.new_body || new_body;
        }
      } catch (_) {
        // Caso B: extraer new_body con regex tolerante
        const bodyMatch = candidate.match(/"new_body"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (bodyMatch) {
          try { new_body = JSON.parse('"' + bodyMatch[1] + '"'); }
          catch (_) { new_body = bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
        }
        const ratMatch = candidate.match(/"rationale"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (ratMatch && !rationale) {
          try { rationale = JSON.parse('"' + ratMatch[1] + '"'); }
          catch (_) { rationale = ratMatch[1]; }
        }
      }
    }

    if (!new_body || new_body.length < 100) {
      console.warn('[proposeRewrite] empty/short new_body. Raw output preview:', (result.text || '').substring(0, 500));
      return bad(res, 502, 'La IA no devolvió un texto reescrito utilizable. Reintenta o ajusta la instrucción.');
    }

    ok(res, {
      rationale,
      new_body,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
    });
  } catch (e) {
    console.error('[proposeRewrite] error:', e);
    bad(res, e.status || 500, e.message || String(e));
  }
}

// Helper: extrae el código de subsección (1.1, 2.1.3, 4.2, etc.) de la key.
function extractSectionCodeFromKey(chapterKey) {
  if (!chapterKey) return null;
  if (chapterKey === 'ch_summary') return 'PS';
  // ch_1_1_background → 1.1
  // ch_2_1_3_staff → 2.1.3
  // ch_4_2_wp_wp1 → 4.2
  const m = chapterKey.match(/^ch_(\d)_(\d)(?:_(\d))?_/);
  if (!m) return null;
  return [m[1], m[2], m[3]].filter(Boolean).join('.');
}

/* ── Compresión Master → formulario oficial (prompt 06) ──────────
   POST /v1/master/documents/:id/compress-to-form
   Body opcional: { form_template_id?, target_language?='es' }
   Itera por cada campo textarea del formulario oficial, comprime el
   capítulo correspondiente del Master respetando el límite, persiste
   en form_field_values.
*/
async function compressToForm(req, res) {
  try {
    const masterDocId = req.params.id;
    const { form_template_id, target_language = 'es', dryRun = false } = req.body || {};

    const masterDoc = await model.getMasterDocument(masterDocId);
    if (!masterDoc) return bad(res, 404, 'Master document not found');
    const projectId = masterDoc.project_id;
    const userId = req.user.id;

    // 1. Localizar form_template y parsear su JSON
    let template;
    if (form_template_id) {
      const [[tpl]] = await pool.query('SELECT id, name, slug, template_json FROM form_templates WHERE id = ?', [form_template_id]);
      template = tpl;
    } else {
      // Default: el primer form_template activo del sistema (eacea_form_part_b)
      const [[tpl]] = await pool.query(
        `SELECT id, name, slug, template_json FROM form_templates WHERE active = 1 ORDER BY year DESC, name LIMIT 1`
      );
      template = tpl;
    }
    if (!template) return bad(res, 404, 'No form template found. Carga uno en Admin → Plus Data primero.');

    let templateJson;
    try { templateJson = typeof template.template_json === 'string' ? JSON.parse(template.template_json) : template.template_json; }
    catch (e) { return bad(res, 500, 'form_template.template_json no parseable'); }

    // 2. Extraer fields del template (recursivo: sections → subsections → fields)
    const fields = extractFormFields(templateJson);
    if (!fields.length) return bad(res, 422, 'El template no contiene fields textarea procesables');

    // 3. Cargar contexto de calidad + capítulos del Master
    const qCtx = await model.loadProjectQualityContext(projectId);
    const chapters = await model.listChapters(masterDocId);
    const chaptersByKey = Object.fromEntries(chapters.map(c => [c.chapter_key, c]));

    // 4. Localizar o crear form_instance para este proyecto+template
    let [[instance]] = await pool.query(
      'SELECT id FROM form_instances WHERE project_id = ? AND template_id = ? LIMIT 1',
      [projectId, template.id]
    );
    const genUUID3 = require('../../utils/uuid');
    if (!instance) {
      const newInstanceId = genUUID3();
      await pool.query(
        `INSERT INTO form_instances (id, user_id, template_id, program_id, project_id, title, status)
         SELECT ?, ?, ?, ip.id, ?, ?, 'in_progress'
           FROM projects p
           JOIN intake_programs ip ON ip.action_type = p.type
          WHERE p.id = ? LIMIT 1`,
        [newInstanceId, userId, template.id, projectId, masterDoc.version_label || 'Form ' + template.name, projectId]
      );
      instance = { id: newInstanceId };
    } else {
      await pool.query('UPDATE form_instances SET status = "in_progress" WHERE id = ?', [instance.id]);
    }

    if (dryRun) {
      const fieldsWithMapping = fields.map(f => ({
        ...f,
        mapped_chapter_key: mapFieldToChapter(f.id, chaptersByKey),
      }));
      return ok(res, {
        dryRun: true,
        template: { id: template.id, name: template.name },
        instance_id: instance.id,
        fields: fieldsWithMapping,
        total_fields: fields.length,
        mappable: fieldsWithMapping.filter(f => f.mapped_chapter_key).length,
      });
    }

    // 5. Iterar por field y comprimir.
    // Filtramos los fields de la sección 6 (DECLARATIONS): son
    // declaraciones administrativas (double funding, FSTP justification,
    // Seal of Excellence) que NO tienen capítulo de Master — las rellena
    // manualmente el coordinator en el portal EACEA.
    const processableFields = fields.filter(f => !/^s6_/.test(f.id));
    const results = [];
    const errors = [];
    let totalCostUsd = 0;
    for (const field of processableFields) {
      const mappedKey = mapFieldToChapter(field.id, chaptersByKey);
      if (!mappedKey || !chaptersByKey[mappedKey]) {
        errors.push({ field_id: field.id, error: 'no master chapter mapped' });
        continue;
      }
      const sectionCode = extractSectionCodeFromKey(mappedKey);
      const sectionBlock = sectionCode && qCtx.criteriaIndex[sectionCode]
        ? qCtx.criteriaIndex[sectionCode].block
        : '(no specific criteria block)';
      const chapterBody = chaptersByKey[mappedKey].body || '';

      // Fallback al cap centralizado de field-limits si el template no lo define.
      const effectiveMaxChars = field.max_chars || getFieldLimit(field.id) || null;
      const limitParts = [];
      if (effectiveMaxChars) limitParts.push(`${effectiveMaxChars} caracteres`);
      if (field.max_words) limitParts.push(`${field.max_words} palabras`);
      if (field.max_pages) limitParts.push(`${field.max_pages} páginas`);
      const limitLabel = limitParts.join(' · ') || 'sin límite especificado';

      const vars = {
        call_code: qCtx.callCode || '',
        call_writing_style: qCtx.transversal.writing_style || '',
        call_ai_detection_rules: qCtx.transversal.ai_detection_rules || '',
        section_specific_block: sectionBlock,
        source_chapters: `### ${chaptersByKey[mappedKey].title}\n\n${chapterBody}`,
        field_id: field.id,
        question_text: field.question_text || field.label || '',
        question_hint: field.hint || '(no hint)',
        question_kind: field.kind || 'narrative',
        limit_label: limitLabel,
        target_language: target_language,
      };

      // Cap output: ajusta a 3 chars/token + margen para envoltura JSON.
      // 8.000 tokens permite emitir hasta ~22.000 chars (el cap mayor de
      // FIELD_CHAR_LIMITS es 20.000 para s1_2_text).
      const maxTokens = effectiveMaxChars ? Math.min(8000, Math.ceil(effectiveMaxChars / 3) + 800) : 5500;
      try {
        const result = await cag.runPrompt('06_form_compression', vars, {
          maxTokens,
          temperature: 0.3,
          ctx: { projectId, userId },
          endpoint: '/v1/master/documents/:id/compress-to-form',
        });
        totalCostUsd += result.costUsd || 0;
        const parsed = result.parsed;
        if (!parsed || !parsed.answer_body) {
          // Fallback: si el LLM devolvió texto plano sin JSON parseable,
          // tomar el body raw como respuesta (mejor algo que nada).
          const raw = (result.text || '').trim();
          if (raw.length > 100 && !raw.startsWith('{')) {
            const cleaned = raw.replace(/^```(?:json|markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
            console.warn(`[compressToForm] field ${field.id}: JSON parse failed, using raw text (${cleaned.length} chars)`);
            const [[existing]] = await pool.query(
              'SELECT id FROM form_field_values WHERE instance_id = ? AND field_id = ? LIMIT 1',
              [instance.id, field.id]
            );
            const meta = JSON.stringify({ char_count: cleaned.length, word_count: cleaned.split(/\s+/).length, missing_facts: [], notes: '(raw text — JSON parse fail)', fallback: true });
            if (existing) {
              await pool.query('UPDATE form_field_values SET value_text = ?, value_json = ?, updated_at = NOW() WHERE id = ?', [cleaned, meta, existing.id]);
            } else {
              await pool.query('INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, value_json) VALUES (?, ?, ?, ?, ?, ?)', [genUUID3(), instance.id, field.id, field.section_path || null, cleaned, meta]);
            }
            results.push({ field_id: field.id, chapter_key: mappedKey, char_count: cleaned.length, word_count: cleaned.split(/\s+/).length, missing_facts: [], cost_usd: result.costUsd || 0, fallback: true });
            continue;
          }
          console.warn(`[compressToForm] field ${field.id}: parse fail — text preview: ${raw.substring(0, 300)}`);
          errors.push({ field_id: field.id, error: 'output sin answer_body parseable (ver server log)' });
          continue;
        }
        // Truncado defensivo SOLO si ENFORCE_CAPS=true. Por defecto la IA
        // puede devolver textos más largos del cap — priorizamos calidad de
        // contenido sobre límite de páginas (el usuario recorta a mano luego).
        const answerBodyRaw = parsed.answer_body;
        const answerBody = (ENFORCE_CAPS && effectiveMaxChars)
          ? truncate(answerBodyRaw, effectiveMaxChars)
          : answerBodyRaw;
        // Persistir en form_field_values (upsert)
        const [[existing]] = await pool.query(
          'SELECT id FROM form_field_values WHERE instance_id = ? AND field_id = ? LIMIT 1',
          [instance.id, field.id]
        );
        if (existing) {
          await pool.query(
            'UPDATE form_field_values SET value_text = ?, value_json = ?, updated_at = NOW() WHERE id = ?',
            [answerBody, JSON.stringify({ char_count: parsed.char_count, word_count: parsed.word_count, missing_facts: parsed.missing_facts || [], notes: parsed.notes_for_reviewer || '' }), existing.id]
          );
        } else {
          await pool.query(
            'INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, value_json) VALUES (?, ?, ?, ?, ?, ?)',
            [genUUID3(), instance.id, field.id, field.section_path || null, answerBody,
             JSON.stringify({ char_count: parsed.char_count, word_count: parsed.word_count, missing_facts: parsed.missing_facts || [], notes: parsed.notes_for_reviewer || '' })]
          );
        }
        results.push({
          field_id: field.id,
          chapter_key: mappedKey,
          char_count: parsed.char_count,
          word_count: parsed.word_count,
          missing_facts: parsed.missing_facts || [],
          cost_usd: result.costUsd || 0,
        });
      } catch (e) {
        errors.push({ field_id: field.id, error: e.message });
      }
    }

    await pool.query('UPDATE form_instances SET status = "complete" WHERE id = ?', [instance.id]);

    ok(res, {
      instance_id: instance.id,
      project_id: projectId,
      template: { id: template.id, name: template.name },
      total_fields: processableFields.length,
      compressed: results.length,
      errors: errors.length,
      total_cost_usd: totalCostUsd,
      results,
      error_details: errors,
    });
  } catch (e) {
    console.error('[compressToForm] error:', e);
    bad(res, 500, e.message || String(e));
  }
}

/**
 * POST /v1/master/documents/:id/compress-field/:fieldId
 * Re-comprime UN solo field del formulario. Reutiliza la misma lógica
 * de compressToForm pero solo para un field — útil cuando el usuario
 * edita un capítulo del Master y quiere refrescar el campo del formulario
 * derivado, sin volver a comprimir los 16 campos.
 */
async function compressSingleField(req, res) {
  try {
    const masterDocId = req.params.id;
    const fieldId = req.params.fieldId;
    const userId = req.user.id;

    const masterDoc = await model.getMasterDocument(masterDocId);
    if (!masterDoc) return bad(res, 404, 'master_document not found');
    const projectId = masterDoc.project_id;

    // Localizar template activo
    const [[template]] = await pool.query(
      `SELECT id, name, slug, template_json FROM form_templates WHERE active = 1 ORDER BY year DESC, name LIMIT 1`
    );
    if (!template) return bad(res, 404, 'No form template found');
    let templateJson;
    try { templateJson = typeof template.template_json === 'string' ? JSON.parse(template.template_json) : template.template_json; }
    catch (e) { return bad(res, 500, 'form_template.template_json no parseable'); }

    const fields = extractFormFields(templateJson);
    const field = fields.find(f => f.id === fieldId);
    if (!field) return bad(res, 404, `field ${fieldId} not found in template`);

    const qCtx = await model.loadProjectQualityContext(projectId);
    const chapters = await model.listChapters(masterDocId);
    const chaptersByKey = Object.fromEntries(chapters.map(c => [c.chapter_key, c]));
    const mappedKey = mapFieldToChapter(field.id, chaptersByKey);
    if (!mappedKey || !chaptersByKey[mappedKey]) {
      return bad(res, 422, `no master chapter mapped for field ${fieldId}`);
    }

    // Form instance
    let [[instance]] = await pool.query(
      'SELECT id FROM form_instances WHERE project_id = ? AND template_id = ? LIMIT 1',
      [projectId, template.id]
    );
    if (!instance) {
      const newInstanceId = genUUID();
      await pool.query(
        `INSERT INTO form_instances (id, user_id, template_id, program_id, project_id, title, status)
         SELECT ?, ?, ?, ip.id, ?, ?, 'in_progress'
           FROM projects p
           JOIN intake_programs ip ON ip.action_type = p.type
          WHERE p.id = ? LIMIT 1`,
        [newInstanceId, userId, template.id, projectId, masterDoc.version_label || 'Form ' + template.name, projectId]
      );
      instance = { id: newInstanceId };
    }

    const sectionCode = extractSectionCodeFromKey(mappedKey);
    const sectionBlock = sectionCode && qCtx.criteriaIndex[sectionCode]
      ? qCtx.criteriaIndex[sectionCode].block
      : '(no specific criteria block)';
    const chapterBody = chaptersByKey[mappedKey].body || '';
    const effectiveMaxChars = field.max_chars || getFieldLimit(field.id) || null;
    const limitParts = [];
    if (effectiveMaxChars) limitParts.push(`${effectiveMaxChars} caracteres`);
    if (field.max_words) limitParts.push(`${field.max_words} palabras`);
    if (field.max_pages) limitParts.push(`${field.max_pages} páginas`);

    const vars = {
      call_code: qCtx.callCode || '',
      call_writing_style: qCtx.transversal.writing_style || '',
      call_ai_detection_rules: qCtx.transversal.ai_detection_rules || '',
      section_specific_block: sectionBlock,
      source_chapters: `### ${chaptersByKey[mappedKey].title}\n\n${chapterBody}`,
      field_id: field.id,
      question_text: field.question_text || field.label || '',
      question_hint: field.hint || '(no hint)',
      question_kind: field.kind || 'narrative',
      limit_label: limitParts.join(' · ') || 'sin límite especificado',
      target_language: (req.body && req.body.target_language) || 'es',
    };
    const maxTokens = effectiveMaxChars ? Math.min(8000, Math.ceil(effectiveMaxChars / 3) + 800) : 5500;

    const result = await cag.runPrompt('06_form_compression', vars, {
      maxTokens, temperature: 0.3,
      ctx: { projectId, userId },
      endpoint: `/v1/master/documents/:id/compress-field/${field.id}`,
    });

    // Extraer answer_body (tolerante)
    let answerBody = '';
    const parsed = result.parsed;
    if (parsed && parsed.answer_body) {
      answerBody = parsed.answer_body;
    } else if (result.text) {
      const raw = result.text.trim();
      const cleaned = raw.replace(/^```(?:json|markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
      if (cleaned.length > 100 && !cleaned.startsWith('{')) answerBody = cleaned;
    }
    if (!answerBody) {
      return bad(res, 502, 'La IA no devolvió contenido utilizable para este campo. Reintenta.');
    }

    // Truncado defensivo SOLO si ENFORCE_CAPS=true (por defecto false).
    if (ENFORCE_CAPS && effectiveMaxChars) answerBody = truncate(answerBody, effectiveMaxChars);

    // Upsert form_field_values
    const meta = JSON.stringify({
      char_count: answerBody.length,
      word_count: answerBody.split(/\s+/).filter(Boolean).length,
      missing_facts: parsed?.missing_facts || [],
      notes: parsed?.notes_for_reviewer || '',
      manually_edited: false,
      last_compressed_at: new Date().toISOString(),
    });
    const [[existing]] = await pool.query(
      'SELECT id FROM form_field_values WHERE instance_id = ? AND field_id = ? LIMIT 1',
      [instance.id, field.id]
    );
    if (existing) {
      await pool.query(
        `UPDATE form_field_values SET value_text = ?, value_json = ?, updated_at = NOW() WHERE id = ?`,
        [answerBody, meta, existing.id]
      );
    } else {
      await pool.query(
        `INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, value_json) VALUES (?, ?, ?, ?, ?, ?)`,
        [genUUID(), instance.id, field.id, field.section_path || null, answerBody, meta]
      );
    }

    ok(res, {
      field_id: field.id,
      value_text: answerBody,
      char_count: answerBody.length,
      max_chars: effectiveMaxChars,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
      mapped_chapter_key: mappedKey,
    });
  } catch (e) {
    console.error('[compressSingleField] error:', e);
    bad(res, e.status || 500, e.message || String(e));
  }
}

/**
 * POST /v1/master/documents/:id/seed-form-from-master
 * Copia cada capítulo del Master directamente al campo del formulario
 * truncándolo al cap. SIN llamadas al LLM, instantáneo, $0 coste.
 *
 * Útil para previsualizar el formulario con contenido real antes de
 * decidir si re-comprimir con IA o editar a mano. El resultado es el
 * mismo texto del Master truncado — no es "compresión" inteligente
 * (no resume), pero llena los campos con prosa real del proyecto.
 */
async function seedFormFromMaster(req, res) {
  try {
    const masterDocId = req.params.id;
    const userId = req.user.id;

    const masterDoc = await model.getMasterDocument(masterDocId);
    if (!masterDoc) return bad(res, 404, 'master_document not found');
    const projectId = masterDoc.project_id;

    const chapters = await model.listChapters(masterDocId);
    if (!chapters.length) return bad(res, 409, 'Master has no chapters. Compile first.');
    const byKey = {};
    for (const c of chapters) byKey[c.chapter_key] = c.body || '';

    // Localizar template activo
    const [[template]] = await pool.query(
      `SELECT id, name, slug, template_json FROM form_templates WHERE active = 1 ORDER BY year DESC, name LIMIT 1`
    );
    if (!template) return bad(res, 404, 'No form template found');
    let templateJson;
    try { templateJson = typeof template.template_json === 'string' ? JSON.parse(template.template_json) : template.template_json; }
    catch (e) { return bad(res, 500, 'form_template.template_json no parseable'); }

    const fields = extractFormFields(templateJson);

    // Localizar o crear form_instance
    let [[instance]] = await pool.query(
      'SELECT id FROM form_instances WHERE project_id = ? AND template_id = ? LIMIT 1',
      [projectId, template.id]
    );
    if (!instance) {
      const newInstanceId = genUUID();
      await pool.query(
        `INSERT INTO form_instances (id, user_id, template_id, program_id, project_id, title, status)
         SELECT ?, ?, ?, ip.id, ?, ?, 'in_progress'
           FROM projects p
           JOIN intake_programs ip ON ip.action_type = p.type
          WHERE p.id = ? LIMIT 1`,
        [newInstanceId, userId, template.id, projectId, masterDoc.version_label || 'Form ' + template.name, projectId]
      );
      instance = { id: newInstanceId };
    }

    // Mapping field → chapter_key (mismo que mapFieldToChapter pero forzando match)
    const processableFields = fields.filter(f => !/^s6_/.test(f.id));
    const results = [];
    const errors = [];
    const chaptersByKey = byKey;

    for (const field of processableFields) {
      const mappedKey = mapFieldToChapter(field.id, chaptersByKey);
      if (!mappedKey || !chaptersByKey[mappedKey]) {
        errors.push({ field_id: field.id, error: 'no master chapter mapped' });
        continue;
      }
      const body = chaptersByKey[mappedKey] || '';
      if (!body.trim()) {
        errors.push({ field_id: field.id, error: 'master chapter is empty' });
        continue;
      }

      // Truncar al cap del field (FIELD_CHAR_LIMITS de field-limits.js)
      const effectiveMaxChars = field.max_chars || getFieldLimit(field.id) || null;
      const cleaned = effectiveMaxChars ? truncate(body, effectiveMaxChars) : body;

      const meta = JSON.stringify({
        char_count: cleaned.length,
        word_count: cleaned.split(/\s+/).filter(Boolean).length,
        seeded_from_master: true,
        seeded_from_chapter: mappedKey,
        seeded_at: new Date().toISOString(),
      });

      const [[existing]] = await pool.query(
        'SELECT id FROM form_field_values WHERE instance_id = ? AND field_id = ? LIMIT 1',
        [instance.id, field.id]
      );
      if (existing) {
        await pool.query(
          'UPDATE form_field_values SET value_text = ?, value_json = ?, updated_at = NOW() WHERE id = ?',
          [cleaned, meta, existing.id]
        );
      } else {
        await pool.query(
          'INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, value_json) VALUES (?, ?, ?, ?, ?, ?)',
          [genUUID(), instance.id, field.id, field.section_path || null, cleaned, meta]
        );
      }
      results.push({
        field_id: field.id,
        chapter_key: mappedKey,
        char_count: cleaned.length,
        max_chars: effectiveMaxChars,
        was_truncated: body.length > cleaned.length,
      });
    }

    await pool.query('UPDATE form_instances SET status = "complete" WHERE id = ?', [instance.id]);

    ok(res, {
      instance_id: instance.id,
      project_id: projectId,
      template: { id: template.id, name: template.name },
      total_fields: processableFields.length,
      seeded: results.length,
      errors: errors.length,
      results,
      error_details: errors,
    });
  } catch (e) {
    console.error('[seedFormFromMaster] error:', e);
    bad(res, e.status || 500, e.message || String(e));
  }
}

/* Helper: extrae fields textarea recursivamente del JSON del template
   form_part_b_eacea.json. Devuelve [{id, label, max_chars, max_words,
   max_pages, kind, section_path}] */
function extractFormFields(tpl) {
  const out = [];
  function visit(node, sectionPath) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(n => visit(n, sectionPath)); return; }
    if (typeof node !== 'object') return;

    // Si es un field
    if (node.id && (node.type === 'textarea' || node.type === 'text')) {
      if (node.type === 'textarea' || (node.id.endsWith('_text'))) {
        out.push({
          id: node.id,
          label: node.label || '',
          question_text: node.label || '',
          hint: Array.isArray(node.guidance) ? node.guidance.join(' ') : (node.guidance || ''),
          max_chars: node.max_chars || null,
          max_words: node.max_words || null,
          max_pages: node.max_pages || null,
          kind: node.type === 'textarea' ? 'narrative' : node.type,
          section_path: sectionPath,
        });
      }
    }

    // Recurse en subsections, sections, fields, subsections_groups
    const childKeys = ['sections', 'subsections', 'subsections_groups', 'fields'];
    for (const k of childKeys) {
      if (node[k]) {
        const newPath = node.number ? `${sectionPath || ''}/${node.number}` : sectionPath;
        visit(node[k], newPath);
      }
    }
    // Project summary tiene fields directos
    if (node.fields && node.title) visit(node.fields, node.id || sectionPath);
  }
  // Cover/summary también
  if (tpl.project_summary) visit(tpl.project_summary, 'PS');
  if (tpl.cover_page) visit(tpl.cover_page, 'cover');
  if (tpl.sections) visit(tpl.sections, '');
  return out;
}

/* Helper: mapea field_id del formulario al chapter_key del Master.
   Convención: s1_1_text → ch_1_1_*, s2_1_3_text → ch_2_1_3_* */
function mapFieldToChapter(fieldId, chaptersByKey) {
  if (!fieldId) return null;
  if (fieldId === 'summary_text') {
    return Object.keys(chaptersByKey).find(k => k === 'ch_summary');
  }
  // Match: s{section}_{sub}[_{subsub}]_*  → ch_{section}_{sub}[_{subsub}]_*
  // Cubre s1_1_text, s2_1_3_staff_table, s2_1_5_risk_table, s5_2_text, etc.
  // Los _staff_table y _risk_table se rellenan con narrativa libre — el exporter
  // los usa como "narrativa fuera de la tabla" (s2_1_3_outside_text, etc.).
  const m = fieldId.match(/^s(\d+)_(\d+)(?:_(\d+))?_/);
  if (!m) return null;
  const code = [m[1], m[2], m[3]].filter(Boolean).join('_');
  const prefix = 'ch_' + code + '_';
  return Object.keys(chaptersByKey).find(k => k.startsWith(prefix)) || null;
}

/* ── Subida de documentos canónicos de la convocatoria (CAG sources) ── */

/* ── Stubs restantes (devolverán 501 hasta que se conecten) ─── */

async function notImplemented(req, res) {
  res.status(501).json({
    ok: false,
    error: 'Endpoint placeholder — pipeline LLM no conectado todavía.',
    next_steps: 'Ver docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md fase F6+',
  });
}

module.exports = {
  // documents
  listMasterDocuments,
  getMasterDocument,
  createMasterDocument,
  updateMasterDocument,
  deleteMasterDocument,
  // chapters
  listChapters,
  createChapter,
  updateChapter,
  deleteChapter,
  // exports
  listExports,
  markExportReady,
  exportMasterAsMarkdown,
  // chat
  getOrCreateMainThread,
  listMessages,
  appendMessage,
  // form templates
  listFormTemplates,
  getFormTemplateFull,
  // CAG document sources (read-only inventory)
  listCagDocumentsForProject,
  // diagnoses
  listDiagnoses,
  getDiagnosis,
  patchDiagnosisItemState,
  createCustomDiagnosisItem,
  // LLM-powered (CAG)
  compileMasterV1,
  runDiagnosis,
  refineChapter,
  proposeRewrite,
  compressToForm,
  compressSingleField,
  seedFormFromMaster,
  // placeholders LLM (501 hasta conectar)
  regenerateWithUnifiedContext: notImplemented,
  computeScoreEstimate: notImplemented,
  coherencePass: notImplemented,
};
