/* ── Diagnose Routes — /v1/diagnose/* ───────────────────────────────────
   Admin endpoints over pattern_library, evaluation_letters and evaluation_findings.
   Plus user endpoints: /run, /runs/:id, /upload-proposal, /paste-proposal.
*/
const router = require('express').Router();
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },  // 50MB
});

function requireAdminOrScribe(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'scribe') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}

const guard = [requireAuth, requireAdminOrScribe];

/* ── Patterns ────────────────────────────────────────────────────────── */
// All patterns (admin overview). Pass ?all=1 to include inactive.
router.get('/patterns',                          guard, ctrl.listPatterns);
// Patterns applicable to a specific call (intake_programs.id UUID).
router.get('/patterns/by-call/:callId',          guard, ctrl.listPatternsForCall);
// Patterns by external programme code (intake_programs.program_id VARCHAR).
router.get('/patterns/by-programme/:programmeCode', guard, ctrl.listPatternsByProgrammeCode);

/* ── Letters & findings (audit trail) ────────────────────────────────── */
router.get('/letters',                           guard, ctrl.listLetters);
router.get('/letters/:id',                       guard, ctrl.getLetter);

/* ── Stats (dashboard) ────────────────────────────────────────────────── */
router.get('/stats',                             guard, ctrl.getStats);

/* ── Diagnose runs (Fase 2) ──────────────────────────────────────────── */
// Any authenticated user can run/read diagnoses on projects they own.
// The engine validates ownership through the project_id chain.
router.post('/run',                              requireAuth, ctrl.runDiagnosis);
router.get('/runs/:runId',                       requireAuth, ctrl.getRun);
router.get('/runs/project/:projectId/latest',    requireAuth, ctrl.getLatestRunForProject);

/* ── Import proposal (Fase 3) ────────────────────────────────────────── */
// Door B (audit) / Door C (recycling): user uploads an external Form Part B.
// We create a new imported project and parse the Word into form_field_values.
router.post('/upload-proposal',                  requireAuth, upload.single('file'), ctrl.uploadProposal);
router.post('/paste-proposal',                   requireAuth, ctrl.pasteProposal);

/* ── Upload evaluator letter (Fase 4) ────────────────────────────────── */
// Door C premium: user uploads the EACEA evaluator letter for an existing
// project (sets projects.source_evaluation_id) so Pass D directs improvement.
router.post('/upload-letter',                    requireAuth, upload.single('file'), ctrl.uploadLetter);
router.post('/paste-letter',                     requireAuth, ctrl.pasteLetter);

module.exports = router;
