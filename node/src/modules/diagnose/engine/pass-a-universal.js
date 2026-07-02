// Pass A — Universal laws check.
// For each pattern with scope='universal' in pattern_library, run the
// matching detector against the project's Form Part B.

const pool = require('../../../utils/db');
const { lookupDetector } = require('./detectors');

async function runPassA(form) {
  const [patterns] = await pool.query(
    `SELECT id, pattern_text, criterion, sub_criterion, severity_avg, writer_rule_text
     FROM pattern_library
     WHERE active = 1 AND scope = 'universal' AND occurrences_count > 0`
  );

  const findings = [];

  for (const pat of patterns) {
    const detector = lookupDetector(pat.pattern_text);
    if (!detector) {
      // No detector implemented for this pattern yet — skip silently
      continue;
    }

    let result;
    try {
      result = detector(form);
    } catch (err) {
      console.warn(`[passA] detector error for pattern "${pat.pattern_text}":`, err.message);
      continue;
    }

    if (!result) continue;

    findings.push({
      source_pass: 'A',
      pattern_id: pat.id,
      criterion: pat.criterion || null,
      severity: pat.severity_avg || 'medium',
      finding_text: pat.pattern_text,
      evidence_quote: result.evidence_quote || null,
      applies_to_section: result.applies_to_section || null,
      suggested_action: result.suggested_action || pat.writer_rule_text || null,
      estimated_score_delta: result.estimated_score_delta ?? null,
    });
  }

  return findings;
}

module.exports = { runPassA };
