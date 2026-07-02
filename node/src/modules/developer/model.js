const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');
const directoryApi = require('../../utils/directory-api');
const TASK_TEMPLATES = require('../../data/task-templates');

// ── Narrative format rules ────────────────────────────────────────────────
// Applied to every system prompt that produces text destined for the EACEA
// Form Part B. The official template renders narrative sections as plain
// prose inside boxes — markdown (tables, lists, headings, bold) survives the
// export as raw characters and gives the text away as AI-generated.
const NARRATIVE_FORMAT_RULES = `

══ FORMAT RULES (MANDATORY — TEXT GOES INTO THE OFFICIAL EACEA PDF FORM) ══
The output MUST be plain prose. Markdown does NOT render in the EACEA form — it appears as literal "|" pipes, "##" hashes, "**" stars and looks unprofessional/AI-generated.
- NO markdown tables. NEVER use "|" pipes or "---" separator rows. Compare options, methodologies, initiatives, or alternatives as flowing prose ("While ERDF focuses on top-down infrastructure and LEADER targets cycle-tourists, our project ..."). Never as a table.
- NO markdown headings (no "#", "##", "###"). The form already provides section headers.
- NO bold ("**text**"), italics ("*text*"), strikethrough, or backticks.
- NO bullet or numbered lists. NO lines starting with "- ", "* ", "• ", "→ ", "1.", "2.", "a)", "b)". Write continuous prose. If you must enumerate, weave items into a sentence ("first ...; second ...; third ...") or list them inside a paragraph separated by commas or semicolons.
- NO subheadings or internal section titles inside the answer.
- NO emojis, ASCII art, decorative symbols ("═", "──", "▪", "✓").
- Paragraphs separated by a single blank line — that is the only formatting allowed.
`;

// Activity.type → task-template category (mirrors public/js/intake-tasks.js TYPE_MAP)
const ACT_TYPE_TO_TEMPLATE_CAT = {
  mgmt: 'project_management',
  meeting: 'transnational_meeting',
  ltta: 'ltta_mobility',
  io: 'intellectual_output',
  me: 'multiplier_event',
  local_ws: 'local_workshop',
  campaign: 'dissemination',
  website: 'website',
  artistic: 'artistic_fees',
  equipment: 'equipment',
  goods: 'other_goods',
  consumables: 'consumables',
  other: 'other_costs',
  fstp: 'financial_support_third_parties',
};

function _findTemplateBySubtypeLabel(category, subtypeLabel) {
  const cat = TASK_TEMPLATES.find(c => c.category === category);
  if (!cat) return null;
  if (!subtypeLabel) return cat.subtypes[0] || null;
  const norm = String(subtypeLabel).toLowerCase().trim();
  return cat.subtypes.find(s => s.label.toLowerCase().trim() === norm) || cat.subtypes[0] || null;
}

function _findTemplateBySubtypeKey(category, subtypeKey) {
  const cat = TASK_TEMPLATES.find(c => c.category === category);
  if (!cat || !subtypeKey) return null;
  return cat.subtypes.find(s => s.key === subtypeKey) || null;
}

// Shorten description to ~10 words for table display.
// Prefers the first sentence; truncates with ellipsis if still too long.
function _shortDescription(text, maxWords = 10) {
  if (!text) return null;
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const firstSentence = cleaned.split(/(?<=[.!?])\s/)[0] || cleaned;
  const words = firstSentence.split(' ');
  if (words.length <= maxWords) return firstSentence;
  return words.slice(0, maxWords).join(' ').replace(/[,;:.]+$/, '') + '…';
}

// ============ PROJECT CONTEXT (read-only from intake) ============

async function getProjectContext(projectId, userId) {
  // Project
  const [projects] = await db.execute(
    'SELECT id, name, type, description, start_date, duration_months, eu_grant, cofin_pct, indirect_pct, status FROM projects WHERE id = ? AND user_id = ?',
    [projectId, userId]
  );
  if (!projects.length) return null;
  const project = projects[0];

  // Partners
  const [partners] = await db.execute(
    'SELECT id, name, city, country, role, order_index FROM partners WHERE project_id = ? ORDER BY order_index',
    [projectId]
  );

  // Context
  const [contexts] = await db.execute(
    'SELECT problem, target_groups, approach FROM intake_contexts WHERE project_id = ? LIMIT 1',
    [projectId]
  );

  // Work packages + activities
  const [wps] = await db.execute(
    'SELECT id, order_index, code, title, category, leader_id FROM work_packages WHERE project_id = ? ORDER BY order_index',
    [projectId]
  );
  for (const wp of wps) {
    const [acts] = await db.execute(
      'SELECT id, type, label, subtype, description, date_start, date_end FROM activities WHERE wp_id = ? ORDER BY order_index',
      [wp.id]
    );
    wp.activities = acts;
    const [ms] = await db.execute(
      'SELECT id, code, title, description, due_month, verification, sort_order FROM milestones WHERE work_package_id = ? ORDER BY sort_order, created_at',
      [wp.id]
    ).catch(() => [[]]);
    wp.milestones = ms || [];
    const [dels] = await db.execute(
      'SELECT id, code, title, description, type, dissemination_level, due_month, sort_order FROM deliverables WHERE work_package_id = ? ORDER BY sort_order, created_at',
      [wp.id]
    ).catch(() => [[]]);
    wp.deliverables = dels || [];
  }

  // Budget totals (from Calculator state if saved)
  const partnerIds = partners.map(p => p.id);
  let budget = { total: 0, byWP: [] };
  // Simple: count activities per WP as proxy
  budget.byWP = wps.map(wp => ({ code: wp.code, title: wp.title, activities: wp.activities.length }));

  return {
    project,
    partners,
    context: contexts[0] || null,
    wps,
    budget,
  };
}

// ============ FORM INSTANCE MANAGEMENT ============

async function getOrCreateInstance(projectId, userId) {
  // Check if instance already exists for this project
  const [existing] = await db.execute(
    'SELECT fi.*, ft.template_json FROM form_instances fi LEFT JOIN form_templates ft ON ft.id = fi.template_id WHERE fi.project_id = ? AND fi.user_id = ?',
    [projectId, userId]
  );
  if (existing.length) {
    return existing[0];
  }

  // Find the matching template via program
  const [project] = await db.execute('SELECT type FROM projects WHERE id = ?', [projectId]);
  if (!project.length) throw new Error('Project not found');

  const [programs] = await db.execute(
    'SELECT id, form_template_id FROM intake_programs WHERE action_type = ? LIMIT 1',
    [project[0].type]
  );

  let templateId = null;
  if (programs.length && programs[0].form_template_id) {
    templateId = programs[0].form_template_id;
  } else {
    // Fallback: use first active template
    const [templates] = await db.execute('SELECT id FROM form_templates WHERE active = 1 LIMIT 1');
    if (templates.length) templateId = templates[0].id;
  }

  // Create new instance
  const id = genUUID();
  await db.execute(
    `INSERT INTO form_instances (id, user_id, template_id, program_id, project_id, title, status)
     VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
    [id, userId, templateId, programs[0]?.id || null, projectId, 'Draft — ' + project[0].type]
  );

  const [created] = await db.execute(
    'SELECT fi.*, ft.template_json FROM form_instances fi LEFT JOIN form_templates ft ON ft.id = fi.template_id WHERE fi.id = ?',
    [id]
  );
  return created[0];
}

async function getInstance(instanceId, userId) {
  const [rows] = await db.execute(
    'SELECT fi.*, ft.template_json FROM form_instances fi LEFT JOIN form_templates ft ON ft.id = fi.template_id WHERE fi.id = ? AND fi.user_id = ?',
    [instanceId, userId]
  );
  return rows[0] || null;
}

async function updateInstanceStatus(instanceId, userId, status) {
  await db.execute(
    'UPDATE form_instances SET status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
    [status, instanceId, userId]
  );
}

// ============ FIELD VALUES ============

async function getFieldValues(instanceId) {
  // If a field has parallel rows (e.g. the diagnose import wrote 'sec_1_2'
  // alongside the Writer's '' row), the Writer's own row wins. Ordered so the
  // canonical row is processed LAST and overwrites the rest; non-empty
  // section_path only shows when there is no Writer row for that field.
  const [rows] = await db.execute(
    `SELECT field_id, section_path, value_text, value_json, updated_at
       FROM form_field_values WHERE instance_id = ?
      ORDER BY field_id, (COALESCE(section_path, '') = '') ASC, updated_at ASC`,
    [instanceId]
  );
  const values = {};
  for (const r of rows) {
    values[r.field_id] = {
      text: r.value_text || '',
      json: r.value_json ? (typeof r.value_json === 'string' ? JSON.parse(r.value_json) : r.value_json) : null,
      section: r.section_path,
      updated: r.updated_at,
    };
  }
  return values;
}

async function saveFieldValue(instanceId, fieldId, sectionPath, text, json) {
  // Atomic upsert SCOPED to the exact (instance_id, field_id, section_path) row.
  // The uq_instance_field key is on all three columns, so ON DUPLICATE KEY UPDATE
  // targets precisely this row and NEVER touches a parallel row with a different
  // section_path (e.g. content imported by the diagnose flow under 'sec_1_2').
  // section_path is never changed on update, so two rows can't be collapsed into
  // a key collision. json===undefined preserves value_json; null clears it.
  const sp = sectionPath || '';
  if (json === undefined) {
    await db.execute(
      `INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), updated_at = NOW()`,
      [genUUID(), instanceId, fieldId, sp, text || '']
    );
  } else {
    await db.execute(
      `INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, value_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), value_json = VALUES(value_json), updated_at = NOW()`,
      [genUUID(), instanceId, fieldId, sp, text || '', json ? JSON.stringify(json) : null]
    );
  }
}

async function saveFieldValuesBulk(instanceId, fields) {
  for (const f of fields) {
    await saveFieldValue(instanceId, f.field_id, f.section_path, f.text, f.json);
  }
}

// ============ EVAL CRITERIA (read-only) ============

async function getEvalCriteria(programType) {
  const [sections] = await db.execute(
    `SELECT es.id, es.title, es.sort_order, es.max_score
     FROM eval_sections es
     ORDER BY es.sort_order`
  );
  for (const sec of sections) {
    const [questions] = await db.execute(
      `SELECT id, title, code, weight, sort_order,
              description, general_context, connects_from, connects_to,
              global_rule, word_limit, page_limit, writing_guidance
       FROM eval_questions WHERE section_id = ? ORDER BY sort_order`,
      [sec.id]
    );
    for (const q of questions) {
      const [criteria] = await db.execute(
        `SELECT id, title, max_score, mandatory, priority,
                intent, elements, example_weak, example_strong, avoid
         FROM eval_criteria WHERE question_id = ? ORDER BY sort_order`,
        [q.id]
      );
      q.criteria = criteria;
    }
    sec.questions = questions;
  }
  return sections;
}

// ============ PREP STUDIO ============

async function getInterviewAnswers(projectId) {
  const [rows] = await db.execute(
    'SELECT question_key, question_text, answer_text, sort_order, tab FROM writer_interviews WHERE project_id = ? ORDER BY sort_order',
    [projectId]
  );
  return rows;
}

async function saveInterviewAnswer(projectId, userId, key, answer) {
  const [existing] = await db.execute(
    'SELECT id FROM writer_interviews WHERE project_id = ? AND question_key = ?',
    [projectId, key]
  );
  if (existing.length) {
    await db.execute(
      'UPDATE writer_interviews SET answer_text = ? WHERE project_id = ? AND question_key = ?',
      [answer, projectId, key]
    );
  }
  // If not exists, it was generated and not yet saved — create it
  else {
    await db.execute(
      'INSERT INTO writer_interviews (id, project_id, user_id, question_key, question_text, answer_text, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [genUUID(), projectId, userId, key, key, answer, 0]
    );
  }
}

async function generateInterviewQuestions(projectId, userId) {
  const ctx = await getProjectContext(projectId, userId);
  if (!ctx) return [];

  const projectText = buildProjectContext(ctx);

  // Build activity detail block
  const activityDetail = ctx.wps.map(wp => {
    return `${wp.code} ${wp.title}:\n` + (wp.activities || []).map(a =>
      `  - ${a.label}${a.subtype ? ' (' + a.subtype + ')' : ''}: ${a.description || 'No description'}`
    ).join('\n');
  }).join('\n\n');

  const system = `You are a senior proposal consultant preparing a coordinator for writing their Erasmus+ proposal. You need to extract the HUMAN stories, specific details, and creative vision that no AI can invent.

Your questions must:
- Be SPECIFIC to THIS project (reference partner names, cities, activities)
- Target the GAPS in the project data — where information is generic or missing
- Extract storytelling material: real situations, personal motivations, local context
- Uncover the "why" behind design choices
- Get practical details that make the proposal feel authentic

Each question must be assigned to a tab where it will appear in the Prep Studio:
- "consorcio" — questions about partners, why they were chosen, how they complement each other
- "presupuesto" — questions about cost-effectiveness, co-financing, resource allocation
- "relevancia" — questions about the origin story, problem, unique approach, innovation, EU value
- "actividades" — questions about expected results, impact measurement, methodology innovation

Output exactly 10 questions as a JSON array of objects:
[{"key":"origin_story","tab":"relevancia","question":"..."},{"key":"partner_choice","tab":"consorcio","question":"..."},...]

Distribute roughly: 3 relevancia, 3 consorcio, 2 actividades, 2 presupuesto.
Keys should be short snake_case identifiers. Questions should be in the language of the project coordinator (Spanish if the coordinator is from Spain).`;

  const user = `PROJECT DATA:\n${projectText}\n\nACTIVITY DETAILS:\n${activityDetail}\n\nGenerate 10 interview questions distributed across 4 tabs (consorcio, presupuesto, relevancia, actividades). Focus on what's MISSING or GENERIC in the current data.`;

  const result = await callAI(system, user, 'generate');

  // Parse JSON from response
  let questions = [];
  try {
    const match = result.match(/\[[\s\S]*\]/);
    questions = match ? JSON.parse(match[0]) : [];
  } catch { questions = []; }

  // Save questions to DB (with tab assignment)
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const tab = q.tab || 'relevancia'; // default to relevancia if AI omits tab
    const [existing] = await db.execute(
      'SELECT id FROM writer_interviews WHERE project_id = ? AND question_key = ?',
      [projectId, q.key]
    );
    if (!existing.length) {
      await db.execute(
        'INSERT INTO writer_interviews (id, project_id, user_id, question_key, question_text, answer_text, sort_order, tab) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)',
        [genUUID(), projectId, userId, q.key, q.question, i, tab]
      );
    }
  }

  return questions;
}

async function getResearchDocs(projectId) {
  const [rows] = await db.execute(
    `SELECT wrd.id, wrd.document_id, wrd.label, d.title, d.file_type, d.file_size_bytes, d.storage_path
     FROM writer_research_docs wrd
     JOIN documents d ON d.id = wrd.document_id
     WHERE wrd.project_id = ? AND d.status = 'active'
     ORDER BY wrd.sort_order`,
    [projectId]
  );
  return rows;
}

async function addResearchDoc(projectId, docData) {
  const docModel = require('../documents/model');
  // Save file
  const safeName = `research-${projectId.substring(0,8)}-${Date.now()}.${docData.ext}`;
  const storagePath = await docModel.saveFile(docData.buffer, safeName);
  // Create document record
  const doc = await docModel.createDocument({
    owner_type: 'project', owner_id: projectId, doc_type: 'research',
    title: docData.title, file_type: docData.ext,
    file_size_bytes: docData.buffer.length, storage_path: storagePath,
  });
  // Link to project
  const id = genUUID();
  await db.execute(
    'INSERT INTO writer_research_docs (id, project_id, document_id, label) VALUES (?, ?, ?, ?)',
    [id, projectId, doc.id, docData.title]
  );
  // Vectorize in background
  try {
    const { processDocument } = require('../../services/vectorize');
    const mimeMap = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    processDocument(doc.id, { storage_path: storagePath, file_type: mimeMap[docData.ext] || 'text/plain' });
  } catch (e) { console.error('[PrepStudio] vectorize error:', e.message); }
  return { id, document_id: doc.id, label: docData.title };
}

async function removeResearchDoc(projectId, docId) {
  await db.execute('DELETE FROM writer_research_docs WHERE project_id = ? AND document_id = ?', [projectId, docId]);
}

async function getGapAnalysis(projectId, userId) {
  const ctx = await getProjectContext(projectId, userId);
  if (!ctx) return { gaps: [] };

  const interviews = await getInterviewAnswers(projectId);
  const researchDocs = await getResearchDocs(projectId);
  const answeredCount = interviews.filter(i => i.answer_text && i.answer_text.trim().length > 20).length;

  const gaps = [];
  const strengths = [];

  // Check project data completeness
  if (ctx.context?.problem && ctx.context.problem.length > 200) strengths.push('Problema/necesidad bien descrito');
  else gaps.push({ area: 'Problema/necesidad', detail: 'El texto del problema es corto. Responde a la entrevista para enriquecerlo.', section: '1.1' });

  if (ctx.context?.approach && ctx.context.approach.length > 200) strengths.push('Enfoque/metodologia descrito');
  else gaps.push({ area: 'Enfoque/metodologia', detail: 'La descripcion del enfoque es breve. Anade mas detalle sobre como funcionara el proyecto.', section: '2.1.1' });

  if (ctx.context?.target_groups && ctx.context.target_groups.length > 100) strengths.push('Grupos destinatarios identificados');
  else gaps.push({ area: 'Grupos destinatarios', detail: 'Faltan detalles sobre los grupos destinatarios: perfiles, numeros, como los alcanzareis.', section: '1.2' });

  // Check activities
  const actsWithDesc = ctx.wps.reduce((s, wp) => s + (wp.activities || []).filter(a => a.description && a.description.length > 50).length, 0);
  const totalActs = ctx.wps.reduce((s, wp) => s + (wp.activities || []).length, 0);
  if (actsWithDesc >= totalActs * 0.8) strengths.push(`${actsWithDesc}/${totalActs} actividades con descripcion`);
  else gaps.push({ area: 'Descripciones de actividades', detail: `Solo ${actsWithDesc} de ${totalActs} actividades tienen descripcion detallada. Enriquece las descripciones en Intake.`, section: '4.2' });

  // Check partners
  if (ctx.partners.length >= 3) strengths.push(`${ctx.partners.length} socios en el consorcio`);
  else gaps.push({ area: 'Consorcio', detail: 'Pocos socios. KA3 requiere minimo 5 socios de 5 paises.', section: '2.2.1' });

  // Check research docs
  if (researchDocs.length >= 2) strengths.push(`${researchDocs.length} documentos de investigacion subidos`);
  else gaps.push({ area: 'Documentacion tematica', detail: 'Sube informes o estudios sobre tu tematica para fundamentar mejor la propuesta.', section: '1.1' });

  // Check interview
  if (answeredCount >= 5) strengths.push(`${answeredCount} preguntas de entrevista respondidas`);
  else if (interviews.length === 0) gaps.push({ area: 'Entrevista', detail: 'Genera las preguntas y responde al menos 5 para dar contexto humano a la propuesta.', section: 'all' });
  else gaps.push({ area: 'Entrevista', detail: `Solo ${answeredCount} de ${interviews.length} preguntas respondidas. Completa mas para mejorar la calidad.`, section: 'all' });

  // WP descriptions
  const wpsWithCat = ctx.wps.filter(wp => wp.category).length;
  if (wpsWithCat >= ctx.wps.length - 1) strengths.push('WPs con categorias asignadas');

  return { gaps, strengths, stats: { partners: ctx.partners.length, wps: ctx.wps.length, activities: totalActs, actsWithDesc, researchDocs: researchDocs.length, interviewAnswered: answeredCount, interviewTotal: interviews.length } };
}

// ============ AI SERVICE — Full Context Pipeline ============

// ── Gemini (cheap, for draft generation) ────────────────────
let geminiModel = null;
function getGemini() {
  if (geminiModel) return geminiModel;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  const genAI = new GoogleGenerativeAI(key);
  geminiModel = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
  return geminiModel;
}

async function callGemini(systemPrompt, userPrompt) {
  const model = getGemini();
  const result = await model.generateContent({
    systemInstruction: systemPrompt,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 1.0 },
  });
  return result.response.text();
}

// ── Claude (quality, for evaluation & improvement) ──────────
const { getClient, callClaude } = require('../../utils/ai');

// ── Smart router: Gemini for generation, Claude for quality ──
async function callAI(systemPrompt, userPrompt, purpose = 'generate') {
  // Use Gemini for draft generation (cheap, big context)
  // Use Claude for evaluation & improvement (higher quality)
  if (purpose === 'generate' && process.env.GEMINI_API_KEY && process.env.GEMINI_ENABLED === 'true') {
    try {
      return await callGemini(systemPrompt, userPrompt);
    } catch (err) {
      console.warn('[AI] Gemini failed, falling back to Claude:', err.message);
    }
  }
  return await callClaude(systemPrompt, userPrompt);
}

// ── Rich project context builder ────────────────────────────

function buildProjectContext(ctx) {
  const p = ctx.project;
  const context = ctx.context || {};

  // Detailed partner profiles
  const partnerBlock = ctx.partners.map((pt, i) => {
    const role = i === 0 ? 'COORDINATOR' : `Partner ${i + 1}`;
    return `${role}: ${pt.name} — ${pt.city}, ${pt.country} (${pt.role || 'partner'})`;
  }).join('\n');

  // Detailed WP + activities with descriptions and dates
  const wpBlock = ctx.wps.map(wp => {
    const leader = ctx.partners.find(p => p.id === wp.leader_id);
    let block = `\n${wp.code} — ${wp.title}`;
    if (wp.category) block += ` [Category: ${wp.category}]`;
    if (leader) block += ` | Leader: ${leader.name}`;
    for (const act of (wp.activities || [])) {
      block += `\n  • ${act.label || act.type}`;
      if (act.subtype) block += ` (${act.subtype})`;
      if (act.date_start && act.date_end) block += ` [${act.date_start} → ${act.date_end}]`;
      // El texto enriquecido del Diseño entra sin truncar (decisión arquitectura 2026-05-16).
      // El usuario invierte horas redactando descripciones largas — si las cortamos a 300
      // chars, el modelo nunca ve la sustancia que diferencia un 75 de un 90.
      if (act.description) block += `\n    ${act.description}`;
    }
    return block;
  }).join('\n');

  return `═══ PROJECT OVERVIEW ═══
Acronym: ${p.name}
Full title: ${p.description || p.name}
Programme: ${p.type || 'Erasmus+'}
Duration: ${p.duration_months || 24} months
Start date: ${p.start_date || 'TBD'}
EU Grant: €${Number(p.eu_grant || 500000).toLocaleString('en')}
Co-financing: ${p.cofin_pct || 80}%
Indirect costs: ${p.indirect_pct || 7}%

═══ CONSORTIUM (${ctx.partners.length} organisations) ═══
${partnerBlock}

═══ PROBLEM & NEEDS ═══
${context.problem || 'Not specified'}

═══ TARGET GROUPS ═══
${context.target_groups || 'Not specified'}

═══ APPROACH & METHODOLOGY ═══
${context.approach || 'Not specified'}

═══ WORK PLAN (${ctx.wps.length} Work Packages) ═══
${wpBlock}`;
}

// ── Enriched context builder (uses PIFs, budget, impacts) ───

async function buildEnrichedContext(projectId, userId) {
  const ctx = await getProjectContext(projectId, userId);
  if (!ctx) return '';

  const p = ctx.project;
  const context = ctx.context || {};

  // ── Consortium with adapted PIFs ──
  let consortiumBlock = '';
  for (let i = 0; i < ctx.partners.length; i++) {
    const pt = ctx.partners[i];
    const role = i === 0 ? 'COORDINATOR' : `Partner ${i + 1}`;
    consortiumBlock += `\n${role}: ${pt.name} — ${pt.city}, ${pt.country}`;

    if (pt.organization_id) {
      // Try to load adapted PIF for this project
      const [pifs] = await db.execute(
        `SELECT pp.custom_text, v.adapted_text
         FROM project_partner_pifs pp
         LEFT JOIN org_pif_variants v ON v.id = pp.variant_id
         WHERE pp.project_id = ? AND pp.partner_id = ?`,
        [projectId, pt.id]
      );
      const pifText = pifs[0]?.custom_text || pifs[0]?.adapted_text;

      if (pifText) {
        // PIF text sin truncar — el PIF adaptado del partner es contexto valioso para
        // justificar capacidades y roles en el writer (arquitectura 2026-05-16).
        consortiumBlock += `\n  Profile: ${pifText}`;
      } else {
        // Fallback to generic org description
        const [orgs] = await db.execute('SELECT description, activities_experience FROM organizations WHERE id = ?', [pt.organization_id]);
        // Profile sin truncar — la descripción enriquecida de la org es contexto valioso.
        if (orgs[0]?.description) consortiumBlock += `\n  Profile: ${orgs[0].description}`;
      }

      // Key staff
      const [staff] = await db.execute('SELECT name, role, skills_summary FROM org_key_staff WHERE organization_id = ? LIMIT 5', [pt.organization_id]);
      if (staff.length) {
        consortiumBlock += `\n  Key staff: ${staff.map(s => `${s.name} (${s.role}${s.skills_summary ? ': ' + s.skills_summary.substring(0, 80) : ''})`).join('; ')}`;
      }

      // Past EU projects: solo los seleccionados por el usuario en el sub-tab
      // Consorcio. Identifiers están en project_partner_eu_projects; los datos
      // vienen del directory-api (cache LRU 60s evita repetir llamadas).
      const [selectedRows] = await db.execute(
        'SELECT project_identifier FROM project_partner_eu_projects WHERE project_id = ? AND partner_id = ?',
        [projectId, pt.id]
      );
      if (selectedRows.length) {
        const [orgRows] = await db.execute('SELECT oid, pic FROM organizations WHERE id = ?', [pt.organization_id]);
        const lookupId = orgRows[0] && (orgRows[0].oid || orgRows[0].pic);
        if (lookupId) {
          try {
            const resp = await directoryApi.getEntityProjects(lookupId, { limit: 300 });
            const list = Array.isArray(resp && resp.projects) ? resp.projects : [];
            const wanted = new Set(selectedRows.map(r => r.project_identifier));
            const picked = list.filter(pr => wanted.has(pr.project_identifier));
            if (picked.length) {
              consortiumBlock += `\n  EU projects: ${picked.map(ep => `${ep.project_title || 'Untitled'} (${ep.funding_year}, ${ep.role})`).join('; ')}`;
            }
          } catch (_) { /* silencioso */ }
        }
      }
    }
  }

  // ── Budget summary ──
  let budgetBlock = 'Not configured';
  const budgetData = await getPrepPresupuesto(projectId);
  if (budgetData) {
    const bens = budgetData.beneficiaries || [];
    const totalGrant = bens.reduce((s, bn) => s + (bn.total || 0), 0);
    budgetBlock = `Total EU Grant: €${totalGrant.toLocaleString('en')}`;
    if (bens.length) {
      budgetBlock += `\nPer partner: ${bens.map(bn => `${bn.name}: €${(bn.total || 0).toLocaleString('en')}${bn.is_coordinator ? ' (coordinator)' : ''}`).join(', ')}`;
      budgetBlock += `\nCategories: A(Staff)=€${bens.reduce((s, b) => s + (b.cat_a || 0), 0).toLocaleString('en')}, B(Subcontr.)=€${bens.reduce((s, b) => s + (b.cat_b || 0), 0).toLocaleString('en')}, C(Other)=€${bens.reduce((s, b) => s + (b.cat_c || 0), 0).toLocaleString('en')}, D(Support)=€${bens.reduce((s, b) => s + (b.cat_d || 0), 0).toLocaleString('en')}`;
    }
    const wps = budgetData.work_packages || [];
    if (wps.length) {
      budgetBlock += `\nPer WP: ${wps.map(wp => `${wp.label}: €${(wp.total || 0).toLocaleString('en')}`).join(', ')}`;
    }
  }

  // ── Activities with tasks and deliverables ──
  const actData = await getPrepActividades(projectId);
  let actBlock = '';
  for (const wp of (actData.wps || [])) {
    const leader = ctx.partners.find(p => p.id === wp.leader_id);
    actBlock += `\n${wp.code} — ${wp.title}`;
    if (leader) actBlock += ` (Leader: ${leader.name})`;
    // Summary y description del Diseño entran sin truncar (arquitectura 2026-05-16).
    // Si el usuario escribe párrafos ricos en el campo Summary del WP o en la descripción
    // de una actividad, lo recibe el modelo entero. Los truncados anteriores (400/250)
    // descartaban el 95-99% del texto enriquecido y saboteaban el ciclo de iteración.
    if (wp.summary) actBlock += `\n  Summary: ${wp.summary}`;
    for (const act of (wp.activities || [])) {
      actBlock += `\n  • ${act.label || act.type}`;
      if (act.description) actBlock += `: ${act.description}`;
      if (act.date_start) actBlock += ` [${act.date_start} → ${act.date_end || '?'}]`;
      for (const t of (act.tasks || [])) {
        actBlock += `\n    - ${t.title}`;
        if (t.description) actBlock += `\n      ${t.description}`;
        if (t.deliverable) actBlock += ` → Deliverable: ${t.deliverable}`;
        if (t.milestone) actBlock += ` | Milestone: ${t.milestone}`;
        if (t.kpi) actBlock += ` | KPI: ${t.kpi}`;
      }
    }
  }

  // ── Interview answers grouped by tab ──
  const interviews = await getInterviewAnswers(projectId);
  const answered = interviews.filter(i => i.answer_text && i.answer_text.trim().length > 10);
  let interviewBlock = '';
  if (answered.length) {
    const byTab = {};
    for (const a of answered) {
      const tab = a.tab || 'relevancia';
      if (!byTab[tab]) byTab[tab] = [];
      byTab[tab].push(a);
    }
    for (const [tab, qs] of Object.entries(byTab)) {
      interviewBlock += `\n[${tab.toUpperCase()}]`;
      for (const a of qs) {
        interviewBlock += `\nQ: ${a.question_text}\nA: ${a.answer_text}\n`;
      }
    }
  }

  return `═══ PROJECT OVERVIEW ═══
Acronym: ${p.name}
Full title: ${p.description || p.name}
Programme: ${p.type || 'Erasmus+'}
Duration: ${p.duration_months || 24} months
Start date: ${p.start_date || 'TBD'}
EU Grant: €${Number(p.eu_grant || 500000).toLocaleString('en')}
Co-financing: ${p.cofin_pct || 80}%

═══ CONSORTIUM (${ctx.partners.length} organisations — detailed profiles) ═══
${consortiumBlock}

═══ PROBLEM & NEEDS ═══
${context.problem || 'Not specified'}

═══ TARGET GROUPS ═══
${context.target_groups || 'Not specified'}

═══ APPROACH & METHODOLOGY ═══
${context.approach || 'Not specified'}

═══ BUDGET ═══
${budgetBlock}

═══ ACTIVITIES, DELIVERABLES & IMPACTS ═══
${actBlock || 'No activities defined'}

${interviewBlock ? `═══ COORDINATOR'S OWN WORDS ═══${interviewBlock}` : ''}`;
}

