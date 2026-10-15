/* ── Movilidades Routes — /v1/movilidades/* ─────────────────────────── */
const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

router.get('/', requireAuth, ctrl.list);

module.exports = router;
