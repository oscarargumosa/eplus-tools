/* ═══════════════════════════════════════════════════════════════
   Entity rankings — analítica de experiencia (Partner Engine → Análisis)
   ═══════════════════════════════════════════════════════════════
   Sirve un ranking de entidades por inversión movilizada / nº de
   proyectos / nº como coordinador, con filtros (país, excluir
   universidades, mínimo de proyectos).

   FUENTE (hoy): dataset precomputado `data/entity_rankings.json`,
   generado desde la réplica Postgres del directorio CON resolución
   de identidad (any_id → canonical). Cada fila es un array compacto:
     [ pic, oid, name, country_code, n_projects, n_coord, inv_eur, is_university(0/1) ]

   Cuando el VPS entregue `GET /rankings` (ver docs/handoffs/PARA_VPS.md),
   este modelo se sustituye por un passthrough a la directory-api sin
   tocar el controller ni el front. Filtros programme/year quedan para
   esa versión (el agregado estático no los soporta).
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../../../data/entity_rankings.json');

let _rows = null;

function load() {
  if (_rows) return _rows;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8').replace(/^﻿/, '');
    _rows = JSON.parse(raw);
    if (!Array.isArray(_rows)) _rows = [];
  } catch (e) {
    console.error('[rankings] no se pudo cargar', DATA_FILE, e.message);
    _rows = [];
  }
  return _rows;
}

// Índices del array compacto
const I = { pic: 0, oid: 1, name: 2, cc: 3, np: 4, nc: 5, inv: 6, uni: 7 };

function truthy(v) {
  return v === true || v === 'true' || v === '1' || v === 1;
}

function query(params = {}) {
  const rows = load();

  const metric = params.metric === 'projects' || params.metric === 'coordinator'
    ? params.metric : 'investment';
  const cc = params.country ? String(params.country).toUpperCase().trim() : null;
  const minP = parseInt(params.min_projects, 10) || 0;
  const exU = truthy(params.exclude_universities);
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(params.offset, 10) || 0, 0);

  let filtered = rows;
  if (cc || minP || exU) {
    filtered = rows.filter(r =>
      (!cc  || (r[I.cc] && String(r[I.cc]).toUpperCase() === cc)) &&
      (!minP || (r[I.np] || 0) >= minP) &&
      (!exU  || r[I.uni] !== 1)
    );
  }

  // El dataset viene pre-ordenado por inversión desc; solo re-ordenamos
  // si la métrica pedida es otra.
  const idx = metric === 'projects' ? I.np : metric === 'coordinator' ? I.nc : I.inv;
  const sorted = idx === I.inv ? filtered
    : [...filtered].sort((a, b) => (b[idx] || 0) - (a[idx] || 0));

  let totalInvestment = 0;
  for (const r of filtered) totalInvestment += (r[I.inv] || 0);

  const results = sorted.slice(offset, offset + limit).map((r, i) => ({
    rank: offset + i + 1,
    pic: r[I.pic],
    oid: r[I.oid],
    name: r[I.name],
    country_code: r[I.cc],
    n_projects: r[I.np],
    n_coord: r[I.nc],
    total_investment_eur: r[I.inv],
    is_university: r[I.uni] === 1,
  }));

  return {
    count: filtered.length,
    total_entities: rows.length,
    total_investment_eur: totalInvestment,
    metric,
    limit,
    offset,
    results,
  };
}

module.exports = { query, _load: load };
