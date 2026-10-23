/* ═══════════════════════════════════════════════════════════════
   Sesiones en servidor (migración 147, user_sessions)
   ─────────────────────────────────────────────────────────────
   Una fila = un inicio de sesión (una «familia» de refresh tokens).
   El refresh JWT lleva sid (fila) y jti (versión vigente). En cada
   /refresh se rota el jti; el anterior queda en prev_jti.
   - jti vigente → rota y emite uno nuevo.
   - jti anterior dentro de GRACE_MS → no rota otra vez: devuelve el
     vigente (dos pestañas o dos peticiones que refrescan a la vez).
   - cualquier otro jti, o el anterior pasado el margen → reutilización
     de un token ya rotado (robo): se revoca la familia entera.
   Los refresh antiguos sin jti (anteriores al despliegue) se aceptan
   UNA vez: se convierten en sesión guardando su sha256 en legacy_hash.
   El access token lleva sid: requireAuth comprueba que la sesión sigue
   viva (caché de 30 s, como token_version), así cerrar sesión corta
   también el access token en ≤30 s.
   ═══════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const db = require('../../utils/db');
const uuid = require('../../utils/uuid');

const SESSION_DAYS = 30;          // vida del refresh (deslizante: se renueva al rotar)
const GRACE_MS     = 60 * 1000;   // margen para refrescos simultáneos
const CACHE_TTL_MS = 30 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// Fechas siempre en SQL (NOW()), nunca mezcladas con la hora de Node.
const EXPIRES_SQL = `NOW() + INTERVAL ${SESSION_DAYS} DAY`;
const GRACE_S = Math.round(GRACE_MS / 1000);
const SELECT_ROW = `SELECT s.*, (s.revoked_at IS NULL AND s.expires_at > NOW()) AS is_alive,
  (s.rotated_at IS NOT NULL AND s.rotated_at > NOW() - INTERVAL ${GRACE_S} SECOND) AS rotated_recently,
  (s.created_at > NOW() - INTERVAL ${GRACE_S} SECOND) AS created_recently
  FROM user_sessions s`;

/* «Chrome · Windows»: lo justo para que la persona reconozca el dispositivo. */
function shortUA(ua) {
  ua = String(ua || '');
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser || os) return [browser, os].filter(Boolean).join(' · ');
  return ua.slice(0, 120);
}

/* IP truncada: /24 en IPv4, /48 en IPv6. */
function truncIp(ip) {
  ip = String(ip || '').replace(/^::ffff:/i, '');
  if (!ip) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').slice(0, 3).join('.') + '.0';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::';
  return null;
}

/* ── Limpieza perezosa: como mucho una vez cada 6 h, sin cron ──── */
let lastCleanup = 0;
function maybeCleanup() {
  if (Date.now() - lastCleanup < 6 * 3600 * 1000) return;
  lastCleanup = Date.now();
  // Revocadas se guardan 7 días (para explicar un 401); caducadas, 1 día.
  db.query(
    `DELETE FROM user_sessions
      WHERE expires_at < NOW() - INTERVAL 1 DAY
         OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL 7 DAY)
      LIMIT 5000`
  ).catch(e => console.warn('[sessions] limpieza:', e.message));
}

/* ── Caché sid → { until, active, userId } ──────────────────────── */
const cache = new Map();
function forget(sid) { cache.delete(sid); }
function forgetUser(userId) { for (const [k, v] of cache) if (v.userId === userId) cache.delete(k); }

async function create(userId, req, { legacyHash = null } = {}) {
  maybeCleanup();
  const sid = uuid();
  const jti = uuid();
  const h = (req && req.headers) || {};
  await db.query(
    `INSERT INTO user_sessions (id, user_id, jti, legacy_hash, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ${EXPIRES_SQL}, ?, ?)`,
    [sid, userId, jti, legacyHash, shortUA(h['user-agent']), truncIp(req && req.ip)]
  );
  return { sid, jti };
}

async function get(sid) {
  const [[row]] = await db.query(`${SELECT_ROW} WHERE s.id = ? LIMIT 1`, [sid]);
  return row || null;
}

function alive(row) {
  return !!(row && Number(row.is_alive));
}

async function revoke(sid, reason = 'logout') {
  if (!sid) return;
  await db.query(
    'UPDATE user_sessions SET revoked_at = NOW(), revoked_reason = ? WHERE id = ? AND revoked_at IS NULL',
    [reason, sid]
  );
  forget(sid);
}

async function revokeAll(userId, reason = 'logout_all') {
  const [r] = await db.query(
    'UPDATE user_sessions SET revoked_at = NOW(), revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL',
    [reason, userId]
  );
  forgetUser(userId);
  return r.affectedRows || 0;
}

