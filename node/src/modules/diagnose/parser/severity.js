// Vocabulary of the evaluator → severity mapping.
// Source: docs/DIAGNOSE_AND_IMPROVE_PLAN.md §2.
//
// Order matters: longest/most specific phrases first so that
// "does not sufficiently address" matches before "does not".

const PHRASES = [
  // critical
  { match: /is a major shortcoming/i,           severity: 'critical' },
  { match: /major shortcoming/i,                severity: 'critical' },

  // high
  { match: /is a shortcoming/i,                 severity: 'high' },
  { match: /is inadequate/i,                    severity: 'high' },
  { match: /is not adequate/i,                  severity: 'high' },
  { match: /are not adequate/i,                 severity: 'high' },

  // medium_high
  { match: /does not sufficiently address/i,    severity: 'medium_high' },
  { match: /is not sufficiently addressed/i,    severity: 'medium_high' },
  { match: /are not sufficiently addressed/i,   severity: 'medium_high' },
  { match: /not adequately addressed/i,         severity: 'medium_high' },
  { match: /lacks sufficient/i,                 severity: 'medium_high' },
  { match: /not sufficiently/i,                 severity: 'medium_high' },
  { match: /does not provide sufficient/i,      severity: 'medium_high' },
  { match: /is not detailed enough/i,           severity: 'medium_high' },
  { match: /is not given sufficient/i,          severity: 'medium_high' },
  { match: /not given sufficient consideration/i, severity: 'medium_high' },

  // medium
  { match: /does not clearly demonstrate/i,     severity: 'medium' },
  { match: /falls short in/i,                   severity: 'medium' },
  { match: /lacks a (sufficiently )?concrete/i, severity: 'medium' },
  { match: /lacks a detailed/i,                 severity: 'medium' },
  { match: /lacks a clear/i,                    severity: 'medium' },
  { match: /lacks clarity/i,                    severity: 'medium' },
  { match: /not well elaborated/i,              severity: 'medium' },
  { match: /not well evidenced/i,               severity: 'medium' },
  { match: /not well[- ]defined/i,              severity: 'medium' },
  { match: /not fully measurable/i,             severity: 'medium' },
  { match: /poorly developed/i,                 severity: 'medium' },
  { match: /not fully justified/i,              severity: 'medium' },
  { match: /not always fully justified/i,       severity: 'medium' },
  { match: /not explicitly/i,                   severity: 'medium' },
  { match: /not explicit/i,                     severity: 'medium' },

  // medium_low
  { match: /is not fully clear/i,               severity: 'medium_low' },
  { match: /is unclear/i,                       severity: 'medium_low' },
  { match: /are unclear/i,                      severity: 'medium_low' },
  { match: /not entirely clear/i,               severity: 'medium_low' },

  // low
  { match: /small shortcoming/i,                severity: 'low' },
  { match: /minor concern/i,                    severity: 'low' },
  { match: /briefly/i,                          severity: 'low' },

  // positive markers (overruled if a "however" follows)
  { match: /\bis convincing\b/i,                severity: 'positive' },
  { match: /\bare convincing\b/i,               severity: 'positive' },
  { match: /\bis appropriate\b/i,               severity: 'positive' },
  { match: /\bappropriately\b/i,                severity: 'positive' },
  { match: /\bare appropriate\b/i,              severity: 'positive' },
  { match: /\bare positive\b/i,                 severity: 'positive' },
  { match: /\bis a positive\b/i,                severity: 'positive' },
  { match: /\bwell described\b/i,               severity: 'positive' },
  { match: /\bwell evidenced\b/i,               severity: 'positive' },
  { match: /\bwell defined\b/i,                 severity: 'positive' },
  { match: /\bwell aligned\b/i,                 severity: 'positive' },
  { match: /\brelevant\b/i,                     severity: 'positive' },
  { match: /\bsuitable\b/i,                     severity: 'positive' },
  { match: /\beffective\b/i,                    severity: 'positive' },
  { match: /\bsufficiently\b(?!\s+(does not|lack|not))/i, severity: 'positive' },
  { match: /\bstrongly (addressed|confirmed)\b/i, severity: 'positive' },
];

const SEVERITY_ORDER = {
  critical: 6,
  high: 5,
  medium_high: 4,
  medium: 3,
  medium_low: 2,
  low: 1,
  positive: 0,
};

/**
 * Detect severity of a sentence from the evaluator vocabulary.
 * Returns { severity, isPositive }.
 *
 * Strategy:
 * - Find ALL phrase matches in the sentence.
 * - If both negative and positive markers fire, keep the strongest negative
 *   (evaluators routinely say "X is good. However, Y is not sufficient." —
 *   the "however" clause is what penalizes).
 * - If only positives fire → positive.
 * - If nothing fires → medium (neutral default for prose without flags).
 */
function detectSeverity(sentence) {
  if (!sentence || typeof sentence !== 'string') {
    return { severity: 'medium', isPositive: false };
  }

  let worstNegative = null;
  let bestPositive = null;

  for (const { match, severity } of PHRASES) {
    if (match.test(sentence)) {
      if (severity === 'positive') {
        if (!bestPositive) bestPositive = severity;
      } else {
        if (!worstNegative || SEVERITY_ORDER[severity] > SEVERITY_ORDER[worstNegative]) {
          worstNegative = severity;
        }
      }
    }
  }

  if (worstNegative) {
    return { severity: worstNegative, isPositive: false };
  }
  if (bestPositive) {
    return { severity: 'positive', isPositive: true };
  }
  return { severity: 'medium', isPositive: false };
}

/**
 * Quick check: does this text fragment look like a shortcoming?
 * Heuristics: "However", "Yet", "lacks", "does not", "is not", "is a shortcoming".
 */
function looksLikeShortcoming(text) {
  if (!text) return false;
  return /\b(However|Yet|but)\b|\blacks?\b|\bdoes not\b|\bdo not\b|\bis not\b|\bare not\b|\bis a shortcoming\b|\bshortcoming\b/i.test(text);
}

module.exports = {
  detectSeverity,
  looksLikeShortcoming,
  PHRASES,
  SEVERITY_ORDER,
};
