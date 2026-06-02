/* ── Entities Routes — /v1/entities/* (Partner Engine) ────────── */
const router = require('express').Router();
const ctrl = require('./controller');
const sl   = require('./shortlists.controller');
const smart = require('./smart.controller');
const handoff = require('./handoff.controller');
const { requireAuth } = require('../../middleware/auth');

/* ── Geo markers para Atlas 3D (público, antes de /:oid) ─────── */
router.get('/geo',                ctrl.listGeoMarkers);

/* ── Stats públicos (lectura del cache; deben ir antes de /:oid) */
router.get('/stats/global',       ctrl.statGlobal);
router.get('/stats/by-country',   ctrl.statByCountry);
router.get('/stats/by-category',  ctrl.statByCategory);
router.get('/stats/by-cms',       ctrl.statByCms);
router.get('/stats/by-language',  ctrl.statByLanguage);
router.get('/stats/tiers',        ctrl.statTiers);

/* ── Facets (opciones de filtros) ────────────────────────────── */
router.get('/facets',             ctrl.getFacets);

/* ── Smart Shortlist (IA matching, auth) ────────────────────── */
router.post('/smart-shortlist', requireAuth, smart.smartShortlist);

/* ── Handoff: crear consorcio → proyecto en intake (auth) ────── */
router.post('/handoff/consortium', requireAuth, handoff.consortium);

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

/* ── Listado y búsqueda (público) ────────────────────────────── */
router.get('/',                   ctrl.listEntities);

/* ── Ficha y similares (público) ─────────────────────────────── */
router.get('/:oid',               ctrl.getEntity);
router.get('/:oid/similar',       ctrl.listSimilar);
router.get('/:oid/projects',      ctrl.listEntityProjects);

module.exports = router;
