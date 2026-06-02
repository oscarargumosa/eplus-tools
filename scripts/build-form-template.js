#!/usr/bin/env node
/**
 * Builds docs/templates/form_part_b_eacea_template.docx by injecting docxtemplater
 * placeholders into the official EACEA Form Part B (BB+LSII) v2.0 template.
 *
 * Phase 1: narrative "Insert text" anchors + cover-page bracketed placeholders.
 * Phase 2: dynamic-row tables (staff, risks, WPs nested, staff-effort, events,
 *          gantt timetable, annex previous projects).
 *
 * Source : docs/templates/form_part_b_eacea.docx   (official, untouched)
 * Output : docs/templates/form_part_b_eacea_template.docx
 *
 * Re-run any time. Idempotent: starts from the official source each time.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const SRC = path.join(__dirname, '..', 'docs', 'templates', 'form_part_b_eacea.docx');
const OUT = path.join(__dirname, '..', 'docs', 'templates', 'form_part_b_eacea_template.docx');

// Order of "Insert text" occurrences in the official template (verified via
// .tmp/inspect-doc.js — 16 hits, in document order).
const INSERT_TEXT_PLACEHOLDERS = [
  's1_1_text',
  's1_2_text',
  's1_3_text',
  's2_1_1_text',
  's2_1_2_text',
  's2_1_3_outside_text',
  's2_1_4_text',
  's2_2_1_text',
  's2_2_2_text',
  's3_1_text',
  's3_2_text',
  's3_3_text',
  's4_1_text',
  'subcontracting_other_text',
  's5_1_text',
  's6_2_justification',
];

// ── Phase 1 helpers ────────────────────────────────────────────────────────

const ARIAL_RPR = '<w:rPr><w:rFonts w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="16"/></w:rPr>';

function paragraphText(p) {
  const out = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(p)) !== null) out.push(m[1]);
  return out.join('');
}
function getPPr(p) {
  const m = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  return m ? m[0] : '';
}

function replaceFirstInsertText(xml, placeholder) {
  const re = /<w:t([^>]*)>Insert text ?<\/w:t>/;
  return xml.replace(re, (full, attrs) => {
    const attrsClean = / xml:space="preserve"/.test(attrs) ? attrs : `${attrs} xml:space="preserve"`;
    return `<w:t${attrsClean}>{${placeholder}}</w:t>`;
  });
}

function rewriteCoverParagraphs(xml) {
  const counts = { project_title: 0, project_acronym: 0, coordinator: 0 };
  const replaced = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    const txt = paragraphText(p).trim();
    const pPr = getPPr(p);
    if (txt === '[project title]') {
      counts.project_title++;
      return `<w:p>${pPr}<w:r>${ARIAL_RPR}<w:t xml:space="preserve">{project_title}</w:t></w:r></w:p>`;
    }
    if (txt === '[acronym]') {
      counts.project_acronym++;
      return `<w:p>${pPr}<w:r>${ARIAL_RPR}<w:t xml:space="preserve">{project_acronym}</w:t></w:r></w:p>`;
    }
    if (txt === '[name NAME], [organisation name]') {
      counts.coordinator++;
      return `<w:p>${pPr}` +
        `<w:r>${ARIAL_RPR}<w:t xml:space="preserve">{coordinator_name}</w:t></w:r>` +
        `<w:r>${ARIAL_RPR}<w:t xml:space="preserve">, </w:t></w:r>` +
        `<w:r>${ARIAL_RPR}<w:t xml:space="preserve">{coordinator_org}</w:t></w:r>` +
        `</w:p>`;
    }
    return p;
  });
  return { xml: replaced, counts };
}

// ── Phase 2 helpers: table-row transformer ─────────────────────────────────

/**
 * Find the n-th `<w:tbl>` block in the document and apply `transformer(tblXml)`,
 * which must return the new tbl xml. Other tables are untouched.
 */
function transformNthTable(xml, n, transformer) {
  let i = 0;
  let applied = false;
  const out = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    if (i++ === n) {
      applied = true;
      return transformer(tbl);
    }
    return tbl;
  });
  if (!applied) throw new Error(`transformNthTable: no table at index ${n}`);
  return out;
}

/** Extract all <w:tr>...</w:tr> from a table xml, in order. */
function splitRows(tblXml) {
  return tblXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
}

/** Extract <w:tblPr> + <w:tblGrid> + everything between <w:tbl> and the first <w:tr>. */
function tableHead(tblXml) {
  const m = tblXml.match(/^<w:tbl>([\s\S]*?)(?=<w:tr\b)/);
  return m ? m[1] : '';
}

