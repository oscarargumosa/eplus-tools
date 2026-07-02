const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

// Project context (read from intake data)
router.get('/projects/:projectId/context', requireAuth, ctrl.getContext);

// Form instance
router.post('/projects/:projectId/instance', requireAuth, ctrl.getOrCreateInstance);
router.get('/instances/:id', requireAuth, ctrl.getInstance);
router.patch('/instances/:id/status', requireAuth, ctrl.updateStatus);

// Field values
router.get('/instances/:id/values', requireAuth, ctrl.getValues);
router.put('/instances/:id/values', requireAuth, ctrl.saveValues);
router.put('/instances/:id/field', requireAuth, ctrl.saveField);

// AI generation & evaluation
router.post('/instances/:id/generate', requireAuth, ctrl.generateDraft);
router.post('/instances/:id/evaluate', requireAuth, ctrl.evaluateField);
router.post('/instances/:id/improve', requireAuth, ctrl.improveField);
router.post('/instances/:id/improve-custom', requireAuth, ctrl.improveFieldCustom);
router.post('/instances/:id/refine', requireAuth, ctrl.refineField);
router.post('/instances/:id/refine/evaluate', requireAuth, ctrl.refineEvaluate);
router.post('/instances/:id/refine/apply', requireAuth, ctrl.refineApply);

// National-Agency copy-paste report (on-screen Q/A + Word export)
router.get('/instances/:id/eform-answers', requireAuth, ctrl.getEformAnswers);
router.get('/instances/:id/eform-export.docx', requireAuth, ctrl.exportEformDocx);

// Eval criteria (read-only)
router.get('/eval-criteria', requireAuth, ctrl.getEvalCriteria);

// Prep Studio: Interview
router.get('/projects/:projectId/interview', requireAuth, ctrl.getInterview);
router.post('/projects/:projectId/interview/generate', requireAuth, ctrl.generateInterviewQuestions);
router.put('/projects/:projectId/interview/:key', requireAuth, ctrl.saveInterviewAnswer);

// Prep Studio: Research docs upload
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
router.get('/projects/:projectId/research-docs', requireAuth, ctrl.getResearchDocs);
router.post('/projects/:projectId/research-docs', requireAuth, upload.single('file'), ctrl.uploadResearchDoc);
router.delete('/projects/:projectId/research-docs/:docId', requireAuth, ctrl.deleteResearchDoc);

// Prep Studio: Gap analysis
router.get('/projects/:projectId/gap-analysis', requireAuth, ctrl.getGapAnalysis);

