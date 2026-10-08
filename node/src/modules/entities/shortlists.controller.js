/* ═══════════════════════════════════════════════════════════════
   Shortlists Controller — Partner Engine pool del usuario
   ═══════════════════════════════════════════════════════════════ */

const m = require('./shortlists.model');

const ok  = (res, data) => res.json({ ok: true, data });
const { sendError } = require('../../utils/httpError');
// 5xx: mensaje genérico + requestId (el detalle va al log). Ver utils/httpError.
const err = (res, msg, status = 400) => sendError(res, status, { message: msg });

/* ── List ─────────────────────────────────────────────────────── */
exports.list = async (req, res) => {
  try {
    ok(res, await m.listShortlists(req.user.id));
  } catch (e) { err(res, e.message, 500); }
};

/* ── Detail ───────────────────────────────────────────────────── */
exports.detail = async (req, res) => {
  try {
    const data = await m.getShortlistDetail(req.user.id, req.params.id);
    if (!data) return err(res, 'Shortlist not found', 404);
    ok(res, data);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Create ───────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const id = await m.createShortlist(req.user.id, req.body || {});
    ok(res, { id });
  } catch (e) { err(res, e.message, 500); }
};

exports.update = async (req, res) => {
  try {
    if (!await m.isOwner(req.user.id, req.params.id)) return err(res, 'Forbidden', 403);
    await m.updateShortlist(req.user.id, req.params.id, req.body || {});
    ok(res, { id: req.params.id });
  } catch (e) { err(res, e.message, 500); }
};

exports.remove = async (req, res) => {
  try {
    if (!await m.isOwner(req.user.id, req.params.id)) return err(res, 'Forbidden', 403);
    await m.deleteShortlist(req.user.id, req.params.id);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Items ────────────────────────────────────────────────────── */
exports.addItem = async (req, res) => {
  try {
    if (!await m.isOwner(req.user.id, req.params.id)) return err(res, 'Forbidden', 403);
    const { oid, notes } = req.body || {};
    if (!oid) return err(res, 'oid required');
    await m.addItem(req.user.id, req.params.id, oid, notes);
    ok(res, { id: req.params.id, oid });
  } catch (e) { err(res, e.message, 500); }
};

exports.removeItem = async (req, res) => {
  try {
    if (!await m.isOwner(req.user.id, req.params.id)) return err(res, 'Forbidden', 403);
    await m.removeItem(req.user.id, req.params.id, req.params.oid);
    ok(res, null);
  } catch (e) { err(res, e.message, 500); }
};

/* ── Quick toggle en default shortlist ───────────────────────── */
exports.toggle = async (req, res) => {
  try {
    const { oid } = req.body || {};
    if (!oid) return err(res, 'oid required');
    ok(res, await m.toggleInDefault(req.user.id, oid));
  } catch (e) { err(res, e.message, 500); }
};

/* ── Saved-set check (heart state on cards) ──────────────────── */
exports.savedSet = async (req, res) => {
  try {
    const { oids } = req.body || {};
    if (!Array.isArray(oids)) return err(res, 'oids array required');
    ok(res, await m.getSavedOids(req.user.id, oids));
  } catch (e) { err(res, e.message, 500); }
};

/* ── Export CSV ──────────────────────────────────────────────── */
exports.exportCsv = async (req, res) => {
  try {
    if (!await m.isOwner(req.user.id, req.params.id)) {
      return res.status(403).type('text/plain').send('Forbidden');
    }
    const data = await m.getShortlistDetail(req.user.id, req.params.id);
    if (!data) return res.status(404).type('text/plain').send('Not found');

    const cols = [
      'oid','display_name','country_code','city','category','quality_tier',
      'score_professionalism','score_eu_readiness','score_vitality',
      'website','emails','phones','cms_detected','notes','added_at'
    ];
    const escCsv = (v) => {
      if (v == null) return '';
      let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      s = s.replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const header = cols.join(',') + '\n';
    const lines = (data.items || []).map(it =>
      cols.map(c => {
        let v = it[c];
        if (c === 'emails' || c === 'phones') {
          // mysql2 might return JSON as string already-parsed; flatten
          if (typeof v === 'string') { try { v = JSON.parse(v); } catch {} }
          if (Array.isArray(v)) v = v.join('; ');
        }
        return escCsv(v);
      }).join(',')
    ).join('\n');

    const safeName = (data.name || 'shortlist').replace(/[^a-z0-9_-]+/gi, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.send('﻿' + header + lines + '\n');
  } catch (e) {
    require('../../utils/httpError').logServerError(req, 500, e);
    res.status(500).type('text/plain').send('Error interno del servidor (petición ' + req.id + ')');
  }
};
