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

  const subHeadings = detectHeadings(text);
  const boundaries  = detectBoundaries(text);
  // Merge: boundaries act as content cut-offs so the last subsection doesn't
  // bleed into "5. OTHER", "6. DECLARATIONS", etc.
  const headings = [...subHeadings, ...boundaries].sort((a, b) => a.start - b.start);

  if (subHeadings.length === 0) {
    return { fields: {}, sectionsCovered: [], errors: ['No numbered headings detected. Is this a Part B Word template?'], totalChars: text.length };
  }

  // Build map: heading_number ("1.1", "2.1.2", ...) -> field_id from template
  const numberToFieldId = buildNumberToFieldIdMap(template);

  const fields = {};
  const sectionsCovered = [];
  const errors = [];

  for (let i = 0; i < headings.length; i++) {
    const cur = headings[i];
    if (cur.boundary) continue;  // boundaries only mark cut-offs, no content

    const next = headings[i + 1];
    const start = cur.headerEnd;
    const end = next ? next.start : text.length;

    let content = text.slice(start, end);
    content = stripRepeatedTitle(content, cur.title);
    content = stripBoilerplate(content);
    content = stripLeadingSubtitle(content);
    content = content.trim();

    if (!content || content.length < 50) {
      // Skip empty/minimal sections — likely template guidance only
      continue;
    }
    // Additional safety: if what remains is a single short line with no
    // sentence structure (no period), it's almost certainly a leftover
    // EACEA subtitle, not user content.
    if (looksLikeSubtitleOnly(content)) continue;
    // Narrative quality gate: require at least one paragraph that looks like
    // real prose (≥ 250 chars and ≥ 2 sentence terminators). This drops
    // sections that are only table headers / short imperative guidance and
    // were not caught by specific boilerplate patterns above.
    if (!hasNarrativeParagraph(content)) continue;

    let fieldId = numberToFieldId[cur.number];
    if (!fieldId) {
      // Fallback: derive field_id from the heading number when template
      // doesn't define this subsection ("2.1.1" -> "s2_1_1_text"). Only do
      // this for heading numbers that look like real subsections (start with 1-9
      // and have depth ≥ 2 — depth-1 boundaries already filtered above).
      if (/^[1-9](?:\.\d+){1,3}$/.test(cur.number)) {
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
    // Reject "X.0" / "X.Y.0" — EACEA subsections always start at .1
    if (/\.0(?:\.|$)/.test(num)) continue;

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
 * Detect top-level EACEA section markers that bound subsection content
 * but never carry their own user content (e.g. "5. OTHER", "6. DECLARATIONS").
 * These prevent the last subsection from over-capturing into them.
 */
function detectBoundaries(text) {
  // Match "N. TITLE" or "N. TITLE, MORE WORDS, ..." for known EACEA top-level
  // sections. The full title may run on (e.g. "4. WORK PLAN, WORK PACKAGES,
  // ACTIVITIES, RESOURCES AND TIMING") so allow any uppercase tail.
  const re = /^(\d)\.\s+(OTHER|DECLARATIONS?|ANNEXES?|ETHICS|SECURITY|WORK\s+PLAN|RELEVANCE|QUALITY|IMPACT|EXCELLENCE|IMPLEMENTATION|GENERAL\s+INFORMATION)\b[A-Z0-9,\s]*$/gm;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      number: m[1],
      title: m[2].trim(),
      start: m.index,
      headerEnd: m.index + m[0].length,
      boundary: true,
    });
  }
  return out;
}

/**
 * EACEA also renders a body-level subtitle ABOVE the user content that
 * doesn't always match the numbered heading (e.g. heading "2.2.1 Consortium
 * set-up" + subtitle "Consortium cooperation and division of roles (if
 * applicable)"). Strip a single short leading line that looks like a section
 * subtitle: Title Case, < 120 chars, no terminal period.
 */
function stripLeadingSubtitle(content) {
  if (!content) return content;
  const lines = content.split('\n');
  // Skip blank lines first
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return content;
  const first = lines[i].trim();
  if (first.length === 0 || first.length > 120) return content;
  // Heuristic: looks like a subtitle if it has no period or it ends with
  // a parenthetical like "(if applicable)" / "(optional)".
  const endsWithParen = /\([^)]+\)\s*$/.test(first);
  const noPeriodInProse = !/[.!?]\s*$/.test(first);
  if (endsWithParen || noPeriodInProse) {
    // Drop the line + any trailing blanks
    return lines.slice(i + 1).join('\n');
  }
  return content;
}

/**
 * Return true if `content` is a single short line that lacks any sentence-
 * terminator and is therefore very likely a leftover EACEA subtitle, not
 * actual user writing.
 */
function looksLikeSubtitleOnly(content) {
  const trimmed = content.trim();
  if (trimmed.length > 150) return false;
  if (trimmed.includes('\n')) return false;
  if (/[.!?]/.test(trimmed)) return false;
  return true;
}

/**
 * Quality gate to distinguish real user prose from leftover EACEA template
 * fragments (table headers, "Note: ..." lines, short imperatives). Returns
 * true if any blank-line-delimited paragraph has ≥ 250 chars AND ≥ 2
 * sentence terminators — a reasonable lower bound for "the user actually
 * wrote something here". If a section consists only of short noise lines
 * (e.g. "Risk No\n\nDescription\n\nWork package No\n\nProposed risk-mitigation
 * measures"), no paragraph meets this and the section is dropped.
 */
