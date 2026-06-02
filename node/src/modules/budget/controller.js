/* ── Budget Controller ────────────────────────────────────────── */
const m = require('./model');
const { exportBudgetBuffer } = require('./export');
const { buildEaceaTables } = require('./eacea-tables');

const ok  = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 400) =>
  res.status(status).json({ ok: false, error: { message: msg } });

/* ── Budget CRUD ─────────────────────────────────────────────── */

exports.create = async (req, res) => {
  try {
    const result = await m.createBudget({ userId: req.user.id, ...req.body });
    ok(res, result);
  } catch (e) { err(res, e.message, 500); }
};

exports.list = async (req, res) => {
  try { ok(res, await m.listBudgets(req.user.id)); }
  catch (e) { err(res, e.message, 500); }
};

exports.get = async (req, res) => {
  try {
    const b = await m.getBudget(req.params.id, req.user.id);
    if (!b) return err(res, 'Not found', 404);
    ok(res, b);
  } catch (e) { err(res, e.message, 500); }
};

exports.update = async (req, res) => {
  try {
    const b = await m.getBudget(req.params.id, req.user.id);
    if (!b) return err(res, 'Not found', 404);
    await m.updateBudget(req.params.id, req.body);
    ok(res, { updated: true });
  } catch (e) { err(res, e.message, 500); }
};

exports.remove = async (req, res) => {
  try {
    const b = await m.getBudget(req.params.id, req.user.id);
    if (!b) return err(res, 'Not found', 404);
    await m.deleteBudget(req.params.id);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Full budget tree ────────────────────────────────────────── */

exports.getFull = async (req, res) => {
  try {
    const b = await m.getBudget(req.params.id, req.user.id);
    if (!b) return err(res, 'Not found', 404);
    ok(res, await m.getFullBudget(req.params.id));
  } catch (e) { err(res, e.message, 500); }
};

/* ── Beneficiaries ───────────────────────────────────────────── */

exports.listBeneficiaries = async (req, res) => {
  try { ok(res, await m.listBeneficiaries(req.params.id)); }
  catch (e) { err(res, e.message, 500); }
};

exports.addBeneficiary = async (req, res) => {
  try {
    const result = await m.addBeneficiary(req.params.id, req.body);
    ok(res, result);
  } catch (e) { err(res, e.message, 500); }
};

exports.updateBeneficiary = async (req, res) => {
  try {
    await m.updateBeneficiary(req.params.benId, req.body);
    ok(res, { updated: true });
  } catch (e) { err(res, e.message, 500); }
};

exports.deleteBeneficiary = async (req, res) => {
  try {
    await m.deleteBeneficiary(req.params.benId);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Work Packages ───────────────────────────────────────────── */

exports.listWorkPackages = async (req, res) => {
  try { ok(res, await m.listWorkPackages(req.params.id)); }
  catch (e) { err(res, e.message, 500); }
};

exports.addWorkPackage = async (req, res) => {
  try {
    const result = await m.addWorkPackage(req.params.id, req.body);
    ok(res, result);
  } catch (e) { err(res, e.message, 500); }
};

exports.updateWorkPackage = async (req, res) => {
  try {
    await m.updateWorkPackage(req.params.wpId, req.body);
    ok(res, { updated: true });
  } catch (e) { err(res, e.message, 500); }
};

exports.deleteWorkPackage = async (req, res) => {
  try {
    await m.deleteWorkPackage(req.params.wpId);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Cost Lines ──────────────────────────────────────────────── */

exports.getCosts = async (req, res) => {
  try {
    const { beneficiary_id, wp_id } = req.query;
    ok(res, await m.getCostLines(req.params.id, beneficiary_id, wp_id));
  } catch (e) { err(res, e.message, 500); }
};

exports.updateCost = async (req, res) => {
  try {
    const result = await m.updateCostLine(req.params.costId, req.body);
    ok(res, result);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Cost template (for frontend reference) ──────────────────── */
exports.getCostTemplate = (req, res) => {
  ok(res, m.COST_TEMPLATE);
};

/* ── Export to EACEA Excel template ─────────────────────────── */
exports.exportExcel = async (req, res) => {
  try {
    const b = await m.getBudget(req.params.id, req.user.id);
    if (!b) return err(res, 'Not found', 404);
    const full = await m.getFullBudget(req.params.id);
    const buf = exportBudgetBuffer(full);
    const safeName = (b.name || 'budget').replace(/[^a-z0-9_\-]+/gi, '_').substring(0, 40);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_EACEA.xlsx"`);
    res.send(buf);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Lookup budget by project id ─────────────────────────────── */
exports.getByProject = async (req, res) => {
  try {
    const b = await m.getBudgetByProject(req.params.projectId, req.user.id);
    if (!b) return err(res, 'No budget for this project', 404);
    ok(res, b);
  } catch (e) { err(res, e.message, 500); }
};

/* ── EACEA Form Part B tables (single source of truth) ───────
   Used by Calculator (Resumen → Form Part B tab), Developer
   (Escribir), Master (Perfeccionar → Preparar formulario) and
   the .docx exporter. */
exports.getEaceaTables = async (req, res) => {
  try {
    const t = await buildEaceaTables(req.params.projectId, req.user.id);
    ok(res, t);
  } catch (e) { err(res, e.message, e.status || 500); }
};

/* ── Create from intake ─────────────────────────────────────── */
exports.createFromIntake = async (req, res) => {
  try {
    const result = await m.createFromIntake(req.user.id, req.params.projectId);
    ok(res, result);
  } catch (e) { err(res, e.message, 500); }
};
