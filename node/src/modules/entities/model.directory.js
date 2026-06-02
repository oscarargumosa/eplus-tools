/* ═══════════════════════════════════════════════════════════════
   Entities Model — directory-api backend (HTTP proxy)
   ═══════════════════════════════════════════════════════════════
   Implementación para ENTITIES_BACKEND=directory_api.

   Delega en `node/src/utils/directory-api.js` (HTTP client a
   directorio.eufundingschool.com/api/*).

   Estado de paridad con `./model` (MySQL, legacy):

     listEntities      → dir.search()              ✅ Sprint 1A
     getEntityById     → dir.getEntityFull()       ✅ Sprint 1A
     listSimilar       → fallback con search()     ⚠️  Sprint 2 lo simplifica
     listGeoMarkers    → fallback MySQL            ⏳ Sprint 2 entrega /map
     getStat           → fallback MySQL            ⏳ Sprint 1B entrega /stats/breakdown
     getFilterFacets   → fallback MySQL            ⏳ Sprint 1B entrega /facets

   Los fallbacks a MySQL son intencionales: permiten encender el
   feature flag con un cutover parcial sin romper pestañas que
   dependen de endpoints que VPS Claude aún no entregó.

   Shapes reales del directory-api (verificadas 2026-05-06):

   GET /search?q=...&country=...&limit=...
     {
       count: 12345,                          // total filas
       limit: 24,
       offset: 0,
       results: [                             // ← NO `rows`
         { pic, oid, name, country_code, city, org_type, website,
           validity_label, status_bucket, is_certified, can_apply,
           total_projects, as_coordinator, last_project_date,
           score_professionalism, score_eu_readiness, score_vitality,
           logo_url, category, category_confidence,
           quality_score_raw, quality_tier, cms_detected,
           website_languages }
       ]
     }

   GET /entity/:id/full
     Casi todo plano top-level (oid, name, country_code, ..., total_projects,
     last_project_date), pero `category`, `quality` y `enrichment` vienen
     como bloques anidados:
       category    = { category: "cultural", confidence: "medium", matched_signals: [...] }
       quality     = { score_raw, score, tier, ... }
       enrichment  = { description, parent_organization, vat_number, cms_detected,
                       website_languages, mismatch_level, has_donate_button,
                       has_newsletter_signup, has_privacy_policy, ... }
     + recent_projects[], top_copartners[], timeline[]
   ═══════════════════════════════════════════════════════════════ */

const dir = require('../../utils/directory-api');
const mysqlModel = require('./model');
const overrides = require('./overrides');
const scores = require('./scores');
const localOrgs = require('./local-orgs');

/* ── Mapping de la respuesta de /search a la shape MySQL {rows, meta} ── */

function normalizeSearchResponse(resp, requestedLimit) {
  if (!resp || typeof resp !== 'object') return { rows: [], meta: { total: 0, page: 1, limit: requestedLimit || 24, pages: 0 } };

  const results = Array.isArray(resp.results) ? resp.results
                : Array.isArray(resp.rows)    ? resp.rows
                : Array.isArray(resp)         ? resp
                : [];
  // Preferimos `total` (absoluto) si VPS lo entrega; `count` puede ser page-size.
  const total  = typeof resp.total === 'number' ? resp.total
               : (resp.meta && typeof resp.meta.total === 'number') ? resp.meta.total
               : typeof resp.count === 'number' ? resp.count
               : results.length;
  const limit  = typeof resp.limit  === 'number' ? resp.limit  : (requestedLimit || 24);
  const offset = typeof resp.offset === 'number' ? resp.offset : 0;
  const page   = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
  const pages  = limit > 0 ? Math.ceil(total / limit) : 0;

  // Para cada row, expongo `display_name` (que la UI espera) sin perder `name`.
  const rows = results.map(r => ({
    ...r,
    display_name: r.display_name || r.name || null,
  }));

  return { rows, meta: { total, page, limit, pages } };
}

/* ── Mapping de la respuesta de /entity/:id/full a v_entities_public plana ── */

