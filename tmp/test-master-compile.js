#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Test E2E autónomo del compile-v1 del Master
   ═══════════════════════════════════════════════════════════════
   Llama directamente al controller en vez de via HTTP para evitar
   complicaciones de auth. Mide tokens, coste con cache, tiempo.
   Para a los $9 USD para no superar el budget €10.

   Uso:
     node tmp/test-master-compile.js <project_id> [--max-usd=9] [--chapters=10]

   Si project_id es 'sustrai', usa el id de SUSTRAI hardcoded.
   ═══════════════════════════════════════════════════════════════ */

require('dotenv').config();
const path = require('path');
const pool = require(path.join(__dirname, '..', 'node', 'src', 'utils', 'db'));
const model = require(path.join(__dirname, '..', 'node', 'src', 'modules', 'master', 'model'));
const cag = require(path.join(__dirname, '..', 'node', 'src', 'modules', 'master', 'cag-pipeline'));
const developerModel = require(path.join(__dirname, '..', 'node', 'src', 'modules', 'developer', 'model'));
const genUUID = require(path.join(__dirname, '..', 'node', 'src', 'utils', 'uuid'));
const fs = require('fs');

const SUSTRAI_ID = '11373f08-a611-4ce7-9249-fa81b588a18e';
const OSCAR_USER_ID = 'b9150dd3-ebe1-4583-baf9-eacef3a7a666';

const CHAPTER_PLAN = [
  { key: 'ch_1_executive_summary', type: 'summary', title: 'Resumen Ejecutivo',
    focus: 'High-level overview of the whole project: what it does, why it matters, with whom, and what change it produces. Should read as a self-contained 2-page executive briefing.' },
  { key: 'ch_2_relevance', type: 'qa', title: 'Por qué este proyecto: contexto, problema, necesidades, grupos objetivo',
    focus: 'Establish the problem with evidence; describe target groups concretely; connect to EU and call priorities. The "why this, why now, why us".' },
  { key: 'ch_3_approach', type: 'qa', title: 'Enfoque y metodología',
    focus: 'How the project will operate: theory of change, methodology, design principles, innovation. Distinct from work packages — this is the HOW at a conceptual level.' },
  { key: 'ch_4_wps', type: 'wp', title: 'Paquetes de Trabajo — desarrollo narrativo completo',
    focus: 'Each WP developed in narrative form: objectives, activities, tasks, deliverables, milestones, responsible partner, timeline.' },
  { key: 'ch_5_consortium', type: 'partner', title: 'Consorcio: capacidad y rol de cada partner',
    focus: 'One section per partner explaining role, capacity, prior EU experience, key staff justification, and complementarity.' },
  { key: 'ch_6_impact', type: 'impact', title: 'Impacto esperado y difusión',
    focus: 'Concrete expected impact on target groups, sector, territory and EU policy. Quantitative KPIs where possible.' },
  { key: 'ch_7_sustainability', type: 'qa', title: 'Sostenibilidad y explotación post-proyecto',
    focus: 'What happens after M48. Who owns the outputs, who maintains them, financial sustainability.' },
  { key: 'ch_8_budget', type: 'budget', title: 'Justificación narrativa del presupuesto',
    focus: 'Qualitative rationale of why each major budget area exists at the scale it does. Cost-effectiveness arguments.' },
  { key: 'ch_9_quality', type: 'qa', title: 'Aseguramiento de calidad y gestión de riesgos',
    focus: 'Quality control mechanisms, monitoring, evaluation, risk register with mitigation.' },
  { key: 'ch_10_alignment', type: 'qa', title: 'Alineación estratégica con prioridades UE',
    focus: 'Map the project explicitly to call priorities and to relevant EU strategies (Farm to Fork, Green Deal, etc.).' },
];

function parseArgs() {
  const args = { project: 'sustrai', maxUsd: 9, chapters: 10, dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--max-usd=')) args.maxUsd = parseFloat(a.split('=')[1]);
    else if (a.startsWith('--chapters=')) args.chapters = parseInt(a.split('=')[1], 10);
    else if (!a.startsWith('--')) args.project = a;
  }
  return args;
}

async function getBudgetUsed() {
  const [rows] = await pool.query(`
    SELECT
      COALESCE(SUM(tokens_in) * 3 / 1000000 + SUM(tokens_out) * 15 / 1000000, 0) AS usd
    FROM ai_usage_log
    WHERE created_at > '2026-05-15 21:00:00' AND status='success' AND model LIKE 'claude%'
  `);
  return Number(rows[0].usd);
}

