/* ── EU Vision Routes — /v1/vision/* (TASK-012) ───────────────────────
   Rutas estáticas antes que /:id para que no las capture el comodín.    */

const router = require('express').Router();
const { requireAuth, optionalAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

// Proxies al directory-api (Experience RAG) — requieren login.
router.post('/suggest-projects', requireAuth, ctrl.suggestProjects);
router.get('/project/:identifier/full', requireAuth, ctrl.projectFull);

// Tablón público "Explorar visiones" (v2) — antes de /:id.
// router.get('/public', optionalAuth, ctrl.publicList);

// Colección
router.get('/', requireAuth, ctrl.list);
router.post('/', requireAuth, ctrl.create);

// Ficha (optionalAuth: invitado ve las públicas, sin datos de interés).
router.get('/:id', optionalAuth, ctrl.getOne);
router.patch('/:id', requireAuth, ctrl.update);
router.post('/:id/publish', requireAuth, ctrl.publish);
router.post('/:id/promote', requireAuth, ctrl.promote);
router.post('/:id/generate', requireAuth, ctrl.generate);

// Referencias (proyectos similares adjuntados)
router.post('/:id/references', requireAuth, ctrl.addReference);
router.delete('/:id/references/:refId', requireAuth, ctrl.removeReference);

// Comunidad (v2)
router.post('/:id/interest', requireAuth, ctrl.addInterest);
router.get('/:id/interest', requireAuth, ctrl.listInterest);

module.exports = router;
