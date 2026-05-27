/* ── Convocatorias Controller — sirve data/funding_unified.json ─────
   Lista unificada (SEDIA + SALTO + BDNS), 647 calls. */
const fs   = require('fs');
const path = require('path');
const adminModel = require('../admin/model');

const DATA_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'funding_unified.json');
const META_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'funding_unified.meta.json');
const STRUCTURED_DIR = path.join(__dirname, '..', '..', '..', '..', 'data', 'call_structured');

// Load structured extracts (LLM-generated). Light cache; rebuild every 5 min.
let _structured = null;
let _structuredUntil = 0;
function loadStructured() {
  if (_structured && Date.now() < _structuredUntil) return _structured;
  const map = new Map();
  try {
    if (fs.existsSync(STRUCTURED_DIR)) {
      for (const f of fs.readdirSync(STRUCTURED_DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
          const j = JSON.parse(fs.readFileSync(path.join(STRUCTURED_DIR, f), 'utf8'));
          map.set(j.source_id, j);
        } catch {}
      }
    }
  } catch {}
  _structured = map;
  _structuredUntil = Date.now() + 5 * 60_000;
  return map;
}

// In-memory cache of action_types active in intake_programs. Refreshed every 30s.
let activeActionCache = null;
let activeActionCacheUntil = 0;
async function getActiveActionTypes() {
  if (activeActionCache && Date.now() < activeActionCacheUntil) return activeActionCache;
  try {
    const arr = await adminModel.listActiveActionTypes();
    activeActionCache = new Set(arr);
    activeActionCacheUntil = Date.now() + 30_000;
  } catch {
    activeActionCache = new Set();
  }
  return activeActionCache;
}

let cache = null;
let cacheMtime = 0;
let metaCache = null;

