// Pass D — Letter-directed findings.
// If the project has an evaluator letter linked via projects.source_evaluation_id,
// promote each negative finding from that letter into a diagnosis_finding with
// source_pass='D', mapped to the most likely section of the Form Part B.

const pool = require('../../../utils/db');

/**
 * Mapping from criterion/sub_criterion keywords to Form field_id.
 * Heuristic: searches the keyword in lowercase against the finding's
 * criterion + sub_criterion combined.
 */
const SECTION_MAPPING = [
  // Sustainability
  { keywords: ['sustainability', 'sustain', 'continuation'], fieldId: 's3_3_text' },
  // Communication / Dissemination
  { keywords: ['dissemination', 'communication', 'visibility', 'exploitation'], fieldId: 's3_2_text' },
  // Impact
  { keywords: ['impact', 'expected impact', 'outcomes'], fieldId: 's3_1_text' },
  // Methodology / Concept
  { keywords: ['methodology', 'method', 'concept', 'approach'], fieldId: 's2_1_1_text' },
  // Management / Quality
  { keywords: ['management', 'quality assurance', 'quality control', 'qc', 'monitoring', 'evaluation strategy'], fieldId: 's2_1_2_text' },
  // Teams / Staff
  { keywords: ['teams', 'staff', 'experts', 'project teams'], fieldId: 's2_1_3_text' },
  // Budget / Cost
  { keywords: ['budget', 'cost', 'financial management', 'cost-effectiveness', 'cost-benefit'], fieldId: 's2_1_4_text' },
  // Risk
  { keywords: ['risk', 'mitigation'], fieldId: 's2_1_5_text' },
  // Consortium / Partners (configuration, geographical)
  { keywords: ['consortium', 'partnership', 'partners', 'configuration', 'geographical', 'upward convergence'], fieldId: 's2_2_1_text' },
  // Collaboration / Decision-making
  { keywords: ['collaboration', 'decision', 'governance', 'conflict'], fieldId: 's2_2_2_text' },
  // Activities / Work packages
  { keywords: ['activities', 'work packages', 'work plan', 'mobility activities'], fieldId: 's4_2_text' },
  // Innovation / EU added value
  { keywords: ['innovation', 'eu added value', 'added value', 'complementarity'], fieldId: 's1_3_text' },
  // Needs analysis
  { keywords: ['needs analysis', 'needs', 'target group', 'fewer opportunities'], fieldId: 's1_2_text' },
  // Relevance generally
  { keywords: ['relevance', 'link to policy', 'eu values', 'social dimension', 'green skills', 'digital skills', 'regional dimension', 'internationalisation'], fieldId: 's1_1_text' },
];

function mapToSection(criterion, subCriterion, fragment) {
  const haystack = `${criterion || ''} ${subCriterion || ''} ${(fragment || '').slice(0, 200)}`.toLowerCase();
  for (const m of SECTION_MAPPING) {
    if (m.keywords.some(kw => haystack.includes(kw))) return m.fieldId;
  }
  return null;
}

/**
 * Run Pass D. Loads negative findings from the letter linked to the project
 * (if any) and converts them to diagnosis_findings shape.
 */
async function runPassD(form) {
  const sourceEvalId = form.project?.source_evaluation_id;
  if (!sourceEvalId) return [];

  // Load letter findings (negatives only, NOT already addressed by a previous fix)
  const [findings] = await pool.query(
    `SELECT id, criterion, sub_criterion, severity, finding_text, fragment_quote, applies_to_section
     FROM evaluation_findings
     WHERE letter_id = ?
       AND is_positive = 0
       AND addressed_at IS NULL
     ORDER BY
       FIELD(severity, 'critical', 'high', 'medium_high', 'medium', 'medium_low', 'low'),
       sort_order`,
    [sourceEvalId]
  );

  return findings.map(f => {
    // Prefer the explicit applies_to_section if the parser already set one,
    // otherwise infer from criterion/sub_criterion.
    const section = f.applies_to_section || mapToSection(f.criterion, f.sub_criterion, f.fragment_quote);

    // Compress the finding_text into a single actionable sentence
    const findingText = (f.finding_text || '').slice(0, 280);

    const suggested = buildSuggestedAction(f);
    const delta = severityToDelta(f.severity);

    return {
      source_pass: 'D',
      pattern_id: null,
      source_eval_finding_id: f.id,   // link back to the evaluation_findings row
      criterion: normalizeCriterionLabel(f.criterion),
      severity: f.severity || 'medium',
      finding_text: findingText,
      evidence_quote: f.fragment_quote || null,
      applies_to_section: section,
      suggested_action: suggested,
      estimated_score_delta: delta,
    };
  });
}

function buildSuggestedAction(f) {
  const sev = f.severity || 'medium';
  const ord = ['critical', 'high', 'medium_high'].includes(sev) ? 'Resuélvelo' : 'Revísalo';
  const fragment = (f.fragment_quote || f.finding_text || '').slice(0, 240).replace(/\s+/g, ' ').trim();
  return `${ord}: el ponente marcó esto en su carta. Cita: "${fragment}"`;
}

function severityToDelta(severity) {
  // Letter findings have direct authority — bigger deltas than synthetic ones.
  const map = {
    critical:    -2.0,
    high:        -1.5,
    medium_high: -1.2,
    medium:      -0.8,
    medium_low:  -0.4,
    low:         -0.2,
    positive:     0.0,
  };
  return map[severity] ?? -0.6;
}

function normalizeCriterionLabel(criterion) {
  if (!criterion) return null;
  const t = criterion.toUpperCase();
  if (t.includes('RELEVAN')) return 'RELEVANCE';
  if (t.includes('PARTNER')) return 'PARTNERSHIP';
  if (t.includes('IMPACT')) return 'IMPACT';
  if (t.includes('QUALITY') || t.includes('DESIGN') || t.includes('IMPLEMENT')) return 'QUALITY';
  return criterion;
}

module.exports = { runPassD, mapToSection };
