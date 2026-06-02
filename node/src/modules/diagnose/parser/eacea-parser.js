// Parser for EACEA official evaluator letters.
// Input: plain text (already extracted from PDF/docx/txt).
// Output: { metadata, criteria, findings[] }.
//
// Strategy:
//   1. Extract header metadata (proposal_number, acronym, title, total_score).
//   2. Locate each "Criterion N" section + its score.
//   3. Within each criterion, split prose into sentences.
//   4. For each sentence, assign severity via vocabulary table (severity.js).
//   5. Promote "However" / "Yet" clauses as the actual finding (the part that
//      penalizes), keeping the preceding positive as context.
//
// This parser is heuristic — not perfect. Acceptable: it produces useful
// structured findings without LLM. The improvement loop is: a future LLM
// verifier pass can re-classify ambiguous findings.

const { detectSeverity, looksLikeShortcoming } = require('./severity');

// ─────────────────────────────────────────────────────────────────────────────
// Metadata extraction (cabecera del documento)
// ─────────────────────────────────────────────────────────────────────────────

function extractMetadata(text) {
  const md = {
    proposal_number: null,
    proposal_acronym: null,
    proposal_title: null,
    total_score: null,
    total_threshold: null,
    duration_months: null,
    activity_code: null,
    call_code: null,
  };

  const matchers = [
    { key: 'proposal_number',   re: /Proposal number:\s*(\d+)/i },
    { key: 'proposal_acronym',  re: /Proposal acronym:\s*(\S+(?:[ \-_][^\n]*?)?)\s*$/im },
    { key: 'proposal_title',    re: /Proposal title:\s*(.+?)(?:\n|$)/i },
    { key: 'duration_months',   re: /Duration\s*\(months\):\s*(\d+)/i, transform: Number },
    { key: 'activity_code',     re: /Activity:\s*([A-Z0-9_\-]+)/i },
    { key: 'call_code',         re: /Call:\s*([A-Z0-9_\-]+)/i },
    { key: 'total_score',       re: /Total score:\s*(\d+(?:\.\d+)?)/i, transform: Number },
    { key: 'total_threshold',   re: /Total score:.*?\(Threshold:\s*(\d+(?:\.\d+)?)\s*\)/i, transform: Number },
  ];

  for (const { key, re, transform } of matchers) {
    const m = text.match(re);
    if (m && m[1] != null) {
      md[key] = transform ? transform(m[1]) : m[1].trim();
    }
  }

  return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// Criterion splitting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split the letter into criterion blocks.
 * Returns an array of { criterion_id, criterion_name, score, threshold, weight,
 *   max_score, body }.
 *
 * EACEA format:
 *   Criterion 1 - RELEVANCE
 *   Score:  22.00 (Threshold: 15 / 30.00 , Weight: - )
 *   The detailed criteria are set out in the call conditions (see Call document).
 *   <prose>
 *   Criterion 2.1 - QUALITY - PROJECT DESIGN AND IMPLEMENTATION
 *   ...
 */
function splitCriteria(text) {
  const CRITERION_HEADER = /Criterion\s+(\d+(?:\.\d+)?)\s*[-–]\s*([^\n]+?)\s*\n/g;

  const headers = [];
  let m;
  while ((m = CRITERION_HEADER.exec(text)) !== null) {
    headers.push({
      criterion_id: m[1],
      criterion_name: cleanCriterionName(m[2]),
      offset: m.index,
      headerEnd: m.index + m[0].length,
    });
  }

  if (headers.length === 0) {
    // No criterion headers — return whole text as a single block
    return [{
      criterion_id: '0',
      criterion_name: 'GENERAL',
      score: null,
      threshold: null,
      weight: null,
      max_score: null,
      body: text.trim(),
    }];
  }

  // Each criterion spans from its headerEnd to the next criterion (or EOF)
  const out = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const end = (i + 1 < headers.length) ? headers[i + 1].offset : text.length;
    const block = text.slice(h.headerEnd, end);

    // Score line — two known formats from EACEA:
    //   A) Plain text: "Score:  22.00 (Threshold: 15 / 30.00 , Weight: - )"
    //   B) PDF extract: "Score: (Threshold: 15 / 30.00 , Weight: - )\t15.00"
    //                   (score number comes AFTER the parenthesis)
    let score = null, threshold = null, max_score = null, weight = null;
    const formatA = block.match(/Score:\s*(\d+(?:\.\d+)?)\s*\(Threshold:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*,?\s*Weight:\s*([\-\w]+)?/i);
    const formatB = block.match(/Score:\s*\(Threshold:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*,?\s*Weight:\s*([\-\w]+)?\s*\)\s*[\t ]+(\d+(?:\.\d+)?)/i);
    if (formatA) {
      score = Number(formatA[1]);
      threshold = Number(formatA[2]);
      max_score = Number(formatA[3]);
      weight = formatA[4] && formatA[4] !== '-' ? formatA[4] : null;
    } else if (formatB) {
      threshold = Number(formatB[1]);
      max_score = Number(formatB[2]);
      weight = formatB[3] && formatB[3] !== '-' ? formatB[3] : null;
      score = Number(formatB[4]);
    }

    // Remove the score line + boilerplate from the body
    const body = block
      .replace(/Score:\s*\(?\s*\d?[^\n]*?\n/i, '')
      .replace(/Score:\s*[^\n]*Weight:\s*[^\n]*\n/i, '')
      .replace(/\d+(?:\.\d+)?\s*\n(?=The detailed criteria)/g, '\n')
      .replace(/The detailed criteria are set out in the call conditions.*?\n/gi, '')
      .trim();

    out.push({
      criterion_id: h.criterion_id,
      criterion_name: h.criterion_name,
      score,
      threshold,
      max_score,
      weight,
      body,
    });
  }

  return out;
}

function cleanCriterionName(s) {
  return s.replace(/\s+/g, ' ').replace(/[—–]/g, '-').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-criterion + sentence splitting within a criterion block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect sub-criterion headings inside a criterion body.
 * EACEA uses inline labels like "Link to policy:", "EU Values:", "Consistency:",
 * "Activities:", "Methodology:", "Budget:", "Sustainability:", "Dissemination:",
 * etc. Each label introduces a paragraph.
 */
function splitSubCriteria(body) {
  // Match: word(s) followed by colon at start of line, then content until
  // the next such header or EOF.
  const SUB_HEADER = /(?:^|\n)([A-Z][A-Za-z][A-Za-z &\-,/]{2,40}):\s*\n?/g;

  // Exclude tokens that look like sub-criterion headers but are something else
  const EXCLUDE = new Set([
    'Score', 'Total score', 'Threshold', 'Weight', 'Evaluation Result',
    'Evaluation Summary Report', 'Scope of the proposal', 'Status', 'Comments',
    'Abstract', 'Proposal title', 'Proposal acronym', 'Proposal number',
    'Type of action', 'Call', 'Duration', 'Activity', 'Proposer name',
    'Total', 'Country',
  ]);

  const matches = [];
  let m;
  while ((m = SUB_HEADER.exec(body)) !== null) {
    const name = m[1].trim();
    if (EXCLUDE.has(name)) continue;
    matches.push({ name, start: m.index, headerEnd: m.index + m[0].length });
  }

  if (matches.length === 0) {
    // No sub-headers detected — single block
    return [{ sub_criterion: null, body: body.trim() }];
  }

  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const end = next ? next.start : body.length;
    const subBody = body.slice(cur.headerEnd, end).trim();
    out.push({ sub_criterion: cur.name, body: subBody });
  }
  return out;
}

/**
 * Split a paragraph into sentences. Handles "e.g." and similar so we don't
 * split inside abbreviations. Crude but works for evaluator prose.
 */
function splitSentences(paragraph) {
  if (!paragraph) return [];
  // Protect common abbreviations
  const protected = paragraph
    .replace(/\be\.g\./gi, 'e<DOT>g<DOT>')
    .replace(/\bi\.e\./gi, 'i<DOT>e<DOT>')
    .replace(/\betc\./gi, 'etc<DOT>')
    .replace(/\bvs\./gi, 'vs<DOT>');

  // Split on sentence terminators
  const raw = protected.split(/(?<=[.!?])\s+(?=[A-Z])/);

  return raw
    .map(s => s.replace(/<DOT>/g, '.').trim())
    .filter(s => s.length > 8); // drop fragments
}

// ─────────────────────────────────────────────────────────────────────────────
// Finding extraction within a sub-criterion block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract one or more findings from a sub-criterion body.
 * Strategy:
 *   - Split into sentences.
 *   - For each sentence, detect severity.
 *   - Group consecutive sentences of same polarity to avoid noisy splits.
 *   - Special handling: "However" / "Yet" / "But" clauses extracted as
 *     dedicated findings (they're the actual shortcoming the evaluator flags).
 *   - Positive sentences are emitted as separate positive findings.
 */
function extractFindings(criterion_id, criterion_name, sub_criterion, body) {
  const sentences = splitSentences(body);
  const findings = [];

  for (const sent of sentences) {
    // Check for "However" splits within sentence
    const howeverParts = sent.split(/\b(?:However|Yet|But)\b,?\s*/i);
    if (howeverParts.length > 1) {
      // First part = preceding positive; rest = shortcoming clauses
      const positivePart = howeverParts[0].trim();
      if (positivePart.length > 15) {
        const { severity, isPositive } = detectSeverity(positivePart);
        findings.push({
          criterion: criterion_name,
          sub_criterion,
          severity,
          is_positive: isPositive ? 1 : 0,
          finding_text: positivePart.length > 280 ? positivePart.slice(0, 280) + '…' : positivePart,
          fragment_quote: positivePart,
        });
      }
      // Each "however" clause is a finding
      for (let i = 1; i < howeverParts.length; i++) {
        const clause = howeverParts[i].trim();
        if (clause.length < 15) continue;
        const { severity } = detectSeverity(clause);
        // "However" clauses default to medium if no explicit severity word
        const sev = (severity === 'positive') ? 'medium' : severity;
        findings.push({
          criterion: criterion_name,
          sub_criterion,
          severity: sev,
          is_positive: 0,
          finding_text: clause.length > 280 ? clause.slice(0, 280) + '…' : clause,
          fragment_quote: clause,
        });
      }
    } else {
      const { severity, isPositive } = detectSeverity(sent);
      const looksNeg = looksLikeShortcoming(sent);

      // Sentence is a finding if it's clearly negative OR clearly positive
      // (we want to capture positives too for the Writer's "good practice" rules)
      if (isPositive || looksNeg || severity !== 'medium') {
        findings.push({
          criterion: criterion_name,
          sub_criterion,
          severity,
          is_positive: isPositive ? 1 : 0,
          finding_text: sent.length > 280 ? sent.slice(0, 280) + '…' : sent,
          fragment_quote: sent,
        });
      }
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a full evaluator letter (plain text) into structured findings.
 * Returns { metadata, scores_by_criterion, findings }.
 */
function parseEacea(text) {
  const metadata = extractMetadata(text);
  const criteria = splitCriteria(text);

  const scores_by_criterion = {};
  const findings = [];

  for (const c of criteria) {
    if (c.score != null) {
      scores_by_criterion[c.criterion_id] = {
        name: c.criterion_name,
        score: c.score,
        threshold: c.threshold,
        max_score: c.max_score,
      };
    }

    const subs = splitSubCriteria(c.body);
    for (const s of subs) {
      const subFindings = extractFindings(c.criterion_id, c.criterion_name, s.sub_criterion, s.body);
      findings.push(...subFindings);
    }
  }

  return { metadata, scores_by_criterion, findings };
}

module.exports = {
  parseEacea,
  // internal exports for tests / loader
  extractMetadata,
  splitCriteria,
  splitSubCriteria,
  splitSentences,
  extractFindings,
};
