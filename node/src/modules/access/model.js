/* ═══════════════════════════════════════════════════════════════
   Acceso beta — áreas por persona y solicitudes (oct-2026)
   Tablas: user_areas (137) y access_requests (138).
   Lista de áreas: utils/areas.js. Guarda: middleware/auth.js.
   ═══════════════════════════════════════════════════════════════ */

const db = require('../../utils/db');
const { AREA_KEYS, isArea } = require('../../utils/areas');
const { invalidateUserState } = require('../../middleware/auth');

class HttpError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

function splitAreas(csv) {
  return String(csv || '').split(',').filter(a => AREA_KEYS.includes(a));
}

/* ── Persona ──────────────────────────────────────────────────── */

// Solicitudes de la persona: la última de cada área.
async function myRequests(userId) {
  const [rows] = await db.query(
    `SELECT id, area, status, created_at, resolved_at
       FROM access_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC`, [userId]);
  const seen = new Set();
  return rows.filter(r => !seen.has(r.area) && seen.add(r.area));
}

async function createRequest(user, area, message, hasArea) {
  if (!isArea(area)) throw new HttpError(400, 'VALIDATION', 'Área no válida');
  if (hasArea) throw new HttpError(409, 'ALREADY_GRANTED', 'Ya tienes acceso a esta área');
  const msg = typeof message === 'string' ? message.trim().slice(0, 500) : '';
  try {
    const [r] = await db.query(
      'INSERT INTO access_requests (user_id, area, message) VALUES (?, ?, ?)',
      [user.id, area, msg || null]);
    const [[row]] = await db.query(
      'SELECT id, area, status, created_at FROM access_requests WHERE id = ?', [r.insertId]);
    return { created: true, request: row, message: msg };
  } catch (e) {
    // Ya hay una pendiente (índice único uq_access_req_pending).
    if (e.code !== 'ER_DUP_ENTRY') throw e;
    const [[row]] = await db.query(
      `SELECT id, area, status, created_at FROM access_requests
        WHERE user_id = ? AND area = ? AND status = 'pending' LIMIT 1`, [user.id, area]);
    return { created: false, request: row };
  }
}

