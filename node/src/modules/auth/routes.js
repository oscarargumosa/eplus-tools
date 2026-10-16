const { Router } = require('express');
const rateLimit  = require('express-rate-limit');
const controller = require('./controller');
const { requireAuth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

const router = Router();

/* Foto de perfil: pública como los logos (se ve en el menú).
   Tipo comprobado por bytes y extensión puesta por el servidor
   (imageUploadGuard); sin SVG. */
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const { imageUploadGuard } = require('../../utils/image-upload');
const AVATAR_DIR = path.join(__dirname, '../../../../public/uploads/avatars');
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => fs.mkdir(AVATAR_DIR, { recursive: true }, (e) => cb(e || null, AVATAR_DIR)),
    // Sin extensión del cliente: imageUploadGuard pone la del tipo real
    filename: (req, file, cb) => cb(null, 'avatar-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Sube una imagen JPG, PNG, WebP o GIF'), { status: 400 }));
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

/* ── Límite por email (10 / 15 min), además del de IP ──────────
   Frena el ataque repartido entre muchas IPs contra una sola cuenta.
   En login solo cuentan los intentos fallidos. */
const emailKey = req => String((req.body && req.body.email) || '').toLowerCase().trim();
const emailLimiterOpts = {
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => 'email:' + emailKey(req),
  skip: req => !emailKey(req),
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Demasiados intentos para esta cuenta. Prueba en 15 minutos.' } }
};
const loginEmailLimiter  = rateLimit({ ...emailLimiterOpts, skipSuccessfulRequests: true });
const emailActionLimiter = rateLimit(emailLimiterOpts);

/* ── Endpoints ───────────────────────────────────────────────── */
router.post('/register', authLimiter, validate({ email: 'required', password: 'required', name: 'required' }), controller.register);
router.post('/login',    authLimiter, loginEmailLimiter, validate({ email: 'required', password: 'required' }), controller.login);
router.post('/google',   authLimiter, controller.google);
router.get ('/verify-email',          controller.verifyEmail);
router.post('/verify-email',          controller.verifyEmail);
router.post('/resend-verification',   authLimiter, emailActionLimiter, controller.resendVerification);
router.post('/forgot-password',       authLimiter, emailActionLimiter, controller.forgotPassword);
router.post('/reset-password',        authLimiter, controller.resetPassword);
router.post('/refresh',  controller.refresh);
router.get('/me',        requireAuth, controller.me);
router.patch('/me',      requireAuth, validate({ name: 'required' }), controller.updateMe);
router.post  ('/me/avatar', requireAuth, uploadAvatar.single('avatar'), imageUploadGuard(), controller.uploadAvatar);
router.delete('/me/avatar', requireAuth, controller.deleteAvatar);
router.post('/change-password', authLimiter, requireAuth, controller.changePassword);
router.get('/session-status', controller.sessionStatus);
router.post('/logout',   controller.logout);
router.post('/logout-all', requireAuth, controller.logoutAll);

module.exports = router;
