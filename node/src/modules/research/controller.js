/* ── Research Controller ──────────────────────────────────────── */
const openalex = require('../../services/openalex');
const m = require('./model');
const { processDocument } = require('../../services/vectorize');
const { downloadAndVectorize, processAllPending } = require('../../services/download-paper');
const storage = require('../../utils/private-storage');
const docModel = require('../documents/model');

const ok  = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 400) =>
  res.status(status).json({ ok: false, error: { message: msg } });

/* ── Search OpenAlex ────────────────────────────────────────────── */

exports.search = async (req, res) => {
  try {
    const { q, country, year_from, year_to, open_access, page, per_page } = req.query;
    if (!q || !q.trim()) return err(res, 'Query parameter "q" is required');

    const results = await openalex.searchWorks({
      query: q.trim(),
      country: country || undefined,
      yearFrom: year_from ? parseInt(year_from) : undefined,
      yearTo: year_to ? parseInt(year_to) : undefined,
      openAccess: open_access === 'true' || open_access === '1',
      page: page ? parseInt(page) : 1,
      perPage: per_page ? parseInt(per_page) : 20,
    });

    // Mark which results are already saved
    const saved = new Set();
    for (const r of results.results) {
      const existing = await m.getSourceByExternalId(r.external_id, 'openalex');
      if (existing) {
        r.saved_id = existing.id;
        saved.add(r.external_id);
      }
    }

    ok(res, results);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Save source ────────────────────────────────────────────────── */

exports.saveSource = async (req, res) => {
  try {
    const data = req.body;
    if (!data.title) return err(res, 'Title is required');
    if (!data.external_id) return err(res, 'External ID is required');

    data.added_by = req.user.id;
    const source = await m.createSource(data);

    // Auto-download & vectorize if open access with PDF
    if (source.is_open_access && source.pdf_url && source.status === 'reference') {
      downloadAndVectorize(source.id)
        .then(() => console.log(`[RESEARCH] Auto-vectorized source ${source.id}`))
        .catch(e => console.error(`[RESEARCH] Auto-vectorize failed ${source.id}:`, e.message));
    }

    ok(res, source);
  } catch (e) { err(res, e.message, 500); }
};

/* ── List saved sources ─────────────────────────────────────────── */

exports.listSources = async (req, res) => {
  try {
    // ?all=true (todas las fuentes de todos) solo para admin
    const all = req.query.all === 'true' && req.user.role === 'admin';
    const sources = await m.listSources({
      addedBy: all ? undefined : req.user.id,
      visibility: req.query.visibility || undefined,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    });
    ok(res, sources);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Get single source ──────────────────────────────────────────── */

exports.getSource = async (req, res) => {
  try {
    const source = await m.getSource(req.params.id);
    if (!source || !(await m.canAccessSource(req.user, source))) return err(res, 'Not found', 404);
    ok(res, source);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Fichero PDF de una fuente (con la misma regla de acceso) ───── */

exports.getSourceFile = async (req, res) => {
  try {
    const source = await m.getSource(req.params.id);
    if (!source || !source.file_path || !(await m.canAccessSource(req.user, source))) return err(res, 'Not found', 404);
    let buffer;
    try { buffer = await storage.readStored(source.file_path); }
    catch (e) { if (e.code === 'ENOENT') return err(res, 'File not found', 404); throw e; }
    const filename = (source.title || 'paper').slice(0, 120) + '.pdf';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Delete source ──────────────────────────────────────────────── */

exports.deleteSource = async (req, res) => {
  try {
    const source = await m.getSource(req.params.id);
    if (!source) return err(res, 'Not found', 404);
    if (source.added_by !== req.user.id && req.user.role !== 'admin') {
      return err(res, 'Forbidden', 403);
    }
    await m.deleteSource(req.params.id);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Library (all public sources) ────────────────────────────────── */

exports.listLibrary = async (req, res) => {
  try {
    const sources = await m.listSources({
      visibility: 'public',
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    });
    ok(res, sources);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Upload paper (PDF) ─────────────────────────────────────────── */

exports.uploadPaper = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file provided');
    if (req.file.mimetype !== 'application/pdf') return err(res, 'Only PDF files are allowed');

    // Save file to disk (carpeta privada)
    const filename = `paper-${req.user.id}-${Date.now()}.pdf`;
    const storagePath = await storage.saveStored('research', filename, req.file.buffer);

    // Parse topics
    const topics = req.body.topics
      ? req.body.topics.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    // Parse authors
    const authors = req.body.authors
      ? req.body.authors.split(',').map(a => ({ name: a.trim() }))
      : [];

    // Create source record
    const source = await m.createSource({
      external_id: `upload-${req.user.id}-${Date.now()}`,
      source_api: 'upload',
      title: req.body.title || req.file.originalname,
      authors,
      publication_year: req.body.year ? parseInt(req.body.year) : null,
      abstract: null,
      url: null,
      pdf_url: null,
      is_open_access: true,
      citation_count: 0,
      topics,
      status: 'downloaded',
      added_by: req.user.id,
      visibility: req.body.visibility === 'private' ? 'private' : 'public',
    });

    // Update file_path
    await m.updateSourceFilePath(source.id, storagePath.replace(/^\//, ''));

    // Vectorize in background
    processDocument(null, { storage_path: storagePath, file_type: 'application/pdf' }, source.id)
      .then(() => m.updateSourceStatus(source.id, 'vectorized'))
      .catch(e => { console.error('[VECTORIZE PAPER]', e.message); m.updateSourceStatus(source.id, 'error'); });


    ok(res, source);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Download & vectorize a source ───────────────────────────────── */

exports.downloadSource = async (req, res) => {
  try {
    const source = await m.getSource(req.params.id);
    if (!source || !(await m.canAccessSource(req.user, source))) return err(res, 'Not found', 404);
    if (!source.pdf_url && source.source_api !== 'upload') return err(res, 'No PDF URL available');
    if (source.status === 'vectorized') return err(res, 'Already vectorized');

    // Run in background
    downloadAndVectorize(source.id)
      .then(() => console.log(`[RESEARCH] Source ${source.id} vectorized`))
      .catch(e => console.error(`[RESEARCH] Source ${source.id} failed:`, e.message));

    ok(res, { message: 'Download started', source_id: source.id });
  } catch (e) { err(res, e.message, 500); }
};

/* ── Process all pending sources ────────────────────────────────── */

exports.processAllPending = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return err(res, 'Admin only', 403);

    // Run in background
    processAllPending()
      .then(r => console.log(`[RESEARCH] Batch done: ${r.processed} ok, ${r.failed} failed`))
      .catch(e => console.error('[RESEARCH] Batch failed:', e.message));

    ok(res, { message: 'Processing started' });
  } catch (e) { err(res, e.message, 500); }
};

/* ── Link source to project ─────────────────────────────────────── */

// El proyecto tiene que ser del usuario (o admin)
async function ownsProject(req) {
  return req.user.role === 'admin' || docModel.isProjectOwner(req.params.projectId, req.user.id);
}

exports.linkToProject = async (req, res) => {
  try {
    const { source_id, axis, country_context, relevance_notes } = req.body;
    if (!source_id) return err(res, 'source_id is required');
    if (!(await ownsProject(req))) return err(res, 'Not found', 404);
    const source = await m.getSource(source_id);
    if (!source || !(await m.canAccessSource(req.user, source))) return err(res, 'Source not found', 404);

    const link = await m.linkToProject({
      projectId: req.params.projectId,
      sourceId: source.id,
      axis: axis || null,
      countryContext: country_context || null,
      relevanceNotes: relevance_notes || null,
      addedBy: req.user.id,
    });
    ok(res, link);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Unlink source from project ─────────────────────────────────── */

exports.unlinkFromProject = async (req, res) => {
  try {
    if (!(await ownsProject(req))) return err(res, 'Not found', 404);
    await m.unlinkFromProject(req.params.projectId, req.params.sourceId);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Get project sources ────────────────────────────────────────── */

exports.getProjectSources = async (req, res) => {
  try {
    if (!(await ownsProject(req))) return err(res, 'Not found', 404);
    const sources = await m.getProjectSources(req.params.projectId);
    ok(res, sources);
  } catch (e) { err(res, e.message, 500); }
};