// Áreas concedidas cuyo aviso «Ya tienes acceso» aún no ha visto.
async function unseenAreas(userId) {
  try {
    const [rows] = await db.query(
      'SELECT area FROM user_areas WHERE user_id = ? AND seen_at IS NULL', [userId]);
    return rows.map(r => r.area).filter(a => AREA_KEYS.includes(a));
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

async function markSeen(userId, areas) {
  const list = (Array.isArray(areas) ? areas : []).filter(isArea);
  if (!list.length) return 0;
  const [r] = await db.query(
    'UPDATE user_areas SET seen_at = NOW() WHERE user_id = ? AND area IN (?) AND seen_at IS NULL',
    [userId, list]);
  return r.affectedRows;
}

/* ── Admin ────────────────────────────────────────────────────── */

const FILTERS = {
  all:      '1=1',
  with:     "(u.role = 'admin' OR EXISTS (SELECT 1 FROM user_areas ua WHERE ua.user_id = u.id))",
  without:  "(u.role <> 'admin' AND NOT EXISTS (SELECT 1 FROM user_areas ua WHERE ua.user_id = u.id))",
  pending:  "EXISTS (SELECT 1 FROM access_requests r WHERE r.user_id = u.id AND r.status = 'pending')",
};

async function listUsers({ q = '', filter = 'all', page = 1, limit = 25 } = {}) {
  const where = [FILTERS[filter] || FILTERS.all];
  const params = [];
  const needle = String(q || '').trim().slice(0, 100);
  if (needle) {
    where.push('(u.name LIKE ? OR u.email LIKE ?)');
    const like = '%' + needle.replace(/[\\%_]/g, c => '\\' + c) + '%';
    params.push(like, like);
  }
  const lim = Math.min(100, Math.max(5, parseInt(limit, 10) || 25));
  const pg  = Math.max(1, parseInt(page, 10) || 1);
  const whereSql = where.join(' AND ');

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`, params);
  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.email_verified, u.created_at, u.interno, u.phone,
            (SELECT MAX(a.ts) FROM audit_log a
              WHERE a.actor_user_id = u.id AND a.action = 'auth.login') AS last_login,
            (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
            (SELECT GROUP_CONCAT(ua.area ORDER BY ua.area) FROM user_areas ua WHERE ua.user_id = u.id) AS areas_csv,
            (SELECT COUNT(*) FROM access_requests r WHERE r.user_id = u.id AND r.status = 'pending') AS pending_count
       FROM users u
      WHERE ${whereSql}
      ORDER BY pending_count DESC, u.created_at DESC
      LIMIT ? OFFSET ?`, [...params, lim, (pg - 1) * lim]);

  const ids = rows.map(r => r.id);
  const pendingBy = {};
  if (ids.length) {
    const [reqs] = await db.query(
      `SELECT id, user_id, area, message, created_at FROM access_requests
        WHERE status = 'pending' AND user_id IN (?) ORDER BY created_at`, [ids]);
    reqs.forEach(r => { (pendingBy[r.user_id] = pendingBy[r.user_id] || []).push(
      { id: r.id, area: r.area, message: r.message, created_at: r.created_at }); });
  }

  const items = rows.map(r => ({
    id: r.id, name: r.name, email: r.email, role: r.role,
    email_verified: !!r.email_verified,
    phone: r.phone || null,   // privado: solo lo ve el equipo
    interno: !!r.interno || r.role !== 'user',
    created_at: r.created_at,
    last_login: r.last_login,
    projects: Number(r.projects) || 0,
    areas: r.role === 'admin' ? AREA_KEYS.slice() : splitAreas(r.areas_csv),
    pending: pendingBy[r.id] || [],
  }));
  return { items, total: Number(total), page: pg, pages: Math.max(1, Math.ceil(total / lim)), limit: lim };
}

async function pendingCount() {
  try {
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM access_requests WHERE status = 'pending'");
    return Number(n);
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return 0;
    throw e;
  }
}

async function getUser(id) {
  const [[u]] = await db.query('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [id]);
  return u || null;
}

/* Concede un área. Devuelve { user, granted (nueva), approved (solicitudes
   pendientes de esa área que quedan aprobadas) }. */
async function grant(userId, area, adminId) {
  if (!isArea(area)) throw new HttpError(400, 'VALIDATION', 'Área no válida');
  const user = await getUser(userId);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
  if (user.role === 'admin') throw new HttpError(400, 'VALIDATION', 'Un admin ya tiene todas las áreas');
  const [ins] = await db.query(
    'INSERT IGNORE INTO user_areas (user_id, area, granted_by) VALUES (?, ?, ?)', [userId, area, adminId]);
  const [upd] = await db.query(
    `UPDATE access_requests SET status = 'approved', resolved_at = NOW(), resolved_by = ?
      WHERE user_id = ? AND area = ? AND status = 'pending'`, [adminId, userId, area]);
  invalidateUserState(userId);
  return { user, granted: ins.affectedRows > 0, approved: upd.affectedRows };
}

async function revoke(userId, area) {
  if (!isArea(area)) throw new HttpError(400, 'VALIDATION', 'Área no válida');
  const user = await getUser(userId);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
  const [del] = await db.query('DELETE FROM user_areas WHERE user_id = ? AND area = ?', [userId, area]);
  invalidateUserState(userId);
  return { user, revoked: del.affectedRows > 0 };
}

/* Marca la cuenta como «de casa» (equipo o pruebas): Engagement la aparta del
   tráfico de fuera. Los roles distintos de 'user' ya cuentan como de casa. */
async function setInterno(userId, on) {
  const user = await getUser(userId);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
  const [upd] = await db.query('UPDATE users SET interno = ? WHERE id = ?', [on ? 1 : 0, userId]);
  return { user, changed: upd.changedRows > 0 };
}

async function getPendingRequest(id) {
  const [[r]] = await db.query(
    "SELECT id, user_id, area, status FROM access_requests WHERE id = ? LIMIT 1", [id]);
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Solicitud no encontrada');
  if (r.status !== 'pending') throw new HttpError(409, 'ALREADY_RESOLVED', 'La solicitud ya estaba resuelta');
  return r;
}

async function reject(id, adminId) {
  const r = await getPendingRequest(id);
  await db.query(
    `UPDATE access_requests SET status = 'rejected', resolved_at = NOW(), resolved_by = ?
      WHERE id = ? AND status = 'pending'`, [adminId, id]);
  return r;
}

module.exports = {
  HttpError, myRequests, createRequest, unseenAreas, markSeen,
  listUsers, pendingCount, grant, revoke, setInterno, getPendingRequest, reject,
};