// ── Smart RAG query builder per section ───────────────────────

async function buildSectionRagQuery(sectionId, sectionTitle, projectId) {
  // Load project context for enriching the query
  let projectName = '', problem = '', approach = '', countries = '';
  if (projectId) {
    try {
      const [pRows] = await db.execute('SELECT name, description FROM projects WHERE id = ?', [projectId]);
      const [cRows] = await db.execute('SELECT problem, target_groups, approach FROM intake_contexts WHERE project_id = ? LIMIT 1', [projectId]);
      const [ptRows] = await db.execute('SELECT DISTINCT country FROM partners WHERE project_id = ? AND country IS NOT NULL', [projectId]);
      projectName = pRows[0]?.name || '';
      problem = (cRows[0]?.problem || '').substring(0, 200);
      approach = (cRows[0]?.approach || '').substring(0, 200);
      countries = ptRows.map(r => r.country).join(', ');
    } catch (e) { /* non-critical, fall back to generic query */ }
  }

  // Section-specific query strategies
  const queryMap = {
    'summary_text': `${projectName} project summary objectives methodology expected results`,
    's1_1_text': `background context ${problem} challenges statistics European policy ${projectName}`,
    's1_2_text': `needs analysis target groups ${problem} evidence gaps ${countries} specific objectives indicators`,
    's1_3_text': `innovation added value complementarity existing solutions state of art European cooperation ${approach} ${projectName}`,
    's2_1_1_text': `methodology concept approach activities implementation ${approach} pedagogical framework`,
    's2_1_2_text': `project management quality assurance monitoring evaluation risk management coordination`,
    's2_1_4_text': `cost effectiveness financial management budget allocation value for money resources`,
    's2_2_1_text': `consortium partnership cooperation complementary expertise ${countries} partner selection`,
    's2_2_2_text': `consortium management decision making governance communication conflict resolution`,
    's3_1_text': `impact ambition expected results target groups outcomes long-term change ${problem}`,
    's3_2_text': `dissemination communication visibility strategy stakeholders multiplier exploitation`,
    's3_3_text': `sustainability continuation mainstreaming financial sustainability after funding institutionalisation`,
    's4_1_text': `work plan overview work packages timeline implementation schedule milestones`,
    's4_2_text': `work packages activities deliverables resources timing responsibilities`,
    's5_1_text': `ethics data protection GDPR informed consent vulnerable groups ethical considerations`,
    's5_2_text': `security classified information EU classified sensitive data protection`,
  };

  return queryMap[sectionId] || sectionTitle;
}

// ── RAG: Retrieve relevant document chunks ──────────────────

async function retrieveRelevantChunks(query, programId, topK = 8) {
  const { generateEmbedding, cosineSimilarity } = require('../../services/embeddings');

  // Get all chunks from program documents
  const [chunks] = await db.execute(
    `SELECT dc.content, dc.embedding, d.title as doc_title
     FROM document_chunks dc
     JOIN documents d ON d.id = dc.document_id
     JOIN document_programs dp ON dp.document_id = d.id
     WHERE dp.program_id = ?`,
    [programId]
  );

  if (!chunks.length) return '';

  // Generate query embedding
  const queryEmb = await generateEmbedding(query);

  // Score and sort
  const scored = chunks.map(c => {
    const emb = typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding;
    return { content: c.content, doc: c.doc_title, score: cosineSimilarity(queryEmb, emb) };
  }).sort((a, b) => b.score - a.score).slice(0, topK);

  return scored.map(c => `[${c.doc}] ${c.content}`).join('\n\n');
}

// ── RAG: Retrieve chunks from user's research documents ─────

async function retrieveResearchChunks(query, projectId, topK = 6) {
  const { generateEmbedding, cosineSimilarity } = require('../../services/embeddings');
  // Get research doc IDs for this project
  const [docs] = await db.execute(
    'SELECT document_id FROM writer_research_docs WHERE project_id = ?', [projectId]
  );
  if (!docs.length) return '';
  const docIds = docs.map(d => d.document_id);
  const ph = docIds.map(() => '?').join(',');
  const [chunks] = await db.execute(
    `SELECT dc.content, dc.embedding, d.title as doc_title FROM document_chunks dc JOIN documents d ON d.id = dc.document_id WHERE dc.document_id IN (${ph})`, docIds
  );
  if (!chunks.length) return '';
  const queryEmb = await generateEmbedding(query);
  const scored = chunks.map(c => {
    const emb = typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding;
    return { content: c.content, doc: c.doc_title, score: cosineSimilarity(queryEmb, emb) };
  }).sort((a, b) => b.score - a.score).slice(0, topK);
  return scored.map(c => `[${c.doc}] ${c.content}`).join('\n\n');
}

// ── Get writing rules from call_eligibility ─────────────────

async function getWritingRules(programId) {
  const [rows] = await db.execute(
    'SELECT writing_style, ai_detection_rules FROM call_eligibility WHERE program_id = ?',
    [programId]
  );
  return rows[0] || { writing_style: null, ai_detection_rules: null };
}

// ── Get eval guidance for a specific section ────────────────

// Resolve a per-WP dynamic field id to its base field id + wpId. Handles both
// conventions: EACEA single-narrative 's4_2_wp_<id>' and the NA per-field
// '<baseFieldId>__wp__<id>'. Returns null for non-WP fields.
function parseWpField(fieldId) {
  if (typeof fieldId !== 'string') return null;
  if (fieldId.startsWith('s4_2_wp_')) return { base: 's4_2_text', wpId: fieldId.slice('s4_2_wp_'.length) };
  const m = fieldId.match(/^(.+)__wp__(.+)$/);
  if (m) return { base: m[1], wpId: m[2] };
  return null;
}

// Compose the guidance string + mandatory constraints + limits from a set of
// eval_questions (already loaded) and their criteria. Shared by the data-driven
// (field_id) path and the legacy EACEA (form_ref) path.
async function composeEvalGuidance(secTitle, secMax, questions) {
  const qIds = questions.map(q => q.id);
  const criteriaByQ = {};
  if (qIds.length) {
    const placeholders = qIds.map(() => '?').join(',');
    const [criteria] = await db.execute(
      `SELECT question_id, title, priority, mandatory,
              intent, elements, example_strong, avoid, sort_order
       FROM eval_criteria
       WHERE question_id IN (${placeholders})
       ORDER BY question_id, FIELD(priority, 'alta', 'media', 'baja'), sort_order`,
      qIds
    );
    for (const c of criteria) {
      (criteriaByQ[c.question_id] = criteriaByQ[c.question_id] || []).push(c);
    }
  }

  let guidance = `EVALUATION SECTION: ${secTitle}`;
  if (secMax > 0) guidance += ` (max ${secMax} points)`;

  const mandatoryConstraints = [];
  let wordLimit = null;
  let charLimit = null;
  let title = null;

  for (const q of questions) {
    if (!title) title = q.code ? `${q.code} ${q.title || ''}`.trim() : (q.title || null);
    guidance += `\n\n### Question ${q.code}: ${q.title}`;
    if (q.general_context) {
      guidance += `\n\nCONTEXT — what the evaluator looks for:\n${q.general_context}`;
    }
    if (q.connects_from) {
      guidance += `\n\nGROUND THIS ANSWER IN (prior sections you must respect):\n${q.connects_from}`;
    }
    if (q.connects_to) {
      guidance += `\n\nDOWNSTREAM SECTIONS WILL BUILD ON THIS:\n${q.connects_to}\nWhat you commit here will be reused later — be consistent and concrete.`;
    }
    if (q.global_rule) {
      mandatoryConstraints.push(`[${q.code}] ${q.global_rule}`);
    }
    if (!wordLimit && q.word_limit) wordLimit = q.word_limit;
    if (!charLimit && q.char_limit) charLimit = q.char_limit;

    const crits = criteriaByQ[q.id] || [];
    if (crits.length) {
      guidance += `\n\nCRITERIA THE EVALUATOR SCORES (priority order):`;
      for (const c of crits) {
        const pri = c.priority ? ` [${c.priority}]` : '';
        const star = c.mandatory ? ' ★MANDATORY' : '';
        guidance += `\n\n  • ${c.title}${pri}${star}`;
        if (c.intent) guidance += `\n    INTENT — ${c.intent}`;
        if (c.elements) guidance += `\n    MUST INCLUDE — ${c.elements}`;
        if (c.example_strong) guidance += `\n    STRONG EXAMPLE — ${c.example_strong}`;
        if (c.avoid) guidance += `\n    AVOID — ${c.avoid}`;
      }
    }
  }

  return { guidance, mandatoryConstraint: mandatoryConstraints.join('\n'), wordLimit, charLimit, title };
}

// programId scopes the lookup so every call gets ITS OWN criteria (independent
// evaluation per convocatoria). For new forms (KA220 NA etc.) the binding is
// data-driven via eval_questions.field_id; the EACEA refMap remains as fallback.
async function getEvalGuidanceForSection(sectionFieldId, programId = null) {
  const empty = { guidance: '', mandatoryConstraint: '', wordLimit: null, charLimit: null, title: null };

  // Per-WP dynamic fields resolve to a shared base question.
  const wp = parseWpField(sectionFieldId);
  const lookupFieldId = wp ? wp.base : sectionFieldId;

  // ── Data-driven path: match eval_questions.field_id, scoped to the program ──
  if (programId) {
    const [qRows] = await db.execute(
      `SELECT q.id, q.code, q.title, q.description, q.general_context, q.connects_from,
              q.connects_to, q.global_rule, q.word_limit, q.char_limit,
              s.title AS sec_title, s.max_score AS sec_max
         FROM eval_questions q JOIN eval_sections s ON s.id = q.section_id
        WHERE q.field_id = ? AND s.program_id = ? LIMIT 1`,
      [lookupFieldId, programId]
    );
    if (qRows.length) {
      return composeEvalGuidance(qRows[0].sec_title, qRows[0].sec_max, [qRows[0]]);
    }
  }

  // ── Legacy fallback: EACEA refMap (form_ref) ──
  const refMap = {
    's1_1_text': 'sec_1', 's1_2_text': 'sec_1', 's1_3_text': 'sec_1',
    's2_1_1_text': 'sec_2_1', 's2_1_2_text': 'sec_2_1', 's2_1_4_text': 'sec_2_1',
    's2_2_1_text': 'sec_2_2', 's2_2_2_text': 'sec_2_2',
    's3_1_text': 'sec_3', 's3_2_text': 'sec_3', 's3_3_text': 'sec_3',
    's4_1_text': 'sec_4', 's4_2_text': 'sec_4',
    's5_1_text': 'sec_5', 's5_2_text': 'sec_5',
    'summary_text': 'summary',
  };
  const formRef = refMap[lookupFieldId];
  if (!formRef) return empty;

  // Get section (program-scoped when programId known, to keep calls independent)
  const [sections] = await db.execute(
    programId
      ? 'SELECT id, title, max_score FROM eval_sections WHERE form_ref = ? AND program_id = ?'
      : 'SELECT id, title, max_score FROM eval_sections WHERE form_ref = ?',
    programId ? [formRef, programId] : [formRef]
  );
  if (!sections.length) return empty;
  const sec = sections[0];

  // Derive target question code from field id (s2_1_1_text → "2.1.1", per-WP → "4.2")
  let targetCode = null;
  if (wp) {
    targetCode = '4.2';
  } else {
    const m = lookupFieldId.match(/^s(\d+(?:_\d+)*)_text$/);
    if (m) targetCode = m[1].replace(/_/g, '.');
  }

  const [allQuestions] = await db.execute(
    `SELECT id, code, title, description, general_context, connects_from, connects_to,
            global_rule, word_limit, char_limit, page_limit
     FROM eval_questions WHERE section_id = ? ORDER BY sort_order`,
    [sec.id]
  );
  if (!allQuestions.length) return empty;

  const focused = targetCode ? allQuestions.filter(q => q.code === targetCode) : [];
  const useQuestions = focused.length ? focused : allQuestions;

  return composeEvalGuidance(sec.title, sec.max_score, useQuestions);
}

// ── Work-package content selection ──────────────────────────
// Which Intake WPs get the per-WP CONTENT questions (objectives, results,
// indicators, tasks, activities…). The management WP (WP1) is excluded because
// the NA form models management as a fixed section (WORK PACKAGE 1). Heuristic:
// drop WPs flagged as management; if none are flagged, drop the first by order.
// MUST stay identical to the frontend (public/js/developer.js) so field ids match.
function selectContentWps(wps) {
  if (!wps || !wps.length) return [];
  const isMgmt = w => /manage|coordinat|gesti[oó]n|administ/i.test([w.category, w.code, w.title].filter(Boolean).join(' '));
  const flagged = wps.filter(isMgmt);
  if (flagged.length) return wps.filter(w => !isMgmt(w));
  const sorted = [...wps].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  return sorted.slice(1);
}

// Flatten a form template into the ordered list of writable fields, expanding
// per-WP sections over the content WPs. Returns [{ fieldId, label }].
function buildTemplateFieldList(tmpl, wps) {
  const out = [];
  const contentWps = selectContentWps(wps || []);
  for (const sec of (tmpl.sections || [])) {
    const groups = sec.subsections_groups
      ? sec.subsections_groups.flatMap(g => (g.subsections || []))
      : (sec.subsections || []);
    if (sec.per_wp) {
      contentWps.forEach(wp => {
        const code = wp.code || ('WP' + ((wp.order_index || 0) + 1));
        for (const sub of groups) {
          for (const f of (sub.fields || [])) {
            if (f.type === 'textarea' || f.type === 'table') {
              out.push({ fieldId: `${f.id}__wp__${wp.id}`, label: `${code} · ${sub.number} ${sub.title}` });
            }
          }
        }
      });
      continue;
    }
    for (const sub of groups) {
      for (const f of (sub.fields || [])) {
        if (f.type === 'textarea' || f.type === 'table') {
          out.push({ fieldId: f.id, label: `${sub.number} ${sub.title}` });
        }
      }
    }
  }
  if (tmpl.project_summary) {
    out.push({ fieldId: 'summary_text', label: 'Project Summary' });
  }
  return out;
}

// ── Get previously generated sections for consistency ───────

async function getPreviousSections(instanceId, currentFieldId) {
  const values = await getFieldValues(instanceId);

  // Data-driven path: order + labels come from the instance's actual form
  // template, so any form (EACEA, KA220 NA, future calls) works without a map.
  try {
    const [instRows] = await db.execute(
      'SELECT fi.project_id, ft.template_json FROM form_instances fi LEFT JOIN form_templates ft ON ft.id = fi.template_id WHERE fi.id = ?',
      [instanceId]
    );
    const inst = instRows[0];
    if (inst && inst.template_json) {
      const tmpl = typeof inst.template_json === 'string' ? JSON.parse(inst.template_json) : inst.template_json;
      let wps = [];
      if (inst.project_id) {
        const [w] = await db.execute(
          'SELECT id, code, title, order_index, category FROM work_packages WHERE project_id = ? ORDER BY order_index',
          [inst.project_id]
        );
        wps = w;
      }
      const ordered = buildTemplateFieldList(tmpl, wps);
      if (ordered.length) {
        let context = '';
        for (const f of ordered) {
          if (f.fieldId === currentFieldId) break;
          const val = values[f.fieldId];
          if (val && val.text && val.text.length > 50) {
            context += `\n--- ${f.label || f.fieldId} ---\n${val.text}\n`;
          }
        }
        return context;
      }
    }
  } catch (e) { /* fall back to the legacy EACEA static order */ }

  const order = ['summary_text', 's1_1_text', 's1_2_text', 's1_3_text',
    's2_1_1_text', 's2_1_2_text', 's2_1_4_text', 's2_2_1_text', 's2_2_2_text',
    's3_1_text', 's3_2_text', 's3_3_text', 's4_1_text', 's4_2_text'];

  const sectionNames = {
    'summary_text': 'Project Summary', 's1_1_text': '1.1 Background',
    's1_2_text': '1.2 Needs & Objectives', 's1_3_text': '1.3 Innovation & EU Value',
    's2_1_1_text': '2.1.1 Methodology', 's2_1_2_text': '2.1.2 Management & QA',
    's2_1_4_text': '2.1.4 Cost Effectiveness', 's2_2_1_text': '2.2.1 Consortium Setup',
    's2_2_2_text': '2.2.2 Consortium Management', 's3_1_text': '3.1 Impact',
    's3_2_text': '3.2 Dissemination', 's3_3_text': '3.3 Sustainability',
    's4_1_text': '4.1 Work Plan', 's4_2_text': '4.2 Work Packages Detail',
  };

  let context = '';
  for (const fid of order) {
    if (fid === currentFieldId) break;
    const val = values[fid];
    if (val && val.text && val.text.length > 50) {
      context += `\n--- ${sectionNames[fid] || fid} ---\n${val.text}\n`;
    }
  }
  return context;
}

