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
const access = require('./access');

// Control de acceso (IDOR): solo el dueño del proyecto (o admin).
router.param('projectId', access.projectParam);
const { ownDocument, ownChapter, ownExport, ownThread, ownDiagnosis, ownDiagnosisItem } = access;

/* ── Documents ───────────────────────────────────────────────── */
router.get   ('/projects/:projectId/documents', requireAuth, ctrl.listMasterDocuments);
router.post  ('/projects/:projectId/documents', requireAuth, ctrl.createMasterDocument);
router.get   ('/documents/:id',                 requireAuth, ownDocument, ctrl.getMasterDocument);
router.patch ('/documents/:id',                 requireAuth, ownDocument, ctrl.updateMasterDocument);
router.delete('/documents/:id',                 requireAuth, ownDocument, ctrl.deleteMasterDocument);

/* ── Chapters ────────────────────────────────────────────────── */
router.get   ('/documents/:id/chapters', requireAuth, ownDocument, ctrl.listChapters);
router.post  ('/documents/:id/chapters', requireAuth, ownDocument, ctrl.createChapter);
router.patch ('/chapters/:id',           requireAuth, ownChapter, ctrl.updateChapter);
router.delete('/chapters/:id',           requireAuth, ownChapter, ctrl.deleteChapter);
router.post  ('/chapters/:id/refine',          requireAuth, ownChapter, ctrl.refineChapter);
router.post  ('/chapters/:id/propose-rewrite', requireAuth, ownChapter, ctrl.proposeRewrite);

/* ── Exports ─────────────────────────────────────────────────── */
router.get  ('/projects/:projectId/exports', requireAuth, ctrl.listExports);
router.post ('/exports/:id/mark-ready',      requireAuth, ownExport, ctrl.markExportReady);
router.get  ('/documents/:id/export.md',     requireAuth, ownDocument, ctrl.exportMasterAsMarkdown);

/* ── Chat ────────────────────────────────────────────────────── */
router.get  ('/projects/:projectId/threads/main', requireAuth, ctrl.getOrCreateMainThread);
router.get  ('/threads/:id/messages',             requireAuth, ownThread, ctrl.listMessages);
router.post ('/threads/:id/messages',             requireAuth, ownThread, ctrl.appendMessage);

/* ── Form templates ──────────────────────────────────────────── */
router.get ('/calls/:callId/form-templates', requireAuth, ctrl.listFormTemplates);
router.get ('/form-templates/:id',           requireAuth, ctrl.getFormTemplateFull);

/* ── CAG document sources (read-only inventory) ──────────────── */
// Uploads pasan por Admin → Plus Data (call docs) o Writer → Relevancia
// (project docs). Aquí solo se inventaría qué se cargaría al CAG.
router.get  ('/projects/:projectId/cag-documents', requireAuth, ctrl.listCagDocumentsForProject);

/* ── Diagnoses ───────────────────────────────────────────────── */
router.get  ('/documents/:id/diagnoses', requireAuth, ownDocument, ctrl.listDiagnoses);
router.get  ('/diagnoses/:id',           requireAuth, ownDiagnosis, ctrl.getDiagnosis);
router.post ('/diagnoses/:id/items',     requireAuth, ownDiagnosis, ctrl.createCustomDiagnosisItem);
router.patch('/diagnosis-items/:id',     requireAuth, ownDiagnosisItem, ctrl.patchDiagnosisItemState);

/* ── LLM pipelines ───────────────────────────────────────────── */
router.post('/documents/:id/compile-v1',          requireAuth, ownDocument, ctrl.compileMasterV1);
router.post('/documents/:id/regenerate',          requireAuth, ownDocument, ctrl.regenerateWithUnifiedContext);
router.post('/documents/:id/diagnose',            requireAuth, ownDocument, ctrl.runDiagnosis);
router.post('/documents/:id/score',               requireAuth, ownDocument, ctrl.computeScoreEstimate);
router.post('/documents/:id/compress-to-form',         requireAuth, ownDocument, ctrl.compressToForm);
router.post('/documents/:id/compress-field/:fieldId',  requireAuth, ownDocument, ctrl.compressSingleField);
router.post('/documents/:id/seed-form-from-master',    requireAuth, ownDocument, ctrl.seedFormFromMaster);
router.post('/documents/:id/coherence-pass',      requireAuth, ownDocument, ctrl.coherencePass);

module.exports = router;
