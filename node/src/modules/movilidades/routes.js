/* ── Movilidades Routes — /v1/movilidades/* ─────────────────────────── */
const router = require('express').Router();
const { optionalAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

router.get('/', optionalAuth, ctrl.list);

module.exports = router;