// Prep Studio v2: 5-tab context
router.get('/projects/:projectId/prep/consorcio', requireAuth, ctrl.getPrepConsorcio);
router.put('/projects/:projectId/partners/:partnerId/link-org', requireAuth, ctrl.linkPartnerOrg);
router.post('/projects/:projectId/prep/consorcio/:partnerId/generate-variant', requireAuth, ctrl.generatePifVariant);
router.put('/projects/:projectId/prep/consorcio/:partnerId/select-variant', requireAuth, ctrl.selectPifVariant);
router.put('/projects/:projectId/prep/consorcio/:partnerId/custom-text', requireAuth, ctrl.savePartnerCustomText);
router.put('/projects/:projectId/prep/consorcio/:partnerId/toggle-eu-project', requireAuth, ctrl.toggleEuProject);
router.put('/projects/:projectId/prep/consorcio/:partnerId/staff-skills', requireAuth, ctrl.saveStaffCustomSkills);
router.put('/projects/:projectId/prep/consorcio/:partnerId/toggle-staff', requireAuth, ctrl.toggleStaffSelected);
router.put('/projects/:projectId/prep/consorcio/:partnerId/staff-role', requireAuth, ctrl.setStaffProjectRole);
router.post('/projects/:projectId/prep/consorcio/:partnerId/extra-staff', requireAuth, ctrl.addExtraStaff);
router.put('/projects/:projectId/prep/consorcio/:partnerId/extra-staff/:staffId', requireAuth, ctrl.updateExtraStaff);
router.delete('/projects/:projectId/prep/consorcio/:partnerId/extra-staff/:staffId', requireAuth, ctrl.removeExtraStaff);
router.post('/projects/:projectId/prep/consorcio/connection/improve', requireAuth, ctrl.improveConsortiumConnection);
router.get('/projects/:projectId/prep/presupuesto', requireAuth, ctrl.getPrepPresupuesto);
router.get('/projects/:projectId/prep/relevancia', requireAuth, ctrl.getPrepRelevancia);
router.put('/projects/:projectId/prep/relevancia/context', requireAuth, ctrl.updatePrepRelevanciaContext);
router.post('/projects/:projectId/prep/relevancia/generate-draft', requireAuth, ctrl.generateRelevanciaFieldDraft);
router.post('/projects/:projectId/prep/relevancia/chat', requireAuth, ctrl.chatRelevanciaField);
router.get('/projects/:projectId/prep/actividades', requireAuth, ctrl.getPrepActividades);
router.put('/wp/:wpId/summary', requireAuth, ctrl.updateWpSummary);
router.put('/activity/:activityId/description', requireAuth, ctrl.updateActivityDescription);
router.post('/projects/:projectId/prep/wp/:wpId/generate-summary', requireAuth, ctrl.generateWpSummaryDraft);
router.post('/projects/:projectId/prep/wp/:wpId/improve-summary', requireAuth, ctrl.improveWpSummary);
router.post('/projects/:projectId/prep/activity/:activityId/generate-description', requireAuth, ctrl.generateActivityDescriptionDraft);
router.post('/projects/:projectId/prep/activity/:activityId/improve-description', requireAuth, ctrl.improveActivityDescription);

// Writer Phase 2 — per-WP structured tables (milestones + deliverables)
router.get   ('/wp/:wpId/milestones',   requireAuth, ctrl.listMilestones);
router.post  ('/wp/:wpId/milestones',   requireAuth, ctrl.createMilestone);
router.patch ('/milestones/:id',        requireAuth, ctrl.updateMilestone);
router.delete('/milestones/:id',        requireAuth, ctrl.deleteMilestone);
router.get   ('/wp/:wpId/deliverables', requireAuth, ctrl.listDeliverables);
router.post  ('/wp/:wpId/deliverables', requireAuth, ctrl.createDeliverable);
router.patch ('/deliverables/:id',      requireAuth, ctrl.updateDeliverable);
router.delete('/deliverables/:id',      requireAuth, ctrl.deleteDeliverable);

// Writer Phase 3 — full WP form (Application Form Part B section 4.2)
router.get   ('/wp/:wpId/header',                          requireAuth, ctrl.getWpHeader);
router.put   ('/wp/:wpId/header',                          requireAuth, ctrl.updateWpHeader);
router.get   ('/wp/:wpId/tasks',                           requireAuth, ctrl.listWpTasks);
router.post  ('/wp/:wpId/tasks',                           requireAuth, ctrl.createWpTask);
router.patch ('/tasks/:id',                                requireAuth, ctrl.updateWpTask);
router.delete('/tasks/:id',                                requireAuth, ctrl.deleteWpTask);
router.put   ('/tasks/:id/participants/:partnerId',        requireAuth, ctrl.setTaskParticipant);
router.delete('/tasks/:id/participants/:partnerId',        requireAuth, ctrl.removeTaskParticipant);
router.get   ('/wp/:wpId/budget',                          requireAuth, ctrl.getWpBudget);
router.post  ('/projects/:projectId/budget/refresh',       requireAuth, ctrl.refreshProjectBudget);
router.get   ('/projects/:projectId/partners',             requireAuth, ctrl.listProjectPartners);
router.post  ('/wp/:wpId/ai-fill',                         requireAuth, ctrl.aiFillWp);
router.post  ('/wp/:wpId/tasks/resync',                    requireAuth, ctrl.resyncWpTasks);

