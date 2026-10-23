/* ── Usuarios y accesos (solo admin) — /v1/admin/access ──────────
   Se monta antes que /v1/admin para no pasar por su auditMutations
   genérico: aquí cada acción deja su propia línea en audit_log
   (area.grant / area.revoke / request.approve / request.reject). */

const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { AREAS, areaLabel } = require('../../utils/areas');
const email = require('../../utils/email');
const m = require('./model');

function requireAdminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}
router.use(requireAuth, requireAdminOnly);

const h = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req, res) });
  } catch (err) {
    if (err instanceof m.HttpError) {
      return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[admin/access]', err.message);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } });
  }
};

// Correo «Ya tienes acceso»: nunca bloquea.
function notifyGranted(user, area) {
  email.sendAreaGrantedEmail({ to: user.email, name: user.name, areaLabel: areaLabel(area), path: AREAS[area].path })
    .catch(e => console.warn('[admin/access] correo de acceso no enviado:', e.message));
}

const UUID = /^[0-9a-f-]{36}$/i;
function userIdParam(req) {
  if (!UUID.test(req.params.userId || '')) throw new m.HttpError(400, 'VALIDATION', 'Usuario no válido');
  return req.params.userId;
}
function requestIdParam(req) {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) throw new m.HttpError(400, 'VALIDATION', 'Solicitud no válida');
  return id;
}

router.get('/users', h(async req => {
  const { q, filter, page, limit } = req.query;
  const data = await m.listUsers({ q, filter, page, limit });
  data.pending_total = await m.pendingCount();
  data.areas = Object.entries(AREAS).map(([key, a]) => ({ key, label: a.label }));
  return data;
}));

router.get('/pending-count', h(async () => ({ count: await m.pendingCount() })));

// Interruptor: { enabled: true|false }
router.put('/users/:userId/areas/:area', h(async req => {
  const userId = userIdParam(req);
  const area = req.params.area;
  const enabled = !!(req.body && req.body.enabled);
  if (enabled) {
    const r = await m.grant(userId, area, req.user.id);
    if (r.granted) {
      audit(req, 'area.grant', { targetType: 'user', targetId: userId, meta: { area, requests_approved: r.approved } });
      notifyGranted(r.user, area);
    }
    return { user_id: userId, area, enabled: true, changed: r.granted };
  }
  const r = await m.revoke(userId, area);
  if (r.revoked) audit(req, 'area.revoke', { targetType: 'user', targetId: userId, meta: { area } });
  return { user_id: userId, area, enabled: false, changed: r.revoked };
}));

// Interruptor «De casa»: { interno: true|false }. Solo afecta a Engagement.
router.put('/users/:userId/interno', h(async req => {
  const userId = userIdParam(req);
  const on = !!(req.body && req.body.interno);
  const r = await m.setInterno(userId, on);
  if (r.changed) audit(req, 'user.interno', { targetType: 'user', targetId: userId, meta: { interno: on } });
  return { user_id: userId, interno: on, changed: r.changed };
}));

router.post('/requests/:id/approve', h(async req => {
  const id = requestIdParam(req);
  const pending = await m.getPendingRequest(id);
  const r = await m.grant(pending.user_id, pending.area, req.user.id);
  audit(req, 'request.approve', { targetType: 'access_request', targetId: id, meta: { area: pending.area, user_id: pending.user_id } });
  if (r.granted) {
    audit(req, 'area.grant', { targetType: 'user', targetId: pending.user_id, meta: { area: pending.area, request_id: id } });
    notifyGranted(r.user, pending.area);
  }
  return { id, status: 'approved', area: pending.area, user_id: pending.user_id };
}));

router.post('/requests/:id/reject', h(async req => {
  const id = requestIdParam(req);
  const r = await m.reject(id, req.user.id);
  audit(req, 'request.reject', { targetType: 'access_request', targetId: id, meta: { area: r.area, user_id: r.user_id } });
  return { id, status: 'rejected' };
}));

module.exports = router;
