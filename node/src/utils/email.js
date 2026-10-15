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

/* Plantilla común (manual de marca EU Funding Studio, oct-2026): cabecera azul #3C45A3 con el
   logo en PNG (los SVG no se ven en Gmail/Outlook), titular azul en Poppins, botón en píldora
   lima con texto azul y pie crema. Tablas + estilos en línea para que aguante en Outlook. */
const FONT = "Poppins,'Segoe UI',Helvetica,Arial,sans-serif";

function shellTemplate({ title, intro, buttonLabel, buttonUrl, footer }) {
  const logo = `${appUrl()}/img/marca/logo-horizontal-blanco-correo.png`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>a{color:#3c45a3}</style>
</head>
<body style="margin:0;padding:0;background:#f8f7f5;font-family:${FONT};color:#222351;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f8f7f5" style="background:#f8f7f5;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #d6d3dc;">
        <tr><td bgcolor="#3c45a3" style="background:#3c45a3;padding:28px 32px;">
          <a href="${appUrl()}" style="text-decoration:none;"><img src="${logo}" width="224" height="24" alt="EU Funding Studio" style="display:block;border:0;outline:none;width:224px;height:24px;color:#ffffff;font-family:${FONT};font-size:18px;font-weight:600;"></a>
        </td></tr>
        <tr><td style="padding:36px 32px 32px;">
          <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:600;color:#3c45a3;">${title}</h1>
          <div style="font-family:${FONT};font-size:15px;color:#222351;line-height:1.65;">${intro}</div>
          ${buttonUrl ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 26px;">
            <tr><td bgcolor="#d6e949" style="background:#d6e949;border-radius:999px;">
              <a href="${buttonUrl}" style="display:inline-block;padding:14px 32px;border-radius:999px;background:#d6e949;color:#3c45a3;text-decoration:none;font-family:${FONT};font-weight:600;font-size:15px;line-height:1.2;">${buttonLabel}</a>
            </td></tr>
          </table>
          <div style="font-family:${FONT};font-size:13px;color:#55577a;line-height:1.5;">
            O copia este enlace en tu navegador:<br>
            <span style="color:#3c45a3;word-break:break-all;">${buttonUrl}</span>
          </div>` : ''}
          ${footer ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #d6d3dc;font-family:${FONT};font-size:13px;color:#55577a;line-height:1.5;">${footer}</div>` : ''}
        </td></tr>
        <tr><td bgcolor="#f0edeb" style="background:#f0edeb;padding:18px 32px;font-family:${FONT};font-size:12px;color:#55577a;text-align:center;">
          EU Funding Studio · <a href="${appUrl()}" style="color:#3c45a3;">${appUrl().replace(/^https?:\/\//, '')}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendVerificationEmail({ to, name, token }) {
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const html = shellTemplate({
    title: 'Confirma tu email',
    intro: `Hola${first ? ' ' + escHtml(first) : ''},<br><br>Gracias por crear tu cuenta en EU Funding Studio. Confirma tu dirección de correo para activarla.`,
    buttonLabel: 'Confirmar mi email',
    buttonUrl: url,
    footer: 'El enlace caduca en 24 horas. Si no has creado ninguna cuenta, puedes ignorar este correo.'
  });
  const text = `Hola${first ? ' ' + first : ''},

Gracias por crear tu cuenta en EU Funding Studio. Confirma tu correo entrando en:

${url}

El enlace caduca en 24 horas. Si no has creado ninguna cuenta, puedes ignorar este correo.`;
  return sendEmail({ to, subject: 'Confirma tu email — EU Funding Studio', html, text });
}

async function sendPasswordResetEmail({ to, name, token }) {
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const html = shellTemplate({
    title: 'Cambia tu contraseña',
    intro: `Hola${first ? ' ' + escHtml(first) : ''},<br><br>Hemos recibido una petición para cambiar la contraseña de tu cuenta. Pulsa el botón para elegir una nueva.`,
    buttonLabel: 'Elegir nueva contraseña',
    buttonUrl: url,
    footer: 'El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.'
  });
  const text = `Hola${first ? ' ' + first : ''},

Hemos recibido una petición para cambiar la contraseña de tu cuenta. Entra en este enlace para elegir una nueva:

${url}

El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este correo.`;
  return sendEmail({ to, subject: 'Cambia tu contraseña — EU Funding Studio', html, text });
}

/* ── Alta nueva (regla del ecosistema: correo a la persona + aviso a Óscar) ── */
async function sendWelcomeEmail({ to, name }) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const url = appUrl();
  const html = shellTemplate({
    title: `Te damos la bienvenida${first ? ', ' + escHtml(first) : ''}`,
    intro: `Tu cuenta de <b>EU Funding Studio</b> ya está creada.<br><br>
      Desde hoy puedes buscar convocatorias, encontrar socios en el directorio de entidades europeas
      y diseñar tus proyectos paso a paso, con ayuda en cada sección.<br><br>
      Nos vemos dentro.`,
    buttonLabel: 'Entrar en EU Funding Studio',
    buttonUrl: url,
    footer: 'Recibes este correo porque acabas de crear una cuenta en EU Funding Studio. Si no has sido tú, escríbenos a <a href="mailto:info@eufundingstudio.com">info@eufundingstudio.com</a> y la cerramos.'
  });
  const text = `Te damos la bienvenida${first ? ', ' + first : ''}.

Tu cuenta de EU Funding Studio ya está creada. Entra aquí: ${url}

Nos vemos dentro.`;
  return sendEmail({ to, subject: 'Tu cuenta de EU Funding Studio está lista', html, text });
}

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

/* Correo de bienvenida + aviso. Nunca lanza: si falla, la cuenta ya está creada. */
async function onNewUser(user, via) {
  try { await sendWelcomeEmail({ to: user.email, name: user.name }); }
  catch (e) { console.warn('[alta] bienvenida no enviada:', e.message); }
  try { await sendNewUserNotice({ user, via }); }
  catch (e) { console.warn('[alta] aviso no enviado:', e.message); }
}

/* ── Fase beta (utils/areas.js): solicitud de acceso y acceso concedido ── */
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

async function sendAreaGrantedEmail({ to, name, areaLabel, path }) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const url = appUrl() + (path || '/');
  const html = shellTemplate({
    title: `Ya tienes acceso a ${escHtml(areaLabel)}`,
    intro: `Hola${first ? ' ' + escHtml(first) : ''}:<br><br>
      Te hemos abierto <b>${escHtml(areaLabel)}</b> en <b>EU Funding Studio</b>. Ya puedes usarla con tu cuenta de siempre.<br><br>
      Gracias por probar Studio en esta fase beta: lo que nos cuentes nos ayuda a mejorarlo.`,
    buttonLabel: `Entrar en ${escHtml(areaLabel)}`,
    buttonUrl: url,
    footer: 'Recibes este correo porque pediste acceso o porque el equipo de EU Funding Studio te lo ha dado. ¿Dudas? Escríbenos a <a href="mailto:info@eufundingstudio.com">info@eufundingstudio.com</a>.'
  });
  return sendEmail({ to, subject: `Ya tienes acceso a ${areaLabel} en EU Funding Studio`, html,
    text: `Hola${first ? ' ' + first : ''}:\n\nYa tienes acceso a ${areaLabel} en EU Funding Studio. Entra aquí: ${url}` });
}

module.exports = {
  sendAccessRequestNotice,
  sendAreaGrantedEmail,
  sendWelcomeEmail,
  sendNewUserNotice,
  onNewUser,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
