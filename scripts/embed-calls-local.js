/**
 * embed-calls-local.js
 *
 * Índice de embeddings LOCAL (sin API de pago) para la búsqueda semántica
 * y el chat RAG de convocatorias. Modelo: el mismo de
 * node/src/services/embeddings.js (Xenova/all-MiniLM-L6-v2, 384 dim).
 *
 * Salida: CALL_VECTORS_LOCAL_DIR (por defecto data/call_vectors_local)
 *   <source_id>.json  { source_id, model, dim, chunks: [{ idx, text, vec }] }
 *   _index.json       { model, dim, built_at, calls: [...] }
 *
 * Texto de entrada (por orden):
 *   1. data/call_extracts/<sid>.json  (texto completo; se trocea como embed-calls.js)
 *   2. data/call_vectors/<sid>.json   (solo se LEE el texto de sus fragmentos;
 *      ese directorio no se modifica nunca — lo comparte la live)
 *
 * Idempotente: salta convocatorias ya indexadas salvo --force.
 *
 * Uso:
 *   nice -n 15 node scripts/embed-calls-local.js [--force] [--limit=N] [--only=<source_id>]
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateEmbeddings, MODEL_ID, DIM } = require('../node/src/services/embeddings');

const ROOT        = path.join(__dirname, '..');
const OUT_DIR     = path.resolve(ROOT, process.env.CALL_VECTORS_LOCAL_DIR || path.join('data', 'call_vectors_local'));
const EXTRACT_DIR = path.join(ROOT, 'data', 'call_extracts');
const LEGACY_DIR  = path.join(ROOT, 'data', 'call_vectors');
const INDEX_PATH  = path.join(OUT_DIR, '_index.json');

const CHUNK_CHARS = 1000;
const OVERLAP = 200;
const BATCH = 32;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY  = (() => { const a = args.find(x => x.startsWith('--only=')); return a ? a.split('=')[1] : null; })();
const LIMIT = (() => { const a = args.find(x => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : null; })();

if (path.resolve(OUT_DIR) === path.resolve(LEGACY_DIR)) {
  console.error('CALL_VECTORS_LOCAL_DIR no puede ser data/call_vectors (es el índice de la live).');
  process.exit(1);
}

function chunk(text) {
  const out = [];
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + CHUNK_CHARS));
    i += CHUNK_CHARS - OVERLAP;
  }
  return out;
}

function listSources() {
  const ids = new Set();
  for (const dir of [EXTRACT_DIR, LEGACY_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json') && f !== '_index.json') ids.add(f.replace(/\.json$/, ''));
    }
  }
  return [...ids].sort();
}

function textsFor(sid) {
  const ex = path.join(EXTRACT_DIR, sid + '.json');
  if (fs.existsSync(ex)) {
    const j = JSON.parse(fs.readFileSync(ex, 'utf8'));
    return chunk(j.text);
  }
  const lg = path.join(LEGACY_DIR, sid + '.json');
  if (fs.existsSync(lg)) {
    const j = JSON.parse(fs.readFileSync(lg, 'utf8'));
    return (j.chunks || []).sort((a, b) => a.idx - b.idx).map(c => c.text);
  }
  return [];
}

// 6 decimales bastan para coseno y reducen el JSON a ~la mitad
const round = (v) => Math.round(v * 1e6) / 1e6;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ids = listSources();
  if (ONLY) ids = ids.filter(s => s === ONLY);
  if (LIMIT) ids = ids.slice(0, LIMIT);

  const t0 = Date.now();
  let ok = 0, skip = 0, err = 0, totalChunks = 0;

  for (const sid of ids) {
    const outPath = path.join(OUT_DIR, sid + '.json');
    if (!FORCE && fs.existsSync(outPath)) { skip++; continue; }
    try {
      const texts = textsFor(sid);
      if (!texts.length) { skip++; continue; }
      const rows = [];
      for (let b = 0; b < texts.length; b += BATCH) {
        const slice = texts.slice(b, b + BATCH);
        const vecs = await generateEmbeddings(slice);
        slice.forEach((t, i) => rows.push({ idx: b + i, text: t, vec: vecs[i].map(round) }));
      }
      // Escritura atómica: un fichero a medias no debe entrar en el índice
      fs.writeFileSync(outPath + '.tmp', JSON.stringify({ source_id: sid, model: MODEL_ID, dim: DIM, chunks: rows }));
      fs.renameSync(outPath + '.tmp', outPath);
      ok++; totalChunks += rows.length;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`${sid} ✓ ${rows.length} fragmentos (${ok + skip + err}/${ids.length}, ${secs}s)`);
    } catch (e) {
      err++;
      console.log(`${sid} ✗ ${e.message}`);
    }
  }

  const calls = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json') && f !== '_index.json').map(f => f.replace(/\.json$/, '')).sort();
  fs.writeFileSync(INDEX_PATH, JSON.stringify({ model: MODEL_ID, dim: DIM, built_at: new Date().toISOString(), calls }, null, 2));

  console.log(`\nHecho en ${((Date.now() - t0) / 1000).toFixed(1)} s. nuevas=${ok} saltadas=${skip} errores=${err} fragmentos=${totalChunks}`);
  console.log(`Convocatorias en el índice: ${calls.length} → ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
