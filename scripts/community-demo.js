/**
 * Comunidad — datos DEMO para ver el mapa y las conversaciones con contenido.
 * SOLO en una BD de desarrollo (DB_NAME debe terminar en _dev).
 *
 *   node scripts/community-demo.js --seed     crea cuentas, perfiles, entidades, grupos y aportaciones DEMO
 *   node scripts/community-demo.js --remove   lo borra todo (y nada más)
 *
 * Todo lo DEMO se reconoce así:
 *   · cuentas: email `comunidad.*@example.invalid`, nombre terminado en «(DEMO)»
 *   · entidades: organization_name empieza por «DEMO · »
 *   · grupos: nombre empieza por «DEMO · »
 * Al borrar las cuentas, ON DELETE CASCADE se lleva perfiles, conexiones,
 * mensajes, aportaciones, corazones, denuncias y membresías de grupo.
 * Las contraseñas se escriben en PASS_FILE (fuera del repo, 0600), nunca aquí.
 */
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { v4: uuid } = require('uuid');

const PASS_FILE = process.env.COMMUNITY_DEMO_PASS_FILE || '/root/scripts-studio/comunidad-demo-accesos.md';
const DOMAIN = '@example.invalid';

const PEOPLE = [
  // key, nombre, rol, área, cargo, país, lat, lng, precisión, audiencia, sectores, acciones, idiomas (ya no se usan), busca, ofrece, entidad
  ['admin', 'Equipo Comunidad (DEMO)', 'admin', false, 'Equipo de EU Funding Studio', 'ES', 43.46, -3.80, 'approx', 'members', 'adultos,juventud', 'ka1,ka2', 'es,en', 0, 0, null],
  ['ana', 'Ana Ruiz (DEMO)', 'user', true, 'Coordinadora de proyectos europeos', 'ES', 43.462306, -3.809980, 'exact', 'connections', 'fp,adultos', 'ka1,ka2', 'es,en,fr', 1, 0, 'cantabria'],
  ['marco', 'Marco Bianchi (DEMO)', 'user', true, 'Responsabile progetti europei', 'IT', 45.44, 12.33, 'approx', 'members', 'juventud,deporte', 'ka2,ces', 'it,en,es', 0, 1, 'venezia'],
  ['sinarea', 'Persona sin acceso (DEMO)', 'user', false, null, null, null, null, 'approx', 'members', '', '', '', 0, 0, null],
  ['lena', 'Lena Schmidt (DEMO)', 'user', true, 'Projektleiterin Erwachsenenbildung', 'DE', 52.52, 13.40, 'approx', 'members', 'adultos', 'ka2,horizonte', 'de,en', 1, 1, null],
  ['sofia', 'Sofia Pereira (DEMO)', 'user', true, 'Professora e coordenadora Erasmus', 'PT', 41.15, -8.61, 'approx', 'members', 'escolar', 'ka1,ka2', 'pt,es,en', 1, 0, 'porto'],
  ['eleni', 'Eleni Papadopoulou (DEMO)', 'user', true, 'Youth worker', 'GR', 40.64, 22.94, 'approx', 'members', 'juventud', 'ka1,ka2,ces', 'el,en', 0, 1, null],
  ['jan', 'Jan Kowalski (DEMO)', 'user', true, 'Kierownik projektów sportowych', 'PL', 50.06, 19.94, 'approx', 'members', 'deporte', 'ka2', 'pl,en', 1, 1, null],
  ['claire', 'Claire Dubois (DEMO)', 'user', true, 'Chargée de mission Europe', 'FR', 45.76, 4.84, 'approx', 'members', 'superior,adultos', 'ka2,jeanmonnet,cerv', 'fr,en,es', 0, 1, null],
  ['pieter', 'Pieter de Vries (DEMO)', 'user', true, 'Docent en internationaliseringscoördinator', 'NL', 52.09, 5.12, 'approx', 'members', 'fp', 'ka1,ka2', 'nl,en,de', 1, 0, null],
  ['ines', 'Inés Martín (DEMO)', 'user', true, 'Técnica de juventud', 'ES', 40.42, -3.70, 'approx', 'members', 'juventud', 'ka1,ces,cerv', 'es,en', 1, 0, null],
  ['mikko', 'Mikko Virtanen (DEMO)', 'user', true, 'Cultural producer', 'FI', 60.17, 24.94, 'approx', 'members', 'adultos', 'creativa', 'fi,en,sv', 0, 1, null],
];

