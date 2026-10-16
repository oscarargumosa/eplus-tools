/* ── Organizations Controller ─────────────────────────────────── */
const m = require('./model');
const path = require('path');

const ok  = (res, data) => res.json({ ok: true, data });
const { sendError } = require('../../utils/httpError');
const { audit } = require('../../utils/audit');
const { validateImageBuffer } = require('../../utils/image-upload');
// 5xx: mensaje genérico + requestId (el detalle va al log). Ver utils/httpError.
const err = (res, msg, status = 400) => sendError(res, status, { message: msg });

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
    // org_id (body o query): el usuario puede tener varias entidades; se
    // edita la seleccionada, no siempre la primera.
    const targetId = (req.body && req.body.org_id) || req.query.org_id || null;
    const isAdmin = req.user.role === 'admin';
    let existing = null;
    if (req.body && req.body.new_org) {
      existing = null;               // «Otra entidad»: crear, no pisar la primera
    } else if (targetId) {
      if (!isAdmin && !await m.isClaimOwner(req.user.id, targetId)) return err(res, 'Forbidden', 403);
      existing = { id: targetId };
    } else {
      existing = await m.getOrgByUserId(req.user.id);
    }
    const body = { ...(req.body || {}) };
    delete body.org_id;
    delete body.new_org;
    // Dueño único: ni el OID ni el PIC pueden ser de una entidad que ya
    // reclamó otra persona (si no, se duplicaría y ganaría su ficha).
    if ((body.oid || body.pic) && await m.claimedByOther({ oid: body.oid, pic: body.pic }, req.user.id, existing && existing.id)) {
      return sendError(res, 409, { code: 'ALREADY_CLAIMED',
        message: 'Esa entidad (OID o PIC) ya tiene dueño en EU Funding Studio. Si es la tuya, búscala en «Mi entidad» y pide una revisión.' });
    }
    let orgId;
    if (existing) {
      await m.upsertOrg(body, existing.id, m.USER_ORG_FIELDS);
      orgId = existing.id;
    } else {
      orgId = await m.upsertOrg({ ...body, owner_user_id: req.user.id }, null, [...m.USER_ORG_FIELDS, 'owner_user_id']);
      await m.linkUserToOrg(req.user.id, orgId);
      await m.markClaimed(orgId, req.user.id);
    }
    // Visible en el directorio: solo el dueño reclamado (o admin) lo cambia.
    if (body.is_public !== undefined && (isAdmin || await m.isClaimOwner(req.user.id, orgId))) {
      await m.setPublic(orgId, body.is_public === true || body.is_public === 1 || body.is_public === '1' || body.is_public === 'true');
    }
    // Background: si tiene PIC y no tiene OID, intentar resolver vía directory-api.
    // No bloqueamos la respuesta: el override aplica también por PIC.
    setImmediate(() => { m.backfillOidFromPic(orgId).catch(() => {}); });
    ok(res, { id: orgId });
  } catch (e) { err(res, e.message, 500); }
};

/* ── Reclamar entidad del directorio ────────────────────────── */

exports.claimSearch = async (req, res) => {
  try {
    ok(res, await m.searchClaimable(req.query.q, req.user.id));
  } catch (e) { err(res, e.message, 500); }
};

exports.claim = async (req, res) => {
  try {
    const oid = (req.body && req.body.oid) ? String(req.body.oid).trim() : '';
    const out = await m.claimEntity(req.user.id, oid);
    if (!out.already_mine) audit(req, 'org.claim', { targetType: 'organization', targetId: out.id, meta: { oid } });
    ok(res, out);
  } catch (e) {
    if (e.status === 409) {
      // Sin el id interno de la entidad ajena: la revisión se pide por OID.
      return sendError(res, 409, { code: 'ALREADY_CLAIMED', message: e.message });
    }
    err(res, e.message, e.status || 500);
  }
};

exports.dispute = async (req, res) => {
  try {
    const oid = (req.body && req.body.oid) ? String(req.body.oid).trim() : '';
    const out = await m.openDispute(req.user.id, oid, req.body && req.body.message);
    if (!out.existing) audit(req, 'org.dispute.open', { targetType: 'organization', targetId: out.organization_id, meta: { oid } });
    ok(res, { id: out.id, existing: !!out.existing });
  } catch (e) { err(res, e.message, e.status || 500); }
};

/* Documentación de la entidad (privada: solo el dueño reclamado y admin).
   A cualquier otro se le responde 404: no se confirma ni que exista. */
async function canManageClaim(req, orgId) {
  return req.user.role === 'admin' || await m.isClaimOwner(req.user.id, orgId);
}

/* Middleware antes de multer: no se guarda nada en disco si no es suyo. */
exports.requireClaimOwner = async (req, res, next) => {
  try {
    if (!await canManageClaim(req, req.params.id)) return err(res, 'Not found', 404);
    next();
  } catch (e) { err(res, e.message, 500); }
};

exports.listClaimDocs = async (req, res) => {
  try {
    if (!await canManageClaim(req, req.params.id)) return err(res, 'Not found', 404);
    ok(res, { documents: await m.listClaimDocs(req.params.id), verification: await m.getVerification(req.params.id) });
  } catch (e) { err(res, e.message, 500); }
};