function flattenEntityFull(full) {
  if (!full || typeof full !== 'object') return null;

  const category   = full.category   && typeof full.category   === 'object' ? full.category   : null;
  const quality    = full.quality    && typeof full.quality    === 'object' ? full.quality    : null;
  const enrichment = full.enrichment && typeof full.enrichment === 'object' ? full.enrichment : null;

  // Subo enrichment al primer nivel sin pisar campos ya presentes.
  const enrichFlat = {};
  if (enrichment) {
    for (const [k, v] of Object.entries(enrichment)) {
      if (full[k] === undefined || full[k] === null) enrichFlat[k] = v;
    }
  }

  return {
    ...full,
    ...enrichFlat,

    // Aplanar bloques anidados (sobreescribe el campo "object" original)
    category:            category ? (category.category ?? null) : (typeof full.category === 'string' ? full.category : null),
    category_confidence: category ? (category.confidence ?? null) : (full.category_confidence ?? null),
    matched_signals:     category ? (category.matched_signals ?? null) : (full.matched_signals ?? null),

    quality_score_raw: quality ? (quality.score_raw ?? quality.score ?? quality.quality_score_raw ?? null) : (full.quality_score_raw ?? null),
    quality_tier:      quality ? (quality.tier ?? quality.quality_tier ?? null) : (full.quality_tier ?? null),

    // Display name por compatibilidad con la UI MySQL
    display_name: full.display_name || full.name || full.legal_name || null,

    // Bloques agregados
    recent_projects: Array.isArray(full.recent_projects) ? full.recent_projects : [],
    top_copartners:  Array.isArray(full.top_copartners)  ? full.top_copartners  : [],
    timeline:        Array.isArray(full.timeline)        ? full.timeline        : [],
  };
}

/* ── listEntities ────────────────────────────────────────────── */

async function listEntities(args = {}) {
  const limit = args.limit;

  // VPS directory + local orgs en paralelo. Local nunca debe romper si VPS cae
  // y viceversa: ambas degradan independientemente.
  const [resp, localRows] = await Promise.all([
    dir.search({
      q: args.q,
      country: args.country,
      category: args.category,
      tier: args.tier,
      language: args.language,
      cms: args.cms,
      has_email: args.has_email,
      has_phone: args.has_phone,
      sort: args.sort,
      page: args.page,
      limit: args.limit,
    }).catch(e => {
      console.warn('[directory] VPS search failed:', e.message);
      return { results: [], count: 0, limit: limit || 24, offset: 0 };
    }),
    localOrgs.searchLocalAsEntities({
      q: args.q,
      country: args.country,
      limit: limit || 50,
    }).catch(e => {
      console.warn('[directory] local search failed:', e.message);
      return [];
    }),
  ]);

  const normalized = normalizeSearchResponse(resp, limit);

  // Dedupe: una org local con el mismo PIC que un row del VPS se descarta
  // (el row del VPS lleva más metadatos y el override lo enriquecerá).
  if (localRows.length) {
    const vpsPics = new Set(
      normalized.rows.map(r => r && r.pic ? String(r.pic) : null).filter(Boolean)
    );
    const filteredLocals = localRows.filter(l => !(l.pic && vpsPics.has(String(l.pic))));
    if (filteredLocals.length) {
      // Local primero para que las orgs propias del usuario sean lo primero
      // que ve en directorio + picker.
      normalized.rows = [...filteredLocals, ...normalized.rows];
      normalized.meta.total = (normalized.meta.total || 0) + filteredLocals.length;
      normalized.meta.pages = normalized.meta.limit > 0
        ? Math.ceil(normalized.meta.total / normalized.meta.limit)
        : 0;
    }
  }

  normalized.rows = await overrides.applyToList(normalized.rows);
  normalized.rows = await scores.attachToList(normalized.rows);
  return normalized;
}

/* ── getEntityById ───────────────────────────────────────────── */

