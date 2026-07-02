/* ── Admin Controller ─────────────────────────────────────────── */
const m = require('./model');
const wrap = require('../../utils/asyncHandler');

const ok  = (res, data) => res.json({ ok: true, data });

/* ── Programs ─────────────────────────────────────────────────── */
exports.listPrograms  = wrap(async (req, res) => { ok(res, await m.listPrograms()); });
exports.upsertProgram = wrap(async (req, res) => { ok(res, { id: await m.upsertProgram(req.body, req.params.id || null) }); });
exports.deleteProgram = wrap(async (req, res) => { await m.deleteProgram(req.params.id); ok(res, null); });
exports.importProgramFromFeed = wrap(async (req, res) => {
  const sourceId = (req.body?.source_id || '').trim();
  if (!sourceId) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'source_id required' } });
  ok(res, await m.importProgramFromFeed(sourceId));
});

/* ── Countries ────────────────────────────────────────────────── */
exports.listCountries  = wrap(async (req, res) => { ok(res, await m.listCountries(req.query)); });
exports.upsertCountry  = wrap(async (req, res) => { ok(res, { id: await m.upsertCountry(req.body, req.params.id || null) }); });
exports.deleteCountry  = wrap(async (req, res) => { await m.deleteCountry(req.params.id); ok(res, null); });

/* ── Per diem rates ───────────────────────────────────────────── */
exports.listPerdiem   = wrap(async (req, res) => { ok(res, await m.listPerdiem()); });
exports.upsertPerdiem = wrap(async (req, res) => { ok(res, { id: await m.upsertPerdiem(req.body, req.params.id || null) }); });
exports.deletePerdiem = wrap(async (req, res) => { await m.deletePerdiem(req.params.id); ok(res, null); });

/* ── Worker categories ────────────────────────────────────────── */
exports.listWorkers   = wrap(async (req, res) => { ok(res, await m.listWorkerCategories()); });
exports.upsertWorker  = wrap(async (req, res) => { ok(res, { id: await m.upsertWorkerCategory(req.body, req.params.id || null) }); });
exports.deleteWorker  = wrap(async (req, res) => { await m.deleteWorkerCategory(req.params.id); ok(res, null); });

/* ── Entities ────────────────────────────────────────────────── */
exports.listEntities    = wrap(async (req, res) => { ok(res, await m.listEntities(req.query.q)); });
exports.upsertEntity    = wrap(async (req, res) => { ok(res, { id: await m.upsertEntity(req.body, req.params.id || null) }); });
exports.deleteEntity    = wrap(async (req, res) => { await m.deleteEntity(req.params.id); ok(res, null); });

/* ── Eligibility (countries by region) ────────────────────────── */
exports.listEligibility = wrap(async (req, res) => {
  const { type, region } = req.query;
  ok(res, await m.listEligibility({ type, region }));
});
exports.listRegions = wrap(async (req, res) => { ok(res, await m.listRegions()); });

/* ── Call eligibility (per programme) ────────────────────────── */
exports.getCallEligibility    = wrap(async (req, res) => { ok(res, await m.getCallEligibility(req.params.programId)); });
exports.upsertCallEligibility = wrap(async (req, res) => { ok(res, { id: await m.upsertCallEligibility(req.params.programId, req.body) }); });

/* ── Worker matrix ────────────────────────────────────────────── */
exports.listWorkerMatrix    = wrap(async (req, res) => { ok(res, await m.listWorkerMatrix()); });
exports.upsertWorkerZoneRate = wrap(async (req, res) => { await m.upsertWorkerZoneRate(req.params.id, req.body.rate_day); ok(res, null); });

/* ── Evaluator (per program) ──────────────────────────────────── */
exports.getEvalTree         = wrap(async (req, res) => { ok(res, await m.getEvalTree(req.params.programId)); });
exports.upsertEvalSection   = wrap(async (req, res) => { ok(res, { id: await m.upsertEvalSection(req.body, req.params.id || null) }); });
exports.deleteEvalSection   = wrap(async (req, res) => { await m.deleteEvalSection(req.params.id); ok(res, null); });
exports.upsertEvalQuestion  = wrap(async (req, res) => { ok(res, { id: await m.upsertEvalQuestion(req.body, req.params.id || null) }); });
exports.deleteEvalQuestion  = wrap(async (req, res) => { await m.deleteEvalQuestion(req.params.id); ok(res, null); });
exports.upsertEvalCriterion = wrap(async (req, res) => { ok(res, { id: await m.upsertEvalCriterion(req.body, req.params.id || null) }); });
exports.deleteEvalCriterion = wrap(async (req, res) => { await m.deleteEvalCriterion(req.params.id); ok(res, null); });
exports.importEvalRules     = wrap(async (req, res) => { await m.importEvalRules(req.params.programId, req.body); ok(res, null); });

