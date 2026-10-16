/**
 * Comunidad — comprobaciones de privacidad por API, con las cuentas DEMO
 * (scripts/community-demo.js --seed). Solo contra una instancia de desarrollo.
 *
 *   node scripts/community-privacy-check.js [base]     (por defecto http://127.0.0.1:3017)
 *
 * Lee los accesos de COMMUNITY_DEMO_PASS_FILE. Deja los datos como estaban
 * (restaura el perfil de Lena y borra lo que crea). Sale con código 1 si algo falla.
 */
const fs = require('fs');
const BASE = (process.argv[2] || 'http://127.0.0.1:3017') + '/v1';
const PASS_FILE = process.env.COMMUNITY_DEMO_PASS_FILE || '/root/scripts-studio/comunidad-demo-accesos.md';

const creds = {};
for (const line of fs.readFileSync(PASS_FILE, 'utf8').split('\n')) {
  const m = /^- comunidad\.(\w+)@example\.invalid · (\S+)/.exec(line);
  if (m) creds[m[1]] = m[2];
}

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ok  ', msg); } else { failed++; console.log('  FALLA', msg); } };

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
async function login(key) {
  const r = await call(null, 'POST', '/auth/login', { email: `comunidad.${key}@example.invalid`, password: creds[key] });
  if (r.status !== 200) throw new Error(`login ${key}: ${r.status} ${JSON.stringify(r.error)}`);
  return { token: r.data.access_token, id: r.data.user.id };
}

