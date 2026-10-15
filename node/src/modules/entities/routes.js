/* ── Entities Routes — /v1/entities/* (Partner Engine) ────────── */
const router = require('express').Router();
const ctrl = require('./controller');
const sl   = require('./shortlists.controller');
const smart = require('./smart.controller');
const handoff = require('./handoff.controller');
const { aiLimit } = require('../../middleware/aiLimit');
const { requireAuth, requireArea } = require('../../middleware/auth');

/* Studio está cerrado a invitados (oct-2026): directorio, Atlas, fichas
   y estadísticas exigen sesión. Antes eran un teaser público. */
const pubRead  = [requireAuth];
const pubAtlas = [requireAuth];

/* ── Guardia admin: el ranking analítico es privado (área admin) ── */
function requireAdminOrScribe(req, res, next) {
  const role = req.user && req.user.role;
  if (role !== 'admin' && role !== 'scribe') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}

/* ── Geo markers para Atlas 3D (antes de /:oid) ──────────────── */
router.get('/geo',                pubAtlas, ctrl.listGeoMarkers);

/* ── Stats (lectura del cache; deben ir antes de /:oid) ──────── */
router.get('/stats/global',       pubAtlas, ctrl.statGlobal);
router.get('/stats/by-country',   pubAtlas, ctrl.statByCountry);
router.get('/stats/by-category',  pubAtlas, ctrl.statByCategory);
router.get('/stats/by-cms',       pubAtlas, ctrl.statByCms);
router.get('/stats/by-language',  pubAtlas, ctrl.statByLanguage);
router.get('/stats/tiers',        pubAtlas, ctrl.statTiers);

/* ── Facets (opciones de filtros) ────────────────────────────── */
router.get('/facets',             pubAtlas, ctrl.getFacets);

/* ── Rankings de experiencia (privado, admin/scribe; antes de /:oid) ── */
router.get('/rankings',           requireAuth, requireAdminOrScribe, ctrl.rankings);

/* ── Smart Shortlist (IA matching, auth) ────────────────────── */
router.post('/smart-shortlist', requireAuth, aiLimit, smart.smartShortlist);

/* ── Handoff: crear consorcio → proyecto en intake (auth) ────── */
// Crea un proyecto en Diseñar: área beta «proyectos».
router.post('/handoff/consortium', requireAuth, requireArea('proyectos'), handoff.consortium);

/* ── Shortlists (auth) ───────────────────────────────────────── */
router.get   ('/shortlists',                requireAuth, sl.list);
router.post  ('/shortlists',                requireAuth, sl.create);
router.post  ('/shortlists/toggle',         requireAuth, sl.toggle);
router.post  ('/shortlists/saved-set',      requireAuth, sl.savedSet);
router.get   ('/shortlists/:id',            requireAuth, sl.detail);
router.patch ('/shortlists/:id',            requireAuth, sl.update);
router.delete('/shortlists/:id',            requireAuth, sl.remove);
router.post  ('/shortlists/:id/items',      requireAuth, sl.addItem);
router.delete('/shortlists/:id/items/:oid', requireAuth, sl.removeItem);
router.get   ('/shortlists/:id/export.csv', requireAuth, sl.exportCsv);

/* ── Listado y búsqueda ───────────────────────────────────────── */
router.get('/',                   pubRead, ctrl.listEntities);

/* ── Ficha y similares ────────────────────────────────────────── */
router.get('/:oid',               pubRead, ctrl.getEntity);
router.get('/:oid/similar',       pubRead, ctrl.listSimilar);
router.get('/:oid/projects',      pubRead, ctrl.listEntityProjects);

module.exports = router;
