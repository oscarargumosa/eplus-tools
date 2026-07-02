#!/usr/bin/env node
/**
 * Re-clasifica fee_type sobre el JSON existente (sin nuevos fetches).
 * Útil tras ajustar la heurística en enrich-details.js.
 */
const fs = require('fs');
const path = require('path');
const { classifyFee } = require('./_classify-fee');

const inputPath = path.join(__dirname, '..', '..', 'data', 'salto', 'trainings.json');
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

let changed = 0;
for (const item of data.items) {
  if (!item.fee_text && item.fee_type === undefined) continue;
  const before = item.fee_type;
  const { fee_type, fee_amount_eur } = classifyFee(item.fee_text);
  if (before !== fee_type) {
    changed += 1;
    item.fee_type = fee_type;
    item.fee_amount_eur = fee_amount_eur;
  }
}

fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
const dist = {};
for (const i of data.items) dist[i.fee_type || 'not_enriched'] = (dist[i.fee_type || 'not_enriched'] || 0) + 1;
console.log(`[reclassify] changed=${changed}`);
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)}${v}`);
