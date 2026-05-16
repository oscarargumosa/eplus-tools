/* ═══════════════════════════════════════════════════════════════
   Master Document — Model layer (stubs, CRUD básico)
   ═══════════════════════════════════════════════════════════════
   Implementa la persistencia para el Documento Maestro y todo
   su ecosistema (capítulos, exports, chat, mapping, etc.) tal
   como se define en docs/PROJECT_MASTER_ARCHITECTURE.md.

   IMPORTANTE: esto son STUBS. Solo CRUD básico. El pipeline LLM
   (CAG, regeneración, diagnóstico, compresión) NO está conectado
   todavía — se conectará en una segunda iteración con Oscar
   delante para validar prompts y coste.

   Tablas asociadas (migración 103):
     - master_documents
     - master_chapters
     - master_exports
     - chat_threads
     - chat_messages
     - call_form_templates
     - call_form_questions
     - master_to_form_mapping
     - call_documents
     - master_diagnoses
     - master_diagnosis_items
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');
const genUUID = require('../../utils/uuid');

/* ── master_documents ───────────────────────────────────────── */

async function listMasterDocumentsByProject(projectId) {
  const [rows] = await pool.query(
    `SELECT id, project_id, version_tag, version_label, status, language,
            total_chars, parent_id, created_at, updated_at
     FROM master_documents
     WHERE project_id = ?
     ORDER BY created_at DESC`,
    [projectId]
  );
  return rows;
}

async function getMasterDocument(id) {
  const [rows] = await pool.query(
    'SELECT * FROM master_documents WHERE id = ?', [id]
  );
  return rows[0] || null;
}

async function createMasterDocument({ projectId, versionTag, versionLabel, language, parentId }) {
  const id = genUUID();
  await pool.query(
    `INSERT INTO master_documents (id, project_id, version_tag, version_label, status, language, parent_id)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
    [id, projectId, versionTag || 'v1', versionLabel || null, language || 'es', parentId || null]
  );
  return getMasterDocument(id);
}

async function updateMasterDocument(id, data) {
  const fields = [];
  const params = [];
  for (const key of ['version_tag', 'version_label', 'status', 'language', 'total_chars']) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
  }
  if (!fields.length) return getMasterDocument(id);
  params.push(id);
  await pool.query(`UPDATE master_documents SET ${fields.join(', ')} WHERE id = ?`, params);
  return getMasterDocument(id);
}

async function deleteMasterDocument(id) {
  await pool.query('DELETE FROM master_documents WHERE id = ?', [id]);
}

/* ── master_chapters ─────────────────────────────────────────── */

async function listChapters(masterDocId) {
  const [rows] = await pool.query(
    `SELECT id, master_doc_id, chapter_key, chapter_type, title, body, sort_order,
            parent_chapter_id, ref_entity_type, ref_entity_id, char_count,
            last_ai_edit_at, last_human_edit_at, created_at, updated_at
     FROM master_chapters
     WHERE master_doc_id = ?
     ORDER BY sort_order, created_at`,
    [masterDocId]
  );
  return rows;
}

async function getChapter(id) {
  const [rows] = await pool.query(
    'SELECT * FROM master_chapters WHERE id = ?', [id]
  );
  return rows[0] || null;
}

async function createChapter({ masterDocId, chapterKey, chapterType, title, body, sortOrder, parentChapterId, refEntityType, refEntityId }) {
  const id = genUUID();
  const charCount = body ? body.length : 0;
  await pool.query(
    `INSERT INTO master_chapters
       (id, master_doc_id, chapter_key, chapter_type, title, body, sort_order,
        parent_chapter_id, ref_entity_type, ref_entity_id, char_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, masterDocId, chapterKey, chapterType, title, body || null, sortOrder || 0,
     parentChapterId || null, refEntityType || null, refEntityId || null, charCount]
  );
  return getChapter(id);
}

async function updateChapter(id, data, opts = {}) {
  const fields = [];
  const params = [];
  for (const key of ['chapter_key', 'chapter_type', 'title', 'body', 'sort_order',
                     'parent_chapter_id', 'ref_entity_type', 'ref_entity_id']) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
  }
  // Auto-update char_count si tocamos body
  if (data.body !== undefined) {
    fields.push('char_count = ?');
    params.push((data.body || '').length);
  }
  // Marcar quién editó por último (humano vs IA) si se nos dice
  if (opts.actor === 'ai') {
    fields.push('last_ai_edit_at = CURRENT_TIMESTAMP');
  } else if (opts.actor === 'human') {
    fields.push('last_human_edit_at = CURRENT_TIMESTAMP');
  }
  if (!fields.length) return getChapter(id);
  params.push(id);
  await pool.query(`UPDATE master_chapters SET ${fields.join(', ')} WHERE id = ?`, params);
  return getChapter(id);
}

