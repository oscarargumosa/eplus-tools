const jwt = require('jsonwebtoken');
const aiContext = require('../utils/aiContext');

const SECRET         = () => process.env.JWT_SECRET || 'dev-secret-change-me';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me';

/* ── Token helpers ────────────────────────────────────────────── */

function signToken(user) {
  return jwt.sign(
    {
      sub:          user.id,
      email:        user.email,
      name:         user.name,
      role:         user.role || 'user',
      subscription: user.subscription || 'free'
    },
    SECRET(),
    { expiresIn: '8h' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    REFRESH_SECRET(),
    { expiresIn: '30d' }
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET());
}

/* ── Express middleware — require valid access token ──────────── */

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false, error: { code: 'UNAUTHORIZED', message: 'Token required' }
    });
  }

  try {
    const payload = jwt.verify(header.slice(7), SECRET());
    req.user = {
      id:           payload.sub,
      email:        payload.email,
      name:         payload.name,
      role:         payload.role,
      subscription: payload.subscription
    };
    aiContext.set({ userId: payload.sub, role: payload.role });
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
    return res.status(401).json({
      ok: false, error: { code, message: 'Invalid or expired token' }
    });
  }
}

/* ── Express middleware — optional auth ───────────────────────────
   Sets req.user when a valid token is present, otherwise continues
   as anonymous (req.user = null). Used by teaser-public endpoints
   that serve a trimmed payload to logged-out visitors.            */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), SECRET());
      req.user = {
        id:           payload.sub,
        email:        payload.email,
        name:         payload.name,
        role:         payload.role,
        subscription: payload.subscription
      };
      aiContext.set({ userId: payload.sub, role: payload.role });
    } catch (err) {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

module.exports = { requireAuth, optionalAuth, signToken, signRefreshToken, verifyRefreshToken, SECRET };