/** Extract <w:trPr>...</w:trPr> from a row, or '' if absent. */
function extractTrPr(trXml) {
  const m = trXml.match(/<w:trPr>[\s\S]*?<\/w:trPr>/);
  return m ? m[0] : '';
}

/** Extract the cells of a row as an array of full <w:tc>...</w:tc> strings. */
function splitCells(trXml) {
  return trXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
}

/** Extract <w:tcPr>...</w:tcPr> from a cell, or '' if absent. */
function extractTcPr(tcXml) {
  const m = tcXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  return m ? m[0] : '';
}

/**
 * Build a fresh row from the original template-row's <w:tcPr>s, with one
 * placeholder per cell. The first cell text is prefixed with `loopOpen`
 * (e.g. `{#staff}`), the last with `loopClose` (e.g. `{/staff}`).
 *
 * `placeholders` length must equal cell count.
 */
function buildLoopedRow(templateRowXml, placeholders, loopOpen, loopClose) {
  const trPr = extractTrPr(templateRowXml);
  const cells = splitCells(templateRowXml);
  if (cells.length !== placeholders.length) {
    throw new Error(`buildLoopedRow: ${cells.length} cells but ${placeholders.length} placeholders`);
  }
  const newCells = cells.map((tc, i) => {
    const tcPr = extractTcPr(tc);
    const placeholder = placeholders[i];
    const prefix = i === 0 ? loopOpen : '';
    const suffix = i === cells.length - 1 ? loopClose : '';
    const text = `${prefix}{${placeholder}}${suffix}`;
    return `<w:tc>${tcPr}<w:p><w:r>${ARIAL_RPR}<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
  });
  return `<w:tr>${trPr}${newCells.join('')}</w:tr>`;
}

/**
 * Build a row from a multi-section template (e.g. milestone or deliverable
 * rows in the WP block) where some cells need static content (like the
 * MS prefix or D code) and others need placeholders.
 *
 * cellSpecs: array of either:
 *   - { placeholder: 'name' }        → cell with {name}
 *   - { static: 'M' }                → cell with literal "M"
 *   - null                            → empty cell
 */
function buildLoopedRowSpec(templateRowXml, cellSpecs, loopOpen, loopClose) {
  const trPr = extractTrPr(templateRowXml);
  const cells = splitCells(templateRowXml);
  if (cells.length !== cellSpecs.length) {
    throw new Error(`buildLoopedRowSpec: ${cells.length} cells but ${cellSpecs.length} specs`);
  }
  const newCells = cells.map((tc, i) => {
    const tcPr = extractTcPr(tc);
    const spec = cellSpecs[i] || {};
    const prefix = i === 0 ? loopOpen : '';
    const suffix = i === cells.length - 1 ? loopClose : '';
    let body = '';
    if (spec.placeholder) body = `{${spec.placeholder}}`;
    else if (spec.static != null) body = String(spec.static);
    const text = `${prefix}${body}${suffix}`;
    return `<w:tc>${tcPr}<w:p><w:r>${ARIAL_RPR}<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
  });
  return `<w:tr>${trPr}${newCells.join('')}</w:tr>`;
}

// ── Phase 2 transformers ───────────────────────────────────────────────────

/**
 * Table [7] — Project teams and staff.
 * Rows: 0=title+guidance, 1=column headers, 2-5=empty data rows (4 cells each).
 * Keep r0+r1, replace r2 with looped row, drop r3..r5.
 */
function transformStaffTable(tbl) {
  const rows = splitRows(tbl);
  const head = tableHead(tbl);
  const newRow = buildLoopedRow(
    rows[2],
    ['staff_name_function', 'staff_organisation', 'staff_role_tasks', 'staff_profile'],
    '{#staff}', '{/staff}'
  );
  return `<w:tbl>${head}${rows[0]}${rows[1]}${newRow}</w:tbl>`;
}

/**
 * Table [10] — Critical risks.
 * Rows: 0=title+guidance, 1=header, 2-3=empty data rows (4 cells).
 */
function transformRiskTable(tbl) {
  const rows = splitRows(tbl);
  const head = tableHead(tbl);
  const newRow = buildLoopedRow(
    rows[2],
    ['risk_no', 'risk_description', 'risk_wp_code', 'risk_mitigation'],
    '{#risks}', '{/risks}'
  );
  return `<w:tbl>${head}${rows[0]}${rows[1]}${newRow}</w:tbl>`;
}

/**
 * Table [20] — Staff effort per work package.
 * Rows: 0=title, 1=header (7 cells), 2-5=empty data rows (7 cells), 6=Total.
 * Wrap r2 with {#wps_effort}, drop r3..r5, keep r6 (Total).
 */