// Strip markdown / list / table artefacts from AI output so the text can be
// pasted directly into the EACEA PDF form. Safety net in case the model
// ignores the OUTPUT FORMAT instructions in the prompt.
function sanitizeProposalText(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;

  // Drop markdown table blocks (lines with pipes + a separator line with ---)
  out = out.replace(/(^|\n)\s*\|[^\n]*\|[^\n]*(\n\s*\|[\s\-:|]+\|[^\n]*)?(\n\s*\|[^\n]*\|[^\n]*)+/g, '$1');
  // Any remaining single pipe-framed line
  out = out.replace(/^\s*\|[^\n]*\|\s*$/gm, '');

  // Strip heading markers at start of line: #, ##, ###…
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');

  // Remove ** bold and * italics wrappers, keep the inner text
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '$1');
  out = out.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  // Remove __ bold / _ italics
  out = out.replace(/__([^_\n]+?)__/g, '$1');
  out = out.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,;:!?]|$)/g, '$1$2');

  // Strip blockquote markers
  out = out.replace(/^\s{0,3}>\s?/gm, '');

  // Turn bullet / numbered list markers into prose — drop the marker, keep content
  out = out.replace(/^\s*[-*•▪→]\s+/gm, '');
  out = out.replace(/^\s*\d{1,2}[.)]\s+/gm, '');
  out = out.replace(/^\s*[a-z][.)]\s+/gm, '');

  // Remove decorative rules / separators
  out = out.replace(/^\s*[═─━_*=\-]{3,}\s*$/gm, '');

  // Backticks (inline and fenced)
  out = out.replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z]*\n?|```/g, ''));
  out = out.replace(/`([^`\n]+)`/g, '$1');

  // Collapse 3+ blank lines to 2
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

// ── Main generation function ────────────────────────────────

// ── Editable prompt blocks (defaults; overridable via prompt_blocks table) ──
const ANTIPATTERNS_DEFAULT = `══ WHAT MAKES A BAD PROPOSAL (AVOID ALL OF THIS) ══
- Starting with "The [project name] project addresses..." — find a different, unexpected opening
- Listing EU policy frameworks without connecting them to YOUR specific work
- Using "innovative" without explaining WHAT is new and WHY existing approaches failed
- Writing "the consortium brings together complementary expertise" — instead, tell a STORY about why each partner matters
- Generic percentages ("20% of European youth") without connecting to YOUR target communities
- Describing WPs as a bureaucratic list instead of showing how activities flow into each other
- Every paragraph having the same length and structure
- Buzzword chains: "comprehensive, sustainable, innovative, transnational framework"
- Passive voice: "activities will be implemented" — use active: "CESIE leads the pilot workshops in Palermo"
- Round numbers for everything (500 participants, 120 trained, 2000 reached) — use real estimates

══ WHAT MAKES A WINNING PROPOSAL (DO ALL OF THIS) ══
- Open with a REAL story, a specific problem, or a provocative fact about YOUR communities
- Name specific neighbourhoods, schools, youth centres — not just cities
- Show the HUMAN dimension: who are the young people? what do they face daily?
- Describe your methodology as a JOURNEY, not a checklist
- Each partner should appear with their UNIQUE contribution, not interchangeable roles
- Include ONE surprising or counterintuitive element that shows original thinking
- Reference prior experience with SPECIFIC lessons learned, not generic "track record"
- Use numbers that come from YOUR needs assessment, not EU-level statistics
- Write as if explaining to a colleague, not a bureaucrat
- Vary paragraph length dramatically: one 5-line paragraph, then a 2-line paragraph, then 4 lines`;

const OUTPUT_FORMAT_DEFAULT = `══ OUTPUT FORMAT (MANDATORY — THIS TEXT GOES INTO AN OFFICIAL EACEA PDF FORM) ══
The output MUST be plain prose. Pasting markdown into the EACEA form gives it away as AI-generated and looks unprofessional.
- NO markdown at all. NO "**bold**", NO "*italics*", NO "##" or "#" headings, NO "> quotes", NO backticks.
- NO markdown tables (pipes "|" or "---" separators). If you need to compare things, do it in prose ("Unlike ERDF which is top-down, our approach is bottom-up...").
- NO bullet lists or numbered lists. NO lines starting with "- ", "* ", "• ", "→ ", "1.", "2.", "a)", "b)", etc. Write it as continuous prose.
- NO subheadings or internal section titles (you are writing the BODY of one single section).
- NO emojis, NO ASCII art, NO decorative symbols ("═", "──", "▪").
- Paragraphs separated by a single blank line, that's all the formatting you get.`;

// ── Prompt block resolver: program-specific row wins, else global, else fallback ──
async function getPromptBlock(name, programId, fallback) {
  try {
    const [rows] = await db.execute(
      `SELECT content FROM prompt_blocks
       WHERE name = ? AND active = 1 AND (program_id = ? OR program_id IS NULL)
       ORDER BY (program_id IS NULL) ASC LIMIT 1`,
      [name, programId || null]
    );
    if (rows.length && rows[0].content) return rows[0].content;
  } catch (_) { /* table may not exist in older envs */ }
  return fallback;
}

// ── Canonical facts: hard facts DERIVED at runtime (never duplicated) +
//    soft facts that were validated to 'canonical'. This block is injected
//    first in the user prompt so the model reads invariant facts (WP leaders,
//    budget, partners) instead of re-deciding them per section. ──
async function buildCanonicalFacts(projectId) {
  if (!projectId) return '';
  const parts = [];

  const [projRows] = await db.execute(
    'SELECT name, description, type, duration_months, start_date, eu_grant, cofin_pct FROM projects WHERE id = ?',
    [projectId]
  ).catch(() => [[]]);
  const p = projRows && projRows[0];
  if (p) {
    // description can hold the full project essay — only treat it as a title
    // fact when it is short. Never dump the whole summary into canonical facts.
    const title = p.description && p.description.length <= 160 ? p.description.trim() : null;
    const start = p.start_date ? new Date(p.start_date).toISOString().slice(0, 10) : 'TBD';
    parts.push(`Project acronym: ${p.name}${title ? ` (${title})` : ''}`);
    parts.push(`Programme: ${p.type || 'Erasmus+'} | Duration: ${p.duration_months || 24} months | Start: ${start} | Co-financing: ${p.cofin_pct ?? 80}%`);
  }

  // Budget — authoritative from Calculator state
  const budget = await getPrepPresupuesto(projectId).catch(() => null);
  if (budget) {
    const bens = budget.beneficiaries || [];
    const totalGrant = bens.reduce((s, b) => s + (Number(b.total) || 0), 0);
    if (totalGrant) parts.push(`Total budget: €${totalGrant.toLocaleString('en')}`);
    if (bens.length) {
      parts.push('Partners (canonical name + role — use these exact names):\n' +
        bens.map(b => `  - ${b.name}${b.acronym ? ` (${b.acronym})` : ''}${b.country ? ` — ${b.country}` : ''}${b.is_coordinator ? ' [COORDINATOR]' : ''}: €${(Number(b.total) || 0).toLocaleString('en')}`).join('\n'));
    }
    const wps = budget.work_packages || [];
    if (wps.length) parts.push('Budget per work package:\n' + wps.map(w => `  - ${w.label}: €${(Number(w.total) || 0).toLocaleString('en')}`).join('\n'));
  }

  // WP → leader → activities (leader assignment is invariant)
  const act = await getPrepActividades(projectId).catch(() => ({ wps: [] }));
  if (act.wps && act.wps.length) {
    parts.push('Work packages (WP → leader → activities — leader is fixed):\n' +
      act.wps.map(wp => {
        const acts = (wp.activities || []).map(a => a.label || a.type).filter(Boolean).join(', ');
        return `  - ${wp.code} "${wp.title}" → leader: ${wp.leader_name || 'unassigned'}${acts ? ` → activities: ${acts}` : ''}`;
      }).join('\n'));
  }

  // Milestones + deliverables (direct query, no userId needed)
  const [ms] = await db.execute(
    `SELECT m.code, m.title, m.due_month FROM milestones m
     JOIN work_packages wp ON wp.id = m.work_package_id
     WHERE wp.project_id = ? ORDER BY m.due_month, m.sort_order`, [projectId]
  ).catch(() => [[]]);
  if (ms && ms.length) parts.push('Milestones:\n' + ms.map(m => `  - ${m.code || ''} ${m.title}${m.due_month ? ` (month ${m.due_month})` : ''}`).join('\n'));

  const [dels] = await db.execute(
    `SELECT d.code, d.title, d.due_month FROM deliverables d
     JOIN work_packages wp ON wp.id = d.work_package_id
     WHERE wp.project_id = ? ORDER BY d.due_month, d.sort_order`, [projectId]
  ).catch(() => [[]]);
  if (dels && dels.length) parts.push('Deliverables:\n' + dels.map(d => `  - ${d.code || ''} ${d.title}${d.due_month ? ` (month ${d.due_month})` : ''}`).join('\n'));

  // Validated soft facts (the realimentation loop, post-validation only)
  const [facts] = await db.execute(
    `SELECT fact_key, fact_value FROM project_facts WHERE project_id = ? AND status = 'canonical' ORDER BY fact_key`,
    [projectId]
  ).catch(() => [[]]);
  if (facts && facts.length) parts.push('Established project facts (keep consistent):\n' + facts.map(f => `  - ${f.fact_key}: ${f.fact_value}`).join('\n'));

  return parts.join('\n');
}

// ── Prompt logging: the cascade Writer reuses ai_generations so every
//    generation is auditable in the admin inspector. ──
async function _logWriterGen({ projectId, sectionId, system, user, raw, segments, status, durationMs }) {
  if (!projectId) return;
  try {
    const aiContext = require('../../utils/aiContext');
    const userId = aiContext.get().userId || null;
    await db.execute(
      `INSERT INTO ai_generations
         (id, project_id, user_id, kind, pass, section_id, system_prompt, user_prompt, raw_response, segments, status, duration_ms)
       VALUES (?, ?, ?, 'writer-section', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [genUUID(), projectId, userId, sectionId, sectionId,
        system || null, user || null, raw || null,
        segments ? JSON.stringify(segments) : null, status || 'success', durationMs || null]
    );
  } catch (err) {
    console.error('[ai_generations:writer] insert failed:', err.message);
  }
}

// ── Candidate fact extraction: after a section is written, a cheap model
//    pulls out NEW concrete facts (neighbourhoods, figures, named
//    stakeholders, acronyms) and stores them as 'candidate' — never injected
//    until validated, so hallucinations can't propagate. ──
async function extractCandidateFacts(projectId, sectionId, text) {
  if (!projectId || !text || text.length < 80) return;
  if (!process.env.ANTHROPIC_API_KEY) return;
  let parsed;
  try {
    const client = getClient();
    const model = process.env.AI_CHEAP_MODEL || 'claude-haiku-4-5-20251001';
    const sys = `You extract STABLE, CONCRETE facts from a funding-proposal section so they stay consistent across the whole proposal. Return ONLY a JSON array (max 8) of {"key","value"} where key is a short snake_case identifier (e.g. "target_neighbourhood", "youth_count", "lead_acronym", "milestone_m1_month") and value is the concrete fact as written. Extract ONLY specific facts a later section must not contradict: named places, named organisations/stakeholders, specific numbers/dates, chosen acronyms. SKIP generic claims, adjectives, and anything vague. If nothing concrete, return [].`;
    const raw = await client.messages.create({
      model, max_tokens: 700, temperature: 0,
      system: sys,
      messages: [{ role: 'user', content: `Section ${sectionId}:\n\n${text.substring(0, 6000)}` }],
    });
    const out = raw.content[0]?.text || '[]';
    const m = out.match(/\[[\s\S]*\]/);
    parsed = m ? JSON.parse(m[0]) : [];
  } catch (err) {
    console.warn('[facts] extraction error:', err.message);
    return;
  }
  if (!Array.isArray(parsed)) return;
  for (const f of parsed.slice(0, 8)) {
    if (!f || !f.key || !f.value) continue;
    const key = String(f.key).toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 120);
    const value = String(f.value).substring(0, 1000);
    if (!key || !value) continue;
    try {
      // Insert as candidate; never overwrite a fact a human already validated.
      await db.execute(
        `INSERT INTO project_facts (id, project_id, fact_key, fact_value, status, source)
         VALUES (?, ?, ?, ?, 'candidate', ?)
         ON DUPLICATE KEY UPDATE
           fact_value = IF(status = 'candidate', VALUES(fact_value), fact_value),
           source = IF(status = 'candidate', VALUES(source), source)`,
        [genUUID(), projectId, key, value, `generation:${sectionId}`]
      );
    } catch (err) {
      console.warn('[facts] insert error:', err.message);
    }
  }
}

// ── Facts ledger CRUD (user + admin surfaces) ──
async function listProjectFacts(projectId, status) {
  const params = [projectId];
  let sql = 'SELECT id, fact_key, fact_value, status, source, created_at, validated_at FROM project_facts WHERE project_id = ?';
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += " ORDER BY FIELD(status,'candidate','canonical','rejected'), fact_key";
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function setFactStatus(factId, status, userId) {
  if (!['candidate', 'canonical', 'rejected'].includes(status)) throw new Error('invalid status');
  await db.execute(
    'UPDATE project_facts SET status = ?, validated_at = NOW(), validated_by = ? WHERE id = ?',
    [status, userId || null, factId]
  );
  return true;
}

async function upsertProjectFact(projectId, key, value, status, userId) {
  const cleanKey = String(key || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 120);
  if (!cleanKey) throw new Error('key required');
  await db.execute(
    `INSERT INTO project_facts (id, project_id, fact_key, fact_value, status, source, validated_at, validated_by)
     VALUES (?, ?, ?, ?, ?, 'user', NOW(), ?)
     ON DUPLICATE KEY UPDATE fact_value = VALUES(fact_value), status = VALUES(status), validated_at = NOW(), validated_by = VALUES(validated_by)`,
    [genUUID(), projectId, cleanKey, String(value || '').substring(0, 1000), status || 'canonical', userId || null]
  );
  return true;
}

// ── Inspector (admin-only): read ai_generations ──
async function listGenerations({ projectId, kind, sectionId, limit = 50 } = {}) {
  const params = [];
  let sql = `SELECT g.id, g.project_id, g.kind, g.pass, g.section_id, g.status, g.duration_ms, g.created_at,
                    CHAR_LENGTH(COALESCE(g.system_prompt,'')) AS system_len,
                    CHAR_LENGTH(COALESCE(g.user_prompt,'')) AS user_len,
                    CHAR_LENGTH(COALESCE(g.raw_response,'')) AS output_len,
                    pr.name AS project_name
             FROM ai_generations g LEFT JOIN projects pr ON pr.id = g.project_id WHERE 1=1`;
  if (projectId) { sql += ' AND g.project_id = ?'; params.push(projectId); }
  if (kind) { sql += ' AND g.kind = ?'; params.push(kind); }
  if (sectionId) { sql += ' AND g.section_id = ?'; params.push(sectionId); }
  // LIMIT inlined (sanitised int): mysql2 prepared stmts reject `LIMIT ?`.
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  sql += ` ORDER BY g.created_at DESC LIMIT ${lim}`;
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function getGeneration(id) {
  const [rows] = await db.execute(
    `SELECT g.*, pr.name AS project_name FROM ai_generations g
     LEFT JOIN projects pr ON pr.id = g.project_id WHERE g.id = ?`, [id]
  );
  return rows[0] || null;
}

// ── Prompt blocks (admin-only): list/edit/version ──
async function listPromptBlocks() {
  const [rows] = await db.execute(
    'SELECT id, name, program_id, version, active, LEFT(content, 200) AS preview, CHAR_LENGTH(content) AS chars, updated_at FROM prompt_blocks ORDER BY name, program_id'
  );
  // Surface the in-code defaults that have no DB override yet, so admin can edit them.
  const known = { writer_antipatterns: ANTIPATTERNS_DEFAULT, writer_output_format: OUTPUT_FORMAT_DEFAULT };
  const present = new Set(rows.filter(r => r.program_id === null).map(r => r.name));
  for (const [name, content] of Object.entries(known)) {
    if (!present.has(name)) {
      rows.push({ id: null, name, program_id: null, version: 0, active: 1, preview: content.substring(0, 200), chars: content.length, updated_at: null, is_default: true });
    }
  }
  return rows;
}

async function getPromptBlockFull(name, programId) {
  const [rows] = await db.execute(
    'SELECT id, name, program_id, content, version, active FROM prompt_blocks WHERE name = ? AND (program_id <=> ?)',
    [name, programId || null]
  );
  if (rows.length) return rows[0];
  const defaults = { writer_antipatterns: ANTIPATTERNS_DEFAULT, writer_output_format: OUTPUT_FORMAT_DEFAULT };
  if (defaults[name] !== undefined) return { id: null, name, program_id: programId || null, content: defaults[name], version: 0, active: 1, is_default: true };
  return null;
}

async function upsertPromptBlock(name, programId, content, userId) {
  const [existing] = await db.execute(
    'SELECT id, version FROM prompt_blocks WHERE name = ? AND (program_id <=> ?)', [name, programId || null]
  );
  if (existing.length) {
    await db.execute(
      'UPDATE prompt_blocks SET content = ?, version = version + 1, updated_by = ? WHERE id = ?',
      [content, userId || null, existing[0].id]
    );
    return { id: existing[0].id, version: existing[0].version + 1 };
  }
  const id = genUUID();
  await db.execute(
    'INSERT INTO prompt_blocks (id, name, program_id, content, version, updated_by) VALUES (?, ?, ?, ?, 1, ?)',
    [id, name, programId || null, content, userId || null]
  );
  return { id, version: 1 };
}

async function generateSection(instanceId, sectionId, projectContext, programId, coordinatorName) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return '[AI generation pending — configure ANTHROPIC_API_KEY in .env]';
  }

  const sectionNames = {
    'summary_text': 'Project Summary',
    's1_1_text': '1.1 Background and general objectives',
    's1_2_text': '1.2 Needs analysis and specific objectives',
    's1_3_text': '1.3 Complementarity, innovation and European added value',
    's2_1_1_text': '2.1.1 Concept and methodology',
    's2_1_2_text': '2.1.2 Project management, quality assurance and monitoring',
    's2_1_4_text': '2.1.4 Cost effectiveness and financial management',
    's2_2_1_text': '2.2.1 Consortium set-up and cooperation',
    's2_2_2_text': '2.2.2 Consortium management and decision-making',
    's3_1_text': '3.1 Impact and ambition',
    's3_2_text': '3.2 Communication, dissemination and visibility',
    's3_3_text': '3.3 Sustainability and continuation',
    's4_1_text': '4.1 Work plan overview',
    's4_2_text': '4.2 Work packages, activities, resources and timing',
    's5_1_text': '5.1 Ethics',
    's5_2_text': '5.2 Security',
  };

  let sectionTitle = sectionNames[sectionId] || sectionId;

  // Get project ID from instance
  const [instRow] = await db.execute('SELECT project_id FROM form_instances WHERE id = ?', [instanceId]);
  const projId = instRow[0]?.project_id;

  // Get project language (derived from national_agency)
  const { langName } = projId ? await getProjectMeta(projId) : { langName: 'English' };

  // Dynamic per-WP section: resolve a human title + a focused WP context block.
  // Handles both EACEA 's4_2_wp_<id>' and NA '<field>__wp__<id>' conventions.
  let wpFocusBlock = '';
  const wpInfo = parseWpField(sectionId);
  if (wpInfo) {
    sectionTitle = await getSectionTitleAsync(sectionId);
    wpFocusBlock = await buildWpFocusContext(wpInfo.wpId);
  }

  // Build section-specific RAG query using project context for smarter retrieval
  const ragQuery = await buildSectionRagQuery(sectionId, sectionTitle, projId);

  // Gather all context in parallel (interview answers already in projectContext via buildEnrichedContext)
  const [ragChunks, writingRules, evalGuidance, previousSections, researchChunks] = await Promise.all([
    programId ? retrieveRelevantChunks(ragQuery, programId, 8) : Promise.resolve(''),
    programId ? getWritingRules(programId) : Promise.resolve({}),
    getEvalGuidanceForSection(sectionId, programId),
    getPreviousSections(instanceId, sectionId),
    projId ? retrieveResearchChunks(ragQuery, projId, 6) : Promise.resolve(''),
  ]);

  // For data-driven forms (KA220 NA etc.) the section title is not in the static
  // map — fall back to the question title resolved from the eval structure.
  if (sectionTitle === sectionId && evalGuidance?.title) sectionTitle = evalGuidance.title;

  const evalGuidanceLen = evalGuidance && evalGuidance.guidance ? evalGuidance.guidance.length : 0;
  const evalConstraintLen = evalGuidance && evalGuidance.mandatoryConstraint ? evalGuidance.mandatoryConstraint.length : 0;
  console.log(`[Writer] writingRules loaded: style=${writingRules.writing_style ? writingRules.writing_style.length + ' chars' : 'NULL'}, ai=${writingRules.ai_detection_rules ? writingRules.ai_detection_rules.length + ' chars' : 'NULL'}, evalGuidance=${evalGuidanceLen ? evalGuidanceLen + ' chars' : 'NONE'}, mandatoryRule=${evalConstraintLen ? evalConstraintLen + ' chars' : 'NONE'}, limit=${evalGuidance?.charLimit ? evalGuidance.charLimit + 'ch' : (evalGuidance?.wordLimit || 'default')}, RAG=${ragChunks ? ragChunks.length + ' chars' : 'NONE'}, prevSections=${previousSections ? previousSections.length + ' chars' : 'NONE'}`);

  // Character limits (NA copy-paste eForms) take priority over word limits (EACEA).
  const lengthHint = evalGuidance?.charLimit
    ? `LENGTH: HARD LIMIT ${evalGuidance.charLimit} characters — this answer is pasted into a fixed-size field of the EU web eForm, so exceeding the character limit is not allowed. Aim for roughly ${Math.floor(evalGuidance.charLimit / 7)} words and stay safely under the limit. Quality over filler.`
    : evalGuidance?.wordLimit
    ? `LENGTH: target ~${evalGuidance.wordLimit} words (call-defined limit). Quality over filler.`
    : 'LENGTH: 500-700 words. Quality over quantity.';

  // Editable prompt blocks (DB override → in-code default). Behaviour is
  // unchanged until an admin saves an override from the inspector.
  const [antipatterns, outputFormat] = await Promise.all([
    getPromptBlock('writer_antipatterns', programId, ANTIPATTERNS_DEFAULT),
    getPromptBlock('writer_output_format', programId, OUTPUT_FORMAT_DEFAULT),
  ]);

  // Segment capture: every named block is recorded so the admin inspector can
  // show a desglosado view (name, source, weight, content) per generation.
  const segments = [];
  const pushSeg = (name, source, content) => {
    if (content && String(content).trim()) segments.push({ name, source, chars: String(content).length, content: String(content) });
  };

  // ══ SYSTEM PROMPT — writing rules FIRST (highest priority) ══
  const basePersona = `You are a real project coordinator writing a funding proposal. You are NOT an AI assistant — you are a practitioner who has spent months designing this project with your partners. You write from lived experience, not from templates.

PERSONA: You are the project coordinator at ${coordinatorName || 'the lead organisation'}. You know every partner personally. You have visited their offices, discussed the project over coffee, argued about methodology in video calls. Write like that person — with conviction, specificity, and occasional imperfection.

SECTION TO WRITE: "${sectionTitle}"
${lengthHint}
OUTPUT: Only the section text. No title, no numbering, no meta-commentary.

══ LANGUAGE (MANDATORY) ══
Write the ENTIRE section in ${langName}. Every paragraph, every sentence, every word must be in ${langName}. Do not switch languages, do not include English fragments unless they are proper nouns or untranslatable terms.`;
  let system = basePersona;
  pushSeg('base_persona', 'code', basePersona);

  if (writingRules.writing_style) {
    const block = `══ WRITING STYLE (FOLLOW STRICTLY) ══\n${writingRules.writing_style}`;
    system += `\n\n${block}`;
    pushSeg('writing_style', 'programs.writing_style', block);
  }

  if (writingRules.ai_detection_rules) {
    const block = `══ ANTI-AI DETECTION (MANDATORY — YOUR TEXT WILL BE SCANNED) ══\n${writingRules.ai_detection_rules}`;
    system += `\n\n${block}`;
    pushSeg('ai_detection', 'programs.ai_detection_rules', block);
  }

  system += `\n\n${antipatterns}`;
  pushSeg('antipatterns', 'prompt_blocks:writer_antipatterns', antipatterns);

  system += `\n\n${outputFormat}`;
  pushSeg('output_format', 'prompt_blocks:writer_output_format', outputFormat);

  // ══ USER PROMPT ══
  // Canonical facts FIRST — invariant facts the model must not re-decide.
  let user = '';
  const canonicalFacts = projId ? await buildCanonicalFacts(projId) : '';
  if (canonicalFacts) {
    const block = `══ HECHOS INVARIABLES — DO NOT CONTRADICT (project facts; keep identical across every section) ══\n${canonicalFacts}`;
    user += `${block}\n\n`;
    pushSeg('canonical_facts', 'derived+project_facts', block);
  }

  const projBlock = `══ YOUR PROJECT ══\n${projectContext}`;
  user += projBlock;
  pushSeg('project_context', 'buildEnrichedContext', projBlock);

  // Per-WP focus: tell the model EXACTLY which WP it is writing about and give
  // it the activities/leader/category for THAT WP specifically. Without this,
  // 4.2 WP1 and 4.2 WP2 would get the same generic prompt and produce
  // near-identical text.
  if (wpFocusBlock) {
    const block = `══ WRITE THIS SPECIFIC WORK PACKAGE (NOT THE OTHERS) ══\n${wpFocusBlock}\nWrite a narrative that describes this WP concretely: its objective, the sequence of its activities, who leads and who contributes, expected outputs/deliverables, and how the timing fits the project. Reference other WPs only when coherence demands it. Do NOT summarise the whole workplan — only this WP.`;
    user += `\n\n${block}`;
    pushSeg('wp_focus', 'buildWpFocusContext', block);
  }

  // Mandatory constraints (eval_questions.global_rule) — non-negotiable rules from the call
  if (evalGuidance && evalGuidance.mandatoryConstraint) {
    const block = `══ MANDATORY CONSTRAINTS — DO NOT VIOLATE (call requirements) ══\n${evalGuidance.mandatoryConstraint}`;
    user += `\n\n${block}`;
    pushSeg('mandatory_constraint', 'eval_questions.global_rule', block);
  }

  // Evaluator guidance — intent/elements/example_strong/avoid per criterion + connects_from/to
  if (evalGuidance && evalGuidance.guidance) {
    const block = `══ WHAT THE EVALUATOR SCORES IN THIS SECTION ══\n${evalGuidance.guidance}\nAddress ALL of these criteria, but woven naturally into the narrative — not as a checklist. The STRONG EXAMPLE shows the level of specificity expected; do not copy it, write your project's equivalent.`;
    user += `\n\n${block}`;
    pushSeg('eval_criteria', 'eval_criteria', block);
  }

  // RAG — but limit to most relevant chunks to avoid dilution
  if (ragChunks) {
    const limitedRag = ragChunks.substring(0, 8000);
    const block = `══ REFERENCE DOCUMENTS (cite naturally, don't list) ══\n${limitedRag}`;
    user += `\n\n${block}`;
    pushSeg('rag', 'call_docs', block);
  }

  // NOTE: Interview answers are now included in projectContext via buildEnrichedContext()

  // Add research document chunks (user's thematic evidence — priority over call docs)
  if (researchChunks) {
    const block = `══ THEMATIC RESEARCH (uploaded by coordinator — use as primary evidence) ══\n${researchChunks}`;
    user += `\n\n${block}`;
    pushSeg('research', 'research_docs', block);
  }

  if (previousSections) {
    const block = `══ WHAT YOU ALREADY WROTE (don't repeat, build on it) ══\n${previousSections}`;
    user += `\n\n${block}`;
    pushSeg('previous_sections', 'form_field_values', block);
  }

  const seed = Math.random().toString(36).substring(2, 8);
  const nowWrite = `══ NOW WRITE ══\nWrite section "${sectionTitle}" for this specific project. Use the coordinator's own words and research documents as your primary material. The call documents are secondary context. Write with conviction and specificity. [v:${seed}]`;
  user += `\n\n${nowWrite}`;
  pushSeg('now_write', 'code', nowWrite);

  // Generate + log (admin inspector reads ai_generations)
  const t0 = Date.now();
  let raw;
  try {
    raw = await callAI(system, user, 'generate');
  } catch (err) {
    await _logWriterGen({ projectId: projId, sectionId, system, user, raw: `[ERROR] ${err.message}`, segments, status: 'error', durationMs: Date.now() - t0 });
    throw err;
  }
  await _logWriterGen({ projectId: projId, sectionId, system, user, raw, segments, status: 'success', durationMs: Date.now() - t0 });

  const clean = sanitizeProposalText(raw);
  // Realimentation loop: capture NEW concrete facts as candidates (cheap model,
  // non-blocking). They are NOT injected until validated to 'canonical'.
  if (projId) extractCandidateFacts(projId, sectionId, clean).catch(e => console.warn('[facts] extract failed:', e.message));
  return clean;
}

// ── Evaluate section with full criteria context ─────────────

async function evaluateSection(text, sectionTitle, criteria, programId, langName) {
  if (!process.env.ANTHROPIC_API_KEY) return { score: 'pending', feedback: 'API key not configured' };

  const writingRules = programId ? await getWritingRules(programId) : {};
  const outputLang = langName || 'English';

  const system = `You are a senior Erasmus+ proposal evaluator with extensive experience scoring EU project applications. You evaluate rigorously but constructively.

Evaluate the section text below. Score each aspect and provide actionable feedback.

LANGUAGE (MANDATORY): the "strengths", "weaknesses", "suggestions" and "missing_elements" fields MUST be written in ${outputLang}. Every sentence of those fields in ${outputLang}. The "overall" field keeps its English enum value (excellent|good|fair|weak).

Respond ONLY in valid JSON:
{
  "overall": "excellent|good|fair|weak",
  "score_estimate": 8,
  "strengths": ["fortaleza específica en ${outputLang} 1", "fortaleza específica en ${outputLang} 2"],
  "weaknesses": ["debilidad específica en ${outputLang} 1"],
  "suggestions": ["mejora accionable en ${outputLang} 1", "mejora accionable en ${outputLang} 2", "mejora accionable en ${outputLang} 3"],
  "missing_elements": ["elemento que el evaluador esperaría pero falta, en ${outputLang}"],
  "word_count_ok": true
}`;

  let user = `Section: ${sectionTitle}\n\n`;
  if (writingRules.writing_style) user += `Expected writing style:\n${writingRules.writing_style}\n\n`;
  user += `Text to evaluate:\n${text}`;

  const result = await callClaude(system, user, 2000);
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { overall: 'unknown', feedback: result };
  } catch { return { overall: 'unknown', feedback: result }; }
}

// ── Improve section with context awareness ──────────────────

async function improveSection(text, action, sectionTitle, projectContext, programId) {
  if (!process.env.ANTHROPIC_API_KEY) return text;

  const writingRules = programId ? await getWritingRules(programId) : {};

  const actions = {
    expand: 'Expand this text with MORE SPECIFIC details from the project data. Add concrete examples, data points, partner contributions, and activity specifics. Reference official EU documents and policy frameworks where relevant. Double the depth without doubling the length.',
    simplify: 'Make this text more concise and impactful. Remove redundant phrases, tighten the language, and improve readability. Keep all essential content but reduce word count by ~20%. Every sentence must earn its place.',
    improve: 'Strengthen this text to score higher with EU evaluators. Improve: (1) specificity — use more project-specific data, (2) evidence — reference EU policies and official documents, (3) coherence — better flow between paragraphs, (4) evaluation alignment — address criteria more explicitly.',
  };

  let system = `You are an expert Erasmus+ proposal writer revising a section. Return ONLY the improved text — no explanations, no commentary, no section titles.` + NARRATIVE_FORMAT_RULES;
  if (writingRules.writing_style) system += `\n\nFollow this writing style:\n${writingRules.writing_style}`;
  if (writingRules.ai_detection_rules) system += `\n\nAI detection rules:\n${writingRules.ai_detection_rules}`;

  let user = `Section: ${sectionTitle}\n\nInstruction: ${actions[action] || actions.improve}`;
  // El bundle de contexto entra entero (antes 3000 chars, ahora sin truncar). El writer
  // cascada actual aún troc​ea por sección — la pipeline CAG completa llegará en fase
  // Perfeccionar (ver docs/PROJECT_MASTER_ARCHITECTURE.md §6).
  if (projectContext) user += `\n\nProject context for reference:\n${projectContext}`;
  user += `\n\nOriginal text to improve:\n${text}`;
  user += `\n\nOUTPUT: plain prose only. No markdown, no bullets, no tables, no headings, no bold/italics, no backticks. Paragraphs separated by blank lines.`;

  const raw = await callClaude(system, user, 4096);
  return sanitizeProposalText(raw);
}

// ── Improve section with a CUSTOM user request (free-text from coordinator) ──
// Uses the same enriched context as generateSection so the revision is grounded
// in the full project data (partners, budget, activities, RAG, eval guidance,
// previous sections, research docs). The user_request is injected as a top-level
// mandate for the revision.
async function improveSectionCustom(instanceId, sectionId, currentText, userRequest, projectContext, programId, coordinatorName, opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return currentText;

  const sectionNames = {
    'summary_text': 'Project Summary',
    's1_1_text': '1.1 Background and general objectives',
    's1_2_text': '1.2 Needs analysis and specific objectives',
    's1_3_text': '1.3 Complementarity, innovation and European added value',
    's2_1_1_text': '2.1.1 Concept and methodology',
    's2_1_2_text': '2.1.2 Project management, quality assurance and monitoring',
    's2_1_4_text': '2.1.4 Cost effectiveness and financial management',
    's2_2_1_text': '2.2.1 Consortium set-up and cooperation',
    's2_2_2_text': '2.2.2 Consortium management and decision-making',
    's3_1_text': '3.1 Impact and ambition',
    's3_2_text': '3.2 Communication, dissemination and visibility',
    's3_3_text': '3.3 Sustainability and continuation',
    's4_1_text': '4.1 Work plan overview',
    's4_2_text': '4.2 Work packages, activities, resources and timing',
    's5_1_text': '5.1 Ethics',
    's5_2_text': '5.2 Security',
  };
  let sectionTitle = sectionNames[sectionId] || sectionId;

  const [instRow] = await db.execute('SELECT project_id FROM form_instances WHERE id = ?', [instanceId]);
  const projId = instRow[0]?.project_id;
  const { langName } = projId ? await getProjectMeta(projId) : { langName: 'English' };

  // Per-WP dynamic section support (EACEA + NA conventions)
  let wpFocusBlock = '';
  const wpInfo = parseWpField(sectionId);
  if (wpInfo) {
    sectionTitle = await getSectionTitleAsync(sectionId);
    wpFocusBlock = await buildWpFocusContext(wpInfo.wpId);
  }

  const ragQuery = await buildSectionRagQuery(sectionId, sectionTitle, projId);

  const [ragChunks, writingRules, evalGuidance, previousSections, researchChunks] = await Promise.all([
    programId ? retrieveRelevantChunks(ragQuery, programId, 8) : Promise.resolve(''),
    programId ? getWritingRules(programId) : Promise.resolve({}),
    getEvalGuidanceForSection(sectionId, programId),
    getPreviousSections(instanceId, sectionId),
    projId ? retrieveResearchChunks(ragQuery, projId, 6) : Promise.resolve(''),
  ]);

  if (sectionTitle === sectionId && evalGuidance?.title) sectionTitle = evalGuidance.title;

  console.log(`[Writer/improve-custom] section=${sectionId} req="${(userRequest || '').substring(0, 80)}..." writingRules=${writingRules.writing_style ? 'Y' : 'N'} evalGuidance=${evalGuidance ? 'Y' : 'N'} RAG=${ragChunks ? ragChunks.length : 0}ch prev=${previousSections ? 'Y' : 'N'}`);

  let system = `You are a real project coordinator revising a funding proposal. You are NOT an AI assistant — you are a practitioner refining your own text based on your own judgement.

PERSONA: You are the project coordinator at ${coordinatorName || 'the lead organisation'}. You wrote the original text and you now want to improve it for a SPECIFIC reason.

SECTION: "${sectionTitle}"
OUTPUT: Only the revised section text. No title, no numbering, no meta-commentary, no explanation of what you changed.
LENGTH: Keep a similar length to the original unless the coordinator's request explicitly asks to expand or shorten it.

══ LANGUAGE (MANDATORY) ══
Write the ENTIRE revised section in ${langName}. Every paragraph, every sentence, every word must be in ${langName}.

══ HOW TO REVISE ══
- Apply the coordinator's request faithfully — it is the PRIMARY instruction.
- Keep the parts of the original that already work. Do NOT rewrite from scratch unless the request asks for it.
- Preserve the narrative voice and the specific facts/names/numbers from the original.
- Ground any new content in the project context, RAG references and previous sections below.
- Do not invent partners, figures, deliverables or countries that are not in the project context.

══ ANTI-REGRESSION RULES (CRITICAL — REVISIONS OFTEN MAKE TEXT WORSE, DON'T) ══
- If the instruction is about LENGTH ("too long", "shorten", "concise"), reduce by AT MOST 10% of the original word count. Never cut specific examples, partner names, city names, data points, percentages, dates, or references to EU policies. Remove only filler phrases and redundancies. A shorter-but-emptier text scores WORSE, not better.
- If the instruction is about STRUCTURE ("bullet points", "tables", "clearer"), convert the form but keep 100% of the content.
- If the instruction is vague ("improve", "polish"), make minimal surgical changes — you will usually cause regressions if you rewrite paragraphs wholesale.
- Strengths identified by the evaluator (when provided) are LOAD-BEARING. Removing or diluting them drops the score. If addressing a weakness would damage a strength, find a less destructive path.

══ OUTPUT FORMAT (MANDATORY — THIS TEXT GOES INTO AN OFFICIAL EACEA PDF FORM) ══
The output MUST be plain prose. Pasting markdown into the EACEA form gives it away as AI-generated.
- NO markdown at all. NO "**bold**", NO "*italics*", NO "##" or "#" headings, NO "> quotes", NO backticks.
- NO markdown tables (pipes "|" or "---" separators). Compare things in prose instead.
- NO bullet lists or numbered lists. NO lines starting with "- ", "* ", "• ", "→ ", "1.", "2.", "a)", "b)". Write continuous prose.
- NO subheadings or internal section titles (you are writing the BODY of one single section).
- NO emojis, ASCII art, decorative symbols ("═", "──", "▪").
- Paragraphs separated by a single blank line, that's all the formatting you get.`;

  if (writingRules.writing_style) {
    system += `\n\n══ WRITING STYLE (FOLLOW STRICTLY) ══\n${writingRules.writing_style}`;
  }
  if (writingRules.ai_detection_rules) {
    system += `\n\n══ ANTI-AI DETECTION (MANDATORY) ══\n${writingRules.ai_detection_rules}`;
  }

  let user = `══ COORDINATOR'S REQUEST (PRIMARY INSTRUCTION) ══\n${userRequest}\n\n`;

  // Score-aware context: when the caller provides the current evaluation and
  // a target score (used by the auto-refine loop), spell out the gap so the
  // model knows what it's optimising for.
  if (opts.evaluation) {
    const ev = opts.evaluation;
    const curScore = typeof ev.score_estimate === 'number' ? ev.score_estimate : (ev.score || null);
    const target = opts.targetScore || 9;
    user += `══ CURRENT EVALUATOR SCORE ══\nThe current text scores ${curScore ?? '?'}/10 according to the EACEA rubric. Your job is to push this text to ${target}/10 or higher.\n`;
    if (ev.weaknesses && ev.weaknesses.length) {
      user += `\nWEAKNESSES THE EVALUATOR FLAGGED (address ALL of these, they are the gap between current score and ${target}):\n`;
      ev.weaknesses.forEach((w, i) => { user += `${i + 1}. ${w}\n`; });
    }
    if (ev.suggestions && ev.suggestions.length) {
      user += `\nEVALUATOR SUGGESTIONS (apply these — they are concrete fixes):\n`;
      ev.suggestions.forEach((s, i) => { user += `${i + 1}. ${s}\n`; });
    }
    if (ev.strengths && ev.strengths.length) {
      user += `\nSTRENGTHS TO PRESERVE (do NOT remove or weaken these):\n`;
      ev.strengths.forEach((s, i) => { user += `${i + 1}. ${s}\n`; });
    }
    user += `\n`;
  }

  user += `══ ORIGINAL TEXT TO REVISE ══\n${currentText}\n\n`;
  if (projectContext) user += `══ YOUR PROJECT ══\n${projectContext}\n\n`;
  if (wpFocusBlock) user += `══ FOCUS WORK PACKAGE (revise ONLY this WP, not the full workplan) ══\n${wpFocusBlock}\n\n`;
  if (evalGuidance) user += `══ WHAT THE EVALUATOR SCORES IN THIS SECTION ══\n${evalGuidance}\n\n`;
  if (ragChunks) {
    const limitedRag = ragChunks.substring(0, 8000);
    user += `══ REFERENCE DOCUMENTS (cite naturally, don't list) ══\n${limitedRag}\n\n`;
  }
  if (researchChunks) user += `══ THEMATIC RESEARCH (uploaded by coordinator) ══\n${researchChunks}\n\n`;
  if (previousSections) user += `══ WHAT YOU ALREADY WROTE IN OTHER SECTIONS (stay coherent, don't repeat) ══\n${previousSections}\n\n`;
  user += `══ NOW REVISE ══\nReturn ONLY the revised text for section "${sectionTitle}", applying the coordinator's request above.`;

  const raw = await callAI(system, user, 'generate');
  return sanitizeProposalText(raw);
}

// Central section-title mapping shared by all refine/evaluate/improve paths.
const SECTION_NAMES = {
  'summary_text': 'Project Summary',
  's1_1_text': '1.1 Background and general objectives',
  's1_2_text': '1.2 Needs analysis and specific objectives',
  's1_3_text': '1.3 Complementarity, innovation and European added value',
  's2_1_1_text': '2.1.1 Concept and methodology',
  's2_1_2_text': '2.1.2 Project management, quality assurance and monitoring',
  's2_1_4_text': '2.1.4 Cost effectiveness and financial management',
  's2_2_1_text': '2.2.1 Consortium set-up and cooperation',
  's2_2_2_text': '2.2.2 Consortium management and decision-making',
  's3_1_text': '3.1 Impact and ambition',
  's3_2_text': '3.2 Communication, dissemination and visibility',
  's3_3_text': '3.3 Sustainability and continuation',
  's4_1_text': '4.1 Work plan overview',
  's4_2_text': '4.2 Work packages, activities, resources and timing',
  's5_1_text': '5.1 Ethics',
  's5_2_text': '5.2 Security',
};
function getSectionTitle(sectionId) { return SECTION_NAMES[sectionId] || sectionId; }

// Async version that resolves dynamic per-WP section IDs (s4_2_wp_{uuid}) by
// looking up the WP in the DB. Falls back to the static map for known IDs.
async function getSectionTitleAsync(sectionId) {
  if (SECTION_NAMES[sectionId]) return SECTION_NAMES[sectionId];
  const wp = parseWpField(sectionId);
  if (wp) {
    try {
      const [rows] = await db.execute('SELECT code, title, order_index FROM work_packages WHERE id = ?', [wp.wpId]);
      if (rows[0]) {
        const code = rows[0].code || ('WP' + ((rows[0].order_index || 0) + 1));
        const t = rows[0].title || 'Work Package';
        // EACEA single-narrative keeps the '4.2' prefix; NA per-field WPs just use the WP label.
        return wp.base === 's4_2_text' ? `4.2 ${code} — ${t}` : `${code} — ${t}`;
      }
    } catch (e) { /* fall through */ }
    return 'Work Package';
  }
  return sectionId;
}

// Load a WP-focused block (WP header, activities, deliverables, budget) that
// the LLM can use to write or revise section 4.2 for a specific WP. Kept small
// and narrative so it plugs into existing prompts cleanly.
async function buildWpFocusContext(wpId) {
  if (!wpId) return '';
  const [[wp]] = await db.execute(
    'SELECT wp.id, wp.code, wp.title, wp.category, wp.order_index, wp.leader_id, p.name AS leader_name, p.country AS leader_country FROM work_packages wp LEFT JOIN partners p ON p.id = wp.leader_id WHERE wp.id = ?',
    [wpId]
  ).then(r => [r]).catch(() => [[]]);
  if (!wp) return '';

  const [activities] = await db.execute(
    'SELECT id, type, label, subtype, date_start, date_end, description, order_index FROM activities WHERE wp_id = ? ORDER BY order_index, date_start',
    [wpId]
  ).catch(() => [[]]);

  let block = `FOCUS WORK PACKAGE: ${wp.code || ('WP' + ((wp.order_index || 0) + 1))} — ${wp.title || ''}\n`;
  if (wp.category) block += `Category: ${wp.category}\n`;
  if (wp.leader_name) block += `Lead Beneficiary: ${wp.leader_name}${wp.leader_country ? ' (' + wp.leader_country + ')' : ''}\n`;

  if (activities.length) {
    block += `\nActivities / Tasks in this WP (${activities.length}):\n`;
    activities.forEach((a, i) => {
      block += `  T${(wp.order_index || 0) + 1}.${i + 1} — ${a.label || a.type}`;
      if (a.subtype) block += ` (${a.subtype})`;
      if (a.date_start && a.date_end) block += ` [${a.date_start} → ${a.date_end}]`;
      // WP focus: descripción de actividad sin truncar (arquitectura 2026-05-16).
      if (a.description) block += `\n      ${a.description}`;
      block += `\n`;
    });
  } else {
    block += `\n(No activities defined yet in Intake for this WP — produce a plausible set based on the WP title and the project context.)\n`;
  }

  const [milestones] = await db.execute(
    'SELECT code, title, description, due_month, verification FROM milestones WHERE work_package_id = ? ORDER BY sort_order, created_at',
    [wpId]
  ).catch(() => [[]]);
  if (milestones && milestones.length) {
    block += `\nMilestones for this WP (${milestones.length}):\n`;
    milestones.forEach(m => {
      block += `  ${m.code ? m.code + ' — ' : ''}${m.title}`;
      if (m.due_month) block += ` (M${m.due_month})`;
      block += '\n';
      if (m.description) block += `      ${m.description}\n`;
      if (m.verification) block += `      Verification: ${m.verification}\n`;
    });
  }

  const [deliverables] = await db.execute(
    'SELECT code, title, description, type, dissemination_level, due_month FROM deliverables WHERE work_package_id = ? ORDER BY sort_order, created_at',
    [wpId]
  ).catch(() => [[]]);
  if (deliverables && deliverables.length) {
    block += `\nDeliverables for this WP (${deliverables.length}):\n`;
    deliverables.forEach(d => {
      block += `  ${d.code ? d.code + ' — ' : ''}${d.title}`;
      if (d.type) block += ` [${d.type}]`;
      if (d.dissemination_level) block += ` (${d.dissemination_level})`;
      if (d.due_month) block += ` (M${d.due_month})`;
      block += '\n';
      if (d.description) block += `      ${d.description}\n`;
    });
  }

  return block;
}

/* ══ Milestones + Deliverables CRUD (Writer Phase 2) ══════════
   First-class rows per WP. UI renders as structured tables.
   ─────────────────────────────────────────────────────────── */

async function _assertWp(wpId, userId) {
  const [rows] = await db.execute(
    `SELECT wp.id, wp.project_id FROM work_packages wp
       JOIN projects p ON p.id = wp.project_id
      WHERE wp.id = ? AND p.user_id = ?`,
    [wpId, userId]
  );
  if (!rows.length) {
    const err = new Error('Work package not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

async function _assertPartnerInProject(projectId, partnerId) {
  if (!partnerId) return;
  const [rows] = await db.execute(
    'SELECT id FROM partners WHERE id = ? AND project_id = ?',
    [partnerId, projectId]
  );
  if (!rows.length) {
    const err = new Error('Lead partner does not belong to this project');
    err.status = 400;
    throw err;
  }
}

async function _assertWpInProject(projectId, wpId) {
  if (!wpId) return;
  const [rows] = await db.execute(
    'SELECT id FROM work_packages WHERE id = ? AND project_id = ?',
    [wpId, projectId]
  );
  if (!rows.length) {
    const err = new Error('Work package does not belong to this project');
    err.status = 400;
    throw err;
  }
}

async function listMilestones(wpId) {
  const [rows] = await db.execute(
    `SELECT m.*, p.name AS lead_partner_name
       FROM milestones m
       LEFT JOIN partners p ON p.id = m.lead_partner_id
      WHERE m.work_package_id = ?
      ORDER BY m.sort_order, m.created_at`,
    [wpId]
  );
  return rows;
}

async function createMilestone(wpId, userId, data) {
  const wp = await _assertWp(wpId, userId);
  await _assertPartnerInProject(wp.project_id, data.lead_partner_id || null);
  const id = genUUID();
  await db.execute(
    `INSERT INTO milestones (id, work_package_id, project_id, code, title, description, due_month, verification, lead_partner_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, wpId, wp.project_id,
      data.code || null,
      data.title || 'New milestone',
      data.description || null,
      data.due_month || null,
      data.verification || null,
      data.lead_partner_id || null,
      data.sort_order || 0,
    ]
  );
  return id;
}

async function updateMilestone(msId, userId, data) {
  const [rows] = await db.execute(
    `SELECT m.id, m.project_id FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.id = ? AND p.user_id = ?`,
    [msId, userId]
  );
  if (!rows.length) { const e = new Error('Milestone not found'); e.status = 404; throw e; }
  if (data.lead_partner_id) await _assertPartnerInProject(rows[0].project_id, data.lead_partner_id);
  const allowed = ['code','title','description','due_month','verification','lead_partner_id','sort_order','deliverable_id','kind','rationale'];
  const contentFields = new Set(['code','title','description','due_month','verification','lead_partner_id','deliverable_id','kind','rationale']);
  const sets = [];
  const vals = [];
  let touchedContent = false;
  for (const k of allowed) {
    if (data[k] !== undefined) {
      sets.push(`${k} = ?`); vals.push(data[k] === '' ? null : data[k]);
      if (contentFields.has(k)) touchedContent = true;
    }
  }
  if (!sets.length) return;
  if (touchedContent) sets.push('auto_generated = 0');
  vals.push(msId);
  await db.execute(`UPDATE milestones SET ${sets.join(', ')} WHERE id = ?`, vals);
}

async function deleteMilestone(msId, userId) {
  const [rows] = await db.execute(
    `SELECT m.id FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.id = ? AND p.user_id = ?`,
    [msId, userId]
  );
  if (!rows.length) { const e = new Error('Milestone not found'); e.status = 404; throw e; }
  await db.execute('DELETE FROM milestones WHERE id = ?', [msId]);
}

async function listDeliverables(wpId) {
  const [rows] = await db.execute(
    `SELECT d.*, p.name AS lead_partner_name
       FROM deliverables d
       LEFT JOIN partners p ON p.id = d.lead_partner_id
      WHERE d.work_package_id = ?
      ORDER BY d.sort_order, d.created_at`,
    [wpId]
  );
  return rows;
}

async function createDeliverable(wpId, userId, data) {
  const wp = await _assertWp(wpId, userId);
  await _assertPartnerInProject(wp.project_id, data.lead_partner_id || null);
  const id = genUUID();
  await db.execute(
    `INSERT INTO deliverables (id, work_package_id, project_id, code, title, description, type, dissemination_level, due_month, lead_partner_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, wpId, wp.project_id,
      data.code || null,
      data.title || 'New deliverable',
      data.description || null,
      data.type || null,
      data.dissemination_level || null,
      data.due_month || null,
      data.lead_partner_id || null,
      data.sort_order || 0,
    ]
  );
  return id;
}

async function updateDeliverable(dId, userId, data) {
  const [rows] = await db.execute(
    `SELECT d.id, d.project_id FROM deliverables d JOIN projects p ON p.id = d.project_id
      WHERE d.id = ? AND p.user_id = ?`,
    [dId, userId]
  );
  if (!rows.length) { const e = new Error('Deliverable not found'); e.status = 404; throw e; }
  if (data.lead_partner_id)   await _assertPartnerInProject(rows[0].project_id, data.lead_partner_id);
  if (data.work_package_id)   await _assertWpInProject(rows[0].project_id, data.work_package_id);
  const allowed = ['code','title','description','type','dissemination_level','due_month','lead_partner_id','sort_order','work_package_id','rationale','kpi'];
  const contentFields = new Set(['code','title','description','type','dissemination_level','due_month','lead_partner_id','rationale','kpi']);
  const sets = [];
  const vals = [];
  let touchedContent = false;
  for (const k of allowed) {
    if (data[k] !== undefined) {
      sets.push(`${k} = ?`); vals.push(data[k] === '' ? null : data[k]);
      if (contentFields.has(k)) touchedContent = true;
    }
  }
  // Update task linkage if provided as task_ids array
  if (Array.isArray(data.task_ids)) {
    await db.execute(`DELETE FROM deliverable_tasks WHERE deliverable_id = ?`, [dId]);
    for (const tid of data.task_ids) {
      try { await db.execute(`INSERT INTO deliverable_tasks (deliverable_id, task_id) VALUES (?, ?)`, [dId, tid]); }
      catch (e) { /* ignore dup or invalid */ }
    }
    touchedContent = true;
  }
  if (!sets.length && !Array.isArray(data.task_ids)) return;
  if (sets.length) {
    if (touchedContent) sets.push('auto_generated = 0');
    vals.push(dId);
    await db.execute(`UPDATE deliverables SET ${sets.join(', ')} WHERE id = ?`, vals);
  }
}

async function deleteDeliverable(dId, userId) {
  const [rows] = await db.execute(
    `SELECT d.id FROM deliverables d JOIN projects p ON p.id = d.project_id
      WHERE d.id = ? AND p.user_id = ?`,
    [dId, userId]
  );
  if (!rows.length) { const e = new Error('Deliverable not found'); e.status = 404; throw e; }
  await db.execute('DELETE FROM deliverables WHERE id = ?', [dId]);
}

/* ── Writer Phase 3: full WP form (Application Form Part B 4.2) ──
   Header (objectives + duration + lead), Tasks + participants,
   Budget pivot. Milestones/deliverables already covered above.
   ────────────────────────────────────────────────────────────── */

async function getWpHeader(wpId, userId) {
  const [rows] = await db.execute(
    `SELECT wp.id, wp.code, wp.title, wp.summary, wp.objectives,
            wp.duration_from_month, wp.duration_to_month, wp.leader_id,
            p.name AS leader_name, p.country AS leader_country
       FROM work_packages wp
       JOIN projects pr ON pr.id = wp.project_id
       LEFT JOIN partners p ON p.id = wp.leader_id
      WHERE wp.id = ? AND pr.user_id = ?`,
    [wpId, userId]
  );
  if (!rows.length) { const e = new Error('Work package not found'); e.status = 404; throw e; }
  const wp = rows[0];

  // Auto-derive duration from activities Gantt months if not set.
  // Persist on first compute so subsequent loads are fast and the value
  // becomes the user-editable default (they can overwrite via the form).
  if (wp.duration_from_month == null || wp.duration_to_month == null) {
    const [[derived]] = await db.execute(
      `SELECT MIN(gantt_start_month) AS from_m,
              MAX(COALESCE(gantt_end_month, gantt_start_month)) AS to_m
         FROM activities
        WHERE wp_id = ? AND gantt_start_month IS NOT NULL`,
      [wpId]
    );
    const fromM = wp.duration_from_month != null ? wp.duration_from_month : (derived?.from_m ?? null);
    const toM   = wp.duration_to_month   != null ? wp.duration_to_month   : (derived?.to_m   ?? null);
    if (fromM != null || toM != null) {
      await db.execute(
        `UPDATE work_packages
            SET duration_from_month = COALESCE(duration_from_month, ?),
                duration_to_month   = COALESCE(duration_to_month, ?)
          WHERE id = ?`,
        [fromM, toM, wpId]
      );
      wp.duration_from_month = fromM;
      wp.duration_to_month   = toM;
    }
  }

  return wp;
}

async function updateWpHeader(wpId, userId, data) {
  await _assertWp(wpId, userId);
  const allowed = ['title', 'objectives', 'duration_from_month', 'duration_to_month', 'leader_id'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k] === '' ? null : data[k]); }
  }
  if (!sets.length) return;
  vals.push(wpId);
  await db.execute(`UPDATE work_packages SET ${sets.join(', ')} WHERE id = ?`, vals);
}

// Auto-seed wp_tasks for a WP from project_tasks (Tareas page) +
// activity templates. Used when wp_tasks is empty for a WP, and
// callable manually via the resync endpoint.
//
// Sources (deduplicated):
//   1. WP1 only: project_management selections from project_tasks (mgmt checklist)
//   2. All WPs: activity-derived tasks (one per non-mgmt activity)
//        — uses saved-edit version from project_tasks if present, else template
//   3. All WPs: custom tasks from project_tasks (category='custom', subtype=String(wi))
//
// Descriptions are shortened to ≤10 words so tables stay compact.
async function seedWpTasksFromProject(wpId) {
  const [[wp]] = await db.execute(
    `SELECT id, project_id, order_index, code FROM work_packages WHERE id = ?`,
    [wpId]
  );
  if (!wp) return 0;
  const wi = String(wp.order_index ?? 0);

  const [acts] = await db.execute(
    `SELECT id, type, subtype, label, order_index FROM activities WHERE wp_id = ? ORDER BY order_index`,
    [wpId]
  );

  const [savedTasks] = await db.execute(
    `SELECT category, subtype, title, description, partner_id, wp_id FROM project_tasks
      WHERE project_id = ? ORDER BY sort_order, created_at`,
    [wp.project_id]
  );

  // Determine the WP leader as a sensible default if a task has no explicit leader.
  // Falls back to NULL if WP has no leader assigned.
  const wpLeaderId = (await db.execute(
    `SELECT leader_id FROM work_packages WHERE id = ? LIMIT 1`, [wpId]
  ))[0][0]?.leader_id || null;

  const seedRows = [];

  // 1. WP1 only: management selections (dedup by subtype to handle stale duplicates)
  // Mgmt tasks accept ANY project partner as leader — no budget check.
  if (wi === '0') {
    const seenSub = new Set();
    for (const t of savedTasks) {
      if (t.category !== 'project_management') continue;
      if (seenSub.has(t.subtype)) continue;
      seenSub.add(t.subtype);
      const tmpl = _findTemplateBySubtypeKey('project_management', t.subtype);
      seedRows.push({
        title: t.title || tmpl?.title || 'Project management task',
        description: _shortDescription(t.description || tmpl?.description),
        lead_partner_id: t.partner_id || wpLeaderId,
        is_management: true,
      });
    }
  }

  // 2. Activities-derived (skip mgmt — already covered above for WP1)
  for (const act of acts) {
    if (act.type === 'mgmt') continue;
    const category = ACT_TYPE_TO_TEMPLATE_CAT[act.type];
    if (!category) continue;
    const tmpl = _findTemplateBySubtypeLabel(category, act.subtype);
    if (!tmpl) continue;
    const saved = savedTasks.find(t =>
      t.category === category && t.subtype === tmpl.key && String(t.wp_id) === wi
    );
    seedRows.push({
      title: saved?.title || tmpl.title,
      description: _shortDescription(saved?.description || tmpl.description),
      lead_partner_id: saved?.partner_id || wpLeaderId,
      is_management: false,
    });
  }

  // 3. Custom tasks for this WP
  for (const t of savedTasks) {
    if (t.category !== 'custom' || t.subtype !== wi) continue;
    if (!t.title && !t.description) continue;
    seedRows.push({
      title: t.title || 'Custom task',
      description: _shortDescription(t.description),
      lead_partner_id: t.partner_id || wpLeaderId,
      is_management: false,
    });
  }

  // Validate lead_partner_id against budget eligibility for non-mgmt tasks.
  // Management tasks (WP1 mgmt checklist) intentionally allow any partner.
  const { eligibleIds } = await getEligiblePartnersForWp(wpId);
  for (const r of seedRows) {
    if (r.is_management) continue;
    if (r.lead_partner_id && !eligibleIds.has(r.lead_partner_id)) r.lead_partner_id = null;
  }

  // Code prefix derived from wp.code or order
  const wpNum = parseInt(String(wp.code || '').replace(/[^0-9]/g, '')) || ((wp.order_index ?? 0) + 1);
  for (let i = 0; i < seedRows.length; i++) {
    await db.execute(
      `INSERT INTO wp_tasks (id, work_package_id, project_id, code, title, description, lead_partner_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [genUUID(), wpId, wp.project_id, `T${wpNum}.${i + 1}`, seedRows[i].title, seedRows[i].description, seedRows[i].lead_partner_id, i]
    );
  }
  return seedRows.length;
}

// 2.1.3 Project teams — list/update the editable staff table.
// Rows = project_partner_staff with selected=1, joined with the staffer's
// directory record (name, generic role, default skills) and partner.
async function listStaffTable(projectId, userId) {
  const [[proj]] = await db.execute(
    `SELECT id FROM projects WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
  if (!proj) { const e = new Error('Project not found'); e.status = 404; throw e; }
  const [rows] = await db.execute(
    `SELECT pps.id, pps.staff_id, pps.partner_id, pps.project_role, pps.custom_skills,
            ks.name AS full_name, ks.role AS directory_role, ks.skills_summary AS directory_bio,
            p.name AS partner_name, p.legal_name AS partner_legal_name, p.country, p.role AS partner_role
       FROM project_partner_staff pps
       JOIN org_key_staff ks ON ks.id = pps.staff_id
       JOIN partners p       ON p.id  = pps.partner_id
      WHERE pps.project_id = ? AND pps.selected = 1
      ORDER BY p.role DESC, p.order_index, ks.name`,
    [projectId]
  );
  return rows;
}

async function updateStaffTableRow(ppsId, userId, body) {
  // Verify ownership: pps row belongs to a project owned by this user.
  const [[row]] = await db.execute(
    `SELECT pps.id, pps.project_id
       FROM project_partner_staff pps
       JOIN projects p ON p.id = pps.project_id
      WHERE pps.id = ? AND p.user_id = ?`,
    [ppsId, userId]
  );
  if (!row) { const e = new Error('Staff row not found'); e.status = 404; throw e; }

  const fields = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'project_role')) {
    fields.push('project_role = ?');
    values.push(body.project_role || null);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'custom_skills')) {
    fields.push('custom_skills = ?');
    values.push(body.custom_skills || null);
  }
  if (!fields.length) return { id: ppsId, changed: 0 };
  values.push(ppsId);
  await db.execute(
    `UPDATE project_partner_staff SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return { id: ppsId, changed: fields.length };
}

// 2.1.5 Project risks — CRUD over project_risks (one row per risk).
async function _assertProjectOwned(projectId, userId) {
  const [[row]] = await db.execute(
    `SELECT id FROM projects WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
  if (!row) { const e = new Error('Project not found'); e.status = 404; throw e; }
}

async function listProjectRisks(projectId, userId) {
  await _assertProjectOwned(projectId, userId);
  const [rows] = await db.execute(
    `SELECT id, project_id, wp_id, risk_no, description, mitigation,
            likelihood, impact, sort_order
       FROM project_risks
      WHERE project_id = ?
      ORDER BY sort_order, created_at`,
    [projectId]
  );
  return rows;
}

async function createProjectRisk(projectId, userId, body = {}) {
  await _assertProjectOwned(projectId, userId);
  const id = genUUID();
  const [[{ next_order }]] = await db.execute(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_risks WHERE project_id = ?`,
    [projectId]
  );
  const [[{ next_no }]] = await db.execute(
    `SELECT COALESCE(COUNT(*), 0) + 1 AS next_no FROM project_risks WHERE project_id = ?`,
    [projectId]
  );
  const code = body.risk_no || `R${next_no}`;
  await db.execute(
    `INSERT INTO project_risks
       (id, project_id, wp_id, risk_no, description, mitigation, likelihood, impact, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, projectId, body.wp_id || null, code,
     body.description || null, body.mitigation || null,
     body.likelihood || null, body.impact || null,
     body.sort_order != null ? body.sort_order : next_order]
  );
  const [[row]] = await db.execute(`SELECT * FROM project_risks WHERE id = ?`, [id]);
  return row;
}

async function _assertRiskOwned(riskId, userId) {
  const [[row]] = await db.execute(
    `SELECT r.id, r.project_id FROM project_risks r
       JOIN projects p ON p.id = r.project_id
      WHERE r.id = ? AND p.user_id = ?`,
    [riskId, userId]
  );
  if (!row) { const e = new Error('Risk not found'); e.status = 404; throw e; }
  return row;
}

async function updateProjectRisk(riskId, userId, body = {}) {
  await _assertRiskOwned(riskId, userId);
  const allowed = ['risk_no', 'wp_id', 'description', 'mitigation', 'likelihood', 'impact', 'sort_order'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      fields.push(`${k} = ?`);
      values.push(body[k] === '' ? null : body[k]);
    }
  }
  if (!fields.length) return { id: riskId, changed: 0 };
  values.push(riskId);
  await db.execute(
    `UPDATE project_risks SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return { id: riskId, changed: fields.length };
}

async function deleteProjectRisk(riskId, userId) {
  await _assertRiskOwned(riskId, userId);
  await db.execute(`DELETE FROM project_risks WHERE id = ?`, [riskId]);
  return { id: riskId, deleted: true };
}

// AI-generate at least 8 risks from the project context (problem, partners,
// WPs, activities). Replaces existing rows for this project — user is meant
// to call this when the table is empty or wants a fresh draft, then edit.
async function aiGenerateProjectRisks(projectId, userId) {
  await _assertProjectOwned(projectId, userId);

  // Load context.
  const [[project]] = await db.execute(
    `SELECT id, name, full_name, type, description, duration_months, proposal_lang
       FROM projects WHERE id = ?`,
    [projectId]
  );
  const [partners] = await db.execute(
    `SELECT id, name, country, role FROM partners WHERE project_id = ? ORDER BY role DESC, order_index`,
    [projectId]
  );
  const [wps] = await db.execute(
    `SELECT id, code, title, summary, order_index
       FROM work_packages WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );
  const [activities] = wps.length ? await db.execute(
    `SELECT a.wp_id, a.label, a.subtype, a.type
       FROM activities a JOIN work_packages w ON w.id = a.wp_id
      WHERE w.project_id = ? ORDER BY w.order_index, a.order_index`,
    [projectId]
  ) : [[]];
  const [[ctxRow]] = await db.execute(
    `SELECT problem, target_groups, approach FROM intake_contexts WHERE project_id = ? LIMIT 1`,
    [projectId]
  );

  const wpsForPrompt = wps.map(w => ({
    code: w.code,
    title: w.title,
    summary: (w.summary || '').slice(0, 400),
    activities: activities.filter(a => a.wp_id === w.id).map(a => `${a.label}${a.subtype ? ' ('+a.subtype+')' : ''}`),
  }));
  const wpCodes = wps.map(w => w.code).join(', ');
  const lang = project.proposal_lang || 'es';

  const system = `You are an EACEA-grade evaluator and senior project manager analysing risks for a European project. You produce risk-management tables that meet EACEA/Erasmus+ standards.

Output a JSON object with shape:
{
  "risks": [
    {
      "risk_no": "R1",
      "description": "<concise risk description, INCLUDING impact and likelihood as 'Impact: <low|medium|high> · Likelihood: <low|medium|high>' inline>",
      "wp_code": "<WP code from the list, or null if cross-cutting>",
      "likelihood": "<low|medium|high>",
      "impact": "<low|medium|high>",
      "mitigation": "<concrete preventive AND corrective actions>"
    }
  ]
}

Rules:
- Return at LEAST 8 risks. 10-12 is the sweet spot for a balanced project.
- Cover the four main risk families: management/governance, technical/methodological, partnership/consortium, dissemination/sustainability.
- Mix likelihoods and impacts realistically (don't make every risk "high/high").
- Mitigation must be actionable, not generic ("set up monthly meetings" beats "ensure good communication").
- Description language: ${lang === 'es' ? 'Spanish' : lang === 'en' ? 'English' : lang}.
- Numbering: R1, R2, R3, ... in order of priority (most critical first).
- Only output the JSON object, no markdown, no commentary.`;

  const user = `PROJECT
Name: ${project.full_name || project.name}
Type / call: ${project.type}
Duration: ${project.duration_months || '?'} months

CONTEXT
Problem: ${(ctxRow?.problem || '').slice(0, 800)}
Target groups: ${(ctxRow?.target_groups || '').slice(0, 400)}
Approach: ${(ctxRow?.approach || '').slice(0, 400)}

PARTNERS (${partners.length})
${partners.map(p => `- ${p.name} [${p.country}, ${p.role}]`).join('\n')}

WORK PACKAGES (use exact codes: ${wpCodes})
${wpsForPrompt.map(w => `- ${w.code} — ${w.title}\n  ${w.summary}\n  Activities: ${w.activities.join(' · ') || '—'}`).join('\n')}

Generate the risks JSON now.`;

  const raw = await callClaude(system, user, 4096);
  // Extract JSON object from the response.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI did not return JSON');
  let parsed;
  try { parsed = JSON.parse(match[0]); }
  catch (e) { throw new Error('AI JSON parse error: ' + e.message); }
  const list = Array.isArray(parsed.risks) ? parsed.risks : [];
  if (list.length < 4) throw new Error('AI returned too few risks (' + list.length + ')');

  const wpByCode = {};
  for (const w of wps) wpByCode[(w.code || '').toUpperCase()] = w.id;
  const norm = (v) => {
    const s = String(v || '').toLowerCase();
    if (['low', 'medium', 'high'].includes(s)) return s;
    return null;
  };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM project_risks WHERE project_id = ?`, [projectId]);
    let i = 0;
    for (const r of list) {
      const id = genUUID();
      const wpId = r.wp_code ? wpByCode[String(r.wp_code).toUpperCase()] || null : null;
      await conn.execute(
        `INSERT INTO project_risks
           (id, project_id, wp_id, risk_no, description, mitigation,
            likelihood, impact, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, wpId, r.risk_no || `R${i+1}`,
         r.description || null, r.mitigation || null,
         norm(r.likelihood), norm(r.impact), i]
      );
      i++;
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback(); throw err;
  } finally {
    conn.release();
  }

  // Return the freshly-stored rows.
  return await listProjectRisks(projectId, userId);
}

