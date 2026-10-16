/* ── Organizations Routes — /v1/organizations/* ──────────────── */
const router = require('express').Router();
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');
const { imageUploadGuard } = require('../../utils/image-upload');

const auth = [requireAuth];

const logoStorage = multer.diskStorage({
  // Bajo /public de la raíz, que es lo que sirve express.static. Antes iba a
  // node/public/uploads y el logo subido salía roto (devolvía la portada).
  destination: path.join(__dirname, '../../../../public/uploads/logos'),
  filename: (req, file, cb) => {
    // Sin extensión del cliente: imageUploadGuard pone la del tipo real
    cb(null, 'logo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  }
});
const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
  else cb(Object.assign(new Error('Only image files allowed (JPG, PNG, WebP, GIF)'), { status: 400 }));
}});

// Documentación de la entidad (estatutos, escrituras, poderes…): PRIVADA.
// Vive en CLAIM_DOCS_DIR (node/private/org-claims u ORG_CLAIM_DOCS_DIR; en
// producción /app/node/private es un volumen), nunca bajo public/, y solo
// sale por GET /:id/claim-docs/:docId/file para el dueño o un admin.
// El tipo real se comprueba por bytes en el controlador, que pone la extensión.
const fs = require('fs');
const { CLAIM_DOCS_DIR } = require('./model');
const claimDocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdir(CLAIM_DOCS_DIR, { recursive: true }, (e) => cb(e || null, CLAIM_DOCS_DIR));
  },
  filename: (req, file, cb) => {
    cb(null, 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  }
});
const uploadClaimDoc = multer({ storage: claimDocStorage, limits: { fileSize: 15 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => {
  if (/^(application\/pdf|image\/(jpeg|png|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/.test(file.mimetype)) cb(null, true);
  else cb(Object.assign(new Error('Formato no admitido: sube PDF, imagen o Word'), { status: 400 }));
}});

/* ── My organization ─────────────────────────────────────────── */
router.get ('/mine',      auth, ctrl.getMyOrg);
router.get ('/mine/all',  auth, ctrl.getMyOrgs);
router.put ('/mine',      auth, ctrl.upsertMyOrg);
router.post('/mine/logo', auth, uploadLogo.single('logo'), imageUploadGuard(), ctrl.uploadLogo);

/* ── Reclamar entidad del directorio ───────────────────────────
   Van antes de '/:id' para que «claim» no se tome como un id.
   Son de cuenta y entidades: libres para cualquier usuario registrado
   (sin área beta). La revisión de documentos está en /v1/admin/org-claims. */
router.get ('/claim/search',  auth, ctrl.claimSearch);
router.post('/claim',         auth, ctrl.claim);
router.post('/claim/dispute', auth, ctrl.dispute);
router.get   ('/:id/claim-docs',            auth, ctrl.listClaimDocs);
router.post  ('/:id/claim-docs',            auth, ctrl.requireClaimOwner, uploadClaimDoc.single('file'), ctrl.uploadClaimDoc);
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