function transformStaffEffortTable(tbl) {
  const rows = splitRows(tbl);
  const head = tableHead(tbl);
  const newRow = buildLoopedRow(
    rows[2],
    ['eff_wp_no', 'eff_wp_title', 'eff_lead_no', 'eff_lead_short', 'eff_start', 'eff_end', 'eff_pm'],
    '{#wps_effort}', '{/wps_effort}'
  );
  return `<w:tbl>${head}${rows[0]}${rows[1]}${newRow}${rows[6]}</w:tbl>`;
}

/**
 * Table [23] — Events meetings and mobility.
 * Rows: 0=title, 1=header level 1 (4 cells), 2=header level 2 (8 cells: Name, Type, Area, Location, Duration days, Number — preceded by Event No, Participant, Description),
 *       3-4=empty data rows (8 cells).
 */
function transformEventsTable(tbl) {
  const rows = splitRows(tbl);
  const head = tableHead(tbl);
  const newRow = buildLoopedRow(
    rows[3],
    ['event_no', 'event_participant', 'event_description', 'event_name', 'event_type', 'event_area', 'event_location', 'event_attendees'],
    '{#events}', '{/events}'
  );
  return `<w:tbl>${head}${rows[0]}${rows[1]}${rows[2]}${newRow}</w:tbl>`;
}

/**
 * Table [24] — Timetable Gantt (projects up to 2 years).
 * Rows: 0=title, 1=ACTIVITY/MONTHS header (2 cells), 2=M1..M24 header (25 cells),
 *       3-5=empty task rows (25 cells: 1 activity name + 24 months).
 *
 * Strategy: replace r3 with a single template row that:
 *   - cell[0] = activity name placeholder
 *   - cells[1..24] = static placeholders {m1}..{m24}
 *
 * We don't try to make months a sub-loop (delicate XML); the row has fixed
 * 24 month cells. The renderer will fill m1..m24 with the bullet/empty marker.
 */
function transformGanttTable(tbl) {
  const rows = splitRows(tbl);
  const head = tableHead(tbl);
  const tr = rows[3];
  const trPr = extractTrPr(tr);
  const cells = splitCells(tr);
  if (cells.length !== 25) throw new Error(`Gantt template row has ${cells.length} cells, expected 25`);
  const newCells = cells.map((tc, i) => {
    const tcPr = extractTcPr(tc);
    const ph = i === 0 ? 'gantt_activity' : `gantt_m${i}`;
    const prefix = i === 0 ? '{#tasks_gantt}' : '';
    const suffix = i === cells.length - 1 ? '{/tasks_gantt}' : '';
    return `<w:tc>${tcPr}<w:p><w:r>${ARIAL_RPR}<w:t xml:space="preserve">${prefix}{${ph}}${suffix}</w:t></w:r></w:p></w:tc>`;
  });
  const newRow = `<w:tr>${trPr}${newCells.join('')}</w:tr>`;
  return `<w:tbl>${head}${rows[0]}${rows[1]}${rows[2]}${newRow}</w:tbl>`;
}

/**
 * Table [31] — Annex List of previous projects.
 * Rows: 0=title, 1=header (6 cells), 2-4=empty rows (6 cells).
 */
function transformPreviousProjectsTable(tbl) {
  const rows = splitRows(tbl);
  const head = tableHead(tbl);
  const newRow = buildLoopedRow(
    rows[2],
    ['ep_participant', 'ep_reference', 'ep_period', 'ep_role', 'ep_amount', 'ep_website'],
    '{#euProjects}', '{/euProjects}'
  );
  return `<w:tbl>${head}${rows[0]}${rows[1]}${newRow}</w:tbl>`;
}

