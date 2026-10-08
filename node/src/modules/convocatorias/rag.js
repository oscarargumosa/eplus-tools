/* ── Convocatorias RAG — semantic search + per-call chat ───────────
   Embeddings LOCALES (services/embeddings.js, MiniLM 384 dim, sin API)
   y respuesta por utils/ai.js → ai-bridge (suscripción). Nunca OpenAI
   ni la API de Anthropic.

   Índice: CALL_VECTORS_LOCAL_DIR (por defecto data/call_vectors_local),
   uno por convocatoria <sid>.json + _index.json. Se genera con
   scripts/embed-calls-local.js. data/call_vectors (vectores OpenAI de
   1536 dim) ya NO se usa para similitud; solo se lee su texto como
   respaldo para la búsqueda por palabras clave si falta el índice local.

   Si no hay índice local, todo degrada a búsqueda por palabras clave.
   ───────────────────────────────────────────────────────────────── */
'use strict';
const fs   = require('fs');
const path = require('path');
const { generateEmbedding, DIM } = require('../../services/embeddings');
const ai = require('../../utils/ai');

const ROOT            = path.join(__dirname, '..', '..', '..', '..');
const VECTORS_DIR     = path.resolve(ROOT, process.env.CALL_VECTORS_LOCAL_DIR || path.join('data', 'call_vectors_local'));
const LEGACY_DIR      = path.join(ROOT, 'data', 'call_vectors');   // solo texto (respaldo)
const STRUCTURED_DIR  = path.join(ROOT, 'data', 'call_structured');
const FUNDING_PATH    = path.join(ROOT, 'data', 'funding_unified.json');

// Shards por convocatoria, cargados bajo demanda. Vectores en Float32Array.
let _allChunks = null;
let _byCall    = new Map();
let _manifest  = undefined;

let _manifestMtime = 0;

function localManifest() {
  // Si el índice se regenera con la app en marcha, se recarga solo
  const p = path.join(VECTORS_DIR, '_index.json');
  let mtime = 0;
  try { mtime = fs.statSync(p).mtimeMs; } catch {}
  if (_manifest !== undefined && mtime === _manifestMtime) return _manifest;
  _manifestMtime = mtime;
  _allChunks = null; _byCall = new Map();
  _manifest = null;
  try {
    if (fs.existsSync(p)) {
      const m = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (m.dim === DIM) _manifest = m;
      else console.warn(`[rag] índice local con dim ${m.dim} ≠ ${DIM}: se ignora`);
    }
  } catch (e) { console.warn('[rag] _index.json ilegible:', e.message); }
  return _manifest;
}

const SAFE_SID = /^[\w.-]+$/;

function loadCallFile(sid) {
  if (!localManifest() || !SAFE_SID.test(sid)) return null;
  const p = path.join(VECTORS_DIR, sid + '.json');
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (j.dim && j.dim !== DIM) return null;
  const enriched = (j.chunks || []).map(c => {
    const vec = Float32Array.from(c.vec);
    let n = 0; for (const v of vec) n += v * v;
    return { source_id: sid, idx: c.idx, text: c.text, vec, _norm: Math.sqrt(n) || 1 };
  });
  _byCall.set(sid, enriched);
  return enriched;
}

function loadAll() {
  if (_allChunks) return _allChunks;
  const m = localManifest();
  if (!m) return [];
  const acc = [];
  for (const sid of m.calls || []) {
    const ch = _byCall.get(sid) || loadCallFile(sid);
    if (ch) acc.push(...ch);
  }
  _allChunks = acc;
  console.log(`[rag] índice local cargado · ${acc.length} fragmentos en ${(m.calls || []).length} convocatorias`);
  return _allChunks;
}

function getCallChunks(sid) {
  localManifest(); // invalida la caché si el índice cambió
  return _byCall.get(sid) || loadCallFile(sid);
}

let _feedById = null;
function loadFeed() {
  if (_feedById) return _feedById;
  _feedById = new Map();
  try {
    const all = JSON.parse(fs.readFileSync(FUNDING_PATH, 'utf8'));
    for (const r of all) _feedById.set(r.source_id, r);
  } catch (e) { console.warn('[rag] feed no disponible:', e.message); }
  return _feedById;
}

async function embedQuery(text) {
  return Float32Array.from(await generateEmbedding(String(text).slice(0, 2000)));
}

function scoreVec(c, qVec, qNorm) {
  let dot = 0;
  const v = c.vec;
  for (let i = 0; i < v.length; i++) dot += v[i] * qVec[i];
  return dot / (c._norm * qNorm);
}

/* ── Palabras clave (respaldo sin índice) ───────────────────────── */
const STOP = new Set(('the and for with from that this are was were have has los las del una por para con que como sobre entre ' +
  'unos unas este esta estos estas son sus mas donde cuando cual what which how who into your our their its').split(' '));

function keywords(q) {
  return [...new Set(String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)))];
}

function keywordScore(text, kws) {
  if (!kws.length || !text) return 0;
  const t = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let hits = 0;
  for (const k of kws) if (t.includes(k)) hits++;
  return hits / kws.length;
}

