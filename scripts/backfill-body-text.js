/**
 * Backfill documents.body_text from existing PDFs / DOCX on disk.
 *
 * Before migration 105, the upload pipeline only stored chunks
 * (document_chunks) for RAG. The full extracted text was not persisted.
 * This script re-reads each document's storage_path, runs the same
 * extractor used by vectorize.js, and persists into documents.body_text.
 *
 * Idempotent: skips documents that already have body_text. Safe to run
 * multiple times. Logs progress per row.
 *
 * Usage:
 *   node scripts/backfill-body-text.js              # all documents
 *   node scripts/backfill-body-text.js --force      # re-extract even if body_text exists
 *   node scripts/backfill-body-text.js --id=42      # only one document by id
 */

require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { extractText } = require('../node/src/services/vectorize');

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const idArg = argv.find(a => a.startsWith('--id='));
const onlyId = idArg ? parseInt(idArg.slice('--id='.length), 10) : null;

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
    charset: 'utf8mb4',
  });

  const where = [];
  const params = [];
  if (onlyId) {
    where.push('id = ?');
    params.push(onlyId);
  } else if (!force) {
    where.push('(body_text IS NULL OR body_text_chars = 0)');
  }
  where.push("storage_path IS NOT NULL");
  where.push("status = 'active'");
  const sql = `SELECT id, title, file_type, storage_path FROM documents WHERE ${where.join(' AND ')} ORDER BY id`;
  const [rows] = await conn.query(sql, params);

  console.log(`[BACKFILL] ${rows.length} document(s) to process${force ? ' (force)' : ''}${onlyId ? ` (id=${onlyId})` : ''}`);

  let ok = 0, skipped = 0, failed = 0;
  for (const doc of rows) {
    try {
      const rel = (doc.storage_path || '').replace(/^\/+/, '');
      const fullPath = path.join(__dirname, '..', 'public', rel);
      const buffer = await fs.readFile(fullPath);
      const text = await extractText(buffer, doc.file_type);
      if (!text || text.trim().length === 0) {
        console.warn(`  [skip] doc ${doc.id} "${doc.title}" — no text extracted`);
        skipped++;
        continue;
      }
      const chars = text.length;
      const tokensEst = Math.ceil(chars / 4);
      await conn.execute(
        'UPDATE documents SET body_text = ?, body_text_chars = ?, tokens_estimated = ? WHERE id = ?',
        [text, chars, tokensEst, doc.id]
      );
      console.log(`  [ok]   doc ${doc.id} "${doc.title}" — ${chars} chars, ~${tokensEst} tokens`);
      ok++;
    } catch (e) {
      console.error(`  [fail] doc ${doc.id} "${doc.title}":`, e.message);
      failed++;
    }
  }

  console.log(`[BACKFILL] done — ${ok} ok, ${skipped} skipped, ${failed} failed`);
  await conn.end();
}

run().catch(err => { console.error(err); process.exit(1); });
