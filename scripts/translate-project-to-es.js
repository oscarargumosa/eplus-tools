/**
 * Translate every project-scoped textual field of a project to Spanish.
 *
 * Touches ONLY rows that belong to the given project — never modifies org-
 * level data (org_key_staff, organizations, partners.legal_name…) so other
 * projects stay untouched.
 *
 * Usage:
 *   node scripts/translate-project-to-es.js <project_id> [--dry]
 *
 * Strategy:
 *   1. Pull every text field from the project (each becomes a {id, field, text} entry).
 *   2. Group them into batches of ~20 and ask Claude to return a JSON object
 *      whose keys are the entry indexes and values the Spanish translations.
 *   3. Apply UPDATEs per row. Idempotent: re-running it on already-Spanish
 *      text just hands them back unchanged (Claude is told to leave Spanish
 *      content as-is).
 */
'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const { callClaude } = require('../node/src/utils/ai');

const BATCH_SIZE = 6;
const MAX_TOKENS = 16384;

const projectId = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!projectId) {
  console.error('Usage: node scripts/translate-project-to-es.js <project_id> [--dry]');
  process.exit(1);
}

// Each entry describes a SELECT (with id + fields) + an UPDATE template.
// `idCol` is the column name to drive UPDATE WHERE.
const TABLES = [
  {
    table: 'projects', idCol: 'id', fields: ['full_name', 'description'],
    where: `id = ?`, params: [projectId],
  },
  {
    table: 'work_packages', idCol: 'id', fields: ['title', 'summary', 'objectives'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    table: 'activities', idCol: 'id', fields: ['label', 'description'],
    where: `wp_id IN (SELECT id FROM work_packages WHERE project_id = ?)`, params: [projectId],
  },
  {
    table: 'wp_tasks', idCol: 'id', fields: ['title', 'description', 'in_kind_subcontracting'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    table: 'deliverables', idCol: 'id', fields: ['title', 'description', 'rationale', 'kpi'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    table: 'milestones', idCol: 'id', fields: ['title', 'description', 'verification', 'rationale'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    table: 'project_tasks', idCol: 'id', fields: ['title', 'description'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    table: 'intake_contexts', idCol: 'id', fields: ['problem', 'target_groups', 'approach'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    table: 'project_partner_staff', idCol: 'id', fields: ['project_role', 'custom_skills'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    table: 'project_partner_pifs', idCol: 'id', fields: ['custom_text'],
    where: `project_id = ?`, params: [projectId],
  },
  {
    // Writer form fields (Relevance, Implementation, Impact, etc. text values).
    // form_instances binds to project_id; form_field_values holds the answers.
    table: 'form_field_values', idCol: 'id', fields: ['value_text'],
    where: `instance_id IN (SELECT id FROM form_instances WHERE project_id = ?)`,
    params: [projectId],
  },
];

const TRANSLATE_SYSTEM = `You are a professional translator localising European-project documentation into European Spanish (España, formal/professional register suitable for an EACEA/COSME application form).

Rules:
- Keep proper names of organisations, projects, places and people unchanged.
- Keep technical acronyms (KA2, WP1, T1.3, FSTP, SME, COSME, EACEA, etc.) unchanged.
- Preserve formatting: line breaks, bullets, parentheses, colons.
- If a text is ALREADY in Spanish, return it verbatim.
- Do not summarise, do not add introductions, do not embellish — translate faithfully.
- For mixed-language text, translate the parts that are in English/other languages to Spanish.

Input: a JSON object whose keys are arbitrary string ids and whose values are the texts to translate.
Output: a JSON object with the SAME keys and the translated Spanish text as values. JSON only — no markdown fences, no commentary.`;

async function translateBatch(items) {
  const payload = {};
  for (const it of items) payload[it.k] = it.text;
  const user = `Translate every value in this JSON to European Spanish following the rules. Return JSON only:\n\n${JSON.stringify(payload)}`;
  const raw = await callClaude(TRANSLATE_SYSTEM, user, MAX_TOKENS);
  // Strip code fences if Claude added any
  const cleaned = String(raw).replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let obj;
  try { obj = JSON.parse(cleaned); }
  catch (e) {
    console.error('Failed to parse Claude response:', cleaned.slice(0, 500));
    throw e;
  }
  return obj;
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
    charset: 'utf8mb4',
  });

  const work = []; // { table, idCol, id, field, text }
  for (const t of TABLES) {
    const cols = [t.idCol, ...t.fields].join(', ');
    const [rows] = await conn.execute(`SELECT ${cols} FROM ${t.table} WHERE ${t.where}`, t.params);
    for (const r of rows) {
      for (const f of t.fields) {
        const txt = r[f];
        if (txt == null) continue;
        const s = String(txt).trim();
        if (!s) continue;
        if (s.length < 3) continue;          // skip codes, single chars
        if (/^[\d\s.,€%-]+$/.test(s)) continue; // numeric/dates only
        work.push({ table: t.table, idCol: t.idCol, id: r[t.idCol], field: f, text: s });
      }
    }
  }

  console.log(`Collected ${work.length} text values to translate.`);
  if (DRY) {
    const sample = work.slice(0, 8).map(w => `  ${w.table}.${w.field} [${String(w.id).slice(0,8)}]: ${w.text.slice(0,90).replace(/\s+/g,' ')}…`).join('\n');
    console.log('Sample:\n' + sample);
    await conn.end();
    return;
  }

  async function processBatch(batch, label) {
    const items = batch.map((w, idx) => ({ k: String(idx), text: w.text }));
    let translated;
    try { translated = await translateBatch(items); }
    catch (e) {
      // If batch >1 fails, fall back to one-by-one so a single oversized item
      // doesn't kill the whole batch.
      if (batch.length > 1) {
        console.log(`${label} FAILED — retrying items one by one`);
        let ok = 0;
        for (const w of batch) ok += await processBatch([w], '    item');
        return ok;
      }
      console.log(`${label} FAILED (${e.message.slice(0,80)})`);
      return 0;
    }
    let okCount = 0;
    for (let j = 0; j < batch.length; j++) {
      const w = batch[j];
      const t = translated[String(j)];
      if (typeof t !== 'string' || !t.trim()) continue;
      if (t.trim() === w.text.trim()) { okCount++; continue; }
      await conn.execute(
        `UPDATE ${w.table} SET ${w.field} = ? WHERE ${w.idCol} = ?`,
        [t, w.id]
      );
      okCount++;
    }
    console.log(`${label} OK (${okCount}/${batch.length})`);
    return okCount;
  }

  let done = 0;
  for (let i = 0; i < work.length; i += BATCH_SIZE) {
    const batch = work.slice(i, i + BATCH_SIZE);
    const label = `  batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(work.length/BATCH_SIZE)}`;
    done += await processBatch(batch, label);
  }

  console.log(`\nTranslated ${done}/${work.length} fields.`);

  // Reflect the new language in projects.proposal_lang so downstream code
  // (Writer's generateSection, Form Part B exporter's translate layer, etc.)
  // sees the project as Spanish from now on. Without this update, the
  // exporter compares src=old_lang vs target=es and treats them as identical
  // (so it skips translation) — the bug Oscar reported.
  if (!DRY && done > 0) {
    await conn.execute(`UPDATE projects SET proposal_lang = 'es' WHERE id = ?`, [projectId]);
    console.log(`Updated projects.proposal_lang = 'es' for ${projectId}`);
  }

  await conn.end();
}

run().catch(err => { console.error('Translation failed:', err); process.exit(1); });
