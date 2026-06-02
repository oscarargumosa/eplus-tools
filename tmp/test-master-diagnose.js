#!/usr/bin/env node
/* Test E2E del endpoint diagnose (initial o advanced) */

require('dotenv').config();
const path = require('path');
const pool = require(path.join(__dirname, '..', 'node', 'src', 'utils', 'db'));
const cag = require(path.join(__dirname, '..', 'node', 'src', 'modules', 'master', 'cag-pipeline'));
const developerModel = require(path.join(__dirname, '..', 'node', 'src', 'modules', 'developer', 'model'));
const genUUID = require(path.join(__dirname, '..', 'node', 'src', 'utils', 'uuid'));
const fs = require('fs');

const SUSTRAI_ID = '11373f08-a611-4ce7-9249-fa81b588a18e';
const OSCAR_USER_ID = 'b9150dd3-ebe1-4583-baf9-eacef3a7a666';
const TEST_MASTER_ID = '25435123-f6d8-4966-a500-7828cfa720a3'; // master ready del test anterior

async function getBudgetUsed() {
  const [rows] = await pool.query(`
    SELECT COALESCE(SUM(tokens_in)*3/1000000 + SUM(tokens_out)*15/1000000, 0) AS usd
    FROM ai_usage_log WHERE created_at > '2026-05-15 21:00:00' AND status='success' AND model LIKE 'claude%'`);
  return Number(rows[0].usd);
}

async function main() {
  const kind = process.argv[2] || 'initial';
  console.log(`═══ Test Diagnose (${kind}) ═══`);

  const budget = await getBudgetUsed();
  console.log(`Budget acumulado (naive): $${budget.toFixed(2)}`);

  const [chRows] = await pool.query(
    `SELECT title, body FROM master_chapters WHERE master_doc_id=? ORDER BY sort_order`,
    [TEST_MASTER_ID]
  );
  console.log(`Capítulos en master: ${chRows.length}`);
  const masterText = chRows.map(c => `## ${c.title}\n\n${c.body || ''}`).join('\n\n---\n\n');
  console.log(`Master text total: ${masterText.length} chars`);

  const designSnapshot = await developerModel.buildEnrichedContext(SUSTRAI_ID, OSCAR_USER_ID);
  console.log(`Design snapshot: ${designSnapshot.length} chars`);

  const [evalRows] = await pool.query(
    `SELECT es.code, es.title, es.max_score, eq.code AS q_code, eq.title AS q_title
     FROM projects p
     LEFT JOIN eval_sections es ON es.programme_id = p.program_id
     LEFT JOIN eval_questions eq ON eq.section_id = es.id
     WHERE p.id = ? ORDER BY es.code, eq.code`,
    [SUSTRAI_ID]
  ).catch(() => [[]]);
  const criteria = evalRows.length
    ? evalRows.map(r => `${r.code} ${r.title} (max ${r.max_score})${r.q_code ? `\n  - ${r.q_code} ${r.q_title}` : ''}`).join('\n')
    : 'Use general EU evaluation patterns (Relevance, Quality, Impact, Partnership).';

  const promptKey = kind === 'initial' ? '02_diagnosis_initial' : '04_diagnosis_advanced';

  console.log(`Calling LLM with ${promptKey}...`);
  const t0 = Date.now();
  const result = await cag.runPrompt(promptKey, {
    call_code: '',
    criteria,
    master_document: masterText,
    design_snapshot: designSnapshot,
  }, {
    maxTokens: 12000,
    temperature: 0.3,
    ctx: { projectId: SUSTRAI_ID, userId: OSCAR_USER_ID },
    endpoint: `test:diagnose:${kind}`,
  });
  const ms = Date.now() - t0;

  console.log(`Duration: ${(ms/1000).toFixed(1)}s · cost: $${result.costUsd.toFixed(3)} · cache_read: ${result.usage?.cache_read_input_tokens || 0}`);

  // Persistir raw
  const rawPath = path.join(__dirname, `diagnose_${kind}_${Date.now()}.txt`);
  fs.writeFileSync(rawPath, result.text || '', 'utf8');
  console.log(`Raw saved: ${rawPath}`);

  if (!result.parsed) {
    console.error(`✗ Parse fail. Raw text preview: ${(result.text || '').substring(0, 400)}`);
    process.exit(1);
  }

  // Parser tolerante: items[] o narrative+economic[]
  let items = [];
  if (Array.isArray(result.parsed.items)) items = result.parsed.items;
  else if (Array.isArray(result.parsed.narrative) || Array.isArray(result.parsed.economic)) {
    items = [
      ...(result.parsed.narrative || []).map(x => ({ ...x, classification: 'narrative' })),
      ...(result.parsed.economic || []).map(x => ({ ...x, classification: 'economic' })),
    ];
  } else if (Array.isArray(result.parsed)) items = result.parsed;

  console.log(`\n✓ Parsed JSON:`);
  console.log(`  summary: ${result.parsed.summary ? '"' + result.parsed.summary.substring(0,200) + '..."' : 'N/A'}`);
  console.log(`  items: ${items.length}`);
  const narrative = items.filter(i => i.classification === 'narrative');
  const economic = items.filter(i => i.classification === 'economic');
  console.log(`    narrative: ${narrative.length}`);
  console.log(`    economic:  ${economic.length}`);
  console.log(`\nFirst 3 items:`);
  for (let i = 0; i < Math.min(3, items.length); i++) {
    const it = items[i];
    console.log(`  [${it.classification}/${it.severity}] ${it.title}`);
    if (it.detail) console.log(`    ${it.detail.substring(0, 150)}...`);
  }

  const budgetFinal = await getBudgetUsed();
  console.log(`\nBudget acumulado (naive): $${budgetFinal.toFixed(2)}`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