/**
 * Table [18] — WP1 block (Tasks + Milestones + Deliverables).
 * Rows (verified via inspection):
 *   0  cells=1   "Work Package 1: [Name]"
 *   1  cells=4   "Duration: MX-MX  ·  Lead Beneficiary: 1-Short name"
 *   2  cells=1   "Objectives" header
 *   3  cells=1   (empty objectives box)
 *   4  cells=1   "Activities and division of work" header
 *   5  cells=5   Tasks header level 1: Task No · Task Name · Description · Participants · In-kind/Subc.
 *   6  cells=6   Tasks header level 2: (empty) · (empty) · (empty) · Name · Role · (empty)
 *   7  cells=6   T1.1 row template
 *   8  cells=6   T1.2 row
 *   9  cells=6   empty
 *   10 cells=1   "Milestones and deliverables" header
 *   11 cells=7   Milestones header
 *   12 cells=7   MS1 row template
 *   13 cells=7   MS2 row
 *   14 cells=8   Deliverables header
 *   15 cells=8   D1.1 row template
 *   16 cells=8   D1.2 row
 *
 * Strategy:
 *   - r0 → header with {wp_title}
 *   - r1 → duration + lead beneficiary
 *   - r3 → {wp_objectives}
 *   - tasks: keep r5+r6, replace r7 with {#tasks} loop, drop r8+r9
 *   - milestones: keep r11, replace r12 with {#milestones} loop, drop r13
 *   - deliverables: keep r14, replace r15 with {#deliverables} loop, drop r16
 *
 * The whole table will be wrapped with {#wps}{/wps} via paragraph markers
 * (separate function).
 */
function transformWpBlockTable(tbl) {
  const rows = splitRows(tbl);
  const head = tableHead(tbl);

  // Row 0 (1 cell): Work Package N: Name
  const r0 = (function () {
    const tc = splitCells(rows[0])[0];
    const tcPr = extractTcPr(tc);
    return `<w:tr>${extractTrPr(rows[0])}<w:tc>${tcPr}<w:p><w:r>${ARIAL_RPR}<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Work Package {wp_number}: {wp_title}</w:t></w:r></w:p></w:tc></w:tr>`;
  })();

  // Row 1 (4 cells): Duration + Lead Beneficiary labels
  // Original cells: "Duration:" / "MX - MX" / "Lead Beneficiary:" / "1-Short name"
  const r1 = (function () {
    const cells = splitCells(rows[1]);
    const make = (i, content, bold) => {
      const tcPr = extractTcPr(cells[i]);
      const rPr = bold ? `<w:rPr><w:rFonts w:cs="Arial"/><w:b/><w:sz w:val="18"/><w:szCs w:val="16"/></w:rPr>` : ARIAL_RPR;
      return `<w:tc>${tcPr}<w:p><w:r>${rPr}<w:t xml:space="preserve">${content}</w:t></w:r></w:p></w:tc>`;
    };
    return `<w:tr>${extractTrPr(rows[1])}${make(0, 'Duration:', true)}${make(1, '{wp_duration}', false)}${make(2, 'Lead Beneficiary:', true)}${make(3, '{wp_lead}', false)}</w:tr>`;
  })();

  // Row 3 (1 cell, empty objectives box): inject {wp_objectives}
  const r3 = (function () {
    const tc = splitCells(rows[3])[0];
    const tcPr = extractTcPr(tc);
    return `<w:tr>${extractTrPr(rows[3])}<w:tc>${tcPr}<w:p><w:r>${ARIAL_RPR}<w:t xml:space="preserve">{wp_objectives}</w:t></w:r></w:p></w:tc></w:tr>`;
  })();

  // Tasks loop row (replace r7, drop r8+r9). r7 has 6 cells: T1.1 / Task name / Description / Name / Role / (empty)
  const tasksRow = buildLoopedRow(
    rows[7],
    ['task_no', 'task_name', 'task_description', 'task_participant_name', 'task_participant_role', 'task_in_kind'],
    '{#tasks}', '{/tasks}'
  );

  // Milestones loop row (replace r12, drop r13). r12 has 7 cells: MS1 / Name / WP No / Lead / Description / Due / Verification
  const milestonesRow = buildLoopedRow(
    rows[12],
    ['ms_no', 'ms_name', 'ms_wp_no', 'ms_lead', 'ms_description', 'ms_due', 'ms_verification'],
    '{#milestones}', '{/milestones}'
  );

  // Deliverables loop row (replace r15, drop r16). r15 has 8 cells.
  const deliverablesRow = buildLoopedRow(
    rows[15],
    ['del_no', 'del_name', 'del_wp_no', 'del_lead', 'del_type', 'del_dissemination', 'del_due', 'del_description'],
    '{#deliverables}', '{/deliverables}'
  );

  return (
    `<w:tbl>${head}` +
    r0 +
    r1 +
    rows[2] +     // "Objectives" header
    r3 +          // objectives box
    rows[4] +     // "Activities and division of work" header
    rows[5] +     // tasks header level 1
    rows[6] +     // tasks header level 2
    tasksRow +    // looped task
    rows[10] +    // "Milestones and deliverables" header
    rows[11] +    // milestones header
    milestonesRow +
    rows[14] +    // deliverables header
    deliverablesRow +
    `</w:tbl>`
  );
}