function searchKeyword(query, topK) {
  const kws = keywords(query);
  const out = [];
  for (const [sid, r] of loadFeed()) {
    const text = [r.title, r.programme, r.sub_programme, r.summary_es, r.summary_en, (r.keywords || []).join(' ')].join(' ');
    const score = keywordScore(text, kws);
    if (score > 0) out.push({
      source_id: sid, score, title: r.title || null, programme: r.programme || null,
      deadline: r.deadline || null, snippet: String(r.summary_es || r.summary_en || '').slice(0, 400),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return { items: out.slice(0, topK), total: out.length, mode: 'keyword' };
}

/**
 * Semantic search across ALL chunks (índice local). Sin índice → palabras clave.
 * Returns top-K source_ids with their best snippet.
 */
async function searchSemantic(query, topK = 10) {
  const chunks = loadAll();
  if (!chunks.length) return searchKeyword(query, topK);
  const feed = loadFeed();
  const qVec = await embedQuery(query);
  let qNorm = 0; for (const v of qVec) qNorm += v * v; qNorm = Math.sqrt(qNorm) || 1;

  const bestByCall = new Map(); // source_id → { score, chunk }
  for (const c of chunks) {
    const score = scoreVec(c, qVec, qNorm);
    const prev = bestByCall.get(c.source_id);
    if (!prev || score > prev.score) bestByCall.set(c.source_id, { score, chunk: c });
  }

  const ranked = [...bestByCall.entries()]
    .map(([sid, info]) => {
      const meta = feed.get(sid) || {};
      return {
        source_id: sid,
        score: info.score,
        title: meta.title || null,
        programme: meta.programme || null,
        deadline: meta.deadline || null,
        snippet: info.chunk.text.slice(0, 400),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return { items: ranked, total: bestByCall.size, mode: 'semantic' };
}

/* Texto de los fragmentos de una convocatoria sin vectores locales:
   se reutiliza el texto del almacén antiguo (no sus vectores). */
function legacyChunkTexts(sid) {
  if (!SAFE_SID.test(sid)) return null;
  const p = path.join(LEGACY_DIR, sid + '.json');
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (j.chunks || []).map(c => ({ idx: c.idx, text: c.text }));
  } catch { return null; }
}

/**
 * Chat with a specific call. RAG: top-K fragmentos de ESA convocatoria
 * (coseno local, o palabras clave si no hay índice) + respuesta por el puente.
 *
 * messages: [{role:'user'|'assistant', content:string}, ...]
 *   The last entry must be the latest user message.
 */
async function chatWithCall(sourceId, messages, options = {}) {
  const topChunks = options.topChunks || 8;
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) throw Object.assign(new Error('No user message'), { status: 400 });

  // Optional: also include the structured summary if available
  const structuredPath = path.join(STRUCTURED_DIR, sourceId + '.json');
  let structuredSummary = '';
  if (SAFE_SID.test(sourceId) && fs.existsSync(structuredPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(structuredPath, 'utf8'));
      structuredSummary = `\n\nRESUMEN ESTRUCTURADO DE LA CONVOCATORIA:\n${j.scope_summary_es || ''}\nPresupuesto total: ${j.budget_total_eur || 'no especificado'} EUR\nDeadline: ${j.deadline || 'no especificado'}\nMin socios: ${j.min_partners || 'no especificado'}`;
    } catch {}
  }

  let scored;
  let mode = 'semantic';
  const callChunks = getCallChunks(sourceId);
  if (callChunks && callChunks.length) {
    const qVec = await embedQuery(lastUser.content);
    let qNorm = 0; for (const v of qVec) qNorm += v * v; qNorm = Math.sqrt(qNorm) || 1;
    scored = callChunks.map(c => ({ c, score: scoreVec(c, qVec, qNorm) }))
      .sort((a, b) => b.score - a.score).slice(0, topChunks);
  } else {
    // Sin índice local: palabras clave sobre el texto del almacén antiguo
    mode = 'keyword';
    const kws = keywords(lastUser.content);
    scored = (legacyChunkTexts(sourceId) || []).map(c => ({ c, score: keywordScore(c.text, kws) }))
      .sort((a, b) => b.score - a.score || a.c.idx - b.c.idx).slice(0, topChunks);
    if (!scored.length && !structuredSummary) {
      const e = new Error(`No vectors for ${sourceId}. Run scripts/embed-calls-local.js`);
      e.status = 404; e.code = 'NO_VECTORS';
      throw e;
    }
  }

  const ctx = scored.map((s, i) => `[Fragmento ${i + 1}]\n${s.c.text}`).join('\n\n');

  const feed = loadFeed();
  const meta = feed.get(sourceId) || {};
  const title = meta.title || sourceId;

  const system = `Eres un experto en la convocatoria EU "${title}" (${sourceId}). Responde en español de forma directa y útil para alguien que quiere preparar una propuesta.

Reglas estrictas:
- Basa tu respuesta SÓLO en los fragmentos del documento oficial proporcionados.
- Si la pregunta no tiene respuesta clara en los fragmentos, dilo: "No encuentro esa información en el documento de la convocatoria. Te recomiendo consultar el portal oficial."
- Cita brevemente la fuente con [Fragmento N] cuando uses información específica.
- Sé conciso. Listas si son útiles. Máximo 250 palabras salvo que se pida más detalle.${structuredSummary}

FRAGMENTOS DEL DOCUMENTO OFICIAL:

${ctx || '(sin fragmentos)'}`;

  // Historial acotado: todo viaja en un único prompt al puente
  const formattedMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-12)
    .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 4000) }));

  const text = await ai.callClaudeChat(system, formattedMessages, 800);
  return {
    answer: text,
    mode,
    chunks_used: scored.map(s => ({ idx: s.c.idx, score: s.score, preview: s.c.text.slice(0, 150) })),
  };
}

function readinessStatus() {
  const m = localManifest();
  const chunks = loadAll();
  return {
    mode: m ? 'semantic' : 'keyword',
    vector_chunks: chunks.length,
    calls_with_vectors: m?.calls?.length || 0,
    embed_model: m?.model || null,
    built_at: m?.built_at || null,
  };
}

module.exports = { searchSemantic, chatWithCall, readinessStatus };
