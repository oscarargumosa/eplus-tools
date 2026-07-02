/**
 * embed-calls.js
 *
 * Builds a per-call embedding index for semantic search and RAG chat.
 *
 * Storage: data/call_vectors/<source_id>.json (one file per call).
 *          data/call_vectors/_index.json (manifest: list of source_ids).
 *
 * Output shape (per file):
 *   { source_id, model, dim, chunks: [{ idx, text, vec: number[1536] }] }
 *
 * Cost ~$0.50 for 128 calls (~25k chunks × 250 tokens × $0.02/M).
 *
 * Idempotent: skips source_ids whose vector file exists unless --force.
 *
 * Usage:
 *   node scripts/embed-calls.js [--force] [--limit=N] [--only=<source_id>]
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const MODEL = 'text-embedding-3-small';
const DIM = 1536;
const CHUNK_CHARS = 1000;
const OVERLAP = 200;
const BATCH = 50;

const EXTRACT_DIR = path.join(__dirname, '..', 'data', 'call_extracts');
const OUT_DIR     = path.join(__dirname, '..', 'data', 'call_vectors');
const INDEX_PATH  = path.join(OUT_DIR, '_index.json');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY  = (() => { const a = args.find(x => x.startsWith('--only=')); return a ? a.split('=')[1] : null; })();
const LIMIT = (() => { const a = args.find(x => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : null; })();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function chunk(text) {
  const out = [];
  const clean = text.replace(/\s+/g, ' ').trim();
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + CHUNK_CHARS));
    i += CHUNK_CHARS - OVERLAP;
  }
  return out;
}

async function embedBatch(texts) {
  const r = await client.embeddings.create({ model: MODEL, input: texts });
  return r.data.map(d => d.embedding);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let files = fs.readdirSync(EXTRACT_DIR).filter(f => f.endsWith('.json'));
  if (ONLY) files = files.filter(f => f === ONLY + '.json');
  if (LIMIT) files = files.slice(0, LIMIT);

  let okCount = 0, skipCount = 0, errCount = 0;
  let totalNewChunks = 0;

  for (const file of files) {
    const sid = file.replace(/\.json$/, '');
    const outPath = path.join(OUT_DIR, sid + '.json');
    if (!FORCE && fs.existsSync(outPath)) { skipCount++; continue; }

    const extract = JSON.parse(fs.readFileSync(path.join(EXTRACT_DIR, file), 'utf8'));
    const chunks = chunk(extract.text);
    if (!chunks.length) continue;

    try {
      const rows = [];
      for (let b = 0; b < chunks.length; b += BATCH) {
        const slice = chunks.slice(b, b + BATCH);
        const vecs = await embedBatch(slice);
        slice.forEach((t, i) => rows.push({ idx: b + i, text: t, vec: vecs[i] }));
      }
      const out = { source_id: sid, model: MODEL, dim: DIM, chunks: rows };
      fs.writeFileSync(outPath, JSON.stringify(out));
      okCount++;
      totalNewChunks += rows.length;
      console.log(`${sid} ✓ ${rows.length} chunks (${okCount}/${files.length - skipCount} new)`);
    } catch (e) {
      errCount++;
      console.log(`${sid} ✗ ${e.message}`);
    }
  }

  // Rewrite manifest from current state on disk.
  const allFiles = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json') && f !== '_index.json');
  const manifest = {
    model: MODEL, dim: DIM,
    built_at: new Date().toISOString(),
    calls: allFiles.map(f => f.replace(/\.json$/, '')).sort(),
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(manifest, null, 2));

  console.log(`\nDone. new=${okCount} skipped=${skipCount} errors=${errCount}`);
  console.log(`Total calls in store: ${manifest.calls.length}`);
  console.log(`New chunks added: ${totalNewChunks}`);
}

main().catch(e => { console.error(e); process.exit(1); });
