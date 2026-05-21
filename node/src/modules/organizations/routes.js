/* ── Organizations Routes — /v1/organizations/* ──────────────── */
const router = require('express').Router();
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

const auth = [requireAuth];

const logoStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../../public/uploads/logos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, 'logo-' + Date.now() + ext);
  }
});
const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files allowed'));
}});

/* ── My organization ─────────────────────────────────────────── */
router.get ('/mine',      auth, ctrl.getMyOrg);
router.get ('/mine/all',  auth, ctrl.getMyOrgs);
router.put ('/mine',      auth, ctrl.upsertMyOrg);
router.post('/mine/logo', auth, uploadLogo.single('logo'), ctrl.uploadLogo);

/* ── ORS lookup (prefill new-org form) ───────────────────────── */
router.post('/ors-lookup', auth, ctrl.orsLookup);

/* ── Adopt entity from directory (Intake consortium lupa) ───── */
router.post('/from-entity', auth, ctrl.fromEntity);

/* ── Coords (self-geolocate / pin manual) ───────────────────── */
router.patch('/:id/coords', auth, ctrl.updateCoords);

/* ── Directory ───────────────────────────────────────────────── */
router.get ('/',      auth, ctrl.listOrgs);
router.get ('/:id',   auth, ctrl.getOrg);

/* ── Child resources (accreditations, eu-projects, key-staff, stakeholders, associated-partners) */
router.get   ('/:orgId/:type',      auth, ctrl.listChildren);
router.post  ('/:orgId/:type',      auth, ctrl.addChild);
router.patch ('/:orgId/:type/:id',  auth, ctrl.updateChild);
router.delete('/:orgId/:type/:id',  auth, ctrl.deleteChild);

module.exports = router;
