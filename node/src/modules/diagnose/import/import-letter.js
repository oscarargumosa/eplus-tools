// Import an evaluator letter (PDF/docx/txt) into evaluation_letters +
// evaluation_findings. Optionally link to a proposal (projects row).
//
// The parser is the same one used by the seed corpus loader
// (../parser/parseLetterFromFile).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../../utils/db');
const { parseLetterFromFile, parseLetterFromText } = require('../parser');

const SEVERITY_FROM_RANK = ['positive', 'low', 'medium_low', 'medium', 'medium_high', 'high', 'critical'];
const SEVERITY_RANK = { critical: 6, high: 5, medium_high: 4, medium: 3, medium_low: 2, low: 1, positive: 0 };

/**
 * Import an evaluator letter from an uploaded file buffer.
 *
 * @param {Buffer} buffer            file content
 * @param {string} filename          original filename (used to detect ext)
 * @param {string} programId         intake_programs.id (UUID) — the call this letter belongs to
 * @param {object} opts
 *   - projectId        (optional) link letter to this project (set source_evaluation_id)
 *   - userId           who uploaded
 *   - proposalNumber   optional manual override
 *   - proposalAcronym  optional manual override
 *   - result           'awarded' | 'rejected_threshold' | 'rejected_ranking' | 'unknown'
 *
 * @returns { letterId, parserReport }
 */
async function importLetterFromFile(buffer, filename, programId, opts = {}) {
  // Persist buffer to a temp file so parser/extract-text can use mammoth/pdf-parse
  const ext = (path.extname(filename || '') || '.txt').toLowerCase();
  const tmpPath = path.join(os.tmpdir(), `letter_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    const parsed = await parseLetterFromFile(tmpPath);
    return await persistLetter(parsed, {
      programId,
      filename,
      ...opts,
    });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (e) {}
  }
}

/**
 * Import an evaluator letter from a raw text paste.
 */
async function importLetterFromText(text, programId, opts = {}) {
  const parsed = parseLetterFromText(text);
  return await persistLetter(parsed, { programId, filename: 'paste.txt', ...opts });
}

// ─── persistence ────────────────────────────────────────────────────────────

async function persistLetter(parsed, opts) {
  const {
    programId, filename, projectId, userId,
    proposalNumber, proposalAcronym, result, language,
  } = opts;

  if (!programId) throw new Error('programId is required.');

  // Validate program exists
  const [progRows] = await pool.query(
    `SELECT id, program_id, name FROM intake_programs WHERE id = ?`,
    [programId]
  );
  if (progRows.length === 0) {
    throw new Error(`Program ${programId} not found in intake_programs.`);
  }

  // Inferred metadata from parser, with manual overrides taking precedence
  const md = parsed.metadata || {};
  const scoresByCriterion = parsed.scoresByCriterion || {};
  const totalScore = sumScores(scoresByCriterion);
  const totalThreshold = sumThresholds(scoresByCriterion);

  const inferredResult = inferResult(totalScore, totalThreshold);
  const finalResult = result || inferredResult;

  const letterId = uuidv4();
  await pool.query(
    `INSERT INTO evaluation_letters
     (id, program_id, proposal_number, proposal_acronym, proposal_title,
      total_score, total_threshold, result, source_format, source_filename,
      raw_text, scores_by_criterion, language, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      letterId,
      programId,
      proposalNumber || md.proposal_number || null,
      proposalAcronym || md.proposal_acronym || null,
      md.proposal_title || null,
      md.total_score ?? totalScore,
      md.total_threshold ?? totalThreshold,
      finalResult,
      parsed.sourceFormat || 'manual',
      filename || null,
      parsed.rawText,
      JSON.stringify(scoresByCriterion),
      language || 'en',
      userId || null,
    ]
  );

  // Persist findings
  const findings = parsed.findings || [];
  let findingsInserted = 0;
  if (findings.length > 0) {
    const rows = findings.map((f, idx) => [
      uuidv4(),
      letterId,
      programId,
      f.criterion || 'GENERAL',
      f.sub_criterion || null,
      f.severity || 'medium',
      f.is_positive ? 1 : 0,
      f.finding_text,
      f.fragment_quote,
      f.applies_to_section || null,
      idx,
    ]);
    await pool.query(
      `INSERT INTO evaluation_findings
       (id, letter_id, program_id, criterion, sub_criterion, severity,
        is_positive, finding_text, fragment_quote, applies_to_section, sort_order)
       VALUES ?`,
      [rows]
    );
    findingsInserted = rows.length;
  }

  // Link to project if requested
  if (projectId) {
    // Verify the project exists and ownership (we trust the controller for auth)
    const [pRows] = await pool.query(
      `SELECT id FROM projects WHERE id = ?`,
      [projectId]
    );
    if (pRows.length > 0) {
      await pool.query(
        `UPDATE projects SET source_evaluation_id = ?, origin = 'recycled' WHERE id = ?`,
        [letterId, projectId]
      );
    }
  }

  return {
    letterId,
    parserReport: {
      sourceFormat: parsed.sourceFormat,
      totalChars: (parsed.rawText || '').length,
      metadata: md,
      scoresByCriterion,
      findingsInserted,
      negativeCount: findings.filter(f => !f.is_positive).length,
      positiveCount: findings.filter(f => f.is_positive).length,
    },
  };
}

function sumScores(scores) {
  const values = Object.values(scores || {}).map(c => Number(c?.score)).filter(n => !Number.isNaN(n));
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}
function sumThresholds(scores) {
  const values = Object.values(scores || {}).map(c => Number(c?.threshold)).filter(n => !Number.isNaN(n));
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

function inferResult(total, threshold) {
  if (total == null || threshold == null) return 'unknown';
  if (total < threshold) return 'rejected_threshold';
  return 'rejected_ranking';  // passed threshold but not necessarily awarded
}

module.exports = { importLetterFromFile, importLetterFromText };
