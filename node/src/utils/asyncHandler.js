/**
 * asyncHandler — Envuelve un controlador async y captura errores automáticamente.
 * Elimina la necesidad de try-catch en cada endpoint.
 *
 * Uso:
 *   exports.listPrograms = asyncHandler(async (req, res) => {
 *     const data = await m.listPrograms();
 *     res.json({ ok: true, data });
 *   });
 */
const { sendError, statusOf, codeFor } = require('./httpError');

module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      // 4xx puestos a mano (err.status) muestran su mensaje; el resto, genérico + requestId.
      const status = statusOf(err);
      sendError(res, status, { code: codeFor(status, err), message: err.message }, err);
    });
  };
};