// AI evaluator for the risks table (section 2.1.5). Returns a JSON report
// with overall score, summary, missing dimensions ("gaps") and concrete
// per-row improvement suggestions that the UI can apply via PATCH.
async function aiEvaluateProjectRisks(projectId, userId) {
  await _assertProjectOwned(projectId, userId);

  const [[project]] = await db.execute(
    `SELECT id, name, full_name, type, duration_months, proposal_lang
       FROM projects WHERE id = ?`,
    [projectId]
  );
  const [wps] = await db.execute(
    `SELECT id, code, title, summary
       FROM work_packages WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );
  const wpById = {};
  for (const w of wps) wpById[w.id] = w;
  const [risks] = await db.execute(
    `SELECT id, risk_no, description, mitigation, likelihood, impact, wp_id
       FROM project_risks WHERE project_id = ? ORDER BY sort_order, created_at`,
    [projectId]
  );
  if (!risks.length) {
    const e = new Error('La tabla de riesgos está vacía. Pulsa "Autocompletar con IA" antes de evaluar.');
    e.status = 400; throw e;
  }

  const lang = project.proposal_lang || 'es';
  const system = `You are an EACEA evaluator analysing the risk-management table of a European project (Application Form Part B, section 2.1.5) under the criterion "Quality of project design and implementation".

Output strictly the following JSON object:
{
  "score": <integer 0-10>,
  "summary": "<2-3 line overall assessment>",
  "gaps": [
    { "title": "<missing risk dimension>", "severity": "high|medium|low", "why_critical": "<why this matters for the evaluation>" }
  ],
  "row_suggestions": [
    { "row_id": "<exact id from CURRENT RISKS>", "field": "description|mitigation|likelihood|impact", "current": "<current value, verbatim>", "suggested": "<the new value, ready to write to the DB>", "why": "<short reasoning, MAX 1-2 sentences>" }
  ]
}

CRITICAL — what goes in "suggested":
- For field = "likelihood" or "impact": the value MUST be EXACTLY one of "low" | "medium" | "high" (lowercase, no extra text). Do NOT put a justification here — that goes in "why".
- For field = "description" or "mitigation": the new full text the user should paste into that cell.

Guidance:
- 0–3 GAPS: whole-table dimensions missing (e.g. "no risk on partner withdrawal", "no risk on data protection / GDPR for participant data", "no safety risk for mobility activities", "no diss/IP risk").
- 0–5 ROW_SUGGESTIONS: highest-impact improvements on existing rows. Vague descriptions, generic mitigations, mismatched impact/likelihood, wrong WP attribution.
- Be specific and concise. "Set up monthly meetings" is generic; prefer "Monthly steering committee with rotating chair, written minutes circulated within 48 h".
- Score: 1-3 very poor, 4-5 mediocre, 6-7 acceptable, 8-9 strong, 10 excellent.
- Language of summary / gaps / suggestions: ${lang === 'es' ? 'Spanish' : lang === 'en' ? 'English' : lang}.
- Use exact row IDs from the CURRENT RISKS list — do NOT invent IDs.
- Return only the JSON object, no markdown, no commentary.`;

  const user = `PROJECT
Name: ${project.full_name || project.name}
Type / call: ${project.type}
Duration: ${project.duration_months || '?'} months

WORK PACKAGES
${wps.map(w => `${w.code} — ${w.title}`).join('\n')}

CURRENT RISKS (${risks.length})
${risks.map(r => {
  const wpCode = r.wp_id ? (wpById[r.wp_id]?.code || '?') : 'cross-cutting';
  return `[${r.id}] ${r.risk_no || '?'} (impact=${r.impact || '?'}, likelihood=${r.likelihood || '?'}, wp=${wpCode})
  Description: ${r.description || '(empty)'}
  Mitigation: ${r.mitigation || '(empty)'}`;
}).join('\n\n')}

Evaluate the table now.`;

  const raw = await callClaude(system, user, 4096);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI did not return JSON');
  let parsed;
  try { parsed = JSON.parse(match[0]); }
  catch (e) { throw new Error('AI JSON parse error: ' + e.message); }

  // Sanitize: keep only known fields, filter row_suggestions to existing IDs.
  const validIds = new Set(risks.map(r => r.id));
  const allowedFields = new Set(['description', 'mitigation', 'likelihood', 'impact']);
  const score = Math.max(0, Math.min(10, parseInt(parsed.score, 10) || 0));
  const gaps = Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5).map(g => ({
    title: String(g.title || '').trim(),
    severity: ['high', 'medium', 'low'].includes(String(g.severity || '').toLowerCase()) ? String(g.severity).toLowerCase() : 'medium',
    why_critical: String(g.why_critical || '').trim(),
  })).filter(g => g.title) : [];
  // For enum columns (likelihood / impact), `suggested` must be exactly one
  // of low|medium|high — the AI sometimes returns a full-prose justification
  // instead. Coerce when possible, drop the suggestion when not.
  const enumFields = new Set(['likelihood', 'impact']);
  const coerceEnum = (raw) => {
    const s = String(raw || '').toLowerCase();
    // Accept explicit values; otherwise try to find a clean keyword in prose.
    if (s === 'low' || s === 'medium' || s === 'high') return s;
    const tokens = s.match(/\b(low|medium|high)\b/g) || [];
    if (tokens.length === 1) return tokens[0];
    return null;  // ambiguous or none → drop
  };

  const row_suggestions = Array.isArray(parsed.row_suggestions) ? parsed.row_suggestions
    .filter(s => validIds.has(s.row_id) && allowedFields.has(s.field))
    .map(s => {
      const out = {
        row_id: s.row_id,
        field: s.field,
        current: String(s.current || '').trim(),
        suggested: String(s.suggested || '').trim(),
        why: String(s.why || '').trim(),
      };
      if (enumFields.has(s.field)) {
        const v = coerceEnum(s.suggested);
        if (!v) return null;  // drop suggestion if we cannot resolve a clean value
        out.suggested = v;
      }
      return out;
    })
    .filter(Boolean)
    .slice(0, 8) : [];

  return {
    score,
    summary: String(parsed.summary || '').trim(),
    gaps,
    row_suggestions,
    risks_count: risks.length,
  };
}

// Wipe + re-seed wp_tasks for a WP (used by resync button).
// Cascades: wp_task_participants are removed via FK ON DELETE CASCADE.
async function resyncWpTasks(wpId, userId) {
  await _assertWp(wpId, userId);
  await db.execute(`DELETE FROM wp_tasks WHERE work_package_id = ?`, [wpId]);
  return await seedWpTasksFromProject(wpId);
}

/**
 * Best-effort sync: project_tasks.partner_id → wp_tasks.lead_partner_id.
 *
 * The two tables are not linked by FK. When the user assigns a task leader
 * in *Escribir → Tareas* it lands on project_tasks.partner_id; meanwhile
 * the DMS generator reads wp_tasks.lead_partner_id. This function bridges
 * the two by matching on three signals:
 *   1) Exact template-title match within the same WP.
 *   2) Activity-derived ordering: i-th non-mgmt project_task in a WP →
 *      i-th non-mgmt wp_task in the same WP (best fallback).
 *   3) WP1 management items: project_management subtype → wp_task whose
 *      title matches the template's title for that subtype.
 *
 * Only UPDATEs wp_tasks rows whose lead_partner_id IS NULL — never
 * overwrites a manually-set leader.
 *
 * Idempotent. Cheap enough to run lazily on every DMS generation.
 */
async function syncWpTaskLeadersFromProjectTasks(projectId) {
  const [pts] = await db.execute(
    `SELECT id, category, subtype, wp_id, title, partner_id
       FROM project_tasks
      WHERE project_id = ? AND partner_id IS NOT NULL
      ORDER BY sort_order, created_at`,
    [projectId]
  );
  if (!pts.length) return { applied: 0 };

  const [wps] = await db.execute(
    `SELECT id, order_index FROM work_packages WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );

  let applied = 0;

  for (const wp of wps) {
    const wi = String(wp.order_index ?? 0);
    const [wpTasks] = await db.execute(
      `SELECT id, title, sort_order FROM wp_tasks
        WHERE work_package_id = ? AND lead_partner_id IS NULL
        ORDER BY sort_order, created_at`,
      [wp.id]
    );
    if (!wpTasks.length) continue;

    const assigned = new Set();

    // Pass 1: title match against the template's stock title.
    // Catches wp_tasks whose title comes verbatim from the template.
    const wpPts = pts.filter(pt => String(pt.wp_id) === wi || (wi === '0' && pt.category === 'project_management'));
    for (const wpt of wpTasks) {
      if (assigned.has(wpt.id)) continue;
      const wptTitle = (wpt.title || '').toLowerCase().trim();
      if (!wptTitle) continue;
      for (const pt of wpPts) {
        const tmpl = _findTemplateBySubtypeKey(pt.category, pt.subtype);
        if (!tmpl) continue;
        const tmplTitle = (tmpl.title || '').toLowerCase().trim();
        if (!tmplTitle) continue;
        if (wptTitle === tmplTitle) {
          await db.execute(`UPDATE wp_tasks SET lead_partner_id = ? WHERE id = ? AND lead_partner_id IS NULL`, [pt.partner_id, wpt.id]);
          assigned.add(wpt.id);
          applied++;
          break;
        }
      }
    }

    // Pass 2: activity-order fallback. Walk WP activities in order and pair
    // the i-th non-mgmt activity's project_task with the i-th still-unmatched
    // non-mgmt wp_task. This catches AI-generated wp_tasks whose titles drift
    // from the template but maintain the activity order.
    const [acts] = await db.execute(
      `SELECT id, type, subtype FROM activities WHERE wp_id = ? ORDER BY order_index`,
      [wp.id]
    );
    const activityPartners = [];
    for (const act of acts) {
      if (act.type === 'mgmt') continue;
      const category = ACT_TYPE_TO_TEMPLATE_CAT[act.type];
      if (!category) { activityPartners.push(null); continue; }
      const tmpl = _findTemplateBySubtypeLabel(category, act.subtype);
      if (!tmpl) { activityPartners.push(null); continue; }
      const pt = wpPts.find(t => t.category === category && t.subtype === tmpl.key);
      activityPartners.push(pt?.partner_id || null);
    }
    const unmatched = wpTasks.filter(t => !assigned.has(t.id));
    for (let i = 0; i < unmatched.length && i < activityPartners.length; i++) {
      const pid = activityPartners[i];
      if (!pid) continue;
      await db.execute(`UPDATE wp_tasks SET lead_partner_id = ? WHERE id = ? AND lead_partner_id IS NULL`, [pid, unmatched[i].id]);
      assigned.add(unmatched[i].id);
      applied++;
    }
  }

  return { applied };
}

