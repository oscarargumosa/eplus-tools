/* ── Admin Model — reference data tables ─────────────────────────── */
const pool = require('../../utils/db');
const uuid = require('../../utils/uuid');

/* ══ intake_programs ═════════════════════════════════════════════ */

async function listPrograms() {
  const [rows] = await pool.query(
    'SELECT * FROM intake_programs ORDER BY active DESC, deadline ASC'
  );
  return rows;
}

async function upsertProgram(data, id) {
  if (id) {
    const allowed = ['program_id','name','action_type','deadline','deadline_time','start_date_min','start_date_max',
      'duration_min_months','duration_max_months','eu_grant_max','cofin_pct','indirect_pct',
      'min_partners','max_partners','notes','call_summary','active','form_template_id','intake_template','budget_template'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (k in data) { sets.push(`${k}=?`); params.push(data[k] ?? null); }
    }
    if (!sets.length) return id;
    params.push(id);
    await pool.query(`UPDATE intake_programs SET ${sets.join(', ')} WHERE id=?`, params);
    return id;
  }
  const newId = uuid();
  await pool.query(
    `INSERT INTO intake_programs
      (id, program_id, name, action_type, deadline,
       start_date_min, start_date_max,
       duration_min_months, duration_max_months,
       eu_grant_max, cofin_pct, indirect_pct,
       min_partners, notes, active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [newId, data.program_id, data.name, data.action_type, data.deadline || null,
     data.start_date_min || null, data.start_date_max || null,
     data.duration_min_months || null, data.duration_max_months || null,
     data.eu_grant_max || null, data.cofin_pct || null, data.indirect_pct || null,
     data.min_partners || 2, data.notes || null, data.active ?? 1]
  );
  return newId;
}

async function deleteProgram(id) {
  await pool.query('DELETE FROM intake_programs WHERE id=?', [id]);
}

/* ══ ref_countries ════════════════════════════════════════════════ */

async function listCountries() {
  const [rows] = await pool.query(
    'SELECT * FROM ref_countries ORDER BY name_es ASC'
  );
  return rows;
}

async function upsertCountry(data, id) {
  if (id) {
    await pool.query(
      `UPDATE ref_countries SET
        iso2=?, name_es=?, name_en=?, eu_member=?,
        erasmus_eligible=?, perdiem_zone=?, notes=?, active=?
       WHERE id=?`,
      [data.iso2, data.name_es, data.name_en, data.eu_member ?? 0,
       data.erasmus_eligible ?? 1, data.perdiem_zone || 'A',
       data.notes || null, data.active ?? 1, id]
    );
    return id;
  }
  const newId = uuid();
  await pool.query(
    `INSERT INTO ref_countries
      (id, iso2, name_es, name_en, eu_member, erasmus_eligible, perdiem_zone, notes, active)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [newId, data.iso2, data.name_es, data.name_en, data.eu_member ?? 0,
     data.erasmus_eligible ?? 1, data.perdiem_zone || 'A',
     data.notes || null, data.active ?? 1]
  );
  return newId;
}

async function deleteCountry(id) {
  await pool.query('DELETE FROM ref_countries WHERE id=?', [id]);
}

/* ══ ref_perdiem_rates ════════════════════════════════════════════ */

async function listPerdiem() {
  const [rows] = await pool.query(
    'SELECT * FROM ref_perdiem_rates ORDER BY zone ASC'
  );
  return rows;
}

async function upsertPerdiem(data, id) {
  const accom = Number(data.amount_accommodation) || 0;
  const subs  = Number(data.amount_subsistence)   || 0;
  const total = +(accom + subs).toFixed(2);
  if (id) {
    await pool.query(
      `UPDATE ref_perdiem_rates SET
        zone=?, amount_day=?, amount_accommodation=?, amount_subsistence=?
       WHERE id=?`,
      [data.zone, total, accom, subs, id]
    );
    return id;
  }
  const newId = uuid();
  await pool.query(
    `INSERT INTO ref_perdiem_rates (id, zone, amount_day, amount_accommodation, amount_subsistence, valid_from)
     VALUES (?,?,?,?,?,CURDATE())`,
    [newId, data.zone, total, accom, subs]
  );
  return newId;
}

async function deletePerdiem(id) {
  await pool.query('DELETE FROM ref_perdiem_rates WHERE id=?', [id]);
}

/* ══ ref_worker_categories ════════════════════════════════════════ */

