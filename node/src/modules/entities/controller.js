/* ═══════════════════════════════════════════════════════════════
   Entities Controller — Partner Engine endpoints
   ═══════════════════════════════════════════════════════════════ */

const m = require('./backend');
const zlib   = require('zlib');
const crypto = require('crypto');

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

/* ── Geo markers para el Atlas 3D mundial ──────────────────────
   Son ~200.000 puntos. Construirlos cuesta segundos (la consulta recorre
   todas las entidades con coordenadas y calcula el tier por fila) y el JSON
   ronda los 20 MB, así que hacerlo en cada visita a la pestaña Entidades es
   insostenible: medido en 6,5 s en dev y peor en producción.

   El Atlas siempre pide la lista completa, sin filtros, así que se cachea
   ESA: se guarda ya serializada y comprimida, con su ETag. Los filtros por
   país o tier (que el Atlas no usa) siguen el camino normal.

   Con esto: el primer visitante tras arrancar paga la construcción, los
   demás reciben el buffer ya hecho, y quien repite visita recibe un 304 sin
   descargar nada. */
const GEO_TTL_MS = 60 * 60 * 1000;   // los datos solo cambian con el enriquecimiento
let geoCache = null;                 // { gzip: Buffer, etag: string, until: number, markers: number }
let geoBuilding = null;              // promesa en vuelo, para no construirlo dos veces a la vez

async function buildGeoCache() {
  const data = await m.listGeoMarkers({});
  const json = JSON.stringify({ ok: true, data });
  const gzip = zlib.gzipSync(json, { level: 6 });
  geoCache = {
    gzip,
    etag: '"' + crypto.createHash('sha1').update(gzip).digest('hex').slice(0, 16) + '"',
    until: Date.now() + GEO_TTL_MS,
    markers: data.length,
  };
  return geoCache;
}

async function getGeoCache() {
  const vigente = geoCache && Date.now() < geoCache.until;
  if (vigente) return geoCache;

  if (!geoBuilding) {
    geoBuilding = buildGeoCache().finally(() => { geoBuilding = null; });
  }
  // Si ya hay una versión, aunque esté caducada, se sirve esa y se reconstruye
  // por detrás: así nadie vuelve a esperar los segundos de la consulta. Solo
  // espera quien llega antes de que exista la primera.
  if (geoCache) {
    geoBuilding.catch(() => {});   // el error ya se registra donde toca
    return geoCache;
  }
  return geoBuilding;
}

exports.listGeoMarkers = async (req, res) => {
  try {
    const filtrado = !!(req.query.country || req.query.tier);
    if (filtrado) {
      const data = await m.listGeoMarkers(req.query);
      res.set('Cache-Control', 'public, max-age=300');
      return ok(res, data);
    }

    const cache = await getGeoCache();
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('ETag', cache.etag);
    res.set('Vary', 'Accept-Encoding');

    // El navegador ya lo tiene: no se reenvían 6 MB.
    if (req.headers['if-none-match'] === cache.etag) return res.status(304).end();

    const aceptaGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.type('application/json');
    if (aceptaGzip) {
      res.set('Content-Encoding', 'gzip');
      return res.end(cache.gzip);
    }
    // Cliente sin gzip (raro): se descomprime el que ya tenemos, sin volver a consultar.
    return res.end(zlib.gunzipSync(cache.gzip));
  } catch (e) { err(res, e.message, 500); }
};

/* Se construye al arrancar para que ni el primer visitante espere. En segundo
   plano: si falla, se construirá en la primera petición. */
exports.warmGeoCache = () => getGeoCache()
  .then(c => console.log(`[entities] Atlas precalentado: ${c.markers} marcadores, ${(c.gzip.length / 1048576).toFixed(1)} MB comprimidos`))
  .catch(e => console.error('[entities] no se pudo precalentar el Atlas:', e.message));

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

/* ── Rankings (analítica de experiencia: inversión / proyectos) ── */
exports.rankings = (req, res) => {
  try {
    const rankings = require('./rankings');
    ok(res, rankings.query(req.query));
  } catch (e) { err(res, e.message, 500); }
};
