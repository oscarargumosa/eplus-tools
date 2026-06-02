// Migration 112: Extend projects.origin ENUM with 'recycled' and add FK
// projects.source_evaluation_id → evaluation_letters(id).
//
// Replanteo Diagnose & Improve (TASK-007).
//
// Today projects.origin = ENUM('scratch','imported'). The new flow adds
// 'recycled' (Door C: project re-presented after rejection, optionally with
// evaluator letter as input). projects.source_evaluation_id already exists
// without FK — we wire it to the new evaluation_letters table now.

module.exports = async function (conn) {
  // ─── 1. Extend ENUM 'origin' to include 'recycled' ────────────────────────
  const [colInfo] = await conn.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'projects'
       AND COLUMN_NAME = 'origin'`
  );

  if (colInfo.length === 0) {
    console.log('[112] projects.origin not found — skipping ENUM extension');
  } else {
    const currentEnum = colInfo[0].COLUMN_TYPE;
    if (!currentEnum.includes("'recycled'")) {
      await conn.query(
        `ALTER TABLE projects
         MODIFY COLUMN origin ENUM('scratch','imported','recycled')
         NOT NULL DEFAULT 'scratch'`
      );
      console.log('[112] projects.origin extended with recycled');
    } else {
      console.log('[112] projects.origin already has recycled — skipped');
    }
  }

  // ─── 2. Add FK projects.source_evaluation_id → evaluation_letters(id) ─────
  const [colExists] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'projects'
       AND COLUMN_NAME = 'source_evaluation_id'`
  );

  if (colExists.length === 0) {
    console.log('[112] projects.source_evaluation_id column missing — skipping FK');
    return;
  }

  const [fkExists] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'projects'
       AND COLUMN_NAME = 'source_evaluation_id'
       AND REFERENCED_TABLE_NAME = 'evaluation_letters'`
  );

  if (fkExists.length > 0) {
    console.log('[112] FK projects.source_evaluation_id → evaluation_letters already exists — skipped');
  } else {
    const [tblExists] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evaluation_letters'`
    );
    if (tblExists.length === 0) {
      console.log('[112] evaluation_letters table not yet created — FK skipped');
      return;
    }

    // Old values pointed to master_diagnoses (now dropped). Clear them so the
    // FK constraint can be added without violations.
    const [orphaned] = await conn.query(
      `UPDATE projects
       SET source_evaluation_id = NULL
       WHERE source_evaluation_id IS NOT NULL
         AND source_evaluation_id NOT IN (SELECT id FROM evaluation_letters)`
    );
    if (orphaned.affectedRows > 0) {
      console.log(`[112] cleared ${orphaned.affectedRows} orphaned source_evaluation_id (pointed to dropped master_diagnoses)`);
    }

    await conn.query(
      `ALTER TABLE projects
       ADD CONSTRAINT fk_project_source_evaluation
       FOREIGN KEY (source_evaluation_id) REFERENCES evaluation_letters(id)
       ON DELETE SET NULL`
    );
    console.log('[112] FK projects.source_evaluation_id → evaluation_letters added');
  }
};
