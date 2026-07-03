const { Router } = require('express');
const rateLimit  = require('express-rate-limit');
const controller = require('./controller');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

const router = Router();

/* ── Rate limiter for auth endpoints (5 req/min per IP) ──────── */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a minute.' } }
});

/* ── Endpoints ───────────────────────────────────────────────── */
router.post('/register', authLimiter, validate({ email: 'required', password: 'required', name: 'required' }), controller.register);
router.post('/login',    authLimiter, validate({ email: 'required', password: 'required' }), controller.login);
router.post('/google',   authLimiter, controller.google);
router.get ('/verify-email',          controller.verifyEmail);
router.post('/verify-email',          controller.verifyEmail);
router.post('/resend-verification',   authLimiter, controller.resendVerification);
router.post('/forgot-password',       authLimiter, controller.forgotPassword);
router.post('/reset-password',        authLimiter, controller.resetPassword);
router.post('/refresh',  controller.refresh);
router.get('/me',        requireAuth, controller.me);
router.patch('/me',      requireAuth, validate({ name: 'required' }), controller.updateMe);
router.post('/change-password', authLimiter, requireAuth, controller.changePassword);
router.get('/session-status', controller.sessionStatus);
router.post('/logout',   controller.logout);

module.exports = router;