async function deleteChapter(id) {
  await pool.query('DELETE FROM master_chapters WHERE id = ?', [id]);
}

/* ── master_exports ──────────────────────────────────────────── */

async function listExports(projectId) {
  const [rows] = await pool.query(
    `SELECT id, master_doc_id, project_id, export_kind, call_id, form_template_id,
            language, state, pdf_path, page_count, size_bytes,
            generated_by_user_id, exported_at, marked_at, notes
     FROM master_exports
     WHERE project_id = ?
     ORDER BY exported_at DESC`,
    [projectId]
  );
  return rows;
}

async function getExport(id) {
  const [rows] = await pool.query('SELECT * FROM master_exports WHERE id = ?', [id]);
  return rows[0] || null;
}

async function createExport(data) {
  const id = genUUID();
  await pool.query(
    `INSERT INTO master_exports
       (id, master_doc_id, project_id, export_kind, call_id, form_template_id,
        language, state, pdf_path, page_count, size_bytes,
        generated_by_user_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.masterDocId, data.projectId, data.exportKind, data.callId || null,
     data.formTemplateId || null, data.language || 'es', data.state || 'borrador',
     data.pdfPath || null, data.pageCount || null, data.sizeBytes || null,
     data.generatedByUserId || null, data.notes || null]
  );
  return getExport(id);
}

async function markExportReady(id) {
  await pool.query(
    `UPDATE master_exports
     SET state = 'lista_para_presentar', marked_at = CURRENT_TIMESTAMP
     WHERE id = ?`, [id]
  );
  return getExport(id);
}

/* ── chat_threads + chat_messages ────────────────────────────── */

async function getOrCreateMainThread(projectId, userId, phase) {
  const phaseVal = phase || 'perfect';
  const [existing] = await pool.query(
    `SELECT * FROM chat_threads
     WHERE project_id = ? AND phase = ? AND is_archived = 0
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId, phaseVal]
  );
  if (existing[0]) return existing[0];

  const id = genUUID();
  await pool.query(
    `INSERT INTO chat_threads (id, project_id, user_id, phase, title)
     VALUES (?, ?, ?, ?, 'Hilo de proyecto')`,
    [id, projectId, userId, phaseVal]
  );
  const [rows] = await pool.query('SELECT * FROM chat_threads WHERE id = ?', [id]);
  return rows[0];
}

async function listThreads(projectId) {
  const [rows] = await pool.query(
    `SELECT * FROM chat_threads WHERE project_id = ? ORDER BY updated_at DESC`,
    [projectId]
  );
  return rows;
}

