/* ── Research Routes — /v1/research/* ────────────────────────────── */
const router = require('express').Router();
const multer  = require('multer');
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* ── Search OpenAlex ────────────────────────────────────────────── */
router.get   ('/search',                          requireAuth, ctrl.search);

/* ── Library (public sources) ───────────────────────────────────── */
router.get   ('/library',                         requireAuth, ctrl.listLibrary);

/* ── Saved Sources CRUD ─────────────────────────────────────────── */
router.get   ('/sources',                         requireAuth, ctrl.listSources);
router.post  ('/sources',                         requireAuth, ctrl.saveSource);
router.post  ('/sources/upload',                  requireAuth, upload.single('file'), ctrl.uploadPaper);
router.get   ('/sources/:id',                     requireAuth, ctrl.getSource);
router.get   ('/sources/:id/file',                requireAuth, ctrl.getSourceFile);
router.post  ('/sources/:id/download',            requireAuth, ctrl.downloadSource);
router.delete('/sources/:id',                     requireAuth, ctrl.deleteSource);

/* ── Admin: batch process all pending ───────────────────────────── */
router.post  ('/process-all',                     requireAuth, ctrl.processAllPending);

/* ── Project ↔ Source links ─────────────────────────────────────── */
router.get   ('/projects/:projectId',             requireAuth, ctrl.getProjectSources);
router.post  ('/projects/:projectId/link',        requireAuth, ctrl.linkToProject);
router.delete('/projects/:projectId/:sourceId',   requireAuth, ctrl.unlinkFromProject);

module.exports = router;
