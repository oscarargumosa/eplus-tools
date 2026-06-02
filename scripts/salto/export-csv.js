#!/usr/bin/env node
/**
 * Genera data/salto/trainings.csv a partir del JSON enriquecido.
 * Sin fetches — solo I/O local.
 */
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', '..', 'data', 'salto', 'trainings.json');
const outputPath = path.join(__dirname, '..', '..', 'data', 'salto', 'trainings.csv');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const cols = [
  'salto_id', 'type', 'title', 'dates', 'city', 'country',
  'deadline_iso', 'selection_date',
  'fee_type', 'fee_amount_eur', 'fee_text',
  'participants_count', 'participants_countries', 'working_languages',
  'organiser_name', 'organiser_type',
  'application_url', 'short_url', 'url',
  'accommodation_food_text', 'travel_reimbursement_text',
  'summary',
];

const escape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

const lines = [cols.join(',')];
for (const it of data.items) lines.push(cols.map((c) => escape(it[c])).join(','));
fs.writeFileSync(outputPath, lines.join('\n') + '\n');
console.log(`[csv] wrote ${outputPath} · ${data.items.length} rows · ${cols.length} cols`);
