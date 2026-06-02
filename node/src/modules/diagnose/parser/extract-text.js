// Extract plain text from PDF, docx, or treat as text.
// Used by parser/index.js as the first step before regex parsing.

const fs = require('fs');
const path = require('path');

/**
 * Extract text from a file path.
 * Returns { text, sourceFormat } where sourceFormat is one of:
 *   - 'eacea_pdf' / 'eacea_docx' / 'narrative' / 'summary' / 'manual'
 *
 * sourceFormat is provisional based on file extension + content heuristics.
 * The EACEA-specific parser will refine it if it finds the canonical structure.
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  let text = '';
  let formatHint = 'manual';

  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    text = data.text || '';
    formatHint = 'eacea_pdf';
  } else if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
    formatHint = looksLikeEacea(text) ? 'eacea_docx' : 'narrative';
  } else if (ext === '.txt' || ext === '.md') {
    text = buffer.toString('utf8');
    formatHint = looksLikeEacea(text) ? 'eacea_pdf' : 'narrative';
  } else {
    throw new Error(`Unsupported extension: ${ext}`);
  }

  // Remove repetitive page headers/footers typical of EACEA PDFs:
  //   "101246479/FOCUS-31/07/2025-14:41:47 1 /3"
  //   "Associated with document Ref. Ares(2025)6247920 - 31/07/2025"
  //   "-- N of M --"
  text = text
    .replace(/^\s*\d{6,10}\/[A-Z][A-Z0-9_\-]*\-\d{1,2}\/\d{1,2}\/\d{4}\-\d{1,2}:\d{1,2}:\d{1,2}\s+\d{1,2}\s*\/\s*\d{1,2}\s*$/gm, '')
    .replace(/Associated with document Ref\. Ares\(\d{4}\)\d+\s*\-\s*\d{1,2}\/\d{1,2}\/\d{4}/g, '')
    .replace(/^\-\-\s*\d+\s+of\s+\d+\s*\-\-\s*$/gm, '');

  // Normalize whitespace
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ') // non-breaking spaces
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, sourceFormat: formatHint };
}

/**
 * Quick heuristic: does this text follow the official EACEA letter structure?
 * Look for "Score: X.XX (Threshold: Y" or "Total score:" or "Criterion N".
 */
function looksLikeEacea(text) {
  if (!text) return false;
  return /Score:\s*\d+(?:\.\d+)?\s*\(Threshold:\s*\d+/i.test(text) ||
         /Total score:\s*\d+(?:\.\d+)?/i.test(text) ||
         /Criterion\s+\d+(?:\.\d+)?\s*[-–]/i.test(text);
}

module.exports = { extractText, looksLikeEacea };