async function buildVars(projectId, userId) {
  const enriched_context = await developerModel.buildEnrichedContext(projectId, userId);

  const [interviewRows] = await pool.query(
    `SELECT question_text, answer_text, tab FROM writer_interviews
     WHERE project_id = ? AND answer_text IS NOT NULL AND LENGTH(answer_text) > 10
     ORDER BY tab, sort_order`,
    [projectId]
  );
  const interviews = interviewRows.length
    ? interviewRows.map(r => `[${(r.tab || 'general').toUpperCase()}]\nQ: ${r.question_text}\nA: ${r.answer_text}`).join('\n\n')
    : '(no interviews yet)';

  const [writerRows] = await pool.query(
    `SELECT ws.section_id, ws.body
     FROM writer_sections ws
     JOIN form_instances fi ON fi.id = ws.instance_id
     WHERE fi.project_id = ?
     ORDER BY ws.section_id`,
    [projectId]
  ).catch(() => [[]]);
  const writer_draft = writerRows.length
    ? writerRows.map(r => `=== ${r.section_id} ===\n${r.body || ''}`).join('\n\n')
    : '(no writer draft yet)';

  const [evalRows] = await pool.query(
    `SELECT es.code, es.title, es.max_score, eq.code AS q_code, eq.title AS q_title
     FROM projects p
     LEFT JOIN eval_sections es ON es.programme_id = p.program_id
     LEFT JOIN eval_questions eq ON eq.section_id = es.id
     WHERE p.id = ?
     ORDER BY es.code, eq.code`,
    [projectId]
  ).catch(() => [[]]);
  const criteria = evalRows.length
    ? evalRows.map(r => `${r.code} ${r.title} (max ${r.max_score})${r.q_code ? `\n  - ${r.q_code} ${r.q_title}` : ''}`).join('\n')
    : 'Use general EU evaluation patterns (Relevance, Quality, Impact, Partnership).';

  return { call_code: '', criteria, enriched_context, writer_draft, interviews };
}

