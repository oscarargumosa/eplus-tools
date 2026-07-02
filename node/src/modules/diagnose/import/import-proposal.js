// Import an external Form Part B Word into the system as a new imported project.
//
// Steps:
//   1. Validate the call (program) exists in intake_programs.
//   2. Resolve its form_template_id (or fall back to the default EACEA template).
//   3. Parse the Word into field_id -> text using the Word parser.
//   4. Create a projects row with origin='imported'.
//   5. Create a form_instances row linked to the project.
//   6. Insert form_field_values for each parsed field.
//   7. Return { projectId, instanceId, parserReport }.

const { v4: uuidv4 } = require('uuid');
const pool = require('../../../utils/db');
const { parseWordPartB } = require('../parser/word-form-parser');

const DEFAULT_TEMPLATE_ID = '00000000-0000-4000-b000-000000000001'; // ERASMUS BB and LS Type II

async function importWordProposal({ buffer, programId, userId, projectName }) {
  // 1. Validate program
  const [progRows] = await pool.query(
    `SELECT id, program_id, name, form_template_id
     FROM intake_programs
     WHERE id = ?`,
    [programId]
  );
  if (progRows.length === 0) {
    throw new Error(`Program ${programId} not found in intake_programs.`);
  }
  const program = progRows[0];

  // 2. Resolve template
  const templateId = program.form_template_id || DEFAULT_TEMPLATE_ID;
  const [tplRows] = await pool.query(
    `SELECT id, name, template_json FROM form_templates WHERE id = ?`,
    [templateId]
  );
  if (tplRows.length === 0) {
    throw new Error(`form_template ${templateId} not found.`);
  }
  let template;
  try {
    template = JSON.parse(tplRows[0].template_json);
  } catch (e) {
    throw new Error('template_json is not valid JSON: ' + e.message);
  }

  // 3. Parse the Word
  const parsed = await parseWordPartB(buffer, template);
  if (Object.keys(parsed.fields).length === 0) {
    throw new Error('The Word file did not yield any recognizable sections. Make sure it is a Form Part B with numbered subsections (1.1, 1.2, 2.1.1...).');
  }

  // 4. Create project
  const projectId = uuidv4();
  const name = (projectName || '').trim() || `Imported · ${new Date().toISOString().slice(0, 10)}`;

  await pool.query(
    `INSERT INTO projects
     (id, user_id, name, type, proposal_lang, duration_months, status, origin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'design', 'imported', NOW(), NOW())`,
    [
      projectId,
      userId,
      name.slice(0, 100),
      program.program_id || 'imported',  // projects.type stores the program code
      'en',
      24,
    ]
  );

  // 5. Create form_instance
  const instanceId = uuidv4();
  await pool.query(
    `INSERT INTO form_instances
     (id, user_id, template_id, program_id, project_id, title, status)
     VALUES (?, ?, ?, ?, ?, ?, 'in_progress')`,
    [
      instanceId,
      userId,
      templateId,
      programId,
      projectId,
      name.slice(0, 300),
    ]
  );

  // 6. Insert form_field_values
  const fieldRows = Object.entries(parsed.fields).map(([fieldId, valueText]) => [
    uuidv4(), instanceId, fieldId, sectionOf(fieldId), valueText, null,
  ]);
  if (fieldRows.length > 0) {
    await pool.query(
      `INSERT INTO form_field_values
       (id, instance_id, field_id, section_path, value_text, value_json)
       VALUES ?`,
      [fieldRows]
    );
  }

  return {
    projectId,
    instanceId,
    parserReport: {
      sectionsCovered: parsed.sectionsCovered,
      errors: parsed.errors,
      totalChars: parsed.totalChars,
      headingsDetected: parsed.headingsDetected,
      fieldsExtracted: Object.keys(parsed.fields).length,
    },
  };
}

/**
 * Import from a flat fields map (paste-by-section mode).
 * Same as importWordProposal but skips the Word parsing step.
 */
async function importPasteProposal({ fields, programId, userId, projectName }) {
  const [progRows] = await pool.query(
    `SELECT id, program_id, name, form_template_id FROM intake_programs WHERE id = ?`,
    [programId]
  );
  if (progRows.length === 0) {
    throw new Error(`Program ${programId} not found.`);
  }
  const program = progRows[0];
  const templateId = program.form_template_id || DEFAULT_TEMPLATE_ID;

  const cleaned = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const trimmed = (v || '').toString().trim();
    if (trimmed.length >= 30) cleaned[k] = trimmed;
  }
  if (Object.keys(cleaned).length === 0) {
    throw new Error('At least one section must contain content (≥30 chars).');
  }

  const projectId = uuidv4();
  const name = (projectName || '').trim() || `Imported (paste) · ${new Date().toISOString().slice(0, 10)}`;

  await pool.query(
    `INSERT INTO projects
     (id, user_id, name, type, proposal_lang, duration_months, status, origin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'design', 'imported', NOW(), NOW())`,
    [projectId, userId, name.slice(0, 100), program.program_id || 'imported', 'en', 24]
  );

  const instanceId = uuidv4();
  await pool.query(
    `INSERT INTO form_instances
     (id, user_id, template_id, program_id, project_id, title, status)
     VALUES (?, ?, ?, ?, ?, ?, 'in_progress')`,
    [instanceId, userId, templateId, programId, projectId, name.slice(0, 300)]
  );

  const fieldRows = Object.entries(cleaned).map(([fid, txt]) => [
    uuidv4(), instanceId, fid, sectionOf(fid), txt, null,
  ]);
  await pool.query(
    `INSERT INTO form_field_values
     (id, instance_id, field_id, section_path, value_text, value_json)
     VALUES ?`,
    [fieldRows]
  );

  return {
    projectId,
    instanceId,
    parserReport: {
      sectionsCovered: Object.entries(cleaned).map(([fid, t]) => ({ fieldId: fid, chars: t.length })),
      errors: [],
      fieldsExtracted: Object.keys(cleaned).length,
    },
  };
}

function sectionOf(fieldId) {
  const m = /^(s\d+)/.exec(fieldId || '');
  return m ? m[1] : 'other';
}

module.exports = { importWordProposal, importPasteProposal };
