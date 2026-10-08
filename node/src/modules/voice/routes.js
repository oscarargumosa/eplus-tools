const router  = require('express').Router();
const multer  = require('multer');
const { requireAuth } = require('../../middleware/auth');
const { aiLimit } = require('../../middleware/aiLimit');
const ctrl = require('./controller');

// Audio en memoria (máx. 25 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get('/status', requireAuth, ctrl.status);
router.post('/transcribe', requireAuth, aiLimit, upload.single('audio'), ctrl.transcribe);

module.exports = router;
