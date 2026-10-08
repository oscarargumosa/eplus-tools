/* ── Developer · control de acceso (IDOR) ───────────────────────
   Comprobaciones de propiedad para las rutas /v1/developer/*.
   Regla: el dueño del proyecto (projects.user_id) accede a lo suyo;
   role 'admin' pasa siempre. Si no, 404 (no revelamos si existe).
   Se usan como router.param (projectId, wpId, activityId, partnerId)
   y como middleware de ruta (instancias, facts, staff, link-org).
   ─────────────────────────────────────────────────────────────── */
const db = require('../../utils/db');
const { requireAuth } = require('../../middleware/auth');

const isAdmin = (user) => !!user && user.role === 'admin';

function notFound(res, what) {
  return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `${what} not found` } });
}

// router.param corre ANTES que el requireAuth de la ruta: autenticamos aquí.
function withAuth(fn) {
  return (req, res, next, val) => {
    if (req.user) return fn(req, res, next, val);
    requireAuth(req, res, () => fn(req, res, next, val));
  };
}

const wrap = (fn) => (req, res, next, val) =>
  Promise.resolve(fn(req, res, next, val)).catch(next);

/* ── :projectId ── */
const projectParam = withAuth(wrap(async (req, res, next, projectId) => {
  if (isAdmin(req.user)) return next();
  const [[row]] = await db.execute(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, req.user.id]
  );
  if (!row) return notFound(res, 'Project');
  next();
}));

/* ── :wpId — el WP debe ser de un proyecto del usuario (y del :projectId si viene) ── */
const wpParam = withAuth(wrap(async (req, res, next, wpId) => {
  const [[wp]] = await db.execute(
    `SELECT wp.project_id, p.user_id FROM work_packages wp
       JOIN projects p ON p.id = wp.project_id WHERE wp.id = ?`, [wpId]
  );
  if (!wp) return notFound(res, 'Work package');
  if (!isAdmin(req.user) && wp.user_id !== req.user.id) return notFound(res, 'Work package');
  if (req.params.projectId && String(wp.project_id) !== String(req.params.projectId)) return notFound(res, 'Work package');
  next();
}));

/* ── :activityId ── */
const activityParam = withAuth(wrap(async (req, res, next, activityId) => {
  const [[act]] = await db.execute(
    `SELECT wp.project_id, p.user_id FROM activities a
       JOIN work_packages wp ON wp.id = a.wp_id
       JOIN projects p ON p.id = wp.project_id WHERE a.id = ?`, [activityId]
  );
  if (!act) return notFound(res, 'Activity');
  if (!isAdmin(req.user) && act.user_id !== req.user.id) return notFound(res, 'Activity');
  if (req.params.projectId && String(act.project_id) !== String(req.params.projectId)) return notFound(res, 'Activity');
  next();
}));

/* ── :partnerId — socio del :projectId, o de un proyecto del usuario ── */
const partnerParam = withAuth(wrap(async (req, res, next, partnerId) => {
  const [[pa]] = await db.execute(
    `SELECT pa.project_id, p.user_id FROM partners pa
       JOIN projects p ON p.id = pa.project_id WHERE pa.id = ?`, [partnerId]
  );
  if (!pa) return notFound(res, 'Partner');
  if (!isAdmin(req.user) && pa.user_id !== req.user.id) return notFound(res, 'Partner');
  if (req.params.projectId && String(pa.project_id) !== String(req.params.projectId)) return notFound(res, 'Partner');
  next();
}));

/* ── Middleware de ruta ─────────────────────────────────────── */

const mw = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// /instances/:id — dueño de la instancia o del proyecto al que pertenece.
const ownInstance = mw(async (req, res, next) => {
  if (isAdmin(req.user)) return next();
  const [[row]] = await db.execute(
    `SELECT fi.id FROM form_instances fi
       LEFT JOIN projects p ON p.id = fi.project_id
      WHERE fi.id = ? AND (fi.user_id = ? OR p.user_id = ?)`,
    [req.params.id, req.user.id, req.user.id]
  );
  if (!row) return notFound(res, 'Instance');
  next();
});

// /projects/:projectId/facts/:factId — el fact debe ser de ese proyecto.
const factInProject = mw(async (req, res, next) => {
  const [[row]] = await db.execute(
    'SELECT id FROM project_facts WHERE id = ? AND project_id = ?',
    [req.params.factId, req.params.projectId]
  );
  if (!row) return notFound(res, 'Fact');
  next();
});

// staff_id del body debe ser personal de la organización enlazada al socio
// (evita leer personal clave de organizaciones ajenas vía la tabla de equipo).
const staffOfPartnerOrg = mw(async (req, res, next) => {
  const staffId = (req.body || {}).staff_id;
  if (!staffId) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'staff_id required' } });
  if (isAdmin(req.user)) return next();
  const [[row]] = await db.execute(
    `SELECT ks.id FROM org_key_staff ks
       JOIN partners pa ON pa.organization_id = ks.organization_id
      WHERE ks.id = ? AND pa.id = ? AND pa.project_id = ?`,
    [staffId, req.params.partnerId, req.params.projectId]
  );
  if (!row) return notFound(res, 'Staff');
  next();
});

// select-variant: la variante PIF debe ser de la organización enlazada al socio.
const variantOfPartnerOrg = mw(async (req, res, next) => {
  const variantId = (req.body || {}).variant_id;
  if (!variantId || isAdmin(req.user)) return next();
  const [[row]] = await db.execute(
    `SELECT v.id FROM org_pif_variants v
       JOIN partners pa ON pa.organization_id = v.organization_id
      WHERE v.id = ? AND pa.id = ? AND pa.project_id = ?`,
    [variantId, req.params.partnerId, req.params.projectId]
  );
  if (!row) return notFound(res, 'Variant');
  next();
});

// link-org: no se puede enlazar la organización privada de otro usuario.
// Se permite: propia, pública, o sin dueño (adoptada del directorio público).
const orgLinkable = mw(async (req, res, next) => {
  const orgId = (req.body || {}).organization_id;
  if (!orgId || isAdmin(req.user)) return next();
  const [[org]] = await db.execute(
    'SELECT id, is_public, owner_user_id FROM organizations WHERE id = ?', [orgId]
  );
  if (!org) return notFound(res, 'Organization');
  if (Number(org.is_public) === 1 || org.owner_user_id === req.user.id) return next();
  const [links] = await db.execute(
    'SELECT user_id FROM user_organizations WHERE organization_id = ?', [orgId]
  );
  if (links.some(l => l.user_id === req.user.id)) return next();
  if (!org.owner_user_id && !links.length) return next();
  return notFound(res, 'Organization');
});

module.exports = {
  isAdmin, projectParam, wpParam, activityParam, partnerParam,
  ownInstance, factInProject, staffOfPartnerOrg, variantOfPartnerOrg, orgLinkable,
};
