// Triage logic: given findings + the project programme, compute
// scores_by_criterion (estimate) and triage_verdict (redesign/perfect/export).
//
// Strategy:
//   - For each criterion, start from max_score (or 25 if unknown).
//   - Subtract the sum of estimated_score_delta of findings belonging to that
//     criterion.
//   - Convert to 0-5 scale for the verdict rule.
//
// Verdict rule (from docs/DIAGNOSE_AND_IMPROVE_PLAN.md §3):
//   redesign = ≥2 criterios <3/5
//   perfect  = todos ≥3/5 pero alguno <4/5
//   export   = todos ≥4/5

const pool = require('../../../utils/db');

const SEVERITY_RANK = { critical: 6, high: 5, medium_high: 4, medium: 3, medium_low: 2, low: 1, positive: 0 };

const DEFAULT_CRITERIA = [
  { id: 'RELEVANCE', label: 'Relevance', max: 30 },
  { id: 'QUALITY',   label: 'Quality of Design and Implementation', max: 30 },
  { id: 'PARTNERSHIP', label: 'Quality of Partnership', max: 20 },
  { id: 'IMPACT',    label: 'Impact', max: 20 },
];

/**
 * Load the criteria for a given programme from eval_criteria/eval_sections,
 * if they exist. Otherwise return DEFAULT_CRITERIA.
 */
async function loadCriteriaForProgramme(programmeUuid) {
  if (!programmeUuid) return DEFAULT_CRITERIA;
  try {
    const [rows] = await pool.query(
      `SELECT title, max_score FROM eval_sections WHERE program_id = ? ORDER BY sort_order`,
      [programmeUuid]
    );
    if (rows.length > 0) {
      return rows.map(r => ({
        id: normalizeCriterionId(r.title),
        label: r.title,
        max: Number(r.max_score) || 25,
      }));
    }
  } catch (e) {
    // table might not exist or query failed — fall back
  }
  return DEFAULT_CRITERIA;
}

function normalizeCriterionId(title) {
  if (!title) return 'UNKNOWN';
  const t = title.toUpperCase();
  if (t.includes('RELEVAN')) return 'RELEVANCE';
  if (t.includes('PARTNER')) return 'PARTNERSHIP';
  if (t.includes('IMPACT')) return 'IMPACT';
  if (t.includes('QUALITY') || t.includes('DESIGN') || t.includes('IMPLEMENT')) return 'QUALITY';
  return t.replace(/[^A-Z0-9]/g, '_').slice(0, 30);
}

/**
 * Map a finding's criterion field to a known criterion id. Loose matching.
 */
function findingCriterion(f, knownCriteria) {
  if (!f.criterion) return knownCriteria[0]?.id || 'UNKNOWN';
  const normalized = normalizeCriterionId(f.criterion);
  // exact match
  const exact = knownCriteria.find(c => c.id === normalized);
  if (exact) return exact.id;
  // fallback
  return normalized;
}

/**
 * Compute scores per criterion (start at max, subtract abs(estimated_delta)
 * of findings assigned to that criterion). Returns:
 *   { byCriterion: [{id, label, max, estimated, on5}], total }
 */
async function computeScores(findings, programmeUuid) {
  const criteria = await loadCriteriaForProgramme(programmeUuid);
  const lookup = Object.fromEntries(criteria.map(c => [c.id, { ...c, deduction: 0 }]));

  for (const f of findings) {
    const cid = findingCriterion(f, criteria);
    const bucket = lookup[cid] || lookup[criteria[0].id];
    if (!bucket) continue;
    const delta = Math.abs(Number(f.estimated_score_delta || 0));
    // Cap each finding's contribution by severity weight
    const sevMult = (SEVERITY_RANK[f.severity] ?? 3) / 6;
    bucket.deduction += delta * sevMult;
  }

  const byCriterion = criteria.map(c => {
    const ded = (lookup[c.id]?.deduction) || 0;
    const estimated = Math.max(0, c.max - ded);
    const on5 = c.max > 0 ? (estimated / c.max) * 5 : 0;
    return {
      id: c.id,
      label: c.label,
      max: c.max,
      estimated: Math.round(estimated * 10) / 10,
      on5: Math.round(on5 * 10) / 10,
    };
  });

  const total = byCriterion.reduce((a, c) => a + c.estimated, 0);

  return { byCriterion, total: Math.round(total * 10) / 10 };
}

/**
 * Apply the verdict rule from the canonical plan, with a safety floor:
 * if there are still ≥1 unresolved high/critical findings, never return 'export'
 * — the user must address them first ("perfect" minimum).
 */
function computeVerdict(scores, findings = []) {
  const onFive = scores.byCriterion.map(c => c.on5);
  const lowCount = onFive.filter(s => s < 3).length;
  const lowestUnder4 = onFive.some(s => s < 4);
  const allOk = onFive.every(s => s >= 4);

  // Count high-impact unresolved findings
  const unresolvedSerious = (findings || []).filter(f =>
    f.state !== 'resolved' && f.state !== 'dismissed' &&
    (f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium_high')
  ).length;

  if (lowCount >= 2) return 'redesign';
  if (allOk && unresolvedSerious === 0) return 'export';
  if (allOk && unresolvedSerious > 0) return 'perfect'; // safety floor
  if (lowestUnder4) return 'perfect';
  return 'export';
}

module.exports = { computeScores, computeVerdict, loadCriteriaForProgramme };
