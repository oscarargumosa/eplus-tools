/* ── Estadísticas Erasmus+ — /v1/estadisticas/* (cualquier cuenta, solo lectura) ── */
const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const engine = require('./engine');
const { sendError } = require('../../utils/httpError');

const ok = (res, data) => {
  // Los datos cambian solo al regenerar la foto: el navegador puede guardarlos un rato.
  res.set('Cache-Control', 'private, max-age=600');
  res.json({ ok: true, data });
};
const handle = fn => (req, res) => {
  try { fn(req, res); }
  catch (e) { sendError(res, 500, { code: 'ESTADISTICAS_ERROR', message: e.message }, e); }
};

router.use(requireAuth);

router.get('/meta',      handle((req, res) => ok(res, engine.meta())));
router.get('/consulta',  handle((req, res) => ok(res, engine.consulta(req.query))));
router.get('/paises',    handle((req, res) => ok(res, engine.paises(req.query))));
router.get('/comparar',  handle((req, res) => ok(res, engine.comparar(req.query))));
router.get('/tasas',     handle((req, res) => ok(res, engine.tasas())));
router.get('/entidades', handle((req, res) => {
  const d = engine.entidades(req.query);
  if (!d) return sendError(res, 503, { code: 'SIN_ENTIDADES', message: 'Faltan los datos de entidades' });
  ok(res, d);
}));
router.get('/entidades/mapa', handle((req, res) => {
  const d = engine.mapaEntidades(req.query);
  if (!d) return sendError(res, 503, { code: 'SIN_ENTIDADES', message: 'Faltan los datos de entidades' });
  ok(res, d);
}));
router.get('/pais/:code', handle((req, res) => {
  const d = engine.pais(req.params.code, req.query);
  if (!d) return sendError(res, 404, { code: 'NOT_FOUND', message: 'País no encontrado' });
  ok(res, d);
}));
router.get('/linea/:id', handle((req, res) => {
  const d = engine.linea(req.params.id, req.query);
  if (!d) return sendError(res, 404, { code: 'NOT_FOUND', message: 'Línea no encontrada' });
  ok(res, d);
}));

module.exports = router;