(async () => {
  const [ana, marco, lena, sin, admin] = [await login('ana'), await login('marco'), await login('lena'), await login('sinarea'), await login('admin')];
  const A = (u) => (m, p, b) => call(u.token, m, p, b);
  const asAna = A(ana), asMarco = A(marco), asLena = A(lena), asSin = A(sin), asAdmin = A(admin);

  console.log('Acceso');
  ok((await call(null, 'GET', '/community/me')).status === 401, 'sin sesión → 401');
  const s = await asSin('GET', '/community/me');
  ok(s.status === 403 && s.error.code === 'AREA_REQUIRED', 'sin el área → 403 AREA_REQUIRED');
  ok((await asSin('GET', '/community/people')).status === 403, 'sin el área tampoco ve personas');
  ok((await asAdmin('GET', '/community/me')).status === 200, 'admin entra sin fila de área');
  ok((await asAna('GET', '/admin/community/reports')).status === 403, 'un miembro no ve las denuncias del equipo');

  console.log('Perfiles y ubicación');
  let pe = await asMarco('GET', '/community/people');
  const ids = pe.data.people.map(p => p.id);
  ok(!ids.includes(sin.id), 'la persona sin área no aparece');
  const anaForMarco = pe.data.people.find(p => p.id === ana.id);
  ok(anaForMarco && anaForMarco.location && String(anaForMarco.location.lat).split('.')[1].length > 2,
    'Ana (exacta, solo conexiones) → Marco, conectado, ve coordenadas exactas');
  ok(!JSON.stringify(pe.data).includes('@example.invalid'), 'ninguna respuesta lleva emails');
  pe = await asLena('GET', '/community/people');
  const anaForLena = pe.data.people.find(p => p.id === ana.id);
  ok(anaForLena && anaForLena.location === null, 'Lena, no conectada, ve el perfil de Ana pero sin ubicación');
  ok(!pe.data.points.some(p => p.id === ana.id), 'y Ana no está entre los puntos del mapa de Lena');
  const pAna = await asLena('GET', '/community/people/' + ana.id);
  ok(pAna.status === 200 && pAna.data.location === null, 'ficha de Ana para Lena: sin ubicación');
  const marcoPt = pe.data.points.find(p => p.id === marco.id);
  ok(marcoPt && Math.abs(marcoPt.lat * 100 - Math.round(marcoPt.lat * 100)) < 1e-9, 'aproximada → como mucho 2 decimales');

  // Guardar con precisión aproximada redondea antes de guardar.
  const lenaMe = (await asLena('GET', '/community/me')).data.profile;
  const backup = {
    visible: true, headline: lenaMe.headline, bio: lenaMe.bio, sectors: lenaMe.sectors, actions: lenaMe.actions, languages: lenaMe.languages,
    seeks_partners: lenaMe.seeks_partners, offers_partner: lenaMe.offers_partner, country: lenaMe.country, organization_id: lenaMe.organization_id,
    location_mode: 'manual', lat: lenaMe.own_location.lat, lng: lenaMe.own_location.lng, location_precision: 'approx', location_audience: 'members',
  };
  let r = await asLena('PUT', '/community/me/profile', { ...backup, lat: 52.516275, lng: 13.377704 });
  ok(r.status === 200 && r.data.profile.own_location.lat === 52.52 && r.data.profile.own_location.lng === 13.38, 'aproximada: se guarda ya redondeada (52.52, 13.38)');
  r = await asLena('PUT', '/community/me/profile', { ...backup, bio: 'escríbeme a lena@example.org' });
  ok(r.status === 400 && r.error.code === 'NO_CONTACT', 'un correo en la presentación → rechazado');

  // Ocultar el perfil borra las coordenadas y lo saca del directorio.
  r = await asLena('PUT', '/community/me/profile', { ...backup, visible: false });
  ok(r.status === 200 && r.data.profile.own_location === null, 'perfil oculto → coordenadas borradas');
  pe = await asMarco('GET', '/community/people');
  ok(!pe.data.people.some(p => p.id === lena.id), 'perfil oculto → no aparece en personas');
  ok((await asMarco('GET', '/community/people/' + lena.id)).status === 404, 'perfil oculto → su ficha da 404');
  ok((await asMarco('POST', '/community/connections', { to: lena.id })).status === 404, 'no se puede pedir conexión a un perfil oculto');
  r = await asLena('PUT', '/community/me/profile', { ...backup, location_audience: 'hidden' });
  ok(r.status === 200 && r.data.profile.own_location === null, 'ubicación oculta → coordenadas borradas');
  await asLena('PUT', '/community/me/profile', backup);   // restaurar

  console.log('Conexiones y mensajes');
  const act = (await asAna('GET', '/community/activity')).data;
  const cAM = act.connections.find(c => c.person.id === marco.id);
  ok(!!cAM, 'Ana y Marco están conectados (DEMO)');
  ok((await asLena('GET', `/community/connections/${cAM.id}/messages`)).status === 404, 'Lena no puede leer los mensajes de Ana y Marco');
  ok((await asLena('POST', `/community/connections/${cAM.id}/messages`, { body: 'hola' })).status === 404, 'ni escribir en esa conversación');
  ok((await asAdmin('GET', `/community/connections/${cAM.id}/messages`)).status === 404, 'ni siquiera el equipo lee mensajes privados');
  const msgs = await asMarco('GET', `/community/connections/${cAM.id}/messages`);
  ok(msgs.status === 200 && msgs.data.messages.length >= 2, 'Marco sí lee su conversación');

  // Pedir, aceptar, escribir, eliminar → los mensajes desaparecen.
  r = await asLena('POST', '/community/connections', { to: marco.id, message: 'Hola (prueba)' });
  ok(r.status === 200 && r.data.state === 'pending_out', 'Lena pide conexión a Marco');
  ok((await asLena('POST', `/community/connections/${r.data.id}/messages`, { body: 'x' })).status === 404, 'sin aceptar todavía no hay mensajes');
  ok((await asLena('POST', `/community/connections/${r.data.id}/accept`)).status === 404, 'quien pide no puede aceptarse a sí mismo');
  const cid = r.data.id;
  ok((await asMarco('POST', `/community/connections/${cid}/accept`)).status === 200, 'Marco acepta');
  ok((await asLena('POST', `/community/connections/${cid}/messages`, { body: 'Mensaje de prueba' })).status === 200, 'ya pueden escribirse');
  ok((await asMarco('DELETE', `/community/connections/${cid}`)).status === 200, 'Marco elimina la conexión');
  ok((await asLena('GET', `/community/connections/${cid}/messages`)).status === 404, 'la conversación ya no existe');

  console.log('Grupos');
  const groups = (await asLena('GET', '/community/groups')).data;
  const g = groups.find(x => x.name.startsWith('DEMO · KA2'));
  const gp = await asLena('GET', `/community/posts?group=${g.id}`);
  ok(gp.status === 403 && gp.error.code === 'GROUP_MEMBERS_ONLY', 'sin ser miembro no se leen las conversaciones del grupo');
  ok((await asLena('POST', '/community/posts', { group_id: g.id, body: 'x' })).status === 403, 'ni se escribe en ellas');
  const anaGp = await asAna('GET', `/community/posts?group=${g.id}`);
  ok(anaGp.status === 200 && anaGp.data.posts.length > 0, 'un miembro sí las lee');
  const gpost = anaGp.data.posts[0];
  ok((await asLena('GET', `/community/posts/${gpost.id}`)).status === 403, 'tampoco por enlace directo a la aportación');
  ok((await asLena('POST', `/community/posts/${gpost.id}/heart`)).status === 403, 'ni dar corazón desde fuera');
  ok((await asLena('POST', '/community/posts', { parent_id: gpost.id, body: 'x' })).status === 403, 'ni responder desde fuera');
  ok((await asLena('POST', `/community/groups/${g.id}/join`)).status === 200, 'unirse es explícito');
  ok((await asLena('GET', `/community/posts?group=${g.id}`)).status === 200, 'tras unirse, lee');
  await asLena('DELETE', `/community/groups/${g.id}/join`);
  ok((await asLena('GET', `/community/posts?group=${g.id}`)).status === 403, 'al salir, deja de leer');

  console.log('Conversaciones');
  const feed = (await asAna('GET', '/community/posts')).data.posts;
  const own = feed.find(p => p.mine);
  const h = await asAna('POST', `/community/posts/${own.id}/heart`);
  ok(h.status === 400 && h.error.code === 'OWN_POST', 'corazón a tu propia aportación → rechazado');
  const other = feed.find(p => !p.mine);
  const h1 = await asAna('POST', `/community/posts/${other.id}/heart`);
  const h2 = await asAna('POST', `/community/posts/${other.id}/heart`);
  ok(h1.status === 200 && h2.status === 200 && h1.data.hearted !== h2.data.hearted && Math.abs(h1.data.hearts - h2.data.hearts) === 1,
    'un corazón por persona: el segundo lo quita');
  r = await asAna('POST', '/community/posts', { topic: 'recursos', title: 'x', body: 'x', link_url: 'javascript:alert(1)' });
  ok(r.status === 400 && r.error.code === 'LINK_INVALID', 'enlace javascript: en Recursos → rechazado');
  r = await asAna('POST', '/community/posts', { topic: 'recursos', title: 'x', body: 'x', link_url: 'data:text/html,hola' });
  ok(r.status === 400 && r.error.code === 'LINK_INVALID', 'enlace data: → rechazado');
  r = await asAna('POST', '/community/posts', { topic: 'recursos', title: 'x', body: 'x' });
  ok(r.status === 400 && r.error.code === 'LINK_REQUIRED', 'Recursos sin enlace → rechazado');
  r = await asAna('POST', '/community/posts', { topic: 'inventado', body: 'x' });
  ok(r.status === 400 && r.error.code === 'TOPIC_INVALID', 'tema inexistente → rechazado');
  r = await asAna('POST', '/community/posts', { topic: 'recursos', title: 'Prueba de privacidad', body: 'Se retira enseguida', link_url: 'https://example.org/recurso' });
  ok(r.status === 200 && r.data.link_url === 'https://example.org/recurso', 'Recursos con https → publicado');
  const pid = r.data.id;
  ok((await asLena('DELETE', `/community/posts/${pid}`)).status === 403, 'otra persona no puede retirar mi aportación');
  ok((await asLena('POST', `/community/posts/${pid}/report`, { reason: 'prueba' })).status === 200, 'denunciar es posible');
  const reps = (await asAdmin('GET', '/admin/community/reports')).data;
  ok(reps.some(x => x.post_id === pid), 'la denuncia llega al equipo');
  ok((await asAna('DELETE', `/community/posts/${pid}`)).status === 200, 'la autora la retira');
  ok((await asLena('GET', `/community/posts/${pid}`)).status === 404, 'retirada → ya no se ve');
  const rep = reps.find(x => x.post_id === pid);
  await asAdmin('POST', `/admin/community/reports/${rep.id}/resolve`, { action: 'dismiss' });

  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