/**
 * Wrap the WP-region (the section between the "Work packages" guidance and the
 * "Estimated budget — Resources" budget table) with {#wps}{/wps} paragraph
 * markers, so docxtemplater repeats everything in between for each WP.
 *
 * The WP region in the template starts BEFORE table [18] (which is WP1 details)
 * and ends AFTER table [18] but BEFORE table [19] (budget). We anchor on string
 * markers found uniquely in the document. The text "Work Package 1" appears in
 * the WP1 table header (r0). The text "Estimated budget — Resources" begins
 * the budget table (we keep that table intact, not part of loop).
 *
 * We insert:
 *   - opening: a paragraph with {#wps} just before table [18]
 *   - closing: a paragraph with {/wps} just after table [18]
 *
 * Implementation: locate the n-th `<w:tbl>` (n=18) and inject paragraph markers
 * immediately before/after.
 */
function wrapWpBlockWithLoop(xml) {
  let i = 0;
  let inserted = 0;
  const out = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    if (i++ === 18) {
      inserted++;
      const open = `<w:p><w:pPr/><w:r>${ARIAL_RPR}<w:t xml:space="preserve">{#wps}</w:t></w:r></w:p>`;
      const close = `<w:p><w:pPr/><w:r>${ARIAL_RPR}<w:t xml:space="preserve">{/wps}</w:t></w:r></w:p>`;
      return open + tbl + close;
    }
    return tbl;
  });
  if (!inserted) throw new Error('wrapWpBlockWithLoop: WP table not found');
  return out;
}

// ── main ───────────────────────────────────────────────────────────────────

(function main() {
  console.log('Reading source:', SRC);
  const buf = fs.readFileSync(SRC);
  const zip = new PizZip(buf);

  let xml = zip.file('word/document.xml').asText();
  console.log('document.xml length (in):', xml.length);

  // Phase 1: 16 narrative anchors
  for (let i = 0; i < INSERT_TEXT_PLACEHOLDERS.length; i++) {
    xml = replaceFirstInsertText(xml, INSERT_TEXT_PLACEHOLDERS[i]);
  }
  const remaining = (xml.match(/<w:t[^>]*>Insert text ?<\/w:t>/g) || []).length;
  console.log('Phase 1 · Insert-text anchors replaced:', INSERT_TEXT_PLACEHOLDERS.length, '· remaining:', remaining);

  // Phase 1: cover-page bracketed placeholders
  const r = rewriteCoverParagraphs(xml);
  xml = r.xml;
  console.log('Phase 1 · Cover paragraphs rewritten:', r.counts);

  // Phase 2: dynamic-row tables
  xml = transformNthTable(xml, 7, transformStaffTable);
  console.log('Phase 2 · Staff table [7] transformed');
  xml = transformNthTable(xml, 10, transformRiskTable);
  console.log('Phase 2 · Risks table [10] transformed');
  xml = transformNthTable(xml, 18, transformWpBlockTable);
  console.log('Phase 2 · WP block table [18] transformed');
  xml = wrapWpBlockWithLoop(xml);
  console.log('Phase 2 · WP block wrapped with {#wps}{/wps}');
  xml = transformNthTable(xml, 20, transformStaffEffortTable);
  console.log('Phase 2 · Staff effort table [20] transformed');
  xml = transformNthTable(xml, 23, transformEventsTable);
  console.log('Phase 2 · Events table [23] transformed');
  xml = transformNthTable(xml, 24, transformGanttTable);
  console.log('Phase 2 · Gantt table [24] transformed');
  xml = transformNthTable(xml, 31, transformPreviousProjectsTable);
  console.log('Phase 2 · Previous projects table [31] transformed');

  console.log('document.xml length (out):', xml.length);

  zip.file('word/document.xml', xml);

  // header1.xml — top-of-page watermark "Call: [insert call identifier] — [insert call name]"
  let headerXml = zip.file('word/header1.xml').asText();
  const beforeIdent = headerXml.includes('insert call identifier');
  const beforeName = headerXml.includes('insert call name');
  headerXml = headerXml
    .replace(/<w:t([^>]*)>insert call identifier<\/w:t>/g, '<w:t$1>{call_identifier}</w:t>')
    .replace(/<w:t([^>]*)>insert call name<\/w:t>/g, '<w:t$1>{call_name}</w:t>');
  zip.file('word/header1.xml', headerXml);
  console.log('Phase 1 · header1.xml call placeholders injected:',
    { call_identifier: beforeIdent, call_name: beforeName });

  const outBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(OUT, outBuf);
  console.log('\nWrote:', OUT, '(' + outBuf.length + ' bytes)');
})();
