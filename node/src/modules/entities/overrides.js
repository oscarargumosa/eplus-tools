/* ═══════════════════════════════════════════════════════════════
   Entity overrides — capa de "datos manuales" sobre el directorio
   ═══════════════════════════════════════════════════════════════
   Cuando un usuario edita su organización en "Mi Organización"
   (tabla `organizations`) y la entidad existe también en el
   directorio público (directory-api del VPS), los datos manuales
   tienen precedencia. Esta capa hace el merge en el backend, así
   que el override se aplica para CUALQUIER visitante (Atlas, ficha,
   markers del mapa, listado del Partner Engine).

   Reglas:
   - Solo aplica si `organizations.is_public = 1` (visible en directorio).
   - Solo campos no-null/no-vacíos del override pisan el dato del directorio.
   - Si el override tiene lat/lng, también se actualiza la columna que el
     mapa lee (lat/lng o latitude/longitude según endpoint).

   TODO (Phase 2): claim verification — solo aplicar override si
   `claim_status = 'verified'`. Por ahora basta `is_public = 1`.
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');

/* Campos de `organizations` que sobrescriben al entity del directorio.
   Mapeo: columna_local → campo(s) del entity. */
const FIELD_MAP = [
  // texto plano
  ['organization_name', 'name'],
  ['acronym',           'acronym'],
  ['logo_url',          'logo_url'],
  ['description',       'description'],
  ['website',           'website'],
  ['city',              'city'],
  ['region',            'region'],
  ['address',           'address'],
  ['post_code',         'post_code'],
  // geo
  ['lat',               'lat'],
  ['lng',               'lng'],
  ['lat',               'latitude'],   // alias usado por algunos endpoints
  ['lng',               'longitude'],  // ídem
  ['geocoded_source',   'geocoded_source'],
];

const SELECT_COLS = [...new Set(FIELD_MAP.map(([col]) => col))].join(', ');

function isMeaningful(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  return true;
}

/* ── Lookup individual (match por OID o PIC) ─────────────────── */

async function getOverrideByOid(oid, pic = null) {
  if (!oid && !pic) return null;
  try {
    const conds = [];
    const params = [];
    if (oid) { conds.push('oid = ?'); params.push(oid); }
    if (pic) { conds.push('pic = ?'); params.push(pic); }
    const [[row]] = await pool.query(
      `SELECT oid, pic, ${SELECT_COLS}
         FROM organizations
        WHERE (${conds.join(' OR ')}) AND is_public = 1
        LIMIT 1`,
      params
    );
    return row || null;
  } catch (e) {
    if (/Unknown column|doesn't exist/i.test(e.message)) return null;
    throw e;
  }
}

/* ── Lookup bulk para listados (match por OID o PIC) ─────────── */

async function getOverridesByIdentifiers(oids, pics) {
  const oidList = Array.isArray(oids) ? oids.filter(Boolean) : [];
  const picList = Array.isArray(pics) ? pics.filter(Boolean) : [];
  if (!oidList.length && !picList.length) return { byOid: new Map(), byPic: new Map() };
  try {
    const conds = [];
    const params = [];
    if (oidList.length) { conds.push('oid IN (?)'); params.push(oidList); }
    if (picList.length) { conds.push('pic IN (?)'); params.push(picList); }
    const [rows] = await pool.query(
      `SELECT oid, pic, ${SELECT_COLS}
         FROM organizations
        WHERE (${conds.join(' OR ')}) AND is_public = 1`,
      params
    );
    const byOid = new Map();
    const byPic = new Map();
    for (const r of rows) {
      if (r.oid) byOid.set(r.oid, r);
      if (r.pic) byPic.set(String(r.pic), r);
    }
    return { byOid, byPic };
  } catch (e) {
    if (/Unknown column|doesn't exist/i.test(e.message)) return { byOid: new Map(), byPic: new Map() };
    throw e;
  }
}

/* ── Merge ──────────────────────────────────────────────────── */

function mergeOverride(entity, override) {
  if (!entity || !override) return entity;
  const out = { ...entity };
  let touched = false;
  for (const [col, target] of FIELD_MAP) {
    const v = override[col];
    if (isMeaningful(v)) {
      out[target] = v;
      touched = true;
    }
  }
  if (touched) out._has_local_override = true;
  return out;
}

/* ── Aplicador one-shot ─────────────────────────────────────── */

async function applyToEntity(entity) {
  if (!entity) return entity;
  const oid = entity.oid || entity.OID || null;
  const pic = entity.pic || entity.PIC || null;
  if (!oid && !pic) return entity;
  const ov = await getOverrideByOid(oid, pic);
  return ov ? mergeOverride(entity, ov) : entity;
}

/* ── Aplicador bulk para listados ───────────────────────────── */

async function applyToList(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const oids = rows.map(r => r?.oid).filter(Boolean);
  const pics = rows.map(r => r?.pic).filter(Boolean).map(String);
  if (!oids.length && !pics.length) return rows;
  const { byOid, byPic } = await getOverridesByIdentifiers(oids, pics);
  if (!byOid.size && !byPic.size) return rows;
  return rows.map(r => {
    const ov = (r?.oid && byOid.get(r.oid)) || (r?.pic && byPic.get(String(r.pic))) || null;
    return ov ? mergeOverride(r, ov) : r;
  });
}

/* ── Markers virtuales para orgs propias con lat/lng ───────────
   Cuando una org del usuario (organizations.is_public=1, con coords)
   no existe en la sample local de `entities`, igualmente debe verse
   en el Atlas. Esta función devuelve sus markers para concatenar a
   `listGeoMarkers`. */
async function getOwnedMarkers() {
  try {
    const [rows] = await pool.query(
      `SELECT oid, pic, lat, lng, country, organization_name
         FROM organizations
        WHERE lat IS NOT NULL
          AND lng IS NOT NULL
          AND is_public = 1`
    );
    return rows.map(r => ({
      oid:  r.oid || null,
      pic:  r.pic || null,
      lat:  parseFloat(r.lat),
      lng:  parseFloat(r.lng),
      cc:   r.country || null,
      name: r.organization_name,
      tier: 'owner',
    })).filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng));
  } catch (e) {
    if (/Unknown column|doesn't exist/i.test(e.message)) return [];
    throw e;
  }
}

module.exports = {
  getOverrideByOid,
  getOverridesByIdentifiers,
  mergeOverride,
  applyToEntity,
  applyToList,
  getOwnedMarkers,
};
