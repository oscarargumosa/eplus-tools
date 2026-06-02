/* ═══════════════════════════════════════════════════════════════
   Entities Controller — Partner Engine endpoints
   ═══════════════════════════════════════════════════════════════ */

const m = require('./backend');

const ok  = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 400) =>
  res.status(status).json({ ok: false, error: { message: msg } });

/* ── List & search (mismo endpoint, filtros opcionales) ──────── */
exports.listEntities = async (req, res) => {
  try {
    ok(res, await m.listEntities(req.query));
  } catch (e) { err(res, e.message, 500); }
};

/* ── Ficha individual ────────────────────────────────────────── */
exports.getEntity = async (req, res) => {
  try {
    const entity = await m.getEntityById(req.params.oid);
    if (!entity) return err(res, 'Entity not found', 404);
    ok(res, entity);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Similares ───────────────────────────────────────────────── */
exports.listSimilar = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 3;
    ok(res, await m.listSimilar(req.params.oid, limit));
  } catch (e) { err(res, e.message, 500); }
};

/* ── Lista completa de proyectos UE de la entidad ────────────────
   Pass-through al directory-api (que tiene los 317k proyectos en
   erasmus-pg). El front lo usa en Mi Organización → Experiencia
   y para futuras vistas de "todos los proyectos por OID". */
exports.listEntityProjects = async (req, res) => {
  try {
    const dir = require('../../utils/directory-api');
    const limit  = Math.min(parseInt(req.query.limit, 10)  || 300, 1000);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const resp = await dir.getEntityProjects(req.params.oid, { limit, offset });
    const projects = Array.isArray(resp?.projects)
      ? resp.projects
      : (Array.isArray(resp) ? resp : []);
    ok(res, {
      count: typeof resp?.count === 'number' ? resp.count : projects.length,
      limit,
      offset,
      projects,
    });
  } catch (e) {
    err(res, e.message, e.status >= 400 && e.status < 500 ? e.status : 500);
  }
};

/* ── Geo markers para el Atlas 3D mundial ────────────────────── */
exports.listGeoMarkers = async (req, res) => {
  try {
    const data = await m.listGeoMarkers(req.query);
    res.set('Cache-Control', 'public, max-age=300'); // 5 min cache (cambia con backfill)
    ok(res, data);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Stats (lectura del cache precomputado) ──────────────────── */
exports.statGlobal       = (req, res) => sendStat(res, 'global_kpis');
exports.statByCountry    = (req, res) => sendStat(res, 'by_country');
exports.statByCategory   = (req, res) => sendStat(res, 'by_category');
exports.statByCms        = (req, res) => sendStat(res, 'by_cms');
exports.statByLanguage   = (req, res) => sendStat(res, 'by_language');
exports.statTiers        = (req, res) => sendStat(res, 'tier_distribution');

async function sendStat(res, key) {
  try {
    const stat = await m.getStat(key);
    if (!stat) return err(res, `Metric "${key}" not yet computed`, 404);
    ok(res, stat);
  } catch (e) { err(res, e.message, 500); }
}

/* ── Facets (opciones de filtros) ────────────────────────────── */
exports.getFacets = async (req, res) => {
  try {
    ok(res, await m.getFilterFacets());
  } catch (e) { err(res, e.message, 500); }
};