async function main() {
  const args = parseArgs();
  const projectId = args.project === 'sustrai' ? SUSTRAI_ID : args.project;

  console.log('═══ Test E2E Master Compile ═══');
  console.log(`Project:      ${projectId}`);
  console.log(`Max USD:      ${args.maxUsd}`);
  console.log(`Chapters:     ${args.chapters} / ${CHAPTER_PLAN.length}`);
  console.log(`Dry-run:      ${args.dryRun}`);

  const initialBudget = await getBudgetUsed();
  console.log(`Budget usado hasta ahora: $${initialBudget.toFixed(2)}`);
  if (initialBudget >= args.maxUsd) {
    console.error(`✗ Budget agotado ($${initialBudget.toFixed(2)} ≥ $${args.maxUsd}). Aborto.`);
    process.exit(1);
  }
  console.log(`Budget restante: $${(args.maxUsd - initialBudget).toFixed(2)}`);
  console.log('');

  // Crear Master draft nuevo para test (NO sobrescribir el de SUSTRAI live)
  const masterDocId = genUUID();
  await pool.query(
    `INSERT INTO master_documents (id, project_id, version_tag, version_label, status, language)
     VALUES (?, ?, ?, ?, 'compiling', 'es')`,
    [masterDocId, projectId, 'test_v1', `Test nocturno ${new Date().toISOString().substring(0,19)}`]
  );
  console.log(`Master test creado: ${masterDocId}`);

  const vars = await buildVars(projectId, OSCAR_USER_ID);
  console.log(`enriched_context: ${vars.enriched_context.length} chars`);
  console.log(`writer_draft: ${vars.writer_draft.length} chars`);
  console.log(`interviews: ${vars.interviews.length} chars`);
  console.log(`criteria: ${vars.criteria.length} chars`);
  console.log('');

  if (args.dryRun) {
    console.log('DRY-RUN: cálculo de coste estimado (sin llamar al LLM)');
    const preview = cag.dryRun('01b_compile_single_chapter', {
      ...vars,
      chapter_key: 'ch_1_executive_summary',
      chapter_type: 'summary',
      chapter_title: 'Resumen Ejecutivo',
      chapter_focus: '...',
      previous_chapters_summary: '(none yet)',
    }, { maxTokens: 8000 });
    console.log(JSON.stringify(preview, null, 2));
    process.exit(0);
  }

  const previousSummaries = [];
  let totalChars = 0, totalCost = 0, totalDuration = 0;
  let cacheHits = 0, cacheMisses = 0;

  const limit = Math.min(args.chapters, CHAPTER_PLAN.length);
  for (let i = 0; i < limit; i++) {
    const ch = CHAPTER_PLAN[i];
    console.log(`▶ [${i + 1}/${limit}] ${ch.key} — ${ch.title}`);

    const budgetNow = await getBudgetUsed();
    if (budgetNow >= args.maxUsd) {
      console.error(`✗ Budget agotado en cap ${i + 1}. Stop. Total gastado: $${budgetNow.toFixed(2)}`);
      break;
    }

    const previous_chapters_summary = previousSummaries.length
      ? previousSummaries.map((p, j) => `[${j + 1}] ${p.title}\n${(p.body || '').substring(0, 200)}...`).join('\n\n')
      : '(none yet — this is the first chapter)';

    try {
      const t0 = Date.now();
      const result = await cag.runPrompt('01b_compile_single_chapter', {
        ...vars,
        chapter_key: ch.key,
        chapter_type: ch.type,
        chapter_title: ch.title,
        chapter_focus: ch.focus,
        previous_chapters_summary,
      }, {
        maxTokens: 8000,
        temperature: 0.4,
        ctx: { projectId, userId: OSCAR_USER_ID },
        endpoint: `test:compile-v1#${ch.key}`,
      });

      const ms = Date.now() - t0;
      const cacheRead = result.usage?.cache_read_input_tokens || 0;
      const cacheCreate = result.usage?.cache_creation_input_tokens || 0;
      const inputNew = result.usage?.input_tokens || 0;
      const outTok = result.usage?.output_tokens || 0;
      const usingCache = cacheRead > 1000;
      if (usingCache) cacheHits++; else cacheMisses++;

      console.log(`  duration ${(ms/1000).toFixed(1)}s · tokens in=${inputNew} cache_write=${cacheCreate} cache_read=${cacheRead} out=${outTok}`);
      console.log(`  cost: $${result.costUsd.toFixed(4)} ${usingCache ? '(cache HIT 90% off)' : '(cache MISS)'}`);

      let parsedCh = result.parsed;
      if (parsedCh && Array.isArray(parsedCh)) parsedCh = parsedCh[0];
      else if (parsedCh && Array.isArray(parsedCh.chapters) && parsedCh.chapters.length) {
        parsedCh = parsedCh.chapters[0];
      }
      if (!parsedCh || !parsedCh.body) {
        console.error(`  ✗ Parse fail. Raw output saved.`);
        const rawPath = path.join(__dirname, `chapter_${ch.key}_${Date.now()}.txt`);
        fs.writeFileSync(rawPath, result.text || '', 'utf8');
        console.error(`    Raw: ${rawPath}`);
        continue;
      }

      await model.createChapter({
        masterDocId,
        chapterKey: parsedCh.chapter_key || ch.key,
        chapterType: parsedCh.chapter_type || ch.type,
        title: parsedCh.title || ch.title,
        body: parsedCh.body || '',
        sortOrder: i,
      });

      const len = (parsedCh.body || '').length;
      console.log(`  ✓ persisted ${len} chars`);
      totalChars += len;
      totalCost += result.costUsd;
      totalDuration += ms;
      previousSummaries.push({ title: parsedCh.title || ch.title, body: parsedCh.body || '' });
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}`);
    }
    console.log('');
  }

  await model.updateMasterDocument(masterDocId, {
    status: previousSummaries.length === limit ? 'ready' : 'draft',
    total_chars: totalChars,
  });

  console.log('═══ Resumen ═══');
  console.log(`Chapters created: ${previousSummaries.length} / ${limit}`);
  console.log(`Total chars: ${totalChars.toLocaleString('en')}`);
  console.log(`Total time: ${(totalDuration/1000).toFixed(1)}s`);
  console.log(`Total cost: $${totalCost.toFixed(3)}`);
  console.log(`Cache hits: ${cacheHits} / ${cacheHits + cacheMisses}`);
  const budgetFinal = await getBudgetUsed();
  console.log(`Budget total acumulado en la sesión: $${budgetFinal.toFixed(2)} de $${args.maxUsd}`);
  console.log(`Master test ID: ${masterDocId}`);

  process.exit(0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