// Roles de cada persona DEMO (constants.ROLES). Quien no tiene entidad sale como «Sin entidad».
const DEMO_ROLES = {
  admin: 'formador', ana: 'redactor,manager', marco: 'manager,logistica', lena: 'redactor,evaluador',
  sofia: 'formador', eleni: 'logistica,formador', jan: 'manager', claire: 'evaluador,redactor',
  pieter: 'formador,logistica', ines: 'redactor', mikko: 'manager',
};

const ORGS = {
  cantabria: ['DEMO · Asociación Formación Cantábrica', 'Spain', 'Santander', 43.4623, -3.81],
  venezia:   ['DEMO · Associazione Giovani Laguna', 'Italy', 'Venezia', 45.4408, 12.3155],
  porto:     ['DEMO · Escola Básica do Douro', 'Portugal', 'Porto', 41.1579, -8.6291],
};

function guard() {
  const db = process.env.DB_NAME || '';
  if (!/_dev$/.test(db)) { console.error(`Me niego: DB_NAME=${db} no es una BD de desarrollo (_dev).`); process.exit(1); }
}

async function conn() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASS || '', database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
}

async function remove(c) {
  const [[{ n }]] = await c.query(`SELECT COUNT(*) AS n FROM users WHERE email LIKE 'comunidad.%${DOMAIN}'`);
  await c.query(`DELETE FROM community_groups WHERE name LIKE 'DEMO · %'`);
  await c.query(`DELETE uo FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id WHERE o.organization_name LIKE 'DEMO · %'`);
  const [o] = await c.query(`DELETE FROM organizations WHERE organization_name LIKE 'DEMO · %'`);
  await c.query(`DELETE FROM users WHERE email LIKE 'comunidad.%${DOMAIN}'`);
  console.log(`Borradas ${n} cuentas DEMO, ${o.affectedRows} entidades DEMO y los grupos DEMO (con todo lo suyo).`);
}

