/**
 * Field length limits for the EACEA Form Part B.
 *
 * The canonical form template (docs/form_part_b_eacea.json) only declares a
 * GLOBAL page limit of 120 pages — it does NOT define per-field char/word
 * limits. Without those, both the compression LLM and the exporter blow past
 * any sensible length and the resulting .docx ends up at 170+ pages with
 * tables that overflow.
 *
 * This module centralises per-field length budgets calibrated so the entire
 * Form Part B lands at ~120 pages (250 words/page ≈ 1.500 chars/page):
 *
 *   Narrative fields (sections 1-3, 5): ~80.000 chars  ≈ 53 pages
 *   Cover + summary:                    ~ 2.500 chars  ≈  2 pages
 *   Tables (staff, risks, WPs, gantt):  variable       ≈ 60-65 pages
 *                                       ─────────────────────────
 *   Total                                              ≈ 115-120 pages
 *
 * Table CELL limits are applied row-by-row so a single overflowing
 * description doesn't blow up the whole table.
 */
'use strict';

/* ── Master switch: enforce length caps in the .docx? ───────────────────
 *
 * Cuando ENFORCE_CAPS es false (default) el render del .docx NO trunca
 * ningún texto — la prioridad es la calidad del contenido. Si la propuesta
 * acaba en 150 páginas, el usuario decide a mano qué recortar.
 *
 * Cambiar a true cuando se quiera enforcement automático del límite EACEA
 * (120 págs) — entonces sí se truncan narrativas y celdas a los caps de
 * abajo.
 *
 * El prompt 06_form_compression sigue indicando los caps como GUÍA al LLM
 * (apuntar a X chars), pero el render no fuerza.
 */
const ENFORCE_CAPS = false;

/* ── Narrative field caps (chars) ───────────────────────────────────────── */
//
// Estos caps actúan como "guía" para el LLM (target de longitud) y como
// referencia visual en la previsualización del formulario. Solo se aplican
// como truncado real cuando ENFORCE_CAPS = true.

const FIELD_CHAR_LIMITS = {
  // Cover / summary
  summary_text:            3_500,   // ~2 págs ejecutivas

  // 1. Relevance (~25-30 pages REAL)
  s1_1_text:              18_000,   // background + objetivos generales
  s1_2_text:              20_000,   // needs analysis + specific objectives (lo más denso)
  s1_3_text:              14_000,   // complementarity + innovation + EU added value

  // 2.1 Project design and implementation (~30 pages REAL)
  s2_1_1_text:            13_000,   // concept + methodology
  s2_1_2_text:            10_000,   // management + QA + monitoring
  s2_1_3_staff_table:      7_000,   // narrativa ABOVE the staff table (intro al equipo)
  s2_1_4_text:             6_000,   // cost-effectiveness (denso pero focal)
  s2_1_5_risk_table:       7_000,   // narrativa ABOVE the risks table

  // 2.2 Consortium (~14 pages REAL)
  s2_2_1_text:            13_000,   // consortium set-up (un párrafo por partner)
  s2_2_2_text:             8_000,   // governance + decision-making

  // 3. Impact (~22 pages REAL)
  s3_1_text:              13_000,   // impact + ambition
  s3_2_text:              10_000,   // communication + dissemination + visibility
  s3_3_text:              10_000,   // sustainability + continuation

  // 4. Work plan overview (the WPs themselves are tables, this is solo el overview)
  s4_1_text:               5_000,

  // 5. Other
  s5_1_text:               4_500,   // ethics (puede ser detallado)
  s5_2_text:               2_500,   // security (corto si N/A)

  // 6. Declarations (mostly checkboxes — only narrative one)
  s6_2_justification:      4_000,
};

const TOTAL_NARRATIVE_CAP = Object.values(FIELD_CHAR_LIMITS).reduce((a, b) => a + b, 0);

/* ── Table cell caps (chars) ────────────────────────────────────────────── */

