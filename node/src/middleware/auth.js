const jwt = require('jsonwebtoken');
const aiContext = require('../utils/aiContext');
const db = require('../utils/db');

const SECRET         = () => process.env.JWT_SECRET || 'dev-secret-change-me';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me';

/* ── Token helpers ────────────────────────────────────────────── */
// typ distingue access de refresh (antes compartían secreto y un refresh
// servía como Bearer). tv = users.token_version: al subirlo (logout-all,
// cambio/reseteo de contraseña) caen todas las sesiones del usuario.

function signToken(user) {
  return jwt.sign(
    {
      sub:          user.id,
      email:        user.email,
      name:         user.name,
      role:         user.role || 'user',
      subscription: user.subscription || 'free',
      typ:          'access',
      tv:           user.token_version || 0
    },
    SECRET(),
    { expiresIn: '8h' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, typ: 'refresh', tv: user.token_version || 0 },
    REFRESH_SECRET(),
    { expiresIn: '30d' }
  );
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, REFRESH_SECRET());
  if (payload.typ === 'refresh') return payload;
  // Transición: refresh antiguos sin typ (solo sub). Un access antiguo lleva role.
  if (payload.typ === undefined && payload.role === undefined && payload.sub) return payload;
  throw new jwt.JsonWebTokenError('not a refresh token');
}

/* Solo vale como Bearer un access token. Transición: los access antiguos
   (sin typ) se aceptan si llevan role+email; caducan solos en 8 h. */
function isAccessPayload(p) {
  if (!p || !p.sub) return false;
  if (p.typ === 'access') return true;
  return p.typ === undefined && !!p.role && !!p.email;
}

/* ── Estado vivo del usuario (rol y token_version) ───────────────
   El rol del JWT dura 8 h; se re-lee de BD para que quitar un rol o
   hacer logout-all surta efecto ya, en todos los guardas que miran
   req.user.role. Caché corta en memoria (un solo proceso). */
const STATE_TTL_MS = 30 * 1000;
const stateCache = new Map(); // id → { until, state }

async function loadUserState(id) {
  const hit = stateCache.get(id);
  if (hit && hit.until > Date.now()) return hit.state;
  let rows;
  try {
    [rows] = await db.query('SELECT role, subscription, token_version FROM users WHERE id = ? LIMIT 1', [id]);
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    // Migración 131 aún no aplicada: sin revocación, pero con rol vivo.
    [rows] = await db.query('SELECT role, subscription, 0 AS token_version FROM users WHERE id = ? LIMIT 1', [id]);
  }
  const state = rows[0] || null;
  if (stateCache.size > 5000) stateCache.clear();
  stateCache.set(id, { until: Date.now() + STATE_TTL_MS, state });
  return state;
}

function invalidateUserState(id) { stateCache.delete(id); areaCache.delete(id); }

/* ── Áreas beta (utils/areas.js) ─────────────────────────────────
   Misma caché corta que el rol: conceder o quitar un área surte
   efecto en ≤30 s (al instante en este proceso: el admin invalida). */
const { AREA_KEYS, areaLabel } = require('../utils/areas');
const areaCache = new Map(); // id → { until, areas }

async function getUserAreas(id, role) {
  if (role === 'admin') return AREA_KEYS.slice();
  const hit = areaCache.get(id);
  if (hit && hit.until > Date.now()) return hit.areas;
  let areas = [];
  try {
    const [rows] = await db.query('SELECT area FROM user_areas WHERE user_id = ?', [id]);
    areas = rows.map(r => r.area).filter(a => AREA_KEYS.includes(a));
  } catch (e) {
    // Migración 137 aún no aplicada: nadie (salvo admin) tiene áreas.
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  if (areaCache.size > 5000) areaCache.clear();
  areaCache.set(id, { until: Date.now() + STATE_TTL_MS, areas });
  return areas;
}

/* ── Express middleware — exige un área beta ─────────────────────
   Va después de requireAuth. Si no hay req.user (montado sin
   requireAuth delante) responde 401 como requireAuth.            */
function requireArea(area) {
  return async function areaGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    }
    try {
      const areas = await getUserAreas(req.user.id, req.user.role);
      req.user.areas = areas;
      if (areas.includes(area)) return next();
    } catch (err) {
      console.error('[AUTH] requireArea error:', err.message);
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Auth check failed' } });
    }
    return res.status(403).json({
      ok: false,
      error: {
        code: 'AREA_REQUIRED',
        area,
        message: `Fase beta: ${areaLabel(area)} está abierta solo a clientes seleccionados. Puedes solicitar acceso.`,
      },
    });
  };
}

/* Para montar un router entero: requireAuth + requireArea(area) en un
   solo middleware. `except`: regex sobre req.path que se deja pasar sin
   mirar el área (rutas de staff con su propio guarda dentro del router). */
function areaGate(area, { except = null } = {}) {
  const guard = requireArea(area);
  return function areaGateMw(req, res, next) {
    if (except && except.test(req.path)) return next();
    requireAuth(req, res, (err) => (err ? next(err) : guard(req, res, next)));
  };
}

/* Verifica el Bearer y devuelve el usuario; lanza { code } si no vale
   (o un Error si falla la BD). */
async function authenticate(token) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET());
  } catch (err) {
    throw { code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED' };
  }
  if (!isAccessPayload(payload)) throw { code: 'UNAUTHORIZED' };
  const state = await loadUserState(payload.sub);
  if (!state) throw { code: 'UNAUTHORIZED' };
  if ((payload.tv || 0) !== (state.token_version || 0)) throw { code: 'TOKEN_REVOKED' };
  return {
    id:           payload.sub,
    email:        payload.email,
    name:         payload.name,
    role:         state.role,
    subscription: state.subscription
  };
}

/* ── Express middleware — require valid access token ──────────── */

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false, error: { code: 'UNAUTHORIZED', message: 'Token required' }
    });
  }

  let user;
  try {
    user = await authenticate(header.slice(7));
  } catch (err) {
    if (err instanceof Error) {
      console.error('[AUTH] requireAuth error:', err.message);
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Auth check failed' } });
    }
    return res.status(401).json({
      ok: false, error: { code: err.code, message: 'Invalid or expired token' }
    });
  }
  req.user = user;
  aiContext.set({ userId: user.id, role: user.role });
  next();
}

/* ── Express middleware — optional auth ───────────────────────────
   Sets req.user when a valid token is present, otherwise continues
   as anonymous (req.user = null). Used by teaser-public endpoints
   that serve a trimmed payload to logged-out visitors.            */
async function optionalAuth(req, res, next) {
  req.user = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = await authenticate(header.slice(7));
      aiContext.set({ userId: req.user.id, role: req.user.role });
    } catch (err) {
      req.user = null;
    }
  }
  next();
}

module.exports = {
  requireAuth, optionalAuth, signToken, signRefreshToken, verifyRefreshToken, SECRET,
  invalidateUserState, getUserAreas, requireArea, areaGate
};
