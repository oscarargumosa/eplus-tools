/* ── Acceso beta (persona) — /v1/access-requests ─────────────────
   POST /        { area, message? } → pide acceso a un área beta
   GET  /mine    → última solicitud de cada área + áreas que tiene
   POST /seen    { areas: [...] } → ya vio el aviso «Ya tienes acceso» */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { requireAuth, getUserAreas } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { AREAS, areaLabel } = require('../../utils/areas');
const email = require('../../utils/email');
const m = require('./model');

const h = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req, res) });
  } catch (err) {
    if (err instanceof m.HttpError) {
      return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, ...(err.extra || {}) } });
    }
    console.error('[access]', err.message);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } });
  }
};

const requestLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Prueba en un minuto.' } },
});

router.get('/mine', requireAuth, h(async req => ({
  areas: await getUserAreas(req.user.id, req.user.role),
  requests: await m.myRequests(req.user.id),
})));

router.post('/', requestLimiter, requireAuth, h(async req => {
  const { area, message } = req.body || {};
  const areas = await getUserAreas(req.user.id, req.user.role);
  const r = await m.createRequest(req.user, area, message, areas.includes(area));
  if (r.created) {
    audit(req, 'request.create', { targetType: 'access_request', targetId: r.request.id, meta: { area } });
    // Aviso a Óscar: nunca bloquea ni rompe la respuesta.
    email.sendAccessRequestNotice({ user: req.user, areaLabel: areaLabel(area), message: r.message })
      .catch(e => console.warn('[access] aviso no enviado:', e.message));
  }
  return { already: !r.created, request: r.request };
}));

router.post('/seen', requireAuth, h(async req => {
  const n = await m.markSeen(req.user.id, (req.body || {}).areas);
  return { updated: n };
}));

// Catálogo de áreas (etiquetas) para la SPA.
router.get('/areas', requireAuth, h(async () => Object.entries(AREAS).map(([key, a]) => ({ key, label: a.label }))));

module.exports = router;
