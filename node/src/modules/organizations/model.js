/* ── Organizations Model ──────────────────────────────────────── */
const pool = require('../../utils/db');
const uuid = require('../../utils/uuid');

/* ── Scalar fields for INSERT / UPDATE ───────────────────────── */
const ORG_FIELDS = [
  'organization_name','legal_name_national','legal_name_latin','acronym','logo_url',
  'org_type','national_id','oid','pic','foundation_date','country','region','city',
  'address','post_code','po_box','cedex','website','email','telephone1',
  'telephone2','fax','is_public_body','is_non_profit','description',
  'activities_experience','has_eu_projects',
  'staff_size','annual_projects','has_training_facilities','has_digital_infrastructure',
  'expertise_areas','erasmus_roles',
  'legal_rep_title','legal_rep_gender','legal_rep_first_name','legal_rep_family_name',
  'legal_rep_department','legal_rep_position','legal_rep_email','legal_rep_telephone1',
  'legal_rep_telephone2','legal_rep_same_address','legal_rep_address','legal_rep_country',
  'legal_rep_region','legal_rep_city','legal_rep_post_code','legal_rep_po_box','legal_rep_cedex',
  'cp_title','cp_gender','cp_first_name','cp_family_name','cp_department','cp_position',
  'cp_email','cp_telephone1','cp_telephone2','cp_same_address','cp_address','cp_country',
  'cp_region','cp_city','cp_post_code','cp_po_box','cp_cedex',
  'is_public','access_mode'
];

function pick(data, fields) {
  const out = {};
  for (const f of fields) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

/* ══ Organization CRUD ══════════════════════════════════════════ */

async function getOrgById(id) {
  const [[org]] = await pool.query('SELECT * FROM organizations WHERE id=?', [id]);
  if (!org) return null;
  const [accreditations]      = await pool.query('SELECT * FROM org_accreditations WHERE organization_id=? ORDER BY created_at', [id]);
  const [euProjects]          = await pool.query('SELECT * FROM org_eu_projects WHERE organization_id=? ORDER BY year DESC', [id]);
  const [keyStaff]            = await pool.query('SELECT * FROM org_key_staff WHERE organization_id=? ORDER BY created_at', [id]);
  const [stakeholders]        = await pool.query('SELECT * FROM org_stakeholders WHERE organization_id=? ORDER BY created_at', [id]);
  const [associatedPartners]  = await pool.query('SELECT * FROM org_associated_partners WHERE organization_id=? ORDER BY created_at', [id]);
  return { ...org, accreditations, eu_projects: euProjects, key_staff: keyStaff, stakeholders, associated_partners: associatedPartners };
}

async function getOrgByUserId(userId) {
  const [rows] = await pool.query(
    'SELECT organization_id FROM user_organizations WHERE user_id=? ORDER BY created_at ASC LIMIT 1',
    [userId]
  );
  if (!rows.length) {
    // Fallback: legacy users.organization_id
    const [[legacy]] = await pool.query('SELECT organization_id FROM users WHERE id=?', [userId]);
    if (!legacy || !legacy.organization_id) return null;
    return getOrgById(legacy.organization_id);
  }
  return getOrgById(rows[0].organization_id);
}

async function getOrgsByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT o.id, o.organization_name, o.acronym, o.org_type, o.country, o.city, uo.role, uo.created_at as linked_at
     FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id
     WHERE uo.user_id=? ORDER BY uo.created_at ASC`,
    [userId]
  );
  return rows;
}

async function upsertOrg(data, id) {
  const vals = pick(data, ORG_FIELDS);
  if (id) {
    const sets = Object.keys(vals).map(k => `${k}=?`).join(', ');
    if (sets) await pool.query(`UPDATE organizations SET ${sets} WHERE id=?`, [...Object.values(vals), id]);
    return id;
  }
  const newId = uuid();
  const cols = ['id', ...Object.keys(vals)];
  const phs  = cols.map(() => '?').join(',');
  await pool.query(`INSERT INTO organizations (${cols.join(',')}) VALUES (${phs})`, [newId, ...Object.values(vals)]);
  return newId;
}

async function linkUserToOrg(userId, orgId) {
  const linkId = uuid();
  await pool.query(
    'INSERT IGNORE INTO user_organizations (id, user_id, organization_id, role) VALUES (?, ?, ?, ?)',
    [linkId, userId, orgId, 'owner']
  );
  // Keep legacy column in sync
  await pool.query('UPDATE users SET organization_id=? WHERE id=?', [orgId, userId]);
}

async function deleteOrg(id) {
  await pool.query('DELETE FROM organizations WHERE id=?', [id]);
}

/* ── Directory listing ───────────────────────────────────────── */
async function listOrgs({ q, country, org_type, page = 1, limit = 20 } = {}) {
  let where = 'WHERE o.active=1 AND o.is_public=1';
  const params = [];
  if (q) { where += ' AND (o.organization_name LIKE ? OR o.city LIKE ? OR o.pic LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (country) { where += ' AND o.country=?'; params.push(country); }
  if (org_type) { where += ' AND o.org_type=?'; params.push(org_type); }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM organizations o ${where}`, params);
  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT o.id, o.organization_name, o.acronym, o.org_type, o.country, o.city, o.pic, o.website, o.is_non_profit, o.is_public_body, o.expertise_areas, o.logo_url,
       (SELECT COUNT(*) FROM org_eu_projects ep WHERE ep.organization_id = o.id) as eu_projects_count
     FROM organizations o ${where}
     ORDER BY o.organization_name ASC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );
  return { rows, meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } };
}

