/* ═══════════════════════════════════════════════════════════════
   Logger mínimo — una línea JSON por evento en stdout
   ─────────────────────────────────────────────────────────────
   Campos: ts, level, msg y los que se pasen (reqId, method, path,
   status, ms, userId…). Nunca cuerpos ni tokens: los emails que
   aparezcan en cualquier texto se enmascaran (o***@dominio) y los
   Bearer/token= se tapan.
   ═══════════════════════════════════════════════════════════════ */

const EMAIL_RE  = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const BEARER_RE = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const TOKEN_RE  = /\b(token|access_token|refresh_token|code|secret|password)=([^&\s"']+)/gi;

/** o***@dominio.com — para emails sueltos. */
function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return s ? '***' : '';
  return s[0] + '***@' + s.slice(at + 1);
}

/** Limpia un texto: enmascara emails y tapa tokens. */
function scrub(text) {
  return String(text)
    .replace(EMAIL_RE, '$1***@$2')
    .replace(BEARER_RE, '$1 ***')
    .replace(TOKEN_RE, '$1=***');
}

function clean(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return scrub(value).slice(0, 4000);
  if (typeof value !== 'object' || depth > 3) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(v => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

function write(level, msg, fields) {
  const entry = { ts: new Date().toISOString(), level, msg: clean(msg), ...clean(fields || {}) };
  let line;
  try { line = JSON.stringify(entry); }
  catch { line = JSON.stringify({ ts: entry.ts, level, msg: entry.msg, note: 'campos no serializables' }); }
  process.stdout.write(line + '\n');
}

/** Campos de un Error aptos para el log (el stack solo va aquí, nunca al cliente). */
function errFields(err) {
  if (!err) return {};
  if (typeof err !== 'object') return { err: String(err) };
  return { err: err.message, code: err.code, stack: err.stack };
}

module.exports = {
  info:  (msg, fields) => write('info',  msg, fields),
  warn:  (msg, fields) => write('warn',  msg, fields),
  error: (msg, fields) => write('error', msg, fields),
  maskEmail,
  scrub,
  errFields,
};
