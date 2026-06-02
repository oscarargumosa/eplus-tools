/**
 * Regenerate every Writer section of a project, in order, with cumulative
 * context. Each section sees all previously-written sections (via
 * model.getPreviousSections inside generateSection), so the narrative stays
 * coherent and the AI avoids repeating itself.
 *
 * Usage:
 *   node scripts/regenerate-writer.js <project_id> [--dry] [--only=summary_text,s1_1_text]
 */
'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const model = require('../node/src/modules/developer/model');

const projectId = process.argv[2];
const DRY = process.argv.includes('--dry');
const onlyArg = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const ONLY = onlyArg ? new Set(onlyArg.split(',').map(s => s.trim()).filter(Boolean)) : null;

if (!projectId) {
  console.error('Usage: node scripts/regenerate-writer.js <project_id> [--dry] [--only=s1_1_text,...]');
  process.exit(1);
}

const ORDER = [
  'summary_text',
  's1_1_text', 's1_2_text', 's1_3_text',
  's2_1_1_text', 's2_1_2_text', 's2_1_4_text',
  's2_2_1_text', 's2_2_2_text',
  's3_1_text', 's3_2_text', 's3_3_text',
  's4_1_text',
  // s4_2_text + per-WP sections are appended after we know the WP ids.
  's5_1_text', 's5_2_text',
];

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
    charset: 'utf8mb4',
  });

  // 1. Locate the Writer instance + user for this project.
  const [insts] = await conn.execute(
    `SELECT id, user_id, program_id FROM form_instances WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [projectId]
  );
  if (!insts.length) { console.error('No form_instances for this project — open Writer first.'); process.exit(2); }
  const instance = insts[0];
  console.log(`Writer instance: ${instance.id}  user=${instance.user_id}  program=${instance.program_id || '(none)'}`);

  // 2. Resolve coordinator name + WPs (for per-WP sections).
  const [partners] = await conn.execute(
    `SELECT name FROM partners WHERE project_id = ? AND role = 'applicant' ORDER BY order_index LIMIT 1`,
    [projectId]
  );
  const coordName = partners[0]?.name || 'the lead organisation';

  const [wps] = await conn.execute(
    `SELECT id, code, title FROM work_packages WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );
  const wpSectionIds = wps.map(w => `s4_2_wp_${w.id}`);
  console.log(`Coordinator: ${coordName}`);
  console.log(`Work packages: ${wps.map(w => w.code).join(', ')}`);

  // 3. Final ordered list (insert s4_2_text + per-WP sections between s4_1 and s5_1).
  const fullOrder = [...ORDER];
  const s41Idx = fullOrder.indexOf('s4_1_text');
  fullOrder.splice(s41Idx + 1, 0, 's4_2_text', ...wpSectionIds);

  const sections = ONLY ? fullOrder.filter(s => ONLY.has(s)) : fullOrder;
  console.log(`Plan: ${sections.length} sections in order:\n  ${sections.join('\n  ')}`);

  if (DRY) {
    console.log('\n(dry-run — no AI calls, no writes)');
    await conn.end();
    return;
  }

  // 4. Build enriched context ONCE. generateSection re-reads previous saved
  //    sections from the DB on every call via getPreviousSections, so as long
  //    as we save after each generation the next iteration sees them.
  console.log('\nBuilding enriched project context…');
  const projectContext = await model.buildEnrichedContext(projectId, instance.user_id);
  console.log(`Context built: ${projectContext.length} chars`);

  // 5. Mark instance as in_progress.
  try { await model.updateInstanceStatus(instance.id, instance.user_id, 'in_progress'); }
  catch (e) { /* ignore */ }

  // 6. Iterate.
  let ok = 0;
  const t0 = Date.now();
  for (let i = 0; i < sections.length; i++) {
    const sid = sections[i];
    const t1 = Date.now();
    process.stdout.write(`  [${i+1}/${sections.length}] ${sid} … `);
    try {
      const text = await model.generateSection(instance.id, sid, projectContext, instance.program_id, coordName);
      if (!text || text.length < 50) { console.log(`SHORT (${text?.length || 0} chars) — keeping previous`); continue; }
      await model.saveFieldValue(instance.id, sid, '', text, null);
      const words = text.split(/\s+/).length;
      console.log(`OK (${words}w, ${Math.round((Date.now()-t1)/1000)}s)`);
      ok++;
    } catch (e) {
      console.log(`FAILED — ${e.message.slice(0, 120)}`);
    }
  }
  const totalMin = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nDone: ${ok}/${sections.length} sections regenerated in ${totalMin} min.`);

  await conn.end();
  // model.js holds open DB pools — let the process exit cleanly.
  process.exit(0);
}

run().catch(err => { console.error('Regen failed:', err); process.exit(1); });