async function listWorkerCategories() {
  const [rows] = await pool.query(
    'SELECT * FROM ref_worker_categories ORDER BY rate_day DESC'
  );
  return rows;
}

async function upsertWorkerCategory(data, id) {
  if (id) {
    await pool.query(
      `UPDATE ref_worker_categories SET
        code=?, name_es=?, name_en=?, rate_day=?, notes=?, active=?
       WHERE id=?`,
      [data.code, data.name_es, data.name_en, data.rate_day,
       data.notes || null, data.active ?? 1, id]
    );
    return id;
  }
  const newId = uuid();
  await pool.query(
    `INSERT INTO ref_worker_categories (id, code, name_es, name_en, rate_day, notes, active)
     VALUES (?,?,?,?,?,?,?)`,
    [newId, data.code, data.name_es, data.name_en, data.rate_day,
     data.notes || null, data.active ?? 1]
  );
  // Auto-create zone rates for A, B, C, D
  const baseRate = Number(data.rate_day) || 0;
  const zoneMultipliers = { A: 1.0, B: 0.88, C: 0.77, D: 0.66 };
  for (const [zone, mult] of Object.entries(zoneMultipliers)) {
    await pool.query(
      'INSERT INTO ref_worker_zone_rates (id, category_id, zone, rate_day) VALUES (?,?,?,?)',
      [uuid(), newId, zone, +(baseRate * mult).toFixed(2)]
    );
  }
  return newId;
}

async function deleteWorkerCategory(id) {
  await pool.query('DELETE FROM ref_worker_categories WHERE id=?', [id]);
}

/* ══ ref_entities ═════════════════════════════════════════════════ */

