/* ═══════════════════════════════════════════════════════════════
   Embeddings Service — local model, no API key needed
   Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
   ═══════════════════════════════════════════════════════════════ */

let pipeline = null;
let embedder = null;

/** Lazy-load the model on first call */
async function getEmbedder() {
  if (embedder) return embedder;
  if (!pipeline) {
    const mod = await import('@xenova/transformers');
    pipeline = mod.pipeline || mod.default.pipeline;
    // Carpeta opcional para la caché del modelo (por defecto, dentro de node_modules)
    const env = mod.env || mod.default?.env;
    if (env && process.env.EMBEDDINGS_CACHE_DIR) env.cacheDir = process.env.EMBEDDINGS_CACHE_DIR;
  }
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('[EMBEDDINGS] Model loaded');
  return embedder;
}

/**
 * Generate embedding vector for a text string
 * @param {string} text
 * @returns {Promise<number[]>} 384-dim vector
 */
async function generateEmbedding(text) {
  const embed = await getEmbedder();
  const output = await embed(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Embeddings en lote (más rápido que uno a uno para indexar)
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function generateEmbeddings(texts) {
  const embed = await getEmbedder();
  const output = await embed(texts, { pooling: 'mean', normalize: true });
  const dim = output.dims[output.dims.length - 1];
  const out = [];
  for (let i = 0; i < texts.length; i++) out.push(Array.from(output.data.subarray(i * dim, (i + 1) * dim)));
  return out;
}

/**
 * Cosine similarity between two vectors
 * @returns {number} between -1 and 1
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;

module.exports = { generateEmbedding, generateEmbeddings, cosineSimilarity, MODEL_ID, DIM };