// Project-level Deliverables & Milestones (Phase 4)
router.get   ('/projects/:projectId/deliverables',         requireAuth, ctrl.listProjectDeliverables);
router.get   ('/projects/:projectId/milestones',           requireAuth, ctrl.listProjectMilestones);
router.get   ('/projects/:projectId/deliverables/summary', requireAuth, ctrl.getDeliverableSummary);
// v2 holistic generator (3-pass: plan → copy → critic)
router.post  ('/projects/:projectId/deliverables-milestones/preview-v2',   requireAuth, ctrl.dmsPreviewV2);
router.post  ('/projects/:projectId/deliverables-milestones/apply-v2',     requireAuth, ctrl.dmsApplyV2);
router.get   ('/projects/:projectId/deliverables-milestones/programme',    requireAuth, ctrl.dmsProgrammeMeta);
router.get   ('/projects/:projectId/dms/tasks',                            requireAuth, ctrl.dmsListTasks);
router.get   ('/projects/:projectId/deliverables-milestones/validate',     requireAuth, ctrl.dmsValidate);
router.post  ('/projects/:projectId/deliverables-milestones/autolink',     requireAuth, ctrl.dmsAutolink);
router.post  ('/projects/:projectId/deliverables-milestones/apply-fixes',  requireAuth, ctrl.dmsApplyFixes);
router.post  ('/deliverables/:id/regenerate',                              requireAuth, ctrl.dmsRegenerateDeliverable);

// Snapshots, audit log, exports
router.get   ('/projects/:projectId/dms/snapshots',     requireAuth, ctrl.dmsListSnapshots);
router.post  ('/dms/snapshots/:id/restore',             requireAuth, ctrl.dmsRestoreSnapshot);
router.get   ('/projects/:projectId/dms/ai-history',    requireAuth, ctrl.dmsAiHistory);
router.get   ('/projects/:projectId/dms/export.csv',    requireAuth, ctrl.dmsExportCsv);

// 2.1.3 Project teams — editable staff table (rows = project_partner_staff selected=1)
router.get   ('/projects/:projectId/staff-table',       requireAuth, ctrl.listStaffTable);
router.patch ('/staff-table/:ppsId',                    requireAuth, ctrl.updateStaffTable);

// 2.1.5 Project risks — CRUD + AI bulk generator
router.get   ('/projects/:projectId/risks',             requireAuth, ctrl.listRisks);
router.post  ('/projects/:projectId/risks',             requireAuth, ctrl.createRisk);
router.post  ('/projects/:projectId/risks/ai-generate', requireAuth, ctrl.aiGenerateRisks);
router.post  ('/projects/:projectId/risks/ai-evaluate', requireAuth, ctrl.aiEvaluateRisks);
router.patch ('/risks/:id',                             requireAuth, ctrl.updateRisk);
router.delete('/risks/:id',                             requireAuth, ctrl.deleteRisk);

// TASK-008 — Facts ledger (user surface: own data only, never prompts)
router.get   ('/projects/:projectId/facts',          requireAuth, ctrl.listFacts);
router.post  ('/projects/:projectId/facts',          requireAuth, ctrl.upsertFact);
router.patch ('/projects/:projectId/facts/:factId',  requireAuth, ctrl.setFactStatus);

// Comments thread on D / MS rows
router.get   ('/projects/:projectId/dms/comments',  requireAuth, ctrl.dmsListComments);
router.post  ('/projects/:projectId/dms/comments',  requireAuth, ctrl.dmsCreateComment);
router.patch ('/dms/comments/:id',                  requireAuth, ctrl.dmsUpdateComment);
router.delete('/dms/comments/:id',                  requireAuth, ctrl.dmsDeleteComment);

module.exports = router;
