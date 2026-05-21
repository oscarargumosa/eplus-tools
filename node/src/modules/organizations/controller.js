/* ── Organizations Controller ─────────────────────────────────── */
const m = require('./model');
const path = require('path');

const ok  = (res, data) => res.json({ ok: true, data });
const err = (res, msg, status = 400) =>
  res.status(status).json({ ok: false, error: { message: msg } });

/* ── My Organization ─────────────────────────────────────────── */

exports.getMyOrg = async (req, res) => {
  try {
    const org = await m.getOrgByUserId(req.user.id);
    ok(res, org);
  } catch (e) { err(res, e.message, 500); }
};

exports.getMyOrgs = async (req, res) => {
  try {
    const orgs = await m.getOrgsByUserId(req.user.id);
    ok(res, orgs);
  } catch (e) { err(res, e.message, 500); }
};

exports.upsertMyOrg = async (req, res) => {
  try {
    const existing = await m.getOrgByUserId(req.user.id);
    let orgId;
    if (existing) {
      await m.upsertOrg(req.body, existing.id);
      orgId = existing.id;
    } else {
      orgId = await m.upsertOrg({ ...req.body, owner_user_id: req.user.id }, null);
      await m.linkUserToOrg(req.user.id, orgId);
    }
    // Background: si tiene PIC y no tiene OID, intentar resolver vía directory-api.
    // No bloqueamos la respuesta: el override aplica también por PIC.
    setImmediate(() => { m.backfillOidFromPic(orgId).catch(() => {}); });
    ok(res, { id: orgId });
  } catch (e) { err(res, e.message, 500); }
};

/* ── Coords (self-geolocate / pin draggable) ────────────────── */

exports.updateCoords = async (req, res) => {
  try {
    const { lat, lng, source } = req.body || {};
    const orgId = req.params.id;

    // Validar inputs
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return err(res, 'lat/lng must be numbers', 400);
    }
    if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
      return err(res, 'lat/lng out of range', 400);
    }
    const allowedSources = ['manual_pin','self_geolocate','mapbox','google','nominatim'];
    const src = allowedSources.includes(source) ? source : 'manual_pin';

    // Comprobar ownership: usuario debe ser owner_user_id de la org
    const org = await m.getOrgById(orgId);
    if (!org) return err(res, 'Organization not found', 404);
    if (org.owner_user_id !== req.user.id && req.user.role !== 'admin') {
      return err(res, 'Forbidden', 403);
    }

    await m.updateOrgCoords(orgId, latN, lngN, src);
    ok(res, { id: orgId, lat: latN, lng: lngN, source: src });
  } catch (e) { err(res, e.message, 500); }
};

/* ── Directory ───────────────────────────────────────────────── */

exports.listOrgs = async (req, res) => {
  try {
    const result = await m.listOrgs(req.query);
    res.json({ ok: true, data: result });
  } catch (e) { err(res, e.message, 500); }
};

exports.getOrg = async (req, res) => {
  try {
    const org = await m.getOrgById(req.params.id);
    if (!org) return err(res, 'Organization not found', 404);
    ok(res, org);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Adopt entity from directory ─────────────────────────────── */
exports.fromEntity = async (req, res) => {
  try {
    const oid = (req.body && req.body.oid) ? String(req.body.oid).trim() : '';
    if (!oid) return err(res, 'oid required', 400);
    const out = await m.upsertFromEntity(oid);
    ok(res, out);
  } catch (e) {
    const status = /not found/i.test(e.message) ? 404 : 500;
    err(res, e.message, status);
  }
};

/* ── Child resources ─────────────────────────────────────────── */

exports.listChildren = async (req, res) => {
  try {
    ok(res, await m.listChildren(req.params.type, req.params.orgId));
  } catch (e) { err(res, e.message, 500); }
};

exports.addChild = async (req, res) => {
  try {
    const owner = await m.isOrgOwner(req.user.id, req.params.orgId);
    if (!owner && req.user.role !== 'admin') return err(res, 'Forbidden', 403);
    const id = await m.upsertChild(req.params.type, req.params.orgId, req.body, null);
    ok(res, { id });
  } catch (e) { err(res, e.message, 500); }
};

exports.updateChild = async (req, res) => {
  try {
    const owner = await m.isOrgOwner(req.user.id, req.params.orgId);
    if (!owner && req.user.role !== 'admin') return err(res, 'Forbidden', 403);
    await m.upsertChild(req.params.type, req.params.orgId, req.body, req.params.id);
    ok(res, { id: req.params.id });
  } catch (e) { err(res, e.message, 500); }
};

exports.deleteChild = async (req, res) => {
  try {
    const owner = await m.isOrgOwner(req.user.id, req.params.orgId);
    if (!owner && req.user.role !== 'admin') return err(res, 'Forbidden', 403);
    await m.deleteChild(req.params.type, req.params.id, req.params.orgId);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── ORS lookup (prefill on new-org) ─────────────────────────── */

exports.orsLookup = async (req, res) => {
  try {
    const q = (req.body?.q || req.query?.q || '').toString();
    const results = await m.orsLookup(q);
    ok(res, results);
  } catch (e) {
    err(res, e.message || 'ORS lookup failed', e.status || 500);
  }
};

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file uploaded');
    const existing = await m.getOrgByUserId(req.user.id);
    if (!existing) return err(res, 'Create your organization first', 404);
    const logoUrl = '/uploads/logos/' + req.file.filename;
    await m.upsertOrg({ logo_url: logoUrl }, existing.id);
    ok(res, { logo_url: logoUrl });
  } catch (e) { err(res, e.message, 500); }
};