async function listEntities(search) {
  if (search) {
    const like = `%${search}%`;
    const [rows] = await pool.query(
      'SELECT * FROM ref_entities WHERE name LIKE ? OR city LIKE ? OR pic_number LIKE ? ORDER BY name ASC',
      [like, like, like]
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM ref_entities ORDER BY name ASC');
  return rows;
}

async function upsertEntity(data, id) {
  if (id) {
    await pool.query(
      `UPDATE ref_entities SET
        name=?, city=?, country_iso2=?, type=?,
        pic_number=?, website=?, notes=?, active=?
       WHERE id=?`,
      [data.name, data.city || null, data.country_iso2, data.type || 'ngo',
       data.pic_number || null, data.website || null, data.notes || null,
       data.active ?? 1, id]
    );
    return id;
  }
  const newId = uuid();
  await pool.query(
    `INSERT INTO ref_entities
      (id, name, city, country_iso2, type, pic_number, website, notes, active)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [newId, data.name, data.city || null, data.country_iso2, data.type || 'ngo',
     data.pic_number || null, data.website || null, data.notes || null,
     data.active ?? 1]
  );
  return newId;
}

async function deleteEntity(id) {
  await pool.query('DELETE FROM ref_entities WHERE id=?', [id]);
}

/* ══ Worker matrix (category × zone) ════════════════════════════ */

async function listWorkerMatrix() {
  const [rows] = await pool.query(`
    SELECT c.id, c.code, c.name_es, c.name_en, c.active,
           z.zone, z.rate_day, z.id AS zone_rate_id
    FROM ref_worker_categories c
    JOIN ref_worker_zone_rates z ON z.category_id = c.id
    ORDER BY c.code, z.zone
  `);
  const map = {};
  rows.forEach(r => {
    if (!map[r.code]) map[r.code] = { id: r.id, code: r.code, name_es: r.name_es, name_en: r.name_en, active: r.active, zones: {} };
    map[r.code].zones[r.zone] = { rate_day: r.rate_day, id: r.zone_rate_id };
  });
  return Object.values(map);
}

async function upsertWorkerZoneRate(zoneRateId, rate_day) {
  await pool.query('UPDATE ref_worker_zone_rates SET rate_day=? WHERE id=?', [rate_day, zoneRateId]);
}

/* ══ ref_erasmus_regions + countries extended ═════════════════════ */

async function listEligibility({ type, region } = {}) {
  let sql = `
    SELECT c.id, c.iso2, c.name_es, c.name_en,
           c.eu_member, c.erasmus_eligible, c.perdiem_zone,
           c.participation_type, c.erasmus_region, c.active,
           r.name_es AS region_name_es
    FROM ref_countries c
    LEFT JOIN ref_erasmus_regions r ON r.id = c.erasmus_region
    WHERE 1=1`;
  const params = [];
  if (type)   { sql += ' AND c.participation_type = ?'; params.push(type); }
  if (region) { sql += ' AND c.erasmus_region = ?';     params.push(region); }
  sql += ' ORDER BY c.participation_type ASC, c.erasmus_region ASC, c.name_es ASC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function listRegions() {
  const [rows] = await pool.query('SELECT * FROM ref_erasmus_regions ORDER BY id ASC');
  return rows;
}

/* ══ call_eligibility (per-programme rules) ══════════════════════ */

async function getCallEligibility(programId) {
  const [rows] = await pool.query('SELECT * FROM call_eligibility WHERE program_id=?', [programId]);
  return rows[0] || null;
}

async function upsertCallEligibility(programId, data) {
  const existing = await getCallEligibility(programId);
  const countryTypes   = JSON.stringify(data.eligible_country_types || []);
  const entityTypes    = JSON.stringify(data.eligible_entity_types || []);
  const activityTypes  = JSON.stringify(data.activity_location_types || []);

  if (existing) {
    await pool.query(
      `UPDATE call_eligibility SET
        eligible_country_types=?, eligible_entity_types=?,
        min_partners=?, min_countries=?, max_coord_applications=?,
        max_partner_applications=?, max_applicant_applications=?,
        activity_location_types=?, additional_rules=?,
        writing_style=?, ai_detection_rules=?
       WHERE program_id=?`,
      [countryTypes, entityTypes,
       data.min_partners || 1, data.min_countries || 1, data.max_coord_applications || null,
       data.max_partner_applications || null, data.max_applicant_applications || null,
       activityTypes, data.additional_rules || null,
       data.writing_style || null, data.ai_detection_rules || null, programId]
    );
    return existing.id;
  }
  const id = uuid();
  await pool.query(
    `INSERT INTO call_eligibility (id, program_id, eligible_country_types, eligible_entity_types,
      min_partners, min_countries, max_coord_applications, max_partner_applications, max_applicant_applications,
      activity_location_types, additional_rules,
      writing_style, ai_detection_rules)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, programId, countryTypes, entityTypes,
     data.min_partners || 1, data.min_countries || 1, data.max_coord_applications || null,
     data.max_partner_applications || null, data.max_applicant_applications || null,
     activityTypes, data.additional_rules || null,
     data.writing_style || null, data.ai_detection_rules || null]
  );
  return id;
}

/* ══ Evaluator (eval rules per program/convocatoria) ═════════════ */

async function getEvalTree(programId) {
  const [sections] = await pool.query('SELECT * FROM eval_sections WHERE program_id=? ORDER BY sort_order', [programId]);
  const sectionIds = sections.map(s => s.id);
  let questions = [], criteria = [];
  if (sectionIds.length) {
    [questions] = await pool.query('SELECT * FROM eval_questions WHERE section_id IN (?) ORDER BY sort_order', [sectionIds]);
    const qIds = questions.map(q => q.id);
    if (qIds.length) {
      [criteria] = await pool.query('SELECT * FROM eval_criteria WHERE question_id IN (?) ORDER BY sort_order', [qIds]);
    }
  }
  const qMap = {};
  questions.forEach(q => { q.criteria = []; qMap[q.id] = q; });
  criteria.forEach(c => { if (qMap[c.question_id]) qMap[c.question_id].criteria.push(c); });
  const sMap = {};
  sections.forEach(s => { s.questions = []; sMap[s.id] = s; });
  questions.forEach(q => { if (sMap[q.section_id]) sMap[q.section_id].questions.push(q); });
  return sections;
}

async function upsertEvalSection(data, id) {
  if (id) {
    const sets = [];
    const params = [];
    if ('title' in data) { sets.push('title=?'); params.push(data.title); }
    if ('color' in data) { sets.push('color=?'); params.push(data.color); }
    if ('max_score' in data) { sets.push('max_score=?'); params.push(data.max_score ?? 0); }
    if ('eval_notes' in data) { sets.push('eval_notes=?'); params.push(data.eval_notes || null); }
    if ('form_ref' in data) { sets.push('form_ref=?'); params.push(data.form_ref || null); }
    if ('sort_order' in data) { sets.push('sort_order=?'); params.push(data.sort_order ?? 0); }
    if (!sets.length) return id;
    params.push(id);
    await pool.query(`UPDATE eval_sections SET ${sets.join(', ')} WHERE id=?`, params);
    return id;
  }
  const newId = uuid();
  await pool.query('INSERT INTO eval_sections (id, program_id, title, form_ref, color, max_score, sort_order) VALUES (?,?,?,?,?,?,?)',
    [newId, data.program_id, data.title, data.form_ref || null, data.color || '#3b82f6', data.max_score ?? 0, data.sort_order ?? 0]);
  return newId;
}

async function deleteEvalSection(id) { await pool.query('DELETE FROM eval_sections WHERE id=?', [id]); }

async function upsertEvalQuestion(data, id) {
  if (id) {
    // Partial update: only SET fields that are present in data
    const sets = [];
    const params = [];
    const fieldMap = {
      code: 'code', title: 'title', description: 'description',
      general_context: 'general_context', connects_from: 'connects_from',
      connects_to: 'connects_to', global_rule: 'global_rule',
      word_limit: 'word_limit', page_limit: 'page_limit',
      writing_guidance: 'writing_guidance', scoring_logic: 'scoring_logic',
      weight: 'weight', max_score: 'max_score', threshold: 'threshold',
      sort_order: 'sort_order'
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) { sets.push(`${col}=?`); params.push(data[key] ?? null); }
    }
    if ('general_rules' in data) { sets.push('general_rules=?'); params.push(data.general_rules ? JSON.stringify(data.general_rules) : null); }
    if ('score_caps' in data) { sets.push('score_caps=?'); params.push(data.score_caps ? JSON.stringify(data.score_caps) : null); }
    // Also support legacy "prompt" → description
    if ('prompt' in data && !('description' in data)) { sets.push('description=?'); params.push(data.prompt || null); }
    if (!sets.length) return id;
    params.push(id);
    await pool.query(`UPDATE eval_questions SET ${sets.join(', ')} WHERE id=?`, params);
    return id;
  }
  const desc = data.description ?? data.prompt ?? null;
  const rules = data.general_rules ? JSON.stringify(data.general_rules) : null;
  const caps = data.score_caps ? JSON.stringify(data.score_caps) : null;
  const newId = uuid();
  await pool.query(
    `INSERT INTO eval_questions (id, section_id, code, title, description,
     general_context, connects_from, connects_to, global_rule,
     word_limit, page_limit, writing_guidance, scoring_logic,
     weight, max_score, threshold, general_rules, score_caps, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [newId, data.section_id, data.code, data.title, desc,
     data.general_context || null, data.connects_from || null,
     data.connects_to || null, data.global_rule || null,
     data.word_limit || null, data.page_limit || null,
     data.writing_guidance || null, data.scoring_logic || 'sum', data.weight ?? 0,
     data.max_score ?? 0, data.threshold ?? 0, rules, caps, data.sort_order ?? 0]);
  return newId;
}

async function deleteEvalQuestion(id) { await pool.query('DELETE FROM eval_questions WHERE id=?', [id]); }

async function upsertEvalCriterion(data, id) {
  if (id) {
    const sets = [];
    const params = [];
    // New narrative brief fields (2026-04 format). Legacy fields kept for back-compat.
    const fields = ['title', 'max_score', 'mandatory', 'priority',
                    'intent', 'elements', 'example_weak', 'example_strong', 'avoid',
                    'meaning', 'structure', 'relations', 'rules', 'red_flags', 'sort_order'];
    for (const f of fields) {
      if (f in data) { sets.push(`${f}=?`); params.push(data[f] ?? null); }
    }
    if ('score_rubric' in data) { sets.push('score_rubric=?'); params.push(data.score_rubric ? JSON.stringify(data.score_rubric) : null); }
    if (!sets.length) return id;
    params.push(id);
    await pool.query(`UPDATE eval_criteria SET ${sets.join(', ')} WHERE id=?`, params);
    return id;
  }
  const newId = uuid();
  await pool.query(
    `INSERT INTO eval_criteria (id, question_id, title, max_score, mandatory, priority,
     intent, elements, example_weak, example_strong, avoid, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [newId, data.question_id, data.title, data.max_score ?? 1, data.mandatory ?? 0,
     data.priority || 'media',
     data.intent || null, data.elements || null,
     data.example_weak || null, data.example_strong || null,
     data.avoid || null, data.sort_order ?? 0]);
  return newId;
}

async function deleteEvalCriterion(id) { await pool.query('DELETE FROM eval_criteria WHERE id=?', [id]); }

async function importEvalRules(programId, jsonData) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Clear existing rules for this program
    const [existingSections] = await conn.query('SELECT id FROM eval_sections WHERE program_id=?', [programId]);
    if (existingSections.length) {
      await conn.query('DELETE FROM eval_sections WHERE program_id=?', [programId]);
    }
    const COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];
    const sections = jsonData.sections || [];
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const secId = uuid();
      await conn.query('INSERT INTO eval_sections (id, program_id, title, form_ref, color, max_score, eval_notes, sort_order) VALUES (?,?,?,?,?,?,?,?)',
        [secId, programId, sec.title, sec.formRef || null, COLORS[si % COLORS.length], sec.maxScore ?? 0, sec.evalNotes || null, si]);
      const questions = sec.questions || [];
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const qId = uuid();
        await conn.query(
          `INSERT INTO eval_questions (id, section_id, code, title, description,
           general_context, connects_from, connects_to, global_rule,
           word_limit, page_limit, writing_guidance, scoring_logic,
           weight, max_score, threshold, general_rules, score_caps, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [qId, secId, q.code || `${si+1}.${qi+1}`, q.title, q.description || q.prompt || null,
           q.generalContext || null, q.connectsFrom || null, q.connectsTo || null, q.globalRule || null,
           q.wordLimit || null, q.pageLimit || null, q.writingGuidance || null, q.scoringLogic || 'sum',
           q.weight ?? 0, q.maxScore ?? 0, q.threshold ?? 0,
           q.generalRules ? JSON.stringify(q.generalRules) : null,
           q.scoreCaps ? JSON.stringify(q.scoreCaps) : null, qi]);
        const criteria = q.miniPoints || q.criteria || [];
        for (let ci = 0; ci < criteria.length; ci++) {
          const c = criteria[ci];
          await conn.query(
            `INSERT INTO eval_criteria (id, question_id, title, max_score, mandatory, priority,
             intent, elements, example_weak, example_strong, avoid, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [uuid(), qId, c.title, c.maxScore ?? 1, c.mandatory ? 1 : 0, c.priority || 'media',
             c.intent || null, c.elements || null,
             c.exampleWeak || null, c.exampleStrong || null,
             c.avoid || null, ci]);
        }
      }
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

