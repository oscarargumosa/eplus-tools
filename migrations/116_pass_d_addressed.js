// Migration 116 — Pass D "addressed" tracking (TASK-007 Fase 5.x)
//
// Goal: when an improvement_action linked to a Pass D finding is accepted,
// mark the original evaluation_findings row as addressed. Future runs of
// Pass D filter these out so the user doesn't see the same evaluator finding
// reappear after fixing it.
//
// Idempotent: checks columns exist before adding.

module.exports = async function (conn) {
  // 1. evaluation_findings.addressed_at — when the user fixed this in the project
  const [ef] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'evaluation_findings'
       AND COLUMN_NAME = 'addressed_at'`
  );
  if (ef.length === 0) {
    await conn.query(
      `ALTER TABLE evaluation_findings
       ADD COLUMN addressed_at DATETIME DEFAULT NULL`
    );
    await conn.query(
      `ALTER TABLE evaluation_findings
       ADD KEY idx_addressed (addressed_at)`
    );
    console.log('[116] evaluation_findings.addressed_at added');
  } else {
    console.log('[116] evaluation_findings.addressed_at already exists — skipped');
  }

  // 2. diagnosis_findings.source_eval_finding_id — link Pass D findings to their letter source
  const [df] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'diagnosis_findings'
       AND COLUMN_NAME = 'source_eval_finding_id'`
  );
  if (df.length === 0) {
    await conn.query(
      `ALTER TABLE diagnosis_findings
       ADD COLUMN source_eval_finding_id CHAR(36) DEFAULT NULL`
    );
    await conn.query(
      `ALTER TABLE diagnosis_findings
       ADD KEY idx_source_eval (source_eval_finding_id)`
    );
    await conn.query(
      `ALTER TABLE diagnosis_findings
       ADD CONSTRAINT fk_diag_finding_source_eval
       FOREIGN KEY (source_eval_finding_id)
       REFERENCES evaluation_findings(id) ON DELETE SET NULL`
    );
    console.log('[116] diagnosis_findings.source_eval_finding_id added');
  } else {
    console.log('[116] diagnosis_findings.source_eval_finding_id already exists — skipped');
  }

  // 3. Backfill: any improvement_action that's already accepted or rejected
  // for a Pass D finding — but only IF we can match by section + project +
  // letter. Since we didn't track source_eval_finding_id before, this is a
  // best-effort match on (project source_evaluation_id, applies_to_section).
  // For Pass D findings ONLY (source_pass='D'), if there exists an accepted
  // OR rejected improvement_action for any diagnosis_finding pointing at the
  // same section of a project linked to a letter, mark all evaluator findings
  // of that letter+section as addressed. Conservative: only marks rows that
  // unambiguously map.
  const [backfill] = await conn.query(
    `UPDATE evaluation_findings ef
     SET ef.addressed_at = NOW()
     WHERE ef.is_positive = 0
       AND ef.addressed_at IS NULL
       AND ef.applies_to_section IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM improvement_actions ia
         JOIN diagnosis_findings df ON ia.finding_id = df.id
         JOIN diagnosis_runs dr ON df.run_id = dr.id
         JOIN projects p ON dr.project_id = p.id
         WHERE ia.state IN ('accepted', 'rejected')
           AND df.source_pass = 'D'
           AND df.applies_to_section = ef.applies_to_section
           AND p.source_evaluation_id = ef.letter_id
       )`
  );
  console.log(`[116] backfill: ${backfill.affectedRows} evaluator findings marked addressed`);
};
