// Parser for EACEA Form Part B Word (.docx) — extracts user-written content
// per subsection and maps each block to the corresponding field_id from
// form_templates.template_json.
//
// Strategy:
//   1. Extract raw text with mammoth.
//   2. Detect numbered subsection headings (e.g. "1.1 Background", "2.1.2 Concept").
//   3. Filter out the Table of Contents entries (they end with `\t<page>`).
//   4. For each heading, content = text between this heading and the next.
//   5. Strip EACEA boilerplate (guidance bullets, instruction blocks).
//   6. Map heading number → field_id via template subsection.fields[].id.

const mammoth = require('mammoth');

/**
 * Parse a Word Form Part B file into a flat map of field_id -> text.
 * @param {Buffer|string} buffer  the docx file content (Buffer) or path
 * @param {object} template  the parsed template_json from form_templates
 * @returns {Promise<{ fields, sectionsCovered, errors, totalChars }>}
 */
async function parseWordPartB(buffer, template) {
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const text = normalize(rawText);

  const headings = detectHeadings(text);
  if (headings.length === 0) {
    return { fields: {}, sectionsCovered: [], errors: ['No numbered headings detected. Is this a Part B Word template?'], totalChars: text.length };
  }

  // Build map: heading_number ("1.1", "2.1.2", ...) -> field_id from template
  const numberToFieldId = buildNumberToFieldIdMap(template);

  const fields = {};
  const sectionsCovered = [];
  const errors = [];

  for (let i = 0; i < headings.length; i++) {
    const cur = headings[i];
    const next = headings[i + 1];
    const start = cur.headerEnd;
    const end = next ? next.start : text.length;

    let content = text.slice(start, end);
    content = stripBoilerplate(content);
    content = content.trim();

    if (!content || content.length < 30) {
      // Skip empty/minimal sections — likely template placeholders
      continue;
    }

    let fieldId = numberToFieldId[cur.number];
    if (!fieldId) {
      // Fallback: derive field_id from the heading number when template
      // doesn't define this subsection ("2.1.1" -> "s2_1_1_text"). Only do
      // this for heading numbers that look like real subsections (start with 1-9).
      if (/^[1-9](?:\.\d+){0,3}$/.test(cur.number)) {
        fieldId = 's' + cur.number.replace(/\./g, '_') + '_text';
      } else {
        errors.push(`Heading "${cur.number} ${cur.title}" not mapped (non-standard number).`);
        continue;
      }
    }

    if (fields[fieldId]) {
      // Concatenate if multiple headings map to the same field (shouldn't happen, but be safe)
      fields[fieldId] += '\n\n' + content;
    } else {
      fields[fieldId] = content;
    }
    sectionsCovered.push({ number: cur.number, title: cur.title, fieldId, chars: content.length });
  }

  return {
    fields,
    sectionsCovered,
    errors,
    totalChars: text.length,
    headingsDetected: headings.length,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalize(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')  // non-breaking spaces
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n');
}

/**
 * Detect headings of form "1.1 Title", "2.1.2 Title". Skip ToC entries (they
 * usually have a tab followed by a page number at the end: "1.1\tTitle\t5").
 */
function detectHeadings(text) {
  // Heading pattern: line-start digit(.digit){1,3} space title.
  // Require depth ≥ 2 ("1.1" not just "1") to avoid catching numbered lists
  // and stray standalone numbers in prose.
  const re = /^(\d+(?:\.\d+){1,3})\s+([^\n]{4,140})$/gm;
  const seen = new Set();
  const out = [];

  let m;
  while ((m = re.exec(text)) !== null) {
    const num = m[1];
    // Reject 12.00, 13.45 style timecodes / decimals that aren't real
    // section numbers — sections never have leading 0s nor numbers > 9 at depth 1.
    if (/^[1-9]\d+\./.test(num)) continue;

    let title = m[2].trim();

    // Skip ToC: title ends with \t<digits> (page number)
    const tocMatch = title.match(/^(.+?)\t+\d+\s*$/);
    if (tocMatch) continue;

    // Skip titles that end with characters typical of list items rather than headings
    if (/[:.]\s*$/.test(title)) continue;

    // Skip duplicates (TOC can have same number reappearing without tabs)
    if (seen.has(num)) continue;
    seen.add(num);

    if (title.length < 4) continue;

    out.push({
      number: num,
      title,
      start: m.index,
      headerEnd: m.index + m[0].length,
    });
  }

  // Cap depth at 4 (e.g. "1.1.1.1")
  return out.filter(h => h.number.split('.').length <= 4);
}

/**
 * Strip EACEA template boilerplate:
 *   - Guidance bullets / instructions (often italic — but mammoth strips
 *     formatting; we detect by characteristic phrases).
 *   - "[" ... "]" placeholder instructions if present.
 *   - "Please address..." opening phrases.
 */
function stripBoilerplate(content) {
  if (!content) return '';

  // Remove common EACEA guidance phrases (entire lines)
  const boilerplatePhrases = [
    /^\s*Please address all guiding points.*$/gmi,
    /^\s*This section addresses.*$/gmi,
    /^\s*Use this section to.*$/gmi,
    /^\s*Please (provide|describe|explain).*$/gmi,
    /^\s*Describe (how|the|in).*$/gmi,
    /^\s*How (is|does|will|do).*\?\s*$/gmi,
    /^\s*What (is|are|will|do).*\?\s*$/gmi,
    /^\s*If (yes|applicable),.*\?\s*$/gmi,
    /^\s*\[.*?\]\s*$/gm,  // bracketed instructions
    /^\s*\(max\.?\s*\d+\s*characters?\)\s*$/gmi,
    /^\s*\(maximum\s+\d+.*?\)\s*$/gmi,
  ];

  for (const p of boilerplatePhrases) {
    content = content.replace(p, '');
  }

  // Collapse leftover blank lines
  content = content.replace(/\n{3,}/g, '\n\n').trim();
  return content;
}

/**
 * Build a map of subsection.number -> field.id by scanning the template.
 * Falls back to deriving field_id from the heading number ("s1_1_text") if
 * the template doesn't define it.
 */
function buildNumberToFieldIdMap(template) {
  const map = {};
  if (!template || !Array.isArray(template.sections)) return map;

  for (const section of template.sections) {
    if (!Array.isArray(section.subsections)) continue;
    for (const sub of section.subsections) {
      const num = sub.number;
      if (!num) continue;
      const textField = (sub.fields || []).find(f =>
        f.type === 'textarea' || f.type === 'rich' || f.type === 'text' || f.id?.endsWith('_text')
      );
      if (textField?.id) {
        map[num] = textField.id;
      } else {
        // Derive default field_id from number: "1.1" -> "s1_1_text"
        map[num] = 's' + num.replace(/\./g, '_') + '_text';
      }

      // Nested subsections (2.1.1 etc.) — recurse one level
      if (Array.isArray(sub.subsections)) {
        for (const sub2 of sub.subsections) {
          const num2 = sub2.number;
          if (!num2) continue;
          const tf2 = (sub2.fields || []).find(f =>
            f.type === 'textarea' || f.type === 'rich' || f.type === 'text' || f.id?.endsWith('_text')
          );
          map[num2] = tf2?.id || ('s' + num2.replace(/\./g, '_') + '_text');
        }
      }
    }
  }
  return map;
}

module.exports = { parseWordPartB, detectHeadings, stripBoilerplate, buildNumberToFieldIdMap };