/* ── Form templates & instances ──────────────────────────────── */

async function listFormTemplates() {
  const [rows] = await pool.query('SELECT id, name, slug, description, version, year, active, created_at FROM form_templates ORDER BY active DESC, name');
  return rows;
}

async function getFormTemplate(id) {
  const [rows] = await pool.query('SELECT * FROM form_templates WHERE id = ?', [id]);
  if (!rows.length) throw new Error('Template not found');
  const t = rows[0];
  if (typeof t.template_json === 'string') {
    try { t.template_json = JSON.parse(t.template_json); } catch(_) {}
  }
  return t;
}

async function listFormInstances(query) {
  let sql = `SELECT fi.*, ft.name as template_name, ip.name as program_name
             FROM form_instances fi
             JOIN form_templates ft ON fi.template_id = ft.id
             JOIN intake_programs ip ON fi.program_id = ip.id`;
  const conditions = [];
  const params = [];
  if (query.program_id) { conditions.push('fi.program_id = ?'); params.push(query.program_id); }
  if (query.template_id) { conditions.push('fi.template_id = ?'); params.push(query.template_id); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY fi.updated_at DESC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function createFormInstance({ template_id, program_id, project_id, title }) {
  const id = uuid();
  await pool.query(
    'INSERT INTO form_instances (id, template_id, program_id, project_id, title) VALUES (?,?,?,?,?)',
    [id, template_id, program_id, project_id || null, title || null]
  );
  return { id };
}

async function getFormInstance(id) {
  const [rows] = await pool.query(
    `SELECT fi.*, ft.name as template_name, ft.template_json,
            ip.name as program_name
     FROM form_instances fi
     JOIN form_templates ft ON fi.template_id = ft.id
     JOIN intake_programs ip ON fi.program_id = ip.id
     WHERE fi.id = ?`, [id]);
  if (!rows.length) throw new Error('Instance not found');
  const inst = rows[0];
  if (typeof inst.template_json === 'string') {
    try { inst.template_json = JSON.parse(inst.template_json); } catch(_) {}
  }
  return inst;
}

async function getFormValues(instanceId) {
  const [rows] = await pool.query(
    'SELECT field_id, section_path, value_text, value_json FROM form_field_values WHERE instance_id = ?',
    [instanceId]
  );
  const values = {};
  for (const r of rows) {
    const key = r.section_path ? `${r.section_path}.${r.field_id}` : r.field_id;
    values[key] = r.value_json ? (typeof r.value_json === 'string' ? JSON.parse(r.value_json) : r.value_json) : r.value_text;
  }
  return values;
}

async function saveFormValues(instanceId, values) {
  // values = { "field_id_or_path.field_id": value, ... }
  if (!values || typeof values !== 'object') return;

  for (const [fullKey, val] of Object.entries(values)) {
    const lastDot = fullKey.lastIndexOf('.');
    let sectionPath = null, fieldId = fullKey;
    if (lastDot > 0) {
      sectionPath = fullKey.substring(0, lastDot);
      fieldId = fullKey.substring(lastDot + 1);
    }

    const isJson = typeof val === 'object' && val !== null;
    const id = uuid();

    await pool.query(
      `INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, value_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value_text = VALUES(value_text),
         value_json = VALUES(value_json),
         updated_at = CURRENT_TIMESTAMP`,
      [id, instanceId, fieldId, sectionPath, isJson ? null : (val ?? ''), isJson ? JSON.stringify(val) : null]
    );
  }

  await pool.query("UPDATE form_instances SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [instanceId]);
}

async function updateFormInstance(id, data) {
  const fields = [];
  const params = [];
  if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
  if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
  if (!fields.length) return;
  params.push(id);
  await pool.query(`UPDATE form_instances SET ${fields.join(', ')} WHERE id = ?`, params);
}

async function deleteFormInstance(id) {
  await pool.query('DELETE FROM form_instances WHERE id = ?', [id]);
}

/* ══ Generate eval structure from form template ════════════════ */

async function generateEvalFromTemplate(programId, templateId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Check no existing sections
    const [existing] = await conn.query('SELECT COUNT(*) as c FROM eval_sections WHERE program_id=?', [programId]);
    if (existing[0].c > 0) throw new Error('Esta convocatoria ya tiene secciones de evaluación. Elimínalas primero si quieres regenerar.');

    // Load template
    const [tplRows] = await conn.query('SELECT template_json FROM form_templates WHERE id=?', [templateId]);
    if (!tplRows.length) throw new Error('Template not found');
    let tmpl = tplRows[0].template_json;
    if (typeof tmpl === 'string') tmpl = JSON.parse(tmpl);

    const COLORS = ['#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
    let secOrder = 0;

    // Helper: create section + questions from subsections array
    const createSection = async (title, formRef, color, subsections) => {
      const secId = uuid();
      await conn.query(
        'INSERT INTO eval_sections (id, program_id, title, form_ref, color, max_score, sort_order) VALUES (?,?,?,?,?,0,?)',
        [secId, programId, title, formRef, color, secOrder++]
      );
      let qOrder = 0;
      for (const sub of subsections) {
        await conn.query(
          `INSERT INTO eval_questions (id, section_id, code, title, description, sort_order, max_score, weight)
           VALUES (?,?,?,?,?,?,0,0)`,
          [uuid(), secId, sub.number || '', sub.title || '', (sub.guidance || []).join('\n\n'), qOrder++]
        );
      }
      return secId;
    };

    // Parse sections from template
    for (const sec of (tmpl.sections || [])) {
      const num = sec.number || '';
      const title = `${num}. ${sec.title}`;

      // Section 2 is special: has subsections_groups (2.1 and 2.2 are separate eval areas)
      if (sec.subsections_groups && sec.subsections_groups.length) {
        for (const grp of sec.subsections_groups) {
          const grpTitle = `${grp.number} ${grp.title}`;
          const subs = grp.subsections || [];
          await createSection(grpTitle, grp.id, COLORS[secOrder % COLORS.length], subs);
        }
      } else if (sec.subsections && sec.subsections.length) {
        // Normal section with direct subsections (1, 3, 4, 5, 6)
        await createSection(title, sec.id, COLORS[secOrder % COLORS.length], sec.subsections);
      }
    }

    // Also add Project Summary as a question in a "Summary" section if it exists
    if (tmpl.project_summary) {
      const secId = uuid();
      await conn.query(
        'INSERT INTO eval_sections (id, program_id, title, form_ref, color, max_score, sort_order) VALUES (?,?,?,?,?,0,?)',
        [secId, programId, 'Project Summary', 'summary', '#9ca3af', secOrder++]
      );
      await conn.query(
        'INSERT INTO eval_questions (id, section_id, code, title, description, sort_order, max_score, weight) VALUES (?,?,?,?,?,0,0,0)',
        [uuid(), secId, 'SUM', 'Project Summary', (tmpl.project_summary.fields || []).map(f => f.guidance || '').join('\n')]
      );
    }

    await conn.commit();
    return { sections: secOrder };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

/* ══ call_documents ═════════════════════════════════════════════ */

async function listCallDocuments(programId) {
  const [rows] = await pool.query(
    `SELECT cd.*, d.title AS doc_title, d.file_type, d.file_size_bytes, d.status AS doc_status,
            d.tags, d.created_at AS doc_created_at
     FROM call_documents cd
     JOIN documents d ON d.id = cd.document_id
     WHERE cd.program_id = ?
     ORDER BY cd.sort_order, cd.created_at`,
    [programId]
  );
  // Parse tags JSON
  rows.forEach(r => {
    if (typeof r.tags === 'string') try { r.tags = JSON.parse(r.tags); } catch(_) { r.tags = []; }
  });
  return rows;
}

async function createCallDocument(programId, documentId, docType, label) {
  const id = uuid();
  await pool.query(
    'INSERT INTO call_documents (id, program_id, document_id, doc_type, label) VALUES (?,?,?,?,?)',
    [id, programId, documentId, docType || 'other', label || null]
  );
  return id;
}

async function deleteCallDocument(id) {
  await pool.query('DELETE FROM call_documents WHERE id=?', [id]);
}

/**
 * Available docs for a call: same action_type OR tagged 'transversal',
 * excluding docs already linked to this programme.
 */
async function availableCallDocuments(programId) {
  // Get the action_type of this programme
  const [[prog]] = await pool.query('SELECT action_type FROM intake_programs WHERE id=?', [programId]);
  if (!prog) return [];

  const actionType = (prog.action_type || '').trim();

  // Show ALL docs from other calls, sorted: same action_type first, then transversal, then rest
  const [rows] = await pool.query(
    `SELECT DISTINCT d.id, d.title, d.file_type, d.file_size_bytes, d.tags, d.status,
            d.created_at, cd_src.doc_type, cd_src.label,
            ip.name AS source_call_name, ip.action_type AS source_action_type
     FROM documents d
     JOIN call_documents cd_src ON cd_src.document_id = d.id
     JOIN intake_programs ip ON ip.id = cd_src.program_id
     WHERE d.status = 'active'
       AND cd_src.program_id != ?
       AND d.id NOT IN (SELECT document_id FROM call_documents WHERE program_id = ?)
     ORDER BY (ip.action_type = ?) DESC,
              JSON_CONTAINS(d.tags, '"transversal"') DESC,
              d.title`,
    [programId, programId, actionType]
  );
  rows.forEach(r => {
    if (typeof r.tags === 'string') try { r.tags = JSON.parse(r.tags); } catch(_) { r.tags = []; }
  });
  return rows;
}

/* ══ Duplicate call (programme + eligibility + eval tree) ══════ */

async function duplicateProgram(sourceId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Copy intake_programs
    const [srcRows] = await conn.query('SELECT * FROM intake_programs WHERE id=?', [sourceId]);
    if (!srcRows.length) throw new Error('Programme not found');
    const src = srcRows[0];
    const newId = uuid();
    const newName = src.name + ' (copy)';
    const newProgramId = src.program_id + '_copy_' + Date.now();
    await conn.query(
      `INSERT INTO intake_programs
        (id, program_id, name, action_type, deadline, start_date_min, start_date_max,
         duration_min_months, duration_max_months, eu_grant_max, cofin_pct, indirect_pct,
         min_partners, notes, active, form_template_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      [newId, newProgramId, newName, src.action_type, src.deadline,
       src.start_date_min, src.start_date_max, src.duration_min_months, src.duration_max_months,
       src.eu_grant_max, src.cofin_pct, src.indirect_pct,
       src.min_partners, src.notes, src.form_template_id]
    );

    // 2. Copy call_eligibility
    const [eligRows] = await conn.query('SELECT * FROM call_eligibility WHERE program_id=?', [sourceId]);
    if (eligRows.length) {
      const e = eligRows[0];
      await conn.query(
        `INSERT INTO call_eligibility
          (id, program_id, eligible_country_types, eligible_entity_types,
           min_partners, min_countries, max_coord_applications,
           activity_location_types, additional_rules, writing_style, ai_detection_rules)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [uuid(), newId, e.eligible_country_types, e.eligible_entity_types,
         e.min_partners, e.min_countries, e.max_coord_applications,
         e.activity_location_types, e.additional_rules, e.writing_style, e.ai_detection_rules]
      );
    }

    // 3. Copy eval tree (sections → questions → criteria)
    const [sections] = await conn.query('SELECT * FROM eval_sections WHERE program_id=? ORDER BY sort_order', [sourceId]);
    for (const sec of sections) {
      const newSecId = uuid();
      await conn.query(
        'INSERT INTO eval_sections (id, program_id, title, form_ref, color, max_score, eval_notes, sort_order) VALUES (?,?,?,?,?,?,?,?)',
        [newSecId, newId, sec.title, sec.form_ref, sec.color, sec.max_score, sec.eval_notes, sec.sort_order]
      );
      const [questions] = await conn.query('SELECT * FROM eval_questions WHERE section_id=? ORDER BY sort_order', [sec.id]);
      for (const q of questions) {
        const newQId = uuid();
        await conn.query(
          `INSERT INTO eval_questions
            (id, section_id, code, title, description,
             general_context, connects_from, connects_to, global_rule,
             word_limit, page_limit, writing_guidance, scoring_logic,
             weight, max_score, threshold, general_rules, score_caps, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newQId, newSecId, q.code, q.title, q.description,
           q.general_context, q.connects_from, q.connects_to, q.global_rule,
           q.word_limit, q.page_limit, q.writing_guidance, q.scoring_logic,
           q.weight, q.max_score, q.threshold, q.general_rules, q.score_caps, q.sort_order]
        );
        const [criteria] = await conn.query('SELECT * FROM eval_criteria WHERE question_id=? ORDER BY sort_order', [q.id]);
        for (const c of criteria) {
          await conn.query(
            `INSERT INTO eval_criteria
              (id, question_id, title, max_score, mandatory, priority,
               intent, elements, example_weak, example_strong, avoid,
               meaning, structure, relations, rules, red_flags, score_rubric, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [uuid(), newQId, c.title, c.max_score, c.mandatory, c.priority || 'media',
             c.intent, c.elements, c.example_weak, c.example_strong, c.avoid,
             c.meaning, c.structure, c.relations, c.rules, c.red_flags, c.score_rubric, c.sort_order]
          );
        }
      }
    }

    // 4. Copy call_documents links
    const [docs] = await conn.query('SELECT * FROM call_documents WHERE program_id=?', [sourceId]);
    for (const d of docs) {
      await conn.query(
        'INSERT INTO call_documents (id, program_id, document_id, doc_type, label, sort_order) VALUES (?,?,?,?,?,?)',
        [uuid(), newId, d.document_id, d.doc_type, d.label, d.sort_order]
      );
    }

    await conn.commit();
    return { id: newId, name: newName };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

/* ══ Programme with counts (for unified card list) ═════════════ */

async function listProgramsWithCounts() {
  const [rows] = await pool.query(`
    SELECT p.*,
           ft.name AS template_name,
           (SELECT COUNT(*) FROM eval_sections WHERE program_id = p.id) AS section_count,
           (SELECT COUNT(*) FROM eval_criteria ec
            JOIN eval_questions eq ON ec.question_id = eq.id
            JOIN eval_sections es ON eq.section_id = es.id
            WHERE es.program_id = p.id) AS criteria_count,
           (SELECT COUNT(*) FROM call_documents WHERE program_id = p.id) AS doc_count
    FROM intake_programs p
    LEFT JOIN form_templates ft ON p.form_template_id = ft.id
    ORDER BY p.active DESC, p.deadline ASC
  `);
  return rows;
}

module.exports = {
  listPrograms, upsertProgram, deleteProgram,
  listCountries, upsertCountry, deleteCountry,
  listPerdiem, upsertPerdiem, deletePerdiem,
  listWorkerCategories, upsertWorkerCategory, deleteWorkerCategory,
  listEntities, upsertEntity, deleteEntity,
  listEligibility, listRegions, getCallEligibility, upsertCallEligibility,
  listWorkerMatrix, upsertWorkerZoneRate,
  getEvalTree, upsertEvalSection, deleteEvalSection,
  upsertEvalQuestion, deleteEvalQuestion,
  upsertEvalCriterion, deleteEvalCriterion,
  importEvalRules,
  listFormTemplates, getFormTemplate,
  listFormInstances, createFormInstance, getFormInstance,
  getFormValues, saveFormValues, updateFormInstance, deleteFormInstance,
  listCallDocuments, createCallDocument, deleteCallDocument, availableCallDocuments,
  duplicateProgram, listProgramsWithCounts, generateEvalFromTemplate
};
