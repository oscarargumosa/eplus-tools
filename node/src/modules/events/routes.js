/* ── Events Routes — /v1/events/* (behavioral tracking) ──────────────── */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { optionalAuth, requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

// Admin-only guard (scribes excluded) for the engagement dashboard.
function requireAdminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}

// Generous: events are batched (~1 flush / 5s) but navigation bursts +
// multiple tabs can spike. 120 POSTs/min per IP is plenty for a human.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many events.' } },
});

router.post('/', trackLimiter, optionalAuth, ctrl.track);
router.get('/engagement', requireAuth, requireAdminOnly, ctrl.engagement);

module.exports = router;
