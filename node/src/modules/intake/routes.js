/* ── Intake Routes — /v1/intake/* ─────────────────────────────────── */

const router = require('express').Router();
const multer  = require('multer');
const { requireAuth } = require('../../middleware/auth');
const { aiLimit } = require('../../middleware/aiLimit');
const ctrl = require('./controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

/* ── Programs (public endpoints) ────────────────────────────────── */
router.get('/programs', ctrl.listPrograms);

/* ── Entity search (authenticated) ────────────���────────────────── */
router.get('/entities/search', requireAuth, ctrl.searchEntities);

/* ── Projects (all authenticated) ──────────────────────────────── */
router.get('/projects', requireAuth, ctrl.listProjects);
router.get('/projects/:id', requireAuth, ctrl.getProject);
router.post('/projects', requireAuth, ctrl.createProject);
router.patch('/projects/:id', requireAuth, ctrl.updateProject);
router.patch('/projects/:id/launch', requireAuth, ctrl.launchProject);
router.delete('/projects/:id', requireAuth, ctrl.deleteProject);

/* ── Partners ──────────────────────────────────────────────────── */
router.get('/projects/:projectId/partners', requireAuth, ctrl.listPartners);
router.post('/projects/:projectId/partners', requireAuth, ctrl.createPartner);
router.patch('/partners/:id', requireAuth, ctrl.updatePartner);
router.delete('/partners/:id', requireAuth, ctrl.deletePartner);
router.patch('/projects/:projectId/partners/reorder', requireAuth, ctrl.reorderPartners);

/* ── Intake Contexts ───────────────────────────────────────────── */
router.get('/projects/:projectId/context', requireAuth, ctrl.listContexts);
router.patch('/contexts/:id', requireAuth, ctrl.updateContext);

/* ── Upload Form Part B (DOCX) ────────────────────────────────── */
router.post('/parse-form-b', requireAuth, upload.single('file'), ctrl.parseFormB);

/* ── Interview (AI-guided Project Summary) ───────────────────── */
router.get   ('/projects/:id/interview',      requireAuth, ctrl.getInterview);
router.post  ('/projects/:id/interview/next',  requireAuth, aiLimit, ctrl.interviewNext);
router.delete('/projects/:id/interview',       requireAuth, ctrl.resetInterview);

/* ── Task Templates ──────────────────────────────────────────── */
router.get('/task-templates', ctrl.getTaskTemplates);

/* ── Project Tasks ───────────────────────────────────────────── */
router.get   ('/projects/:projectId/tasks',    requireAuth, ctrl.listTasks);
router.post  ('/projects/:projectId/tasks',    requireAuth, ctrl.createTask);
router.post  ('/projects/:projectId/tasks/generate', requireAuth, ctrl.generateTasks);
router.patch ('/tasks/:id',                    requireAuth, ctrl.updateTask);
router.delete('/tasks/:id',                    requireAuth, ctrl.deleteTask);
router.delete('/projects/:projectId/tasks',    requireAuth, ctrl.deleteAllTasks);

module.exports = router;
