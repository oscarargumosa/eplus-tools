/* ═══════════════════════════════════════════════════════════════
   Transactional email (Resend)
   ─────────────────────────────────────────────────────────────
   Lazy-init the Resend client (never top-level — see prod incident
   2026-04-26 with `new OpenAI()` crashing 502).
   ─────────────────────────────────────────────────────────────
   Used for: email verification, password reset, account notices.
   NEVER use this for marketing — that's GHL.
   ═══════════════════════════════════════════════════════════════ */

let _client = null;
const { tl, isLang } = require('./i18n');

/* Idioma de los correos a una persona: el que eligió en la interfaz
   (users.ui_lang). Sin cuenta o sin elegir, español. */
async function langForEmail(to, lang) {
  if (isLang(lang)) return lang;
  try {
    const db = require('./db');
    const [[u]] = await db.query('SELECT ui_lang FROM users WHERE email = ? LIMIT 1', [String(to || '').toLowerCase().trim()]);
    return u && isLang(u.ui_lang) ? u.ui_lang : 'es';
  } catch { return 'es'; }
}

function getClient() {
  if (_client) return _client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const { Resend } = require('resend');
  _client = new Resend(apiKey);
  return _client;
}

function fromAddress() {
  const addr = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const name = process.env.EMAIL_FROM_NAME || 'EU Funding Studio';
  return `${name} <${addr}>`;
}