/* Tipo real por los primeros bytes (no por el nombre ni el mimetype del
   cliente): PDF, JPG/PNG/WebP, Word (.doc y .docx). */
function detectDocType(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf.toString('ascii', 0, 5) === '%PDF-') return { ext: '.pdf', mime: 'application/pdf' };
  const img = validateImageBuffer(buf);
  if (img && img.type !== 'gif') return { ext: img.ext, mime: img.mime };
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
    return { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  if (buf.slice(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]))) {
    return { ext: '.doc', mime: 'application/msword' };
  }
  return null;
}

exports.uploadClaimDoc = async (req, res) => {
  const fs = require('fs');
  const fsp = require('fs/promises');
  try {
    if (!req.file) return err(res, 'No file uploaded');
    const fh = await fsp.open(req.file.path, 'r');
    const head = Buffer.alloc(16);
    try { await fh.read(head, 0, 16, 0); } finally { await fh.close(); }
    const type = detectDocType(head);
    if (!type) {
      fs.unlink(req.file.path, () => {});
      return err(res, 'Formato no admitido: sube un PDF, una imagen (JPG, PNG, WebP) o un Word', 400);
    }
    // Extensión puesta por el servidor según el tipo real.
    const filename = req.file.filename + type.ext;
    await fsp.rename(req.file.path, path.join(path.dirname(req.file.path), filename));
    const id = await m.addClaimDoc(req.params.id, req.user.id, req.body && req.body.doc_type,
      { ...req.file, filename, mimetype: type.mime });
    audit(req, 'org.claim_doc.upload', { targetType: 'organization', targetId: req.params.id, meta: { doc_id: id } });
    ok(res, { id, verification: await m.getVerification(req.params.id) });
  } catch (e) {
    if (req.file) fs.unlink(req.file.path, () => {});
    err(res, e.message, 500);
  }
};

exports.downloadClaimDoc = async (req, res) => {
  try {
    if (!await canManageClaim(req, req.params.id)) return err(res, 'Not found', 404);
    const doc = await m.getClaimDoc(req.params.id, req.params.docId);
    const file = doc && m.claimDocPath(doc.stored_name);
    if (!file) return err(res, 'Not found', 404);
    if (req.user.role === 'admin') {
      audit(req, 'org.claim_doc.view', { targetType: 'organization', targetId: req.params.id, meta: { doc_id: doc.id } });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    if (doc.mime) res.type(doc.mime);
    res.download(file, doc.original_name, err2 => { if (err2 && !res.headersSent) err(res, 'Not found', 404); });
  } catch (e) { err(res, e.message, 500); }
};

exports.deleteClaimDoc = async (req, res) => {
  try {
    if (!await canManageClaim(req, req.params.id)) return err(res, 'Not found', 404);
    const doc = await m.deleteClaimDoc(req.params.id, req.params.docId);
    if (!doc) return err(res, 'Not found', 404);
    const file = m.claimDocPath(doc.stored_name);
    if (file) require('fs').unlink(file, () => {});
    audit(req, 'org.claim_doc.delete', { targetType: 'organization', targetId: req.params.id, meta: { doc_id: doc.id } });
    ok(res, { verification: await m.getVerification(req.params.id) });
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

/* Ficha completa (contactos, representante legal, personal clave, hijos)
   solo para el dueño de la organización o admin; el resto ve campos públicos. */
const ORG_PUBLIC_FIELDS = ['id', 'organization_name', 'acronym', 'org_type', 'country', 'city',
  'website', 'logo_url', 'description', 'pic', 'oid', 'is_public'];

async function canSeeFullOrg(req, orgId, ownerUserId) {
  if (req.user.role === 'admin') return true;
  if (ownerUserId && ownerUserId === req.user.id) return true;
  return m.isOrgOwner(req.user.id, orgId);
}

exports.getOrg = async (req, res) => {
  try {
    const org = await m.getOrgById(req.params.id);
    if (!org) return err(res, 'Organization not found', 404);
    if (await canSeeFullOrg(req, org.id, org.owner_user_id)) return ok(res, org);
    const pub = {};
    for (const f of ORG_PUBLIC_FIELDS) pub[f] = org[f] ?? null;
    ok(res, pub);
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
    const org = await m.getOrgOwnerInfo(req.params.orgId);
    if (!org) return err(res, 'Organization not found', 404);
    if (!await canSeeFullOrg(req, org.id, org.owner_user_id)) return err(res, 'Forbidden', 403);
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
    // ?org_id=: el logo de la entidad seleccionada (puede tener varias).
    const targetId = req.query.org_id || null;
    let existing;
    if (targetId) {
      if (req.user.role !== 'admin' && !await m.isClaimOwner(req.user.id, targetId)) {
        require('fs').unlink(req.file.path, () => {});
        return err(res, 'Forbidden', 403);
      }
      existing = { id: targetId };
    } else {
      existing = await m.getOrgByUserId(req.user.id);
    }
    if (!existing) { require('fs').unlink(req.file.path, () => {}); return err(res, 'Create your organization first', 404); }
    const logoUrl = '/uploads/logos/' + req.file.filename;
    await m.upsertOrg({ logo_url: logoUrl }, existing.id);
    ok(res, { logo_url: logoUrl });
  } catch (e) { err(res, e.message, 500); }
};
