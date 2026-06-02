/* ── Convocatorias Routes — /v1/convocatorias/* ─────────────────────── */
const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

router.get('/',     requireAuth, ctrl.list);
router.get('/search-semantic', requireAuth, ctrl.searchSemantic);
router.get('/rag-status', requireAuth, ctrl.ragStatus);
router.get('/curation', requireAuth, ctrl.curationList);
router.patch('/curation/:sourceId', requireAuth, ctrl.curationPatch);
router.get('/:id',  requireAuth, ctrl.getById);
router.post('/:sourceId/chat', requireAuth, ctrl.chat);

module.exports = router;
