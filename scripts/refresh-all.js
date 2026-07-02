#!/usr/bin/env node
/**
 * scripts/refresh-all.js — Daily data refresh orchestrator.
 *
 * Designed to run on the VPS host as a systemd timer (06:00 CET).
 *
 * Flow:
 *   1. git fetch + checkout `data-auto` branch + hard-reset to origin.
 *      (Cron repo is dedicated to this branch; never touches dev-local/main.)
 *   2. Run each scraper independently with soft failure (one source down
 *      doesn't block the others).
 *   3. Rebuild the unified JSON.
 *   4. If `data/` has changes, stage + commit + push to origin/data-auto.
 *
 * Idempotent. Safe to re-run mid-day; the second run sees no diff.
 *
 * Exit codes:
 *   0  = success or nothing to commit
 *   1  = git checkout/reset failed (infra issue, should page)
 *   2  = ALL scrapers failed (network outage, should alert)
 *   3+ = git plumbing failed mid-flow
 */

const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BRANCH    = 'data-auto';
const BOT_NAME  = 'eplus-refresh-bot';
const BOT_EMAIL = 'bot@eufundingschool.com';

const ts   = () => new Date().toISOString();
const log  = (m) => console.log(`[${ts()}] ${m}`);
const warn = (m) => console.warn(`[${ts()}] WARN  ${m}`);
const err  = (m) => console.error(`[${ts()}] ERROR ${m}`);

function exec(label, cmd, args) {
  log(`→ ${label}`);
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' });
  return { ok: r.status === 0, code: r.status };
}

function execCapture(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function softExec(label, cmd, args) {
  const r = exec(label, cmd, args);
  if (r.ok) log(`  ✓ ${label}`);
  else      warn(`  ✗ ${label} (exit ${r.code}) — continuing with next step`);
  return r.ok;
}

function hardExec(label, cmd, args) {
  const r = exec(label, cmd, args);
  if (!r.ok) {
    err(`${label} failed (exit ${r.code}) — aborting`);
    process.exit(r.code || 1);
  }
}

(function main() {
  log(`refresh-all start  cwd=${REPO_ROOT}  branch=${BRANCH}`);

  // ── 1. Sync to clean origin/data-auto ─────────────────────────────
  hardExec('git fetch origin',       'git', ['fetch', 'origin', BRANCH]);
  hardExec(`git checkout ${BRANCH}`, 'git', ['checkout', BRANCH]);
  hardExec('git reset --hard',       'git', ['reset', '--hard', `origin/${BRANCH}`]);

  // ── 2. Scrape each source (soft failures) ─────────────────────────
  const results = {
    salto_scrape:    softExec('SALTO scrape',     'node', ['scripts/salto/scrape-salto.js']),
    salto_enrich:    softExec('SALTO enrich',     'node', ['scripts/salto/enrich-details.js']),
    sedia_sync:      softExec('SEDIA sync',       'node', ['scripts/sedia/sync.js']),
    bdns_sync:       softExec('BDNS sync',        'node', ['scripts/bdns/sync.js']),
    funding_unifier: softExec('Funding unifier',  'node', ['scripts/funding/build-unified.js']),
  };
  const okCount    = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  log(`scrapers: ${okCount}/${totalCount} ok`);

  if (okCount === 0) {
    err('all scrapers failed — aborting commit so we keep the previous good snapshot');
    process.exit(2);
  }

  // ── 2b. PDF + LLM enrichment for any NEW calls ────────────────────
  // All four scripts below are idempotent: they skip what's already on disk.
  // Cost: $0 if no new calls, ~$0.10/new call (structure + embed).
  // For this to actually reach the container in production, data/call_structured/
  // and data/call_vectors/ MUST be symlinks to the mounted volume:
  //   ln -s /data/eplus-shared/call_structured data/call_structured
  //   ln -s /data/eplus-shared/call_vectors    data/call_vectors
  results.fetch_pdfs       = softExec('Fetch new call PDFs',         'node', ['scripts/fetch-call-pdfs.js']);
  results.extract_texts    = softExec('Extract text from PDFs',      'node', ['scripts/extract-call-text.js']);
  results.structure_calls  = softExec('LLM-structure new calls',     'node', ['scripts/structure-call.js']);
  results.embed_calls      = softExec('Embed new calls',             'node', ['scripts/embed-calls.js']);

  // ── 3. Anything to commit? ───────────────────────────────────────
  const status = execCapture('git', ['status', '--porcelain', 'data/']);
  if (!status.ok) {
    err(`git status failed: ${status.stderr.trim()}`);
    process.exit(3);
  }
  if (!status.stdout.trim()) {
    log('no changes in data/ — nothing to commit');
    return;
  }

  // ── 4. Commit + push ──────────────────────────────────────────────
  const datestamp = ts().slice(0, 10);
  const summary   = Object.entries(results)
    .map(([k, v]) => `${k}=${v ? 'ok' : 'FAIL'}`)
    .join('  ');
  const msg = `data: refresh ${datestamp}\n\n${summary}\n`;

  hardExec('git add data/', 'git', ['add', 'data/']);

  const commit = exec('git commit', 'git', [
    '-c', `user.name=${BOT_NAME}`,
    '-c', `user.email=${BOT_EMAIL}`,
    'commit', '-m', msg,
  ]);
  if (!commit.ok) {
    warn('git commit found nothing to do — skipping push');
    return;
  }

  hardExec('git push', 'git', ['push', 'origin', BRANCH]);

  log('refresh-all done  ✓');
})();