async function getEntityById(oid) {
  if (!oid) return null;
  // Orgs locales con OID sintético "local-<uuid>" no existen en el VPS.
  if (localOrgs.isLocalOid(oid)) {
    const ent = await localOrgs.getLocalEntityByOid(oid);
    if (!ent) return null;
    const overridden = await overrides.applyToEntity(ent);
    return scores.attachToEntity(overridden);
  }
  try {
    const full = await dir.getEntityFull(oid);
    const flat = flattenEntityFull(full);
    const overridden = await overrides.applyToEntity(flat);
    return scores.attachToEntity(overridden);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/* ── listSimilar (fallback hasta Sprint 2 /entity/:id/similar) ── */

async function listSimilar(oid, limit = 3) {
  if (!oid) return [];
  // Local-only orgs: derivamos seed desde MySQL para poder buscar similares.
  let seed;
  if (localOrgs.isLocalOid(oid)) {
    seed = await localOrgs.getLocalEntityByOid(oid);
    if (!seed) return [];
  } else {
    try {
      seed = await dir.getEntityFull(oid);
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }
  if (!seed) return [];

  const flat = flattenEntityFull(seed) || {};
  const country  = flat.country_code || null;
  const category = flat.category || null;
  if (!country && !category) return [];

  const want = parseInt(limit, 10) || 3;
  const resp = await dir.search({
    country,
    category,
    sort: 'quality',
    limit: Math.min(20, want + 1),
  });
  const list = (resp && Array.isArray(resp.results)) ? resp.results
             : (resp && Array.isArray(resp.rows))    ? resp.rows
             : Array.isArray(resp)                   ? resp
             : [];
  return list
    .filter(r => r.oid !== oid)
    .slice(0, want)
    .map(r => ({ ...r, display_name: r.display_name || r.name || null }));
}

/* ── Métodos delegados a MySQL hasta que VPS entregue su endpoint ── */

async function listGeoMarkers(args = {}) {
  // TODO Sprint 2: dir.getMapMarkers(args)
  // Pedimos formato raw (con oid+pic) para poder cruzar con overrides locales
  // antes de compactar al payload final {o,a,g,c,n,t}.
  const raw = await mysqlModel.listGeoMarkersRaw(args);
  const withOverrides = await overrides.applyToList(raw);
  const existingOids = new Set(withOverrides.map(m => m && m.oid).filter(Boolean));
  const existingPics = new Set(withOverrides.map(m => m && m.pic).filter(Boolean).map(String));
  const owned = await overrides.getOwnedMarkers();
  for (const m of owned) {
    const dupByOid = m.oid && existingOids.has(m.oid);
    const dupByPic = m.pic && existingPics.has(String(m.pic));
    if (!dupByOid && !dupByPic) withOverrides.push(m);
  }
  return mysqlModel.compactGeoMarkers(withOverrides);
}

async function getStat(key) {
  // 'global_kpis' → /api/stats del VPS (total_entities + breakdown).
  // Otras keys siguen en MySQL hasta que VPS Claude entregue Sprint 1B.
  if (key === 'global_kpis') {
    try {
      const s = await dir.getGlobalStats();
      const total_alive = parseInt(s?.total_entities, 10) || 0;
      const total_projects = parseInt(s?.total_projects, 10) || 0;
      const total_certified = (s?.by_bucket || []).find(b => b.status_bucket === 'certified');
      return {
        value: {
          total_alive,
          total_projects,
          total_certified: total_certified ? parseInt(total_certified.count, 10) : null,
        },
        computed_at: new Date().toISOString(),
      };
    } catch {
      return mysqlModel.getStat(key);
    }
  }
  return mysqlModel.getStat(key);
}

async function getFilterFacets() {
  // TODO Sprint 1B: dir.getFacets()
  return mysqlModel.getFilterFacets();
}

module.exports = {
  listEntities,
  getEntityById,
  listSimilar,
  listGeoMarkers,
  getStat,
  getFilterFacets,
  // Helpers expuestos por si las pruebas los necesitan:
  _client: dir,
  _flattenEntityFull: flattenEntityFull,
  _normalizeSearchResponse: normalizeSearchResponse,
};
