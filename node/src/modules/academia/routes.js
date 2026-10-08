/* Academia — rutas. Montado en /v1/academia (ver server.js).
   Cursos nativos de Studio: catálogo, lecciones, progreso, tests y certificado.
   (El revisor interno de contenidos sigue en /v1/academy.)                    */

const router = require('express').Router();
const { requireAuth, optionalAuth } = require('../../middleware/auth');
const m = require('./model');

const h = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req) });
  } catch (err) {
    if (err instanceof m.HttpError) {
      return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, ...(err.extra || {}) } });
    }
    console.error('[academia]', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } });
  }
};

router.get('/courses', optionalAuth, h(req => m.listCourses(req.user)));
router.get('/courses/:course', optionalAuth, h(req => m.courseDetail(req.params.course, req.user)));
router.post('/courses/:course/enroll', requireAuth, h(req => m.enroll(req.params.course, req.user)));

router.get('/courses/:course/lessons/:lesson', requireAuth,
  h(req => m.lessonDetail(req.params.course, req.params.lesson, req.user)));
router.post('/courses/:course/lessons/:lesson/phase', requireAuth,
  h(req => m.savePhase(req.params.course, req.params.lesson, req.user, req.body)));
router.post('/courses/:course/lessons/:lesson/test', requireAuth,
  h(req => m.startTest(req.params.course, req.params.lesson, req.user)));
router.post('/courses/:course/lessons/:lesson/test/submit', requireAuth,
  h(req => m.submitTest(req.params.course, req.params.lesson, req.user, req.body)));
router.post('/courses/:course/certificate', requireAuth,
  h(req => m.issueCertificate(req.params.course, req.user, req.body)));
router.put('/courses/:course/lessons/:lesson/note', requireAuth,
  h(req => m.saveNote(req.params.course, req.params.lesson, req.user, req.body)));

router.get('/certificates/:serial', h(async req => {
  const c = await m.certificate(req.params.serial);
  if (!c) throw new m.HttpError(404, 'NOT_FOUND', 'Certificado no encontrado');
  return c;
}));

module.exports = router;
