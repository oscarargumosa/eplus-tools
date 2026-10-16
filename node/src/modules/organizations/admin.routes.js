/* ── Entidades reclamadas (solo admin) — /v1/admin/org-claims ──────
   Revisión de la documentación que aportan los dueños: el sello
   «Verificada» solo lo pone un admin desde aquí. Se monta antes que
   /v1/admin para llevar su propia auditoría (org.claim.verify /
   org.claim.reject / org.dispute.resolve). Al verificar o rechazar se
   escribe a la persona; el correo nunca bloquea la respuesta.
   Los documentos se ven por GET /v1/organizations/:id/claim-docs/:docId/file
   (admin incluido; deja org.claim_doc.view en audit_log). */

const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { sendError } = require('../../utils/httpError');
const email = require('../../utils/email');
const m = require('./model');

function requireAdminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}
router.use(requireAuth, requireAdminOnly);

const UUID = /^[0-9a-f-]{36}$/i;
const h = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req, res) });
  } catch (e) {
    sendError(res, e.status || 500, { message: e.message }, e);
  }
};
function idParam(req, name = 'orgId') {
  const v = req.params[name] || '';
  if (!UUID.test(v)) throw Object.assign(new Error('Identificador no válido'), { status: 400 });
  return v;
}

// Correo con el resultado: nunca bloquea.
function notifyResult(org, decision, note) {
  if (!org || !org.owner_email) return;
  email.sendOrgClaimReviewEmail({ to: org.owner_email, name: org.owner_name, orgName: org.organization_name, decision, note })
    .then(r => { if (r && r.ok === false) console.warn('[admin/org-claims] correo no enviado:', r.error); })
    .catch(e => console.warn('[admin/org-claims] correo no enviado:', e.message));
}

// ?status=pending (por defecto) | verified | rejected | all
router.get('/', h(async (req) => {
  const status = ['pending', 'verified', 'rejected', 'all'].includes(req.query.status) ? req.query.status : 'pending';
  return {
    items: await m.listClaimsForReview(status),
    pending_total: await m.countPendingClaims(),
    disputes: await m.listDisputes('open'),
  };
}));

router.get('/pending-count', h(async () => ({ count: await m.countPendingClaims() })));

async function review(req, decision) {
  const orgId = idParam(req);
  const note = req.body && req.body.note;
  const org = await m.reviewClaim(orgId, req.user.id, decision, note);
  if (!org) throw Object.assign(new Error('Entidad no encontrada'), { status: 404 });
  audit(req, decision === 'verified' ? 'org.claim.verify' : 'org.claim.reject', {
    targetType: 'organization', targetId: orgId, meta: note ? { note: String(note).slice(0, 200) } : null,
  });
  notifyResult(org, decision, note ? String(note).trim().slice(0, 500) : null);
  return { id: orgId, status: decision };
}

router.post('/:orgId/verify', h(req => review(req, 'verified')));
router.post('/:orgId/reject', h(req => review(req, 'rejected')));

router.post('/disputes/:id/resolve', h(async (req) => {
  const id = idParam(req, 'id');
  if (!await m.resolveDispute(id)) throw Object.assign(new Error('Conflicto no encontrado o ya cerrado'), { status: 404 });
  audit(req, 'org.dispute.resolve', { targetType: 'org_claim_dispute', targetId: id });
  return { id, status: 'resolved' };
}));

module.exports = router;
