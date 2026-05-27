// Diagnose engine — entrypoint.
// Loads a project's Form Part B, runs passes A+B+C, computes triage,
// persists results in diagnosis_runs + diagnosis_findings, returns the run.

const { v4: uuidv4 } = require('uuid');
const pool = require('../../../utils/db');
const { loadProjectForm } = require('./load-form');
const { runPassA } = require('./pass-a-universal');
const { runPassB } = require('./pass-b-programme');
const { runPassC } = require('./pass-c-coherence');
const { runPassD } = require('./pass-d-letter');
const { computeScores, computeVerdict } = require('./triage');

const SEVERITY_RANK = { critical: 6, high: 5, medium_high: 4, medium: 3, medium_low: 2, low: 1, positive: 0 };

async function runDiagnosis(projectId, { userId } = {}) {
  const form = await loadProjectForm(projectId);
  if (!form) {
    throw new Error(`Project ${projectId} not found`);
  }
  if (!form.instance) {
    throw new Error(`Project ${projectId} has no Form Part B instance yet — nothing to diagnose`);
  }

  const runId = uuidv4();
  const startedAt = new Date();

  await pool.query(
    `INSERT INTO diagnosis_runs (id, project_id, program_id, status, started_at)
     VALUES (?, ?, ?, 'running', ?)`,
    [runId, projectId, form.instance.program_id, startedAt]
  );

  try {
    // Run passes — D only fires if the project has a linked evaluator letter
    const [a, b, c, d] = await Promise.all([
      runPassA(form),
      runPassB(form),
      runPassC(form),
      runPassD(form),
    ]);
    const allFindings = [...a, ...b, ...c, ...d];

    // Sort by severity desc (critical first) then by source_pass
    allFindings.sort((x, y) => {
      const sx = SEVERITY_RANK[x.severity] ?? 3;
      const sy = SEVERITY_RANK[y.severity] ?? 3;
      if (sx !== sy) return sy - sx;
      return x.source_pass.localeCompare(y.source_pass);
    });

    // Triage
    const scores = await computeScores(allFindings, form.instance.program_id);
    const verdict = computeVerdict(scores, allFindings);

    // Persist findings
    if (allFindings.length > 0) {
      const rows = allFindings.map((f, idx) => [
        uuidv4(), runId, f.source_pass, f.pattern_id || null,
        f.source_eval_finding_id || null,
        f.criterion || null, f.severity || 'medium',
        f.finding_text, f.evidence_quote || null,
        f.applies_to_section || null, f.suggested_action || null,
        f.estimated_score_delta ?? null, 'open', idx,
      ]);
      await pool.query(
        `INSERT INTO diagnosis_findings
         (id, run_id, source_pass, pattern_id, source_eval_finding_id,
          criterion, severity, finding_text, evidence_quote,
          applies_to_section, suggested_action,
          estimated_score_delta, state, sort_order)
         VALUES ?`,
        [rows]
      );
    }

    // Counts
    const criticalCount = allFindings.filter(f => f.severity === 'critical').length;
    const highCount = allFindings.filter(f => f.severity === 'high').length;

    const hasLetterInput = (d && d.length > 0) ? 1 : 0;
    const letterId = hasLetterInput ? (form.project?.source_evaluation_id || null) : null;

    await pool.query(
      `UPDATE diagnosis_runs
       SET status = 'ready',
           triage_verdict = ?,
           scores_by_criterion = ?,
           total_score_estimate = ?,
           total_findings = ?,
           critical_findings = ?,
           high_findings = ?,
           has_letter_input = ?,
           letter_id = ?,
           finished_at = NOW()
       WHERE id = ?`,
      [
        verdict,
        JSON.stringify(scores.byCriterion),
        scores.total,
        allFindings.length,
        criticalCount,
        highCount,
        hasLetterInput,
        letterId,
        runId,
      ]
    );

    return await getRunWithFindings(runId);
  } catch (err) {
    await pool.query(
      `UPDATE diagnosis_runs SET status = 'failed', notes = ?, finished_at = NOW() WHERE id = ?`,
      [err.message?.slice(0, 1000) || 'unknown error', runId]
    );
    throw err;
  }
}

async function getRunWithFindings(runId) {
  const [runRows] = await pool.query(
    `SELECT r.*, ip.program_id AS programme_code, ip.name AS programme_name
     FROM diagnosis_runs r
     LEFT JOIN intake_programs ip ON r.program_id = ip.id
     WHERE r.id = ?`,
    [runId]
  );
  if (runRows.length === 0) return null;
  const run = runRows[0];
  if (run.scores_by_criterion && typeof run.scores_by_criterion === 'string') {
    try { run.scores_by_criterion = JSON.parse(run.scores_by_criterion); } catch (e) {}
  }

  const [findings] = await pool.query(
    `SELECT id, source_pass, pattern_id, source_eval_finding_id,
            criterion, severity,
            finding_text, evidence_quote, applies_to_section,
            suggested_action, estimated_score_delta, state, sort_order
     FROM diagnosis_findings
     WHERE run_id = ?
     ORDER BY sort_order`,
    [runId]
  );

  // Attach the latest improvement_action (if any) per finding
  if (findings.length > 0) {
    const findingIds = findings.map(f => f.id);
    const [actions] = await pool.query(
      `SELECT id, finding_id, where_field_id, change_type,
              before_text, after_text, rationale, risk,
              estimated_score_delta, state, applied_version_id,
              created_at, applied_at
       FROM improvement_actions
       WHERE finding_id IN (?)
       ORDER BY created_at DESC`,
      [findingIds]
    );
    const byFinding = {};
    for (const a of actions) {
      if (!byFinding[a.finding_id]) byFinding[a.finding_id] = a;  // latest first
    }
    for (const f of findings) {
      f.latest_action = byFinding[f.id] || null;
    }
  }

  return { ...run, findings };
}

async function getLatestRunForProject(projectId) {
  const [runRows] = await pool.query(
    `SELECT id FROM diagnosis_runs WHERE project_id = ? AND status = 'ready'
     ORDER BY finished_at DESC LIMIT 1`,
    [projectId]
  );
  if (runRows.length === 0) return null;
  return getRunWithFindings(runRows[0].id);
}

module.exports = { runDiagnosis, getRunWithFindings, getLatestRunForProject };