/* Rotación del refresh. payload: { sub, sid, jti }.
   Devuelve { status: 'ok'|'grace', sid, jti } o { status: 'invalid'|'reuse' }. */
async function rotate(payload) {
  const row = await get(payload.sid);
  if (!row || row.user_id !== payload.sub || !alive(row)) return { status: 'invalid' };

  if (payload.jti === row.jti) {
    const next = uuid();
    // Condición en el UPDATE: si dos peticiones rotan a la vez, solo una gana.
    const [r] = await db.query(
      `UPDATE user_sessions SET prev_jti = jti, jti = ?, rotated_at = NOW(), last_used_at = NOW(), expires_at = ${EXPIRES_SQL}
        WHERE id = ? AND jti = ? AND revoked_at IS NULL`,
      [next, row.id, row.jti]
    );
    if (r.affectedRows) return { status: 'ok', sid: row.id, jti: next };
    return rotate(payload);   // la otra ganó: ahora este jti es el anterior → margen
  }

  if (payload.jti && payload.jti === row.prev_jti && Number(row.rotated_recently)) {
    return { status: 'grace', sid: row.id, jti: row.jti };
  }

  await revoke(row.id, 'reuse');
  return { status: 'reuse', userId: row.user_id };
}

/* Refresh antiguo sin jti: se acepta una vez y se convierte en sesión. */
async function adoptLegacy(userId, token, req) {
  const legacyHash = sha256(token);
  const [[row]] = await db.query(`${SELECT_ROW} WHERE s.legacy_hash = ? LIMIT 1`, [legacyHash]);
  if (!row) {
    try {
      return { status: 'ok', ...(await create(userId, req, { legacyHash })) };
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
      return adoptLegacy(userId, token, req);   // otra petición lo convirtió a la vez
    }
  }
  if (row.user_id !== userId || !alive(row)) return { status: 'invalid' };
  if (Number(row.created_recently)) {
    return { status: 'grace', sid: row.id, jti: row.jti };
  }
  await revoke(row.id, 'reuse');
  return { status: 'reuse', userId: row.user_id };
}

/* Cerrar sesión con un refresh (con o sin jti). Un refresh antiguo sin
   jti se «quema»: se guarda como sesión ya revocada para que no valga. */
async function revokeByToken(payload, token) {
  if (payload.sid) {
    const row = await get(payload.sid);
    if (row && row.user_id === payload.sub) await revoke(row.id, 'logout');
    return;
  }
  const legacyHash = sha256(token);
  const [r] = await db.query(
    "UPDATE user_sessions SET revoked_at = NOW(), revoked_reason = 'logout' WHERE legacy_hash = ? AND revoked_at IS NULL",
    [legacyHash]
  );
  if (!r.affectedRows) {
    await db.query(
      `INSERT IGNORE INTO user_sessions (id, user_id, jti, legacy_hash, expires_at, revoked_at, revoked_reason)
       VALUES (?, ?, ?, ?, ${EXPIRES_SQL}, NOW(), 'logout')`,
      [uuid(), payload.sub, uuid(), legacyHash]
    );
  }
}

/* Solo lectura (session-status): ¿este refresh abriría sesión? */
async function peek(payload, token) {
  if (payload.sid) {
    const row = await get(payload.sid);
    return !!(alive(row) && row.user_id === payload.sub && (payload.jti === row.jti || payload.jti === row.prev_jti));
  }
  const [[row]] = await db.query('SELECT revoked_at FROM user_sessions WHERE legacy_hash = ? LIMIT 1', [sha256(token)]);
  return !row || !row.revoked_at;
}

/* Para requireAuth: ¿la sesión del access token sigue viva? (caché 30 s) */
async function isActive(sid) {
  const hit = cache.get(sid);
  if (hit && hit.until > Date.now()) return hit.active;
  const row = await get(sid);
  const active = !!alive(row);
  if (cache.size > 5000) cache.clear();
  cache.set(sid, { until: Date.now() + CACHE_TTL_MS, active, userId: row && row.user_id });
  return active;
}

/* Sesiones abiertas de una persona (para la exportación de datos). */
async function listForUser(userId) {
  const [rows] = await db.query(
    `SELECT id, created_at, last_used_at, expires_at, revoked_at, revoked_reason, user_agent, ip
       FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC`, [userId]
  );
  return rows;
}

module.exports = {
  SESSION_DAYS, GRACE_MS, create, rotate, adoptLegacy, revoke, revokeAll, revokeByToken,
  peek, isActive, listForUser, shortUA, truncIp,
};
