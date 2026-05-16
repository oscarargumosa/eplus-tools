/* ═══════════════════════════════════════════════════════════════
   Master Document — Routes
   ═══════════════════════════════════════════════════════════════
   Prefijo: /v1/master/*
   Auth: requireAuth obligatorio en todas las rutas (datos del
   proyecto, no exponer sin sesión).

   Estructura general (ver controller.js):
     /projects/:projectId/documents          → CRUD del Maestro
     /documents/:id                          → singular + chapters
     /documents/:id/chapters                 → CRUD capítulos
     /chapters/:id                           → singular
     /projects/:projectId/exports            → exports list
     /exports/:id/mark-ready                 → marca lista para presentar
     /projects/:projectId/threads/main       → hilo de chat principal
     /threads/:id/messages                   → mensajes
     /calls/:callId/form-templates           → plantillas formulario
     /form-templates/:id                     → plantilla + questions + mapping
     /calls/:callId/documents                → docs CAG core
     /documents/:id/diagnoses                → diagnósticos del Maestro
     /diagnoses/:id                          → diagnóstico con items
   ═══════════════════════════════════════════════════════════════ */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

/* ── Documents ───────────────────────────────────────────────── */
router.get   ('/projects/:projectId/documents', requireAuth, ctrl.listMasterDocuments);
router.post  ('/projects/:projectId/documents', requireAuth, ctrl.createMasterDocument);
router.get   ('/documents/:id',                 requireAuth, ctrl.getMasterDocument);
router.patch ('/documents/:id',                 requireAuth, ctrl.updateMasterDocument);
router.delete('/documents/:id',                 requireAuth, ctrl.deleteMasterDocument);

/* ── Chapters ────────────────────────────────────────────────── */
router.get   ('/documents/:id/chapters', requireAuth, ctrl.listChapters);
router.post  ('/documents/:id/chapters', requireAuth, ctrl.createChapter);
router.patch ('/chapters/:id',           requireAuth, ctrl.updateChapter);
router.delete('/chapters/:id',           requireAuth, ctrl.deleteChapter);

/* ── Exports ─────────────────────────────────────────────────── */
router.get  ('/projects/:projectId/exports', requireAuth, ctrl.listExports);
router.post ('/exports/:id/mark-ready',      requireAuth, ctrl.markExportReady);
router.get  ('/documents/:id/export.md',     requireAuth, ctrl.exportMasterAsMarkdown);

/* ── Chat ────────────────────────────────────────────────────── */
router.get  ('/projects/:projectId/threads/main', requireAuth, ctrl.getOrCreateMainThread);
router.get  ('/threads/:id/messages',             requireAuth, ctrl.listMessages);
router.post ('/threads/:id/messages',             requireAuth, ctrl.appendMessage);

/* ── Form templates ──────────────────────────────────────────── */
router.get ('/calls/:callId/form-templates', requireAuth, ctrl.listFormTemplates);
router.get ('/form-templates/:id',           requireAuth, ctrl.getFormTemplateFull);

/* ── CAG document sources (read-only inventory) ──────────────── */
// Uploads pasan por Admin → Plus Data (call docs) o Writer → Relevancia
// (project docs). Aquí solo se inventaría qué se cargaría al CAG.
router.get  ('/projects/:projectId/cag-documents', requireAuth, ctrl.listCagDocumentsForProject);

/* ── Diagnoses (read-only) ───────────────────────────────────── */
router.get ('/documents/:id/diagnoses', requireAuth, ctrl.listDiagnoses);
router.get ('/diagnoses/:id',           requireAuth, ctrl.getDiagnosis);

/* ── Placeholders LLM (devuelven 501 hasta que se conecten) ──── */
// Pipeline de generación con CAG — ver docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md
router.post('/documents/:id/compile-v1',          requireAuth, ctrl.compileMasterV1);
router.post('/documents/:id/regenerate',          requireAuth, ctrl.regenerateWithUnifiedContext);
router.post('/documents/:id/diagnose',            requireAuth, ctrl.runDiagnosis);
router.post('/documents/:id/score',               requireAuth, ctrl.computeScoreEstimate);
router.post('/documents/:id/compress-to-form',    requireAuth, ctrl.compressToForm);
router.post('/documents/:id/coherence-pass',      requireAuth, ctrl.coherencePass);

module.exports = router;
