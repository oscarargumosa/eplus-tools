'use strict';

const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./controller');

router.get  ('/projects/:projectId/form-part-b/preview',   requireAuth, ctrl.previewFormPartB);
router.get  ('/projects/:projectId/form-part-b.docx',      requireAuth, ctrl.exportFormPartBDocx);
router.patch('/form-field-values/:instanceId/:fieldId',    requireAuth, ctrl.patchFormFieldValue);

module.exports = router;
