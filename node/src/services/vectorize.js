/* ═══════════════════════════════════════════════════════════════
   Vectorize Service — extract text, chunk, embed, store
   Reads files from local disk (public/uploads/documents/)
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs/promises');
const path = require('path');
const db = require('../utils/db');
const { generateEmbedding } = require('./embeddings');

const CHUNK_SIZE   = 500;  // words per chunk
const CHUNK_OVERLAP = 50;  // overlap words between chunks

/* ── Text extraction by file type ────────────────────────────── */

async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const { PDFParse } = require('pdf-parse');
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const parser = new PDFParse(uint8);
    const result = await parser.getText();
    return result.pages.map(p => p.text).join('\n');
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // TXT, CSV, etc.
  return buffer.toString('utf-8');
}

/* ── Chunking ────────────────────────────────────────────────── */

function chunkText(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end >= words.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

/* ── Main pipeline ───────────────────────────────────────────── */

/**
 * Process a document: read from disk → extract text → chunk → embed → store
 * @param {number|string} documentId — ID from MySQL documents table (null if research source)
 * @param {object} meta — { storage_path, file_type }
 * @param {number} [sourceId] — research_sources ID (optional)
 */
async function processDocument(documentId, meta, sourceId) {
  const label = sourceId ? `source ${sourceId}` : `document ${documentId}`;
  console.log(`[VECTORIZE] Processing ${label}...`);

  try {
    // 1. Read file from local disk
    // storage_path is like "/uploads/documents/file.pdf" — always resolve relative to public/
    const rel = meta.storage_path.replace(/^\/+/, '');
    const fullPath = path.join(__dirname, '../../..', 'public', rel);
    const buffer = await fs.readFile(fullPath);

    // 2. Extract text
    const text = await extractText(buffer, meta.file_type);
    if (!text || text.trim().length === 0) {
      console.warn(`[VECTORIZE] No text extracted from ${label}`);
      return;
    }

    // 2b. Persist full text on documents.body_text for CAG (Master compile/diagnose).
    //     RAG (chunks) and CAG (body_text) live side by side from the same extraction.
    if (documentId) {
      const chars = text.length;
      const tokensEst = Math.ceil(chars / 4);
      await db.execute(
        'UPDATE documents SET body_text = ?, body_text_chars = ?, tokens_estimated = ? WHERE id = ?',
        [text, chars, tokensEst, documentId]
      );
    }

    // 3. Chunk
    const chunks = chunkText(text);
    console.log(`[VECTORIZE] ${chunks.length} chunks from ${label}`);

    // 4. Delete old chunks (re-processing)
    if (sourceId) {
      await db.execute('DELETE FROM document_chunks WHERE source_id = ?', [sourceId]);
    } else if (documentId) {
      await db.execute('DELETE FROM document_chunks WHERE document_id = ?', [documentId]);
    }

    // 5. Embed + store each chunk
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      const tokens = chunks[i].split(/\s+/).length;
      await db.execute(
        'INSERT INTO document_chunks (document_id, chunk_index, content, embedding, tokens, source_id) VALUES (?, ?, ?, ?, ?, ?)',
        [documentId || null, i, chunks[i], JSON.stringify(embedding), tokens, sourceId || null]
      );
    }

    console.log(`[VECTORIZE] Done: ${label} — ${chunks.length} chunks stored`);
  } catch (err) {
    console.error(`[VECTORIZE] Error processing ${label}:`, err.message);
    throw err;
  }
}

module.exports = { processDocument, extractText, chunkText };