async function listMessages(threadId, { limit = 200, before } = {}) {
  const params = [threadId];
  let sql = 'SELECT * FROM chat_messages WHERE thread_id = ?';
  if (before) { sql += ' AND created_at < ?'; params.push(before); }
  sql += ' ORDER BY created_at ASC LIMIT ?';
  params.push(Number(limit));
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function appendMessage(threadId, msg) {
  const id = genUUID();
  await pool.query(
    `INSERT INTO chat_messages
       (id, thread_id, role, content, anchor_kind, anchor_id, anchor_label,
        applied_to_master, master_chapter_id, llm_model,
        llm_input_tokens, llm_output_tokens, llm_cached_tokens, cache_breakpoint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, threadId, msg.role, msg.content,
     msg.anchorKind || null, msg.anchorId || null, msg.anchorLabel || null,
     msg.appliedToMaster ? 1 : 0, msg.masterChapterId || null, msg.llmModel || null,
     msg.llmInputTokens || null, msg.llmOutputTokens || null,
     msg.llmCachedTokens || null, msg.cacheBreakpoint ? 1 : 0]
  );
  // Touch thread last_message_at
  await pool.query(
    `UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [threadId]
  );
  const [rows] = await pool.query('SELECT * FROM chat_messages WHERE id = ?', [id]);
  return rows[0];
}

/* ── call_form_templates + questions + mapping ───────────────── */

async function listFormTemplates(callId) {
  const [rows] = await pool.query(
    `SELECT * FROM call_form_templates WHERE call_id = ? AND is_active = 1
     ORDER BY budget_threshold_eur`,
    [callId]
  );
  return rows;
}

async function getFormTemplate(id) {
  const [rows] = await pool.query('SELECT * FROM call_form_templates WHERE id = ?', [id]);
  return rows[0] || null;
}

async function listFormQuestions(formTemplateId) {
  const [rows] = await pool.query(
    `SELECT * FROM call_form_questions WHERE form_template_id = ? ORDER BY sort_order`,
    [formTemplateId]
  );
  return rows;
}

async function listMappingForTemplate(formTemplateId) {
  const [rows] = await pool.query(
    `SELECT * FROM master_to_form_mapping WHERE form_template_id = ? ORDER BY sort_order`,
    [formTemplateId]
  );
  return rows;
}

/* ── CAG document sources ────────────────────────────────────── */
// Documentos con texto completo (documents.body_text) que se cargan al
// contexto del LLM en compile/diagnose. Dos orígenes:
//   1) Convocatoria (Admin → Plus Data → Call Documents): vinculados a la
//      intake_programs vía call_documents (v053). Compartidos por todos los
//      proyectos de esa convocatoria.
//   2) Proyecto (usuario subió en Writer → Relevancia, con doc_purpose='core').
//      Privados del proyecto.
// El RAG vectorizado vive en paralelo en document_chunks y lo consume el
// Writer cascade; aquí solo nos interesa el texto completo.

async function listProjectCagDocuments(projectId) {
  const [callDocs] = await pool.query(
    `SELECT d.id, d.title, d.file_type, d.body_text_chars, d.tokens_estimated,
            cd.doc_type AS source_kind, 'call' AS origin
     FROM projects p
     JOIN intake_programs ip ON ip.action_type = p.type
     JOIN call_documents cd ON cd.program_id = ip.id
     JOIN documents d ON d.id = cd.document_id
     WHERE p.id = ?
       AND d.body_text IS NOT NULL
       AND CHAR_LENGTH(d.body_text) > 0
     ORDER BY FIELD(cd.doc_type, 'call_document', 'programme_guide', 'annex', 'template', 'faq', 'other'),
              cd.sort_order, d.title`,
    [projectId]
  );
  const [projectDocs] = await pool.query(
    `SELECT d.id, d.title, d.file_type, d.body_text_chars, d.tokens_estimated,
            d.doc_type AS source_kind, 'project' AS origin
     FROM project_documents pd
     JOIN documents d ON d.id = pd.document_id
     WHERE pd.project_id = ?
       AND pd.doc_purpose = 'core'
       AND d.body_text IS NOT NULL
       AND CHAR_LENGTH(d.body_text) > 0
     ORDER BY pd.added_at`,
    [projectId]
  );
  return [...callDocs, ...projectDocs];
}

/**
 * Carga los documentos CAG de un proyecto con prioridad combinada + cap único.
 *
 * Política (modelo C — flexible):
 *   - Cap único de ~180k tokens (720k chars) para el bundle completo.
 *   - Si el usuario no sube nada, el admin puede ocupar todo el cap.
 *   - Si el usuario sube docs core en Writer → Relevancia, esos entran
 *     primero y desplazan a los del admin con sort_order más alto.
 *
 * Orden de prioridad:
 *   1. project_documents.doc_purpose='core' (más reciente primero) —
 *      el usuario manda en su proyecto.
 *   2. call_documents ordenados por sort_order ASC (admin decide).
 *
 * Dedupe por título normalizado (filtra los "(2)", "(3)" del mismo PDF).
 * El último doc que excede el cap se trunca, el resto se descarta.
 *
 * @param {string} projectId
 * @param {object} [opts]
 * @param {number} [opts.maxChars=200000]  ~50k tokens para el bundle.
 *   Tras añadir criterios FULL + reglas transversales + section_specific
 *   block + wp_explicit_items, el resto del contexto consume ~140k
 *   (design enriched ~78k, criteria ~15k, reglas ~3k, section ~3k,
 *   wp items ~3k, system+writer+interviews+chapter spec ~25k, output
 *   ~6k) → deja ~10k de margen sobre los 200k de Sonnet 4.
 */
async function loadProjectCagBundle(projectId, opts = {}) {
  const maxChars = opts.maxChars || 200_000;

  // Solo docs marcados explícitamente como CAG (sort_order <= 0). El resto
  // (sort_order >= 1, default) se queda en RAG y no consume budget.
  const [callRows] = await pool.query(
    `SELECT d.id, d.title, d.body_text, cd.doc_type AS source_kind, 'call' AS origin
     FROM projects p
     JOIN intake_programs ip ON ip.action_type = p.type
     JOIN call_documents cd ON cd.program_id = ip.id
     JOIN documents d ON d.id = cd.document_id
     WHERE p.id = ?
       AND d.body_text IS NOT NULL
       AND CHAR_LENGTH(d.body_text) > 0
       AND cd.sort_order <= 0
     ORDER BY cd.sort_order ASC, d.title`,
    [projectId]
  );
  const [ownRows] = await pool.query(
    `SELECT d.id, d.title, d.body_text, d.doc_type AS source_kind, 'project' AS origin
     FROM project_documents pd
     JOIN documents d ON d.id = pd.document_id
     WHERE pd.project_id = ?
       AND pd.doc_purpose = 'core'
       AND d.body_text IS NOT NULL
       AND CHAR_LENGTH(d.body_text) > 0
     ORDER BY pd.added_at DESC`,
    [projectId]
  );

  // Orden combinado: docs del usuario primero (recientes ganan), luego
  // call docs por sort_order (admin decide). Si el usuario sube algo
  // crítico, desplaza el último doc del admin que ya no quepa.
  const ordered = [...ownRows, ...callRows];

  const seenTitles = new Set();
  const out = [];
  let totalChars = 0;
  for (const d of ordered) {
    const titleKey = (d.title || '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').trim();
    if (titleKey && seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);

    const remaining = maxChars - totalChars;
    if (remaining <= 0) break;

    const body = d.body_text || '';
    if (body.length <= remaining) {
      out.push(d);
      totalChars += body.length;
    } else {
      out.push({
        ...d,
        body_text: body.slice(0, remaining) + `\n\n[…truncado a ${remaining} chars para encajar en el bundle CAG…]`,
        truncated: true,
      });
      totalChars = maxChars;
      break;
    }
  }
  return out;
}

/* ── Diagnoses ───────────────────────────────────────────────── */

async function listDiagnoses(masterDocId) {
  const [rows] = await pool.query(
    `SELECT * FROM master_diagnoses WHERE master_doc_id = ? ORDER BY started_at DESC`,
    [masterDocId]
  );
  return rows;
}

async function getDiagnosisWithItems(diagnosisId) {
  const [diag] = await pool.query('SELECT * FROM master_diagnoses WHERE id = ?', [diagnosisId]);
  if (!diag[0]) return null;
  const [items] = await pool.query(
    `SELECT * FROM master_diagnosis_items WHERE diagnosis_id = ? ORDER BY classification, severity DESC, sort_order`,
    [diagnosisId]
  );
  return { ...diag[0], items };
}

/* ── Quality context loader ──────────────────────────────────── */
/**
 * Carga TODO el contexto de calidad de la convocatoria del proyecto:
 *  - Reglas transversales (writing_style, additional_rules, ai_detection_rules)
 *    desde call_eligibility.
 *  - Eval tree completo (eval_sections → eval_questions → eval_criteria)
 *    con todos los campos narrativos (intent/elements/example_strong/avoid +
 *    general_context/writing_guidance/connects_from/connects_to/global_rule).
 *  - Indexado por código de subsección para inyectar el bloque concreto al
 *    compilar cada capítulo.
 *
 * Devuelve { transversal: {writing_style, additional_rules, ai_detection_rules},
 *            criteriaIndex: { '1.1': {...question + criteria}, '1.2': {...}, ... },
 *            criteriaFullText: 'cadena formateada con TODO el tree' }
 */
async function loadProjectQualityContext(projectId) {
  // Resolver el program_id real (intake_programs.id) vía type/action_type
  const [[link]] = await pool.query(
    `SELECT ip.id AS program_id, ip.action_type, ip.program_id AS public_code
       FROM projects p
       JOIN intake_programs ip ON ip.action_type = p.type
      WHERE p.id = ? LIMIT 1`,
    [projectId]
  );
  if (!link) {
    return {
      transversal: { writing_style: '', additional_rules: '', ai_detection_rules: '' },
      criteriaIndex: {},
      criteriaFullText: '(no se ha podido vincular el proyecto con una convocatoria conocida)',
      callCode: '',
    };
  }

  // 1. Reglas transversales por call
  const [[trans]] = await pool.query(
    `SELECT writing_style, additional_rules, ai_detection_rules
       FROM call_eligibility WHERE program_id = ?`,
    [link.program_id]
  );
  const transversal = {
    writing_style: (trans && trans.writing_style) || '',
    additional_rules: (trans && trans.additional_rules) || '',
    ai_detection_rules: (trans && trans.ai_detection_rules) || '',
  };

  // 2. Eval tree
  const [sections] = await pool.query(
    `SELECT id, title, form_ref, max_score, eval_notes, sort_order
       FROM eval_sections WHERE program_id = ? ORDER BY sort_order, form_ref`,
    [link.program_id]
  );
  const criteriaIndex = {};
  const treeChunks = [];

  for (const sec of sections) {
    const [questions] = await pool.query(
      `SELECT id, code, title, description, general_context, connects_from,
              connects_to, global_rule, word_limit, page_limit, writing_guidance,
              max_score, threshold
         FROM eval_questions WHERE section_id = ? ORDER BY sort_order, code`,
      [sec.id]
    );
    if (questions.length === 0) continue;

    const secHeader = `SECTION ${sec.form_ref || ''} — ${sec.title}` +
      (sec.eval_notes ? `\nSECTION NOTES: ${sec.eval_notes}` : '') +
      (sec.max_score ? ` (max score: ${sec.max_score})` : '');
    treeChunks.push('═'.repeat(70) + '\n' + secHeader + '\n' + '═'.repeat(70));

    for (const q of questions) {
      const [criteria] = await pool.query(
        `SELECT title, max_score, mandatory, priority, intent, elements,
                example_weak, example_strong, avoid, meaning, structure, relations, rules
           FROM eval_criteria WHERE question_id = ? ORDER BY id`,
        [q.id]
      );
      const blockParts = [];
      blockParts.push(`\n▸ ${q.code} — ${q.title}`);
      if (q.description) blockParts.push(`Description: ${q.description}`);
      if (q.general_context) blockParts.push(`GENERAL CONTEXT (qué busca el evaluador en esta pregunta):\n${q.general_context}`);
      if (q.writing_guidance) blockParts.push(`WRITING GUIDANCE (cómo escribir esta pregunta para esta call):\n${q.writing_guidance}`);
      if (q.connects_from) blockParts.push(`SE APOYA EN:\n${q.connects_from}`);
      if (q.connects_to) blockParts.push(`ALIMENTA A:\n${q.connects_to}`);
      if (q.global_rule) blockParts.push(`REGLA GLOBAL DE ESTA PREGUNTA:\n${q.global_rule}`);
      if (q.word_limit || q.page_limit) {
        const lims = [];
        if (q.word_limit) lims.push(`${q.word_limit} palabras`);
        if (q.page_limit) lims.push(`${q.page_limit} páginas`);
        blockParts.push(`LÍMITE OFICIAL (en formulario final): ${lims.join(' · ')}`);
      }
      if (criteria.length) {
        blockParts.push(`CRITERIOS DE EVALUACIÓN (${criteria.length}):`);
        criteria.forEach((c, i) => {
          const tags = [c.priority || '', c.mandatory ? 'OBLIGATORIO' : '', c.max_score ? `${c.max_score}pts` : ''].filter(Boolean).join(' · ');
          blockParts.push(`  ─ Criterio ${i+1}: ${c.title} [${tags}]`);
          if (c.intent)         blockParts.push(`     INTENCIÓN: ${c.intent}`);
          if (c.elements)       blockParts.push(`     ELEMENTOS: ${c.elements}`);
          if (c.example_strong) blockParts.push(`     EJEMPLO FUERTE: ${c.example_strong}`);
          if (c.example_weak)   blockParts.push(`     EJEMPLO DÉBIL (no hagas esto): ${c.example_weak}`);
          if (c.avoid)          blockParts.push(`     EVITAR: ${c.avoid}`);
        });
      }
      const block = blockParts.join('\n');
      criteriaIndex[q.code] = { question: q, criteria, block };
      treeChunks.push(block);
    }
  }

  return {
    transversal,
    criteriaIndex,
    criteriaFullText: treeChunks.join('\n\n') || '(no hay criterios cargados en Plus Data para esta convocatoria)',
    callCode: link.action_type || link.public_code || '',
  };
}

/* ── exports ─────────────────────────────────────────────────── */

module.exports = {
  // quality context
  loadProjectQualityContext,
  // master_documents
  listMasterDocumentsByProject,
  getMasterDocument,
  createMasterDocument,
  updateMasterDocument,
  deleteMasterDocument,
  // master_chapters
  listChapters,
  getChapter,
  createChapter,
  updateChapter,
  deleteChapter,
  // master_exports
  listExports,
  getExport,
  createExport,
  markExportReady,
  // chat
  getOrCreateMainThread,
  listThreads,
  listMessages,
  appendMessage,
  // form templates + mapping
  listFormTemplates,
  getFormTemplate,
  listFormQuestions,
  listMappingForTemplate,
  // CAG document sources (call + project core)
  listProjectCagDocuments,
  loadProjectCagBundle,
  // diagnoses
  listDiagnoses,
  getDiagnosisWithItems,
};
