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
  const name = process.env.EMAIL_FROM_NAME || 'EU Funding School';
  return `${name} <${addr}>`;
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
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#1b1464;padding:24px 32px;">
          <div style="display:inline-block;background:#fbff12;width:32px;height:32px;border-radius:6px;vertical-align:middle;"></div>
          <span style="color:#ffffff;font-size:18px;font-weight:600;margin-left:12px;vertical-align:middle;">EU Funding School</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">${title}</h1>
          <div style="font-size:15px;color:#374151;line-height:1.6;">${intro}</div>
          ${buttonUrl ? `
          <div style="margin:28px 0;">
            <a href="${buttonUrl}" style="display:inline-block;background:#fbff12;color:#1b1464;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${buttonLabel}</a>
          </div>
          <div style="font-size:13px;color:#6b7280;line-height:1.5;">
            Or copy this link into your browser:<br>
            <span style="color:#1b1464;word-break:break-all;">${buttonUrl}</span>
          </div>` : ''}
          ${footer ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;line-height:1.5;">${footer}</div>` : ''}
        </td></tr>
        <tr><td style="background:#fafbfc;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center;">
          EU Funding School · <a href="https://eufundingschool.com" style="color:#9ca3af;">eufundingschool.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendVerificationEmail({ to, name, token }) {
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const html = shellTemplate({
    title: 'Verify your email',
    intro: `Hi ${name || 'there'},<br><br>Welcome to EU Funding School. Please confirm your email address to activate your account.`,
    buttonLabel: 'Verify my email',
    buttonUrl: url,
    footer: `This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.`
  });
  const text = `Hi ${name || 'there'},

Welcome to EU Funding School. Please confirm your email by visiting:

${url}

This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.`;
  return sendEmail({ to, subject: 'Verify your email — EU Funding School', html, text });
}

async function sendPasswordResetEmail({ to, name, token }) {
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const html = shellTemplate({
    title: 'Reset your password',
    intro: `Hi ${name || 'there'},<br><br>We received a request to reset your password. Click the button below to choose a new one.`,
    buttonLabel: 'Reset my password',
    buttonUrl: url,
    footer: `This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.`
  });
  const text = `Hi ${name || 'there'},

We received a request to reset your password. Visit this link to choose a new one:

${url}

This link expires in 1 hour. If you didn't request this, ignore this email.`;
  return sendEmail({ to, subject: 'Reset your password — EU Funding School', html, text });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
