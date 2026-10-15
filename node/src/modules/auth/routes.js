const { Router } = require('express');
const rateLimit  = require('express-rate-limit');
const controller = require('./controller');
const oidc       = require('./oidc');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

const router = Router();

/* Foto de perfil: pública como los logos (se ve en el menú). */
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const AVATAR_DIR = path.join(__dirname, '../../../../public/uploads/avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, 'avatar-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Sube una imagen JPG, PNG o WebP'));
  }
});

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
router.post  ('/me/avatar', requireAuth, uploadAvatar.single('avatar'), controller.uploadAvatar);
router.delete('/me/avatar', requireAuth, controller.deleteAvatar);
router.post('/change-password', authLimiter, requireAuth, controller.changePassword);
router.get('/session-status', controller.sessionStatus);
router.post('/logout',   controller.logout);

/* ── Login único (OIDC contra Authentik) ─────────────────────── */
router.get('/oidc/login',    oidc.login);
router.get('/oidc/callback', oidc.callback);

module.exports = router;