/* ══ Child tables — generic CRUD ════════════════════════════════ */

const CHILD_TABLES = {
  accreditations:      { table: 'org_accreditations',      fields: ['accreditation_type','accreditation_reference'] },
  'eu-projects':       { table: 'org_eu_projects',         fields: ['programme','year','project_id_or_contract','role','beneficiary_name','title'] },
  'key-staff':         { table: 'org_key_staff',           fields: ['name','role','skills_summary'] },
  stakeholders:        { table: 'org_stakeholders',        fields: ['related_org_id','entity_name','entity_type','relationship_type','description','contact_person','email'] },
  'associated-partners':{ table: 'org_associated_partners', fields: ['full_name','address','street_number','country','region','post_code','city','org_type','contact_person','email','phone','website','relation_to_project'] },
};

async function listChildren(type, orgId) {
  const cfg = CHILD_TABLES[type];
  if (!cfg) throw new Error('Unknown child type');
  const [rows] = await pool.query(`SELECT * FROM ${cfg.table} WHERE organization_id=? ORDER BY created_at`, [orgId]);
  return rows;
}

async function upsertChild(type, orgId, data, id) {
  const cfg = CHILD_TABLES[type];
  if (!cfg) throw new Error('Unknown child type');
  const vals = pick(data, cfg.fields);
  if (id) {
    const sets = Object.keys(vals).map(k => `${k}=?`).join(', ');
    if (sets) await pool.query(`UPDATE ${cfg.table} SET ${sets} WHERE id=? AND organization_id=?`, [...Object.values(vals), id, orgId]);
    return id;
  }
  const newId = uuid();
  const cols = ['id','organization_id', ...Object.keys(vals)];
  const phs  = cols.map(() => '?').join(',');
  await pool.query(`INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${phs})`, [newId, orgId, ...Object.values(vals)]);
  return newId;
}

async function deleteChild(type, id, orgId) {
  const cfg = CHILD_TABLES[type];
  if (!cfg) throw new Error('Unknown child type');
  await pool.query(`DELETE FROM ${cfg.table} WHERE id=? AND organization_id=?`, [id, orgId]);
}

/* ── Ownership check ─────────────────────────────────────────── */
async function isOrgOwner(userId, orgId) {
  const [rows] = await pool.query(
    'SELECT 1 FROM user_organizations WHERE user_id=? AND organization_id=?',
    [userId, orgId]
  );
  return rows.length > 0;
}

