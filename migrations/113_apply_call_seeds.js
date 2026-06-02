/**
 * Migration 113: Apply call seeds from data/seed-calls/*.json
 *
 * Loads every JSON in data/seed-calls/ and inserts the call (intake_programs +
 * all child tables) ONLY if it does not already exist in the target DB.
 *
 * Idempotent + safe: detection is by intake_programs.id (UUID). If the call
 * exists (any user could have edited it), the seed is skipped — never
 * overwritten. To force a re-apply, delete the row in intake_programs first.
 *
 * Seeds are generated from a working DB via:
 *   node scripts/dump-call-to-seed.js <program_id-slug>
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SEED_DIR = path.join(__dirname, '..', 'data', 'seed-calls');

// Tables and the column we use as a "exists?" check (PK). Listed in insert order
// to respect FK dependencies (parent -> child).
const INSERT_ORDER = [
  { key: 'program',            table: 'intake_programs',     pk: 'id', wrap: true },  // single row
  { key: 'eligibility',        table: 'call_eligibility',    pk: 'id' },
  { key: 'sections',           table: 'eval_sections',       pk: 'id' },
  { key: 'questions',          table: 'eval_questions',      pk: 'id' },
  { key: 'criteria',           table: 'eval_criteria',       pk: 'id' },
  { key: 'rubric',             table: 'eval_criteria_rubric',pk: 'criterion_id' },
  { key: 'documents',          table: 'call_documents',      pk: 'id' },
  { key: 'document_programs',  table: 'document_programs',   pk: null },              // composite key — INSERT IGNORE
  { key: 'form_templates',     table: 'call_form_templates', pk: 'id' },
  { key: 'form_questions',     table: 'call_form_questions', pk: 'id' },
];

function buildInsert(table, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(',');
  const values = cols.map(c => {
    const v = row[c];
    // mysql2 needs JSON columns serialised
    if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      return JSON.stringify(v);
    }
    return v;
  });
  const sql = `INSERT IGNORE INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES (${placeholders})`;
  return { sql, values };
}

module.exports = async function(conn) {
  if (!fs.existsSync(SEED_DIR)) {
    console.log('[113] no data/seed-calls/ directory — skipping');
    return;
  }
  const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('[113] no JSON seeds found — skipping');
    return;
  }

  for (const file of files) {
    const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), 'utf8'));
    const programId = seed.program?.id;
    const slug = seed.program?.program_id;
    if (!programId || !slug) {
      console.log(`[113] ${file}: invalid seed (no program.id/program_id) — skipping`);
      continue;
    }

    const [existing] = await conn.query('SELECT id FROM intake_programs WHERE id = ?', [programId]);
    if (existing.length > 0) {
      console.log(`[113] ${slug}: already present in DB — skipping (delete intake_programs row to force re-apply)`);
      continue;
    }

    let inserted = 0;
    for (const def of INSERT_ORDER) {
      const rows = seed[def.key];
      if (!rows) continue;
      const list = Array.isArray(rows) ? rows : [rows];
      for (const row of list) {
        const { sql, values } = buildInsert(def.table, row);
        await conn.query(sql, values);
        inserted++;
      }
    }
    console.log(`[113] ${slug}: seeded (${inserted} rows across ${INSERT_ORDER.length} tables)`);
  }
};
