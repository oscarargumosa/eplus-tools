/* ── Convocatorias Controller — sirve data/funding_unified.json ─────
   Lista unificada (SEDIA + SALTO + BDNS), 647 calls. */
const fs   = require('fs');
const path = require('path');
const adminModel = require('../admin/model');

const DATA_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'funding_unified.json');
const META_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'funding_unified.meta.json');

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
   El detalle completo se sirve en getById. */
function toCard(c) {
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
    summary_es: c.summary_es,
    status: c.status,
    open_date: c.open_date,
    deadline: c.deadline,
    deadline_model: c.deadline_model,
    budget_total_eur: c.budget_total_eur,
    budget_per_project_min_eur: c.budget_per_project_min_eur,
    budget_per_project_max_eur: c.budget_per_project_max_eur,
    expected_grants: c.expected_grants,
    cofinancing_pct: c.cofinancing_pct,
    duration_months: c.duration_months,
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
    let rows = all.filter(r => {
      if (String(r.source || '').toLowerCase() === 'salto') return false;
      if (String(r.source || '').toLowerCase() === 'bdns') return false;
      if (String(r.status || '').toLowerCase() === 'closed') return false;
      if (r.deadline && String(r.deadline) < today) return false;
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

    const total = rows.length;
    const items = rows.slice(offset, offset + limit).map(c => {
      const card = toCard(c);
      card.available_in_efs = activeSet.has(c.source_id) || activeSet.has(c.call_id);
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
    res.json({ ok: true, data: row });
  } catch (err) {
    next(err);
  }
};
