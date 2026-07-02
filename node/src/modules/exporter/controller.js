/**
 * Exporter controller — Form Part B preview, DOCX render, manual field edits,
 * and single-field re-compression.
 */
'use strict';

const { loadFormBContext } = require('./model');
const { renderFormBDocx } = require('./render-form-b');
const { translateContext } = require('./translate');
const {
  ENFORCE_CAPS, FIELD_CHAR_LIMITS, TABLE_CELL_LIMITS,
  capNarrative, capTableRows, truncate, estimatePages,
} = require('./field-limits');
const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');

function ok(res, data) { res.json({ ok: true, data }); }
function bad(res, status, error) { res.status(status).json({ ok: false, error }); }

/* ── DOCX render (binary) ───────────────────────────────────────────── */

/**
 * Heuristic content-language detector for ES vs EN vs FR vs DE vs IT vs PT.
 * Counts stopword hits in the first ~3 narrative strings (summary, intake,
 * first WP summary). Returns a 2-letter code or '' if undecided.
 *
 * Lives here (not in translate.js) because it's only used to fix the
 * mismatch between projects.proposal_lang and actual stored content.
 */
function detectContentLang(ctx) {
  const STOPWORDS = {
    es: ['que', 'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'son', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'esto'],
    en: ['the', 'of', 'and', 'to', 'in', 'a', 'is', 'that', 'for', 'it', 'with', 'as', 'was', 'on', 'are', 'be', 'by', 'this', 'have', 'from', 'or', 'at', 'an', 'but', 'not', 'they', 'which', 'their', 'will', 'all', 'has', 'were', 'been', 'these', 'when', 'who', 'each', 'about', 'how', 'than', 'into', 'them', 'some'],
    fr: ['le', 'de', 'la', 'et', 'les', 'des', 'en', 'un', 'une', 'du', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'au', 'aux', 'ce', 'sont', 'avec', 'sans', 'son', 'sa', 'ses', 'leur', 'leurs', 'plus', 'tout', 'tous', 'cette', 'mais', 'ou', 'où', 'comme', 'aussi'],
    de: ['der', 'die', 'das', 'und', 'ist', 'von', 'den', 'zu', 'mit', 'ein', 'eine', 'auf', 'für', 'als', 'sich', 'auch', 'werden', 'sind', 'aus', 'nicht', 'oder', 'nach', 'wie', 'noch', 'aber', 'durch', 'über', 'bei', 'ihre', 'ihr', 'sein'],
    it: ['di', 'che', 'la', 'il', 'le', 'un', 'una', 'per', 'in', 'con', 'su', 'da', 'come', 'se', 'ma', 'sono', 'anche', 'più', 'nel', 'della', 'dei', 'delle', 'tra', 'fra', 'questo', 'questa', 'questi', 'queste'],
    pt: ['de', 'que', 'o', 'a', 'os', 'as', 'um', 'uma', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'por', 'pelos', 'pelas', 'sem', 'mais', 'mas', 'como', 'também', 'são', 'foi'],
  };
  const samples = [];
  const pushSample = (s) => { if (typeof s === 'string' && s.trim().length > 50) samples.push(s); };
  if (ctx.writer && typeof ctx.writer === 'object') {
    pushSample(ctx.writer.summary_text);
    pushSample(ctx.writer.s1_1_text);
  }
  if (ctx.context) {
    pushSample(ctx.context.problem);
    pushSample(ctx.context.approach);
  }
  (ctx.wps || []).slice(0, 2).forEach(wp => {
    pushSample(wp.summary);
    pushSample(wp.writerText);
    pushSample(wp.masterNarrative);
  });
  if (!samples.length) return '';
  const text = samples.join(' ').toLowerCase().slice(0, 6000);
  const tokens = text.match(/[a-záéíóúñàèìòùâêîôûäëïöüçß]+/gi) || [];
  if (tokens.length < 40) return '';
  const scores = {};
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    const set = new Set(words);
    let hits = 0;
    for (const t of tokens) if (set.has(t)) hits++;
    scores[lang] = hits / tokens.length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 0.04 ? best[0] : '';
}

exports.exportFormPartBDocx = async (req, res, next) => {
  try {
    const ctx = await loadFormBContext(req.params.projectId, req.user.id);

    // Idioma de descarga: si difiere del idioma de trabajo, traducimos in situ.
    // Sin query param → descarga en el idioma de trabajo (sin coste de IA).
    const declaredLang = (ctx.project.proposal_lang || '').toLowerCase();
    const detectedLang = detectContentLang(ctx);
    const srcLang = detectedLang || declaredLang;
    const targetLang = String(req.query.lang || '').toLowerCase().trim();
    if (detectedLang && declaredLang && detectedLang !== declaredLang) {
      console.warn(`[exporter] proposal_lang='${declaredLang}' but content looks like '${detectedLang}' — using detected`);
    }
    let langSuffix = '';
    if (targetLang && targetLang !== srcLang) {
      try {
        await translateContext(ctx, srcLang || 'en', targetLang);
        langSuffix = `_${targetLang}`;
      } catch (translateErr) {
        // No reventamos la descarga si la traducción falla: avisamos por log y
        // devolvemos el doc en idioma original con un header de aviso.
        console.error('[exporter] translation failed:', translateErr.message);
        res.setHeader('X-Translation-Error', String(translateErr.message).slice(0, 200));
      }
    }

    const buffer = await renderFormBDocx(ctx);
    const safeName = (ctx.project.name || 'project').replace(/[^a-z0-9._-]/gi, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_FormPartB${langSuffix}.docx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) { next(err); }
};

/* ── Rich preview (JSON) — feeds the new Writer-style preview UI ────── */

// Map each form field to its kind + which structured table (if any) it
// represents in the official EACEA Form Part B.
//
// kind:
//   'narrative'    → free text from form_field_values (LLM compressed)
//   'table'        → structured table rendered from DB (staff, risks, WPs…)
//   'declaration'  → user-checked / written by hand (section 6)
//
// table_key (only when kind='table'): the bucket inside ctx that holds the rows.
const FIELD_META = {
  // Cover / summary
  summary_text:           { number: 'PS',    label: 'Project summary',                       kind: 'narrative', section: 'Project Summary',                            chapter_key: 'ch_summary' },

  // 1. Relevance
  s1_1_text:              { number: '1.1',   label: 'Background and general objectives',     kind: 'narrative', section: '1. RELEVANCE',                                chapter_key: 'ch_1_1_background' },
  s1_2_text:              { number: '1.2',   label: 'Needs analysis and specific objectives', kind: 'narrative', section: '1. RELEVANCE',                               chapter_key: 'ch_1_2_needs' },
  s1_3_text:              { number: '1.3',   label: 'Complementarity, innovation, EU added value', kind: 'narrative', section: '1. RELEVANCE',                          chapter_key: 'ch_1_3_complementarity' },

  // 2.1 Quality — Project design and implementation
  s2_1_1_text:            { number: '2.1.1', label: 'Concept and methodology',               kind: 'narrative', section: '2.1 Project design and implementation',      chapter_key: 'ch_2_1_1_concept' },
  s2_1_2_text:            { number: '2.1.2', label: 'Project management, QA, monitoring',    kind: 'narrative', section: '2.1 Project design and implementation',      chapter_key: 'ch_2_1_2_management' },
  s2_1_3_staff_table:     { number: '2.1.3', label: 'Project teams, staff and experts',      kind: 'table',     section: '2.1 Project design and implementation',      table_key: 'staff',      chapter_key: 'ch_2_1_3_staff' },
  s2_1_4_text:            { number: '2.1.4', label: 'Cost effectiveness and financial management', kind: 'narrative', section: '2.1 Project design and implementation', chapter_key: 'ch_2_1_4_cost_effectiveness' },
  s2_1_5_risk_table:      { number: '2.1.5', label: 'Risk management',                       kind: 'table',     section: '2.1 Project design and implementation',      table_key: 'risks',      chapter_key: 'ch_2_1_5_risk' },

  // 2.2 Quality — Consortium
  s2_2_1_text:            { number: '2.2.1', label: 'Consortium set-up',                     kind: 'narrative', section: '2.2 Consortium',                              chapter_key: 'ch_2_2_1_consortium_setup' },
  s2_2_2_text:            { number: '2.2.2', label: 'Consortium management and decision-making', kind: 'narrative', section: '2.2 Consortium',                          chapter_key: 'ch_2_2_2_consortium_management' },

  // 3. Impact
  s3_1_text:              { number: '3.1',   label: 'Impact and ambition',                   kind: 'narrative', section: '3. IMPACT',                                   chapter_key: 'ch_3_1_impact' },
  s3_2_text:              { number: '3.2',   label: 'Communication, dissemination, visibility', kind: 'narrative', section: '3. IMPACT',                                chapter_key: 'ch_3_2_dissemination' },
  s3_3_text:              { number: '3.3',   label: 'Sustainability and continuation',       kind: 'narrative', section: '3. IMPACT',                                   chapter_key: 'ch_3_3_sustainability' },

  // 4. Work plan
  s4_1_text:              { number: '4.1',   label: 'Work plan overview',                    kind: 'narrative', section: '4. WORK PLAN',                                chapter_key: 'ch_4_1_workplan' },
  // 4.2 is represented by the wps table — built dynamically below

  // 5. Other
  s5_1_text:              { number: '5.1',   label: 'Ethics',                                kind: 'narrative', section: '5. OTHER',                                    chapter_key: 'ch_5_1_ethics' },
  s5_2_text:              { number: '5.2',   label: 'Security',                              kind: 'narrative', section: '5. OTHER',                                    chapter_key: 'ch_5_2_security' },

  // 6. Declarations (filled by the coordinator in the EACEA portal)
  s6_1_details:           { number: '6.1',   label: 'Double funding declaration',            kind: 'declaration', section: '6. DECLARATIONS' },
  s6_2_justification:     { number: '6.2',   label: 'FSTP justification',                    kind: 'declaration', section: '6. DECLARATIONS' },
  s6_3_consent:           { number: '6.3',   label: 'Seal of Excellence consent',            kind: 'declaration', section: '6. DECLARATIONS' },
};

// Fixed section ordering for the sidebar.
const SECTION_ORDER = [
  'Project Summary',
  '1. RELEVANCE',
  '2.1 Project design and implementation',
  '2.2 Consortium',
  '3. IMPACT',
  '4. WORK PLAN',
  '5. OTHER',
  '6. DECLARATIONS',
];

exports.previewFormPartB = async (req, res, next) => {
  try {
    const ctx = await loadFormBContext(req.params.projectId, req.user.id);
    const writer = ctx.writer || {};

    // Build per-field summaries
    const fieldOrder = Object.keys(FIELD_META);
    const items = [];

    for (const fid of fieldOrder) {
      const meta = FIELD_META[fid];
      const isNarrative = meta.kind === 'narrative';
      const value = writer[fid] || '';
      const charCount = value.length;
      const maxChars = FIELD_CHAR_LIMITS[fid] || null;
      const isFilled = !!value && value.trim().length > 50;
      const warnings = [];
      if (isNarrative && !isFilled) warnings.push('no_value');
      // Solo flag de "exceso" si el enforcement está activo. Si no, el cap
      // es sólo orientativo y los textos pueden ir más largos sin warning.
      if (ENFORCE_CAPS && isNarrative && maxChars && charCount > maxChars) {
        warnings.push(`over_limit_by_${charCount - maxChars}`);
      }
      items.push({
        id: fid,
        number: meta.number,
        label: meta.label,
        kind: meta.kind,
        section: meta.section,
        chapter_key: meta.chapter_key || null,
        value: isNarrative ? value : '',
        char_count: charCount,
        max_chars: maxChars,
        page_estimate: estimatePages(value),
        is_filled: isFilled,
        warnings,
      });
    }

    // 4.2 Staff Effort Matrix — item sintético que cruza Partner × WP × PM.
    // Replica la tabla oficial "Staff effort per participant" del Form Part B.
    const wpListForMatrix = (ctx.wps || []);
    const partnersForMatrix = (ctx.partners || []);
    const matrixRows = partnersForMatrix.map(p => {
      const cells = wpListForMatrix.map(w => ({
        wp_id: w.id,
        wp_code: w.code || `WP${wpListForMatrix.indexOf(w)+1}`,
        wp_title: w.title || '',
        is_leader: w.leader_id === p.id,
        pm: (ctx.staffEffort && ctx.staffEffort[p.id]) ? (ctx.staffEffort[p.id][w.id] || 0) : 0,
      }));
      const total = cells.reduce((s, c) => s + (Number(c.pm) || 0), 0);
      return {
        partner_id: p.id,
        partner_name: p.legal_name || p.name || '?',
        partner_acronym: p.name || '',
        is_coordinator: p.role === 'applicant',
        cells,
        total: Math.round(total * 10) / 10,
      };
    });
    const matrixTotalsByWp = wpListForMatrix.map(w => ({
      wp_id: w.id,
      wp_code: w.code || `WP${wpListForMatrix.indexOf(w)+1}`,
      pm: Math.round(matrixRows.reduce((s, r) => {
        const cell = r.cells.find(c => c.wp_id === w.id);
        return s + (cell ? Number(cell.pm) || 0 : 0);
      }, 0) * 10) / 10,
    }));
    const matrixTotalPm = Math.round(matrixRows.reduce((s, r) => s + r.total, 0) * 10) / 10;
    const staffEffortItem = {
      id: 'staff_effort_matrix',
      number: '4.2 — Staff Effort',
      label: 'Staff effort per participant',
      kind: 'staff_effort_matrix',
      section: '4. WORK PLAN',
      matrix_rows: matrixRows,
      matrix_totals_by_wp: matrixTotalsByWp,
      matrix_total_pm: matrixTotalPm,
      wp_count: wpListForMatrix.length,
      warnings: matrixTotalPm <= 0 ? ['no_effort'] : [],
    };

    // 4.2 Work Packages — one synthetic item per WP, each carrying its table
    // sub-rows (tasks, milestones, deliverables). The UI renders these as
    // read-only nested tables and shows a "→ Escribir" link when empty.
    const wpItems = (ctx.wps || []).map((wp, idx) => {
      const wpNum = idx + 1;
      const tasks = capTableRows((wp.tasks || []).map(t => ({
        task_no: t.code || '', task_name: t.title || '', task_description: t.description || '',
      })));
      const milestones = capTableRows((wp.milestones || []).map(m => ({
        ms_no: m.code || '', ms_name: m.title || '', ms_description: m.description || '',
        ms_due: m.due_month != null ? `M${m.due_month}` : '',
      })));
      const deliverables = capTableRows((wp.deliverables || []).map(d => ({
        del_no: d.code || '', del_name: d.title || '', del_description: d.description || '',
        del_type: d.type || '', del_due: d.due_month != null ? `M${d.due_month}` : '',
      })));
      const warnings = [];
      if (!tasks.length) warnings.push('no_tasks');
      if (!milestones.length) warnings.push('no_milestones');
      if (!deliverables.length) warnings.push('no_deliverables');
      return {
        id: `wp_${wp.id}`,
        number: `4.2.${wpNum}`,
        label: `${wp.code || 'WP' + wpNum} — ${wp.title || ''}`,
        kind: 'wp',
        section: '4. WORK PLAN',
        wp_id: wp.id,
        wp_code: wp.code,
        wp_title: wp.title,
        wp_duration: `M${wp.duration_from_month || 1} – M${wp.duration_to_month || ctx.project.duration_months || '?'}`,
        wp_objectives: truncate(wp.objectives || wp.summary || '', 1000),
        person_months: wp.personMonths || 0,
        budget: wp.budget || { rows: [], total: 0, indirect_pct: 0 },
        tasks, milestones, deliverables,
        warnings,
      };
    });

    // Group items by section
    const sectionsMap = {};
    for (const it of items) {
      if (!sectionsMap[it.section]) sectionsMap[it.section] = { id: it.section, label: it.section, items: [] };
      sectionsMap[it.section][/* placeholder */ 'items'].push(it);
    }
    // Insert WP items + Staff Effort matrix into "4. WORK PLAN"
    if (wpItems.length || matrixRows.length) {
      if (!sectionsMap['4. WORK PLAN']) sectionsMap['4. WORK PLAN'] = { id: '4. WORK PLAN', label: '4. WORK PLAN', items: [] };
      sectionsMap['4. WORK PLAN'].items.push(...wpItems);
      sectionsMap['4. WORK PLAN'].items.push(staffEffortItem);
    }

    // Order sections according to SECTION_ORDER
    const sections = SECTION_ORDER
      .filter(s => sectionsMap[s])
      .map(s => sectionsMap[s]);

    // Global tables (built once, shown in the relevant items)
    const tables = {
      staff:        capTableRows((ctx.selectedStaff || []).map(s => ({
        staff_name_function: s.full_name || '',
        staff_organisation:  s.partner_legal_name || s.partner_name || '',
        staff_role_tasks:    s.project_role || s.directory_role || '',
        staff_profile:       (s.custom_skills && s.custom_skills.trim()) ? s.custom_skills : (s.directory_bio || ''),
      }))),
      risks: capTableRows((ctx.risks || []).map(r => ({
        risk_no: r.risk_no || '',
        risk_description: r.description || '',
        risk_wp_code: r.wp_id ? ((ctx.wps || []).find(w => w.id === r.wp_id) || {}).code || 'cross-cutting' : 'cross-cutting',
        risk_mitigation: r.mitigation || '',
      }))),
      euProjects: capTableRows((ctx.euProjects || []).map(p => ({
        ep_participant: p.partner_name || '',
        ep_reference: [p.reference_no, p.title].filter(Boolean).join(' — '),
        ep_period: p.year || '',
        ep_role: p.role || '',
      }))),
    };

    // Attach the table rows to the corresponding narrative items (2.1.3, 2.1.5)
    // so the UI can render the table inline next to the narrative.
    for (const sec of sections) {
      for (const it of sec.items) {
        if (it.id === 's2_1_3_staff_table') {
          it.kind = 'narrative_with_table';
          it.table_label = 'Staff';
          it.table_rows = tables.staff;
          if (!tables.staff.length) it.warnings.push('table_empty');
        } else if (it.id === 's2_1_5_risk_table') {
          it.kind = 'narrative_with_table';
          it.table_label = 'Risks';
          it.table_rows = tables.risks;
          if (!tables.risks.length) it.warnings.push('table_empty');
        }
      }
    }

    // Global counters
    const allItems = sections.flatMap(s => s.items);
    const narrativeItems = allItems.filter(i => i.kind === 'narrative' || i.kind === 'narrative_with_table');
    const filledNarrative = narrativeItems.filter(i => i.is_filled).length;
    const totalNarrativeChars = narrativeItems.reduce((s, i) => s + i.char_count, 0);
    const totalNarrativeCap = narrativeItems.reduce((s, i) => s + (i.max_chars || 0), 0);
    // Page estimation: narrative chars / 1500 + tables (rough constants).
    const narrativePages = totalNarrativeChars / 1500;
    const tablePages =
      tables.staff.length * 0.4 +
      tables.risks.length * 0.5 +
      wpItems.reduce((s, wp) => s + 1 + (wp.tasks.length * 0.2) + (wp.milestones.length * 0.15) + (wp.deliverables.length * 0.15), 0) +
      (tables.euProjects.length * 0.1);
    const totalPagesEstimate = Math.round((narrativePages + tablePages) * 10) / 10;

    // Look up the existing form_instance for this project (used by manual edit + recompress endpoints)
    const [[instance]] = await db.execute(
      `SELECT fi.id FROM form_instances fi WHERE fi.project_id = ? ORDER BY fi.created_at DESC LIMIT 1`,
      [req.params.projectId]
    );

    ok(res, {
      project: { id: ctx.project.id, name: ctx.project.name, type: ctx.project.type },
      instance_id: instance ? instance.id : null,
      global: {
        total_pages_estimate: totalPagesEstimate,
        target_pages: 120,
        narrative_chars_used: totalNarrativeChars,
        narrative_chars_cap: totalNarrativeCap,
        narrative_filled: filledNarrative,
        narrative_total: narrativeItems.length,
        wp_count: wpItems.length,
        partner_count: (ctx.partners || []).length,
        eu_projects_count: (ctx.euProjects || []).length,
      },
      sections,
      tables_summary: {
        staff: { count: tables.staff.length, empty: !tables.staff.length },
        risks: { count: tables.risks.length, empty: !tables.risks.length },
        wps:   { count: wpItems.length,      empty: !wpItems.length },
        euProjects: { count: tables.euProjects.length, empty: !tables.euProjects.length },
      },
    });
  } catch (err) { next(err); }
};

/* ── Manual edit of a form field value (no LLM call) ────────────────── */

// PATCH /v1/exporter/form-field-values/:instanceId/:fieldId
// Body: { value_text }
// Persists the user's manual edit in form_field_values (upsert).
exports.patchFormFieldValue = async (req, res, next) => {
  try {
    const { instanceId, fieldId } = req.params;
    const { value_text } = req.body || {};
    if (typeof value_text !== 'string') return bad(res, 400, 'value_text (string) is required');

    // Truncado defensivo SOLO si ENFORCE_CAPS=true. Por defecto la edición
    // manual respeta exactamente el texto que el usuario escribió.
    const cap = FIELD_CHAR_LIMITS[fieldId] || null;
    const cleanedRaw = value_text;
    const cleaned = (ENFORCE_CAPS && cap) ? truncate(cleanedRaw, cap) : cleanedRaw;
    const charCount = cleaned.length;

    // Validate that the instance exists and belongs to a project the user owns.
    const [[instance]] = await db.execute(
      `SELECT fi.id, fi.project_id, p.user_id
         FROM form_instances fi
         JOIN projects p ON p.id = fi.project_id
        WHERE fi.id = ? LIMIT 1`,
      [instanceId]
    );
    if (!instance) return bad(res, 404, 'form_instance not found');
    if (instance.user_id !== req.user.id) return bad(res, 403, 'forbidden');

    const [[existing]] = await db.execute(
      `SELECT id, value_json FROM form_field_values WHERE instance_id = ? AND field_id = ? LIMIT 1`,
      [instanceId, fieldId]
    );

    let meta = {};
    if (existing && existing.value_json) {
      try { meta = JSON.parse(existing.value_json); } catch (_) { meta = {}; }
    }
    meta.char_count = charCount;
    meta.word_count = cleaned.split(/\s+/).filter(Boolean).length;
    meta.manually_edited = true;
    meta.last_manual_edit_at = new Date().toISOString();

    if (existing) {
      await db.execute(
        `UPDATE form_field_values SET value_text = ?, value_json = ?, updated_at = NOW() WHERE id = ?`,
        [cleaned, JSON.stringify(meta), existing.id]
      );
    } else {
      await db.execute(
        `INSERT INTO form_field_values (id, instance_id, field_id, section_path, value_text, value_json) VALUES (?, ?, ?, ?, ?, ?)`,
        [genUUID(), instanceId, fieldId, null, cleaned, JSON.stringify(meta)]
      );
    }

    ok(res, {
      field_id: fieldId,
      value_text: cleaned,
      char_count: charCount,
      max_chars: cap,
      manually_edited: true,
      truncated: cleanedRaw.length !== cleaned.length,
    });
  } catch (err) { next(err); }
};

/* ── Re-compress one single field on demand ─────────────────────────── */
// Stub that delegates to master.compressToForm internals — exposed so the
// preview UI can refresh one field without re-running the entire compression.
// Implemented in master/controller.js to keep the LLM plumbing centralised.
// Routed under /v1/master/documents/:docId/compress-field/:fieldId.
