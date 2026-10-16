/* Comunidad — equipo (solo role admin). Montado en /v1/admin/community,
   antes que /v1/admin (como «Usuarios y accesos»): cada acción deja su
   propia línea en audit_log.                                             */

const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const m = require('./model');

router.use(requireAuth, (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  next();
});

const h = (fn) => async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, data: await fn(req) });
  } catch (err) {
    if (err instanceof m.HttpError) {
      return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[admin/community]', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } });
  }
};

router.get('/pending-count', h(async () => ({ count: await m.adminPendingCount() })));

router.get('/groups', h(() => m.adminGroups()));
router.post('/groups', h(async req => {
  const r = await m.adminSaveGroup(req.user, null, req.body);
  audit(req, 'community.group.create', { targetType: 'community_group', targetId: r.id });
  return r;
}));
router.put('/groups/:id', h(async req => {
  const r = await m.adminSaveGroup(req.user, req.params.id, req.body);
  audit(req, 'community.group.update', { targetType: 'community_group', targetId: r.id, meta: { archived: !!(req.body || {}).archived } });
  return r;
}));

router.get('/reports', h(req => m.adminReports(req.query.status)));
router.post('/reports/:id/resolve', h(async req => {
  const r = await m.adminResolveReport(req.user, req.params.id, (req.body || {}).action);
  audit(req, 'community.report.' + r.action, { targetType: 'community_report', targetId: r.id, meta: { post_id: r.post_id } });
  return r;
}));

router.get('/posts', h(req => m.adminPosts(req.query.filter)));
router.post('/posts/:id/hide', h(async req => {
  const r = await m.adminSetHidden(req.user, req.params.id, true, (req.body || {}).reason);
  audit(req, 'community.post.hide', { targetType: 'community_post', targetId: r.id });
  return r;
}));
router.post('/posts/:id/unhide', h(async req => {
  const r = await m.adminSetHidden(req.user, req.params.id, false);
  audit(req, 'community.post.unhide', { targetType: 'community_post', targetId: r.id });
  return r;
}));

module.exports = router;
