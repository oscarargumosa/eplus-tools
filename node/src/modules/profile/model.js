/* ═══════════════════════════════════════════════════════════════
   Perfil de la persona (23-oct-2026). Ver docs/PERFIL.md.
   Un solo perfil, el de Mi cuenta: foto (users.avatar_url), teléfono
   (users.phone, PRIVADO), entidad (user_organizations o «no pertenezco»),
   ubicación y «sobre ti» (community_profiles). La Comunidad usa este
   mismo perfil y solo decide si se muestra y a quién (visible/audiencia):
   aquí nunca se tocan esas columnas.
   ═══════════════════════════════════════════════════════════════ */

const db = require('../../utils/db');
const C = require('../community/constants');

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new HttpError(status, code, message); };

// Los cinco pasos, en el orden del asistente.
const STEPS = ['photo', 'phone', 'organization', 'location', 'about'];

// Prefijos telefónicos de los países del catálogo y de los de fuera más habituales.
const DIAL = {
  AT: '43', BE: '32', BG: '359', HR: '385', CY: '357', CZ: '420', DK: '45', EE: '372', FI: '358',
  FR: '33', DE: '49', GR: '30', HU: '36', IE: '353', IT: '39', LV: '371', LT: '370', LU: '352',
  MT: '356', NL: '31', PL: '48', PT: '351', RO: '40', SK: '421', SI: '386', ES: '34', SE: '46',
  IS: '354', LI: '423', NO: '47', MK: '389', RS: '381', TR: '90', AL: '355', BA: '387', ME: '382',
  XK: '383', MD: '373', UA: '380', GE: '995', AM: '374', CH: '41', GB: '44', MA: '212', TN: '216',
  EG: '20', JO: '962', LB: '961', IL: '972', PS: '970',
};

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

