/* ── Convocatorias RAG — semantic search + per-call chat ───────────
   Loads the embedding store (data/call_vectors.json) into memory on demand,
   plus the structured extracts (data/call_structured/*.json).
   ───────────────────────────────────────────────────────────────── */
'use strict';
const fs   = require('fs');
const path = require('path');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk').default;

const VECTORS_DIR     = path.join(__dirname, '..', '..', '..', '..', 'data', 'call_vectors');
const EXTRACTS_DIR    = path.join(__dirname, '..', '..', '..', '..', 'data', 'call_extracts');
const STRUCTURED_DIR  = path.join(__dirname, '..', '..', '..', '..', 'data', 'call_structured');
const FUNDING_PATH    = path.join(__dirname, '..', '..', '..', '..', 'data', 'funding_unified.json');

const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL  = process.env.AI_MODEL_RAG || 'claude-sonnet-4-5-20250929';

// Sharded vector store: one file per call in data/call_vectors/<sid>.json.
// We load each call lazily on first use; chunks are kept in a flat array
// alongside their source_id and pre-computed L2 norm.
let _allChunks = null;       // flat array, used for cross-call search
let _byCall    = new Map();  // source_id → chunks[] (with _norm cached)

function loadCallFile(sid) {
  const p = path.join(VECTORS_DIR, sid + '.json');
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const enriched = (j.chunks || []).map(c => {
    let n = 0; for (const v of c.vec) n += v * v;
    return { source_id: sid, idx: c.idx, text: c.text, vec: c.vec, _norm: Math.sqrt(n) };
  });
  _byCall.set(sid, enriched);
  return enriched;
}

function loadAll() {
  if (_allChunks) return _allChunks;
  if (!fs.existsSync(VECTORS_DIR)) { _allChunks = []; return _allChunks; }
  const files = fs.readdirSync(VECTORS_DIR).filter(f => f.endsWith('.json') && f !== '_index.json');
  const acc = [];
  for (const f of files) {
    const sid = f.replace(/\.json$/, '');
    const ch = _byCall.get(sid) || loadCallFile(sid);
    if (ch) acc.push(...ch);
  }
  _allChunks = acc;
  console.log(`[rag] vector store loaded · ${acc.length} chunks across ${files.length} calls`);
  return _allChunks;
}

function getCallChunks(sid) {
  return _byCall.get(sid) || loadCallFile(sid);
}

let _feedById = null;
function loadFeed() {
  if (_feedById) return _feedById;
  const all = JSON.parse(fs.readFileSync(FUNDING_PATH, 'utf8'));
  _feedById = new Map();
  for (const r of all) _feedById.set(r.source_id, r);
  return _feedById;
}

function cosine(a, aNorm, b) {
  let dot = 0, bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    bNorm += b[i] * b[i];
  }
  return dot / (aNorm * Math.sqrt(bNorm));
}

let _openai = null;
function openai() { if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); return _openai; }
let _anthropic = null;
function anthropic() { if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); return _anthropic; }

async function embedQuery(text) {
  const r = await openai().embeddings.create({ model: EMBED_MODEL, input: text });
  return r.data[0].embedding;
}

/**
 * Semantic search across ALL chunks.
 * Returns top-K source_ids with their best snippet.
 */
async function searchSemantic(query, topK = 10) {
  const chunks = loadAll();
  if (!chunks.length) return { items: [], total: 0 };
  const feed = loadFeed();
  const qVec = await embedQuery(query);
  let qNorm = 0;
  for (const v of qVec) qNorm += v * v;
  qNorm = Math.sqrt(qNorm);

  // Score every chunk
  const bestByCall = new Map(); // source_id → { score, chunk }
  for (const c of chunks) {
    let dot = 0;
    const v = c.vec;
    for (let i = 0; i < v.length; i++) dot += v[i] * qVec[i];
    const score = dot / (c._norm * qNorm);
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
  return { items: ranked, total: bestByCall.size };
}

/**
 * Chat with a specific call. Uses RAG: pulls top-K chunks of THAT call by
 * cosine over the user's last message, builds context, asks Claude.
 *
 * messages: [{role:'user'|'assistant', content:string}, ...]
 *   The last entry must be the latest user message.
 */
async function chatWithCall(sourceId, messages, options = {}) {
  const topChunks = options.topChunks || 8;
  const callChunks = getCallChunks(sourceId);
  if (!callChunks || !callChunks.length) {
    const e = new Error(`No vectors for ${sourceId}. Run scripts/embed-calls.js`);
    e.status = 404; e.code = 'NO_VECTORS';
    throw e;
  }
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) throw Object.assign(new Error('No user message'), { status: 400 });

  const qVec = await embedQuery(lastUser.content);
  let qNorm = 0; for (const v of qVec) qNorm += v * v; qNorm = Math.sqrt(qNorm);
  const scored = callChunks.map(c => {
    let dot = 0; for (let i = 0; i < c.vec.length; i++) dot += c.vec[i] * qVec[i];
    return { c, score: dot / (c._norm * qNorm) };
  }).sort((a, b) => b.score - a.score).slice(0, topChunks);

  const ctx = scored.map((s, i) => `[Fragmento ${i + 1}]\n${s.c.text}`).join('\n\n');

  // Optional: also include the structured summary if available
  const structuredPath = path.join(STRUCTURED_DIR, sourceId + '.json');
  let structuredSummary = '';
  if (fs.existsSync(structuredPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(structuredPath, 'utf8'));
      structuredSummary = `\n\nRESUMEN ESTRUCTURADO DE LA CONVOCATORIA:\n${j.scope_summary_es || ''}\nPresupuesto total: ${j.budget_total_eur || 'no especificado'} EUR\nDeadline: ${j.deadline || 'no especificado'}\nMin socios: ${j.min_partners || 'no especificado'}`;
    } catch {}
  }

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

${ctx}`;

  const formattedMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '') }));

  const r = await anthropic().messages.create({
    model: CHAT_MODEL,
    max_tokens: 800,
    system,
    messages: formattedMessages,
  });
  const text = r.content.find(c => c.type === 'text')?.text || '';
  return {
    answer: text,
    chunks_used: scored.map(s => ({ idx: s.c.idx, score: s.score, preview: s.c.text.slice(0, 150) })),
    usage: r.usage,
  };
}

function readinessStatus() {
  const chunks = loadAll();
  let manifest = {};
  try {
    const idxPath = path.join(VECTORS_DIR, '_index.json');
    if (fs.existsSync(idxPath)) manifest = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  } catch {}
  return {
    vector_chunks: chunks.length,
    calls_with_vectors: manifest.calls?.length || _byCall.size,
    embed_model: manifest.model || null,
    built_at: manifest.built_at || null,
  };
}

module.exports = { searchSemantic, chatWithCall, readinessStatus };
