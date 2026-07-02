/* ── Admin Routes — /v1/admin/* ──────────────────────────────── */
const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

/* ── Admin guard middleware ───────────────────────────────────── */
// Allows 'admin' (full access) and 'scribe' (data-entry role for call info).
// Scribes can read/write all program/eligibility/eval/form data but cannot
// touch Documents, Subscribers, or Research-admin (those guards stay 'admin'-only).
function requireAdminOrScribe(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'scribe') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}

const guard = [requireAuth, requireAdminOrScribe];

// Stricter guard: admin only (scribes excluded). Protects the prompt inspector
// and prompt-block editor — the product IP must never reach a non-admin.
function requireAdminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}
const adminGuard = [requireAuth, requireAdminOnly];

/* ── Convocatorias (intake_programs) ─────────────────────────── */
router.get   ('/data/programs/full',   guard, ctrl.listProgramsWithCounts);
router.get   ('/data/programs',        guard, ctrl.listPrograms);
router.post  ('/data/programs',        guard, ctrl.upsertProgram);
router.post  ('/data/programs/import-from-feed', guard, ctrl.importProgramFromFeed);
router.post  ('/data/programs/:id/duplicate', guard, ctrl.duplicateProgram);
router.patch ('/data/programs/:id',    guard, ctrl.upsertProgram);
router.delete('/data/programs/:id',    guard, ctrl.deleteProgram);

/* ── Generate eval from form template ────────────────────────── */
router.post ('/data/programs/:programId/generate-eval', guard, ctrl.generateEvalFromTemplate);

/* ── Call documents (per programme) ──────────────────────────── */
router.get   ('/data/programs/:programId/docs',           guard, ctrl.listCallDocuments);
router.get   ('/data/programs/:programId/available-docs', guard, ctrl.availableCallDocuments);
router.get   ('/data/programs/:programId/cag-inventory',  guard, ctrl.getCagInventory);
router.post  ('/data/programs/:programId/docs',           guard, ctrl.createCallDocument);
router.post  ('/data/programs/:programId/docs/reorder',   guard, ctrl.reorderCallDocuments);
router.patch ('/data/call-docs/:id',                      guard, ctrl.updateCallDocumentOrder);
router.delete('/data/call-docs/:id',                      guard, ctrl.deleteCallDocument);

/* ── Países ───────────────────────────────────────────────────── */
router.get   ('/data/countries',       guard, ctrl.listCountries);
router.post  ('/data/countries',       guard, ctrl.upsertCountry);
router.patch ('/data/countries/:id',   guard, ctrl.upsertCountry);
router.delete('/data/countries/:id',   guard, ctrl.deleteCountry);

/* ── Tarifas per diem ─────────────────────────────────────────── */
router.get   ('/data/perdiem',         guard, ctrl.listPerdiem);
router.post  ('/data/perdiem',         guard, ctrl.upsertPerdiem);
router.patch ('/data/perdiem/:id',     guard, ctrl.upsertPerdiem);
router.delete('/data/perdiem/:id',     guard, ctrl.deletePerdiem);

/* ── Categorías de personal ───────────────────────────────────── */
router.get   ('/data/workers',         guard, ctrl.listWorkers);
router.post  ('/data/workers',         guard, ctrl.upsertWorker);
router.patch ('/data/workers/:id',     guard, ctrl.upsertWorker);
router.delete('/data/workers/:id',     guard, ctrl.deleteWorker);

/* ── Entidades ───────────────────────────────────────────────── */
router.get   ('/data/entities',        guard, ctrl.listEntities);
router.post  ('/data/entities',        guard, ctrl.upsertEntity);
router.patch ('/data/entities/:id',    guard, ctrl.upsertEntity);
router.delete('/data/entities/:id',    guard, ctrl.deleteEntity);

/* ── Worker matrix ───────────────────────────────────────────── */
router.get  ('/data/workers/matrix',       guard, ctrl.listWorkerMatrix);
router.patch('/data/workers/zone/:id',     guard, ctrl.upsertWorkerZoneRate);

/* ── Elegibilidad Erasmus+ ────────────────────────────────────── */
router.get('/data/eligibility',        guard, ctrl.listEligibility);
router.get('/data/eligibility/regions',guard, ctrl.listRegions);

/* ── Call eligibility (per programme) ────────────────────────── */
router.get  ('/data/eligibility/call/:programId', guard, ctrl.getCallEligibility);
router.put  ('/data/eligibility/call/:programId', guard, ctrl.upsertCallEligibility);

/* ── Evaluator (per program) ──────────────────────────────────── */
router.get   ('/data/eval/:programId',             guard, ctrl.getEvalTree);
router.post  ('/data/eval/:programId/import',      guard, ctrl.importEvalRules);
router.post  ('/data/eval/sections',               guard, ctrl.upsertEvalSection);
router.patch ('/data/eval/sections/:id',           guard, ctrl.upsertEvalSection);
router.delete('/data/eval/sections/:id',           guard, ctrl.deleteEvalSection);
router.post  ('/data/eval/questions',              guard, ctrl.upsertEvalQuestion);
router.patch ('/data/eval/questions/:id',          guard, ctrl.upsertEvalQuestion);
router.delete('/data/eval/questions/:id',          guard, ctrl.deleteEvalQuestion);
router.post  ('/data/eval/criteria',               guard, ctrl.upsertEvalCriterion);
router.patch ('/data/eval/criteria/:id',           guard, ctrl.upsertEvalCriterion);
router.delete('/data/eval/criteria/:id',           guard, ctrl.deleteEvalCriterion);

/* ── Form templates & instances ───────────────────────────────── */
router.get   ('/data/forms/templates',              guard, ctrl.listFormTemplates);
router.get   ('/data/forms/templates/:id',          guard, ctrl.getFormTemplate);
router.get   ('/data/forms/instances',              guard, ctrl.listFormInstances);
router.post  ('/data/forms/instances',              guard, ctrl.createFormInstance);
router.get   ('/data/forms/instances/:id',          guard, ctrl.getFormInstance);
router.get   ('/data/forms/instances/:id/values',   guard, ctrl.getFormValues);
router.put   ('/data/forms/instances/:id/values',   guard, ctrl.saveFormValues);
router.patch ('/data/forms/instances/:id',          guard, ctrl.updateFormInstance);
router.delete('/data/forms/instances/:id',          guard, ctrl.deleteFormInstance);

/* ── TASK-008 · Prompt inspector + prompt blocks (admin-only) ──── */
router.get  ('/inspector/generations',        adminGuard, ctrl.listGenerations);
router.get  ('/inspector/generations/:id',    adminGuard, ctrl.getGeneration);
router.get  ('/inspector/projects/:projectId/facts', adminGuard, ctrl.listProjectFactsAdmin);
router.get  ('/prompt-blocks',                adminGuard, ctrl.listPromptBlocks);
router.get  ('/prompt-blocks/:name',          adminGuard, ctrl.getPromptBlock);
router.put  ('/prompt-blocks/:name',          adminGuard, ctrl.upsertPromptBlock);

module.exports = router;