function text(v, max, { multiline = false } = {}) {
  if (v == null) return '';
  let s = String(v).replace(multiline ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  s = s.trim();
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  return s.slice(0, max);
}
function keysFrom(list, dict, max = 20) {
  const arr = Array.isArray(list) ? list : String(list || '').split(',');
  const out = [];
  for (const k of arr) {
    const key = String(k).trim();
    if (dict[key] && !out.includes(key)) out.push(key);
    if (out.length >= max) break;
  }
  return out;
}
const splitKeys = (v, dict) => keysFrom(v, dict);

/* «+34 600 11 22 33» → «+34 600112233». Exige el prefijo del país. */
function normPhone(v) {
  const raw = String(v || '').replace(/[\s().-]/g, '');
  if (!raw) return null;
  const s = raw.startsWith('00') ? '+' + raw.slice(2) : raw;
  if (!/^\+\d{8,15}$/.test(s)) fail(400, 'PHONE_INVALID', 'Escribe el teléfono con el prefijo del país, por ejemplo +34 600 112 233.');
  // Separa el prefijo conocido más largo para poder enseñarlo en dos partes.
  const digits = s.slice(1);
  const codes = [...new Set(Object.values(DIAL))].sort((a, b) => b.length - a.length);
  const code = codes.find(c => digits.startsWith(c) && digits.length - c.length >= 6);
  return code ? `+${code} ${digits.slice(code.length)}` : s;
}

async function myOrgs(userId) {
  // i18n-no-inicio
  const [rows] = await db.query(
    `SELECT o.id, o.organization_name AS name, o.country, o.city, o.logo_url, o.lat, o.lng,
            (o.verified_at IS NOT NULL) AS verified
       FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id
      WHERE uo.user_id = ? ORDER BY uo.created_at ASC`, [userId]);
  // i18n-no-fin
  return rows.map(o => ({
    id: o.id, name: o.name, city: o.city || null, logo_url: o.logo_url || null, verified: !!o.verified,
    country: C.countryCode(o.country),
    location: o.lat != null && o.lng != null ? { lat: Number(o.lat), lng: Number(o.lng) } : null,
  }));
}

async function load(userId) {
  const [[u]] = await db.query('SELECT id, name, avatar_url, phone, profile_wizard_at FROM users WHERE id = ?', [userId]);
  if (!u) fail(404, 'NOT_FOUND', 'La cuenta no existe');
  const [[p]] = await db.query('SELECT * FROM community_profiles WHERE user_id = ?', [userId]);
  return { u, p: p || null, orgs: await myOrgs(userId) };
}

function completion({ u, p, orgs }) {
  const done = {
    photo: !!u.avatar_url,
    phone: !!u.phone,
    organization: orgs.length > 0 || !!(p && p.no_organization),
    location: !!(p && p.lat != null && p.lng != null),
    about: !!(p && p.headline && p.bio),
  };
  const n = STEPS.filter(k => done[k]).length;
  return {
    steps: STEPS.map(key => ({ key, done: done[key] })),
    missing: STEPS.filter(k => !done[k]),
    done: n, total: STEPS.length, percent: Math.round((n / STEPS.length) * 100),
  };
}

/* Listas cerradas con su texto en el idioma de la petición. */
function catalog(t) {
  const m = d => Object.entries(d).map(([key, label]) => ({ key, label: t(label) }));
  return {
    roles: m(C.ROLES), sectors: m(C.SECTORS), actions: m(C.ACTIONS),
    countries: m(C.COUNTRIES).map(c => ({ ...c, dial: DIAL[c.key] || null })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function view(state, t) {
  const { u, p, orgs } = state;
  return {
    name: u.name,
    avatar_url: u.avatar_url || null,
    phone: u.phone || '',
    headline: (p && p.headline) || '',
    bio: (p && p.bio) || '',
    roles: splitKeys(p && p.roles, C.ROLES),
    sectors: splitKeys(p && p.sectors, C.SECTORS),
    actions: splitKeys(p && p.actions, C.ACTIONS),
    no_organization: !!(p && p.no_organization),
    organization_id: (p && p.organization_id && orgs.some(o => o.id === p.organization_id)) ? p.organization_id : (orgs[0] ? orgs[0].id : null),
    country: (p && p.country) || (orgs[0] && orgs[0].country) || null,
    location: p && p.lat != null ? {
      lat: Number(p.lat), lng: Number(p.lng), label: p.location_label || '', source: p.location_source || 'manual',
    } : null,
    community_visible: !!(p && p.visible),
    orgs,
    completion: completion(state),
    // El asistente completo solo se ofrece una vez por cuenta; después, el recordatorio corto.
    wizard_pending: !u.profile_wizard_at,
    catalog: catalog(t),
  };
}

async function me(userId, t) {
  return view(await load(userId), t);
}

/* Guarda solo lo que llega en el cuerpo (cada paso del asistente manda lo suyo). */
async function save(userId, body, t) {
  body = body || {};
  const state = await load(userId);
  const has = k => Object.prototype.hasOwnProperty.call(body, k);

  if (has('phone')) {
    const phone = body.phone ? normPhone(body.phone) : null;
    await db.query('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);
  }

  const p = state.p || {};
  const next = {
    headline: p.headline || null, bio: p.bio || null, roles: p.roles || null, sectors: p.sectors || null, actions: p.actions || null,
    organization_id: p.organization_id || null, no_organization: p.no_organization ? 1 : 0, country: p.country || null,
    location_label: p.location_label || null, lat: p.lat != null ? Number(p.lat) : null, lng: p.lng != null ? Number(p.lng) : null,
    location_source: p.location_source || null,
  };
  let touched = false;

  if (has('headline') || has('bio')) {
    const headline = has('headline') ? text(body.headline, 120) : (next.headline || '');
    const bio = has('bio') ? text(body.bio, 700, { multiline: true }) : (next.bio || '');
    if (EMAIL_RE.test(headline)) fail(400, 'NO_CONTACT', 'Quita el correo del cargo: tu perfil no enseña correos.');
    if (EMAIL_RE.test(bio)) fail(400, 'NO_CONTACT', 'Quita el correo de la presentación: tu perfil no enseña correos.');
    next.headline = headline || null; next.bio = bio || null; touched = true;
  }
  for (const [k, dict] of [['roles', C.ROLES], ['sectors', C.SECTORS], ['actions', C.ACTIONS]]) {
    if (has(k)) { const keys = keysFrom(body[k], dict); next[k] = keys.length ? keys.join(',') : null; touched = true; }
  }

  // Entidad: una de las suyas, o «no pertenezco a ninguna» (que manda sobre la elegida).
  if (has('no_organization') || has('organization_id')) {
    if (has('no_organization')) next.no_organization = body.no_organization ? 1 : 0;
    if (has('organization_id')) {
      const id = body.organization_id ? String(body.organization_id) : null;
      if (id && !state.orgs.some(o => o.id === id)) fail(400, 'ORG_INVALID', 'Esa entidad no está vinculada a tu cuenta.');
      next.organization_id = id;
    }
    if (next.no_organization) next.organization_id = null;
    touched = true;
  }

  if (has('country')) {
    const c = body.country ? String(body.country).toUpperCase() : null;
    if (c && !C.COUNTRIES[c]) fail(400, 'COUNTRY_INVALID', 'País no válido');
    next.country = c; touched = true;
  }

  // Ubicación: { lat, lng, label } (punto en el mapa), { source: 'organization' } o null (quitarla).
  if (has('location')) {
    const loc = body.location;
    const places = p.location_precision === 'exact' ? 6 : 2;   // aproximada: ~1 km
    if (!loc) {
      Object.assign(next, { lat: null, lng: null, location_source: null, location_label: null });
    } else if (loc.source === 'organization') {
      const org = state.orgs.find(o => o.id === (next.organization_id || (state.orgs[0] && state.orgs[0].id)));
      if (!org) fail(400, 'ORG_REQUIRED', 'Primero vincula tu entidad para usar su ciudad.');
      if (!org.location) fail(400, 'ORG_NO_LOCATION', 'Tu entidad aún no tiene ubicación. Marca tu punto en el mapa.');
      Object.assign(next, {
        lat: Number(org.location.lat.toFixed(places)), lng: Number(org.location.lng.toFixed(places)),
        location_source: 'organization', location_label: text(loc.label, 120) || text(org.city, 120) || null,
      });
      if (!next.country && org.country) next.country = org.country;
    } else {
      const lat = Number(loc.lat), lng = Number(loc.lng);
      if (loc.lat == null || loc.lng == null || loc.lat === '' || loc.lng === '' ||
          !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        fail(400, 'LOCATION_INVALID', 'Marca tu punto en el mapa.');
      }
      const label = text(loc.label, 120);
      if (EMAIL_RE.test(label)) fail(400, 'NO_CONTACT', 'Quita el correo del lugar.');
      Object.assign(next, { lat: Number(lat.toFixed(places)), lng: Number(lng.toFixed(places)), location_source: 'manual', location_label: label || null });
    }
    touched = true;
  }
  if (!next.country) {
    const org = state.orgs.find(o => o.id === next.organization_id) || state.orgs[0];
    if (org && org.country) { next.country = org.country; touched = true; }
  }

  if (touched) {
    // visible, audiencia, precisión y busco/ofrezco son de la Comunidad: no se tocan.
    await db.query(
      `INSERT INTO community_profiles
         (user_id, headline, bio, roles, sectors, actions, organization_id, no_organization, country, location_label, lat, lng, location_source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE headline=VALUES(headline), bio=VALUES(bio), roles=VALUES(roles), sectors=VALUES(sectors),
         actions=VALUES(actions), organization_id=VALUES(organization_id), no_organization=VALUES(no_organization),
         country=VALUES(country), location_label=VALUES(location_label), lat=VALUES(lat), lng=VALUES(lng),
         location_source=VALUES(location_source)`,
      [userId, next.headline, next.bio, next.roles, next.sectors, next.actions, next.organization_id, next.no_organization,
       next.country, next.location_label, next.lat, next.lng, next.location_source]);
  }
  return me(userId, t);
}

/* Visto el asistente del primer acceso (terminado u omitido). */
async function wizardSeen(userId) {
  await db.query('UPDATE users SET profile_wizard_at = COALESCE(profile_wizard_at, NOW()) WHERE id = ?', [userId]);
}

module.exports = { HttpError, STEPS, me, save, wizardSeen, normPhone };