/**
 * Compute the set of project partner IDs that have any budget cost > 0
 * in a given WP. Eligibility rule: solo los partners que reciben importe
 * en el presupuesto del WP pueden liderar/participar en las tasks del WP.
 *
 * El matching budget_beneficiaries → partners es por (1) name/acronym y
 * (2) fallback posicional (sort_order ↔ order_index) — necesario porque
 * al renombrar un partner en Diseñar, la fila de budget_beneficiaries
 * conserva el nombre antiguo hasta que se rehace el presupuesto.
 *
 * Returns { eligibleIds: Set<string>, projectId: string }.
 */
async function getEligiblePartnersForWp(wpId) {
  const [wpRows] = await db.execute(
    `SELECT id, project_id, code, order_index FROM work_packages WHERE id = ? LIMIT 1`,
    [wpId]
  );
  if (!wpRows.length) return { eligibleIds: new Set(), projectId: null };
  const wp = wpRows[0];

  const [partners] = await db.execute(
    `SELECT id, name, legal_name, order_index FROM partners WHERE project_id = ? ORDER BY order_index, id`,
    [wp.project_id]
  );
  const partnerByKey = {};
  for (const p of partners) {
    if (p.name) partnerByKey[p.name.toLowerCase().trim()] = p.id;
    if (p.legal_name) partnerByKey[p.legal_name.toLowerCase().trim()] = p.id;
  }

  const [budgets] = await db.execute(
    `SELECT id FROM budget_projects WHERE project_id = ? LIMIT 1`,
    [wp.project_id]
  );
  if (!budgets.length) return { eligibleIds: new Set(), projectId: wp.project_id };
  const budgetId = budgets[0].id;

  const [bwps] = await db.execute(
    `SELECT id, label FROM budget_work_packages WHERE budget_id = ? ORDER BY number`,
    [budgetId]
  );
  let bwp = bwps.find(b => b.label && wp.code && b.label.startsWith(wp.code + ' '));
  if (!bwp) bwp = bwps[Math.max(0, wp.order_index || 0)] || null;
  if (!bwp) return { eligibleIds: new Set(), projectId: wp.project_id };

  // Build the full ordered list of beneficiaries so we can fall back to
  // positional matching for partners renamed after the budget was synced.
  const [allBenefs] = await db.execute(
    `SELECT bb.id, bb.acronym, bb.name, bb.sort_order, bb.number,
            COALESCE(SUM(bc.total_cost), 0) AS total_in_wp
       FROM budget_beneficiaries bb
       LEFT JOIN budget_costs bc ON bc.beneficiary_id = bb.id AND bc.budget_id = bb.budget_id AND bc.wp_id = ?
      WHERE bb.budget_id = ?
      GROUP BY bb.id
      ORDER BY bb.sort_order, bb.number`,
    [bwp.id, budgetId]
  );

  const eligibleIds = new Set();
  for (let i = 0; i < allBenefs.length; i++) {
    const r = allBenefs[i];
    if (Number(r.total_in_wp) <= 0) continue;
    // 1) Try name/acronym match
    let id = partnerByKey[(r.acronym || '').toLowerCase().trim()]
          || partnerByKey[(r.name || '').toLowerCase().trim()];
    // 2) Fallback: positional match (i-th beneficiary → i-th project partner)
    if (!id && partners[i]) id = partners[i].id;
    if (id) eligibleIds.add(id);
  }
  return { eligibleIds, projectId: wp.project_id };
}

/**
 * Reconcile wp_task_participants for every task in a WP so the participants
 * match the budget-based eligibility (regla: si la entidad recibe importe en
 * el presupuesto del WP, participa obligatoriamente; si no, queda fuera).
 * Idempotent.
 */
async function syncTaskParticipantsToEligibility(wpId, eligibleIds) {
  const [tasks] = await db.execute(
    `SELECT id FROM wp_tasks WHERE work_package_id = ?`,
    [wpId]
  );
  if (!tasks.length) return;
  const eligibleArr = [...eligibleIds];

  for (const t of tasks) {
    // Remove participants no longer eligible
    if (eligibleArr.length) {
      const placeholders = eligibleArr.map(() => '?').join(',');
      await db.execute(
        `DELETE FROM wp_task_participants WHERE task_id = ? AND partner_id NOT IN (${placeholders})`,
        [t.id, ...eligibleArr]
      );
    } else {
      await db.execute(`DELETE FROM wp_task_participants WHERE task_id = ?`, [t.id]);
    }
    // Add eligible partners that are not yet listed
    for (const pid of eligibleArr) {
      await db.execute(
        `INSERT INTO wp_task_participants (id, task_id, partner_id, role)
         VALUES (?, ?, ?, 'BEN')
         ON DUPLICATE KEY UPDATE role = role`,
        [genUUID(), t.id, pid]
      );
    }
    // Clear lead_partner_id if the current leader is no longer eligible
    await db.execute(
      `UPDATE wp_tasks SET lead_partner_id = NULL
        WHERE id = ? AND lead_partner_id IS NOT NULL
          AND lead_partner_id NOT IN (${eligibleArr.length ? eligibleArr.map(() => '?').join(',') : 'NULL'})`,
      eligibleArr.length ? [t.id, ...eligibleArr] : [t.id]
    );
  }
}

async function listWpTasks(wpId) {
  let [tasks] = await db.execute(
    `SELECT * FROM wp_tasks WHERE work_package_id = ? ORDER BY sort_order, created_at`,
    [wpId]
  );
  if (!tasks.length) {
    const seeded = await seedWpTasksFromProject(wpId);
    if (seeded > 0) {
      [tasks] = await db.execute(
        `SELECT * FROM wp_tasks WHERE work_package_id = ? ORDER BY sort_order, created_at`,
        [wpId]
      );
    }
  }

  // Sync participants to budget-based eligibility BEFORE reading them so the
  // returned list is always coherent with the budget.
  const { eligibleIds } = await getEligiblePartnersForWp(wpId);
  if (tasks.length) {
    await syncTaskParticipantsToEligibility(wpId, eligibleIds);
    // Re-read tasks in case lead_partner_id was cleared
    [tasks] = await db.execute(
      `SELECT * FROM wp_tasks WHERE work_package_id = ? ORDER BY sort_order, created_at`,
      [wpId]
    );
  }

  if (!tasks.length) return [];
  const taskIds = tasks.map(t => t.id);
  const placeholders = taskIds.map(() => '?').join(',');
  const [parts] = await db.execute(
    `SELECT tp.task_id, tp.partner_id, tp.role, tp.sort_order,
            p.name AS partner_name, p.country AS partner_country
       FROM wp_task_participants tp
       JOIN partners p ON p.id = tp.partner_id
      WHERE tp.task_id IN (${placeholders})
      ORDER BY tp.sort_order, p.order_index`,
    taskIds
  );
  const partsByTask = {};
  for (const p of parts) {
    (partsByTask[p.task_id] ||= []).push(p);
  }
  const eligibleIdsArr = [...eligibleIds];
  return tasks.map(t => ({
    ...t,
    participants: partsByTask[t.id] || [],
    eligible_partner_ids: eligibleIdsArr,
  }));
}

async function createWpTask(wpId, userId, data) {
  const wp = await _assertWp(wpId, userId);
  const id = genUUID();
  const leadId = data.lead_partner_id || null;
  await db.execute(
    `INSERT INTO wp_tasks (id, work_package_id, project_id, code, title, description, lead_partner_id, in_kind_subcontracting, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, wpId, wp.project_id,
      data.code || null,
      data.title || 'New task',
      data.description || null,
      leadId,
      data.in_kind_subcontracting || null,
      data.sort_order || 0,
    ]
  );
  if (Array.isArray(data.participants)) {
    for (const part of data.participants) {
      if (!part.partner_id) continue;
      await db.execute(
        `INSERT INTO wp_task_participants (id, task_id, partner_id, role, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        [genUUID(), id, part.partner_id, part.role || 'BEN', part.sort_order || 0]
      );
    }
  }
  return id;
}

async function _assertTask(taskId, userId) {
  const [rows] = await db.execute(
    `SELECT t.id, t.work_package_id, t.project_id
       FROM wp_tasks t
       JOIN projects p ON p.id = t.project_id
      WHERE t.id = ? AND p.user_id = ?`,
    [taskId, userId]
  );
  if (!rows.length) { const e = new Error('Task not found'); e.status = 404; throw e; }
  return rows[0];
}

async function updateWpTask(taskId, userId, data) {
  await _assertTask(taskId, userId);
  // Note: lead_partner_id is NOT validated against budget eligibility here.
  // The UI enforces eligibility for ordinary tasks; project-management tasks
  // (WP1 mgmt checklist) intentionally allow ANY project partner as leader.
  const allowed = ['code', 'title', 'description', 'in_kind_subcontracting', 'sort_order', 'lead_partner_id'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (data[k] !== undefined) { sets.push(`${k} = ?`); vals.push(data[k] === '' ? null : data[k]); }
  }
  if (!sets.length) return;
  vals.push(taskId);
  await db.execute(`UPDATE wp_tasks SET ${sets.join(', ')} WHERE id = ?`, vals);
}

async function deleteWpTask(taskId, userId) {
  await _assertTask(taskId, userId);
  await db.execute('DELETE FROM wp_tasks WHERE id = ?', [taskId]);
}