function loadData() {
  try {
    const stat = fs.statSync(DATA_PATH);
    if (!cache || stat.mtimeMs !== cacheMtime) {
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      cache = JSON.parse(raw);
      cacheMtime = stat.mtimeMs;
      try { metaCache = JSON.parse(fs.readFileSync(META_PATH, 'utf8')); } catch { metaCache = null; }
    }
    return cache;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/* Card-level shape — recortado y normalizado para el grid frontend.
   El detalle completo se sirve en getById.
   Enriquece campos null con la extracción LLM (call_structured/<id>.json). */
function toCard(c, structured) {
  const s = structured && structured.get ? structured.get(c.source_id) : null;
  const pick = (feedVal, structuredVal) => (feedVal !== null && feedVal !== undefined ? feedVal : (structuredVal ?? null));
  return {
    call_id: c.call_id,
    source: c.source,
    source_id: c.source_id,
    level: c.level,
    category: c.category,
    programme: c.programme,
    sub_programme: c.sub_programme,
    title: c.title,
    title_lang: c.title_lang,
    summary_en: c.summary_en,
    summary_es: pick(c.summary_es, s?.scope_summary_es),
    has_ai_summary: !!(s?.scope_summary_es && !c.summary_es),
    status: c.status,
    open_date: c.open_date,
    publication_date: c.publication_date,
    deadline: c.deadline,
    deadline_model: pick(c.deadline_model, s?.deadline_model),
    budget_total_eur: pick(c.budget_total_eur, s?.budget_total_eur),
    budget_per_project_min_eur: pick(c.budget_per_project_min_eur, s?.budget_per_project_min_eur),
    budget_per_project_max_eur: pick(c.budget_per_project_max_eur, s?.budget_per_project_max_eur),
    expected_grants: pick(c.expected_grants, s?.expected_grants),
    cofinancing_pct: pick(c.cofinancing_pct, s?.cofinancing_pct),
    duration_months: pick(c.duration_months, s?.duration_months_max),
    // Extended structured fields (LLM-derived; null if no structured extract):
    main_objective: s?.main_objective || null,
    managing_agency: s?.managing_agency || null,
    submission_platform: s?.submission_platform || null,
    call_type: s?.call_type || null,
    coordinator_types_allowed: s?.coordinator_types_allowed || [],
    eligible_activities: s?.eligible_activities || [],
    eligible_costs: s?.eligible_costs || [],
    non_eligible_costs: s?.non_eligible_costs || [],
    expected_outcomes: s?.expected_outcomes || [],
    audience_ai: s?.audience || null,
    themes_ai: s?.themes || [],
    faq: s?.faq || null,
    eligible_countries: c.eligible_countries || [],
    crossCuttingPriorities: c.crossCuttingPriorities || [],
    keywords: (c.keywords || []).slice(0, 8),
    apply_url: c.apply_url,
    details_url: c.details_url,
  };
}

exports.list = async (req, res, next) => {
  try {
    const all = loadData();
    const activeSet = await getActiveActionTypes();
    const status   = (req.query.status   || '').trim().toLowerCase();
    const programme= (req.query.programme|| '').trim().toLowerCase();
    const source   = (req.query.source   || '').trim().toLowerCase();
    const q        = (req.query.q        || '').trim().toLowerCase();
    const limit    = Math.min(parseInt(req.query.limit, 10) || 1000, 2000);
    const offset   = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Reglas duras (no opcionales):
    //  - Nunca mostramos calls cerradas (no se pueden solicitar).
    //  - Nunca mostramos calls con deadline pasado, aunque su status sea 'open'
    //    (los datos de SEDIA/BDNS a veces tardan en marcarse 'closed').
    //  - Excluimos source='salto' porque las movilidades tienen su propia pestaña.
    //  - Excluimos source='bdns' (subvenciones nacionales ES): no encajan con el foco EU.
    const today = new Date().toISOString().slice(0, 10);
    const curationMap = curation.getAll();
    const admin = isAdmin(req);
    let rows = all.filter(r => {
      if (String(r.source || '').toLowerCase() === 'salto') return false;
      if (String(r.source || '').toLowerCase() === 'bdns') return false;
      if (String(r.status || '').toLowerCase() === 'closed') return false;
      if (r.deadline && String(r.deadline) < today) return false;
      // Hidden by admin: invisible to normal users; admins can see them but mark them as such on the card.
      if (!admin && curationMap[r.source_id]?.hidden) return false;
      return true;
    });
    if (status)    rows = rows.filter(r => String(r.status || '').toLowerCase() === status);
    if (programme) rows = rows.filter(r => String(r.programme || '').toLowerCase().includes(programme));
    if (source)    rows = rows.filter(r => String(r.source || '').toLowerCase() === source);
    if (q) {
      rows = rows.filter(r => {
        const hay = [r.title, r.summary_en, r.summary_es, r.programme, r.sub_programme, r.source_id, ...(r.keywords || [])]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    const structured = loadStructured();
    const total = rows.length;
    const items = rows.slice(offset, offset + limit).map(c => {
      const card = toCard(c, structured);
      card.available_in_efs = activeSet.has(c.source_id) || activeSet.has(c.call_id);
      // Attach curation only for admins; users don't even know it exists.
      if (admin) card.curation = curationMap[c.source_id] || null;
      return card;
    });

    res.json({
      ok: true,
      data: {
        total,
        offset,
        limit,
        items,
        meta: metaCache ? { generatedAt: metaCache.generatedAt, total: metaCache.total, byStatus: metaCache.byStatus, bySource: metaCache.bySource } : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = (req, res, next) => {
  try {
    const all = loadData();
    const id  = String(req.params.id || '');
    const row = all.find(r => r.call_id === id || r.source_id === id);
    if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
    const structured = loadStructured().get(row.source_id) || null;
    res.json({ ok: true, data: { ...row, structured } });
  } catch (err) {
    next(err);
  }
};

const rag = require('./rag');
const curation = require('./curation');

function isAdmin(req) {
  const role = req.user?.role;
  return role === 'admin' || role === 'scribe';
}

exports.searchSemantic = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'q required' } });
    const topK = Math.min(parseInt(req.query.top, 10) || 10, 30);
    const result = await rag.searchSemantic(q, topK);
    res.json({ ok: true, data: result });
  } catch (e) { next(e); }
};

exports.chat = async (req, res, next) => {
  try {
    const sourceId = req.params.sourceId;
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'messages required' } });
    const result = await rag.chatWithCall(sourceId, messages);
    res.json({ ok: true, data: result });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ ok: false, error: { code: e.code || 'NOT_FOUND', message: e.message } });
    next(e);
  }
};

exports.ragStatus = (req, res, next) => {
  try { res.json({ ok: true, data: rag.readinessStatus() }); } catch (e) { next(e); }
};

exports.curationList = (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'admin only' } });
    res.json({ ok: true, data: curation.getAll() });
  } catch (e) { next(e); }
};

exports.curationPatch = (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'admin only' } });
    const sid = req.params.sourceId;
    const body = req.body || {};
    const allowed = {};
    if ('hidden' in body)   allowed.hidden = body.hidden;
    if ('reviewed' in body) allowed.reviewed = body.reviewed;
    if ('add_note' in body) allowed.add_note = body.add_note;
    if ('delete_note_index' in body) allowed.delete_note_index = body.delete_note_index;
    const result = curation.patch(sid, allowed, req.user);
    res.json({ ok: true, data: result });
  } catch (e) { next(e); }
};
