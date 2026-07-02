/**
 * dump-call-to-seed.js
 *
 * Exports a call (intake_programs + child tables) from local MySQL to
 * data/seed-calls/<slug>.json so it can be replayed on any environment
 * (live, staging, fresh install) via migration 110_apply_call_seeds.js.
 *
 * Usage:
 *   node scripts/dump-call-to-seed.js <program_id-slug>
 *   node scripts/dump-call-to-seed.js new_1778741001125
 *
 * Output: data/seed-calls/<slug>.json (overwrites if exists)
 *
 * Includes: intake_programs · call_eligibility · eval_sections · eval_questions
 *           · eval_criteria · eval_criteria_rubric · call_documents (metadata only)
 *           · call_form_templates · call_form_questions · document_programs
 * Excludes: PDF binaries on disk · evaluation_findings/letters · form_instances · budget_projects
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node scripts/dump-call-to-seed.js <program_id-slug>');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
  });

  const [progRows] = await conn.query('SELECT * FROM intake_programs WHERE program_id = ?', [slug]);
  if (progRows.length === 0) {
    console.error(`No intake_programs row with program_id='${slug}'`);
    process.exit(1);
  }
  const program = progRows[0];
  const pid = program.id;
  console.log(`Found call: ${program.name} (id=${pid})`);

  const [eligibility] = await conn.query('SELECT * FROM call_eligibility WHERE program_id = ?', [pid]);
  const [sections] = await conn.query('SELECT * FROM eval_sections WHERE program_id = ? ORDER BY sort_order, id', [pid]);
  const sectionIds = sections.map(s => s.id);
  const [questions] = sectionIds.length
    ? await conn.query('SELECT * FROM eval_questions WHERE section_id IN (?) ORDER BY sort_order, id', [sectionIds])
    : [[]];
  const questionIds = questions.map(q => q.id);
  const [criteria] = questionIds.length
    ? await conn.query('SELECT * FROM eval_criteria WHERE question_id IN (?) ORDER BY sort_order, id', [questionIds])
    : [[]];
  const criterionIds = criteria.map(c => c.id);
  const [rubric] = criterionIds.length
    ? await conn.query('SELECT * FROM eval_criteria_rubric WHERE criterion_id IN (?) ORDER BY criterion_id', [criterionIds])
    : [[]];

  const [documents] = await conn.query('SELECT * FROM call_documents WHERE program_id = ?', [pid]);
  const [docPrograms] = await conn.query('SELECT * FROM document_programs WHERE program_id = ?', [pid]);

  const [formTemplates] = await conn.query('SELECT * FROM call_form_templates WHERE call_id = ?', [pid]);
  const formTemplateIds = formTemplates.map(t => t.id);
  const [formQuestions] = formTemplateIds.length
    ? await conn.query('SELECT * FROM call_form_questions WHERE form_template_id IN (?) ORDER BY id', [formTemplateIds])
    : [[]];

  const out = {
    _meta: {
      dumped_at: new Date().toISOString(),
      source_program_id_slug: slug,
      source_id: pid,
      counts: {
        eligibility: eligibility.length,
        sections: sections.length,
        questions: questions.length,
        criteria: criteria.length,
        rubric: rubric.length,
        documents: documents.length,
        document_programs: docPrograms.length,
        form_templates: formTemplates.length,
        form_questions: formQuestions.length,
      },
    },
    program,
    eligibility,
    sections,
    questions,
    criteria,
    rubric,
    documents,
    document_programs: docPrograms,
    form_templates: formTemplates,
    form_questions: formQuestions,
  };

  const outDir = path.join(__dirname, '..', 'data', 'seed-calls');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log('Counts:', out._meta.counts);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
