/**
 * One-off local runner: applies 119 (eval tree) then 120 (full criteria) for KA220-YOU
 * and prints verification counts. Safe to re-run (119 self-skips, 120 replaces).
 *   node scripts/run-ka220-criteria.js
 */
require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  for (const f of ['119_seed_ka220_you_eval.js', '120_seed_ka220_you_criteria_full.js']) {
    console.log(`Running ${f}...`);
    const fn = require(path.join(__dirname, '..', 'migrations', f));
    await fn(conn);
  }

  // Verify
  const [[prog]] = await conn.query(
    "SELECT id FROM intake_programs WHERE action_type='KA220-YOU' OR program_id='new_1780385232134' LIMIT 1"
  );
  if (prog) {
    const [[c]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM eval_sections s WHERE s.program_id=?) AS sections,
         (SELECT COUNT(*) FROM eval_questions q JOIN eval_sections s ON q.section_id=s.id WHERE s.program_id=?) AS questions,
         (SELECT COUNT(*) FROM eval_questions q JOIN eval_sections s ON q.section_id=s.id WHERE s.program_id=? AND q.general_context IS NOT NULL) AS questions_with_partA,
         (SELECT COUNT(*) FROM eval_criteria c JOIN eval_questions q ON c.question_id=q.id JOIN eval_sections s ON q.section_id=s.id WHERE s.program_id=?) AS criteria
      `,
      [prog.id, prog.id, prog.id, prog.id]
    );
    console.log('VERIFY:', JSON.stringify(c));
  }
  await conn.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
