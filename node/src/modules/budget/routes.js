/* ── Budget Routes — /v1/budget/* ─────────────────────────────── */
const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

/* ── Budget CRUD ─────────────────────────────────────────────── */
router.post  ('/from-intake/:projectId', requireAuth, ctrl.createFromIntake);
router.post  ('/',           requireAuth, ctrl.create);
router.get   ('/',           requireAuth, ctrl.list);
router.get   ('/cost-template', requireAuth, ctrl.getCostTemplate);
router.get   ('/:id',        requireAuth, ctrl.get);
router.get   ('/:id/full',   requireAuth, ctrl.getFull);
router.patch ('/:id',        requireAuth, ctrl.update);
router.delete('/:id',        requireAuth, ctrl.remove);

/* ── Beneficiaries ───────────────────────────────────────────── */
router.get   ('/:id/beneficiaries',          requireAuth, ctrl.listBeneficiaries);
router.post  ('/:id/beneficiaries',          requireAuth, ctrl.addBeneficiary);
router.patch ('/:id/beneficiaries/:benId',   requireAuth, ctrl.updateBeneficiary);
router.delete('/:id/beneficiaries/:benId',   requireAuth, ctrl.deleteBeneficiary);

/* ── Work Packages ───────────────────────────────────────────── */
router.get   ('/:id/work-packages',          requireAuth, ctrl.listWorkPackages);
router.post  ('/:id/work-packages',          requireAuth, ctrl.addWorkPackage);
router.patch ('/:id/work-packages/:wpId',    requireAuth, ctrl.updateWorkPackage);
router.delete('/:id/work-packages/:wpId',    requireAuth, ctrl.deleteWorkPackage);

/* ── Cost Lines ──────────────────────────────────────────────── */
router.get   ('/:id/costs',                  requireAuth, ctrl.getCosts);
router.patch ('/costs/:costId',              requireAuth, ctrl.updateCost);

/* ── Export ──────────────────────────────────────────────────── */
router.get   ('/:id/export-excel',                  requireAuth, ctrl.exportExcel);
router.get   ('/by-project/:projectId',             requireAuth, ctrl.getByProject);

/* ── EACEA Form Part B unified tables ────────────────────────── */
router.get   ('/projects/:projectId/eacea-tables',  requireAuth, ctrl.getEaceaTables);

module.exports = router;