async function seed(c) {
  const [[{ n }]] = await c.query(`SELECT COUNT(*) AS n FROM users WHERE email LIKE 'comunidad.%${DOMAIN}'`);
  if (n) { console.error('Ya hay cuentas DEMO. Bórralas antes con --remove.'); process.exit(1); }
  const pass = {};
  const ids = {};
  const orgIds = {};
  await c.beginTransaction();
  try {
    for (const [k, [name, country, city, lat, lng]] of Object.entries(ORGS)) {
      const id = uuid(); orgIds[k] = id;
      await c.query(`INSERT INTO organizations (id, organization_name, country, city, lat, lng, is_public, description)
                     VALUES (?,?,?,?,?,?,0,'Entidad ficticia para la demo de la Comunidad (DEMO).')`, [id, name, country, city, lat, lng]);
    }
    for (const [key, name, role, area, headline, country, lat, lng, prec, aud, sectors, actions, langs, seeks, offers, org] of PEOPLE) {
      const id = uuid(); ids[key] = id;
      const pw = crypto.randomBytes(9).toString('base64url');
      pass[key] = pw;
      await c.query(`INSERT INTO users (id, email, password_hash, name, role, email_verified, privacy_accepted_at) VALUES (?,?,?,?,?,1,NOW())`,
        [id, `comunidad.${key}${DOMAIN}`, await bcrypt.hash(pw, 10), name, role]);
      if (area) await c.query(`INSERT INTO user_areas (user_id, area, seen_at) VALUES (?, 'comunidad', NOW())`, [id]);
      if (org) {
        await c.query(`INSERT INTO user_organizations (id, user_id, organization_id, role) VALUES (?,?,?, 'owner')`, [uuid(), id, orgIds[org]]);
        await c.query(`UPDATE organizations SET owner_user_id = ?, claimed_by_user_id = ? WHERE id = ?`, [id, id, orgIds[org]]);
      }
      if (key === 'sinarea') continue;
      const places = prec === 'exact' ? 6 : 2;
      await c.query(
        `INSERT INTO community_profiles (user_id, visible, headline, bio, roles, sectors, actions, seeks_partners, offers_partner,
           organization_id, no_organization, country, location_label, lat, lng, location_source, location_precision, location_audience)
         VALUES (?,1,?,?,?,?,?,?,?,?,?,?,?,?,?, 'manual', ?, ?)`,
        [id, headline, `Perfil de demostración (DEMO). ${headline}. Me interesa encontrar socios con experiencia y compartir lo que aprendemos en cada convocatoria.`,
         DEMO_ROLES[key] || null, sectors || null, actions || null, seeks, offers, org ? orgIds[org] : null, org ? 0 : 1, country,
         org ? ORGS[org][2] : null, lat == null ? null : Number(lat.toFixed(places)), lng == null ? null : Number(lng.toFixed(places)), prec, aud]);
    }
    // Grupos
    const [g1] = await c.query(`INSERT INTO community_groups (name, description, created_by) VALUES (?,?,?)`,
      ['DEMO · KA2 Juventud', 'Para quienes preparan asociaciones de cooperación en juventud: socios, presupuesto y resultados.', ids.admin]);
    const [g2] = await c.query(`INSERT INTO community_groups (name, description, created_by) VALUES (?,?,?)`,
      ['DEMO · FP y movilidades', 'Movilidades de alumnado y profesorado de Formación Profesional (KA1/KA2).', ids.admin]);
    for (const k of ['ana', 'marco', 'eleni', 'ines']) await c.query('INSERT INTO community_group_members (group_id, user_id) VALUES (?,?)', [g1.insertId, ids[k]]);
    for (const k of ['ana', 'pieter', 'sofia']) await c.query('INSERT INTO community_group_members (group_id, user_id) VALUES (?,?)', [g2.insertId, ids[k]]);

    const post = async (who, topic, title, body, link = null, group = null, parent = null, minsAgo = 60) => {
      const [r] = await c.query(
        `INSERT INTO community_posts (user_id, group_id, parent_id, topic, title, body, link_url, created_at) VALUES (?,?,?,?,?,?,?, NOW() - INTERVAL ? MINUTE)`,
        [ids[who], group, parent, parent || group ? null : topic, title, body, link, minsAgo]);
      return r.insertId;
    };
    const heart = (pid, ...who) => Promise.all(who.map(k => c.query('INSERT IGNORE INTO community_hearts (post_id, user_id) VALUES (?,?)', [pid, ids[k]])));

    const p1 = await post('ana', 'socios', 'DEMO · Buscamos socio de Italia o Grecia para un KA220-VET',
      'Preparamos un KA220 de FP sobre energías renovables en talleres. Nos falta una entidad con alumnado de 16-20 años y experiencia en movilidades. (Contenido DEMO)', null, null, null, 2900);
    await post('marco', null, null, 'Nosotros trabajamos con jóvenes en Venecia y tenemos un centro de FP asociado. Te escribo por mensaje privado. (DEMO)', null, null, p1, 2800);
    await heart(p1, 'marco', 'eleni', 'pieter');
    const p2 = await post('claire', 'recursos', 'DEMO · Guía del programa Erasmus+ 2026',
      'La guía oficial; el capítulo de criterios de evaluación es el que más consulto. (DEMO)', 'https://erasmus-plus.ec.europa.eu/programme-guide', null, null, 2000);
    await heart(p2, 'ana', 'sofia', 'jan', 'ines');
    const p3 = await post('sofia', 'preguntas', 'DEMO · ¿Cómo justificáis el apoyo organizativo en KA1?',
      'Es nuestro primer proyecto acreditado y no tengo claro qué gastos entran en el apoyo organizativo. ¿Alguna experiencia? (DEMO)', null, null, null, 1500);
    await post('pieter', null, null, 'Nosotros lo usamos para preparación lingüística y coordinación; guarda las horas del equipo. (DEMO)', null, null, p3, 1400);
    await post('ana', null, null, 'Y las visitas preparatorias van aparte. (DEMO)', null, null, p3, 1300);
    await heart(p3, 'ana');
    const p4 = await post('eleni', 'presentaciones', 'DEMO · Hola desde Tesalónica',
      'Soy youth worker en una ONG local. Hacemos intercambios juveniles y nos gustaría entrar en un KA2 como socios. (DEMO)', null, null, null, 900);
    await heart(p4, 'marco', 'ines');
    await c.query('INSERT INTO community_reports (post_id, reporter_id, reason) VALUES (?,?,?)', [p4, ids.mikko, 'Denuncia de prueba para ver la sección del equipo (DEMO).']);
    const p5 = await post('ines', 'convocatorias', 'DEMO · Cuerpo Europeo de Solidaridad: plazo de octubre',
      '¿Alguien más presenta proyecto de voluntariado en la ronda de octubre? Podemos revisar juntos los formularios. (DEMO)', null, null, null, 400);
    await heart(p5, 'eleni');
    const p6 = await post('jan', 'exitos', 'DEMO · ¡Aprobado nuestro primer KA210-SPORT!',
      'Tras dos intentos, aprobado. Lo que más ayudó: un plan de trabajo más corto y socios con roles claros. (DEMO)', null, null, null, 120);
    await heart(p6, 'ana', 'marco', 'lena', 'claire', 'sofia');
    await post('marco', null, 'DEMO · ¿Quién se apunta a una reunión online sobre presupuestos?', 'Propongo el jueves a las 17:00. (DEMO)', null, g1.insertId, null, 300);
    await post('pieter', null, 'DEMO · Plantilla de acuerdo de aprendizaje', 'Os dejo la que usamos para movilidades de alumnado. (DEMO)', 'https://example.org/plantilla-demo', g2.insertId, null, 200);

    // Conexión aceptada Ana–Marco con mensajes; solicitud pendiente Lena→Ana.
    const pair = (a, b) => (ids[a] < ids[b] ? [ids[a], ids[b]] : [ids[b], ids[a]]);
    const [lo, hi] = pair('ana', 'marco');
    const [cn] = await c.query(`INSERT INTO community_connections (requester_id, addressee_id, user_lo, user_hi, status, responded_at) VALUES (?,?,?,?, 'accepted', NOW())`,
      [ids.marco, ids.ana, lo, hi]);
    await c.query('INSERT INTO community_messages (connection_id, sender_id, body) VALUES (?,?,?), (?,?,?)',
      [cn.insertId, ids.marco, 'Hola Ana, he visto tu búsqueda de socios. ¿Hablamos esta semana? (DEMO)',
       cn.insertId, ids.ana, '¡Claro! Te paso un resumen del proyecto. (DEMO)']);
    const [lo2, hi2] = pair('lena', 'ana');
    await c.query(`INSERT INTO community_connections (requester_id, addressee_id, user_lo, user_hi, message) VALUES (?,?,?,?,?)`,
      [ids.lena, ids.ana, lo2, hi2, 'Trabajamos en educación de adultos y buscamos socio en España. (DEMO)']);
    await c.commit();
  } catch (e) { await c.rollback(); throw e; }

  const lines = ['# Comunidad DEMO — accesos (solo eplus_tools_dev, puerto 3017)', '',
    'Borrar todo: `cd /opt/eplus-wt/comunidad && node scripts/community-demo.js --remove`', '',
    ...PEOPLE.map(([k, name, role, area]) => `- comunidad.${k}${DOMAIN} · ${pass[k]} · ${name} · ${role}${area ? ' · área comunidad' : (role === 'admin' ? '' : ' · SIN área')}`)];
  fs.writeFileSync(PASS_FILE, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`Creadas ${PEOPLE.length} cuentas DEMO. Accesos en ${PASS_FILE}`);
}

(async () => {
  guard();
  const mode = process.argv[2];
  if (!['--seed', '--remove'].includes(mode)) { console.log('Uso: node scripts/community-demo.js --seed | --remove'); process.exit(1); }
  const c = await conn();
  try { mode === '--seed' ? await seed(c) : await remove(c); } finally { await c.end(); }
})().catch(e => { console.error(e); process.exit(1); });
