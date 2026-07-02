// Pass C — Cross-section coherence.
// Detect contradictions between sections of the Form Part B.
//
// These findings are SYNTHETIC (not from pattern_library). They have
// pattern_id=null. Each one is a specific contradiction detected by a
// dedicated rule.

const { fieldsMatching, allText } = require('./load-form');

const CHECKS = [
  /**
   * Check 1: Objective count claim vs enumeration.
   * Catches the classic SUSTRAI bug: "three articulated specific objectives"
   * declared, but later enumerated as first/second/third/fourth.
   */
  function checkObjectiveCountMismatch(form) {
    // Look across s1 fields for both the claim and the enumeration
    const s1 = Object.entries(fieldsMatching(form, 's1'));
    if (s1.length === 0) return null;

    // Find a field that claims N objectives
    let claimedN = null;
    let claimedField = null;
    let claimedQuote = null;

    for (const [fieldId, text] of s1) {
      if (!text) continue;
      const m = text.match(/\b(three|four|five|six|seven|eight)\s+(articulated\s+)?(specific\s+)?objectives?\b/i);
      if (m) {
        claimedN = wordToNum(m[1]);
        claimedField = fieldId;
        claimedQuote = m[0];
        break;
      }
    }
    if (!claimedN) return null;

    // Now count distinct ordinal mentions (first/second/third/fourth/fifth)
    // ACROSS s1
    const allS1 = s1.map(([_, t]) => t || '').join(' ');
    const ords = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
    const seen = new Set();
    for (const o of ords) {
      // Use specific "Nth specific objective" or "Nth objective"
      if (new RegExp(`\\b${o}\\s+(specific\\s+)?objective\\b`, 'i').test(allS1)) {
        seen.add(o);
      }
    }

    if (seen.size > claimedN) {
      return {
        finding_text: `Inconsistencia: la propuesta declara "${claimedQuote}" pero después enumera ${seen.size} objetivos (${[...seen].join(', ')}).`,
        evidence_quote: claimedQuote,
        applies_to_section: claimedField,
        suggested_action: 'Decide si son 3 o 4 objetivos y armoniza la enumeración entre s1.1 y s1.2. Es la primera cosa que mira el ponente y un mismatch como este penaliza Quality of Design.',
        estimated_score_delta: -1.0,
        severity: 'high',
      };
    }
    return null;
  },

  /**
   * Check 2: Number of WPs claimed vs actually present.
   * If text says "six work packages" but only 4 WP fields exist → flag.
   */
  function checkWPCountMismatch(form) {
    const allText = Object.values(form.fields || {}).join(' ');
    const m = allText.match(/\b(three|four|five|six|seven|eight|nine|ten)\s+(work[- ]packages?|wps?)\b/i);
    if (!m) return null;
    const claimedN = wordToNum(m[1]);
    if (!claimedN) return null;

    // Count actual WP fields (s4_2_wp_<uuid>)
    const wpFields = Object.keys(form.fields || {}).filter(k => /^s4_2_wp_[0-9a-f-]+$/i.test(k));
    if (wpFields.length === 0) return null;

    if (Math.abs(wpFields.length - claimedN) >= 2) {
      return {
        finding_text: `Inconsistencia: el texto dice "${m[0]}" pero el formulario tiene ${wpFields.length} WPs.`,
        evidence_quote: m[0],
        applies_to_section: 's4_2_text',
        suggested_action: `Reconcilia el número de WPs declarado en prosa con los WPs reales del formulario. Tienes ${wpFields.length} pero dices "${m[0]}".`,
        estimated_score_delta: -0.8,
        severity: 'medium_high',
      };
    }
    return null;
  },

  /**
   * Check 3: Partner count consistency.
   * "five partners" in prose vs actual partners in calc_state.
   */
  function checkPartnerCountMismatch(form) {
    const allTxt = Object.values(form.fields || {}).join(' ');
    const m = allTxt.match(/\b(three|four|five|six|seven|eight|nine|ten)\s+(partners?|consortium members?|organisations?)\b/i);
    if (!m) return null;
    const claimedN = wordToNum(m[1]);
    if (!claimedN) return null;

    const calc = form.project?.calc_state;
    if (!calc) return null;
    let state;
    try { state = typeof calc === 'string' ? JSON.parse(calc) : calc; } catch (e) { return null; }
    const partners = state?.partners || [];
    if (partners.length === 0) return null;

    if (Math.abs(partners.length - claimedN) >= 1 && partners.length >= 2) {
      return {
        finding_text: `Inconsistencia: el texto dice "${m[0]}" pero el consorcio tiene ${partners.length} partners en el calculator.`,
        evidence_quote: m[0],
        applies_to_section: 's2_1_2_text',
        suggested_action: `Reconcilia el número de partners declarado en prosa con el consorcio real (${partners.length}). Esta inconsistencia se ve a primera vista.`,
        estimated_score_delta: -0.5,
        severity: 'medium',
      };
    }
    return null;
  },

  /**
   * Check 4: Duration consistency.
   * Project duration_months vs claims in prose.
   */
  function checkDurationMismatch(form) {
    const projectDur = form.project?.duration_months;
    if (!projectDur) return null;

    const allTxt = Object.values(form.fields || {}).join(' ');
    const m = allTxt.match(/(\d{2})\s*[-]\s*month\s+(project|duration|implementation)/i)
            || allTxt.match(/over\s+(\d{2})\s+months/i)
            || allTxt.match(/duration of\s+(\d{2})\s+months/i);
    if (!m) return null;
    const claimedMonths = Number(m[1]);
    if (!claimedMonths || Math.abs(projectDur - claimedMonths) <= 1) return null;

    return {
      finding_text: `Inconsistencia: el texto menciona "${m[0]}" pero la duración del proyecto en la BD es ${projectDur} meses.`,
      evidence_quote: m[0],
      applies_to_section: null,
      suggested_action: `Reconcilia la duración. Texto dice ~${claimedMonths} meses, sistema dice ${projectDur} meses.`,
      estimated_score_delta: -0.3,
      severity: 'medium_low',
    };
  },
];

async function runPassC(form) {
  const findings = [];
  for (const check of CHECKS) {
    let result;
    try {
      result = check(form);
    } catch (err) {
      console.warn(`[passC] check error:`, err.message);
      continue;
    }
    if (!result) continue;

    findings.push({
      source_pass: 'C',
      pattern_id: null,
      criterion: 'QUALITY',  // most coherence issues hit Quality of Design
      severity: result.severity || 'medium',
      finding_text: result.finding_text,
      evidence_quote: result.evidence_quote,
      applies_to_section: result.applies_to_section,
      suggested_action: result.suggested_action,
      estimated_score_delta: result.estimated_score_delta ?? null,
    });
  }
  return findings;
}

function wordToNum(w) {
  const m = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
  return m[w?.toLowerCase()] || null;
}

module.exports = { runPassC };