async function setTaskParticipant(taskId, userId, partnerId, role) {
  await _assertTask(taskId, userId);
  await db.execute(
    `INSERT INTO wp_task_participants (id, task_id, partner_id, role)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [genUUID(), taskId, partnerId, role || 'BEN']
  );
}

async function removeTaskParticipant(taskId, userId, partnerId) {
  await _assertTask(taskId, userId);
  await db.execute(
    'DELETE FROM wp_task_participants WHERE task_id = ? AND partner_id = ?',
    [taskId, partnerId]
  );
}

/* ── WP Budget pivot ────────────────────────────────────────────
   Reads from budget_costs and pivots into the form columns:
   A · B · C.1a (Travel) · C.1b (Accommodation) · C.1c (Subsistence)
   · C.2 (Equipment) · C.3 (Other) · D.1 · E (indirect) · Total.
   The match between budget_work_packages and work_packages is by
   label prefix (label = `${wp.code} — ${wp.title}` at sync time).
   ────────────────────────────────────────────────────────────── */

async function getWpBudget(wpId, userId) {
  const wp = await _assertWp(wpId, userId);
  const [wpInfo] = await db.execute(
    `SELECT code, order_index FROM work_packages WHERE id = ?`,
    [wpId]
  );
  if (!wpInfo.length) return null;
  const wpCode = wpInfo[0].code;
  const wpOrder = wpInfo[0].order_index;

  const [budgets] = await db.execute(
    `SELECT id, indirect_pct FROM budget_projects WHERE project_id = ? LIMIT 1`,
    [wp.project_id]
  );
  if (!budgets.length) return { rows: [], total: 0, indirect_pct: 0, matched: false };
  const budgetId = budgets[0].id;
  const indirectPct = Number(budgets[0].indirect_pct || 0);

  // Find the matching budget_work_package: prefer label starting with `${wpCode} —`,
  // fall back to ordinal position (number = order_index + 1).
  const [bwps] = await db.execute(
    `SELECT id, number, label FROM budget_work_packages WHERE budget_id = ? ORDER BY number`,
    [budgetId]
  );
  let bwp = bwps.find(b => b.label && wpCode && b.label.startsWith(wpCode + ' '));
  if (!bwp) bwp = bwps[Math.max(0, wpOrder)] || null;
  if (!bwp) return { rows: [], total: 0, indirect_pct: indirectPct, matched: false };

  // Pivot per beneficiary
  const [rows] = await db.execute(
    `SELECT bb.id AS beneficiary_id, bb.name, bb.acronym, bb.is_coordinator,
            COALESCE(SUM(CASE WHEN bc.category = 'A' THEN bc.total_cost ELSE 0 END), 0) AS a_personnel,
            COALESCE(SUM(CASE WHEN bc.category = 'B' THEN bc.total_cost ELSE 0 END), 0) AS b_subcontracting,
            COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C1' AND bc.line_item = 'Travel'        THEN bc.total_cost ELSE 0 END), 0) AS c1a_travel,
            COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C1' AND bc.line_item = 'Accommodation' THEN bc.total_cost ELSE 0 END), 0) AS c1b_accommodation,
            COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C1' AND bc.line_item = 'Subsistence'   THEN bc.total_cost ELSE 0 END), 0) AS c1c_subsistence,
            COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C2' THEN bc.total_cost ELSE 0 END), 0) AS c2_equipment,
            COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C3' THEN bc.total_cost ELSE 0 END), 0) AS c3_other,
            COALESCE(SUM(CASE WHEN bc.category = 'D' THEN bc.total_cost ELSE 0 END), 0) AS d1_third_parties,
            COALESCE(SUM(bc.total_cost), 0) AS direct_total
       FROM budget_beneficiaries bb
       LEFT JOIN budget_costs bc
         ON bc.beneficiary_id = bb.id
        AND bc.budget_id = bb.budget_id
        AND bc.wp_id = ?
      WHERE bb.budget_id = ?
      GROUP BY bb.id
      ORDER BY bb.sort_order, bb.number`,
    [bwp.id, budgetId]
  );

  const enriched = rows.map(r => {
    const direct = Number(r.direct_total || 0);
    const e_indirect = Math.round(direct * indirectPct) / 100;
    return { ...r, e_indirect, total: direct + e_indirect };
  });
  const total = enriched.reduce((s, r) => s + r.total, 0);
  return { rows: enriched, total, indirect_pct: indirectPct, matched: true };
}

/* Regenerate the budget v2 (tablas budget_*) from the current calc_state.
 * Called automatically by the Writer before reading any budget-derived view,
 * so the Estimated Budget Resources never goes out of sync with the Designer.
 * Idempotent. Preserves rows with is_user_override=1.
 *
 * Asserts ownership of the project before invoking the budget module.
 */
async function refreshProjectBudget(projectId, userId) {
  const [rows] = await db.execute(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [projectId, userId]
  );
  if (!rows.length) throw Object.assign(new Error('Project not found'), { status: 404 });
  const budgetModel = require('../budget/model');
  return await budgetModel.createFromIntake(userId, projectId);
}

async function listProjectPartners(projectId, userId) {
  const [rows] = await db.execute(
    `SELECT pa.id, pa.name, pa.legal_name, pa.country, pa.role, pa.order_index
       FROM partners pa
       JOIN projects pr ON pr.id = pa.project_id
      WHERE pa.project_id = ? AND pr.user_id = ?
      ORDER BY pa.order_index`,
    [projectId, userId]
  );
  return rows;
}

/* ── AI auto-fill for the whole WP form ─────────────────────────
   Synthesises Objectives / Tasks / Milestones / Deliverables from
   project context (Intake activities + partners + WP summary +
   problem/target_groups). REPLACES existing rows for this WP.
   ────────────────────────────────────────────────────────────── */

async function aiFillWp(wpId, userId, options = {}) {
  const ai = require('../../utils/ai');
  const wp = await _assertWp(wpId, userId);

  const VALID_TARGETS = ['objectives','tasks','milestones','deliverables'];
  const requested = Array.isArray(options.targets) ? options.targets.filter(t => VALID_TARGETS.includes(t)) : null;
  const targets = new Set(requested && requested.length ? requested : VALID_TARGETS);

  // Gather context: WP, partners, activities for this WP, project meta
  const [wpRows] = await db.execute(
    `SELECT id, code, title, summary, objectives, duration_from_month, duration_to_month
       FROM work_packages WHERE id = ?`,
    [wpId]
  );
  const wpInfo = wpRows[0] || {};

  const [partners] = await db.execute(
    `SELECT id, name, legal_name, country, role FROM partners
      WHERE project_id = ? ORDER BY order_index`,
    [wp.project_id]
  );

  const [activities] = await db.execute(
    `SELECT id, type, label, description FROM activities
      WHERE wp_id = ? ORDER BY order_index`,
    [wpId]
  );

  const [contexts] = await db.execute(
    `SELECT problem, target_groups, approach FROM intake_contexts
      WHERE project_id = ? LIMIT 1`,
    [wp.project_id]
  );
  const ctx = contexts[0] || {};

  const [projects] = await db.execute(
    `SELECT name, type, description, duration_months FROM projects WHERE id = ?`,
    [wp.project_id]
  );
  const project = projects[0] || {};

  const wpNum = (wpInfo.code || '').replace(/\D/g, '') || '1';

  const partnersForPrompt = partners.map(p =>
    `  - id=${p.id} | ${p.name || p.legal_name} (${p.country || '?'}) [${p.role}]`
  ).join('\n');

  const activitiesForPrompt = activities.length
    ? activities.map(a => `  - [${a.type}] ${a.label}${a.description ? ': ' + a.description.slice(0, 200) : ''}`).join('\n')
    : '  (no activities planned in Intake yet — synthesise reasonable defaults from the WP summary)';

  const sectionSpecs = {
    objectives: `"objectives": string. 2–4 short bullet lines starting with "• ", separated by \\n.`,
    tasks: `"tasks": array of 3–5 objects, each: { "code": "T${wpNum}.N", "title": short, "description": one line, "in_kind_subcontracting": "No" or "Yes — short reason", "participants": [{"partner_id": uuid_from_list, "role": one of "COO"|"BEN"|"AE"|"AP"|"OTHER"}] }. The applicant partner is COO; others default to BEN. Most tasks involve 2–4 partners.`,
    milestones: `"milestones": array of 2–3 objects, each: { "code": "MSN" (continuous globally — start at 1 for WP1), "title": short, "due_month": integer 1–${project.duration_months || 24}, "lead_partner_id": uuid_from_list, "description": one line, "verification": short means of verification }.`,
    deliverables: `"deliverables": array of 3–5 objects, each: { "code": "D${wpNum}.N", "title": short, "type": one of "R"|"DEM"|"DEC"|"DATA"|"DMP"|"ETHICS"|"SECURITY"|"OTHER", "dissemination_level": one of "PU"|"SEN"|"R-UE/EU-R"|"C-UE/EU-C"|"S-UE/EU-S", "due_month": integer, "lead_partner_id": uuid_from_list, "description": one line including format and language }.`,
  };
  const targetKeys = [...targets];
  const keysJson = targetKeys.map(k => `"${k}"`).join(', ');
  const specsBlock = targetKeys.map(k => sectionSpecs[k]).join('\n');

  const systemPrompt = `You are an Erasmus+ proposal expert filling Section 4.2 (Work Packages) of the EU Application Form Part B.

Output ONE JSON object with exactly these keys: ${keysJson}.

CONSTRAINTS — every cell must be SHORT (max ~one line, ~80 chars). The form has limited table space.

${specsBlock}

Use ONLY partner_id values from the provided list. Do not invent UUIDs.
Output only valid JSON, no markdown fences, no commentary.`;

  const userPrompt = `PROJECT: ${project.name || ''} (${project.type || ''})
Total duration: ${project.duration_months || 24} months
Problem: ${ctx.problem || '(not specified)'}
Target groups: ${ctx.target_groups || '(not specified)'}
Approach: ${ctx.approach || '(not specified)'}

THIS WORK PACKAGE: ${wpInfo.code || ''} — ${wpInfo.title || ''}
Summary: ${wpInfo.summary || '(not specified)'}
Duration: months ${wpInfo.duration_from_month || '?'} – ${wpInfo.duration_to_month || '?'}

PARTNERS (use these UUIDs as partner_id and lead_partner_id):
${partnersForPrompt || '  (no partners — leave participants/lead empty)'}

INTAKE ACTIVITIES PLANNED FOR THIS WP (synthesise tasks from these):
${activitiesForPrompt}

Return the JSON now.`;

  const raw = await ai.callClaude(systemPrompt, userPrompt, 4096);
  let parsed;
  try {
    // Strip optional code fences just in case
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const err = new Error('AI returned invalid JSON: ' + (e.message || ''));
    err.status = 502;
    throw err;
  }

  const partnerIds = new Set(partners.map(p => p.id));

  // Persist: only target sections are touched. Each target wipes-and-replaces
  // its rows for THIS WP. Other tables and other WPs are left untouched.
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (targets.has('objectives') && typeof parsed.objectives === 'string') {
      await conn.execute(`UPDATE work_packages SET objectives = ? WHERE id = ?`, [parsed.objectives, wpId]);
    }

    if (targets.has('tasks')) {
      await conn.execute(`DELETE FROM wp_tasks WHERE work_package_id = ?`, [wpId]);
      if (Array.isArray(parsed.tasks)) {
        for (let i = 0; i < parsed.tasks.length; i++) {
          const t = parsed.tasks[i] || {};
          const taskId = genUUID();
          await conn.execute(
            `INSERT INTO wp_tasks (id, work_package_id, project_id, code, title, description, in_kind_subcontracting, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [taskId, wpId, wp.project_id, t.code || `T${wpNum}.${i + 1}`, (t.title || 'Task').slice(0, 250), t.description || null, t.in_kind_subcontracting || null, i]
          );
          if (Array.isArray(t.participants)) {
            for (const p of t.participants) {
              if (!p.partner_id || !partnerIds.has(p.partner_id)) continue;
              try {
                await conn.execute(
                  `INSERT INTO wp_task_participants (id, task_id, partner_id, role) VALUES (?, ?, ?, ?)`,
                  [genUUID(), taskId, p.partner_id, (p.role || 'BEN').toUpperCase()]
                );
              } catch (e) { /* ignore dup */ }
            }
          }
        }
      }
    }

    if (targets.has('milestones')) {
      await conn.execute(`DELETE FROM milestones WHERE work_package_id = ?`, [wpId]);
      if (Array.isArray(parsed.milestones)) {
        for (let i = 0; i < parsed.milestones.length; i++) {
          const m = parsed.milestones[i] || {};
          const lead = partnerIds.has(m.lead_partner_id) ? m.lead_partner_id : null;
          await conn.execute(
            `INSERT INTO milestones (id, work_package_id, project_id, code, title, description, due_month, verification, lead_partner_id, sort_order, auto_generated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [genUUID(), wpId, wp.project_id, m.code || null, (m.title || 'Milestone').slice(0, 250), m.description || null, parseInt(m.due_month, 10) || null, m.verification || null, lead, i]
          );
        }
      }
    }

    if (targets.has('deliverables')) {
      await conn.execute(`DELETE FROM deliverables WHERE work_package_id = ?`, [wpId]);
      if (Array.isArray(parsed.deliverables)) {
        for (let i = 0; i < parsed.deliverables.length; i++) {
          const d = parsed.deliverables[i] || {};
          const lead = partnerIds.has(d.lead_partner_id) ? d.lead_partner_id : null;
          await conn.execute(
            `INSERT INTO deliverables (id, work_package_id, project_id, code, title, description, type, dissemination_level, due_month, lead_partner_id, sort_order, auto_generated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [genUUID(), wpId, wp.project_id, d.code || null, (d.title || 'Deliverable').slice(0, 250), d.description || null, d.type || null, d.dissemination_level || null, parseInt(d.due_month, 10) || null, lead, i]
          );
        }
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    targets: targetKeys,
    objectives: targets.has('objectives') ? (parsed.objectives || '') : undefined,
    tasks_count: targets.has('tasks') ? (parsed.tasks || []).length : undefined,
    milestones_count: targets.has('milestones') ? (parsed.milestones || []).length : undefined,
    deliverables_count: targets.has('deliverables') ? (parsed.deliverables || []).length : undefined,
  };
}

// Phase 1 of Evaluate-and-Refine: evaluate the current text, return the
// diagnosis + which 2 weaknesses would be targeted if the user chooses to
// refine. Decides whether refining makes sense at all (skip_reason).
async function refineEvaluatePhase(instanceId, sectionId, currentText, programId) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { skip_reason: 'AI key not configured.' };
  }
  const sectionTitle = await getSectionTitleAsync(sectionId);
  const [instRow] = await db.execute('SELECT project_id FROM form_instances WHERE id = ?', [instanceId]);
  const projId = instRow[0]?.project_id;
  const { langName } = projId ? await getProjectMeta(projId) : { langName: 'English' };
  const evaluation = await evaluateSection(currentText, sectionTitle, null, programId, langName);
  const score = typeof evaluation.score_estimate === 'number' ? evaluation.score_estimate : null;
  const weaknesses = evaluation.weaknesses || [];
  const suggestions = evaluation.suggestions || [];

  let skip_reason = null;
  if (score != null && score >= 8.5) {
    skip_reason = `Ya estás en ${score}/10 — zona de rendimientos decrecientes. Refinar podría empeorar el texto. Si quieres cambios puntuales, usa "Mejorar con IA" con una instrucción específica.`;
  } else if (!weaknesses.length) {
    skip_reason = 'El evaluador no ha identificado debilidades claras. No hay nada que refinar automáticamente.';
  }

  return {
    ...evaluation,
    would_target_weaknesses: weaknesses.slice(0, 2),
    would_target_suggestions: suggestions.slice(0, 3),
    skip_reason,
  };
}

// Phase 2 of Evaluate-and-Refine: takes the evaluation from phase 1 and a
// targeted improve pass, then re-evaluates. Auto-reverts on regression.
async function refineApplyPhase(instanceId, sectionId, currentText, beforeEval, projectContext, programId, coordinatorName) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: currentText, before: beforeEval, after: beforeEval, delta: 0, weaknesses_targeted: [] };
  }
  const sectionTitle = await getSectionTitleAsync(sectionId);
  const [instRow] = await db.execute('SELECT project_id FROM form_instances WHERE id = ?', [instanceId]);
  const projId = instRow[0]?.project_id;
  const { langName } = projId ? await getProjectMeta(projId) : { langName: 'English' };
  const beforeScore = typeof beforeEval.score_estimate === 'number' ? beforeEval.score_estimate : null;
  const topWeaknesses = (beforeEval.weaknesses || []).slice(0, 2);
  const topSuggestions = (beforeEval.suggestions || []).slice(0, 3);

  const targetScore = Math.min(10, Math.max(9, Math.ceil((beforeScore || 7) + 1.5)));
  const userRequest = `Improve this section to reach ${targetScore}/10. Focus ONLY on these high-impact issues, not a general polish:\n` +
    topWeaknesses.map((w, i) => `Issue ${i + 1}: ${w}`).join('\n') +
    (topSuggestions.length ? `\n\nConcrete suggestions to apply:\n` + topSuggestions.map((s) => `- ${s}`).join('\n') : '');

  const improved = await improveSectionCustom(
    instanceId, sectionId, currentText, userRequest, projectContext, programId, coordinatorName,
    { evaluation: beforeEval, targetScore }
  );

  const afterEval = await evaluateSection(improved, sectionTitle, null, programId, langName);
  const afterScore = typeof afterEval.score_estimate === 'number' ? afterEval.score_estimate : null;
  const delta = (beforeScore != null && afterScore != null) ? (afterScore - beforeScore) : null;
  console.log(`[Writer/refine-apply] ${beforeScore} → ${afterScore} (delta ${delta})`);

  if (delta != null && delta < -0.5) {
    return {
      text: currentText,
      before: beforeEval,
      after: afterEval,
      delta,
      weaknesses_targeted: topWeaknesses,
      reverted: true,
      note: `La refinación bajó la puntuación de ${beforeScore} a ${afterScore} (delta ${delta.toFixed(1)}). Se ha restaurado el texto original. Prueba con "Mejorar con IA" dando una instrucción más específica.`,
    };
  }

  return {
    text: improved,
    before: beforeEval,
    after: afterEval,
    delta,
    weaknesses_targeted: topWeaknesses,
  };
}

// ── Legacy one-shot auto-refine (kept for backwards compat, will be removed).
async function refineSectionAuto(instanceId, sectionId, currentText, projectContext, programId, coordinatorName) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: currentText, before: null, after: null, weaknesses_targeted: [] };
  }

  const sectionNames = {
    'summary_text': 'Project Summary',
    's1_1_text': '1.1 Background and general objectives',
    's1_2_text': '1.2 Needs analysis and specific objectives',
    's1_3_text': '1.3 Complementarity, innovation and European added value',
    's2_1_1_text': '2.1.1 Concept and methodology',
    's2_1_2_text': '2.1.2 Project management, quality assurance and monitoring',
    's2_1_4_text': '2.1.4 Cost effectiveness and financial management',
    's2_2_1_text': '2.2.1 Consortium set-up and cooperation',
    's2_2_2_text': '2.2.2 Consortium management and decision-making',
    's3_1_text': '3.1 Impact and ambition',
    's3_2_text': '3.2 Communication, dissemination and visibility',
    's3_3_text': '3.3 Sustainability and continuation',
    's4_1_text': '4.1 Work plan overview',
    's4_2_text': '4.2 Work packages, activities, resources and timing',
    's5_1_text': '5.1 Ethics',
    's5_2_text': '5.2 Security',
  };
  const sectionTitle = sectionNames[sectionId] || sectionId;

  // 1. Evaluate current text
  const beforeEval = await evaluateSection(currentText, sectionTitle, null, programId);
  const beforeScore = typeof beforeEval.score_estimate === 'number' ? beforeEval.score_estimate : null;
  console.log(`[Writer/refine] before: ${beforeScore}/10, weaknesses=${(beforeEval.weaknesses || []).length}, suggestions=${(beforeEval.suggestions || []).length}`);

  // 2. Pick the top 2 weaknesses (most impactful, not a laundry list)
  const topWeaknesses = (beforeEval.weaknesses || []).slice(0, 2);
  const topSuggestions = (beforeEval.suggestions || []).slice(0, 3);

  // High-score guard: above 8.5 we're in diminishing returns; refining here
  // often regresses because the improver overcorrects on a weakness while
  // eroding existing strengths. Return a clear message instead of risking it.
  if (beforeScore != null && beforeScore >= 8.5) {
    return {
      text: currentText,
      before: beforeEval,
      after: beforeEval,
      delta: 0,
      weaknesses_targeted: [],
      note: `Ya estás en ${beforeScore}/10 — zona de rendimientos decrecientes. Usa "Mejorar con IA" con una instrucción muy específica si quieres cambiar algo puntual, o déjalo como está.`,
    };
  }

  if (!topWeaknesses.length) {
    return {
      text: currentText,
      before: beforeEval,
      after: beforeEval,
      delta: 0,
      weaknesses_targeted: [],
      note: 'El evaluador no ha identificado debilidades claras. No hay nada que refinar.',
    };
  }

  // 3. Build a focused improve instruction from the top weaknesses only
  const targetScore = Math.min(10, Math.max(9, Math.ceil((beforeScore || 7) + 1.5)));
  const userRequest = `Improve this section to reach ${targetScore}/10. Focus ONLY on these high-impact issues, not a general polish:\n` +
    topWeaknesses.map((w, i) => `Issue ${i + 1}: ${w}`).join('\n') +
    (topSuggestions.length ? `\n\nConcrete suggestions to apply:\n` + topSuggestions.map((s, i) => `- ${s}`).join('\n') : '');

  // 4. Run targeted improve
  const improved = await improveSectionCustom(
    instanceId, sectionId, currentText, userRequest, projectContext, programId, coordinatorName,
    { evaluation: beforeEval, targetScore }
  );

  // 5. Re-evaluate
  const afterEval = await evaluateSection(improved, sectionTitle, null, programId);
  const afterScore = typeof afterEval.score_estimate === 'number' ? afterEval.score_estimate : null;
  const delta = (beforeScore != null && afterScore != null) ? (afterScore - beforeScore) : null;
  console.log(`[Writer/refine] after: ${afterScore}/10 (delta ${delta})`);

  // Regression guard: if the refined version is worse by more than 0.5 points,
  // revert to the original. Better to keep the user's current text than to
  // ship a regression. The UI shows the delta so the user understands why.
  if (delta != null && delta < -0.5) {
    return {
      text: currentText,  // revert
      before: beforeEval,
      after: afterEval,
      delta,
      weaknesses_targeted: topWeaknesses,
      reverted: true,
      note: `La refinación bajó la puntuación de ${beforeScore} a ${afterScore} (delta ${delta.toFixed(1)}). Se ha restaurado el texto original para no perder calidad. Prueba con "Mejorar con IA" dando una instrucción más específica.`,
    };
  }

  return {
    text: improved,
    before: beforeEval,
    after: afterEval,
    delta,
    weaknesses_targeted: topWeaknesses,
  };
}

// ============ PREP STUDIO v2: 5-TAB CONTEXT ============

// ── Tab 1: Consorcio ──

async function getPrepConsorcio(projectId, userId) {
  // Get partners with organization link
  const [partners] = await db.execute(
    `SELECT p.id, p.name, p.legal_name, p.city, p.country, p.role, p.order_index, p.organization_id
     FROM partners p WHERE p.project_id = ? ORDER BY p.order_index`,
    [projectId]
  );

  for (const p of partners) {
    p.organization = null;
    p.variants = [];
    p.selected_variant = null;
    p.custom_text = null;
    p.selected_eu_projects = [];
    p.staff_custom = {};
    p.extra_staff = [];

    if (p.organization_id) {
      // Load org profile (oid o pic — el directory-api acepta ambos como id)
      const [orgs] = await db.execute(
        `SELECT id, organization_name, acronym, org_type, country, city, description, activities_experience, expertise_areas, staff_size, oid, pic
         FROM organizations WHERE id = ?`, [p.organization_id]
      );
      if (orgs.length) {
        p.organization = orgs[0];
        // Load child tables (eu_projects ya no vive en MySQL: se carga abajo desde directory-api)
        const [staff] = await db.execute('SELECT id, name, role, skills_summary FROM org_key_staff WHERE organization_id = ?', [p.organization_id]);
        p.organization.key_staff = staff;
        p.organization.eu_projects = [];
        const [stakeholders] = await db.execute('SELECT entity_name, entity_type, relationship_type, description FROM org_stakeholders WHERE organization_id = ?', [p.organization_id]);
        p.organization.stakeholders = stakeholders;
      }

      // Load project-specific EU project selections (ahora project_identifier string)
      const [selectedEuProjs] = await db.execute(
        'SELECT project_identifier FROM project_partner_eu_projects WHERE project_id = ? AND partner_id = ?',
        [projectId, p.id]
      );
      p.selected_eu_projects = selectedEuProjs.map(r => r.project_identifier);

      // Load project-specific staff customizations
      const [staffCustom] = await db.execute(
        'SELECT staff_id, custom_skills, selected, project_role FROM project_partner_staff WHERE project_id = ? AND partner_id = ?',
        [projectId, p.id]
      );
      p.staff_custom = {};
      p.staff_selected = {};
      p.staff_project_role = {};
      for (const sc of staffCustom) {
        p.staff_custom[sc.staff_id] = sc.custom_skills;
        p.staff_selected[sc.staff_id] = !!sc.selected;
        p.staff_project_role[sc.staff_id] = sc.project_role || '';
      }

      // Auto-select-by-default: every key_staff of the organization that
      // doesn't yet have a project_partner_staff row is treated as selected.
      // We persist this decision as an explicit row (selected=1) so downstream
      // consumers (listStaffTable, Form Part B exporter, AI prompts) all see
      // the staff member. INSERT IGNORE keeps it idempotent and never clobbers
      // a row the user explicitly deselected (those already exist with
      // selected=0 from a previous toggle).
      const orgKeyStaff = p.organization && Array.isArray(p.organization.key_staff)
        ? p.organization.key_staff : [];
      const trackedIds = new Set(staffCustom.map(sc => sc.staff_id));
      for (const ks of orgKeyStaff) {
        if (trackedIds.has(ks.id)) continue;
        try {
          await db.execute(
            `INSERT IGNORE INTO project_partner_staff (id, project_id, partner_id, staff_id, selected)
             VALUES (?, ?, ?, ?, 1)`,
            [genUUID(), projectId, p.id, ks.id]
          );
          p.staff_selected[ks.id] = true;
        } catch (e) { /* non-fatal: row will be created on next save attempt */ }
      }

      // Load PIF variants for this organization
      const [variants] = await db.execute(
        'SELECT id, category, category_label, source, updated_at FROM org_pif_variants WHERE organization_id = ? ORDER BY category',
        [p.organization_id]
      );
      p.variants = variants;
    }

    // Load extra staff added for this project (works even without org link)
    const [extraStaff] = await db.execute(
      'SELECT id, name, role, skills_summary FROM project_extra_staff WHERE project_id = ? AND partner_id = ?',
      [projectId, p.id]
    );
    p.extra_staff = extraStaff;

    // Load project-specific PIF selection
    const [pifs] = await db.execute(
      `SELECT pp.variant_id, pp.custom_text, v.adapted_text, v.category, v.category_label
       FROM project_partner_pifs pp
       LEFT JOIN org_pif_variants v ON v.id = pp.variant_id
       WHERE pp.project_id = ? AND pp.partner_id = ?`,
      [projectId, p.id]
    );
    if (pifs.length) {
      p.custom_text = pifs[0].custom_text;
      if (pifs[0].variant_id) {
        p.selected_variant = { id: pifs[0].variant_id, adapted_text: pifs[0].adapted_text, category: pifs[0].category, category_label: pifs[0].category_label };
      }
    }
  }

  // Pass-through al directory-api: cargar proyectos UE reales por OID, en paralelo.
  // Esto sustituye la antigua tabla MySQL `org_eu_projects` (incompleta).
  // Si el partner no tiene oid o el directory-api falla, queda lista vacía.
  await Promise.all(partners.map(async (p) => {
    // El directory-api acepta tanto oid (E10xxxxx) como pic numérico (940...)
    // como identificador en /entity/<id>/projects.
    const lookupId = (p.organization && (p.organization.oid || p.organization.pic)) || null;
    if (!lookupId) return;
    try {
      const resp = await directoryApi.getEntityProjects(lookupId, { limit: 300 });
      const list = Array.isArray(resp && resp.projects) ? resp.projects : [];
      p.organization.eu_projects = list.map(pr => ({
        id: pr.project_identifier,
        project_identifier: pr.project_identifier,
        title: pr.project_title || pr.title || '',
        programme: pr.programme || '',
        year: pr.funding_year || null,
        role: pr.role || '',
        coordinator_name: pr.coordinator_name || '',
        coordinator_country: pr.coordinator_country || '',
        eu_grant_eur: pr.eu_grant_eur || null,
        is_good_practice: !!pr.is_good_practice,
        summary_excerpt: (pr.project_summary || '').slice(0, 300),
      }));
    } catch (_) {
      // Silencioso: si la API falla, lista vacía. El usuario verá
      // "No hay proyectos" en vez de un error y puede reintentar.
      p.organization.eu_projects = [];
    }
  }));

  // Load unique worker rate categories across all partners in this project
  const [wrCats] = await db.execute(
    `SELECT DISTINCT wr.category FROM worker_rates wr
     JOIN partners p ON p.id = wr.partner_id
     WHERE p.project_id = ? AND wr.category != '' ORDER BY wr.category`,
    [projectId]
  );
  const workerCategories = wrCats.map(r => r.category);

  return { partners, workerCategories };
}

async function linkPartnerOrg(projectId, partnerId, organizationId) {
  await db.execute(
    'UPDATE partners SET organization_id = ? WHERE id = ? AND project_id = ?',
    [organizationId, partnerId, projectId]
  );
}

