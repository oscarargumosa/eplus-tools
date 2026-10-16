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

/* Lo que el usuario puede escribir en su ficha (PUT /organizations/mine).
   Fuera: is_public (se cambia aparte, solo el dueño reclamado: setPublic)
   y logo_url (solo por la subida del logo, con su comprobación de tipo). */
const USER_ORG_FIELDS = ORG_FIELDS.filter(f => !['is_public', 'logo_url'].includes(f));

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
    `SELECT o.id, o.organization_name, o.acronym, o.org_type, o.country, o.city, o.oid, o.pic, o.logo_url,
            (o.claimed_by_user_id = uo.user_id) AS is_owner, (o.verified_at IS NOT NULL) AS verified,
            o.verification_status, uo.role, uo.created_at as linked_at
     FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id
     WHERE uo.user_id=? ORDER BY uo.created_at ASC`,
    [userId]
  );
  return rows;
}

async function upsertOrg(data, id, fields = ORG_FIELDS) {
  const vals = pick(data, fields);
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
// Solo id + owner_user_id (sin cargar hijos) para comprobar acceso.
async function getOrgOwnerInfo(id) {
  const [[org]] = await pool.query('SELECT id, owner_user_id FROM organizations WHERE id=?', [id]);
  return org || null;
}

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
  // Valores = los del <select> de Mi Organización (index.html).
  const orgTypeMap = {
    hei: 'University', university: 'University',
    school: 'School/Institute',
    ngo: 'NGO', nonprofit: 'NGO', association: 'NGO', foundation: 'Foundation',
    public: 'Public body', government: 'Public body', public_body: 'Public body',
    business: 'SME', company: 'SME', sme: 'SME', enterprise: 'SME',
    research: 'Research Centre',
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

/* ══ Reclamar una entidad del directorio ═════════════════════════
   Reglas (decisión de Óscar, 8-oct-2026; revisión de seguridad 16-oct):
   - Sin verificación previa: el primero que la reclama es su dueño.
   - UN SOLO dueño por entidad (organizations.claimed_by_user_id),
     comprobado por OID **y** por PIC: no se puede duplicar una entidad
     ya reclamada creando otra con su PIC.
   - Documentación (estatutos, escrituras, acta, poderes) recomendada,
     no obligatoria. Al subirla la entidad queda «pendiente de revisión»;
     el sello «Verificada» (verified_at) solo lo pone un admin.
   - Si otra persona la reclama → conflicto (org_claim_disputes) y se
     pide la documentación a ambas partes.
   ─────────────────────────────────────────────────────────────── */

function claimError(msg, status, extra = {}) {
  const e = new Error(msg);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

const normId = (v) => (v === null || v === undefined) ? '' : String(v).trim();

/* Entidad ya reclamada por OTRA persona con ese OID o ese PIC.
   Devuelve { id, oid, pic } de la reclamada o null. */
async function claimedByOther({ oid, pic }, userId, exceptOrgId = null) {
  const o = normId(oid);
  const p = normId(pic);
  const conds = [];
  const params = [];
  if (o && !o.startsWith('local-')) { conds.push('oid = ?'); params.push(o); }
  if (p) { conds.push('pic = ?'); params.push(p); }
  if (!conds.length) return null;
  const [[row]] = await pool.query(
    `SELECT id, oid, pic FROM organizations
      WHERE (${conds.join(' OR ')})
        AND claimed_by_user_id IS NOT NULL AND claimed_by_user_id <> ?
        AND (? IS NULL OR id <> ?)
      ORDER BY (verified_at IS NULL), claimed_at ASC LIMIT 1`,
    [...params, userId, exceptOrgId, exceptOrgId]
  );
  return row || null;
}

/* Compatibilidad con el nombre anterior (solo OID). */
async function oidOwnedByOther(oid, userId, exceptOrgId = null) {
  return !!(await claimedByOther({ oid }, userId, exceptOrgId));
}

/* El usuario es el dueño reclamado (o, en filas antiguas sin dueño
   reclamado, está enlazado en user_organizations). */
async function isClaimOwner(userId, orgId) {
  const [[org]] = await pool.query('SELECT claimed_by_user_id FROM organizations WHERE id = ?', [orgId]);
  if (!org) return false;
  if (org.claimed_by_user_id) return org.claimed_by_user_id === userId;
  return isOrgOwner(userId, orgId);
}

async function searchClaimable(q, userId) {
  const term = (q || '').trim();
  if (term.length < 2) return [];
  const entitiesBackend = require('../entities/backend');
  const resp = await entitiesBackend.listEntities({ q: term, limit: 20 });
  const list = Array.isArray(resp) ? resp
    : (resp && (resp.rows || resp.results || resp.data)) || [];
  const real = list.filter(r => r && r.oid);
  const oids = real.map(r => r.oid).filter(o => !String(o).startsWith('local-'));
  const pics = real.map(r => normId(r.pic)).filter(Boolean);
  const byOid = new Map();
  const byPic = new Map();
  // Gana la fila del dueño legítimo: verificada primero, luego la primera reclamada.
  const keep = (map, key, r) => {
    if (!key) return;
    const prev = map.get(key);
    if (!prev || (!prev.claimed_by_user_id && r.claimed_by_user_id)) map.set(key, r);
  };
  if (oids.length || pics.length) {
    const conds = [];
    const params = [];
    if (oids.length) { conds.push('oid IN (?)'); params.push(oids); }
    if (pics.length) { conds.push('pic IN (?)'); params.push(pics); }
    const [rows] = await pool.query(
      `SELECT id, oid, pic, claimed_by_user_id, verified_at FROM organizations
        WHERE ${conds.join(' OR ')}
        ORDER BY (claimed_by_user_id IS NULL), (verified_at IS NULL), claimed_at ASC`,
      params
    );
    for (const r of rows) { keep(byOid, r.oid, r); keep(byPic, normId(r.pic), r); }
  }
  // Orgs solo-locales: el directorio las devuelve con oid sintético "local-<id>".
  const localIds = real.map(r => String(r.oid)).filter(o => o.startsWith('local-')).map(o => o.slice(6));
  if (localIds.length) {
    const [rows] = await pool.query(
      'SELECT id, claimed_by_user_id, verified_at FROM organizations WHERE id IN (?)', [localIds]
    );
    for (const r of rows) byOid.set('local-' + r.id, r);
  }
  return real.map(r => {
    const a = byOid.get(r.oid);
    const b = byPic.get(normId(r.pic));
    // Si por OID no hay dueño pero por PIC sí, manda la reclamada por PIC.
    const local = (a && a.claimed_by_user_id) ? a : (b && b.claimed_by_user_id) ? b : (a || b || null);
    const owner = local && local.claimed_by_user_id;
    const mine = !!owner && owner === userId;
    return {
      oid:          r.oid,
      pic:          r.pic || null,
      name:         r.display_name || r.name || r.legal_name || '(sin nombre)',
      legal_name:   r.legal_name || null,
      city:         r.city || null,
      country_code: r.country_code || r.country || null,
      website:      r.website || null,
      category:     r.category || null,
      claimed:      !!owner,
      claimed_by_me: mine,
      verified:     !!(local && local.verified_at),
      // El id interno solo se da al dueño (para abrir su ficha); nunca de una ajena.
      org_id:       mine ? local.id : null,
    };
  });
}

async function claimEntity(userId, oid) {
  oid = normId(oid);
  if (!oid) throw claimError('oid required', 400);
  // ¿Ya existe en local? (puede existir sin dueño: añadida como socia)
  const [rows] = oid.startsWith('local-')
    ? await pool.query('SELECT id, pic, claimed_by_user_id FROM organizations WHERE id = ?', [oid.slice(6)])
    : await pool.query(
      'SELECT id, pic, claimed_by_user_id FROM organizations WHERE oid = ? ORDER BY claimed_by_user_id IS NULL, created_at ASC',
      [oid]
    );
  const owned = rows.find(r => r.claimed_by_user_id);
  if (owned) {
    if (owned.claimed_by_user_id === userId) {
      await linkUserToOrg(userId, owned.id);
      return { id: owned.id, already_mine: true };
    }
    throw claimError('Esta entidad ya tiene dueño', 409);
  }
  let orgId;
  if (rows.length) orgId = rows[0].id;
  else {
    try { orgId = (await upsertFromEntity(oid)).id; }
    catch (e) { throw claimError('Entidad no encontrada en el directorio', 404); }
  }

  // Dueño único también por PIC: otra fila (con otro OID o sin él) ya reclamada.
  const [[org]] = await pool.query('SELECT oid, pic FROM organizations WHERE id = ?', [orgId]);
  if (await claimedByOther({ oid: org && org.oid, pic: org && org.pic }, userId, orgId)) {
    throw claimError('Esta entidad ya tiene dueño', 409);
  }

  // Condición en el UPDATE: si dos personas reclaman a la vez, solo una gana.
  const [r] = await pool.query(
    `UPDATE organizations
        SET claimed_by_user_id = ?, claimed_at = NOW(), is_public = 1, owner_user_id = COALESCE(owner_user_id, ?)
      WHERE id = ? AND (claimed_by_user_id IS NULL OR claimed_by_user_id = ?)`,
    [userId, userId, orgId, userId]
  );
  if (!r.affectedRows) throw claimError('Esta entidad ya tiene dueño', 409);
  await linkUserToOrg(userId, orgId);
  return { id: orgId };
}

/* Conflicto: se identifica la entidad por su OID del directorio (nunca
   por el id interno de una org ajena). Busca la reclamada por OID o PIC. */
async function openDispute(userId, oid, message) {
  oid = normId(oid);
  if (!oid) throw claimError('oid required', 400);
  let pic = null;
  if (oid.startsWith('local-')) {
    const [[o]] = await pool.query('SELECT pic FROM organizations WHERE id = ?', [oid.slice(6)]);
    pic = o && o.pic;
  } else {
    const [[o]] = await pool.query('SELECT pic FROM organizations WHERE oid = ? AND pic IS NOT NULL LIMIT 1', [oid]);
    pic = o && o.pic;
    if (!pic) {
      try {
        const e = await require('../entities/backend').getEntityById(oid);
        pic = e && e.pic;
      } catch { /* sin directorio: solo por OID */ }
    }
  }
  let org = null;
  if (oid.startsWith('local-')) {
    const [[o]] = await pool.query('SELECT id, claimed_by_user_id FROM organizations WHERE id = ? AND claimed_by_user_id IS NOT NULL', [oid.slice(6)]);
    org = o || null;
  }
  if (!org) {
    const c = await claimedByOther({ oid, pic }, userId);
    if (c) {
      const [[o]] = await pool.query('SELECT id, claimed_by_user_id FROM organizations WHERE id = ?', [c.id]);
      org = o;
    }
  }
  if (!org) throw claimError('Esta entidad no tiene dueño: puedes reclamarla directamente', 404);
  if (org.claimed_by_user_id === userId) throw claimError('Ya eres el dueño de esta entidad', 400);
  const [[open]] = await pool.query(
    "SELECT id FROM org_claim_disputes WHERE organization_id = ? AND claimant_user_id = ? AND status = 'open' LIMIT 1",
    [org.id, userId]
  );
  if (open) return { id: open.id, existing: true };
  const id = uuid();
  await pool.query(
    'INSERT INTO org_claim_disputes (id, organization_id, claimant_user_id, owner_user_id, message) VALUES (?, ?, ?, ?, ?)',
    [id, org.id, userId, org.claimed_by_user_id || null, (message || '').toString().slice(0, 4000) || null]
  );
  return { id, organization_id: org.id };
}

async function listDisputes(status = 'open') {
  const [rows] = await pool.query(
    `SELECT d.id, d.organization_id, o.organization_name, o.oid, o.pic,
            d.claimant_user_id, cu.name AS claimant_name, cu.email AS claimant_email,
            d.owner_user_id, ou.name AS owner_name, ou.email AS owner_email,
            d.message, d.status, d.created_at, d.resolved_at,
            (SELECT COUNT(*) FROM org_claim_documents cd WHERE cd.organization_id = d.organization_id) AS owner_docs
       FROM org_claim_disputes d
       JOIN organizations o ON o.id = d.organization_id
       LEFT JOIN users cu ON cu.id = d.claimant_user_id
       LEFT JOIN users ou ON ou.id = d.owner_user_id
      WHERE d.status = ? ORDER BY d.created_at DESC LIMIT 200`,
    [status]
  );
  return rows;
}

async function resolveDispute(disputeId) {
  const [r] = await pool.query(
    "UPDATE org_claim_disputes SET status = 'resolved', resolved_at = NOW() WHERE id = ? AND status = 'open'",
    [disputeId]
  );
  return r.affectedRows > 0;
}

// Fuera de /public: se sirven solo por ruta autenticada (dueño o admin).
// En producción /app/node/private es un volumen (ORG_CLAIM_DOCS_DIR opcional).
const path = require('path');
const CLAIM_DOCS_DIR = path.resolve(process.env.ORG_CLAIM_DOCS_DIR
  || path.join(__dirname, '../../../private/org-claims'));

/* Ruta en disco de un documento; null si el nombre guardado no es seguro. */
function claimDocPath(storedName) {
  const name = path.basename(String(storedName || ''));
  if (!name || name !== storedName || !/^doc-[A-Za-z0-9-]+(\.[a-z0-9]{1,6})?$/.test(name)) return null;
  return path.join(CLAIM_DOCS_DIR, name);
}

async function markClaimed(orgId, userId) {
  await pool.query(
    'UPDATE organizations SET claimed_by_user_id = ?, claimed_at = NOW() WHERE id = ? AND claimed_by_user_id IS NULL',
    [userId, orgId]
  );
}

const CLAIM_DOC_TYPES = ['estatutos', 'escrituras', 'acta_constitucion', 'poderes', 'otro'];

async function listClaimDocs(orgId) {
  const [rows] = await pool.query(
    `SELECT id, doc_type, original_name, mime, size_bytes, created_at
       FROM org_claim_documents WHERE organization_id = ? ORDER BY created_at ASC`,
    [orgId]
  );
  return rows;
}

async function getClaimDoc(orgId, docId) {
  const [[row]] = await pool.query(
    'SELECT * FROM org_claim_documents WHERE id = ? AND organization_id = ?',
    [docId, orgId]
  );
  return row || null;
}

/* Estado de la verificación: null (sin documentos) | pending | verified | rejected. */
async function getVerification(orgId) {
  const [[row]] = await pool.query(
    `SELECT verification_status, verified_at, verification_reviewed_at, verification_note
       FROM organizations WHERE id = ?`, [orgId]
  );
  if (!row) return null;
  return {
    status:      row.verification_status || null,
    verified:    !!row.verified_at,
    verified_at: row.verified_at || null,
    reviewed_at: row.verification_reviewed_at || null,
    // La nota del admin solo se enseña si se rechazó (motivo).
    note:        row.verification_status === 'rejected' ? (row.verification_note || null) : null,
  };
}

/* Al subir: «pendiente de revisión» salvo que ya esté verificada.
   Nunca pone el sello: eso lo hace un admin (reviewClaim). */
async function addClaimDoc(orgId, userId, docType, file) {
  const id = uuid();
  await pool.query(
    `INSERT INTO org_claim_documents (id, organization_id, user_id, doc_type, original_name, stored_name, mime, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, orgId, userId, CLAIM_DOC_TYPES.includes(docType) ? docType : 'otro',
     (file.originalname || 'documento').slice(0, 255), file.filename, file.mimetype || null, file.size || null]
  );
  await pool.query(
    `UPDATE organizations SET verification_status = 'pending'
      WHERE id = ? AND verified_at IS NULL`, [orgId]
  );
  return id;
}

async function deleteClaimDoc(orgId, docId) {
  const row = await getClaimDoc(orgId, docId);
  if (!row) return null;
  await pool.query('DELETE FROM org_claim_documents WHERE id = ?', [docId]);
  // Sin documentos y sin verificar: ya no hay nada pendiente de revisar.
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM org_claim_documents WHERE organization_id = ?', [orgId]);
  if (!n) {
    await pool.query(
      `UPDATE organizations SET verification_status = NULL
        WHERE id = ? AND verified_at IS NULL AND verification_status = 'pending'`, [orgId]
    );
  }
  return row;
}

/* ── Revisión del admin ─────────────────────────────────────── */

async function listClaimsForReview(status = 'pending') {
  const where = status === 'all'
    ? "o.verification_status IS NOT NULL OR EXISTS (SELECT 1 FROM org_claim_documents cd WHERE cd.organization_id = o.id)"
    : 'o.verification_status = ?';
  const [orgs] = await pool.query(
    `SELECT o.id, o.organization_name, o.oid, o.pic, o.country, o.city,
            o.claimed_by_user_id, u.name AS owner_name, u.email AS owner_email,
            o.claimed_at, o.verification_status, o.verified_at, o.verification_reviewed_at, o.verification_note
       FROM organizations o
       LEFT JOIN users u ON u.id = o.claimed_by_user_id
      WHERE ${where}
      ORDER BY o.claimed_at DESC LIMIT 200`,
    status === 'all' ? [] : [status]
  );
  if (!orgs.length) return [];
  const [docs] = await pool.query(
    `SELECT id, organization_id, doc_type, original_name, mime, size_bytes, created_at
       FROM org_claim_documents WHERE organization_id IN (?) ORDER BY created_at ASC`,
    [orgs.map(o => o.id)]
  );
  const byOrg = new Map();
  for (const d of docs) {
    if (!byOrg.has(d.organization_id)) byOrg.set(d.organization_id, []);
    byOrg.get(d.organization_id).push(d);
  }
  return orgs.map(o => ({ ...o, documents: byOrg.get(o.id) || [] }));
}

async function countPendingClaims() {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM organizations WHERE verification_status = 'pending'");
  return n;
}

/* decision: 'verified' | 'rejected'. Devuelve la org (con email del dueño) o null. */
async function reviewClaim(orgId, adminId, decision, note) {
  if (!['verified', 'rejected'].includes(decision)) throw claimError('Decisión no válida', 400);
  const [[org]] = await pool.query(
    `SELECT o.id, o.organization_name, o.claimed_by_user_id, u.email AS owner_email, u.name AS owner_name
       FROM organizations o LEFT JOIN users u ON u.id = o.claimed_by_user_id WHERE o.id = ?`, [orgId]
  );
  if (!org) return null;
  if (!org.claimed_by_user_id) throw claimError('La entidad no tiene dueño', 400);
  const cleanNote = note ? String(note).trim().slice(0, 500) || null : null;
  if (decision === 'verified') {
    await pool.query(
      `UPDATE organizations
          SET verification_status = 'verified', verified_at = NOW(), verified_by = ?,
              verification_reviewed_at = NOW(), verification_note = ?, claim_status = 'verified'
        WHERE id = ?`, [adminId, cleanNote, orgId]
    );
  } else {
    await pool.query(
      `UPDATE organizations
          SET verification_status = 'rejected', verified_at = NULL, verified_by = ?,
              verification_reviewed_at = NOW(), verification_note = ?, claim_status = 'claimed_provisional'
        WHERE id = ?`, [adminId, cleanNote, orgId]
    );
  }
  return org;
}

/* Poner o quitar la entidad del directorio: solo su dueño o admin
   (fuera de ORG_FIELDS para que no viaje en cualquier PUT). */
async function setPublic(orgId, isPublic) {
  await pool.query('UPDATE organizations SET is_public = ? WHERE id = ?', [isPublic ? 1 : 0, orgId]);
}

module.exports = {
  getOrgById, getOrgByUserId, getOrgsByUserId, upsertOrg, linkUserToOrg, deleteOrg,
  listOrgs, listChildren, upsertChild, deleteChild, isOrgOwner, getOrgOwnerInfo,
  orsLookup, updateOrgCoords, backfillOidFromPic, upsertFromEntity,
  searchClaimable, claimEntity, openDispute, listDisputes, resolveDispute, CLAIM_DOC_TYPES, CLAIM_DOCS_DIR,
  claimDocPath, markClaimed, listClaimDocs, getClaimDoc, addClaimDoc, deleteClaimDoc, oidOwnedByOther,
  claimedByOther, isClaimOwner, getVerification, listClaimsForReview, countPendingClaims, reviewClaim,
  setPublic, USER_ORG_FIELDS,
};
