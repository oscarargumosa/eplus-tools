/* Academia — rutas. Montado en /v1/academia (ver server.js).
   Cursos nativos de Studio: catálogo, lecciones, progreso, tests y certificado.
   (El revisor interno de contenidos sigue en /v1/academy.)                    */

const router = require('express').Router();
const { requireAuth, requireArea } = require('../../middleware/auth');

// Fase beta: cursos, lecciones, tests, notas y certificados piden el área
// «academia». La verificación pública de certificados sigue abierta.
const gate = [requireAuth, requireArea('academia')];
const m = require('./model');
const social = require('./social');
const admin = require('./admin');

// Panel de admin de la academia: solo role 'admin'.
const adminOnly = (req, res, next) => (req.user?.role === 'admin' ? next()
  : res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Solo administración' } }));
const adminGate = [requireAuth, adminOnly];

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

router.get('/courses', gate, h(req => m.listCourses(req.user)));
router.get('/me', gate, h(req => m.myCourses(req.user)));
router.get('/courses/:course', gate, h(req => m.courseDetail(req.params.course, req.user)));
router.post('/courses/:course/enroll', gate, h(req => m.enroll(req.params.course, req.user)));

router.get('/courses/:course/lessons/:lesson', gate,
  h(req => m.lessonDetail(req.params.course, req.params.lesson, req.user)));
router.post('/courses/:course/lessons/:lesson/phase', gate,
  h(req => m.savePhase(req.params.course, req.params.lesson, req.user, req.body)));
router.post('/courses/:course/lessons/:lesson/test', gate,
  h(req => m.startTest(req.params.course, req.params.lesson, req.user)));
router.post('/courses/:course/lessons/:lesson/test/submit', gate,
  h(req => m.submitTest(req.params.course, req.params.lesson, req.user, req.body)));
router.post('/courses/:course/certificate', gate,
  h(req => m.issueCertificate(req.params.course, req.user, req.body)));
router.put('/courses/:course/lessons/:lesson/note', gate,
  h(req => m.saveNote(req.params.course, req.params.lesson, req.user, req.body)));
router.get('/courses/:course/lessons/:lesson/test/history', gate,
  h(req => m.testHistory(req.params.course, req.params.lesson, req.user)));

const L = '/courses/:course/lessons/:lesson';
router.post(`${L}/heart`, gate, h(req => social.toggleHeart(req.params.course, req.params.lesson, req.user, req.body)));
router.post(`${L}/rating`, gate, h(req => social.rate(req.params.course, req.params.lesson, req.user, req.body)));
router.get(`${L}/discussion`, gate, h(req => social.listDiscussion(req.params.course, req.params.lesson, req.user)));
router.post(`${L}/discussion`, gate, h(req => social.postMessage(req.params.course, req.params.lesson, req.user, req.body)));
router.post(`${L}/discussion/:id/withdraw`, gate,
  h(req => social.withdraw(req.params.course, req.params.lesson, req.user, req.params.id)));
router.post(`${L}/discussion/:id/like`, gate,
  h(req => social.like(req.params.course, req.params.lesson, req.user, req.params.id, !!req.body?.on)));

/* ── Admin ── */
router.get('/admin/courses', adminGate, h(() => admin.courses()));
router.get('/admin/courses/:course/students', adminGate, h(req => admin.students(req.params.course)));
router.get('/admin/courses/:course/students/:user', adminGate, h(req => admin.student(req.params.course, req.params.user)));
router.get('/admin/courses/:course/lessons', adminGate, h(req => admin.lessonsReport(req.params.course)));
router.post('/admin/courses/:course/enrollments', adminGate, h(req => admin.enrollByEmail(req.params.course, req.body, req.user)));
router.delete('/admin/courses/:course/enrollments/:user', adminGate, h(req => admin.revoke(req.params.course, req.params.user, req.user)));
router.get('/admin/courses/:course/export.csv', adminGate, async (req, res) => {
  try {
    const { filename, csv } = await admin.exportCsv(req.params.course);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(csv);
  } catch (err) {
    const st = err instanceof m.HttpError ? err.status : 500;
    if (st === 500) console.error('[academia] csv', err);
    res.status(st).json({ ok: false, error: { code: err.code || 'INTERNAL_ERROR', message: st === 500 ? 'Error interno' : err.message } });
  }
});
router.get('/admin/hearts', adminGate, h(() => admin.hearts()));
router.get('/admin/comments', adminGate, h(req => admin.comments(req.query)));
router.post('/admin/comments/:id', adminGate, h(req => admin.commentAction(req.params.id, req.body, req.user)));
router.delete('/admin/comments/:id', adminGate, h(req => admin.deleteComment(req.params.id, req.user)));

router.get('/certificates/:serial', h(async req => {
  const c = await m.certificate(req.params.serial);
  if (!c) throw new m.HttpError(404, 'NOT_FOUND', 'Certificado no encontrado');
  return c;
}));

module.exports = router;
