/* ═══════════════════════════════════════════════════════════════
   Respuestas de error uniformes
   ─────────────────────────────────────────────────────────────
   4xx: el mensaje lo ha escrito el código (validación, no encontrado…)
        y se devuelve tal cual.
   5xx: el detalle (mensaje de mysql2, de la IA, stack…) va SOLO al log;
        el cliente recibe un mensaje genérico y el requestId para
        poder buscarlo.
   ═══════════════════════════════════════════════════════════════ */

const logger = require('./logger');

const GENERIC_MESSAGE = 'Error interno del servidor. Inténtalo de nuevo y, si se repite, indica este código de petición.';

function reqFields(req) {
  if (!req) return {};
  return {
    reqId:  req.id,
    method: req.method,
    path:   (req.originalUrl || req.url || '').split('?')[0],
    userId: req.user?.id,
  };
}

/** Status HTTP de un error lanzado (500 si no lo trae puesto a mano). */
function statusOf(err) {
  const s = Number(err && (err.status || err.statusCode));
  return s >= 400 && s <= 599 ? s : 500;
}

/** Código por defecto para un status sin code propio. */
const DEFAULT_CODES = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED' };
function codeFor(status, err) {
  if (status >= 500) return 'INTERNAL_ERROR';
  if (err && typeof err.code === 'string' && !/^ER_|^E[A-Z]+$/.test(err.code)) return err.code;
  return DEFAULT_CODES[status] || 'BAD_REQUEST';
}

/** Mensaje apto para el cliente: el propio si es 4xx, el genérico si es 5xx. */
function publicMessage(err, status = statusOf(err)) {
  if (status < 500 && err && err.message) return err.message;
  return GENERIC_MESSAGE;
}

/** Registra un fallo 5xx con su stack (solo log). */
function logServerError(req, status, cause) {
  const detail = cause instanceof Error ? logger.errFields(cause)
    : { err: typeof cause === 'string' ? cause : (cause && cause.message) || String(cause) };
  logger.error('Error del servidor', { ...reqFields(req), status, ...detail });
}

/**
 * Envía un error. `error` puede ser un objeto { code, message, ... } o un
 * texto (algunos módulos devuelven error como string: se respeta la forma).
 * `cause` es el Error original, si se tiene, para el log.
 */
function sendError(res, status, error, cause) {
  status = Number(status) || 500;
  const req = res.req;
  if (status >= 500) logServerError(req, status, cause || error);
  // Respuesta ya empezada (streaming): solo queda cortarla.
  if (res.headersSent) { if (!res.writableEnded) res.end(); return res; }
  if (status < 500) return res.status(status).json({ ok: false, error });

  const requestId = req && req.id;
  if (error == null || typeof error !== 'object') {
    return res.status(status).json({ ok: false, error: GENERIC_MESSAGE, requestId });
  }
  const code = typeof error.code === 'string' && !/^ER_|^E[A-Z]+$/.test(error.code) ? error.code : 'INTERNAL_ERROR';
  return res.status(status).json({ ok: false, error: { code, message: GENERIC_MESSAGE, requestId } });
}

module.exports = { sendError, publicMessage, statusOf, codeFor, logServerError, GENERIC_MESSAGE };
