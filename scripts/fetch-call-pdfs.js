/**
 * fetch-call-pdfs.js
 *
 * Downloads the main "call document" PDF for every SEDIA call in the funding
 * feed and stores it under data/call_pdfs/<source_id>.pdf.
 *
 * Strategy per call (first that succeeds):
 *   1. documents[] entry with label matching /call.document/i or url matching /call-fiche|call_fiche/i
 *   2. first PDF in documents[] whose label is NOT in the boilerplate blacklist
 *   3. skip (logged as no_candidate)
 *
 * Writes a manifest at data/call_pdfs/_index.json mapping source_id → status:
 *   { status: 'ok' | 'http_error' | 'no_candidate' | 'skipped_existing', url, http_status?, size_bytes?, fetched_at }
 *
 * Skips files already downloaded (re-run safe). Pass --force to re-fetch all.
 *
 * Usage:
 *   node scripts/fetch-call-pdfs.js [--force] [--limit=N] [--only=<source_id>]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const DATA_PATH = path.join(__dirname, '..', 'data', 'funding_unified.json');
const OUT_DIR   = path.join(__dirname, '..', 'data', 'call_pdfs');
const INDEX_PATH = path.join(OUT_DIR, '_index.json');

// Boilerplate detection. Two layers:
//   1. exact-match labels (case-insensitive, trimmed)
//   2. prefix-based regex (catches all variants of application/evaluation forms etc.)
const BOILERPLATE_LABELS = new Set([
  'rules for legal entity validation, lear appointment and financial capacity assessment',
  'funding & tenders portal terms and conditions',
  'eu financial regulation 2024/2509',
  'eu grants aga — annotated model grant agreement',
  'eu grants aga - annotated model grant agreement',
  'online manual',
  'horizon europe programme guide',
  'lump sum mga',
  'he mga',
  'esf and socpl mga',
  'decision',
  'he specific programme decision 2021/764',
  'he framework programme and rules for participation regulation 2021/695',
  'associated countries to horizon europe',
  'list of participating countries in horizon europe',
  'he main work programme 2026-2027 – 1. general introduction',
  'he main work programme 2026-2027 - 1. general introduction',
]);
const BOILERPLATE_PATTERNS = [
  /^standard application form/i,
  /^standard evaluation form/i,
  /^annex [a-z]\b/i,
  /^he main work programme/i,        // entire Horizon WP is boilerplate (every call references it)
  /^call for proposals corrigendum/i,
  /^rules of contest$/i,
  /lump sums.*what do i need to know/i,
  /^framework partnership agreement/i,
  /^horizon europe mga$/i,
  /^he unit mga$/i,
  /^dep mga$/i,
  /^draft guidance/i,
  /^draft direct agreement/i,
  /^direct agreement corrigendum/i,
  /^model grant agreement/i,
  /^mga$/i,
];
function isBoilerplate(label) {
  const lbl = (label || '').toLowerCase().trim();
  if (!lbl) return false;
  if (BOILERPLATE_LABELS.has(lbl)) return true;
  return BOILERPLATE_PATTERNS.some(rx => rx.test(lbl));
}

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const LIMIT = (() => { const a = args.find(x => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : null; })();
const ONLY  = (() => { const a = args.find(x => x.startsWith('--only=')); return a ? a.split('=')[1] : null; })();

function pickPdf(docs) {
  if (!docs || !docs.length) return null;
  // 1. Explicit "call document" (label or URL pattern)
  let hit = docs.find(d =>
    (/call.document/i.test(d.label || '') || /call-fiche|call_fiche/i.test(d.url || '')) &&
    /\.pdf($|\?)/i.test(d.url || '')
  );
  if (hit) return { strategy: 'call_document_label', doc: hit };
  // 2. First non-boilerplate PDF
  hit = docs.find(d => /\.pdf($|\?)/i.test(d.url || '') && !isBoilerplate(d.label));
  if (hit) return { strategy: 'non_boilerplate_pdf', doc: hit };
  return null;
}

function download(url) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try { urlObj = new URL(url); } catch (e) { return reject(new Error('bad url')); }
    const req = https.get(urlObj, {
      headers: { 'User-Agent': 'eplus-tools call-fetcher/1.0' },
      timeout: TIMEOUT_MS,
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, urlObj).toString();
        return download(next).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { httpStatus: res.statusCode }));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const all = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  let calls = all.filter(r =>
    r.source === 'sedia' &&
    String(r.status || '').toLowerCase() === 'open' &&
    (!r.deadline || r.deadline >= today)
  );
  if (ONLY) calls = calls.filter(c => c.source_id === ONLY);
  if (LIMIT) calls = calls.slice(0, LIMIT);

  console.log(`Calls to process: ${calls.length}`);

  const index = fs.existsSync(INDEX_PATH) ? JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) : {};
  let okCount = 0, errCount = 0, skipCount = 0, noCand = 0;

  const queue = calls.slice();
  async function worker(workerId) {
    while (queue.length) {
      const call = queue.shift();
      const sid = call.source_id;
      if (!sid) continue;
      const outPath = path.join(OUT_DIR, sid + '.pdf');
      if (!FORCE && fs.existsSync(outPath)) {
        index[sid] = { ...(index[sid] || {}), status: 'skipped_existing', fetched_at: index[sid]?.fetched_at };
        skipCount++;
        continue;
      }
      const pick = pickPdf(call.documents);
      if (!pick) {
        index[sid] = { status: 'no_candidate', fetched_at: new Date().toISOString() };
        noCand++;
        console.log(`[w${workerId}] ${sid}: no candidate PDF`);
        continue;
      }
      const url = pick.doc.url;
      try {
        const buf = await download(url);
        fs.writeFileSync(outPath, buf);
        index[sid] = {
          status: 'ok',
          strategy: pick.strategy,
          url,
          label: pick.doc.label,
          size_bytes: buf.length,
          fetched_at: new Date().toISOString(),
        };
        okCount++;
        if (okCount % 10 === 0) console.log(`[w${workerId}] ${okCount} OK · ${errCount} err · ${noCand} no-cand · ${skipCount} skip · ${queue.length} remaining`);
      } catch (e) {
        index[sid] = {
          status: 'http_error',
          strategy: pick.strategy,
          url,
          error: e.message,
          http_status: e.httpStatus || null,
          fetched_at: new Date().toISOString(),
        };
        errCount++;
        console.log(`[w${workerId}] ${sid}: ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`\nDone. ok=${okCount} err=${errCount} no_candidate=${noCand} skipped=${skipCount}`);
  console.log(`Manifest: ${INDEX_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
