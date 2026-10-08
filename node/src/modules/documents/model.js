/* ── Documents Model — MySQL + local disk ─────────────────────── */
const db = require('../../utils/db');
const storage = require('../../utils/private-storage');

/* ── Documents CRUD ──────────────────────────────────────────── */

async function listDocuments({ ownerType, ownerId, status }) {
  let sql = "SELECT * FROM documents WHERE status != 'deleted'";
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (ownerType) { sql += ' AND owner_type = ?'; params.push(ownerType); }
  if (ownerId)   { sql += ' AND owner_id = ?';   params.push(ownerId); }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await db.execute(sql, params);
  return rows.map(parseDoc);
}

async function getDocument(id) {
  const [rows] = await db.execute('SELECT * FROM documents WHERE id = ?', [id]);
  return rows[0] ? parseDoc(rows[0]) : null;
}

async function createDocument(doc) {
  const tags = JSON.stringify(doc.tags || []);
  const [result] = await db.execute(
    `INSERT INTO documents (owner_type, owner_id, doc_type, title, description, file_type, file_size_bytes, storage_path, tags, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [doc.owner_type, doc.owner_id || null, doc.doc_type || 'support', doc.title, doc.description || null,
     doc.file_type || null, doc.file_size_bytes || 0, doc.storage_path || null, tags, doc.status || 'active']
  );
  return getDocument(result.insertId);
}

async function updateDocument(id, fields) {
  const allowed = ['title', 'description', 'tags', 'status', 'doc_type'];
  const sets = []; const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(key === 'tags' ? JSON.stringify(fields[key]) : fields[key]);
    }
  }
  if (sets.length === 0) return getDocument(id);
  params.push(id);
  await db.execute(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, params);
  return getDocument(id);
}

async function deleteDocument(id) {
  await db.execute("UPDATE documents SET status = 'deleted' WHERE id = ?", [id]);
}

/* ── File storage (carpeta privada, ver utils/private-storage) ── */

// kind: 'documents' (por defecto) o 'evaluator'
async function saveFile(buffer, filename, kind = 'documents') {
  return storage.saveStored(kind, filename, buffer);
}

async function removeFile(storagePath) {
  await storage.removeStored(storagePath);
}

/** Read file from disk as Buffer (privado primero, luego ruta antigua) */
async function readFile(storagePath) {
  return storage.readStored(storagePath);
}

/* ── Control de acceso ───────────────────────────────────────────
   Un usuario ve un documento si: es admin, es de plataforma (oficial,
   visible para todos a propósito), es suyo (user_private), es de un
   proyecto suyo (owner_type 'project') o está enlazado a un proyecto suyo. */

async function isProjectOwner(projectId, userId) {
  if (!projectId || !userId) return false;
  const [rows] = await db.execute('SELECT 1 FROM projects WHERE id = ? AND user_id = ? LIMIT 1', [String(projectId), userId]);
  return rows.length > 0;
}

async function canAccessDocument(user, doc) {
  if (!user || !doc) return false;
  if (user.role === 'admin') return true;
  if (doc.status === 'deleted') return false;
  if (doc.owner_type === 'platform') return true;
  if (doc.owner_type === 'user_private') return String(doc.owner_id) === String(user.id);
  if (doc.owner_type === 'project' && await isProjectOwner(doc.owner_id, user.id)) return true;
  const [rows] = await db.execute(
    `SELECT 1 FROM project_documents pd JOIN projects p ON p.id = pd.project_id
     WHERE pd.document_id = ? AND p.user_id = ? LIMIT 1`,
    [doc.id, user.id]
  );
  return rows.length > 0;
}

/** Mismo criterio en SQL, para filtrar en bloque (alias de documents). */
function accessibleDocsSql(user, a = 'd') {
  if (user?.role === 'admin') return { sql: '1=1', params: [] };
  return {
    sql: `(${a}.owner_type = 'platform'
      OR (${a}.owner_type = 'user_private' AND ${a}.owner_id = ?)
      OR (${a}.owner_type = 'project' AND ${a}.owner_id COLLATE utf8mb4_unicode_ci IN (SELECT id FROM projects WHERE user_id = ?))
      OR ${a}.id IN (SELECT pd.document_id FROM project_documents pd JOIN projects p ON p.id = pd.project_id WHERE p.user_id = ?))`,
    params: [user.id, user.id, user.id],
  };
}

/** Quita lo que no debe salir al cliente (ruta en disco, texto completo). */
function publicDoc(doc) {
  if (!doc) return doc;
  const { storage_path, body_text, ...rest } = doc;
  return rest;
}

/** Documentos que llevan >N min en 'processing' (el proceso murió a medias) → 'error'. */
async function failStaleProcessing(minutes = 30) {
  const [r] = await db.execute(
    `UPDATE documents SET status = 'error'
     WHERE status = 'processing' AND updated_at < (NOW() - INTERVAL ${parseInt(minutes, 10)} MINUTE)`
  );
  return r.affectedRows || 0;
}

/* ── Document ↔ Program links ────────────────────────────────── */

async function linkDocumentToProgram(documentId, programId) {
  await db.execute(
    'INSERT IGNORE INTO document_programs (document_id, program_id) VALUES (?, ?)',
    [documentId, programId]
  );
  const [rows] = await db.execute(
    'SELECT * FROM document_programs WHERE document_id = ? AND program_id = ?',
    [documentId, programId]
  );
  return rows[0];
}

async function unlinkDocumentFromProgram(documentId, programId) {
  await db.execute(
    'DELETE FROM document_programs WHERE document_id = ? AND program_id = ?',
    [documentId, programId]
  );
}

async function getDocumentsByProgram(programId) {
  const [rows] = await db.execute(
    `SELECT d.* FROM documents d
     JOIN document_programs dp ON dp.document_id = d.id
     WHERE dp.program_id = ? AND d.status != 'deleted'
     ORDER BY d.created_at DESC`,
    [programId]
  );
  return rows.map(parseDoc);
}

/* ── Document ↔ Project links ────────────────────────────────── */

async function linkDocumentToProject({ projectId, documentId, source, addedBy }) {
  await db.execute(
    `INSERT INTO project_documents (project_id, document_id, source, added_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE source = VALUES(source)`,
    [projectId, documentId, source || 'user', addedBy]
  );
  const [rows] = await db.execute(
    'SELECT * FROM project_documents WHERE project_id = ? AND document_id = ?',
    [projectId, documentId]
  );
  return rows[0];
}

async function unlinkDocumentFromProject(projectId, documentId) {
  await db.execute(
    'DELETE FROM project_documents WHERE project_id = ? AND document_id = ?',
    [projectId, documentId]
  );
}

async function getProjectDocuments(projectId) {
  const [rows] = await db.execute(
    `SELECT d.*, pd.source, pd.added_at FROM documents d
     JOIN project_documents pd ON pd.document_id = d.id
     WHERE pd.project_id = ? AND d.status != 'deleted'
     ORDER BY pd.added_at DESC`,
    [projectId]
  );
  return rows.map(r => ({ ...parseDoc(r), source: r.source, added_at: r.added_at }));
}

/* ── Helpers ─────────────────────────────────────────────────── */

function parseDoc(row) {
  if (!row) return null;
  if (row.tags && typeof row.tags === 'string') {
    try { row.tags = JSON.parse(row.tags); } catch { row.tags = []; }
  }
  return row;
}

module.exports = {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  saveFile,
  removeFile,
  readFile,
  isProjectOwner,
  canAccessDocument,
  accessibleDocsSql,
  publicDoc,
  failStaleProcessing,
  linkDocumentToProgram,
  unlinkDocumentFromProgram,
  getDocumentsByProgram,
  linkDocumentToProject,
  unlinkDocumentFromProject,
  getProjectDocuments,
};
