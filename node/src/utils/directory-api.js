/* ═══════════════════════════════════════════════════════════════
   directory-api client — HTTP wrapper para erasmus-pg del VPS
   ═══════════════════════════════════════════════════════════════
   Lee de:
     DIRECTORY_API_BASE_URL  (default: https://directorio.eufundingschool.com/api)
     DIRECTORY_API_KEY       (X-API-Key header — obligatorio)

   Características:
   - Cache LRU en memoria, TTL 60s, máx 500 entradas (GET solo)
   - Retry exponencial: 3 intentos con backoff (200ms, 400ms, 800ms)
   - 429 Rate Limit -> backoff específico + retry
   - Timeout 5s por request via AbortController
   - Errores HTTP propagan como Error con .status

   Uso:
     const dir = require('../utils/directory-api');
     const { rows, meta } = await dir.search({ q: 'permacultura', country: 'ES' });
     const entity = await dir.getEntityFull('E10151149');
   ═══════════════════════════════════════════════════════════════ */

const BASE_URL = (process.env.DIRECTORY_API_BASE_URL || 'https://directorio.eufundingschool.com/api').replace(/\/$/, '');
const API_KEY  = process.env.DIRECTORY_API_KEY || '';
const TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;

/* ── LRU cache simple (Map preserva orden de inserción) ────────── */

const cache = new Map(); // key -> { value, expiresAt }

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { cache.delete(key); return null; }
  // touch: reinsertar al final
  cache.delete(key);
  cache.set(key, e);
  return e.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    // Drop oldest
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function clearCache() { cache.clear(); }

/* ── Fetch con retry + timeout ─────────────────────────────────── */

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(path, { method = 'GET', query, body } = {}) {
  if (!API_KEY) throw new Error('directory-api: DIRECTORY_API_KEY env var no configurada');

  let url = BASE_URL + path;
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      qs.append(k, String(v));
    }
    const qstr = qs.toString();
    if (qstr) url += '?' + qstr;
  }

  // Cache only for GET
  const cacheKey = method === 'GET' ? url : null;
  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'X-API-Key': API_KEY,
          'Accept': 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        // Rate limited — respetar Retry-After si lo manda, sino backoff exponencial
        const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
        const wait = (!isNaN(retryAfter) ? retryAfter * 1000 : 200 * Math.pow(2, attempt));
        lastErr = new Error(`directory-api 429 rate limit (retry in ${wait}ms)`);
        lastErr.status = 429;
        if (attempt < MAX_RETRIES - 1) { await sleep(wait); continue; }
        throw lastErr;
      }

      if (res.status >= 500) {
        lastErr = new Error(`directory-api ${res.status} ${res.statusText}`);
        lastErr.status = res.status;
        if (attempt < MAX_RETRIES - 1) { await sleep(200 * Math.pow(2, attempt)); continue; }
        throw lastErr;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`directory-api ${res.status}: ${text || res.statusText}`);
        err.status = res.status;
        throw err; // 4xx no se reintenta
      }

      const data = await res.json();
      if (cacheKey) cacheSet(cacheKey, data);
      return data;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        lastErr = new Error(`directory-api timeout after ${TIMEOUT_MS}ms`);
        lastErr.code = 'TIMEOUT';
      } else {
        lastErr = e;
      }
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw lastErr; // 4xx no reintenta
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(200 * Math.pow(2, attempt));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error('directory-api: retries exhausted');
}

/* ── API surface (mapping con los endpoints del directory-api) ── */

// GET /search?q=&country=&category=&tier=&language=&cms=&has_email=&has_phone=&sort=&page=&limit=
async function search(params = {}) {
  return fetchJson('/search', { query: params });
}

// GET /entity/:oid
async function getEntity(oid) {
  return fetchJson('/entity/' + encodeURIComponent(oid));
}

// GET /entity/:oid/full   (combina ficha + stats + copartners + timeline)
async function getEntityFull(oid) {
  return fetchJson('/entity/' + encodeURIComponent(oid) + '/full');
}

// GET /entity/:oid/similar
async function getEntitySimilar(oid, params = {}) {
  return fetchJson('/entity/' + encodeURIComponent(oid) + '/similar', { query: params });
}

// GET /entity/:oid/projects?limit=300&offset=0
// Devuelve { pic, count, limit, offset, projects: [...] } con campos completos
// (programme, action_type, funding_year, start_date, end_date, eu_grant_eur,
// coordinator_name, coordinator_country, project_summary, is_good_practice, role).
async function getEntityProjects(oid, params = {}) {
  return fetchJson('/entity/' + encodeURIComponent(oid) + '/projects', { query: params });
}

// GET /entities?ids=...&fields=...   (bulk lookup, max 100 IDs)
async function bulkLookup(ids, fields) {
  if (!Array.isArray(ids) || !ids.length) return { rows: [] };
  if (ids.length > 100) throw new Error('directory-api: bulkLookup max 100 ids');
  return fetchJson('/entities', {
    query: {
      ids: ids.join(','),
      fields: Array.isArray(fields) ? fields.join(',') : fields,
    },
  });
}

// GET /facets   (counts country/category/language/cms/tier para filtros UI)
async function getFacets(params = {}) {
  return fetchJson('/facets', { query: params });
}

// GET /stats/breakdown?dim=...
async function getStatsBreakdown(dim) {
  return fetchJson('/stats/breakdown', { query: { dim } });
}

// GET /stats   (KPI global: total_entities, total_projects, by_bucket, ...)
async function getGlobalStats() {
  return fetchJson('/stats');
}

// GET /map?country=&tier=
async function getMapMarkers(params = {}) {
  return fetchJson('/map', { query: params });
}

// GET /health  (sin cache, sin retry — para healthchecks)
async function health() {
  const url = BASE_URL + '/health';
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': API_KEY, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  // queries
  search,
  getEntity,
  getEntityFull,
  getEntitySimilar,
  getEntityProjects,
  bulkLookup,
  getFacets,
  getStatsBreakdown,
  getGlobalStats,
  getMapMarkers,
  health,
  // ops
  clearCache,
  // exposed for tests
  _fetchJson: fetchJson,
};
