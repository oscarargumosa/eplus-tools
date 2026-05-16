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

    // Criterios de evaluación (si están)
    const [evalRows] = await pool.query(
      `SELECT es.code, es.title, es.max_score, eq.code AS q_code, eq.title AS q_title
       FROM projects p
       LEFT JOIN eval_sections es ON es.programme_id = p.program_id
       LEFT JOIN eval_questions eq ON eq.section_id = es.id
       WHERE p.id = ?
       ORDER BY es.code, eq.code`,
      [projectId]
    ).catch(() => [[]]);
    const evalCriteria = evalRows.length
      ? evalRows.map(r => `${r.code} ${r.title} (max ${r.max_score})${r.q_code ? `\n  - ${r.q_code} ${r.q_title}` : ''}`).join('\n')
      : 'No specific evaluation criteria loaded for this call. Use general EU evaluation patterns (Relevance, Quality, Impact, Partnership).';

    const vars = {
      call_code: '',
      criteria: evalCriteria,
      call_documents: cagBundle,
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

    const CHAPTER_PLAN = [
      { key: 'ch_summary', type: 'summary', title: 'Project Summary — Resumen ejecutivo ampliado',
        focus: 'Extended executive overview: acronym, full title, what the project does, why it matters now, target groups, expected change, consortium spine, expected impact. Self-contained 2-page brief that an evaluator can read in 5 min and grasp the proposal.' },

      // 1. RELEVANCE
      { key: 'ch_1_1_background', type: 'relevance', title: '1.1 — Contexto y objetivos generales',
        focus: 'Background and rationale of the project. How it is relevant to the SCOPE of the call. How it addresses the GENERAL OBJECTIVES of the call. Project contribution to the call PRIORITIES (if applicable). Connect explicitly to the call document quoted in {{call_documents}}.' },
      { key: 'ch_1_2_needs', type: 'relevance', title: '1.2 — Análisis de necesidades y objetivos específicos',
        focus: 'Sound needs analysis aligned with the specific objectives of the call. What issue/challenge/gap the project addresses. Each project-specific objective stated CLEARLY, MEASURABLE, REALISTIC and ACHIEVABLE within the duration; for each one, the indicators of achievement (unit of measurement, baseline, target).' },
      { key: 'ch_1_3_complementarity', type: 'relevance', title: '1.3 — Complementariedad, innovación y valor añadido europeo',
        focus: 'How the project builds on results of past activities in the field; innovative aspects (if any). Complementarity with activities by other organisations. Trans-national dimension; impact across the EU; potential to use results in other countries; cross-border cooperation among Programme and Partner countries. Precise references to any prior or ongoing projects this proposal builds on.' },

      // 2.1 QUALITY — Project design and implementation
      { key: 'ch_2_1_1_concept', type: 'quality', title: '2.1.1 — Concepto y metodología',
        focus: 'Approach and methodology behind the project. Why they are the most suitable for achieving the objectives. Theory of change, design principles, methodological choices, conceptual articulation across WPs.' },
      { key: 'ch_2_1_2_management', type: 'quality', title: '2.1.2 — Gestión del proyecto, aseguramiento de calidad, seguimiento y evaluación',
        focus: 'Measures to ensure high-quality, on-time implementation. Methods for quality control, planning, monitoring. Evaluation methods and indicators (quantitative and qualitative) — including unit of measurement, baseline, target. Make explicit how progress will be measured and reported.' },
      { key: 'ch_2_1_3_staff', type: 'quality', title: '2.1.3 — Equipos, personal y expertos del proyecto',
        focus: 'Describe project teams and how they work together. List ALL key staff (budget category A) by function/profile — ONE NARRATIVE PARAGRAPH PER PERSON: name and function, organisation, role/tasks in this project, professional profile and expertise, why this person is the right fit. NO TABLES. Close with a paragraph explaining how the teams complement each other.' },
      { key: 'ch_2_1_4_cost_effectiveness', type: 'quality', title: '2.1.4 — Coste-eficacia y gestión financiera',
        focus: 'Measures to ensure that the proposed results and objectives are achieved in the MOST COST-EFFECTIVE way. Arrangements for financial management — how resources will be allocated and managed within the consortium. Do NOT compare costs per WP and do NOT include numbers; explain qualitatively why the budget is cost-effective.' },
      { key: 'ch_2_1_5_risk', type: 'quality', title: '2.1.5 — Gestión de riesgos',
        focus: 'Critical risks, uncertainties, difficulties for implementation. ONE NARRATIVE PARAGRAPH PER RISK: description, work package(s) affected, impact (high/medium/low), likelihood (high/medium/low) even after mitigation, proposed mitigation measures, contingency. NO TABLES. Close with a paragraph on the overall risk posture and how the consortium will react to unforeseen events.' },

      // 2.2 QUALITY — Partnership and cooperation arrangements
      { key: 'ch_2_2_1_consortium_setup', type: 'consortium', title: '2.2.1 — Configuración del consorcio',
        focus: 'Participants (Beneficiaries, Affiliated Entities, Associated Partners, others). For each partner: a narrative paragraph with role, expertise contributed, complementarity, valid role and adequate resources. NO TABLES. Close with a paragraph on how the partners come together as a whole greater than the sum of parts.' },
      { key: 'ch_2_2_2_consortium_management', type: 'consortium', title: '2.2.2 — Gestión del consorcio y toma de decisiones',
        focus: 'Management structures and decision-making mechanisms. How decisions will be taken; communication channels (frequency, format); planning and control methods. Adapt the level of detail to the complexity and scale of the project.' },

      // 3. IMPACT
      { key: 'ch_3_1_impact', type: 'impact', title: '3.1 — Impacto y ambición',
        focus: 'Expected SHORT-, MEDIUM- and LONG-term effects. Target groups (concrete, not abstract) and HOW they will benefit. What will change for them. Quantitative KPIs where possible. Tie the impact narrative back to objectives stated in 1.2.' },
      { key: 'ch_3_2_dissemination', type: 'impact', title: '3.2 — Comunicación, diseminación y visibilidad',
        focus: 'Communication and dissemination activities to promote results and maximise impact: to whom, in what format, how many, through which channels and why those channels. Reaching target groups, stakeholders, policymakers, general public. Plan for ensuring EU funding visibility (acknowledgement, logos, recommended phrasing).' },
      { key: 'ch_3_3_sustainability', type: 'impact', title: '3.3 — Sostenibilidad y continuación',
        focus: 'Follow-up after EU funding ends. How impact will be sustained. What needs to be done, by whom, with what resources. Which parts of the project should be continued or maintained and how. Possible synergies/complementarities with other (EU-funded) activities that can build on the results.' },

      // 4. WORK PLAN
      { key: 'ch_4_1_workplan', type: 'workplan', title: '4.1 — Plan de trabajo (visión general)',
        focus: 'Overall structure of the work plan: list of WPs at a glance, their interdependencies, the project rhythm (kick-off, mid-term review, final), how WPs articulate towards the project objectives stated in 1.2. PROSE, no Gantt — the Gantt is rendered separately from data.' },

      // 4.2 — Work Packages (dynamic, one chapter per WP)
      ...wpRows.map(wp => ({
        key: `ch_4_2_wp_${(wp.code || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_') || wp.id.slice(0, 6)}`,
        type: 'wp',
        title: `4.2 — ${wp.code || ''} ${wp.title}`,
        focus: `Develop Work Package "${wp.code} ${wp.title}" in full narrative form. Cover: WP objectives (expected outcomes), lead beneficiary and rationale, duration, articulation with other WPs. Then THREE NARRATIVE SUBSECTIONS — Activities, Milestones, Deliverables — each with ONE paragraph per task / milestone / deliverable belonging to this WP. For each task: what is done, by which partner, role (COO/BEN/AE/AP/OTHER), in-kind contributions or subcontracting (and its justification). For each milestone: what it marks, success criteria, due date (project month), means of verification. For each deliverable: what it is, format, language, dissemination level (PU/SEN/…), due date, how it will be used after delivery. NO TABLES — pure prose with light Markdown headings ## Activities, ## Milestones, ## Deliverables.`,
        ref_entity_type: 'work_package',
        ref_entity_id: wp.id,
      })),

      // 5. OTHER
      { key: 'ch_5_1_ethics', type: 'other', title: '5.1 — Ética',
        focus: 'Ethics issues that may arise during implementation and measures to address them. Gender mainstreaming. Children\'s rights if applicable. Data protection. Inclusion. If the project has none of these dimensions, say so explicitly — "Not applicable" is a valid answer in this subsection.' },
      { key: 'ch_5_2_security', type: 'other', title: '5.2 — Seguridad',
        focus: 'Security issues if applicable (sensitive data, critical infrastructure, dual-use). Most civil projects answer "Not applicable" here. If applicable, describe and propose mitigation.' },
    ];

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

      const chapterVars = {
        ...vars,
        chapter_key: ch.key,
        chapter_type: ch.type,
        chapter_title: ch.title,
        chapter_focus: ch.focus,
        previous_chapters_summary: previousSummary,
      };

      try {
        const result = await cag.runPrompt('01b_compile_single_chapter', chapterVars, {
          maxTokens: 8000,
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

    const masterText = chapters
      .map(c => `## ${c.title}\n\n${c.body || ''}`)
      .join('\n\n---\n\n');

    // Design snapshot conciso para cross-checks
    const designSnapshot = await developerModel.buildEnrichedContext(projectId, userId);

    // Eval criteria
    const [evalRows] = await pool.query(
      `SELECT es.code, es.title, es.max_score, eq.code AS q_code, eq.title AS q_title
       FROM projects p
       LEFT JOIN eval_sections es ON es.programme_id = p.program_id
       LEFT JOIN eval_questions eq ON eq.section_id = es.id
       WHERE p.id = ? ORDER BY es.code, eq.code`,
      [projectId]
    ).catch(() => [[]]);
    const criteria = evalRows.map(r => `${r.code} ${r.title} (max ${r.max_score})${r.q_code ? `\n  - ${r.q_code} ${r.q_title}` : ''}`).join('\n');

    // Cargar bundle CAG (call docs + project docs core) para que el
    // diagnose contraste el Master contra el reglamento oficial.
    const cagDocs = await model.loadProjectCagBundle(projectId);
    const cagBundle = cagDocs.length
      ? cagDocs.map(d => {
          const header = d.origin === 'call' ? 'CALL DOCUMENT' : 'PROJECT DOCUMENT';
          const kind = d.source_kind ? ` · ${d.source_kind}` : '';
          return `═════ ${header}: ${d.title}${kind} ═════\n${d.body_text}`;
        }).join('\n\n')
      : '(no call or project documents with extracted text available)';

    const vars = {
      call_code: '',
      criteria: criteria || 'Use general EU evaluation patterns.',
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
  // LLM-powered (CAG)
  compileMasterV1,
  runDiagnosis,
  // placeholders LLM (501 hasta conectar)
  regenerateWithUnifiedContext: notImplemented,
  computeScoreEstimate: notImplemented,
  compressToForm: notImplemented,
  coherencePass: notImplemented,
};
