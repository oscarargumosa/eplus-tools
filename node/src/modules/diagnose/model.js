/* ── Diagnose model — pattern_library + evaluation_letters/findings ─── */
const pool = require('../../utils/db');

/* All patterns (admin overview). */
async function listAllPatterns({ activeOnly = true } = {}) {
  const where = activeOnly ? 'WHERE pl.active = 1' : '';
  const [rows] = await pool.query(
    `SELECT pl.id, pl.scope, pl.programme_id, ip.program_id AS programme_code, ip.name AS programme_name,
            pl.pattern_text, pl.criterion, pl.sub_criterion, pl.severity_avg,
            pl.occurrences_count, pl.writer_rule_text, pl.active,
            pl.created_at, pl.updated_at
     FROM pattern_library pl
     LEFT JOIN intake_programs ip ON pl.programme_id = ip.id
     ${where}
     ORDER BY
       FIELD(pl.scope,'universal','programme','emergent'),
       pl.occurrences_count DESC,
       pl.pattern_text`
  );
  return rows;
}

/* Patterns applicable to a specific call (intake_programs.id):
   - all universal patterns (apply everywhere)
   - all programme patterns where programme_id = callId. */
async function listPatternsForCall(callId) {
  const [rows] = await pool.query(
    `SELECT pl.id, pl.scope, pl.programme_id, ip.program_id AS programme_code,
            pl.pattern_text, pl.criterion, pl.sub_criterion, pl.severity_avg,
            pl.occurrences_count, pl.writer_rule_text
     FROM pattern_library pl
     LEFT JOIN intake_programs ip ON pl.programme_id = ip.id
     WHERE pl.active = 1
       AND (pl.scope = 'universal' OR pl.programme_id = ?)
     ORDER BY FIELD(pl.scope,'universal','programme','emergent'),
              pl.occurrences_count DESC`,
    [callId]
  );
  return rows;
}

async function listPatternsByProgrammeCode(programmeCode) {
  const [rows] = await pool.query(
    `SELECT pl.id, pl.scope, pl.programme_id, ip.program_id AS programme_code,
            pl.pattern_text, pl.criterion, pl.sub_criterion, pl.severity_avg,
            pl.occurrences_count, pl.writer_rule_text
     FROM pattern_library pl
     LEFT JOIN intake_programs ip ON pl.programme_id = ip.id
     WHERE pl.active = 1
       AND (pl.scope = 'universal' OR ip.program_id = ?)
     ORDER BY FIELD(pl.scope,'universal','programme','emergent'),
              pl.occurrences_count DESC`,
    [programmeCode]
  );
  return rows;
}

/* Letters list (admin). */
async function listLetters() {
  const [rows] = await pool.query(
    `SELECT el.id, el.program_id, ip.program_id AS programme_code, ip.name AS programme_name,
            el.proposal_number, el.proposal_acronym, el.proposal_title,
            el.total_score, el.total_threshold, el.result, el.source_format,
            el.letter_date, el.created_at,
            (SELECT COUNT(*) FROM evaluation_findings ef WHERE ef.letter_id=el.id) AS findings_count,
            (SELECT COUNT(*) FROM evaluation_findings ef WHERE ef.letter_id=el.id AND ef.is_positive=1) AS positives_count
     FROM evaluation_letters el
     JOIN intake_programs ip ON el.program_id = ip.id
     ORDER BY el.created_at DESC`
  );
  return rows;
}

/* Single letter detail + findings. */
async function getLetterWithFindings(letterId) {
  const [letterRows] = await pool.query(
    `SELECT el.*, ip.program_id AS programme_code, ip.name AS programme_name
     FROM evaluation_letters el
     JOIN intake_programs ip ON el.program_id = ip.id
     WHERE el.id = ?`,
    [letterId]
  );
  if (letterRows.length === 0) return null;
  const letter = letterRows[0];

  const [findings] = await pool.query(
    `SELECT id, criterion, sub_criterion, severity, is_positive,
            finding_text, fragment_quote, applies_to_section, pattern_id, sort_order
     FROM evaluation_findings
     WHERE letter_id = ?
     ORDER BY sort_order, id`,
    [letterId]
  );
  return { ...letter, findings };
}

/* Stats overview for admin dashboard. */
async function getStats() {
  const [[letters]] = await pool.query(`SELECT COUNT(*) AS n FROM evaluation_letters`);
  const [[findings]] = await pool.query(`SELECT COUNT(*) AS n FROM evaluation_findings`);
  const [[patterns]] = await pool.query(`SELECT COUNT(*) AS n FROM pattern_library WHERE active=1`);
  const [byScope] = await pool.query(
    `SELECT scope, COUNT(*) AS n
     FROM pattern_library WHERE active=1 AND occurrences_count > 0
     GROUP BY scope`
  );
  const [byProgramme] = await pool.query(
    `SELECT ip.program_id AS programme_code, ip.name AS programme_name,
            COUNT(DISTINCT el.id) AS letters_count,
            COUNT(ef.id) AS findings_count
     FROM intake_programs ip
     LEFT JOIN evaluation_letters el ON el.program_id = ip.id
     LEFT JOIN evaluation_findings ef ON ef.letter_id = el.id
     WHERE el.id IS NOT NULL
     GROUP BY ip.id`
  );
  return {
    letters_total: letters.n,
    findings_total: findings.n,
    patterns_active: patterns.n,
    patterns_by_scope: Object.fromEntries(byScope.map(r => [r.scope, r.n])),
    programmes: byProgramme,
  };
}

module.exports = {
  listAllPatterns,
  listPatternsForCall,
  listPatternsByProgrammeCode,
  listLetters,
  getLetterWithFindings,
  getStats,
};
