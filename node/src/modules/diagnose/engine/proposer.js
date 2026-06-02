// Proposer — generates one improvement_action for a given diagnosis_finding.
// Uses Claude Sonnet 4 with prompt caching (criterios EACEA + style guide are
// cached; finding + form text are the changing parts).
//
// Output contract is strict JSON: { change_type, before, after, rationale,
// risk, estimated_score_delta }. The LLM must NOT return prose outside the JSON.

const pool = require('../../../utils/db');
const { v4: uuidv4 } = require('uuid');
const { callWithCache, extractJson, getModel } = require('../../master/anthropic-client');

const SYSTEM_PROMPT = `You are an expert reviewer of Erasmus+ / EACEA grant proposals. Your job is to propose ONE precise, surgical edit to a single section of a Form Part B based on a specific finding (a problem detected in the proposal, either by heuristic rules or extracted from a real evaluator's letter).

You return ONLY valid JSON with this exact shape, no prose around it, no markdown:

{
  "change_type": "add" | "replace" | "delete",
  "before": "exact verbatim text from the section that is the target of the change. Empty string if change_type='add' (purely additive). MUST be an exact substring of the section text — never paraphrase. Keep it short (typically 50-200 chars), enough to locate the change unambiguously.",
  "after": "the replacement text (or the text to add). Must keep the project's facts, names, numbers, dates intact. If change_type='delete', empty string.",
  "rationale": "1-2 sentences in Spanish explaining why this fix addresses the finding. Cite the evaluator's wording if it's a letter-driven finding.",
  "risk": "1 sentence in Spanish flagging any factual claim you might have introduced that the user must verify. Empty string if no risk.",
  "estimated_score_delta": number from 0.1 to 2.0 — points gained if the user applies this change
}

Hard rules:
- ONE edit per response. Do NOT propose multiple changes.
- "before" must appear verbatim in the provided section text. Verify before responding.
- Preserve every concrete fact: names of partners, numbers, percentages, dates, KPIs. NEVER invent or alter them.
- If you need to add a number/metric to fix the finding (e.g. "add specific target"), put a placeholder like "[BENCHMARK PENDIENTE: incluir cifra concreta de X]" and flag it in "risk".
- Match the style and language of the surrounding section (typically formal English for EACEA proposals).
- If the finding can't be addressed by a single targeted edit (requires structural redesign), return change_type "replace" with an empty "before" and an "after" that explains in 1 sentence what kind of redesign is needed, with risk="This finding needs structural changes, not a surgical edit."`;

/**
 * Generate an improvement_action for a given finding.
 *
 * @param {string} findingId   diagnosis_findings.id
 * @param {string} userId      who requested
 * @returns { actionId, action } the new improvement_action row
 */
async function proposeForFinding(findingId, userId) {
  // 1. Load finding + project + section text
  const [findingRows] = await pool.query(
    `SELECT df.id, df.run_id, df.source_pass, df.pattern_id, df.criterion,
            df.severity, df.finding_text, df.evidence_quote,
            df.applies_to_section, df.suggested_action,
            df.estimated_score_delta,
            dr.project_id
     FROM diagnosis_findings df
     JOIN diagnosis_runs dr ON df.run_id = dr.id
     WHERE df.id = ?`,
    [findingId]
  );
  if (findingRows.length === 0) throw new Error(`Finding ${findingId} not found`);
  const finding = findingRows[0];
  const { project_id: projectId, applies_to_section: fieldId } = finding;

  if (!fieldId) {
    throw new Error('This finding has no applies_to_section — cannot generate a targeted proposal.');
  }

  // 2. Load the current section text from form_field_values
  const [fieldRows] = await pool.query(
    `SELECT v.value_text
     FROM form_instances i
     JOIN form_field_values v ON v.instance_id = i.id
     WHERE i.project_id = ? AND v.field_id = ?
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    [projectId, fieldId]
  );
  if (fieldRows.length === 0 || !fieldRows[0].value_text) {
    throw new Error(`Section ${fieldId} is empty — nothing to improve.`);
  }
  const sectionText = fieldRows[0].value_text;

  // 3. Build the prompt blocks (system cached, user changing)
  const systemBlocks = [
    { content: SYSTEM_PROMPT, cache: true },
  ];

  const findingContext = [
    `## Finding to address`,
    ``,
    `**Source:** ${labelSource(finding.source_pass)}`,
    `**Severity:** ${finding.severity}`,
    `**Criterion:** ${finding.criterion || 'N/A'}`,
    `**Target section (field_id):** ${fieldId}`,
    ``,
    `**Finding text:**`,
    finding.finding_text,
    ``,
    finding.evidence_quote ? `**Evidence / evaluator quote:**\n"${finding.evidence_quote}"\n` : '',
    finding.suggested_action ? `**Sugerencia previa del sistema:**\n${finding.suggested_action}\n` : '',
    ``,
    `## Current text of section ${fieldId} (this is what you edit):`,
    ``,
    sectionText,
    ``,
    `## Now produce the JSON.`,
  ].filter(Boolean).join('\n');

  const userBlocks = [{ content: findingContext }];

  // 4. Call Sonnet 4
  const result = await callWithCache({
    systemBlocks,
    userBlocks,
    maxTokens: 2048,
    temperature: 0.3,
    ctx: { projectId, userId, endpoint: '/v1/diagnose/findings/propose' },
    endpoint: '/v1/diagnose/findings/propose',
  });

  // 5. Parse JSON output
  const json = extractJson(result.text);
  if (!json || typeof json !== 'object') {
    throw new Error('LLM returned invalid JSON. Try again.');
  }
  if (!json.after && json.change_type !== 'delete') {
    throw new Error('LLM response missing "after" field.');
  }

  // 6. Verify "before" is actually a substring (best-effort warning)
  if (json.before && !sectionText.includes(json.before)) {
    // Try fuzzy match — collapse whitespace
    const normalize = s => (s || '').replace(/\s+/g, ' ').trim();
    if (!normalize(sectionText).includes(normalize(json.before))) {
      json._warning = 'before-text not found verbatim in section; the user should verify.';
    }
  }

  // 7. Persist as improvement_action
  const actionId = uuidv4();
  await pool.query(
    `INSERT INTO improvement_actions
     (id, finding_id, project_id, where_field_id,
      change_type, before_text, after_text, rationale, risk,
      estimated_score_delta, state,
      llm_model, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, llm_cost_usd,
      created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?)`,
    [
      actionId,
      findingId,
      projectId,
      fieldId,
      json.change_type || 'replace',
      json.before || '',
      json.after || '',
      json.rationale || null,
      json.risk || null,
      clampNumber(json.estimated_score_delta, 0, 5) ?? null,
      getModel(),
      (result.usage?.input_tokens || 0),
      (result.usage?.output_tokens || 0),
      (result.usage?.cache_read_input_tokens || 0),
      (result.usage?.cache_creation_input_tokens || 0),
      result.costUsd || null,
      userId,
    ]
  );

  return await getActionById(actionId);
}

async function getActionById(actionId) {
  const [rows] = await pool.query(
    `SELECT * FROM improvement_actions WHERE id = ?`,
    [actionId]
  );
  return rows[0] || null;
}

function labelSource(p) {
  return ({
    A: 'Universal EACEA law (pattern_library)',
    B: 'Programme-specific pattern',
    C: 'Cross-section coherence check',
    D: 'EVALUATOR LETTER (real EACEA feedback)',
  })[p] || p;
}

function clampNumber(v, min, max) {
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

module.exports = { proposeForFinding, getActionById };