// Per-cell limits so a single long description doesn't destroy the layout
// but each cell stays informative enough to feed the evaluator. Calibrated
// to push more volume into 4.2 (WP tables) without breaking docx layout.
const TABLE_CELL_LIMITS = {
  // 2.1.3 — Staff
  staff_name_function:  120,
  staff_organisation:   160,
  staff_role_tasks:     700,
  staff_profile:        900,

  // 2.1.5 — Risks
  risk_description:   1_000,
  risk_mitigation:    1_000,
  risk_wp_code:          40,

  // 4.2 — WP general (wp_objectives now carries the FULL Master WP narrative,
  // so the cap is large — see render-form-b.js buildWPs)
  wp_title:             200,
  wp_lead:              200,
  wp_objectives:     10_000,

  // 4.2 — Tasks
  task_name:            240,
  task_description:   1_200,
  task_participant_name: 200,
  task_participant_role: 120,

  // 4.2 — Milestones
  ms_name:              240,
  ms_description:     1_000,
  ms_lead:              200,
  ms_verification:      600,

  // 4.2 — Deliverables
  del_name:             240,
  del_description:    1_200,
  del_lead:             200,
  del_type:             120,
  del_dissemination:    120,

  // Events / mobility
  event_name:           240,
  event_description:    700,
  event_type:           160,
  event_location:       160,
  event_participant:    200,
  event_attendees:      160,

  // EU projects annex
  ep_participant:       240,
  ep_reference:         600,
  ep_role:              200,
  ep_period:             60,
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Truncate text to maxChars, preserving word boundaries, with a footer note.
 * Returns the original text untouched if shorter than the limit.
 */
function truncate(text, maxChars, opts = {}) {
  if (text == null) return '';
  const str = String(text);
  if (!maxChars || str.length <= maxChars) return str;
  // Cut at the last word boundary that fits, then 50 char buffer before the note
  const reserved = opts.reserved || 50;
  const slice = str.slice(0, Math.max(0, maxChars - reserved));
  const lastSpace = slice.lastIndexOf(' ');
  const safeCut = lastSpace > maxChars / 2 ? slice.slice(0, lastSpace) : slice;
  return safeCut.trimEnd() + ' […]';
}

/**
 * Return the char limit for a narrative field id, or null if not defined
 * (caller treats null as "no enforced limit").
 */
function getFieldLimit(fieldId) {
  return FIELD_CHAR_LIMITS[fieldId] || null;
}

/**
 * Apply the per-field cap to a narrative text.
 * NO-OP cuando ENFORCE_CAPS=false (prioridad calidad de contenido).
 */
function capNarrative(fieldId, text) {
  if (!ENFORCE_CAPS) return text || '';
  const limit = getFieldLimit(fieldId);
  return limit ? truncate(text, limit) : (text || '');
}

/**
 * Apply per-cell caps to every row of a table.
 * NO-OP cuando ENFORCE_CAPS=false. Si en algún momento se activa, las
 * descripciones largas se recortan a TABLE_CELL_LIMITS para evitar que
 * una celda destroce el layout (Word no pagina dentro de celdas).
 */
function capTableRows(tableRows) {
  if (!Array.isArray(tableRows)) return tableRows;
  if (!ENFORCE_CAPS) return tableRows;
  return tableRows.map(row => {
    if (!row || typeof row !== 'object') return row;
    const capped = {};
    for (const [key, val] of Object.entries(row)) {
      const limit = TABLE_CELL_LIMITS[key];
      capped[key] = limit ? truncate(val, limit) : val;
    }
    return capped;
  });
}

/**
 * Rough page estimate: 1.500 chars ≈ 1 page (250 words/page · 6 chars/word).
 * Used by the preview UI to show a global page meter.
 */
function estimatePages(text) {
  if (!text) return 0;
  return Math.round(String(text).length / 1500 * 10) / 10; // one decimal
}

module.exports = {
  ENFORCE_CAPS,
  FIELD_CHAR_LIMITS,
  TABLE_CELL_LIMITS,
  TOTAL_NARRATIVE_CAP,
  getFieldLimit,
  capNarrative,
  capTableRows,
  truncate,
  estimatePages,
};
