/* ═══════════════════════════════════════════════════════════════
   Download Paper — fetch open access PDF, save, vectorize
   ═══════════════════════════════════════════════════════════════ */

const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const db = require('../utils/db');
const { processDocument } = require('./vectorize');
const storage = require('../utils/private-storage');

/**
 * Download and process a research source by ID
 */
async function downloadAndVectorize(sourceId) {
  // 1. Get source from DB
  const [rows] = await db.execute('SELECT * FROM research_sources WHERE id = ?', [sourceId]);
  const source = rows[0];
  if (!source) throw new Error(`Source ${sourceId} not found`);
  if (!source.pdf_url) throw new Error(`Source ${sourceId} has no PDF URL`);

  console.log(`[DOWNLOAD] Starting download for source ${sourceId}: ${source.title?.slice(0, 60)}`);

  // 2. Download PDF
  // Carpeta privada (no se sirve por estático)
  const uploadDir = await storage.dirFor('research');
  const filename = `source-${sourceId}-${Date.now()}.pdf`;
  const filePath = path.join(uploadDir, filename);
  const relativePath = `uploads/research/${filename}`;

  await downloadFile(source.pdf_url, filePath);

  // Verify file is a valid PDF
  const stat = await fs.stat(filePath);
  if (stat.size < 500) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error('Downloaded file is too small — likely not a valid PDF');
  }
  const header = await fs.readFile(filePath, { encoding: 'utf8', flag: 'r' });
  if (!header.startsWith('%PDF')) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error('Downloaded file is not a valid PDF (likely HTML redirect page)');
  }

  console.log(`[DOWNLOAD] Saved ${(stat.size / 1024).toFixed(0)}KB → ${filename}`);

  // 3. Update source record
  await db.execute(
    'UPDATE research_sources SET file_path = ?, status = ? WHERE id = ?',
    [relativePath, 'downloaded', sourceId]
  );

  // 4. Vectorize
  console.log(`[DOWNLOAD] Vectorizing source ${sourceId}...`);
  await processDocument(null, { storage_path: relativePath, file_type: 'application/pdf' }, sourceId);

  // 5. Update status to vectorized
  await db.execute(
    'UPDATE research_sources SET status = ? WHERE id = ?',
    ['vectorized', sourceId]
  );

  console.log(`[DOWNLOAD] Done: source ${sourceId} downloaded and vectorized`);
  return { sourceId, filePath: relativePath };
}

/**
 * Process all open access sources that haven't been downloaded yet
 */
async function processAllPending() {
  const [sources] = await db.execute(
    `SELECT id, title, pdf_url FROM research_sources
     WHERE is_open_access = 1 AND pdf_url IS NOT NULL AND status = 'reference'
     ORDER BY created_at ASC`
  );

  console.log(`[DOWNLOAD] Found ${sources.length} pending sources to process`);

  let ok = 0, fail = 0;
  for (const s of sources) {
    try {
      await downloadAndVectorize(s.id);
      ok++;
    } catch (e) {
      console.error(`[DOWNLOAD] Failed source ${s.id}: ${e.message}`);
      await db.execute('UPDATE research_sources SET status = ? WHERE id = ?', ['error', s.id]);
      fail++;
    }
  }

  console.log(`[DOWNLOAD] Batch complete: ${ok} ok, ${fail} failed`);
  return { processed: ok, failed: fail };
}

/**
 * Download a file from URL, following redirects (up to 5)
 */
function downloadFile(url, destPath, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'EplusTools/1.0' } }, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        res.resume();
        return downloadFile(redirectUrl, destPath, redirects + 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} downloading PDF`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          await fs.writeFile(destPath, buffer);
          resolve();
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { downloadAndVectorize, processAllPending };
