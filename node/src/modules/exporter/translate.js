/**
 * Form Part B export translation layer.
 *
 * Traduce in-place todo el contenido narrativo y de tablas del ctx que pasa
 * `loadFormBContext` → `renderFormBDocx`, de forma que el .docx final salga
 * en `targetLang` aunque el proyecto se haya escrito en `srcLang`.
 *
 * Phase 1: solo traduce los textos producidos por el usuario / IA. Las
 * cabeceras estructurales del template (`Work Package`, `Deliverables`,
 * `Risk Level`, …) viven empotradas en el .docx y se mantienen en inglés.
 * Multi-template multi-idioma queda fuera de scope.
 */
'use strict';

const { callClaude } = require('../../utils/ai');
const { extractJson } = require('../master/anthropic-client');

const LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ro: 'Romanian', el: 'Greek',
  cs: 'Czech', da: 'Danish', fi: 'Finnish', sv: 'Swedish', hu: 'Hungarian',
  bg: 'Bulgarian', hr: 'Croatian', sk: 'Slovak', sl: 'Slovenian', et: 'Estonian',
  lv: 'Latvian', lt: 'Lithuanian', is: 'Icelandic', no: 'Norwegian', sr: 'Serbian',
  tr: 'Turkish', mt: 'Maltese', ga: 'Irish', sq: 'Albanian', mk: 'Macedonian',
};

function langName(code) {
  return LANG_NAMES[(code || '').toLowerCase()] || code || 'English';
}

/* ── Recolección de strings ─────────────────────────────────────
   Construimos un mapa plano { key → text } con todo lo traducible.
   Las keys son punteros (string-paths) que luego sabemos volver a
   asignar en `applyTranslations`. Mantenemos los strings tal cual
   (incluido el markdown). */

function collectStrings(ctx) {
  const out = {};
  const push = (key, val) => {
    if (typeof val === 'string' && val.trim()) out[key] = val;
  };

  // Narrative writer fields (form_field_values)
  if (ctx.writer && typeof ctx.writer === 'object') {
    for (const [fid, val] of Object.entries(ctx.writer)) {
      push(`writer.${fid}`, val);
    }
  }

  // Intake context
  if (ctx.context) {
    push('context.problem', ctx.context.problem);
    push('context.target_groups', ctx.context.target_groups);
    push('context.approach', ctx.context.approach);
  }

  // Work packages + nested
  (ctx.wps || []).forEach((wp, i) => {
    push(`wp.${i}.title`, wp.title);
    push(`wp.${i}.summary`, wp.summary);
    push(`wp.${i}.objectives`, wp.objectives);
    push(`wp.${i}.writerText`, wp.writerText);
    push(`wp.${i}.masterNarrative`, wp.masterNarrative);
    (wp.tasks || []).forEach((t, j) => {
      push(`wp.${i}.tasks.${j}.title`, t.title);
      push(`wp.${i}.tasks.${j}.description`, t.description);
    });
    (wp.deliverables || []).forEach((d, j) => {
      push(`wp.${i}.deliverables.${j}.title`, d.title);
      push(`wp.${i}.deliverables.${j}.description`, d.description);
      push(`wp.${i}.deliverables.${j}.rationale`, d.rationale);
    });
    (wp.milestones || []).forEach((m, j) => {
      push(`wp.${i}.milestones.${j}.title`, m.title);
      push(`wp.${i}.milestones.${j}.description`, m.description);
      push(`wp.${i}.milestones.${j}.verification`, m.verification);
    });
    (wp.activities || []).forEach((a, j) => {
      push(`wp.${i}.activities.${j}.label`, a.label);
      push(`wp.${i}.activities.${j}.description`, a.description);
    });
  });

  // Activities (flat fallback — algunas no están bajo wp.activities)
  (ctx.activities || []).forEach((a, i) => {
    push(`activity.${i}.label`, a.label);
    push(`activity.${i}.description`, a.description);
  });

  // Standalone deliverables/milestones tables
  (ctx.deliverables || []).forEach((d, i) => {
    push(`deliverable.${i}.title`, d.title);
    push(`deliverable.${i}.description`, d.description);
    push(`deliverable.${i}.rationale`, d.rationale);
  });
  (ctx.milestones || []).forEach((m, i) => {
    push(`milestone.${i}.title`, m.title);
    push(`milestone.${i}.description`, m.description);
    push(`milestone.${i}.verification`, m.verification);
  });

  // Risks
  (ctx.risks || []).forEach((r, i) => {
    push(`risk.${i}.description`, r.description);
    push(`risk.${i}.mitigation`, r.mitigation);
  });

  // Selected staff (los bios/roles que se inyectan en la tabla)
  (ctx.selectedStaff || []).forEach((s, i) => {
    push(`staff.${i}.project_role`, s.project_role);
    push(`staff.${i}.custom_skills`, s.custom_skills);
    push(`staff.${i}.directory_role`, s.directory_role);
    push(`staff.${i}.directory_bio`, s.directory_bio);
  });

  return out;
}

/* ── Aplicación en sitio ─────────────────────────────────────── */

