/* ── Request id + registro de peticiones ─────────────────────────
   requestId: pone req.id (el X-Request-Id entrante si es válido, si no
   uno nuevo) y lo devuelve en la cabecera X-Request-Id.
   accessLog: una línea JSON por petición de la API (/v1/*) al terminar.
   No registra estáticos, /healthz, cuerpos ni query strings.          */

const crypto = require('crypto');
const logger = require('../utils/logger');

const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = (typeof incoming === 'string' && VALID_ID.test(incoming)) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function accessLog(req, res, next) {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (!path.startsWith('/v1/')) return next();
  const t0 = process.hrtime.bigint();
  let done = false;
  const write = (aborted) => {
    if (done || res.locals.skipAccessLog) return;
    done = true;
    const status = aborted ? 499 : res.statusCode;
    const fields = {
      reqId: req.id, method: req.method, path, status,
      ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e5) / 10,
      userId: req.user?.id,
    };
    (status >= 500 ? logger.error : logger.info)('request', fields);
  };
  res.on('finish', () => write(false));
  res.on('close',  () => write(!res.writableFinished));   // el cliente cortó
  next();
}

module.exports = { requestId, accessLog };
