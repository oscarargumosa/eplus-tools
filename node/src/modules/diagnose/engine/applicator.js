// Applicator — applies an accepted improvement_action to the project's form.
//
// Flow:
//   1. Snapshot the current form_field_values into proposal_versions.
//   2. Compute the new section text (replace/add/delete).
//   3. Update form_field_values.value_text.
//   4. Mark the improvement_action as accepted (applied_version_id, applied_at).
//   5. Mark the associated diagnosis_finding as resolved.

const pool = require('../../../utils/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Apply an action. Idempotent: if already accepted, returns the existing
 * version_id without re-applying.
 */
async function applyAction(actionId, userId) {
  const action = await loadAction(actionId);
  if (!action) throw new Error(`Action ${actionId} not found`);
  if (action.state === 'accepted') {
    return { actionId, versionId: action.applied_version_id, alreadyApplied: true };
  }

  const { project_id: projectId, where_field_id: fieldId } = action;
  if (!fieldId) throw new Error('Action has no target field_id');

  // 1. Load current section text + instance
  const [fieldRows] = await pool.query(
    `SELECT i.id AS instance_id, v.id AS value_id, v.value_text
     FROM form_instances i
     JOIN form_field_values v ON v.instance_id = i.id
     WHERE i.project_id = ? AND v.field_id = ?
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    [projectId, fieldId]
  );
  if (fieldRows.length === 0) {
    throw new Error(`Section ${fieldId} not found in this project's form`);
  }
  const { instance_id: instanceId, value_id: valueId, value_text: currentText } = fieldRows[0];

  // 2. Snapshot the whole form into proposal_versions
  const versionId = await snapshotForm(projectId, instanceId, userId, `improvement: ${actionId}`);

  // 3. Compute new text
  const newText = computeNewText(currentText, action);
  if (newText === currentText) {
    throw new Error('The proposed change does not modify the section. "before" text may not match the current content.');
  }

  // 4. Update form_field_values
  await pool.query(
    `UPDATE form_field_values SET value_text = ? WHERE id = ?`,
    [newText, valueId]
  );

  // 5. Mark action accepted + finding resolved
  await pool.query(
    `UPDATE improvement_actions
     SET state = 'accepted',
         applied_at = NOW(),
         applied_version_id = ?
     WHERE id = ?`,
    [versionId, actionId]
  );
  await pool.query(
    `UPDATE diagnosis_findings
     SET state = 'resolved', resolved_at = NOW()
     WHERE id = ?`,
    [action.finding_id]
  );

  return { actionId, versionId, alreadyApplied: false };
}

async function rejectAction(actionId, userId) {
  const action = await loadAction(actionId);
  if (!action) throw new Error(`Action ${actionId} not found`);
  if (action.state === 'rejected') return { actionId, alreadyRejected: true };

  await pool.query(
    `UPDATE improvement_actions SET state = 'rejected' WHERE id = ?`,
    [actionId]
  );
  await pool.query(
    `UPDATE diagnosis_findings SET state = 'dismissed' WHERE id = ?`,
    [action.finding_id]
  );
  return { actionId };
}

/**
 * Modify the "after" text of an existing proposed action without applying.
 * Useful when the user wants to tweak the proposal before accepting.
 */
async function modifyAction(actionId, newAfter, userId) {
  await pool.query(
    `UPDATE improvement_actions
     SET after_text = ?, state = 'modified'
     WHERE id = ?`,
    [newAfter, actionId]
  );
  return await loadAction(actionId);
}

async function loadAction(actionId) {
  const [rows] = await pool.query(
    `SELECT * FROM improvement_actions WHERE id = ?`,
    [actionId]
  );
  return rows[0] || null;
}

/* ── Snapshot + rollback ──────────────────────────────────────────────────── */

async function snapshotForm(projectId, instanceId, userId, notes) {
  // Get next version number
  const [vRows] = await pool.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM proposal_versions WHERE project_id = ?`,
    [projectId]
  );
  const versionNumber = vRows[0].next;

  // Snapshot all field values of this instance
  const [fields] = await pool.query(
    `SELECT field_id, section_path, value_text, value_json
     FROM form_field_values
     WHERE instance_id = ?`,
    [instanceId]
  );
  const snapshot = {
    instance_id: instanceId,
    fields: fields.map(f => ({
      field_id: f.field_id,
      section_path: f.section_path,
      value_text: f.value_text,
      value_json: f.value_json,
    })),
  };

  const versionId = uuidv4();
  await pool.query(
    `INSERT INTO proposal_versions
     (id, project_id, version_number, triggered_by, snapshot_json, notes, created_by_user_id)
     VALUES (?, ?, ?, 'improvement_action', ?, ?, ?)`,
    [versionId, projectId, versionNumber, JSON.stringify(snapshot), notes, userId || null]
  );
  return versionId;
}

async function rollbackToVersion(projectId, versionId, userId) {
  const [rows] = await pool.query(
    `SELECT snapshot_json FROM proposal_versions
     WHERE id = ? AND project_id = ?`,
    [versionId, projectId]
  );
  if (rows.length === 0) throw new Error(`Version ${versionId} not found for project`);

  let snap;
  try {
    snap = typeof rows[0].snapshot_json === 'string'
      ? JSON.parse(rows[0].snapshot_json)
      : rows[0].snapshot_json;
  } catch (e) { throw new Error('snapshot_json invalid: ' + e.message); }

  if (!snap || !snap.instance_id || !Array.isArray(snap.fields)) {
    throw new Error('snapshot_json is malformed.');
  }

  // Take a fresh snapshot of the CURRENT state before rolling back
  // (so the user can re-rollback if needed)
  await snapshotForm(projectId, snap.instance_id, userId, `pre-rollback (target: ${versionId})`);

  // Apply each field
  for (const f of snap.fields) {
    await pool.query(
      `UPDATE form_field_values
       SET value_text = ?, value_json = ?
       WHERE instance_id = ? AND field_id = ?`,
      [f.value_text, f.value_json ? JSON.stringify(f.value_json) : null, snap.instance_id, f.field_id]
    );
  }

  return { projectId, versionId, fieldsRestored: snap.fields.length };
}

async function listVersions(projectId) {
  const [rows] = await pool.query(
    `SELECT id, version_number, triggered_by, notes, created_at,
            created_by_user_id
     FROM proposal_versions
     WHERE project_id = ?
     ORDER BY version_number DESC`,
    [projectId]
  );
  return rows;
}

/* ── Pure text application ────────────────────────────────────────────────── */

function computeNewText(currentText, action) {
  const before = action.before_text || '';
  const after = action.after_text || '';
  const ct = action.change_type || 'replace';

  if (ct === 'replace') {
    if (!before) {
      // Empty before → append to end (graceful fallback)
      return currentText + '\n\n' + after;
    }
    // Try exact match first
    if (currentText.includes(before)) {
      return currentText.replace(before, after);
    }
    // Whitespace-collapsed fallback
    const normalize = s => s.replace(/\s+/g, ' ').trim();
    const normalizedCurrent = normalize(currentText);
    const normalizedBefore = normalize(before);
    if (normalizedCurrent.includes(normalizedBefore)) {
      // Find the rough position and do a less precise replacement.
      // For safety, refuse to apply automatically — caller can mark modified.
      throw new Error('The "before" text matches when whitespace is collapsed but not exactly. Modify the proposal before accepting.');
    }
    throw new Error('The "before" text was not found in the section. The section may have been edited since the proposal was generated. Re-generate the proposal.');
  }

  if (ct === 'add') {
    return currentText + (currentText.endsWith('\n') ? '' : '\n\n') + after;
  }

  if (ct === 'delete') {
    if (!before) return currentText;
    return currentText.replace(before, '');
  }

  throw new Error(`Unknown change_type: ${ct}`);
}

module.exports = {
  applyAction,
  rejectAction,
  modifyAction,
  loadAction,
  rollbackToVersion,
  listVersions,
  snapshotForm,
  computeNewText,
};
