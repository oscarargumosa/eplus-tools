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

/* ── Call documents (CAG sources) ────────────────────────────── */

async function listCallDocuments(req, res) {
  try {
    const docs = await model.listCallDocuments(req.params.callId);
    ok(res, docs);
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

    // Cargar documentos adjuntos del proyecto (CAG: solo si tienen body_text extraído).
    // Marcados 'core' van primero. Si un doc no tiene body_text extraído, se ignora
    // (extracción on-demand en endpoint futuro).
    const [docRows] = await pool.query(
      `SELECT d.id, d.title, d.doc_type, d.file_type, d.body_text, pd.doc_purpose
       FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
       WHERE pd.project_id = ? AND d.status = 'active' AND d.body_text IS NOT NULL AND LENGTH(d.body_text) > 100
       ORDER BY FIELD(pd.doc_purpose, 'core', 'support'), d.created_at`,
      [projectId]
    ).catch(() => [[]]);
    const projectDocsText = docRows.length
      ? docRows.map(d => `═════ ATTACHED DOC: ${d.title} (${d.doc_type || 'unknown'}) ═════\n${d.body_text}`).join('\n\n')
      : '';

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

    // Si hay docs adjuntos al proyecto, los añadimos al enriched_context.
    // Van al final del bloque, después del Diseño, claramente delimitados.
    const fullEnrichedContext = projectDocsText
      ? `${enrichedContext}\n\n═══ ATTACHED PROJECT DOCUMENTS (${docRows.length}) ═══\n\n${projectDocsText}`
      : enrichedContext;

    const vars = {
      call_code: '',
      criteria: evalCriteria,
      enriched_context: fullEnrichedContext,
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

    // Plan de capítulos del Master (10 capítulos fijos).
    const CHAPTER_PLAN = [
      { key: 'ch_1_executive_summary', type: 'summary', title: 'Resumen Ejecutivo',
        focus: 'High-level overview of the whole project: what it does, why it matters, with whom, and what change it produces. Should read as a self-contained 2-page executive briefing.' },
      { key: 'ch_2_relevance',         type: 'qa',      title: 'Por qué este proyecto: contexto, problema, necesidades, grupos objetivo',
        focus: 'Establish the problem with evidence; describe target groups concretely; connect to EU and call priorities. The "why this, why now, why us".' },
      { key: 'ch_3_approach',          type: 'qa',      title: 'Enfoque y metodología',
        focus: 'How the project will operate: theory of change, methodology, design principles, innovation. Distinct from work packages — this is the HOW at a conceptual level.' },
      { key: 'ch_4_wps',               type: 'wp',      title: 'Paquetes de Trabajo — desarrollo narrativo completo',
        focus: 'Each WP developed in narrative form: objectives, activities, tasks, deliverables, milestones, responsible partner, timeline. Multi-page chapter — the heart of the Master.' },
      { key: 'ch_5_consortium',        type: 'partner', title: 'Consorcio: capacidad y rol de cada partner',
        focus: 'One section per partner explaining role, capacity, prior EU experience, key staff justification, and complementarity with the rest of the consortium.' },
      { key: 'ch_6_impact',            type: 'impact',  title: 'Impacto esperado y difusión',
        focus: 'Concrete expected impact on target groups, sector, territory and EU policy. Quantitative KPIs where possible. Dissemination strategy with channels and audiences.' },
      { key: 'ch_7_sustainability',    type: 'qa',      title: 'Sostenibilidad y explotación post-proyecto',
        focus: 'What happens after M48. Who owns the outputs, who maintains them, financial sustainability, governance after the funded period. The "second life" of the project.' },
      { key: 'ch_8_budget',            type: 'budget',  title: 'Justificación narrativa del presupuesto',
        focus: 'Qualitative rationale of why each major budget area exists at the scale it does. Reference the work plan, not raw numbers. Cost-effectiveness arguments.' },
      { key: 'ch_9_quality',           type: 'qa',      title: 'Aseguramiento de calidad y gestión de riesgos',
        focus: 'Quality control mechanisms, monitoring, evaluation, internal audit, risk register with mitigation. Demonstrate the team has thought through what could go wrong.' },
      { key: 'ch_10_alignment',        type: 'qa',      title: 'Alineación estratégica con prioridades de la convocatoria y estrategias UE',
        focus: 'Map the project explicitly to call priorities and to relevant EU strategies (Farm to Fork, Green Deal, etc. as applicable). Make the evaluator s job easy.' },
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

        const savedCh = await model.createChapter({
          masterDocId,
          chapterKey: parsedCh.chapter_key || ch.key,
          chapterType: parsedCh.chapter_type || ch.type,
          title: parsedCh.title || ch.title,
          body: parsedCh.body || '',
          sortOrder: i,
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

    const vars = {
      call_code: '',
      criteria: criteria || 'Use general EU evaluation patterns.',
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

/**
 * Sube un PDF o DOCX a una convocatoria, extrae el texto, lo guarda en
 * call_documents.body_text para que esté disponible para el pipeline CAG.
 *
 * Multipart: req.file con campo "file". req.body con doc_kind, title,
 * language, is_core.
 */
async function uploadCallDocument(req, res) {
  try {
    if (!req.file) return bad(res, 400, 'file is required (multipart/form-data, field "file")');
    if (req.user.role !== 'admin') return bad(res, 403, 'admin role required');

    const callId = req.params.callId;
    const { doc_kind, title, language = 'en', is_core = '1' } = req.body || {};

    if (!doc_kind || !title) {
      return bad(res, 400, 'doc_kind and title are required');
    }

    const allowedKinds = ['call_pdf', 'programme_guide', 'annotated_grant', 'eval_criteria', 'reference', 'annex'];
    if (!allowedKinds.includes(doc_kind)) {
      return bad(res, 400, `doc_kind must be one of: ${allowedKinds.join(', ')}`);
    }

    // Extraer texto según mimetype
    const mime = req.file.mimetype || '';
    const filename = req.file.originalname || 'unnamed';
    let bodyText = '';

    if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(req.file.buffer);
      bodyText = result.text || '';
    } else if (mime.includes('officedocument.wordprocessingml') || filename.toLowerCase().endsWith('.docx')) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      bodyText = result.value || '';
    } else if (mime.startsWith('text/') || filename.toLowerCase().endsWith('.txt') || filename.toLowerCase().endsWith('.md')) {
      bodyText = req.file.buffer.toString('utf8');
    } else {
      return bad(res, 415, `Unsupported file type: ${mime}. Use PDF, DOCX, TXT or MD.`);
    }

    const charCount = bodyText.length;
    const tokenCountEst = Math.ceil(charCount / 3.5);

    const id = genUUID();
    await pool.query(
      `INSERT INTO call_documents
         (id, call_id, doc_kind, title, source_filename, language,
          body_text, char_count, token_count_est, is_core, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, callId, doc_kind, title, filename, language,
       bodyText, charCount, tokenCountEst,
       is_core === '0' || is_core === false ? 0 : 1,
       req.user.id]
    );

    ok(res, {
      id, call_id: callId, doc_kind, title,
      char_count: charCount, token_count_est: tokenCountEst,
      preview: bodyText.substring(0, 400),
    });
  } catch (e) {
    console.error('[uploadCallDocument] error:', e);
    bad(res, 500, e.message);
  }
}

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
  // call documents
  listCallDocuments,
  // diagnoses
  listDiagnoses,
  getDiagnosis,
  // upload call documents (CAG sources)
  uploadCallDocument,
  // LLM-powered (CAG)
  compileMasterV1,
  runDiagnosis,
  // placeholders LLM (501 hasta conectar)
  regenerateWithUnifiedContext: notImplemented,
  computeScoreEstimate: notImplemented,
  compressToForm: notImplemented,
  coherencePass: notImplemented,
};
