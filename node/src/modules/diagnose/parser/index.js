// Public entry point for the evaluator-letter parser.
// Returns a structured result ready for insertion in evaluation_letters + evaluation_findings.

const { extractText, looksLikeEacea } = require('./extract-text');
const { parseEacea } = require('./eacea-parser');

/**
 * Parse a letter from a file path.
 *
 * @param {string} filePath  absolute path to PDF, docx, or txt file
 * @param {object} hint      optional metadata override:
 *                             { sourceFormat, language, programId }
 * @returns {Promise<{
 *   sourceFormat: string,
 *   rawText: string,
 *   metadata: object,
 *   scoresByCriterion: object,
 *   findings: Array
 * }>}
 */
async function parseLetterFromFile(filePath, hint = {}) {
  const { text, sourceFormat: detectedFormat } = await extractText(filePath);
  const sourceFormat = hint.sourceFormat || detectedFormat;

  // Always run the EACEA parser. If the document is narrative (no "Score:"
  // headers), the parser still extracts findings from prose using the
  // severity dictionary — it just doesn't extract scores.
  const isEacea = looksLikeEacea(text);
  const parsed = parseEacea(text);

  return {
    sourceFormat: isEacea ? sourceFormat : (sourceFormat === 'eacea_docx' || sourceFormat === 'eacea_pdf' ? 'narrative' : sourceFormat),
    rawText: text,
    metadata: parsed.metadata,
    scoresByCriterion: parsed.scores_by_criterion,
    findings: parsed.findings,
  };
}

/**
 * Parse a letter from a raw text string.
 */
function parseLetterFromText(text, hint = {}) {
  const sourceFormat = hint.sourceFormat || (looksLikeEacea(text) ? 'eacea_pdf' : 'narrative');
  const parsed = parseEacea(text);

  return {
    sourceFormat,
    rawText: text,
    metadata: parsed.metadata,
    scoresByCriterion: parsed.scores_by_criterion,
    findings: parsed.findings,
  };
}

module.exports = {
  parseLetterFromFile,
  parseLetterFromText,
};