function hasNarrativeParagraph(content) {
  if (!content) return false;
  const paragraphs = content.split(/\n\s*\n/);
  for (const p of paragraphs) {
    const t = p.trim();
    if (t.length < 250) continue;
    const sentences = (t.match(/[.!?]/g) || []).length;
    if (sentences >= 2) return true;
  }
  return false;
}

/**
 * EACEA Word templates often render each subsection as:
 *   "1.1 Background and general objectives"      <- numbered heading
 *   "Background and general objectives"          <- title repeated as styled paragraph
 *   <user content>
 * Strip the repeated title line so the saved content starts with user text.
 */
function stripRepeatedTitle(content, headingTitle) {
  if (!content || !headingTitle) return content;
  const normTitle = headingTitle.trim().toLowerCase().replace(/\s+/g, ' ');
  // Try the first 1-3 leading lines: if any matches the heading title, drop it
  const lines = content.split('\n');
  let dropUpTo = 0;
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    const line = lines[i].trim().toLowerCase().replace(/\s+/g, ' ');
    if (!line) { dropUpTo = i + 1; continue; }
    if (line === normTitle) { dropUpTo = i + 1; break; }
  }
  return dropUpTo ? lines.slice(dropUpTo).join('\n') : content;
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

  // First pass: drop EACEA Word template tags like #§WRK-PLA-WP§# and #@COM-PLE-CP@#.
  content = content.replace(/#[§@][A-Z0-9§@\-\s]*?[§@]#/g, '');

  // Remove common EACEA guidance phrases (entire lines)
  const boilerplatePhrases = [
    // Generic openers / closers
    /^\s*Please address (all )?(the )?(specific )?(guiding|conditions).*$/gmi,
    /^\s*This section addresses.*$/gmi,
    /^\s*Use this section to.*$/gmi,
    /^\s*Please (provide|describe|explain|address|outline|indicate|specify|list|note|fill|complete).*$/gmi,
    /^\s*Describe (how|the|in|critical|any|your).*$/gmi,
    /^\s*Explain (how|the|why|in|each|in detail).*$/gmi,
    /^\s*Outline (the|how|why|your).*$/gmi,
    /^\s*Indicate (the|how|whether|any).*$/gmi,
    /^\s*List (the|all|any|each).*$/gmi,
    /^\s*Define (the|each|all).*$/gmi,
    /^\s*Specify (the|how|any|each).*$/gmi,
    /^\s*Group your activities.*$/gmi,
    /^\s*Show that (each|the|all|your).*$/gmi,
    /^\s*Provide (a|the|an|all|details|evidence).*$/gmi,
    /^\s*In what way.*$/gmi,
    /^\s*How (is|does|will|do|can|should|are|much|many).*\?\s*$/gmi,
    /^\s*What (is|are|will|do|kind|sort|types).*\?\s*$/gmi,
    /^\s*Are there any.*\?\s*$/gmi,
    /^\s*If (yes|applicable|relevant|so|not),.*$/gmi,
    /^\s*The objectives should be.*$/gmi,
    /^\s*For each (objective|partner|activity|work package|risk|deliverable).*$/gmi,
    /^\s*\(?n\.?\s*\/?\s*a\.?\)?\s*for (prefixed|fixed).*$/gmi,
    /^\s*Not applicable\.?\s*$/gmi,

    // EACEA-specific section openers in Part B
    /^\s*Please address each guiding points.*$/gmi,
    /^\s*The applicants will be evaluated.*$/gmi,
    /^\s*If the Call document\/Programme Guide.*$/gmi,
    /^\s*If your proposal is based on the results.*$/gmi,
    /^\s*If you do not have all skills.*$/gmi,
    /^\s*If there is subcontracting.*$/gmi,
    /^\s*Do (NOT|not) (compare|describe|repeat|use|justify).*$/gmi,
    /^\s*Repeat (the section|lines|columns) (as|for) (necessary|each).*$/gmi,
    /^\s*Fill in cells in beige.*$/gmi,
    /^\s*Note:\s.*$/gmi,                  // "Note: Use...", "Note: The concept...", etc.
    /^\s*You may add (additional|extra|more).*$/gmi,
    /^\s*Each work package.*$/gmi,
    /^\s*A work package.*$/gmi,
    /^\s*The work package.*$/gmi,

    // Bracketed / parenthetical instructions
    /^\s*\[.*?\]\s*$/gm,
    /^\s*\(max\.?\s*\d+\s*characters?\)\s*$/gmi,
    /^\s*\(maximum\s+\d+.*?\)\s*$/gmi,
    /^\s*\(if applicable\)\s*$/gmi,
    /^\s*\(optional\)\s*$/gmi,

    // Trailing-section markers that sometimes leak past boundaries
    /^\s*\d+\.\s+(OTHER|DECLARATIONS?|ANNEXES?|ETHICS|SECURITY|WORK\s+PLAN|RELEVANCE|QUALITY|IMPACT)\s*$/gm,
    /^\s*Double funding\s*$/gm,
    /^\s*Information concerning other EU grants.*$/gmi,
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

module.exports = { parseWordPartB, detectHeadings, detectBoundaries, stripBoilerplate, stripRepeatedTitle, buildNumberToFieldIdMap };