/* ── Generate eval from template ──────────────────────────────── */
exports.generateEvalFromTemplate = wrap(async (req, res) => {
  ok(res, await m.generateEvalFromTemplate(req.params.programId, req.body.template_id));
});

/* ── Call documents ───────────────────────────────────────────── */
exports.listCallDocuments   = wrap(async (req, res) => { ok(res, await m.listCallDocuments(req.params.programId)); });
exports.createCallDocument  = wrap(async (req, res) => {
  const { document_id, doc_type, label } = req.body;
  ok(res, { id: await m.createCallDocument(req.params.programId, document_id, doc_type, label) });
});
exports.deleteCallDocument  = wrap(async (req, res) => { await m.deleteCallDocument(req.params.id); ok(res, null); });
exports.availableCallDocuments = wrap(async (req, res) => { ok(res, await m.availableCallDocuments(req.params.programId)); });

/* ── CAG inventory & priority ─────────────────────────────────── */
exports.getCagInventory = wrap(async (req, res) => { ok(res, await m.getCagInventory(req.params.programId)); });
exports.updateCallDocumentOrder = wrap(async (req, res) => {
  const sortOrder = parseInt(req.body.sort_order, 10);
  if (!Number.isFinite(sortOrder)) return res.status(400).json({ ok: false, error: 'sort_order is required (number)' });
  await m.updateCallDocumentOrder(req.params.id, sortOrder);
  ok(res, null);
});
exports.reorderCallDocuments = wrap(async (req, res) => {
  const hasIds = Array.isArray(req.body.ids);
  const hasItems = Array.isArray(req.body.items);
  if (!hasIds && !hasItems) return res.status(400).json({ ok: false, error: 'ids[] or items[] is required' });
  const n = await m.reorderCallDocuments(req.params.programId, req.body);
  ok(res, { updated: n });
});

/* ── Duplicate programme ─────────────────────────────────────── */
exports.duplicateProgram = wrap(async (req, res) => { ok(res, await m.duplicateProgram(req.params.id)); });

/* ── Programmes with counts ──────────────────────────────────── */
exports.listProgramsWithCounts = wrap(async (req, res) => { ok(res, await m.listProgramsWithCounts()); });

/* ── Form templates & instances ──────────────────────────────── */
exports.listFormTemplates  = wrap(async (req, res) => { ok(res, await m.listFormTemplates()); });
exports.getFormTemplate    = wrap(async (req, res) => { ok(res, await m.getFormTemplate(req.params.id)); });
exports.listFormInstances  = wrap(async (req, res) => { ok(res, await m.listFormInstances(req.query)); });
exports.createFormInstance  = wrap(async (req, res) => { ok(res, await m.createFormInstance(req.body)); });
exports.getFormInstance     = wrap(async (req, res) => { ok(res, await m.getFormInstance(req.params.id)); });
exports.getFormValues       = wrap(async (req, res) => { ok(res, await m.getFormValues(req.params.id)); });
exports.saveFormValues      = wrap(async (req, res) => { await m.saveFormValues(req.params.id, req.body.values); ok(res, null); });
exports.updateFormInstance  = wrap(async (req, res) => { await m.updateFormInstance(req.params.id, req.body); ok(res, null); });
exports.deleteFormInstance  = wrap(async (req, res) => { await m.deleteFormInstance(req.params.id); ok(res, null); });

/* ── TASK-008 · Prompt inspector + prompt blocks (admin-only) ──────
   Reads the developer model. Prompts NEVER reach a non-admin: these
   handlers sit behind requireAdminOnly in routes.js. */
const dev = require('../developer/model');

exports.listGenerations = wrap(async (req, res) => {
  ok(res, await dev.listGenerations({
    projectId: req.query.project_id || null,
    kind: req.query.kind || null,
    sectionId: req.query.section_id || null,
    limit: req.query.limit || 50,
  }));
});
exports.getGeneration  = wrap(async (req, res) => { ok(res, await dev.getGeneration(req.params.id)); });
exports.listProjectFactsAdmin = wrap(async (req, res) => { ok(res, await dev.listProjectFacts(req.params.projectId, req.query.status || null)); });

exports.listPromptBlocks = wrap(async (req, res) => { ok(res, await dev.listPromptBlocks()); });
exports.getPromptBlock   = wrap(async (req, res) => { ok(res, await dev.getPromptBlockFull(req.params.name, req.query.program_id || null)); });
exports.upsertPromptBlock = wrap(async (req, res) => {
  const { content, program_id } = req.body || {};
  ok(res, await dev.upsertPromptBlock(req.params.name, program_id || null, content || '', req.user.id));
});
