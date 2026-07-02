// Pass B — Programme-specific rules.
// For each pattern with scope='programme' AND programme matching the project's
// programme, run the matching detector.

const pool = require('../../../utils/db');
const { lookupDetector } = require('./detectors');

async function runPassB(form) {
  const programmeUuid = form.instance?.program_id;
  if (!programmeUuid) return [];

  const [patterns] = await pool.query(
    `SELECT id, pattern_text, criterion, sub_criterion, severity_avg, writer_rule_text
     FROM pattern_library
     WHERE active = 1
       AND scope = 'programme'
       AND programme_id = ?
       AND occurrences_count > 0`,
    [programmeUuid]
  );

  const findings = [];

  for (const pat of patterns) {
    const detector = lookupDetector(pat.pattern_text);
    if (!detector) continue;

    let result;
    try {
      result = detector(form);
    } catch (err) {
      console.warn(`[passB] detector error for pattern "${pat.pattern_text}":`, err.message);
      continue;
    }

    if (!result) continue;

    findings.push({
      source_pass: 'B',
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

module.exports = { runPassB };
