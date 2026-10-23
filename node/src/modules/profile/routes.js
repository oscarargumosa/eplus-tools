/* Perfil de la persona — /v1/profile (solo con sesión). Ver docs/PERFIL.md. */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const m = require('./model');

const router = Router();
router.use(requireAuth);

const h = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req, res) });
  } catch (err) {
    if (err instanceof m.HttpError) {
      return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[profile]', err.message);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se ha podido guardar el perfil' } });
  }
};

// Mi perfil, lo que falta y las listas (roles, ámbitos, países con su prefijo).
router.get('/me', h(req => m.me(req.user.id, req.t)));

// Guarda solo los campos que llegan (cada paso del asistente manda los suyos).
router.patch('/me', h(async req => {
  const out = await m.save(req.user.id, req.body, req.t);
  audit(req, 'profile.update', { targetType: 'user', targetId: req.user.id, meta: { fields: Object.keys(req.body || {}) } });
  return out;
}));

// Buscar pueblo o ciudad para marcar la ubicación. Tope: 60 búsquedas por minuto y persona.
const placesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => 'places:' + req.user.id,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Has buscado muchos lugares seguidos. Espera un momento.' } },
});
router.get('/places', placesLimiter, h(req => m.places(req.query.q, parseFloat(req.query.lat), parseFloat(req.query.lng))));

// Asistente del primer acceso visto (terminado u omitido): no se vuelve a abrir entero.
router.post('/me/wizard-seen', h(async req => { await m.wizardSeen(req.user.id); return { ok: true }; }));

module.exports = router;
