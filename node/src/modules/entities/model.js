/* ═══════════════════════════════════════════════════════════════
   Entities Model — Partner Engine (ORS-derived atlas)
   ═══════════════════════════════════════════════════════════════
   Reads from v_entities_public (vista pública con quality_tier
   calculado) y stats_cache (agregados precomputados sobre 165k
   entidades reales del VPS).

   Read-only por diseño: estas tablas se alimentan vía crawler en VPS,
   nunca se escriben desde la app.
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');

/* ── Helpers ──────────────────────────────────────────────────── */

// Parse JSON columns que mysql2 a veces devuelve como string en función del driver.
function parseJsonField(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function hydrate(row) {
  if (!row) return row;
  return {
    ...row,
    emails:            parseJsonField(row.emails),
    phones:            parseJsonField(row.phones),
    social_links:      parseJsonField(row.social_links),
    website_languages: parseJsonField(row.website_languages),
    eu_programs:       parseJsonField(row.eu_programs),
  };
}

/* ── Listado paginado con filtros ─────────────────────────────── */

async function listEntities({
  q, country, category, tier, language, cms,
  has_email, has_phone,
  page = 1, limit = 24,
  sort = 'quality',
} = {}) {
  const where = [];
  const params = [];

  // Full-text search sobre name + description (requiere índice ft_name_desc)
  if (q && q.trim().length >= 2) {
    where.push(`MATCH (ee.extracted_name, ee.description) AGAINST (? IN NATURAL LANGUAGE MODE)`);
    params.push(q.trim());
  }
  if (country)  { where.push('e.country_code = ?'); params.push(String(country).toUpperCase()); }
  if (category) { where.push('ec.category = ?');    params.push(category); }
  if (cms)      { where.push('ee.cms_detected = ?'); params.push(cms); }

  if (tier) {
    // tier viene como 'premium' | 'good' | 'acceptable' | 'minimal' | 'premium+' (incluye buenas+)
    const map = { premium: 7, good: 5, acceptable: 3, minimal: 0 };
    if (tier.endsWith('+')) {
      const base = tier.slice(0, -1);
      if (map[base] !== undefined) {
        where.push(`(
          (ee.extracted_name IS NOT NULL) +
          (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
          (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
          (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
          (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
          (ee.logo_url IS NOT NULL) +
          (ee.year_founded IS NOT NULL) +
          (ee.legal_form IS NOT NULL) +
          (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
        ) >= ?`);
        params.push(map[base]);
      }
    } else if (map[tier] !== undefined) {
      // exact tier band (premium = 7-9, good = 5-6, acceptable = 3-4, minimal = 0-2)
      const min = map[tier];
      const max = tier === 'premium' ? 9 : tier === 'good' ? 6 : tier === 'acceptable' ? 4 : 2;
      where.push(`(
        (ee.extracted_name IS NOT NULL) +
        (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
        (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
        (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
        (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
        (ee.logo_url IS NOT NULL) +
        (ee.year_founded IS NOT NULL) +
        (ee.legal_form IS NOT NULL) +
        (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
      ) BETWEEN ? AND ?`);
      params.push(min, max);
    }
  }

  if (language) {
    where.push(`JSON_CONTAINS(ee.website_languages, JSON_QUOTE(?))`);
    params.push(String(language).toLowerCase());
  }
  if (has_email === '1' || has_email === 'true') where.push('JSON_LENGTH(ee.emails) > 0');
  if (has_phone === '1' || has_phone === 'true') where.push('JSON_LENGTH(ee.phones) > 0');

  // archived=0 garantizado por el JOIN de la vista
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Sorting
  const sortMap = {
    quality:    'quality_score_raw DESC, ee.score_professionalism DESC',
    name:       'COALESCE(NULLIF(ee.extracted_name, \'\'), e.legal_name) ASC',
    country:    'e.country_code ASC',
    recent:     'ee.last_fetched_at DESC',
  };
  const orderBy = sortMap[sort] || sortMap.quality;

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
  const offset = (pageNum - 1) * limitNum;

  // Total count
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM entities e
     JOIN entity_enrichment ee ON ee.oid = e.oid AND ee.archived = 0
     LEFT JOIN entity_classification ec ON ec.oid = e.oid
     ${whereSql}`,
    params
  );

  // Page rows — campos ligeros para card grid
  const [rows] = await pool.query(
    `SELECT
       e.oid,
       COALESCE(NULLIF(ee.extracted_name, ''), e.legal_name) AS display_name,
       e.country_code,
       e.city,
       ec.category,
       ee.logo_url,
       ee.score_professionalism,
       ee.score_eu_readiness,
       ee.score_vitality,
       ee.cms_detected,
       (
         (ee.extracted_name IS NOT NULL) +
         (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
         (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
         (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
         (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
         (ee.logo_url IS NOT NULL) +
         (ee.year_founded IS NOT NULL) +
         (ee.legal_form IS NOT NULL) +
         (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
       ) AS quality_score_raw,
       CASE
         WHEN (
           (ee.extracted_name IS NOT NULL) +
           (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
           (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
           (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
           (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
           (ee.logo_url IS NOT NULL) +
           (ee.year_founded IS NOT NULL) +
           (ee.legal_form IS NOT NULL) +
           (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
         ) >= 7 THEN 'premium'
         WHEN (
           (ee.extracted_name IS NOT NULL) +
           (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
           (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
           (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
           (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
           (ee.logo_url IS NOT NULL) +
           (ee.year_founded IS NOT NULL) +
           (ee.legal_form IS NOT NULL) +
           (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
         ) >= 5 THEN 'good'
         WHEN (
           (ee.extracted_name IS NOT NULL) +
           (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
           (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
           (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
           (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
           (ee.logo_url IS NOT NULL) +
           (ee.year_founded IS NOT NULL) +
           (ee.legal_form IS NOT NULL) +
           (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
         ) >= 3 THEN 'acceptable'
         ELSE 'minimal'
       END AS quality_tier
     FROM entities e
     JOIN entity_enrichment ee ON ee.oid = e.oid AND ee.archived = 0
     LEFT JOIN entity_classification ec ON ec.oid = e.oid
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  return {
    rows,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
}

/* ── Ficha individual ─────────────────────────────────────────── */

async function getEntityById(oid) {
  const [rows] = await pool.query(
    `SELECT * FROM v_entities_public WHERE oid = ? LIMIT 1`,
    [oid]
  );
  return hydrate(rows[0]);
}

/* ── Similares (mismo país + categoría) ──────────────────────── */

async function listSimilar(oid, limit = 3) {
  const seed = await getEntityById(oid);
  if (!seed) return [];

  const where = ['v.oid <> ?'];
  const params = [oid];
  if (seed.country_code) { where.push('v.country_code = ?'); params.push(seed.country_code); }
  if (seed.category)     { where.push('v.category = ?');     params.push(seed.category); }

  const [rows] = await pool.query(
    `SELECT v.oid, v.display_name, v.country_code, v.city, v.category, v.logo_url,
            v.score_professionalism, v.score_eu_readiness, v.score_vitality,
            v.quality_tier
     FROM v_entities_public v
     WHERE ${where.join(' AND ')}
     ORDER BY v.quality_score_raw DESC, v.score_professionalism DESC
     LIMIT ?`,
    [...params, Math.min(10, parseInt(limit, 10) || 3)]
  );
  return rows;
}

/* ── Markers para el Atlas 3D ─────────────────────────────────
   Devuelve solo (oid, lat, lng, name, country, tier_code) para
   pintar 165k puntos sin saturar el payload. Tier compactado a int. */

async function listGeoMarkersRaw({ country, tier } = {}) {
  const where = ['e.geocoded_lat IS NOT NULL'];
  const params = [];
  if (country) { where.push('e.country_code = ?'); params.push(String(country).toUpperCase()); }

  // tier filter usa la misma fórmula que la vista; para 'unenriched' permitimos LEFT JOIN
  // pero por simplicidad aquí filtramos sobre v_entities_public + UNION con entidades
  // sin enrichment cuando NO hay filtro de tier.
  let sql, rows;

  if (tier) {
    where.push('v.quality_tier = ?');
    params.push(tier);
    [rows] = await pool.query(
      `SELECT v.oid, e.pic, v.geocoded_lat AS lat, v.geocoded_lng AS lng,
              v.country_code AS cc, v.display_name AS name, v.quality_tier AS tier
       FROM v_entities_public v
       JOIN entities e ON e.oid = v.oid
       WHERE ${where.join(' AND ')}
       LIMIT 200000`,
      params
    );
  } else {
    // Todas las entidades con coords; entidades sin enrichment marcadas como 'unenriched'
    [rows] = await pool.query(
      `SELECT
         e.oid,
         e.pic,
         e.geocoded_lat AS lat,
         e.geocoded_lng AS lng,
         e.country_code AS cc,
         COALESCE(NULLIF(ee.extracted_name, ''), e.legal_name) AS name,
         CASE
           WHEN ee.oid IS NULL THEN 'unenriched'
           WHEN (
             (ee.extracted_name IS NOT NULL) +
             (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
             (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
             (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
             (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
             (ee.logo_url IS NOT NULL) +
             (ee.year_founded IS NOT NULL) +
             (ee.legal_form IS NOT NULL) +
             (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
           ) >= 7 THEN 'premium'
           WHEN (
             (ee.extracted_name IS NOT NULL) +
             (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
             (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
             (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
             (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
             (ee.logo_url IS NOT NULL) +
             (ee.year_founded IS NOT NULL) +
             (ee.legal_form IS NOT NULL) +
             (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
           ) >= 5 THEN 'good'
           WHEN (
             (ee.extracted_name IS NOT NULL) +
             (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
             (COALESCE(JSON_LENGTH(ee.emails), 0) > 0) +
             (COALESCE(JSON_LENGTH(ee.phones), 0) > 0) +
             (COALESCE(JSON_LENGTH(ee.social_links), 0) > 0) +
             (ee.logo_url IS NOT NULL) +
             (ee.year_founded IS NOT NULL) +
             (ee.legal_form IS NOT NULL) +
             (COALESCE(JSON_LENGTH(ee.website_languages), 0) > 0)
           ) >= 3 THEN 'acceptable'
           ELSE 'minimal'
         END AS tier
       FROM entities e
       LEFT JOIN entity_enrichment ee ON ee.oid = e.oid AND ee.archived = 0
       WHERE ${where.join(' AND ')}
       LIMIT 200000`,
      params
    );
  }

  return rows;
}

/* Compacta markers a {o,a,g,c,n,t} para minimizar payload (~50 bytes/marker). */
const _GEO_TIER_CODE = { premium: 1, good: 2, acceptable: 3, minimal: 4, unenriched: 0, owner: 5 };
function compactGeoMarkers(rows) {
  return rows.map(r => ({
    o: r.oid,
    a: Number(r.lat),
    g: Number(r.lng),
    c: r.cc,
    n: r.name,
    t: _GEO_TIER_CODE[r.tier] ?? 0,
  }));
}

async function listGeoMarkers(args = {}) {
  return compactGeoMarkers(await listGeoMarkersRaw(args));
}

/* ── Stats (lectura del cache) ───────────────────────────────── */

async function getStat(metricKey) {
  const [rows] = await pool.query(
    `SELECT value, computed_at FROM stats_cache WHERE metric_key = ? LIMIT 1`,
    [metricKey]
  );
  if (!rows.length) return null;
  return {
    value: parseJsonField(rows[0].value),
    computed_at: rows[0].computed_at,
  };
}

/* ── Filtros disponibles (para popular sidebar) ──────────────── */

async function getFilterFacets() {
  // Países y categorías con sus conteos vienen del cache; aquí solo los enums sueltos
  const [cmsRows] = await pool.query(
    `SELECT DISTINCT cms_detected FROM entity_enrichment
     WHERE archived = 0 AND cms_detected IS NOT NULL AND cms_detected <> ''
     ORDER BY cms_detected`
  );
  return {
    cms_options: cmsRows.map(r => r.cms_detected),
  };
}

module.exports = {
  listEntities,
  getEntityById,
  listSimilar,
  listGeoMarkers,
  listGeoMarkersRaw,
  compactGeoMarkers,
  getStat,
  getFilterFacets,
};