function setByPath(ctx, path, value) {
  // path = "wp.3.tasks.1.description" → ctx.wps[3].tasks[1].description
  const parts = path.split('.');
  const root = parts.shift();
  let node;
  if (root === 'writer') {
    if (!ctx.writer) ctx.writer = {};
    ctx.writer[parts.join('.')] = value;
    return;
  }
  if (root === 'context') { ctx.context = ctx.context || {}; ctx.context[parts[0]] = value; return; }
  if (root === 'wp') {
    const i = Number(parts.shift());
    node = (ctx.wps || [])[i];
  } else if (root === 'activity') {
    node = (ctx.activities || [])[Number(parts.shift())];
  } else if (root === 'deliverable') {
    node = (ctx.deliverables || [])[Number(parts.shift())];
  } else if (root === 'milestone') {
    node = (ctx.milestones || [])[Number(parts.shift())];
  } else if (root === 'risk') {
    node = (ctx.risks || [])[Number(parts.shift())];
  } else if (root === 'staff') {
    node = (ctx.selectedStaff || [])[Number(parts.shift())];
  }
  if (!node) return;
  // Walk remaining parts (arrays interleaved with field name)
  while (parts.length > 1) {
    const key = parts.shift();
    const next = node[key];
    if (Array.isArray(next)) {
      const idx = Number(parts.shift());
      node = next[idx];
    } else {
      node = next;
    }
    if (!node) return;
  }
  node[parts[0]] = value;
}

function applyTranslations(ctx, translations) {
  for (const [path, value] of Object.entries(translations)) {
    if (typeof value !== 'string') continue;
    setByPath(ctx, path, value);
  }
}

/* ── Llamada al LLM ─────────────────────────────────────────── */

function buildSystemPrompt(srcLang, targetLang) {
  return `You are a professional translator specialized in Erasmus+ proposals for the European Commission.

Translate the provided JSON object from ${langName(srcLang)} to ${langName(targetLang)}.

CRITICAL RULES:
1. Return ONLY a single JSON object with EXACTLY the same keys as the input. Do not add, remove, or rename keys.
2. Translate every string VALUE to ${langName(targetLang)}.
3. Preserve markdown formatting (** bold **, * italics *, # headings, bullet points, numbered lists, line breaks).
4. Preserve numerical figures, percentages, EUR amounts, dates, codes (e.g. "WP3", "T2.1", "D1.2"), OIDs (9-digit numbers), PICs, VATs, URLs, and email addresses verbatim.
5. Keep proper nouns (organization names, project acronyms, person names, city names) untranslated UNLESS they have a canonical translated form (e.g. country names).
6. Keep technical Erasmus+ jargon recognizable: "Work Package", "Deliverable", "Milestone", "consortium", "lump sum" can be translated to their idiomatic equivalent in the target language.
7. For empty strings or strings with only whitespace, return them unchanged.
8. Do NOT wrap the response in markdown code fences. Output raw JSON.
9. Do NOT add any prose, prefix or suffix — just the JSON.`;
}

/**
 * Translate ctx in place. Returns { translated, skipped, costUsd }.
 * If `srcLang === targetLang` or either is missing, returns immediately.
 */
async function translateContext(ctx, srcLang, targetLang) {
  if (!srcLang || !targetLang) return { translated: 0, skipped: 'missing-lang' };
  if (srcLang.toLowerCase() === targetLang.toLowerCase()) return { translated: 0, skipped: 'same-lang' };

  const strings = collectStrings(ctx);
  const keys = Object.keys(strings);
  if (!keys.length) return { translated: 0, skipped: 'empty' };

  // Heurística: si el payload es > ~80k chars, partimos en chunks de ≤80k.
  const CHUNK_CHAR_BUDGET = 80_000;
  const chunks = [];
  let current = {};
  let currentSize = 0;
  for (const k of keys) {
    const v = strings[k];
    const size = (v || '').length + k.length + 5;
    if (currentSize + size > CHUNK_CHAR_BUDGET && Object.keys(current).length) {
      chunks.push(current);
      current = {};
      currentSize = 0;
    }
    current[k] = v;
    currentSize += size;
  }
  if (Object.keys(current).length) chunks.push(current);

  const system = buildSystemPrompt(srcLang, targetLang);
  let total = 0;

  for (const chunk of chunks) {
    const userPrompt = JSON.stringify(chunk, null, 2);
    // max_tokens grande porque la salida es del mismo orden que la entrada.
    // ai.js usa el SDK normal; max 8192 = ~6k palabras por chunk. Suficiente
    // dado que cada chunk de input ≤ 80k chars ≈ 23k tokens y la traducción
    // suele tener un ratio similar (~+15%).
    const maxTokens = 8192;
    const raw = await callClaude(system, userPrompt, maxTokens);
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[exporter/translate] LLM returned invalid JSON, skipping chunk of', Object.keys(chunk).length, 'keys');
      continue;
    }
    applyTranslations(ctx, parsed);
    total += Object.keys(parsed).length;
  }

  return { translated: total, chunks: chunks.length };
}

module.exports = {
  translateContext,
  collectStrings,
  applyTranslations,
  langName,
};