/* ══ ORS (Erasmus+ Organisation Registration System) proxy ═════
   Public API, no auth. Discovery documented in docs/ORS_CRAWL_SPEC.md.
   Used to prefill entity data when a user creates a new organization.
   ───────────────────────────────────────────────────────────── */

const ORS_BASE = 'https://webgate.ec.europa.eu/eac-eescp-backend';
const ORS_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'X-Lang-Param': 'en',
  'Origin': 'https://webgate.ec.europa.eu',
  'Referer': 'https://webgate.ec.europa.eu/erasmus-esc/index/organisations/search-for-an-organisation',
};

let _countryTaxToIso = null;

async function loadCountryTaxonomy() {
  if (_countryTaxToIso) return _countryTaxToIso;
  try {
    const r = await fetch(`${ORS_BASE}/configuration/countries`, { headers: ORS_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = await r.json();
    const map = {};
    for (const c of (list || [])) {
      if (c.id && c.isoCode) map[String(c.id)] = c.isoCode;
      else if (c.id && c.code) map[String(c.id)] = c.code;
    }
    _countryTaxToIso = map;
  } catch (err) {
    console.warn('[ors] country taxonomy fetch failed:', err.message);
    _countryTaxToIso = {};
  }
  return _countryTaxToIso;
}

const VALIDITY_LABEL = {
  '42284353': 'certified',
  '42284356': 'waiting',
};

async function orsLookup(q) {
  const filter = (q || '').trim();
  if (filter.length < 2) return [];
  const [tax] = await Promise.all([loadCountryTaxonomy()]);
  const res = await fetch(`${ORS_BASE}/ext-api/organisation-registration/simpleSearch`, {
    method: 'POST',
    headers: ORS_HEADERS,
    body: JSON.stringify({ filter }),
  });
  if (!res.ok) {
    const err = new Error(`ORS returned HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }
  const raw = await res.json();
  const rows = Array.isArray(raw) ? raw : [];
  return rows.slice(0, 25).map(r => normaliseOrsRow(r, tax));
}

function trim(v) { return typeof v === 'string' ? v.trim() : v; }

function normaliseOrsRow(r, countryMap) {
  const countryTax = r.country ? String(r.country) : null;
  const iso = countryTax && countryMap[countryTax] ? countryMap[countryTax] : null;
  return {
    oid:             trim(r.organisationId) || null,
    pic:             trim(r.pic) || null,
    legal_name:      trim(r.legalName) || '',
    business_name:   trim(r.businessName) || null,
    country_iso:     iso,
    country_tax_id:  countryTax,
    city:            trim(r.city) || null,
    website:         trim(r.website) || null,
    website_show:    trim(r.websiteShow) || null,
    vat:             trim(r.vat) || null,
    registration_no: trim(r.registration) || null,
    validity_label:  VALIDITY_LABEL[String(r.validityType)] || null,
    go_to_link:      trim(r.goTolink) || null,
  };
}

/* ── Coords (self-geolocate / pin draggable) ────────────────── */

async function updateOrgCoords(orgId, lat, lng, source) {
  await pool.query(
    `UPDATE organizations SET lat=?, lng=?, geocoded_source=?, geocoded_at=NOW() WHERE id=?`,
    [Number(lat).toFixed(6), Number(lng).toFixed(6), source, orgId]
  );
}

/* ── Backfill OID via directory-api lookup por PIC ──────────────
   Cuando una org se crea con PIC pero sin OID, intenta resolver el
   OID consultando el directorio público. Idempotente. Tolerante a
   fallos (si el directorio no responde, simplemente no hace nada). */
async function backfillOidFromPic(orgId) {
  const [[row]] = await pool.query(
    `SELECT id, oid, pic, organization_name FROM organizations WHERE id = ? LIMIT 1`,
    [orgId]
  );
  if (!row || !row.pic || row.oid) return null;
  try {
    const dir = require('../../utils/directory-api');
    // El directory-api no expone búsqueda directa por PIC ni endpoint by-pic.
    // Estrategia: buscar por nombre y filtrar por PIC exacto en los resultados.
    const name = (row.organization_name || '').trim();
    if (!name) return null;
    const resp = await dir.search({ q: name, limit: 25 });
    const list = (resp && Array.isArray(resp.results)) ? resp.results : [];
    const match = list.find(r => String(r.pic) === String(row.pic) && r.oid);
    if (!match || !match.oid) return null;
    await pool.query(`UPDATE organizations SET oid = ? WHERE id = ? AND oid IS NULL`, [match.oid, orgId]);
    return match.oid;
  } catch (e) {
    return null;
  }
}

/* ══ Adopt entity from directory ═════════════════════════════════
   Convierte una entidad del directorio (entities backend; MySQL view
   v_entities_public o directory-api proxy según ENTITIES_BACKEND) en
   una organization local, deduplicando por oid. Devuelve el id +
   campos canónicos para enganchar al partner del intake.
   ─────────────────────────────────────────────────────────────── */

async function upsertFromEntity(oid) {
  // Fast-path: el oid "local-<uuid>" se refiere a una org ya existente en
  // MySQL (creada manualmente o adoptada antes). Devolvemos esa fila sin
  // pasar por el directorio público.
  if (typeof oid === 'string' && oid.startsWith('local-')) {
    const localId = oid.slice('local-'.length);
    const [[r]] = await pool.query(
      'SELECT id, organization_name, country, city FROM organizations WHERE id = ? AND active = 1 LIMIT 1',
      [localId]
    );
    if (!r) throw new Error('Local organization not found');
    return r;
  }

  // Carga el entity via el backend activo (mysql o directory_api).
  // Lazy-require para evitar ciclo (entities/backend.js no requiere orgs).
  const entitiesBackend = require('../entities/backend');
  const entity = await entitiesBackend.getEntityById(oid);
  if (!entity) throw new Error('Entity not found in directory');

  // Dedup: si ya existe una org local enganchada a este oid, reusar.
  const [[existing]] = await pool.query(
    'SELECT id, organization_name, country, city FROM organizations WHERE oid = ? LIMIT 1',
    [oid]
  );
  if (existing) return existing;

  // ISO2 → nombre del país (organizations.country guarda nombre, no código).
  let countryName = null;
  if (entity.country_code) {
    const [[c]] = await pool.query(
      'SELECT name_en FROM ref_countries WHERE iso2 = ? LIMIT 1',
      [String(entity.country_code).toUpperCase()]
    );
    if (c) countryName = c.name_en;
  }

  // category → org_type (best-effort, NULL si no hay mapeo)
  const orgTypeMap = {
    hei: 'university', university: 'university',
    ngo: 'ngo', nonprofit: 'ngo', association: 'ngo',
    public: 'public_body', government: 'public_body', public_body: 'public_body',
    business: 'enterprise', company: 'enterprise', sme: 'enterprise',
    research: 'research',
  };
  const orgType = orgTypeMap[String(entity.category || '').toLowerCase()] || null;

  const parseList = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } }
    return [];
  };
  const emails = parseList(entity.emails);
  const phones = parseList(entity.phones);

  const payload = {
    organization_name: entity.display_name || entity.legal_name || entity.name || '',
    legal_name_latin:  entity.legal_name || null,
    oid:               entity.oid,
    pic:               entity.pic || null,
    org_type:          orgType,
    country:           countryName || entity.country_code || null,
    city:              entity.city || null,
    website:           entity.website || null,
    email:             emails[0] || null,
    telephone1:        phones[0] || null,
    description:       entity.description || null,
    logo_url:          entity.logo_url || null,
    is_public:         0,
  };

  const id = await upsertOrg(payload);
  return {
    id,
    organization_name: payload.organization_name,
    country:           payload.country,
    city:              payload.city,
  };
}

module.exports = {
  getOrgById, getOrgByUserId, getOrgsByUserId, upsertOrg, linkUserToOrg, deleteOrg,
  listOrgs, listChildren, upsertChild, deleteChild, isOrgOwner,
  orsLookup, updateOrgCoords, backfillOidFromPic, upsertFromEntity,
};
