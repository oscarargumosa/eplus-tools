/* ── Research Model — MySQL CRUD for research_sources & project_sources ── */
const db = require('../../utils/db');

/* ── Research Sources ───────────────────────────────────────────── */

async function createSource(data) {
  const [result] = await db.execute(
    `INSERT INTO research_sources
       (external_id, source_api, title, authors, publication_year, abstract, url, pdf_url,
        language, country_focus, topics, citation_count, is_open_access, status, added_by, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), abstract = VALUES(abstract), citation_count = VALUES(citation_count),
       pdf_url = VALUES(pdf_url), updated_at = CURRENT_TIMESTAMP`,
    [
      data.external_id, data.source_api || 'openalex',
      data.title, JSON.stringify(data.authors || []),
      data.publication_year || null, data.abstract || null,
      data.url || null, data.pdf_url || null,
      data.language || null, data.country_focus || null,
      JSON.stringify(data.topics || []), data.citation_count || 0,
      data.is_open_access ? 1 : 0, data.status || 'reference',
      data.added_by || null, data.visibility || 'public',
    ]
  );
  const id = result.insertId || (await getSourceByExternalId(data.external_id, data.source_api))?.id;
  return getSource(id);
}

async function getSource(id) {
  const [rows] = await db.execute('SELECT * FROM research_sources WHERE id = ?', [id]);
  return rows[0] ? parseSource(rows[0]) : null;
}

async function getSourceByExternalId(externalId, sourceApi) {
  const [rows] = await db.execute(
    'SELECT * FROM research_sources WHERE external_id = ? AND source_api = ?',
    [externalId, sourceApi || 'openalex']
  );
  return rows[0] ? parseSource(rows[0]) : null;
}

async function listSources({ addedBy, visibility, status, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM research_sources WHERE 1=1';
  const params = [];

  if (addedBy) { sql += ' AND added_by = ?'; params.push(addedBy); }
  if (visibility) { sql += ' AND visibility = ?'; params.push(visibility); }
  if (status) { sql += ' AND status = ?'; params.push(status); }

  sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

  const [rows] = await db.execute(sql, params);
  return rows.map(parseSource);
}

async function updateSourceStatus(id, status) {
  await db.execute('UPDATE research_sources SET status = ? WHERE id = ?', [status, id]);
}

async function updateSourceFilePath(id, filePath) {
  await db.execute('UPDATE research_sources SET file_path = ? WHERE id = ?', [filePath, id]);
}

async function deleteSource(id) {
  await db.execute('DELETE FROM project_sources WHERE source_id = ?', [id]);
  await db.execute('DELETE FROM research_sources WHERE id = ?', [id]);
}

/* ── Project ↔ Source links ─────────────────────────────────────── */

async function linkToProject({ projectId, sourceId, axis, countryContext, relevanceNotes, addedBy }) {
  await db.execute(
    `INSERT INTO project_sources (project_id, source_id, axis, country_context, relevance_notes, added_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE axis = VALUES(axis), country_context = VALUES(country_context),
       relevance_notes = VALUES(relevance_notes)`,
    [projectId, sourceId, axis || null, countryContext || null, relevanceNotes || null, addedBy]
  );
  return { project_id: projectId, source_id: sourceId };
}

async function unlinkFromProject(projectId, sourceId) {
  await db.execute(
    'DELETE FROM project_sources WHERE project_id = ? AND source_id = ?',
    [projectId, sourceId]
  );
}

async function getProjectSources(projectId) {
  const [rows] = await db.execute(
    `SELECT ps.*, rs.*,
            ps.id AS link_id, rs.id AS source_id,
            ps.axis, ps.country_context, ps.relevance_notes
     FROM project_sources ps
     JOIN research_sources rs ON rs.id = ps.source_id
     WHERE ps.project_id = ?
     ORDER BY ps.axis, ps.country_context, rs.publication_year DESC`,
    [projectId]
  );
  return rows.map(r => ({
    link_id: r.link_id,
    axis: r.axis,
    country_context: r.country_context,
    relevance_notes: r.relevance_notes,
    source: parseSource(r),
  }));
}

/* ── Control de acceso ──────────────────────────────────────────────
   Una fuente se ve si es pública, si la añadió el usuario, si está enlazada
   a un proyecto suyo, o si es admin. */

function accessibleSourcesSql(user, a = 'rs') {
  if (user?.role === 'admin') return { sql: '1=1', params: [] };
  return {
    sql: `(${a}.visibility = 'public' OR ${a}.added_by = ?
      OR ${a}.id IN (SELECT ps.source_id FROM project_sources ps JOIN projects p ON p.id = ps.project_id WHERE p.user_id = ?))`,
    params: [user.id, user.id],
  };
}

async function canAccessSource(user, source) {
  if (!user || !source) return false;
  if (user.role === 'admin' || source.visibility === 'public') return true;
  if (String(source.added_by) === String(user.id)) return true;
  const [rows] = await db.execute(
    `SELECT 1 FROM project_sources ps JOIN projects p ON p.id = ps.project_id
     WHERE ps.source_id = ? AND p.user_id = ? LIMIT 1`,
    [source.id, user.id]
  );
  return rows.length > 0;
}

/* ── Helpers ────────────────────────────────────────────────────── */

function parseSource(row) {
  if (!row) return null;
  return {
    ...row,
    authors: tryParse(row.authors, []),
    topics: tryParse(row.topics, []),
    is_open_access: !!row.is_open_access,
  };
}

function tryParse(val, fallback) {
  if (Array.isArray(val)) return val;
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

module.exports = {
  createSource, getSource, getSourceByExternalId, listSources, deleteSource,
  updateSourceStatus, updateSourceFilePath,
  linkToProject, unlinkFromProject, getProjectSources,
  accessibleSourcesSql, canAccessSource,
};
