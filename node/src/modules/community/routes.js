/* Comunidad — rutas de miembros. Montado en /v1/community detrás de
   areaGate('comunidad') (server.js): sin sesión 401, sin el área 403
   AREA_REQUIRED. Las reglas de privacidad viven en model.js.             */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const m = require('./model');

const h = (fn) => async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, data: await fn(req) });
  } catch (err) {
    if (err instanceof m.HttpError) {
      return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[community]', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } });
  }
};

// Escrituras: tope por persona y minuto (además de los topes por tiempo del modelo).
const writes = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 'u:' + req.user.id,   // siempre hay sesión (areaGate va delante)
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas acciones seguidas. Espera un minuto.' } },
});
router.use((req, res, next) => (req.method === 'GET' ? next() : writes(req, res, next)));

router.get('/me', h(req => m.me(req.user)));
router.put('/me/profile', h(req => m.saveProfile(req.user, req.body)));

router.get('/people', h(req => m.people(req.user, req.query)));
router.get('/people/:id', h(req => m.person(req.user, req.params.id)));

router.get('/activity', h(req => m.activity(req.user)));
router.post('/connections', h(req => m.requestConnection(req.user, (req.body || {}).to, (req.body || {}).message)));
router.post('/connections/:id/accept', h(req => m.respondConnection(req.user, req.params.id, true)));
router.post('/connections/:id/decline', h(req => m.respondConnection(req.user, req.params.id, false)));
router.delete('/connections/:id', h(req => m.removeConnection(req.user, req.params.id)));
router.get('/connections/:id/messages', h(req => m.messages(req.user, req.params.id)));
router.post('/connections/:id/messages', h(req => m.sendMessage(req.user, req.params.id, (req.body || {}).body)));

router.get('/groups', h(req => m.groups(req.user)));
router.get('/groups/:id', h(req => m.group(req.user, req.params.id)));
router.post('/groups/:id/join', h(req => m.joinGroup(req.user, req.params.id, true)));
router.delete('/groups/:id/join', h(req => m.joinGroup(req.user, req.params.id, false)));

router.get('/posts', h(req => m.listPosts(req.user, req.query)));
router.get('/posts/:id', h(req => m.getPost(req.user, req.params.id)));
router.post('/posts', h(req => m.createPost(req.user, req.body)));
router.delete('/posts/:id', h(req => m.removePost(req.user, req.params.id, (req.body || {}).reason)));
router.post('/posts/:id/heart', h(req => m.toggleHeart(req.user, req.params.id)));
router.post('/posts/:id/report', h(req => m.reportPost(req.user, req.params.id, (req.body || {}).reason)));

module.exports = router;
