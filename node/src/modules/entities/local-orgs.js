/* ═══════════════════════════════════════════════════════════════
   Local orgs → entity-shape adapter
   ═══════════════════════════════════════════════════════════════
   Cuando ENTITIES_BACKEND=directory_api, el listado y la ficha del
   directorio consultan el VPS. Pero las orgs creadas en MySQL local
   (`organizations` con is_public=1) no existen en el VPS, así que
   nunca aparecen en el buscador ni en el picker de partners.

   Este módulo expone las orgs locales como "entities sintéticas"
   con OID prefijado por `local-<uuid>` para que se rendericen en
   los mismos componentes (Directory list, Atlas card, partner
   picker del Intake) y, al ser adoptadas vía /v1/organizations/
   from-entity, sigan el fast-path que devuelve la org existente.

   Dedupe en el caller: por PIC, dado que el OID local nunca colisiona
   con los OIDs reales del directorio público.
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');

const LOCAL_PREFIX = 'local-';

const isLocalOid  = (oid) => typeof oid === 'string' && oid.startsWith(LOCAL_PREFIX);
const toLocalOid  = (id)  => LOCAL_PREFIX + id;
const fromLocalOid = (oid) => isLocalOid(oid) ? oid.slice(LOCAL_PREFIX.length) : oid;

/* ── Mapper org_type → directory category ────────────────────── */

function normalizeCategory(orgType) {
  if (!orgType) return null;
  const t = String(orgType).toLowerCase();
  if (t.includes('ngo') || t.includes('non-governmental') || t.includes('association') || t.includes('nonprofit') || t.includes('non-profit')) return 'nonprofit';
  if (t.includes('public') || t.includes('government') || t.includes('chamber') || t.includes('municipal')) return 'public';
  if (t === 'hei' || t.includes('university') || t.includes('school') || t.includes('education')) return 'education';
  if (t.includes('sme') || t.includes('enterprise') || t.includes('company') || t.includes('business')) return 'business';
  if (t.includes('research')) return 'research';
  if (t.includes('vet')) return 'education';
  return t;
}

/* ── ISO2 ↔ country name caches ──────────────────────────────── */

let _name2iso = null;
let _iso2name = null;

async function loadCountryMaps() {
  if (_name2iso && _iso2name) return;
  try {
    const [rows] = await pool.query('SELECT iso2, name_en FROM ref_countries');
    _name2iso = new Map();
    _iso2name = new Map();
    for (const r of rows) {
      if (r.iso2 && r.name_en) {
        _name2iso.set(r.name_en.toLowerCase(), r.iso2.toUpperCase());
        _iso2name.set(r.iso2.toUpperCase(), r.name_en);
      }
    }
  } catch {
    _name2iso = new Map();
    _iso2name = new Map();
  }
}

/* ── Build entity-shape row from organizations row ───────────── */

function toEntityRow(r, iso2) {
  return {
    oid:                toLocalOid(r.id),
    pic:                r.pic || null,
    name:               r.organization_name,
    display_name:       r.organization_name,
    legal_name:         r.legal_name_latin || r.legal_name_national || r.organization_name,
    acronym:            r.acronym || null,
    country_code:       iso2 || null,
    country:            r.country || null,
    region:             r.region || null,
    city:               r.city || null,
    address:            r.address || null,
    post_code:          r.post_code || null,
    website:            r.website || null,
    email:              r.email || null,
    phone:              r.telephone1 || null,
    logo_url:           r.logo_url || null,
    description:        r.description || null,
    category:           normalizeCategory(r.org_type),
    category_confidence:'high',
    quality_tier:       'owner',
    validity_label:     'local',
    status_bucket:      'local',
    is_certified:       0,
    can_apply:          1,
    total_projects:     0,
    as_coordinator:     0,
    last_project_date:  null,
    lat:                r.lat != null ? Number(r.lat) : null,
    lng:                r.lng != null ? Number(r.lng) : null,
    latitude:           r.lat != null ? Number(r.lat) : null,
    longitude:          r.lng != null ? Number(r.lng) : null,
    _is_local:          true,
    _local_org_id:      r.id,
  };
}

/* ── Search local orgs (q + country) ─────────────────────────── */

async function searchLocalAsEntities({ q, country, limit = 50 } = {}) {
  await loadCountryMaps();

  const params = [];
  let where = "WHERE o.active=1 AND o.is_public=1";

  if (q) {
    const like = `%${q}%`;
    where += " AND (o.organization_name LIKE ? OR o.acronym LIKE ? OR o.legal_name_national LIKE ? OR o.legal_name_latin LIKE ? OR o.pic LIKE ? OR o.city LIKE ?)";
    params.push(like, like, like, like, like, like);
  }

  if (country) {
    // Accept ISO2 from the picker; convert to name and also allow direct name match.
    const iso = String(country).toUpperCase();
    const asName = _iso2name && _iso2name.get(iso);
    where += " AND (o.country = ?" + (asName ? " OR o.country = ?" : "") + ")";
    params.push(iso);
    if (asName) params.push(asName);
  }

  const sql = `
    SELECT o.id, o.organization_name, o.legal_name_national, o.legal_name_latin,
           o.acronym, o.org_type, o.country, o.region, o.city, o.address, o.post_code,
           o.pic, o.website, o.email, o.telephone1, o.logo_url, o.description,
           o.lat, o.lng
      FROM organizations o
      ${where}
     ORDER BY o.organization_name ASC
     LIMIT ?`;
  const [rows] = await pool.query(sql, [...params, Number(limit) || 50]);

  return rows.map(r => {
    const iso = r.country ? (_name2iso && _name2iso.get(r.country.toLowerCase())) : null;
    return toEntityRow(r, iso || null);
  });
}

/* ── Get one local org as full entity shape (for ficha) ──────── */

async function getLocalEntityByOid(oid) {
  if (!isLocalOid(oid)) return null;
  await loadCountryMaps();
  const id = fromLocalOid(oid);
  const [[r]] = await pool.query(
    `SELECT * FROM organizations WHERE id = ? AND active = 1 LIMIT 1`,
    [id]
  );
  if (!r) return null;
  const iso = r.country ? (_name2iso && _name2iso.get(r.country.toLowerCase())) : null;
  const entity = toEntityRow(r, iso || null);
  return {
    ...entity,
    recent_projects: [],
    top_copartners:  [],
    timeline:        [],
  };
}

module.exports = {
  LOCAL_PREFIX,
  isLocalOid,
  toLocalOid,
  fromLocalOid,
  normalizeCategory,
  searchLocalAsEntities,
  getLocalEntityByOid,
};
