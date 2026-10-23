const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./controller');

const router = Router();

// Por persona: 60 traducciones por hora (las ya guardadas también cuentan).
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => 'tr:' + (req.user ? req.user.id : req.ip),
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Has traducido muchos textos seguidos. Prueba dentro de un rato.' } },
});

router.post('/', requireAuth, limiter, controller.translate);

module.exports = router;
