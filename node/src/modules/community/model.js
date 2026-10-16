/* ═══════════════════════════════════════════════════════════════
   Comunidad — modelo y reglas. Ver docs/COMUNIDAD.md.
   Toda la privacidad se decide AQUÍ, antes de serializar:
     · perfiles: solo visibles (y de personas con el área), salvo el propio;
     · ubicación: audiencia y precisión aplicadas antes de enviar coordenadas;
     · mensajes: solo las dos personas de una conexión aceptada;
     · grupos: solo sus miembros (y el equipo para moderar).
   Nunca se devuelve el email ni el teléfono de nadie.
   ═══════════════════════════════════════════════════════════════ */

const db = require('../../utils/db');
const C = require('./constants');

class HttpError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, message) => { throw new HttpError(status, code, message); };

/* ── utilidades ─────────────────────────────────────────────────── */
// Texto limpio: sin caracteres de control (salvo saltos de línea), recortado.
function text(v, max, { multiline = false } = {}) {
  if (v == null) return '';
  let s = String(v).replace(multiline ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  s = s.trim();
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  return s.slice(0, max);
}
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

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
const csv = (keys) => (keys.length ? keys.join(',') : null);
const splitCsv = (s, dict) => keysFrom(s, dict);

/* Enlace: solo http(s), con host, sin credenciales. Devuelve la URL normalizada o lanza. */
function safeUrl(v, { required = false } = {}) {
  const s = text(v, 500);
  if (!s) { if (required) fail(400, 'LINK_REQUIRED', 'Añade el enlace al recurso (empieza por https://).'); return null; }
  let u;
  try { u = new URL(s); } catch { fail(400, 'LINK_INVALID', 'El enlace no es válido. Debe empezar por https:// o http://'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') fail(400, 'LINK_INVALID', 'El enlace debe empezar por https:// o http://');
  if (!u.hostname || !u.hostname.includes('.') || u.username || u.password) fail(400, 'LINK_INVALID', 'El enlace no es válido.');
  return u.toString().slice(0, 500);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const isAdmin = (user) => user && user.role === 'admin';

/* ── quién está en la comunidad ─────────────────────────────────── */
// Personas con el área (o admin). Se usa para listar perfiles y conectar.
const IN_COMMUNITY_SQL = `(u.role = 'admin' OR EXISTS (SELECT 1 FROM user_areas ua WHERE ua.user_id = u.id AND ua.area = 'comunidad'))`;

// Perfil + entidad (solo si la persona sigue vinculada a ella en «Mi entidad»).
const PERSON_SELECT = `
  SELECT u.id, u.name, u.avatar_url AS user_avatar,
         p.visible, p.headline, p.bio, p.sectors, p.actions, p.languages, p.seeks_partners, p.offers_partner,
         p.organization_id, p.country, p.location_label, p.lat, p.lng, p.location_source,
         p.location_precision, p.location_audience, p.updated_at,
         o.organization_name AS org_name, o.logo_url AS org_logo, o.city AS org_city,
         (o.verified_at IS NOT NULL) AS org_verified
    FROM community_profiles p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN organizations o ON o.id = p.organization_id
         AND EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = p.user_id AND uo.organization_id = o.id)`;

async function connectedIds(userId) {
  const [rows] = await db.query(
    `SELECT IF(user_lo = ?, user_hi, user_lo) AS other FROM community_connections
      WHERE status = 'accepted' AND (user_lo = ? OR user_hi = ?)`, [userId, userId, userId]);
  return new Set(rows.map(r => r.other));
}

/* Ubicación que puede ver `viewerId`. Null si no le corresponde verla.
   Regla: perfil visible + coordenadas + audiencia (members: cualquier
   miembro; connections: solo conexiones aceptadas y la propia persona;
   hidden: nadie). Nunca más decimales que la precisión elegida. */
function sharedLocation(row, viewerId, connected) {
  if (!row || !row.visible || row.lat == null || row.lng == null) return null;
  const self = row.id === viewerId;
  if (row.location_audience === 'hidden') return null;
  if (row.location_audience === 'connections' && !self && !connected.has(row.id)) return null;
  const places = row.location_precision === 'exact' ? 6 : 2;
  return {
    lat: Number(Number(row.lat).toFixed(places)),
    lng: Number(Number(row.lng).toFixed(places)),
    precision: row.location_precision,
    label: row.location_label || null,
  };
}

function avatarOf(row) {
  if (row.user_avatar) return { avatar_url: row.user_avatar, avatar_source: 'user' };
  if (row.org_logo) return { avatar_url: row.org_logo, avatar_source: 'organization' };
  return { avatar_url: null, avatar_source: 'initials' };
}

/* Tarjeta pública de una persona (lo que ve otro miembro). */
function card(row, viewerId, connected) {
  const loc = sharedLocation(row, viewerId, connected);
  return {
    id: row.id,
    name: row.name,
    initials: initials(row.name),
    ...avatarOf(row),
    headline: row.headline || null,
    org: row.org_name ? { name: row.org_name, logo_url: row.org_logo || null, city: row.org_city || null, verified: !!row.org_verified } : null,
    country: row.country || null,
    country_label: row.country ? (C.COUNTRIES[row.country] || row.country) : null,
    sectors: splitCsv(row.sectors, C.SECTORS),
    actions: splitCsv(row.actions, C.ACTIONS),
    languages: splitCsv(row.languages, C.LANGUAGES),
    seeks_partners: !!row.seeks_partners,
    offers_partner: !!row.offers_partner,
    location: loc,
    is_me: row.id === viewerId,
  };
}

/* ── catálogo para el cliente ───────────────────────────────────── */
function catalog() {
  const m = (d) => Object.entries(d).map(([key, v]) => ({ key, label: typeof v === 'string' ? v : v.label }));
  return {
    sectors: m(C.SECTORS), actions: m(C.ACTIONS), languages: m(C.LANGUAGES),
    countries: m(C.COUNTRIES).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    topics: Object.entries(C.TOPICS).map(([key, t]) => ({ key, label: t.label, ask: t.ask, link_required: !!t.linkRequired })),
  };
}

/* ── mi perfil ──────────────────────────────────────────────────── */
async function myOrgs(userId) {
  const [rows] = await db.query(
    `SELECT o.id, o.organization_name AS name, o.country, o.city, o.logo_url, o.lat, o.lng, (o.verified_at IS NOT NULL) AS verified
       FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id
      WHERE uo.user_id = ? ORDER BY uo.created_at ASC`, [userId]);
  return rows.map(o => ({
    id: o.id, name: o.name, city: o.city || null, logo_url: o.logo_url || null, verified: !!o.verified,
    country: C.countryCode(o.country), has_location: o.lat != null && o.lng != null,
  }));
}

async function me(user) {
  const [[row]] = await db.query(`${PERSON_SELECT} WHERE p.user_id = ?`, [user.id]);
  const orgs = await myOrgs(user.id);
  const [[counts]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM community_connections WHERE addressee_id = ? AND status = 'pending') AS requests,
       (SELECT COUNT(*) FROM community_messages m JOIN community_connections c ON c.id = m.connection_id
         WHERE c.status = 'accepted' AND (c.user_lo = ? OR c.user_hi = ?) AND m.sender_id <> ? AND m.read_at IS NULL) AS unread`,
    [user.id, user.id, user.id, user.id]);
  const [[u]] = await db.query('SELECT name, avatar_url FROM users WHERE id = ?', [user.id]);
  const base = row || {
    id: user.id, name: u.name, user_avatar: u.avatar_url, visible: 0, headline: null, bio: null, sectors: null, actions: null,
    languages: null, seeks_partners: 0, offers_partner: 0, organization_id: null, country: null, location_label: null,
    lat: null, lng: null, location_source: null, location_precision: 'approx', location_audience: 'members',
  };
  const firstOrg = orgs[0];
  if (!row && firstOrg) { base.org_logo = firstOrg.logo_url; }
  return {
    exists: !!row,
    profile: {
      ...card(base, user.id, new Set()),
      visible: !!base.visible,
      bio: base.bio || '',
      organization_id: row ? (base.org_name ? base.organization_id : null) : (firstOrg ? firstOrg.id : null),
      location_label: base.location_label || '',
      // Su propia ubicación, tal como está guardada (ya redondeada si es aproximada).
      own_location: base.lat != null ? { lat: Number(base.lat), lng: Number(base.lng) } : null,
      location_source: base.location_source || null,
      location_precision: base.location_precision,
      location_audience: base.location_audience,
    },
    orgs,
    counts: { requests: Number(counts.requests) || 0, unread: Number(counts.unread) || 0 },
    is_admin: isAdmin(user),
    catalog: catalog(),
  };
}

async function saveProfile(user, body) {
  body = body || {};
  const visible = !!body.visible;
  const headline = text(body.headline, 120);
  const bio = text(body.bio, 700, { multiline: true });
  const label = text(body.location_label, 120);
  for (const [v, what] of [[headline, 'el cargo'], [bio, 'la presentación'], [label, 'el lugar']]) {
    if (EMAIL_RE.test(v)) fail(400, 'NO_CONTACT', `Quita el correo de ${what}: la comunidad no publica correos. Para hablar en privado, conecta y usa los mensajes.`);
  }
  const sectors = keysFrom(body.sectors, C.SECTORS);
  const actions = keysFrom(body.actions, C.ACTIONS);
  const languages = keysFrom(body.languages, C.LANGUAGES);

  const orgs = await myOrgs(user.id);
  let orgId = body.organization_id ? String(body.organization_id) : null;
  const org = orgId ? orgs.find(o => o.id === orgId) : null;
  if (orgId && !org) fail(400, 'ORG_INVALID', 'Esa entidad no está vinculada a tu cuenta.');
  if (!org) orgId = null;

  let country = body.country ? String(body.country).toUpperCase() : null;
  if (country && !C.COUNTRIES[country]) fail(400, 'COUNTRY_INVALID', 'País no válido');
  if (!country && org) country = org.country;

  const precision = body.location_precision === 'exact' ? 'exact' : 'approx';
  const audience = ['members', 'connections', 'hidden'].includes(body.location_audience) ? body.location_audience : 'members';
  const mode = ['none', 'organization', 'manual'].includes(body.location_mode) ? body.location_mode : 'none';

  let lat = null, lng = null, source = null, locLabel = label || null;
  if (visible && audience !== 'hidden' && mode !== 'none') {
    if (mode === 'organization') {
      if (!org) fail(400, 'ORG_REQUIRED', 'Elige tu entidad para usar su ciudad en el mapa.');
      const [[o]] = await db.query('SELECT lat, lng, city FROM organizations WHERE id = ?', [org.id]);
      if (!o || o.lat == null || o.lng == null) fail(400, 'ORG_NO_LOCATION', 'Tu entidad aún no tiene ubicación. Marca tu punto en el mapa.');
      lat = Number(o.lat); lng = Number(o.lng); source = 'organization';
      if (!locLabel) locLabel = text(o.city, 120) || null;
    } else {
      lat = Number(body.lat); lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || body.lat === '' || body.lng === '' || body.lat == null || body.lng == null) {
        fail(400, 'LOCATION_INVALID', 'Marca tu punto en el mapa (faltan las coordenadas).');
      }
      source = 'manual';
    }
    // Aproximada: se guarda ya redondeada; la exacta nunca llega a existir.
    const places = precision === 'exact' ? 6 : 2;
    lat = Number(lat.toFixed(places)); lng = Number(lng.toFixed(places));
  }
  // Perfil oculto o ubicación oculta: las coordenadas se BORRAN.

  await db.query(
    `INSERT INTO community_profiles
       (user_id, visible, headline, bio, sectors, actions, languages, seeks_partners, offers_partner,
        organization_id, country, location_label, lat, lng, location_source, location_precision, location_audience)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE visible=VALUES(visible), headline=VALUES(headline), bio=VALUES(bio), sectors=VALUES(sectors),
       actions=VALUES(actions), languages=VALUES(languages), seeks_partners=VALUES(seeks_partners), offers_partner=VALUES(offers_partner),
       organization_id=VALUES(organization_id), country=VALUES(country), location_label=VALUES(location_label), lat=VALUES(lat),
       lng=VALUES(lng), location_source=VALUES(location_source), location_precision=VALUES(location_precision),
       location_audience=VALUES(location_audience)`,
    [user.id, visible ? 1 : 0, headline || null, bio || null, csv(sectors), csv(actions), csv(languages),
     body.seeks_partners ? 1 : 0, body.offers_partner ? 1 : 0, orgId, country, locLabel, lat, lng, source, precision, audience]);
  return me(user);
}

/* ── personas y mapa ────────────────────────────────────────────── */
async function people(user, q = {}) {
  const where = ['p.visible = 1', IN_COMMUNITY_SQL];
  const params = [];
  const sector = C.SECTORS[q.sector] ? q.sector : null;
  const action = C.ACTIONS[q.action] ? q.action : null;
  const country = q.country && C.COUNTRIES[String(q.country).toUpperCase()] ? String(q.country).toUpperCase() : null;
  if (sector) { where.push('FIND_IN_SET(?, p.sectors)'); params.push(sector); }
  if (action) { where.push('FIND_IN_SET(?, p.actions)'); params.push(action); }
  if (country) { where.push('p.country = ?'); params.push(country); }
  if (q.seeks === '1') where.push('p.seeks_partners = 1');
  if (q.offers === '1') where.push('p.offers_partner = 1');
  const search = text(q.q, 80);
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
    where.push('(u.name LIKE ? OR p.headline LIKE ? OR p.bio LIKE ? OR o.organization_name LIKE ? OR p.location_label LIKE ?)');
    params.push(like, like, like, like, like);
  }
  const [rows] = await db.query(`${PERSON_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC LIMIT 500`, params);
  const connected = await connectedIds(user.id);
  const list = rows.map(r => card(r, user.id, connected));
  // Puntos del mapa: solo los ya autorizados por sharedLocation (la tarjeta ya los trae filtrados).
  const points = list.filter(p => p.location).map(p => ({
    id: p.id, name: p.name, initials: p.initials, avatar_url: p.avatar_url, avatar_source: p.avatar_source,
    lat: p.location.lat, lng: p.location.lng, precision: p.location.precision, label: p.location.label,
    org: p.org ? p.org.name : null, is_me: p.is_me,
  }));
  // Primero quien comparte ubicación, como en Emociona; el resto conserva el orden.
  list.sort((a, b) => (b.location ? 1 : 0) - (a.location ? 1 : 0));
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM community_profiles p JOIN users u ON u.id = p.user_id WHERE p.visible = 1 AND ${IN_COMMUNITY_SQL}`);
  return { people: list, points, total: Number(total) || 0 };
}

async function connectionBetween(a, b) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const [[row]] = await db.query('SELECT * FROM community_connections WHERE user_lo = ? AND user_hi = ?', [lo, hi]);
  return row || null;
}

/* Estado de la conexión visto por `viewerId`. Un rechazo no se le revela a quien pidió. */
function connectionState(row, viewerId) {
  if (!row) return { state: 'none', id: null };
  if (row.status === 'accepted') return { state: 'connected', id: row.id };
  if (row.requester_id === viewerId) return { state: 'pending_out', id: row.id };
  if (row.status === 'pending') return { state: 'pending_in', id: row.id, message: row.message || null };
  return { state: 'none', id: null };     // la rechacé yo: puedo pedirla si cambio de idea
}

async function person(user, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) fail(404, 'NOT_FOUND', 'Perfil no encontrado');
  const [[row]] = await db.query(`${PERSON_SELECT} WHERE p.user_id = ? AND ${IN_COMMUNITY_SQL}`, [id]);
  // Perfil oculto (o inexistente): para los demás, no existe.
  if (!row || (!row.visible && row.id !== user.id)) fail(404, 'NOT_FOUND', 'Este perfil no está visible en la comunidad');
  const connected = await connectedIds(user.id);
  const c = card(row, user.id, connected);
  c.bio = row.bio || '';
  c.visible = !!row.visible;
  c.connection = row.id === user.id ? { state: 'self', id: null } : connectionState(await connectionBetween(user.id, row.id), user.id);
  // Aportaciones recientes en conversaciones generales (las de grupos no salen de su grupo).
  const [posts] = await db.query(
    `SELECT id, topic, title, LEFT(body, 220) AS excerpt, created_at FROM community_posts
      WHERE user_id = ? AND group_id IS NULL AND parent_id IS NULL AND hidden = 0 ORDER BY created_at DESC LIMIT 5`, [row.id]);
  c.recent_posts = posts.map(p => ({ ...p, topic_label: C.TOPICS[p.topic] ? C.TOPICS[p.topic].label : null }));
  return c;
}

/* ── conexiones ─────────────────────────────────────────────────── */
async function hasCommunity(userId) {
  const [[r]] = await db.query(`SELECT 1 AS ok FROM users u WHERE u.id = ? AND ${IN_COMMUNITY_SQL}`, [userId]);
  return !!r;
}

async function requestConnection(user, toId, message) {
  toId = String(toId || '');
  if (toId === user.id) fail(400, 'SELF', 'No puedes conectar contigo.');
  const [[target]] = await db.query(`SELECT p.visible FROM community_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? AND ${IN_COMMUNITY_SQL}`, [toId]);
  if (!target || !target.visible) fail(404, 'NOT_FOUND', 'Este perfil no está visible en la comunidad');
  const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM community_connections WHERE requester_id = ? AND status IN ('pending','declined')`, [user.id]);
  const existing = await connectionBetween(user.id, toId);
  const msg = text(message, 300) || null;
  if (msg && EMAIL_RE.test(msg)) fail(400, 'NO_CONTACT', 'No pongas correos en la solicitud: cuando conectéis podréis escribiros aquí.');
  if (existing) {
    if (existing.status === 'accepted') return connectionState(existing, user.id);
    if (existing.requester_id === user.id) return connectionState(existing, user.id);   // ya enviada (o rechazada: no se revela)
    if (existing.status === 'pending') {
      // Me la había pedido a mí: pedirla también es aceptarla.
      await db.query(`UPDATE community_connections SET status = 'accepted', responded_at = NOW() WHERE id = ?`, [existing.id]);
      return { state: 'connected', id: existing.id };
    }
    // La rechacé yo antes y ahora la pido: pasa a ser mía.
    if (Number(n) >= 30) fail(429, 'TOO_MANY', 'Tienes muchas solicitudes sin respuesta. Espera a que te contesten.');
    await db.query(`UPDATE community_connections SET requester_id = ?, addressee_id = ?, status = 'pending', message = ?, created_at = NOW(), responded_at = NULL WHERE id = ?`,
      [user.id, toId, msg, existing.id]);
    return { state: 'pending_out', id: existing.id };
  }
  if (Number(n) >= 30) fail(429, 'TOO_MANY', 'Tienes muchas solicitudes sin respuesta. Espera a que te contesten.');
  const [lo, hi] = user.id < toId ? [user.id, toId] : [toId, user.id];
  const [r] = await db.query(
    `INSERT INTO community_connections (requester_id, addressee_id, user_lo, user_hi, message) VALUES (?,?,?,?,?)`,
    [user.id, toId, lo, hi, msg]);
  return { state: 'pending_out', id: r.insertId };
}

async function respondConnection(user, id, accept) {
  const [[row]] = await db.query(`SELECT * FROM community_connections WHERE id = ? AND addressee_id = ? AND status = 'pending'`, [Number(id) || 0, user.id]);
  if (!row) fail(404, 'NOT_FOUND', 'Solicitud no encontrada');
  await db.query(`UPDATE community_connections SET status = ?, responded_at = NOW() WHERE id = ?`, [accept ? 'accepted' : 'declined', row.id]);
  return { id: row.id, state: accept ? 'connected' : 'declined' };
}

/* Eliminar conexión (o retirar mi solicitud). Al borrar la fila se borran
   sus mensajes (FK CASCADE) y deja de compartirse la ubicación «solo conexiones». */
async function removeConnection(user, id) {
  const [[row]] = await db.query(
    `SELECT * FROM community_connections WHERE id = ? AND (user_lo = ? OR user_hi = ?)`, [Number(id) || 0, user.id, user.id]);
  if (!row) fail(404, 'NOT_FOUND', 'Conexión no encontrada');
  // Rechazada: para quien la rechazó ya no existe. Quien la pidió la ve como
  // pendiente (no se le revela el rechazo) y puede retirarla.
  if (row.status === 'declined' && row.requester_id !== user.id) fail(404, 'NOT_FOUND', 'Conexión no encontrada');
  if (row.status === 'pending' && row.requester_id !== user.id) fail(400, 'USE_DECLINE', 'Para no aceptar una solicitud, recházala.');
  await db.query('DELETE FROM community_connections WHERE id = ?', [row.id]);
  return { removed: true };
}

const MINI_PERSON = `u.id, u.name, u.avatar_url AS user_avatar, p.visible, p.headline,
  (SELECT o.logo_url FROM organizations o JOIN user_organizations uo ON uo.organization_id = o.id
    WHERE uo.user_id = u.id AND o.id = p.organization_id LIMIT 1) AS org_logo,
  (SELECT o.organization_name FROM organizations o JOIN user_organizations uo ON uo.organization_id = o.id
    WHERE uo.user_id = u.id AND o.id = p.organization_id LIMIT 1) AS org_name`;

function mini(r) {
  return { id: r.id, name: r.name, initials: initials(r.name), ...avatarOf(r), headline: r.headline || null,
    org: r.org_name || null, profile_visible: !!r.visible };
}

async function activity(user) {
  const [rows] = await db.query(
    `SELECT c.id AS cid, c.status, c.requester_id, c.message, c.created_at AS c_created, c.responded_at, ${MINI_PERSON},
            (SELECT body FROM community_messages m WHERE m.connection_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
            (SELECT created_at FROM community_messages m WHERE m.connection_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*) FROM community_messages m WHERE m.connection_id = c.id AND m.sender_id <> ? AND m.read_at IS NULL) AS unread
       FROM community_connections c
       JOIN users u ON u.id = IF(c.user_lo = ?, c.user_hi, c.user_lo)
       LEFT JOIN community_profiles p ON p.user_id = u.id
      WHERE (c.user_lo = ? OR c.user_hi = ?)
      ORDER BY COALESCE((SELECT MAX(m.id) FROM community_messages m WHERE m.connection_id = c.id), 0) DESC, c.created_at DESC`,
    [user.id, user.id, user.id, user.id]);
  const out = { connections: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const p = mini(r);
    if (r.status === 'accepted') {
      out.connections.push({ id: r.cid, person: p, since: r.responded_at || r.c_created,
        last_message: r.last_body ? { body: String(r.last_body).slice(0, 140), at: r.last_at } : null, unread: Number(r.unread) || 0 });
    } else if (r.requester_id === user.id) {
      out.outgoing.push({ id: r.cid, person: p, at: r.c_created });   // rechazadas incluidas: no se revela
    } else if (r.status === 'pending') {
      out.incoming.push({ id: r.cid, person: p, at: r.c_created, message: r.message || null });
    }
  }
  return out;
}

/* ── mensajes privados ──────────────────────────────────────────── */
async function myAcceptedConnection(user, id) {
  const [[row]] = await db.query(
    `SELECT * FROM community_connections WHERE id = ? AND status = 'accepted' AND (user_lo = ? OR user_hi = ?)`,
    [Number(id) || 0, user.id, user.id]);
  // Ajena, pendiente o inexistente: la misma respuesta (no se confirma que exista).
  if (!row) fail(404, 'NOT_FOUND', 'Conversación no encontrada');
  return row;
}

async function messages(user, id) {
  const c = await myAcceptedConnection(user, id);
  const other = c.user_lo === user.id ? c.user_hi : c.user_lo;
  const [[o]] = await db.query(`SELECT ${MINI_PERSON} FROM users u LEFT JOIN community_profiles p ON p.user_id = u.id WHERE u.id = ?`, [other]);
  const [rows] = await db.query(
    `SELECT id, sender_id, body, created_at FROM (SELECT * FROM community_messages WHERE connection_id = ? ORDER BY id DESC LIMIT 300) t ORDER BY id ASC`, [c.id]);
  await db.query('UPDATE community_messages SET read_at = NOW() WHERE connection_id = ? AND sender_id <> ? AND read_at IS NULL', [c.id, user.id]);
  return { connection_id: c.id, person: mini(o), messages: rows.map(m => ({ id: m.id, mine: m.sender_id === user.id, body: m.body, at: m.created_at })) };
}

async function sendMessage(user, id, body) {
  const c = await myAcceptedConnection(user, id);
  const msg = text(body, 4000, { multiline: true });
  if (!msg) fail(400, 'EMPTY', 'Escribe tu mensaje.');
  const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM community_messages WHERE sender_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE`, [user.id]);
  if (Number(n) >= 20) fail(429, 'TOO_FAST', 'Vas muy rápido. Espera un minuto.');
  const [r] = await db.query('INSERT INTO community_messages (connection_id, sender_id, body) VALUES (?,?,?)', [c.id, user.id, msg]);
  return { id: r.insertId, mine: true, body: msg, at: new Date() };
}

/* ── grupos ─────────────────────────────────────────────────────── */
async function isMember(userId, groupId) {
  const [[r]] = await db.query('SELECT 1 AS ok FROM community_group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
  return !!r;
}
async function loadGroup(id) {
  const [[g]] = await db.query('SELECT * FROM community_groups WHERE id = ?', [Number(id) || 0]);
  return g || null;
}
// Leer: miembros, y el equipo para moderar. Escribir: solo miembros y grupo activo.
async function canReadGroup(user, groupId) {
  if (groupId == null) return true;
  if (isAdmin(user)) return true;
  return isMember(user.id, groupId);
}

async function groups(user) {
  const [rows] = await db.query(
    `SELECT g.id, g.name, g.description, g.archived,
            (SELECT COUNT(*) FROM community_group_members m WHERE m.group_id = g.id) AS members,
            EXISTS (SELECT 1 FROM community_group_members m WHERE m.group_id = g.id AND m.user_id = ?) AS is_member,
            (SELECT MAX(created_at) FROM community_posts p WHERE p.group_id = g.id AND p.hidden = 0) AS last_post_at
       FROM community_groups g WHERE g.archived = 0 ORDER BY g.name`, [user.id]);
  return rows.map(g => ({ ...g, members: Number(g.members), is_member: !!g.is_member, archived: !!g.archived }));
}

async function group(user, id) {
  const g = await loadGroup(id);
  if (!g || (g.archived && !isAdmin(user))) fail(404, 'NOT_FOUND', 'Grupo no encontrado');
  const member = await isMember(user.id, g.id);
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM community_group_members WHERE group_id = ?', [g.id]);
  return { id: g.id, name: g.name, description: g.description, archived: !!g.archived, members: Number(n), is_member: member,
    can_read: member || isAdmin(user) };
}

async function joinGroup(user, id, join) {
  const g = await loadGroup(id);
  if (!g || g.archived) fail(404, 'NOT_FOUND', 'Grupo no encontrado');
  if (join) await db.query('INSERT IGNORE INTO community_group_members (group_id, user_id) VALUES (?, ?)', [g.id, user.id]);
  else await db.query('DELETE FROM community_group_members WHERE group_id = ? AND user_id = ?', [g.id, user.id]);
  return group(user, g.id);
}

/* ── aportaciones ───────────────────────────────────────────────── */
const POST_SELECT = `
  SELECT p.id, p.user_id, p.group_id, p.parent_id, p.topic, p.title, p.body, p.link_url, p.created_at,
         u.name, u.avatar_url AS user_avatar, cp.visible, cp.headline,
         (SELECT o.logo_url FROM organizations o JOIN user_organizations uo ON uo.organization_id = o.id
           WHERE uo.user_id = u.id AND o.id = cp.organization_id LIMIT 1) AS org_logo,
         (SELECT o.organization_name FROM organizations o JOIN user_organizations uo ON uo.organization_id = o.id
           WHERE uo.user_id = u.id AND o.id = cp.organization_id LIMIT 1) AS org_name,
         (SELECT COUNT(*) FROM community_hearts h WHERE h.post_id = p.id) AS hearts,
         EXISTS (SELECT 1 FROM community_hearts h WHERE h.post_id = p.id AND h.user_id = ?) AS hearted
    FROM community_posts p JOIN users u ON u.id = p.user_id LEFT JOIN community_profiles cp ON cp.user_id = p.user_id`;

function shapePost(r, user) {
  return {
    id: r.id, group_id: r.group_id, parent_id: r.parent_id, topic: r.topic,
    topic_label: r.topic && C.TOPICS[r.topic] ? C.TOPICS[r.topic].label : null,
    title: r.title || null, body: r.body, link_url: r.link_url || null, created_at: r.created_at,
    author: mini(r), mine: r.user_id === user.id,
    hearts: Number(r.hearts) || 0, hearted: !!r.hearted,
    can_moderate: r.user_id === user.id || isAdmin(user),
  };
}

async function withReplies(user, posts) {
  if (!posts.length) return [];
  const ids = posts.map(p => p.id);
  const [replies] = await db.query(`${POST_SELECT} WHERE p.parent_id IN (?) AND p.hidden = 0 ORDER BY p.created_at ASC, p.id ASC`, [user.id, ids]);
  const by = new Map();
  for (const r of replies) { if (!by.has(r.parent_id)) by.set(r.parent_id, []); by.get(r.parent_id).push(shapePost(r, user)); }
  return posts.map(p => ({ ...shapePost(p, user), replies: by.get(p.id) || [] }));
}

async function listPosts(user, q = {}) {
  const groupId = q.group ? Number(q.group) || -1 : null;
  if (groupId != null) {
    const g = await loadGroup(groupId);
    if (!g) fail(404, 'NOT_FOUND', 'Grupo no encontrado');
    if (!(await canReadGroup(user, g.id))) fail(403, 'GROUP_MEMBERS_ONLY', 'Únete al grupo para leer y escribir en sus conversaciones.');
  }
  const where = ['p.parent_id IS NULL', 'p.hidden = 0'];
  const params = [user.id];
  if (groupId != null) { where.push('p.group_id = ?'); params.push(groupId); }
  else {
    where.push('p.group_id IS NULL');
    if (q.topic && C.TOPICS[q.topic]) { where.push('p.topic = ?'); params.push(q.topic); }
  }
  if (q.before && Number(q.before) > 0) { where.push('p.id < ?'); params.push(Number(q.before)); }
  const [rows] = await db.query(`${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 21`, params);
  const more = rows.length > 20;
  return { posts: await withReplies(user, rows.slice(0, 20)), more };
}

/* Aportación visible para `user` (no oculta, padre no oculto, grupo legible). */
async function readablePost(user, id) {
  const [[p]] = await db.query(
    `SELECT p.*, pp.hidden AS parent_hidden FROM community_posts p LEFT JOIN community_posts pp ON pp.id = p.parent_id WHERE p.id = ?`,
    [Number(id) || 0]);
  if (!p || p.hidden || p.parent_hidden) fail(404, 'NOT_FOUND', 'Aportación no encontrada');
  if (!(await canReadGroup(user, p.group_id))) fail(403, 'GROUP_MEMBERS_ONLY', 'Solo para miembros del grupo.');
  return p;
}

async function getPost(user, id) {
  const p = await readablePost(user, id);
  const rootId = p.parent_id || p.id;
  const [rows] = await db.query(`${POST_SELECT} WHERE p.id = ?`, [user.id, rootId]);
  return (await withReplies(user, rows))[0];
}

async function createPost(user, body) {
  body = body || {};
  const content = text(body.body, 5000, { multiline: true });
  let title = text(body.title, 160) || null;
  let topic = null, groupId = null, parentId = null, link = null;

  if (body.parent_id) {
    const parent = await readablePost(user, body.parent_id);
    if (parent.parent_id) fail(400, 'NESTED', 'Responde a la aportación principal.');
    parentId = parent.id; groupId = parent.group_id; title = null;
    link = safeUrl(body.link_url);
  } else if (body.group_id) {
    const g = await loadGroup(body.group_id);
    if (!g || g.archived) fail(404, 'NOT_FOUND', 'Grupo no encontrado');
    groupId = g.id;
    link = safeUrl(body.link_url);
  } else {
    topic = String(body.topic || '');
    if (!C.TOPICS[topic]) fail(400, 'TOPIC_INVALID', 'Elige un tema.');
    link = safeUrl(body.link_url, { required: !!C.TOPICS[topic].linkRequired });
  }
  if (!content && !(topic === 'recursos' && link)) fail(400, 'EMPTY', 'Escribe tu aportación.');
  // Escribir en un grupo: solo sus miembros (el equipo también, si se une).
  if (groupId != null && !(await isMember(user.id, groupId))) fail(403, 'GROUP_MEMBERS_ONLY', 'Únete al grupo para escribir en él.');
  const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM community_posts WHERE user_id = ? AND created_at > NOW() - INTERVAL 10 MINUTE`, [user.id]);
  if (Number(n) >= 15) fail(429, 'TOO_FAST', 'Has publicado mucho en poco tiempo. Espera unos minutos.');
  const [r] = await db.query(
    `INSERT INTO community_posts (user_id, group_id, parent_id, topic, title, body, link_url) VALUES (?,?,?,?,?,?,?)`,
    [user.id, groupId, parentId, topic, title, content || '', link]);
  return getPost(user, r.insertId);
}

/* Retirar: el autor la retira; el equipo la oculta. No se borra (queda para revisión). */
async function removePost(user, id, reason) {
  const [[p]] = await db.query('SELECT id, user_id, hidden, group_id FROM community_posts WHERE id = ?', [Number(id) || 0]);
  if (!p || p.hidden) fail(404, 'NOT_FOUND', 'Aportación no encontrada');
  const own = p.user_id === user.id;
  if (!own && !isAdmin(user)) fail(403, 'FORBIDDEN', 'Solo su autor o el equipo pueden retirarla.');
  if (!own && !(await canReadGroup(user, p.group_id))) fail(403, 'FORBIDDEN', 'Sin permiso');
  await db.query(`UPDATE community_posts SET hidden = 1, hidden_by = ?, hidden_reason = ?, hidden_at = NOW() WHERE id = ?`,
    [own ? 'author' : 'team', text(reason, 300) || null, p.id]);
  return { id: p.id, hidden: true, by: own ? 'author' : 'team' };
}

async function toggleHeart(user, id) {
  const p = await readablePost(user, id);
  if (p.user_id === user.id) fail(400, 'OWN_POST', 'No puedes dar corazón a tu propia aportación.');
  const [r] = await db.query('INSERT IGNORE INTO community_hearts (post_id, user_id) VALUES (?, ?)', [p.id, user.id]);
  if (!r.affectedRows) await db.query('DELETE FROM community_hearts WHERE post_id = ? AND user_id = ?', [p.id, user.id]);
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM community_hearts WHERE post_id = ?', [p.id]);
  return { id: p.id, hearted: !!r.affectedRows, hearts: Number(n) };
}

async function reportPost(user, id, reason) {
  const p = await readablePost(user, id);
  if (p.user_id === user.id) fail(400, 'OWN_POST', 'Es tu aportación: puedes retirarla tú.');
  await db.query(
    `INSERT INTO community_reports (post_id, reporter_id, reason) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), status = IF(status = 'dismissed', 'open', status)`,
    [p.id, user.id, text(reason, 500, { multiline: true }) || null]);
  return { reported: true };
}

/* ═══ Equipo (admin) ═══════════════════════════════════════════════ */
async function adminGroups() {
  const [rows] = await db.query(
    `SELECT g.*, (SELECT COUNT(*) FROM community_group_members m WHERE m.group_id = g.id) AS members,
            (SELECT COUNT(*) FROM community_posts p WHERE p.group_id = g.id AND p.hidden = 0) AS posts
       FROM community_groups g ORDER BY g.archived, g.name`);
  return rows.map(g => ({ ...g, archived: !!g.archived, members: Number(g.members), posts: Number(g.posts) }));
}

async function adminSaveGroup(user, id, body) {
  body = body || {};
  const name = text(body.name, 120);
  if (!name) fail(400, 'NAME_REQUIRED', 'Ponle nombre al grupo.');
  const description = text(body.description, 600, { multiline: true }) || null;
  if (id) {
    const g = await loadGroup(id);
    if (!g) fail(404, 'NOT_FOUND', 'Grupo no encontrado');
    await db.query('UPDATE community_groups SET name = ?, description = ?, archived = ? WHERE id = ?',
      [name, description, body.archived ? 1 : 0, g.id]);
    return { id: g.id };
  }
  const [r] = await db.query('INSERT INTO community_groups (name, description, created_by) VALUES (?,?,?)', [name, description, user.id]);
  return { id: r.insertId };
}

async function adminReports(status = 'open') {
  const st = ['open', 'hidden', 'dismissed'].includes(status) ? status : 'open';
  const [rows] = await db.query(
    `SELECT r.id, r.reason, r.status, r.created_at, r.resolved_at, r.post_id,
            p.body, p.title, p.link_url, p.topic, p.group_id, p.parent_id, p.hidden, p.hidden_by, p.created_at AS post_at,
            au.name AS author_name, ru.name AS reporter_name, g.name AS group_name
       FROM community_reports r
       JOIN community_posts p ON p.id = r.post_id
       JOIN users au ON au.id = p.user_id
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN community_groups g ON g.id = p.group_id
      WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`, [st]);
  return rows.map(r => ({ ...r, hidden: !!r.hidden, topic_label: r.topic && C.TOPICS[r.topic] ? C.TOPICS[r.topic].label : null }));
}

async function adminResolveReport(user, id, action) {
  const [[r]] = await db.query('SELECT * FROM community_reports WHERE id = ?', [Number(id) || 0]);
  if (!r) fail(404, 'NOT_FOUND', 'Denuncia no encontrada');
  if (action === 'hide') {
    await db.query(`UPDATE community_posts SET hidden = 1, hidden_by = 'team', hidden_reason = COALESCE(hidden_reason, 'Denunciada y revisada por el equipo'), hidden_at = COALESCE(hidden_at, NOW()) WHERE id = ?`, [r.post_id]);
    await db.query(`UPDATE community_reports SET status = 'hidden', resolved_by = ?, resolved_at = NOW() WHERE post_id = ? AND status = 'open'`, [user.id, r.post_id]);
  } else if (action === 'dismiss') {
    await db.query(`UPDATE community_reports SET status = 'dismissed', resolved_by = ?, resolved_at = NOW() WHERE id = ?`, [user.id, r.id]);
  } else fail(400, 'VALIDATION', 'Acción no válida');
  return { id: r.id, post_id: r.post_id, action };
}

async function adminPosts(filter = 'recent') {
  const hidden = filter === 'hidden';
  const [rows] = await db.query(
    `SELECT p.id, p.topic, p.title, LEFT(p.body, 400) AS body, p.link_url, p.group_id, p.parent_id, p.hidden, p.hidden_by, p.hidden_reason,
            p.created_at, u.name AS author_name, g.name AS group_name,
            (SELECT COUNT(*) FROM community_reports r WHERE r.post_id = p.id AND r.status = 'open') AS open_reports
       FROM community_posts p JOIN users u ON u.id = p.user_id LEFT JOIN community_groups g ON g.id = p.group_id
      WHERE p.hidden = ? ORDER BY p.id DESC LIMIT 100`, [hidden ? 1 : 0]);
  return rows.map(r => ({ ...r, hidden: !!r.hidden, open_reports: Number(r.open_reports), topic_label: r.topic && C.TOPICS[r.topic] ? C.TOPICS[r.topic].label : null }));
}

async function adminSetHidden(user, id, hide, reason) {
  const [[p]] = await db.query('SELECT id, hidden, hidden_by FROM community_posts WHERE id = ?', [Number(id) || 0]);
  if (!p) fail(404, 'NOT_FOUND', 'Aportación no encontrada');
  if (hide) {
    await db.query(`UPDATE community_posts SET hidden = 1, hidden_by = 'team', hidden_reason = ?, hidden_at = NOW() WHERE id = ?`, [text(reason, 300) || null, p.id]);
    await db.query(`UPDATE community_reports SET status = 'hidden', resolved_by = ?, resolved_at = NOW() WHERE post_id = ? AND status = 'open'`, [user.id, p.id]);
  } else {
    // Lo que retiró su autor no lo vuelve a publicar el equipo.
    if (p.hidden_by === 'author') fail(400, 'AUTHOR_REMOVED', 'La retiró su autor; no se puede volver a mostrar.');
    await db.query(`UPDATE community_posts SET hidden = 0, hidden_by = NULL, hidden_reason = NULL, hidden_at = NULL WHERE id = ?`, [p.id]);
  }
  return { id: p.id, hidden: !!hide };
}

async function adminPendingCount() {
  const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM community_reports WHERE status = 'open'`);
  return Number(n) || 0;
}

module.exports = {
  HttpError, me, saveProfile, people, person, requestConnection, respondConnection, removeConnection, activity,
  messages, sendMessage, groups, group, joinGroup, listPosts, getPost, createPost, removePost, toggleHeart, reportPost,
  adminGroups, adminSaveGroup, adminReports, adminResolveReport, adminPosts, adminSetHidden, adminPendingCount,
  // para pruebas
  _sharedLocation: sharedLocation, _safeUrl: safeUrl,
};
