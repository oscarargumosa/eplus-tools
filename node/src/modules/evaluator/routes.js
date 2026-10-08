/* ── Evaluator Routes — /v1/evaluator/* ───────────────────────── */
const router = require('express').Router();
const multer  = require('multer');
const { requireAuth } = require('../../middleware/auth');
const { aiLimit } = require('../../middleware/aiLimit');
const ctrl = require('./controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB for large proposals

/* ── Programs with form templates ────────────────────────────── */
router.get('/programs', requireAuth, ctrl.listPrograms);

/* ── Form instances (user-scoped) ────────────────────────────── */
router.post  ('/instances',              requireAuth, ctrl.createInstance);
router.get   ('/instances',              requireAuth, ctrl.listInstances);
router.get   ('/instances/:id',          requireAuth, ctrl.getInstance);
router.delete('/instances/:id',          requireAuth, ctrl.deleteInstance);
router.get   ('/instances/:id/values',   requireAuth, ctrl.getValues);
router.put   ('/instances/:id/values',   requireAuth, ctrl.saveValues);

/* ── Upload + AI parse ───────────────────────────────────────── */
router.post  ('/instances/:id/upload-parse', requireAuth, aiLimit, upload.single('file'), ctrl.uploadAndParse);
router.get   ('/parse-jobs/:jobId',          requireAuth, ctrl.getParseStatus);

/* ── Promote evaluation → editable project (Path B) ──────────── */
router.post  ('/instances/:id/promote-to-project', requireAuth, ctrl.promoteToProject);

module.exports = router;