async function generatePifVariant(projectId, partnerId, category, categoryLabel, userId) {
  // Get partner + org + project context (oid o pic para directory-api)
  const [partners] = await db.execute(
    'SELECT p.*, o.organization_name, o.description, o.activities_experience, o.expertise_areas, o.oid, o.pic FROM partners p LEFT JOIN organizations o ON o.id = p.organization_id WHERE p.id = ? AND p.project_id = ?',
    [partnerId, projectId]
  );
  if (!partners.length || !partners[0].organization_id) throw new Error('Partner not linked to organization');
  const partner = partners[0];
  const orgId = partner.organization_id;

  // Load org child data
  const [staff] = await db.execute('SELECT id, name, role, skills_summary FROM org_key_staff WHERE organization_id = ?', [orgId]);
  const [stakeholders] = await db.execute('SELECT entity_name, relationship_type FROM org_stakeholders WHERE organization_id = ?', [orgId]);

  // Proyectos UE: pass-through al directory-api (en lugar de org_eu_projects).
  let euProj = [];
  const partnerLookupId = partner.oid || partner.pic;
  if (partnerLookupId) {
    try {
      const resp = await directoryApi.getEntityProjects(partnerLookupId, { limit: 300 });
      const list = Array.isArray(resp && resp.projects) ? resp.projects : [];
      euProj = list.map(pr => ({
        project_identifier: pr.project_identifier,
        title: pr.project_title || pr.title || '',
        programme: pr.programme || '',
        year: pr.funding_year || null,
        role: pr.role || '',
      }));
    } catch (_) { euProj = []; }
  }

  // Load selected EU projects for this partner (project_identifier strings)
  const [selectedEuProjs] = await db.execute(
    'SELECT project_identifier FROM project_partner_eu_projects WHERE project_id = ? AND partner_id = ?',
    [projectId, partnerId]
  );
  const selectedIds = selectedEuProjs.map(r => r.project_identifier);
  const relevantEuProj = selectedIds.length
    ? euProj.filter(ep => selectedIds.includes(ep.project_identifier))
    : euProj;

  // Load extra staff added for this project
  const [extraStaff] = await db.execute(
    'SELECT name, role, skills_summary FROM project_extra_staff WHERE project_id = ? AND partner_id = ?',
    [projectId, partnerId]
  );

  // Load project context
  const ctx = await getProjectContext(projectId, userId);
  if (!ctx) throw new Error('Project not found');

  const leaderWps = (ctx.wps || []).filter(wp => wp.leader_id === partnerId);

  const systemPrompt = `You are an expert at adapting organizational profiles (PIFs) for EU project proposals.
You receive: (1) the generic organization profile, (2) the project's theme and context.
Your task: rewrite the organization's profile as a complete PIF adapted to THIS project's theme: "${categoryLabel || category}".

Rules:
- Keep all factual information (staff numbers, years of experience, project titles)
- Reframe the organization's experience to highlight relevance to the project theme
- Include relevant staff and their roles adapted to the project
- Include past EU projects that are most relevant
- Maintain professional EU proposal tone
- Write in the SAME LANGUAGE as the project description (Spanish if project is in Spanish, etc.)
- Do NOT invent capabilities the organization doesn't have
- DO emphasize existing capabilities that connect to the project theme
- Output a single cohesive text of ~300-400 words`;

  const allStaff = [...staff, ...extraStaff.map(s => ({ ...s, extra: true }))];

  const userPrompt = `ORGANIZATION PROFILE:
Name: ${partner.organization_name}
Description: ${partner.description || 'Not available'}
Experience: ${partner.activities_experience || 'Not available'}
Expertise areas: ${partner.expertise_areas || 'Not available'}

KEY STAFF:
${allStaff.map(s => `- ${s.name} (${s.role}): ${s.skills_summary || ''}`).join('\n') || 'None listed'}

PAST EU PROJECTS:
${relevantEuProj.map(ep => `- ${ep.title || ep.programme} (${ep.year}, role: ${ep.role})`).join('\n') || 'None listed'}

STAKEHOLDERS:
${stakeholders.map(sh => `- ${sh.entity_name} (${sh.relationship_type})`).join('\n') || 'None listed'}

PROJECT CONTEXT:
Title: ${ctx.project.name}
Description: ${ctx.project.description || ''}
Problem: ${ctx.context?.problem || 'Not specified'}
Approach: ${ctx.context?.approach || 'Not specified'}
Target groups: ${ctx.context?.target_groups || 'Not specified'}
This partner's role: ${partner.role}
${leaderWps.length ? `WPs led by this partner: ${leaderWps.map(wp => wp.code + ' ' + wp.title).join(', ')}` : ''}

ADAPTATION THEME: ${categoryLabel || category}

Write the adapted PIF now.`;

  const adaptedText = await callAI(systemPrompt, userPrompt, 'generate');

  // Save or update variant in org_pif_variants
  const variantId = genUUID();
  await db.execute(
    `INSERT INTO org_pif_variants (id, organization_id, category, category_label, adapted_text, source)
     VALUES (?, ?, ?, ?, ?, 'ai')
     ON DUPLICATE KEY UPDATE adapted_text = VALUES(adapted_text), category_label = VALUES(category_label), source = 'ai'`,
    [variantId, orgId, category, categoryLabel || null, adaptedText]
  );

  const [inserted] = await db.execute(
    'SELECT id FROM org_pif_variants WHERE organization_id = ? AND category = ?', [orgId, category]
  );
  const actualId = inserted[0]?.id || variantId;

  // Auto-select this variant for the partner in this project
  await db.execute(
    `INSERT INTO project_partner_pifs (id, project_id, partner_id, variant_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE variant_id = VALUES(variant_id), custom_text = NULL`,
    [genUUID(), projectId, partnerId, actualId]
  );

  return { variant_id: actualId, adapted_text: adaptedText, category, category_label: categoryLabel };
}

async function selectPifVariant(projectId, partnerId, variantId) {
  await db.execute(
    `INSERT INTO project_partner_pifs (id, project_id, partner_id, variant_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE variant_id = VALUES(variant_id), custom_text = NULL`,
    [genUUID(), projectId, partnerId, variantId]
  );
}

async function savePartnerCustomText(projectId, partnerId, customText) {
  await db.execute(
    `INSERT INTO project_partner_pifs (id, project_id, partner_id, custom_text)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE custom_text = VALUES(custom_text)`,
    [genUUID(), projectId, partnerId, customText || null]
  );
}

async function toggleEuProject(projectId, partnerId, projectIdentifier, selected) {
  if (!projectIdentifier) throw new Error('project_identifier requerido');
  if (selected) {
    await db.execute(
      `INSERT IGNORE INTO project_partner_eu_projects (id, project_id, partner_id, project_identifier)
       VALUES (?, ?, ?, ?)`,
      [genUUID(), projectId, partnerId, projectIdentifier]
    );
  } else {
    await db.execute(
      'DELETE FROM project_partner_eu_projects WHERE project_id = ? AND partner_id = ? AND project_identifier = ?',
      [projectId, partnerId, projectIdentifier]
    );
  }
}

async function saveStaffCustomSkills(projectId, partnerId, staffId, customSkills) {
  // Force selected=1 on insert so editing skills before toggling never
  // creates a row that's accidentally deselected (column default is 0).
  // The ON DUPLICATE KEY clause only touches custom_skills, so this is
  // a no-op for already-existing rows.
  await db.execute(
    `INSERT INTO project_partner_staff (id, project_id, partner_id, staff_id, selected, custom_skills)
     VALUES (?, ?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE custom_skills = VALUES(custom_skills)`,
    [genUUID(), projectId, partnerId, staffId, customSkills || null]
  );
}

async function toggleStaffSelected(projectId, partnerId, staffId, selected) {
  await db.execute(
    `INSERT INTO project_partner_staff (id, project_id, partner_id, staff_id, selected)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE selected = VALUES(selected)`,
    [genUUID(), projectId, partnerId, staffId, selected ? 1 : 0]
  );
}

async function setStaffProjectRole(projectId, partnerId, staffId, projectRole) {
  // Same default-selected protection as saveStaffCustomSkills.
  await db.execute(
    `INSERT INTO project_partner_staff (id, project_id, partner_id, staff_id, selected, project_role)
     VALUES (?, ?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE project_role = VALUES(project_role)`,
    [genUUID(), projectId, partnerId, staffId, projectRole || null]
  );
}

async function addExtraStaff(projectId, partnerId) {
  const id = genUUID();
  await db.execute(
    'INSERT INTO project_extra_staff (id, project_id, partner_id, name, role, skills_summary) VALUES (?, ?, ?, "", "", "")',
    [id, projectId, partnerId]
  );
  return { id };
}

async function updateExtraStaff(projectId, partnerId, staffId, field, value) {
  const allowed = ['name', 'role', 'skills_summary'];
  if (!allowed.includes(field)) throw new Error('Invalid field');
  await db.execute(
    `UPDATE project_extra_staff SET ${field} = ? WHERE id = ? AND project_id = ? AND partner_id = ?`,
    [value, staffId, projectId, partnerId]
  );
}

async function removeExtraStaff(projectId, partnerId, staffId) {
  await db.execute(
    'DELETE FROM project_extra_staff WHERE id = ? AND project_id = ? AND partner_id = ?',
    [staffId, projectId, partnerId]
  );
}

// ── Tab 2: Presupuesto ──

async function getPrepPresupuesto(projectId) {
  const [budgets] = await db.execute(
    'SELECT id, name, max_grant, cofin_pct, indirect_pct, status FROM budget_projects WHERE project_id = ? LIMIT 1',
    [projectId]
  );
  if (!budgets.length) return null;
  const budget = budgets[0];

  // Beneficiaries with cost sums by category
  const [bens] = await db.execute(
    `SELECT bb.id, bb.name, bb.acronym, bb.country, bb.is_coordinator, bb.sort_order,
       COALESCE(SUM(CASE WHEN bc.category = 'A' THEN bc.total_cost ELSE 0 END), 0) as cat_a,
       COALESCE(SUM(CASE WHEN bc.category = 'B' THEN bc.total_cost ELSE 0 END), 0) as cat_b,
       COALESCE(SUM(CASE WHEN bc.category = 'C' THEN bc.total_cost ELSE 0 END), 0) as cat_c,
       COALESCE(SUM(CASE WHEN bc.category = 'D' THEN bc.total_cost ELSE 0 END), 0) as cat_d,
       COALESCE(SUM(bc.total_cost), 0) as total
     FROM budget_beneficiaries bb
     LEFT JOIN budget_costs bc ON bc.beneficiary_id = bb.id AND bc.budget_id = bb.budget_id
     WHERE bb.budget_id = ?
     GROUP BY bb.id ORDER BY bb.sort_order`,
    [budget.id]
  );

  // WP sums
  const [wps] = await db.execute(
    `SELECT bw.id, bw.number, bw.label, bw.sort_order,
       COALESCE(SUM(bc.total_cost), 0) as total
     FROM budget_work_packages bw
     LEFT JOIN budget_costs bc ON bc.wp_id = bw.id AND bc.budget_id = bw.budget_id
     WHERE bw.budget_id = ?
     GROUP BY bw.id ORDER BY bw.sort_order`,
    [budget.id]
  );

  return { budget, beneficiaries: bens, work_packages: wps };
}

// ── Tab 3: Relevancia ──

async function getPrepRelevancia(projectId) {
  const [contexts] = await db.execute(
    'SELECT problem, target_groups, approach FROM intake_contexts WHERE project_id = ? LIMIT 1',
    [projectId]
  );
  // Chat status per field (how many turns exist)
  let chatStatus = {};
  try {
    const [chats] = await db.execute(
      'SELECT field_key, COUNT(*) as turns FROM prep_field_chats WHERE project_id = ? GROUP BY field_key',
      [projectId]
    );
    chatStatus = Object.fromEntries(chats.map(c => [c.field_key, c.turns]));
  } catch { /* table may not exist yet */ }
  return { context: contexts[0] || { problem: '', target_groups: '', approach: '' }, chatStatus };
}

async function updatePrepRelevanciaContext(projectId, problem, targetGroups, approach) {
  // Check if context exists
  const [existing] = await db.execute('SELECT id FROM intake_contexts WHERE project_id = ?', [projectId]);
  if (existing.length) {
    await db.execute(
      'UPDATE intake_contexts SET problem = ?, target_groups = ?, approach = ? WHERE project_id = ?',
      [problem, targetGroups, approach, projectId]
    );
  } else {
    await db.execute(
      'INSERT INTO intake_contexts (id, project_id, problem, target_groups, approach) VALUES (?, ?, ?, ?, ?)',
      [genUUID(), projectId, problem, targetGroups, approach]
    );
  }
}

// ── Relevancia: AI-assisted field drafts ──

const FIELD_PROMPTS = {
  problem: {
    ragQuery: 'needs analysis problems challenges target groups evidence statistics European policy priorities',
    label: 'Problem / Needs',
    instruction: `Write a 150-250 word draft describing the PROBLEM and NEEDS this project addresses.
Ground it in specific evidence: cite statistics, reports, or policy priorities from the documents provided.
Reference the countries of the consortium partners when possible.
Write in the voice of the project coordinator — direct, concrete, with conviction.
Do NOT use generic statements like "in today's world" or "it is widely known that".`
  },
  target_groups: {
    ragQuery: 'target groups beneficiaries participants demographics needs direct indirect stakeholders',
    label: 'Target Groups',
    instruction: `Write a 100-200 word draft describing the TARGET GROUPS and beneficiaries of this project.
Be specific: mention who they are, approximate numbers, their geographic distribution across consortium countries, and their concrete needs.
Distinguish between direct beneficiaries (who participate in activities) and indirect beneficiaries (who benefit from results).
Write in the voice of the project coordinator.`
  },
  approach: {
    ragQuery: 'methodology approach activities innovation pedagogy work packages implementation strategy',
    label: 'Approach / Methodology',
    instruction: `Write a 150-250 word draft describing the APPROACH and METHODOLOGY of this project.
Explain how the activities and work packages will address the problem.
Mention specific methods, tools, or pedagogical approaches if the project data mentions them.
Highlight what is innovative or distinctive about this approach compared to existing practices.
Write in the voice of the project coordinator.`
  }
};

// Helper: get programId and proposal language for a project
// Language is derived from national_agency (source of truth); proposal_lang is a fallback.
const NA_LANG = {
  EACEA:'en',
  AT01:'de',
  BE01:'fr', BE02:'nl', BE03:'de', BE04:'fr', BE05:'nl',
  BG01:'bg', HR01:'hr', CY01:'el', CZ01:'cs', DK01:'da',
  EE01:'et', FI01:'fi',
  FR01:'fr', FR02:'fr',
  DE01:'de', DE02:'de', DE03:'de', DE04:'de',
  EL01:'el', EL02:'el',
  HU01:'hu', IS01:'is',
  IE01:'en', IE02:'en',
  IT01:'it', IT02:'it', IT03:'it',
  LV01:'lv', LV02:'lv',
  LI01:'de',
  LT01:'lt', LT02:'lt',
  LU01:'fr',
  MT01:'en',
  NL01:'nl', NL02:'nl',
  NO01:'no', NO02:'no',
  PL01:'pl',
  PT01:'pt', PT02:'pt',
  RO01:'ro', RS01:'sr',
  SK01:'sk', SK02:'sk',
  SI01:'sl', SI02:'sl',
  ES01:'es', ES02:'es',
  SE01:'sv', SE02:'sv',
  TR01:'tr',
};
const LANG_NAMES_META = { es: 'Spanish', en: 'English', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ro: 'Romanian', el: 'Greek', sv: 'Swedish', da: 'Danish', fi: 'Finnish', cs: 'Czech', hu: 'Hungarian', bg: 'Bulgarian', hr: 'Croatian', sk: 'Slovak', sl: 'Slovenian', et: 'Estonian', lv: 'Latvian', lt: 'Lithuanian', mt: 'Maltese', ga: 'Irish', is: 'Icelandic', no: 'Norwegian', tr: 'Turkish', mk: 'Macedonian', sr: 'Serbian', sq: 'Albanian' };

