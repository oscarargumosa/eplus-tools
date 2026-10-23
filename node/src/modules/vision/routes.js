/* ── EU Vision Routes — /v1/vision/* (TASK-012) ───────────────────────
   Rutas estáticas antes que /:id para que no las capture el comodín.    */

const router = require('express').Router();
const { requireAuth, requireArea } = require('../../middleware/auth');
const { aiLimit } = require('../../middleware/aiLimit');
const ctrl = require('./controller');

// Proxies al directory-api (Experience RAG) — requieren login.
router.post('/suggest-projects', requireAuth, ctrl.suggestProjects);
router.get('/project/:identifier/full', requireAuth, ctrl.projectFull);

// Ideas: tablón de publicadas y mis solicitudes — antes de /:id.
router.get('/public', requireAuth, ctrl.publicList);
router.get('/public/counts', requireAuth, ctrl.publicCounts);
router.get('/requests/mine', requireAuth, ctrl.myRequests);
router.get('/requests/pending-count', requireAuth, ctrl.pendingCount);

// Colección
router.get('/', requireAuth, ctrl.list);
router.post('/', requireAuth, ctrl.create);

// Ficha (con sesión; las publicadas las ve cualquier usuario registrado).
router.get('/:id', requireAuth, ctrl.getOne);
router.patch('/:id', requireAuth, ctrl.update);
router.post('/:id/publish', requireAuth, ctrl.publish);
// Pasar a proyecto = abrir Diseñar: área beta «proyectos».
router.post('/:id/promote', requireAuth, requireArea('proyectos'), ctrl.promote);
router.post('/:id/generate', requireAuth, aiLimit, ctrl.generate);

// Referencias (proyectos similares adjuntados)
router.post('/:id/references', requireAuth, ctrl.addReference);
router.delete('/:id/references/:refId', requireAuth, ctrl.removeReference);

// Ficha pública y solicitudes para unirse (con entidad).
router.get('/:id/view', requireAuth, ctrl.view);
router.post('/:id/requests', requireAuth, ctrl.createRequest);
router.post('/:id/requests/withdraw', requireAuth, ctrl.withdrawRequest);
router.post('/:id/requests/:reqId/accept', requireAuth, ctrl.acceptRequest);
router.post('/:id/requests/:reqId/reject', requireAuth, ctrl.rejectRequest);

module.exports = router;
