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

function shellTemplate({ title, intro, buttonLabel, buttonUrl, footer }) {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#3c45a3;padding:24px 32px;">
          <div style="display:inline-block;background:#d6e949;width:32px;height:32px;border-radius:6px;vertical-align:middle;"></div>
          <span style="color:#ffffff;font-size:18px;font-weight:600;margin-left:12px;vertical-align:middle;">EU Funding Studio</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">${title}</h1>
          <div style="font-size:15px;color:#374151;line-height:1.6;">${intro}</div>
          ${buttonUrl ? `
          <div style="margin:28px 0;">
            <a href="${buttonUrl}" style="display:inline-block;background:#d6e949;color:#3c45a3;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${buttonLabel}</a>
          </div>
          <div style="font-size:13px;color:#6b7280;line-height:1.5;">
            O copia este enlace en tu navegador:<br>
            <span style="color:#3c45a3;word-break:break-all;">${buttonUrl}</span>
          </div>` : ''}
          ${footer ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;line-height:1.5;">${footer}</div>` : ''}
        </td></tr>
        <tr><td style="background:#fafbfc;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center;">
          EU Funding Studio · <a href="${appUrl()}" style="color:#9ca3af;">${appUrl().replace(/^https?:\/\//, '')}</a>
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

module.exports = {
  sendWelcomeEmail,
  sendNewUserNotice,
  onNewUser,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