async function getProjectMeta(projectId) {
  const [rows] = await db.execute('SELECT type, proposal_lang, national_agency FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (!rows.length) return { programId: null, lang: 'en', langName: 'English' };
  const [programs] = await db.execute('SELECT ip.id FROM intake_programs ip WHERE ip.action_type = ? LIMIT 1', [rows[0].type]);
  // proposal_lang es la fuente única (idioma de trabajo del usuario).
  // NA queda como fallback histórico para proyectos sin idioma explícito.
  const lang = rows[0].proposal_lang || NA_LANG[rows[0].national_agency] || 'en';
  return { programId: programs[0]?.id || null, lang, langName: LANG_NAMES_META[lang] || 'English' };
}

async function generateRelevanciaFieldDraft(projectId, userId, fieldKey) {
  if (!FIELD_PROMPTS[fieldKey]) throw new Error('Invalid field_key: ' + fieldKey);
  const cfg = FIELD_PROMPTS[fieldKey];

  // Get project context
  const ctx = await getProjectContext(projectId, userId);
  if (!ctx) throw new Error('Project not found');
  const projectContext = buildProjectContext(ctx);

  // Get programId and language
  const { programId, langName } = await getProjectMeta(projectId);

  // RAG: call docs + research docs in parallel
  const [callChunks, researchChunks] = await Promise.all([
    programId ? retrieveRelevantChunks(cfg.ragQuery, programId, 6) : Promise.resolve(''),
    retrieveResearchChunks(cfg.ragQuery, projectId, 4),
  ]);

  const system = `You are helping an Erasmus+ project coordinator prepare the Relevance section of their proposal.
You have access to programme documents and research evidence. Use them to write grounded, specific text.

${callChunks ? '══ PROGRAMME DOCUMENTS ══\n' + callChunks + '\n\n' : ''}${researchChunks ? '══ RESEARCH EVIDENCE ══\n' + researchChunks + '\n\n' : ''}══ PROJECT OVERVIEW ══
${projectContext}

══ LANGUAGE ══
IMPORTANT: Write EVERYTHING in ${langName}. The draft and questions MUST be in ${langName}.

══ YOUR TASK ══
${cfg.instruction}

After the draft, provide exactly 2-3 follow-up questions to elicit specific details you could NOT find in the documents.
These questions should help the coordinator add real-world knowledge, local context, or personal experience.

FORMAT YOUR RESPONSE EXACTLY AS:

DRAFT:
[your draft text in ${langName}]

QUESTIONS:
1. [specific question in ${langName}]
2. [specific question in ${langName}]
3. [specific question in ${langName}, optional]` + NARRATIVE_FORMAT_RULES;

  const result = await callAI(system, `Generate a draft for the "${cfg.label}" field of this Erasmus+ proposal.`, 'generate');

  // Parse response
  let draft = '', questions = [];
  const draftMatch = result.match(/DRAFT:\s*\n([\s\S]*?)(?=\nQUESTIONS:)/i);
  const questionsMatch = result.match(/QUESTIONS:\s*\n([\s\S]*)/i);
  if (draftMatch) draft = draftMatch[1].trim();
  else draft = result.split('QUESTIONS:')[0].replace(/^DRAFT:\s*/i, '').trim();
  if (questionsMatch) {
    questions = questionsMatch[1].trim().split(/\n\d+\.\s*/).filter(q => q.trim()).map(q => q.trim());
  }

  // Save draft to intake_contexts ONLY if field is empty
  const [existing] = await db.execute('SELECT ' + fieldKey + ' as val FROM intake_contexts WHERE project_id = ?', [projectId]);
  if (!existing.length) {
    await db.execute(
      'INSERT INTO intake_contexts (id, project_id, ' + fieldKey + ') VALUES (?, ?, ?)',
      [genUUID(), projectId, draft]
    );
  } else if (!existing[0].val || !existing[0].val.trim()) {
    await db.execute('UPDATE intake_contexts SET ' + fieldKey + ' = ? WHERE project_id = ?', [draft, projectId]);
  }

  // Save assistant turn to chat history
  const chatContent = JSON.stringify({ draft, questions });
  const id = genUUID();
  await db.execute(
    'INSERT INTO prep_field_chats (id, project_id, field_key, role, content, turn_order) VALUES (?, ?, ?, ?, ?, ?)',
    [id, projectId, fieldKey, 'assistant', chatContent, 0]
  );

  return { draft, questions, field_key: fieldKey };
}

async function chatRelevanciaField(projectId, userId, fieldKey, userMessage) {
  if (!FIELD_PROMPTS[fieldKey]) throw new Error('Invalid field_key: ' + fieldKey);
  const cfg = FIELD_PROMPTS[fieldKey];
  const isStartImprove = userMessage === '__START_IMPROVE__';

  // Load current field value
  const [ctxRows] = await db.execute('SELECT ' + fieldKey + ' as val FROM intake_contexts WHERE project_id = ?', [projectId]);
  const currentText = ctxRows[0]?.val || '';

  // Get programId and language
  const { programId, langName } = await getProjectMeta(projectId);
  const [callChunks, researchChunks] = await Promise.all([
    programId ? retrieveRelevantChunks(cfg.ragQuery, programId, 4) : Promise.resolve(''),
    retrieveResearchChunks(cfg.ragQuery, projectId, 3),
  ]);

  if (isStartImprove) {
    // Clear previous improvement chat for this field (fresh start)
    await db.execute('DELETE FROM prep_field_chats WHERE project_id = ? AND field_key = ? AND turn_order > 0', [projectId, fieldKey]);

    // AI reads the current text and returns ONE open question + 3-4 improvement area suggestions
    const system = `You are helping an Erasmus+ project coordinator improve the "${cfg.label}" field of their proposal.

${callChunks ? '══ PROGRAMME DOCUMENTS ══\n' + callChunks + '\n\n' : ''}${researchChunks ? '══ RESEARCH EVIDENCE ══\n' + researchChunks + '\n\n' : ''}══ CURRENT TEXT ══
${currentText}

══ YOUR TASK ══
Read the current text and identify which areas could be strengthened.
Respond with ONE open-ended question inviting the coordinator to share anything they want to add or change, followed by 3-4 specific improvement areas as bullets.
Each bullet must name the type of information that would help (e.g. "local quantitative data", "direct testimonials", "comparison with best practice X") — NOT a separate question.
The coordinator may have nothing to add: that is fine.

IMPORTANT: Write EVERYTHING in ${langName}.

FORMAT EXACTLY:
[your open question in ${langName}]

${langName === 'Spanish' ? 'Áreas donde tu aporte puede reforzar el texto:' : langName === 'English' ? 'Areas where your input could strengthen the text:' : `[heading in ${langName}: "Areas where your input could strengthen the text"]`}
• [area 1 in ${langName}]
• [area 2 in ${langName}]
• [area 3 in ${langName}]
• [area 4 in ${langName}, optional]`;

    const response = await callAI(system, 'Generate the improvement prompt.', 'generate');
    const cleanResponse = response.replace(/^(FOLLOW_UP:|QUESTION:)\s*/i, '').trim();

    // Save assistant turn
    await db.execute(
      'INSERT INTO prep_field_chats (id, project_id, field_key, role, content, turn_order) VALUES (?, ?, ?, ?, ?, ?)',
      [genUUID(), projectId, fieldKey, 'assistant', JSON.stringify({ follow_up: cleanResponse }), 1]
    );

    return { revised_text: null, follow_up: cleanResponse, turn_count: 1 };
  }

  // Any user response finalizes the improvement with a single rewrite
  const [history] = await db.execute(
    'SELECT role, content, turn_order FROM prep_field_chats WHERE project_id = ? AND field_key = ? AND turn_order > 0 ORDER BY turn_order',
    [projectId, fieldKey]
  );

  const conversationParts = history.map(h => {
    if (h.role === 'assistant') {
      try { const parsed = JSON.parse(h.content); return `ASSISTANT: ${parsed.follow_up || parsed.revised_text || h.content}`; }
      catch { return `ASSISTANT: ${h.content}`; }
    }
    return `USER: ${h.content}`;
  });

  const system = `You are helping an Erasmus+ project coordinator improve the "${cfg.label}" field.
IMPORTANT: Write EVERYTHING in ${langName}.

${callChunks ? '══ PROGRAMME DOCUMENTS ══\n' + callChunks + '\n\n' : ''}${researchChunks ? '══ RESEARCH EVIDENCE ══\n' + researchChunks + '\n\n' : ''}══ CURRENT TEXT ══
${currentText}

══ CONVERSATION SO FAR ══
${conversationParts.join('\n\n')}

══ YOUR TASK ══
The coordinator just responded: "${userMessage}"

Write a significantly IMPROVED version of the text in ${langName}, incorporating the coordinator's input and the improvement areas you had identified. If their response is brief or empty, still improve the text using the programme documents and research evidence. Make it concrete, evidence-based, and compelling for evaluators.

FORMAT:
REVISED_TEXT:
[complete improved text in ${langName}]

FOLLOW_UP:
NONE` + NARRATIVE_FORMAT_RULES;

  const result = await callAI(system, `User says: ${userMessage}`, 'generate');

  // Parse
  let revisedText = null, followUp = null;
  const revMatch = result.match(/REVISED_TEXT:\s*\n([\s\S]*?)(?=\nFOLLOW_UP:)/i);
  const fuMatch = result.match(/FOLLOW_UP:\s*\n([\s\S]*)/i);
  if (revMatch) {
    const rt = revMatch[1].trim();
    if (rt && rt.toLowerCase() !== 'none') revisedText = rt;
  }
  if (fuMatch) {
    const ft = fuMatch[1].trim();
    if (ft && ft.toLowerCase() !== 'none') followUp = ft;
  }

  // Save turns
  const nextOrder = history.length ? Math.max(...history.map(h => h.turn_order)) + 1 : 2;
  await db.execute(
    'INSERT INTO prep_field_chats (id, project_id, field_key, role, content, turn_order) VALUES (?, ?, ?, ?, ?, ?)',
    [genUUID(), projectId, fieldKey, 'user', userMessage, nextOrder]
  );
  const assistantContent = JSON.stringify({ revised_text: revisedText, follow_up: followUp });
  await db.execute(
    'INSERT INTO prep_field_chats (id, project_id, field_key, role, content, turn_order) VALUES (?, ?, ?, ?, ?, ?)',
    [genUUID(), projectId, fieldKey, 'assistant', assistantContent, nextOrder + 1]
  );

  // Update field if we have revised text
  if (revisedText) {
    await db.execute('UPDATE intake_contexts SET ' + fieldKey + ' = ? WHERE project_id = ?', [revisedText, projectId]);
  }

  // Update field value
  if (revisedText) {
    await db.execute('UPDATE intake_contexts SET ' + fieldKey + ' = ? WHERE project_id = ?', [revisedText, projectId]);
  }

  return { revised_text: revisedText, follow_up: followUp, turn_count: nextOrder + 2 };
}

async function getFieldChatHistory(projectId, fieldKey) {
  const [rows] = await db.execute(
    'SELECT role, content, turn_order, created_at FROM prep_field_chats WHERE project_id = ? AND field_key = ? ORDER BY turn_order',
    [projectId, fieldKey]
  );
  return rows;
}

// ── Tab 4: Actividades ──

async function getPrepActividades(projectId) {
  const [wps] = await db.execute(
    `SELECT wp.id, wp.order_index, wp.code, wp.title, wp.category, wp.leader_id, wp.summary, p.name as leader_name
     FROM work_packages wp LEFT JOIN partners p ON p.id = wp.leader_id
     WHERE wp.project_id = ? ORDER BY wp.order_index`,
    [projectId]
  );

  for (const wp of wps) {
    const [acts] = await db.execute(
      `SELECT a.id, a.type, a.label, a.subtype, a.description, a.date_start, a.date_end, a.online
       FROM activities a WHERE a.wp_id = ? ORDER BY a.order_index`,
      [wp.id]
    );
    for (const act of acts) {
      const [tasks] = await db.execute(
        `SELECT title, description, deliverable, milestone, kpi, status, start_month, end_month
         FROM project_tasks WHERE wp_id = ? AND category = ? ORDER BY sort_order`,
        [wp.id, act.type || 'general']
      );
      act.tasks = tasks;
    }
    wp.activities = acts;
  }

  return { wps };
}

async function updateWpSummary(wpId, summary) {
  await db.execute('UPDATE work_packages SET summary = ? WHERE id = ?', [summary, wpId]);
}

async function updateActivityDescription(activityId, description) {
  await db.execute('UPDATE activities SET description = ? WHERE id = ?', [description, activityId]);
}

// ── Activities: AI-assisted field drafts ──────────────────────────────

async function getWpContext(projectId, wpId) {
  const [wps] = await db.execute(
    `SELECT wp.id, wp.code, wp.title, wp.category, wp.summary, p.name as leader_name
     FROM work_packages wp LEFT JOIN partners p ON p.id = wp.leader_id
     WHERE wp.id = ? AND wp.project_id = ? LIMIT 1`,
    [wpId, projectId]
  );
  if (!wps.length) return null;
  const wp = wps[0];
  const [acts] = await db.execute(
    `SELECT id, type, label, subtype, description FROM activities WHERE wp_id = ? ORDER BY order_index`,
    [wpId]
  );
  const [tasks] = await db.execute(
    `SELECT title, description, deliverable, milestone FROM project_tasks WHERE wp_id = ? ORDER BY sort_order`,
    [wpId]
  );
  return { ...wp, activities: acts, tasks };
}

async function getActivityContext(projectId, activityId) {
  const [rows] = await db.execute(
    `SELECT a.id, a.type, a.label, a.subtype, a.description, a.date_start, a.date_end, a.online,
            a.wp_id, wp.code as wp_code, wp.title as wp_title, wp.summary as wp_summary, wp.project_id
     FROM activities a JOIN work_packages wp ON wp.id = a.wp_id
     WHERE a.id = ? AND wp.project_id = ? LIMIT 1`,
    [activityId, projectId]
  );
  if (!rows.length) return null;
  const act = rows[0];
  const [tasks] = await db.execute(
    `SELECT title, description, deliverable, milestone, start_month, end_month
     FROM project_tasks WHERE wp_id = ? AND category = ? ORDER BY sort_order`,
    [act.wp_id, act.type || 'general']
  );
  act.tasks = tasks;
  return act;
}

async function getRelevanciaContext(projectId) {
  const [rows] = await db.execute(
    'SELECT problem, target_groups, approach FROM intake_contexts WHERE project_id = ? LIMIT 1',
    [projectId]
  );
  return rows[0] || { problem: '', target_groups: '', approach: '' };
}

function buildActivitiesContextBlock(rel, wp, activity) {
  let out = '══ PROJECT RELEVANCE CONTEXT ══\n';
  if (rel.problem) out += `Problem: ${rel.problem}\n\n`;
  if (rel.target_groups) out += `Target groups: ${rel.target_groups}\n\n`;
  if (rel.approach) out += `Approach: ${rel.approach}\n\n`;
  if (wp) {
    out += `══ WORK PACKAGE ══\n${wp.code} - ${wp.title}${wp.category ? ' [' + wp.category + ']' : ''}\n`;
    if (wp.leader_name) out += `Leader: ${wp.leader_name}\n`;
    if (wp.summary) out += `Current summary: ${wp.summary}\n`;
    if (wp.activities && wp.activities.length) {
      out += `Activities in this WP:\n`;
      wp.activities.forEach(a => { out += `  • ${a.label || a.type}${a.subtype ? ' (' + a.subtype + ')' : ''}\n`; });
    }
    if (wp.tasks && wp.tasks.length) {
      out += `Tasks/deliverables:\n`;
      wp.tasks.forEach(t => { out += `  • ${t.title}${t.deliverable ? ' → ' + t.deliverable : ''}\n`; });
    }
    out += '\n';
  }
  if (activity) {
    out += `══ ACTIVITY ══\n${activity.label || activity.type}${activity.subtype ? ' (' + activity.subtype + ')' : ''}\n`;
    out += `Type: ${activity.type}\n`;
    if (activity.date_start) out += `Dates: ${activity.date_start} → ${activity.date_end}\n`;
    if (activity.tasks && activity.tasks.length) {
      out += `Tasks:\n`;
      activity.tasks.forEach(t => { out += `  • ${t.title}${t.deliverable ? ' → ' + t.deliverable : ''}\n`; });
    }
  }
  return out;
}

async function generateWpSummaryDraft(projectId, wpId) {
  const wp = await getWpContext(projectId, wpId);
  if (!wp) throw new Error('Work package not found');
  const rel = await getRelevanciaContext(projectId);
  const { programId, langName } = await getProjectMeta(projectId);
  const ragQuery = `work package ${wp.title} ${wp.category || ''} activities deliverables`;
  const [callChunks, researchChunks] = await Promise.all([
    programId ? retrieveRelevantChunks(ragQuery, programId, 4) : Promise.resolve(''),
    retrieveResearchChunks(ragQuery, projectId, 2),
  ]);
  const ctxBlock = buildActivitiesContextBlock(rel, wp, null);

  const system = `You are helping an Erasmus+ project coordinator draft the SUMMARY of a Work Package.
The goal is a concrete, specific description of WHAT this WP will do and WHAT is its main objective. This is NOT a proposal answer — it is an internal definition that will later feed the writing of the proposal sections.

${callChunks ? '══ PROGRAMME DOCUMENTS ══\n' + callChunks + '\n\n' : ''}${researchChunks ? '══ RESEARCH EVIDENCE ══\n' + researchChunks + '\n\n' : ''}${ctxBlock}

══ LANGUAGE ══
IMPORTANT: Write EVERYTHING in ${langName}.

══ YOUR TASK ══
Write a 80-150 word summary of this Work Package. Structure:
1. Main objective (1 sentence): what this WP aims to achieve.
2. Concrete scope (2-4 sentences): what will actually be done, referencing the activities and tasks listed. Connect to the project's problem, target groups and approach.
3. Expected outcome (1 sentence): what the WP produces for the overall project.

Be concrete and specific. Avoid generic filler. Write in the voice of the project coordinator.
Write ONLY the summary text, no headers or meta-commentary.` + NARRATIVE_FORMAT_RULES;

  const draft = await callAI(system, `Draft the summary for WP "${wp.title}".`, 'generate');
  const clean = draft.trim();
  await db.execute('UPDATE work_packages SET summary = ? WHERE id = ?', [clean, wpId]);
  return { summary: clean };
}

async function generateActivityDescriptionDraft(projectId, activityId) {
  const activity = await getActivityContext(projectId, activityId);
  if (!activity) throw new Error('Activity not found');
  const wp = await getWpContext(projectId, activity.wp_id);
  const rel = await getRelevanciaContext(projectId);
  const { programId, langName } = await getProjectMeta(projectId);
  const ragQuery = `${activity.label || ''} ${activity.type} ${activity.subtype || ''} methodology outcomes`;
  const [callChunks, researchChunks] = await Promise.all([
    programId ? retrieveRelevantChunks(ragQuery, programId, 4) : Promise.resolve(''),
    retrieveResearchChunks(ragQuery, projectId, 2),
  ]);
  const ctxBlock = buildActivitiesContextBlock(rel, wp, activity);

  const system = `You are helping an Erasmus+ project coordinator draft the DESCRIPTION of a project activity.
The goal is a concrete, specific description of WHAT will be done in this activity and WHAT is its main objective. This is NOT a proposal answer — it is an internal definition that will later feed the writing of the proposal sections.

${callChunks ? '══ PROGRAMME DOCUMENTS ══\n' + callChunks + '\n\n' : ''}${researchChunks ? '══ RESEARCH EVIDENCE ══\n' + researchChunks + '\n\n' : ''}${ctxBlock}

══ LANGUAGE ══
IMPORTANT: Write EVERYTHING in ${langName}.

══ YOUR TASK ══
Write a 80-150 word description of this activity. Structure:
1. Main objective (1 sentence): what this activity aims to achieve and why it matters for the project.
2. What will actually happen (2-4 sentences): concrete actions, methodology, who participates, what materials/tools are used. Connect to the project's problem, target groups and approach.
3. Expected output (1 sentence): what this activity produces.

Be concrete and specific. Avoid generic filler. Write in the voice of the project coordinator.
Write ONLY the description text, no headers or meta-commentary.` + NARRATIVE_FORMAT_RULES;

  const draft = await callAI(system, `Draft the description for activity "${activity.label || activity.type}".`, 'generate');
  const clean = draft.trim();
  await db.execute('UPDATE activities SET description = ? WHERE id = ?', [clean, activityId]);
  return { description: clean };
}

async function improveActivityField(projectId, fieldKey, currentText, contextBlock, fieldLabel, userMessage) {
  const { programId, langName } = await getProjectMeta(projectId);
  const isStartImprove = userMessage === '__START_IMPROVE__';
  const ragQuery = fieldLabel + ' ' + (currentText ? currentText.substring(0, 200) : '');
  const [callChunks, researchChunks] = await Promise.all([
    programId ? retrieveRelevantChunks(ragQuery, programId, 3) : Promise.resolve(''),
    retrieveResearchChunks(ragQuery, projectId, 2),
  ]);

  if (isStartImprove) {
    await db.execute('DELETE FROM prep_field_chats WHERE project_id = ? AND field_key = ? AND turn_order > 0', [projectId, fieldKey]);

    const system = `You are helping an Erasmus+ project coordinator refine the "${fieldLabel}". This is an internal definition (not a proposal answer) that will later feed the writing of the proposal.

${callChunks ? '══ PROGRAMME DOCUMENTS ══\n' + callChunks + '\n\n' : ''}${researchChunks ? '══ RESEARCH EVIDENCE ══\n' + researchChunks + '\n\n' : ''}${contextBlock}

══ CURRENT TEXT ══
${currentText || '(empty)'}

══ YOUR TASK ══
Read the current text and identify which aspects could be strengthened to make it more concrete and useful as internal definition.
Respond with ONE open-ended question inviting the coordinator to share anything they want to add or change, followed by 2-3 specific improvement ideas as bullets.
Each bullet must name an area or type of detail that would help (e.g. "concrete methodology step", "specific materials used", "role of a partner") — NOT a separate question.

IMPORTANT: Write EVERYTHING in ${langName}.

FORMAT EXACTLY:
[your open question in ${langName}]

${langName === 'Spanish' ? 'Ideas para mejorar esta definición:' : langName === 'English' ? 'Ideas to strengthen this definition:' : `[heading in ${langName}: "Ideas to strengthen this definition"]`}
• [idea 1 in ${langName}]
• [idea 2 in ${langName}]
• [idea 3 in ${langName}, optional]`;

    const response = await callAI(system, 'Generate the improvement prompt.', 'generate');
    const clean = response.replace(/^(FOLLOW_UP:|QUESTION:)\s*/i, '').trim();
    await db.execute(
      'INSERT INTO prep_field_chats (id, project_id, field_key, role, content, turn_order) VALUES (?, ?, ?, ?, ?, ?)',
      [genUUID(), projectId, fieldKey, 'assistant', JSON.stringify({ follow_up: clean }), 1]
    );
    return { revised_text: null, follow_up: clean };
  }

  const [history] = await db.execute(
    'SELECT role, content, turn_order FROM prep_field_chats WHERE project_id = ? AND field_key = ? AND turn_order > 0 ORDER BY turn_order',
    [projectId, fieldKey]
  );
  const conversationParts = history.map(h => {
    if (h.role === 'assistant') {
      try { const parsed = JSON.parse(h.content); return `ASSISTANT: ${parsed.follow_up || parsed.revised_text || h.content}`; }
      catch { return `ASSISTANT: ${h.content}`; }
    }
    return `USER: ${h.content}`;
  });

  const system = `You are helping an Erasmus+ project coordinator refine the "${fieldLabel}".
IMPORTANT: Write EVERYTHING in ${langName}.

${callChunks ? '══ PROGRAMME DOCUMENTS ══\n' + callChunks + '\n\n' : ''}${researchChunks ? '══ RESEARCH EVIDENCE ══\n' + researchChunks + '\n\n' : ''}${contextBlock}

══ CURRENT TEXT ══
${currentText}

══ CONVERSATION SO FAR ══
${conversationParts.join('\n\n')}

══ YOUR TASK ══
The coordinator just responded: "${userMessage}"

Write an IMPROVED version of the text in ${langName}, keeping the same structure (objective, what happens, expected outcome) but more concrete and specific. Incorporate the coordinator's input and the improvement ideas you had identified. If their response is brief or empty, still improve the text using programme documents and research evidence.

FORMAT:
REVISED_TEXT:
[complete improved text in ${langName}]

FOLLOW_UP:
NONE` + NARRATIVE_FORMAT_RULES;

  const result = await callAI(system, `User says: ${userMessage}`, 'generate');
  let revisedText = null;
  const revMatch = result.match(/REVISED_TEXT:\s*\n([\s\S]*?)(?=\nFOLLOW_UP:)/i);
  if (revMatch) {
    const rt = revMatch[1].trim();
    if (rt && rt.toLowerCase() !== 'none') revisedText = rt;
  }

  const nextOrder = history.length ? Math.max(...history.map(h => h.turn_order)) + 1 : 2;
  await db.execute(
    'INSERT INTO prep_field_chats (id, project_id, field_key, role, content, turn_order) VALUES (?, ?, ?, ?, ?, ?)',
    [genUUID(), projectId, fieldKey, 'user', userMessage, nextOrder]
  );
  await db.execute(
    'INSERT INTO prep_field_chats (id, project_id, field_key, role, content, turn_order) VALUES (?, ?, ?, ?, ?, ?)',
    [genUUID(), projectId, fieldKey, 'assistant', JSON.stringify({ revised_text: revisedText, follow_up: null }), nextOrder + 1]
  );
  return { revised_text: revisedText, follow_up: null };
}

async function improveWpSummary(projectId, wpId, userMessage) {
  const wp = await getWpContext(projectId, wpId);
  if (!wp) throw new Error('Work package not found');
  const rel = await getRelevanciaContext(projectId);
  const ctxBlock = buildActivitiesContextBlock(rel, wp, null);
  const fieldKey = 'wp_sum:' + wpId;
  const result = await improveActivityField(projectId, fieldKey, wp.summary || '', ctxBlock, `Summary of WP ${wp.code} - ${wp.title}`, userMessage);
  if (result.revised_text) {
    await db.execute('UPDATE work_packages SET summary = ? WHERE id = ?', [result.revised_text, wpId]);
  }
  return result;
}

async function improveActivityDescription(projectId, activityId, userMessage) {
  const activity = await getActivityContext(projectId, activityId);
  if (!activity) throw new Error('Activity not found');
  const wp = await getWpContext(projectId, activity.wp_id);
  const rel = await getRelevanciaContext(projectId);
  const ctxBlock = buildActivitiesContextBlock(rel, wp, activity);
  const fieldKey = 'act_desc:' + activityId;
  const result = await improveActivityField(projectId, fieldKey, activity.description || '', ctxBlock, `Description of activity "${activity.label || activity.type}"`, userMessage);
  if (result.revised_text) {
    await db.execute('UPDATE activities SET description = ? WHERE id = ?', [result.revised_text, activityId]);
  }
  return result;
}

// Consortium-level "connection point" note: how the partners came together /
// what shared trajectory links them. Empty draft → generate; existing text → improve.
// Persistence is the caller's job (saved as a writer_interviews answer); this is pure compute.
async function improveConsortiumConnection(projectId, userId, currentText) {
  const ctx = await getProjectContext(projectId, userId);
  const projectText = ctx ? buildProjectContext(ctx) : '';
  const { langName } = await getProjectMeta(projectId);
  const hasText = !!(currentText && currentText.trim());

  const system = `You are helping an Erasmus+ project coordinator write an internal note that answers: "What is the connection point between the partner organisations — how did they come together to form THIS project, and what shared trajectory, common ground or previous cooperation links them?"

This is NOT a formal proposal answer; it is an internal definition that later feeds the writing of the Partnership sections (e.g. "How did you form your partnership?").

══ PROJECT & CONSORTIUM CONTEXT ══
${projectText}

══ LANGUAGE ══
IMPORTANT: Write EVERYTHING in ${langName}.

══ YOUR TASK ══
${hasText
  ? 'Read the coordinator\'s current draft (below) and rewrite it into a stronger, more concrete version (120-200 words). Keep their facts and intent; make the shared origin and common trajectory specific and credible. Do not invent facts that contradict the context.\n\n══ CURRENT DRAFT ══\n' + currentText
  : 'Write a 120-200 word first draft. Using the consortium context, propose a plausible, concrete connection point: how the organisations know each other, what shared interest / network / previous cooperation brought them together, and what common trajectory links them. Keep it grounded in the partners and project shown above; mark anything the coordinator must confirm with [confirmar].'}

Write ONLY the note text, no headers or meta-commentary.` + NARRATIVE_FORMAT_RULES;

  const text = await callAI(system, hasText ? 'Improve the draft.' : 'Write the first draft.', 'generate');
  return { text: (text || '').trim() };
}

/* ── Writer Phase 4: project-level Deliverables & Milestones ──
   Hard cap of 15 deliverables per project (EU evaluator-friendly limit).
   Order intentionally inverted from the EACEA form: deliverables drive
   milestones, so the user defines deliverables first and milestones are
   auto-generated 1:1 + 2 fixed (kick-off, final report).
   ────────────────────────────────────────────────────────────── */

const PROJECT_DELIVERABLE_HARD_CAP = 15;

async function _assertProject(projectId, userId) {
  const [rows] = await db.execute(
    `SELECT id, duration_months FROM projects WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
  if (!rows.length) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

function _shortTitle(text, maxWords = 8) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(' ');
}

async function listProjectDeliverables(projectId, userId) {
  await _assertProject(projectId, userId);
  const [rows] = await db.execute(
    `SELECT d.*, wp.code AS wp_code, wp.title AS wp_title, wp.order_index AS wp_order_index,
            p.name AS lead_partner_name
       FROM deliverables d
       JOIN work_packages wp ON wp.id = d.work_package_id
       LEFT JOIN partners p ON p.id = d.lead_partner_id
      WHERE d.project_id = ?
      ORDER BY wp.order_index, d.sort_order, d.created_at`,
    [projectId]
  );
  if (!rows.length) return rows;
  // Attach source tasks per deliverable for trazabilidad in the UI
  const ids = rows.map(d => d.id);
  const placeholders = ids.map(() => '?').join(',');
  const [taskRows] = await db.execute(
    `SELECT dt.deliverable_id, t.id AS task_id, t.code, t.title
       FROM deliverable_tasks dt JOIN wp_tasks t ON t.id = dt.task_id
      WHERE dt.deliverable_id IN (${placeholders})`,
    ids
  );
  const tasksByD = {};
  for (const t of taskRows) {
    (tasksByD[t.deliverable_id] ||= []).push({ id: t.task_id, code: t.code, title: t.title });
  }
  for (const d of rows) d.source_tasks = tasksByD[d.id] || [];
  return rows;
}

async function listProjectMilestones(projectId, userId) {
  await _assertProject(projectId, userId);
  const [rows] = await db.execute(
    `SELECT m.*, wp.code AS wp_code, wp.title AS wp_title, wp.order_index AS wp_order_index,
            p.name AS lead_partner_name,
            d.code AS deliverable_code
       FROM milestones m
       JOIN work_packages wp ON wp.id = m.work_package_id
       LEFT JOIN partners p ON p.id = m.lead_partner_id
       LEFT JOIN deliverables d ON d.id = m.deliverable_id
      WHERE m.project_id = ?
      ORDER BY wp.order_index, m.sort_order, m.created_at`,
    [projectId]
  );
  return rows;
}


// (Removed 2026-04-28: legacy autoDistributeDeliverables / autoGenerateMilestones /
//  _computeDeliverableAllocation. Replaced by dms-generator.js holistic v2 flow.)


async function getDeliverableSummary(projectId, userId) {
  await _assertProject(projectId, userId);
  const [[counts]] = await db.execute(
    `SELECT COUNT(*) AS deliverables_count FROM deliverables WHERE project_id = ?`,
    [projectId]
  );
  const [[ms]] = await db.execute(
    `SELECT COUNT(*) AS milestones_count FROM milestones WHERE project_id = ?`,
    [projectId]
  );
  return {
    deliverables_count: counts.deliverables_count,
    milestones_count: ms.milestones_count,
    hard_cap: PROJECT_DELIVERABLE_HARD_CAP,
  };
}

// ════════════════════════════════════════════════════════════
//  Copy-paste eForm report (National-Agency calls)
//  NA calls have no Word upload — the applicant pastes every answer field by
//  field into the EU web eForm. These helpers expose the answers in form order,
//  on-screen (with copy buttons) and as a downloadable Word document.
// ════════════════════════════════════════════════════════════

// Build the ordered Q/A structure for an instance, grouped by section, with
// per-question character limits + current character counts. Works for any
// template; flags NA (copy_paste) forms so the UI can show the report.
async function getEformAnswers(instanceId, userId) {
  const [rows] = await db.execute(
    'SELECT fi.project_id, fi.title, ft.template_json FROM form_instances fi LEFT JOIN form_templates ft ON ft.id = fi.template_id WHERE fi.id = ? AND fi.user_id = ?',
    [instanceId, userId]
  );
  const inst = rows[0];
  if (!inst) return null;

  const tmpl = inst.template_json
    ? (typeof inst.template_json === 'string' ? JSON.parse(inst.template_json) : inst.template_json)
    : null;
  const values = await getFieldValues(instanceId);

  let wps = [];
  if (inst.project_id) {
    const [w] = await db.execute(
      'SELECT id, code, title, order_index, category FROM work_packages WHERE project_id = ? ORDER BY order_index',
      [inst.project_id]
    );
    wps = w;
  }

  const isNa = !!(tmpl && tmpl.meta && (tmpl.meta.output_mode === 'copy_paste' || tmpl.meta.no_upload));
  const sections = [];

  const pushField = (qs, sub, f, fieldId) => {
    if (f.type !== 'textarea' && f.type !== 'table') return;
    const text = (values[fieldId] && values[fieldId].text) || '';
    qs.push({
      field_id: fieldId,
      number: sub.number || '',
      title: sub.title || '',
      guidance: (sub.guidance || []).join(' '),
      char_limit: f.char_limit || null,
      text,
      chars: text.length,
    });
  };

  if (tmpl) {
    const contentWps = selectContentWps(wps);
    for (const sec of (tmpl.sections || [])) {
      const subs = sec.subsections || (sec.subsections_groups || []).flatMap(g => g.subsections || []);
      if (sec.per_wp) {
        for (const wp of contentWps) {
          const code = wp.code || ('WP' + ((wp.order_index || 0) + 1));
          const qs = [];
          for (const sub of subs) {
            const subClone = { ...sub, number: (sub.number || '').replace(/^WPx/, code) };
            for (const f of (sub.fields || [])) pushField(qs, subClone, f, `${f.id}__wp__${wp.id}`);
          }
          sections.push({ number: sec.number, title: `${sec.title} — ${code} ${wp.title || ''}`.trim(), questions: qs });
        }
        continue;
      }
      const qs = [];
      for (const sub of subs) for (const f of (sub.fields || [])) pushField(qs, sub, f, f.id);
      sections.push({ number: sec.number, title: sec.title, questions: qs });
    }
    if (tmpl.project_summary) {
      const text = (values['summary_text'] && values['summary_text'].text) || '';
      sections.push({ number: '', title: 'Project Summary', questions: [{ field_id: 'summary_text', number: '', title: 'Project Summary', char_limit: null, text, chars: text.length }] });
    }
  }

  // Drop fully-empty sections from the export-facing structure
  const nonEmpty = sections.filter(s => s.questions.some(q => q.text && q.text.trim()));

  return {
    isNa,
    title: (tmpl && tmpl.meta && tmpl.meta.title) || inst.title || 'Application form',
    projectName: inst.title || '',
    sections: nonEmpty.length ? sections : sections,  // keep all sections so empty ones are visible on screen
  };
}

// Render the same Q/A structure into a Word document ready to keep alongside the
// EU web eForm while copy-pasting.
async function buildEformDocx(instanceId, userId) {
  const data = await getEformAnswers(instanceId, userId);
  if (!data) return null;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

  const children = [];
  children.push(new Paragraph({ text: data.title, heading: HeadingLevel.TITLE }));
  if (data.projectName) children.push(new Paragraph({ children: [new TextRun({ text: data.projectName, italics: true, color: '666666' })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: 'Copia cada respuesta en el campo correspondiente del eForm web de la Agencia Nacional.', color: '888888', size: 18 })] }));
  children.push(new Paragraph({ text: '' }));

  for (const sec of data.sections) {
    children.push(new Paragraph({ text: `${sec.number ? sec.number + '. ' : ''}${sec.title}`, heading: HeadingLevel.HEADING_1 }));
    for (const q of sec.questions) {
      const limit = q.char_limit ? `  (${q.chars}/${q.char_limit} car.)` : '';
      children.push(new Paragraph({ children: [new TextRun({ text: `${q.number ? q.number + ' ' : ''}${q.title}${limit}`, bold: true })], spacing: { before: 160 } }));
      const body = (q.text && q.text.trim()) ? q.text : '—';
      for (const para of body.split(/\n{2,}/)) {
        children.push(new Paragraph({ children: [new TextRun({ text: para.replace(/\n/g, ' ') })] }));
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  const safe = (data.projectName || 'eform').replace(/[^a-z0-9._-]/gi, '_').slice(0, 60);
  return { buffer, filename: `${safe}_eForm.docx` };
}

module.exports = {
  getProjectContext,
  getEformAnswers,
  buildEformDocx,
  getOrCreateInstance,
  getInstance,
  updateInstanceStatus,
  getFieldValues,
  saveFieldValue,
  saveFieldValuesBulk,
  getEvalCriteria,
  buildProjectContext,
  buildEnrichedContext,
  // Prep Studio
  getInterviewAnswers,
  saveInterviewAnswer,
  generateInterviewQuestions,
  getResearchDocs,
  addResearchDoc,
  removeResearchDoc,
  getGapAnalysis,
  generateSection,
  evaluateSection,
  improveSection,
  improveSectionCustom,
  refineSectionAuto,
  refineEvaluatePhase,
  refineApplyPhase,
  retrieveRelevantChunks,
  getWritingRules,
  getEvalGuidanceForSection,
  // TASK-008 — Facts ledger + Prompt inspector
  assertProjectOwned: _assertProjectOwned,
  buildCanonicalFacts,
  listProjectFacts,
  setFactStatus,
  upsertProjectFact,
  extractCandidateFacts,
  listGenerations,
  getGeneration,
  listPromptBlocks,
  getPromptBlockFull,
  upsertPromptBlock,
  // Prep Studio v2
  getPrepConsorcio,
  linkPartnerOrg,
  generatePifVariant,
  selectPifVariant,
  savePartnerCustomText,
  toggleEuProject,
  saveStaffCustomSkills,
  toggleStaffSelected,
  setStaffProjectRole,
  addExtraStaff,
  updateExtraStaff,
  removeExtraStaff,
  getPrepPresupuesto,
  getPrepRelevancia,
  updatePrepRelevanciaContext,
  generateRelevanciaFieldDraft,
  chatRelevanciaField,
  getFieldChatHistory,
  getPrepActividades,
  updateWpSummary,
  updateActivityDescription,
  generateWpSummaryDraft,
  generateActivityDescriptionDraft,
  improveWpSummary,
  improveActivityDescription,
  improveConsortiumConnection,
  // Writer Phase 2 — per-WP structured tables
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  listDeliverables,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  // Writer Phase 3 — full WP form (Application Form Part B section 4.2)
  getWpHeader,
  updateWpHeader,
  listWpTasks,
  createWpTask,
  updateWpTask,
  deleteWpTask,
  setTaskParticipant,
  removeTaskParticipant,
  getWpBudget,
  refreshProjectBudget,
  listProjectPartners,
  aiFillWp,
  resyncWpTasks,
  seedWpTasksFromProject,
  syncWpTaskLeadersFromProjectTasks,
  listStaffTable,
  updateStaffTableRow,
  listProjectRisks,
  createProjectRisk,
  updateProjectRisk,
  deleteProjectRisk,
  aiGenerateProjectRisks,
  aiEvaluateProjectRisks,
  // Phase 4 — project-level Deliverables & Milestones (v2 generator lives in dms-generator.js)
  listProjectDeliverables,
  listProjectMilestones,
  getDeliverableSummary,
};