function escHtml(v) {
  return String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Send an email via Resend. Returns { ok, id?, error? }.
 * If RESEND_API_KEY is missing, logs recipient (masked) + subject and returns ok=true
 * with a "mock" flag — useful for dev environments without keys.
 */
async function sendEmail({ to, subject, html, text }) {
  const client = getClient();
  if (!client) {
    // Sin clave no se envía. No se vuelca el cuerpo: lleva enlaces con token.
    const { maskEmail } = require('./logger');
    console.warn(`[email] RESEND_API_KEY missing — not sent. TO: ${maskEmail(to)} SUBJECT: ${subject}`);
    return { ok: true, mock: true };
  }
  try {
    const result = await client.emails.send({
      from: fromAddress(),
      to,
      subject,
      html,
      text: text || undefined
    });
    if (result.error) {
      console.error('[email] Resend error:', require('./logger').scrub(JSON.stringify(result.error)));
      return { ok: false, error: result.error.message || String(result.error) };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    console.error('[email] Send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/* ── Templates ─────────────────────────────────────────────── */

/* Plantilla común (manual de marca EU Funding Studio, oct-2026): cabecera azul #4312d8 con el
   logo en PNG (los SVG no se ven en Gmail/Outlook), titular azul en Poppins, botón en píldora
   lima con texto azul y pie crema. Tablas + estilos en línea para que aguante en Outlook. */
const FONT = "Poppins,'Segoe UI',Helvetica,Arial,sans-serif";   // i18n-no

function shellTemplate({ title, intro, buttonLabel, buttonUrl, footer, lang = 'es' }) {
  const logo = `${appUrl()}/img/marca/logo-horizontal-blanco-correo.png`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>a{color:#4312d8}</style>
</head>
<body style="margin:0;padding:0;background:#f8f8f8;font-family:${FONT};color:#1b0759;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f8f8f8" style="background:#f8f8f8;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #d6d3dc;">
        <tr><td bgcolor="#4312d8" style="background:#4312d8;padding:28px 32px;">
          <a href="${appUrl()}" style="text-decoration:none;"><img src="${logo}" width="224" height="24" alt="EU Funding Studio" style="display:block;border:0;outline:none;width:224px;height:24px;color:#ffffff;font-family:${FONT};font-size:18px;font-weight:600;"></a>
        </td></tr>
        <tr><td style="padding:36px 32px 32px;">
          <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:600;color:#4312d8;">${title}</h1>
          <div style="font-family:${FONT};font-size:15px;color:#1b0759;line-height:1.65;">${intro}</div>
          ${buttonUrl ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 26px;">
            <tr><td bgcolor="#e9ff60" style="background:#e9ff60;border-radius:999px;">
              <a href="${buttonUrl}" style="display:inline-block;padding:14px 32px;border-radius:999px;background:#e9ff60;color:#4312d8;text-decoration:none;font-family:${FONT};font-weight:600;font-size:15px;line-height:1.2;">${buttonLabel}</a>
            </td></tr>
          </table>
          <div style="font-family:${FONT};font-size:13px;color:#55577a;line-height:1.5;">
            ${tl(lang, 'O copia este enlace en tu navegador:')}<br>
            <span style="color:#4312d8;word-break:break-all;">${buttonUrl}</span>
          </div>` : ''}
          ${footer ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #d6d3dc;font-family:${FONT};font-size:13px;color:#55577a;line-height:1.5;">${footer}</div>` : ''}
        </td></tr>
        <tr><td bgcolor="#f2f2f2" style="background:#f2f2f2;padding:18px 32px;font-family:${FONT};font-size:12px;color:#55577a;text-align:center;">
          EU Funding Studio · <a href="${appUrl()}" style="color:#4312d8;">${appUrl().replace(/^https?:\/\//, '')}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendVerificationEmail({ to, name, token, lang }) {
  const L = await langForEmail(to, lang);
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const hola = first ? tl(L, 'Hola, {nombre}', { nombre: first }) : tl(L, 'Hola');
  const html = shellTemplate({
    lang: L,
    title: tl(L, 'Confirma tu email'),
    intro: `${escHtml(hola)},<br><br>${tl(L, 'Gracias por crear tu cuenta en EU Funding Studio. Confirma tu dirección de correo para activarla.')}`,
    buttonLabel: tl(L, 'Confirmar mi email'),
    buttonUrl: url,
    footer: tl(L, 'El enlace caduca en 24 horas. Si no has creado ninguna cuenta, puedes ignorar este correo.')
  });
  const text = `${hola},

${tl(L, 'Gracias por crear tu cuenta en EU Funding Studio. Confirma tu correo entrando en:')}

${url}

${tl(L, 'El enlace caduca en 24 horas. Si no has creado ninguna cuenta, puedes ignorar este correo.')}`;
  return sendEmail({ to, subject: tl(L, 'Confirma tu email — EU Funding Studio'), html, text });
}

async function sendPasswordResetEmail({ to, name, token, lang }) {
  const L = await langForEmail(to, lang);
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const hola = first ? tl(L, 'Hola, {nombre}', { nombre: first }) : tl(L, 'Hola');
  const html = shellTemplate({
    lang: L,
    title: tl(L, 'Cambia tu contraseña'),
    intro: `${escHtml(hola)},<br><br>${tl(L, 'Hemos recibido una petición para cambiar la contraseña de tu cuenta. Pulsa el botón para elegir una nueva.')}`,
    buttonLabel: tl(L, 'Elegir nueva contraseña'),
    buttonUrl: url,
    footer: tl(L, 'El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.')
  });
  const text = `${hola},

${tl(L, 'Hemos recibido una petición para cambiar la contraseña de tu cuenta. Entra en este enlace para elegir una nueva:')}

${url}

${tl(L, 'El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este correo.')}`;
  return sendEmail({ to, subject: tl(L, 'Cambia tu contraseña — EU Funding Studio'), html, text });
}

/* ── Alta nueva (regla del ecosistema: correo a la persona + aviso a Óscar) ── */
async function sendWelcomeEmail({ to, name, lang }) {
  const L = await langForEmail(to, lang);
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const url = appUrl();
  const title = first ? tl(L, 'Te damos la bienvenida, {nombre}', { nombre: first }) : tl(L, 'Te damos la bienvenida');
  const html = shellTemplate({
    lang: L,
    title: escHtml(title),
    intro: tl(L, 'Tu cuenta de <b>EU Funding Studio</b> ya está creada.') + '<br><br>' +
      tl(L, 'Desde hoy puedes buscar convocatorias, encontrar socios en el directorio de entidades europeas y diseñar tus proyectos paso a paso, con ayuda en cada sección.') + '<br><br>' +
      tl(L, 'Nos vemos dentro.'),
    buttonLabel: tl(L, 'Entrar en EU Funding Studio'),
    buttonUrl: url,
    footer: tl(L, 'Recibes este correo porque acabas de crear una cuenta en EU Funding Studio. Si no has sido tú, escríbenos a {correo} y la cerramos.',
      { correo: '<a href="mailto:info@eufundingstudio.com">info@eufundingstudio.com</a>' })
  });
  const text = `${title}.

${tl(L, 'Tu cuenta de EU Funding Studio ya está creada. Entra aquí: {url}', { url })}

${tl(L, 'Nos vemos dentro.')}`;
  return sendEmail({ to, subject: tl(L, 'Tu cuenta de EU Funding Studio está lista'), html, text });
}

// i18n-no-inicio — avisos internos para el equipo: siempre en español.
async function sendNewUserNotice({ user, via }) {
  const to = process.env.NEW_USER_NOTIFY_EMAIL || 'oscarargumosa@gmail.com';
  const html = shellTemplate({
    title: 'Nueva alta en EU Funding Studio',
    intro: `<b>${escHtml(user.name)}</b> &lt;${escHtml(user.email)}&gt; acaba de crear su cuenta.<br>
      Vía: ${escHtml(via)}<br>Fecha: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`
  });
  return sendEmail({ to, subject: `Nueva alta en Studio: ${user.name || user.email}`, html,
    text: `Nueva alta: ${user.name} <${user.email}> (vía ${via})` });
}

// i18n-no-fin

/* Correo de bienvenida + aviso. Nunca lanza: si falla, la cuenta ya está creada. */
async function onNewUser(user, via) {
  try { await sendWelcomeEmail({ to: user.email, name: user.name, lang: user.ui_lang }); }
  catch (e) { console.warn('[alta] bienvenida no enviada:', e.message); }
  try { await sendNewUserNotice({ user, via }); }
  catch (e) { console.warn('[alta] aviso no enviado:', e.message); }
}

/* ── Fase beta (utils/areas.js): solicitud de acceso y acceso concedido ── */
// i18n-no-inicio — aviso interno para el equipo: en español.
async function sendAccessRequestNotice({ user, areaLabel, message }) {
  const to = process.env.NEW_USER_NOTIFY_EMAIL || 'oscarargumosa@gmail.com';
  const msg = String(message || '').trim();
  const html = shellTemplate({
    title: 'Solicitud de acceso beta',
    intro: `<b>${escHtml(user.name)}</b> &lt;${escHtml(user.email)}&gt; pide acceso a <b>${escHtml(areaLabel)}</b>.<br>
      ${msg ? `<br>Su mensaje:<br><i>${escHtml(msg).replace(/\n/g, '<br>')}</i><br>` : '<br>(Sin mensaje.)<br>'}
      <br>Fecha: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    buttonLabel: 'Revisar en Usuarios y accesos',
    buttonUrl: `${appUrl()}/#admin-users`,
  });
  return sendEmail({ to, subject: `Solicitud de acceso beta: ${areaLabel} — ${user.name || user.email}`, html,
    text: `Solicitud de acceso beta a ${areaLabel}: ${user.name} <${user.email}>${msg ? `\n\n${msg}` : ''}\n\nRevisar: ${appUrl()}/#admin-users` });
}

// i18n-no-fin

async function sendAreaGrantedEmail({ to, name, areaLabel, path, lang }) {
  const L = await langForEmail(to, lang);
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const url = appUrl() + (path || '/');
  const area = tl(L, areaLabel);
  const hola = first ? tl(L, 'Hola, {nombre}', { nombre: first }) : tl(L, 'Hola');
  const html = shellTemplate({
    lang: L,
    title: escHtml(tl(L, 'Ya tienes acceso a {area}', { area })),
    intro: `${escHtml(hola)}:<br><br>
      ${tl(L, 'Te hemos abierto <b>{area}</b> en <b>EU Funding Studio</b>. Ya puedes usarla con tu cuenta de siempre.', { area: escHtml(area) })}<br><br>
      ${tl(L, 'Gracias por probar Studio en esta fase beta: lo que nos cuentes nos ayuda a mejorarlo.')}`,
    buttonLabel: escHtml(tl(L, 'Entrar en {area}', { area })),
    buttonUrl: url,
    footer: tl(L, 'Recibes este correo porque pediste acceso o porque el equipo de EU Funding Studio te lo ha dado. ¿Dudas? Escríbenos a {correo}.',
      { correo: '<a href="mailto:info@eufundingstudio.com">info@eufundingstudio.com</a>' })
  });
  return sendEmail({ to, subject: tl(L, 'Ya tienes acceso a {area} en EU Funding Studio', { area }), html,
    text: `${hola}:\n\n${tl(L, 'Ya tienes acceso a {area} en EU Funding Studio. Entra aquí: {url}', { area, url })}` });
}

/* ── Entidades reclamadas: resultado de la revisión de la documentación ── */
async function sendOrgClaimReviewEmail({ to, name, orgName, decision, note, lang }) {
  const L = await langForEmail(to, lang);
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const url = `${appUrl()}/#account-org`;
  const ok = decision === 'verified';
  const hola = first ? tl(L, 'Hola, {nombre}', { nombre: first }) : tl(L, 'Hola');
  const title = ok ? tl(L, 'Tu entidad ya está verificada') : tl(L, 'No hemos podido verificar tu entidad');
  const org = `<b>${escHtml(orgName)}</b>`;
  const intro = `${escHtml(hola)}:<br><br>` + (ok
    ? tl(L, 'Hemos revisado la documentación de {entidad}. Su ficha ya lleva el sello <b>«Verificada»</b> en el directorio de EU Funding Studio.', { entidad: org })
    : tl(L, 'Hemos revisado la documentación de {entidad} y no hemos podido verificarla.', { entidad: org }) +
      (note ? `<br><br>${tl(L, 'Motivo:')} <i>${escHtml(note)}</i>` : '') +
      '<br><br>' + tl(L, 'Puedes subir otro documento desde «Mi entidad» y lo revisaremos de nuevo.'));
  const html = shellTemplate({
    lang: L,
    title, intro, buttonLabel: tl(L, 'Ir a Mi entidad'), buttonUrl: url,
    footer: tl(L, 'Recibes este correo porque reclamaste esta entidad en EU Funding Studio. ¿Dudas? Escríbenos a {correo}.',
      { correo: '<a href="mailto:info@eufundingstudio.com">info@eufundingstudio.com</a>' })
  });
  const subject = ok
    ? tl(L, '«{entidad}» ya está verificada en EU Funding Studio', { entidad: orgName })
    : tl(L, 'Revisión de la documentación de «{entidad}»', { entidad: orgName });
  return sendEmail({ to, subject, html,
    text: `${title}: ${orgName}.${!ok && note ? `\n${tl(L, 'Motivo:')} ${note}` : ''}\n\n${url}` });
}

module.exports = {
  sendOrgClaimReviewEmail,
  sendAccessRequestNotice,
  sendAreaGrantedEmail,
  sendWelcomeEmail,
  sendNewUserNotice,
  onNewUser,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
