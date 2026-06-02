// Load the current Form Part B state for a project as a flat map.
// Returns { fields: { field_id -> text }, instance_id, program_id, project }.

const pool = require('../../../utils/db');

/**
 * Find the latest/active form_instance for a project and load its field values.
 * Returns null if the project has no form_instance.
 */
async function loadProjectForm(projectId) {
  // Project metadata
  const [projectRows] = await pool.query(
    `SELECT p.id, p.user_id, p.name, p.full_name, p.type, p.proposal_lang,
            p.national_agency, p.duration_months, p.eu_grant, p.cofin_pct,
            p.status, p.origin, p.calc_state, p.interview_summary,
            p.source_evaluation_id
     FROM projects p
     WHERE p.id = ?`,
    [projectId]
  );
  if (projectRows.length === 0) return null;
  const project = projectRows[0];

  // Most recent form_instance for this project (status != complete preferred)
  const [instanceRows] = await pool.query(
    `SELECT fi.id, fi.template_id, fi.program_id, fi.title, fi.status, fi.updated_at,
            ip.program_id AS programme_code, ip.name AS programme_name,
            ip.action_type
     FROM form_instances fi
     JOIN intake_programs ip ON fi.program_id = ip.id
     WHERE fi.project_id = ?
     ORDER BY fi.updated_at DESC
     LIMIT 1`,
    [projectId]
  );

  if (instanceRows.length === 0) {
    return { project, instance: null, fields: {}, fieldsBySection: {} };
  }

  const instance = instanceRows[0];

  const [fieldRows] = await pool.query(
    `SELECT field_id, section_path, value_text, value_json
     FROM form_field_values
     WHERE instance_id = ?`,
    [instance.id]
  );

  // Flat map field_id -> text (concat value_text + stringified value_json)
  const fields = {};
  const fieldsBySection = {};

  for (const r of fieldRows) {
    let text = r.value_text || '';
    if (!text && r.value_json) {
      try {
        const obj = typeof r.value_json === 'string' ? JSON.parse(r.value_json) : r.value_json;
        text = JSON.stringify(obj);
      } catch (e) { /* skip */ }
    }
    fields[r.field_id] = text;

    const section = (r.section_path || sectionOf(r.field_id)).toLowerCase();
    if (!fieldsBySection[section]) fieldsBySection[section] = {};
    fieldsBySection[section][r.field_id] = text;
  }

  return { project, instance, fields, fieldsBySection };
}

/**
 * Derive a section bucket from a field_id like 's1_1_text' or 's4_2_wp_xxx'.
 * Returns the major section ('s1','s2','s4',...).
 */
function sectionOf(fieldId) {
  const m = /^(s\d+)/.exec(fieldId || '');
  return m ? m[1] : 'other';
}

/**
 * All text concatenated, with field labels — useful for global keyword searches.
 */
function allText(loaded) {
  return Object.entries(loaded.fields)
    .map(([k, v]) => `[[${k}]]\n${v}`)
    .join('\n\n');
}

/**
 * Match field_ids by a prefix pattern (s5, s1_1, etc.).
 * Returns { field_id -> text } subset.
 */
function fieldsMatching(loaded, prefix) {
  const out = {};
  const re = new RegExp('^' + prefix.replace(/[.\-+]/g, '\\$&'), 'i');
  for (const [k, v] of Object.entries(loaded.fields)) {
    if (re.test(k)) out[k] = v;
  }
  return out;
}

module.exports = { loadProjectForm, sectionOf, allText, fieldsMatching };
