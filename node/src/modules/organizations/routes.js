/* ── Organizations Routes — /v1/organizations/* ──────────────── */
const router = require('express').Router();
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

const auth = [requireAuth];

const logoStorage = multer.diskStorage({
  // Bajo /public de la raíz, que es lo que sirve express.static. Antes iba a
  // node/public/uploads y el logo subido salía roto (devolvía la portada).
  destination: path.join(__dirname, '../../../../public/uploads/logos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, 'logo-' + Date.now() + ext);
  }
});
const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files allowed'));
}});

// Documentación de la entidad (estatutos, escrituras, poderes…): privada.
const fs = require('fs');
const { CLAIM_DOCS_DIR } = require('./model');
fs.mkdirSync(CLAIM_DOCS_DIR, { recursive: true });
const claimDocStorage = multer.diskStorage({
  destination: CLAIM_DOCS_DIR,
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const uploadClaimDoc = multer({ storage: claimDocStorage, limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^(application\/pdf|image\/(jpeg|png|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Formato no admitido: sube PDF, imagen o Word'));
}});

/* ── My organization ─────────────────────────────────────────── */
router.get ('/mine',      auth, ctrl.getMyOrg);
router.get ('/mine/all',  auth, ctrl.getMyOrgs);
router.put ('/mine',      auth, ctrl.upsertMyOrg);
router.post('/mine/logo', auth, uploadLogo.single('logo'), ctrl.uploadLogo);

/* ── Reclamar entidad del directorio ───────────────────────────
   Van antes de '/:id' para que «claim» no se tome como un id. */
router.get ('/claim/search',  auth, ctrl.claimSearch);
router.post('/claim',         auth, ctrl.claim);
router.get ('/claim/disputes', auth, ctrl.listDisputes);
router.post('/:id/dispute',   auth, ctrl.dispute);
router.get   ('/:id/claim-docs',            auth, ctrl.listClaimDocs);
router.post  ('/:id/claim-docs',            auth, uploadClaimDoc.single('file'), ctrl.uploadClaimDoc);
router.get   ('/:id/claim-docs/:docId/file', auth, ctrl.downloadClaimDoc);
router.delete('/:id/claim-docs/:docId',     auth, ctrl.deleteClaimDoc);

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
