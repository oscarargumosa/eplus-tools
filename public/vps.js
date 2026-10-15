/* ─────────────────────────────────────────────────────────────
   VPS Analytics — frontend (admin only)
   Single-page con tableros independientes, datos /v1/vps/*.
   ───────────────────────────────────────────────────────────── */

const TOKEN_KEY = 'auth.token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

async function api(path, params = {}) {
  const url = new URL(path, location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const t = getToken();
  const r = await fetch(url, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (r.status === 401) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); throw new Error('UNAUTHORIZED'); }
  if (r.status === 403) { document.body.innerHTML = '<div style="padding:40px;font-family:Manrope;color:#fff;background:#06003E;min-height:100vh"><h1>403 — Solo admin</h1><p>Tu cuenta no tiene rol admin.</p><a style="color:#c3d63a" href="/">Volver</a></div>'; throw new Error('FORBIDDEN'); }
  const j = await r.json();
  if (!j.ok) throw new Error(j.error?.message || 'API error');
  return j.data;
}

const fmt = {
  int:    n => (n ?? 0).toLocaleString('es-ES'),
  eur:    n => (n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €',
  meur:   n => (Math.round((n ?? 0) / 1e6 * 10) / 10) + ' M€',
  pct:    n => (n == null ? '—' : (n.toFixed ? n.toFixed(1) : n) + '%'),
  family: f => (f || '—').replace(/_/g, ' ')
};

/* ── Tabs / boards ───────────────────────────────────────── */
const boards = document.querySelectorAll('.board');
const navLinks = document.querySelectorAll('#vps-nav a');
const loaded = new Set();
const loaders = {};

function show(name) {
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.board === name));
  boards.forEach(s => s.classList.toggle('active', s.dataset.board === name));
  if (!loaded.has(name) && loaders[name]) {
    loaded.add(name);
    loaders[name]().catch(err => console.error(`[board ${name}]`, err));
  }
}
navLinks.forEach(a => a.addEventListener('click', () => show(a.dataset.board)));

/* ── Logout ──────────────────────────────────────────────── */
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  location.href = '/login.html';
});

/* ── Health badge ────────────────────────────────────────── */
async function loadHealth() {
  const badge = document.getElementById('health-badge');
  try {
    const d = await api('/v1/vps/health');
    badge.textContent = d.pg + ' · ok';
    badge.classList.add('ok');
  } catch (e) {
    badge.textContent = 'pg offline';
    badge.classList.add('err');
  }
}

/* ── Helpers de pintado ──────────────────────────────────── */
function table(target, columns, rows) {
  const head = columns.map(c => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('');
  const body = rows.map(r => '<tr>' + columns.map(c => {
    const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
    return `<td class="${c.num ? 'num' : ''} ${c.muted ? 'muted' : ''}">${v ?? ''}</td>`;
  }).join('') + '</tr>').join('');
  document.getElementById(target).innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const charts = {};
function bar(canvasId, labels, dataset, color = '#c3d63a') {
  charts[canvasId]?.destroy();
  const ctx = document.getElementById(canvasId);
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: dataset, backgroundColor: color, borderRadius: 4 }] },
    options: chartOpts()
  });
}
function lines(canvasId, labels, datasets) {
  charts[canvasId]?.destroy();
  const ctx = document.getElementById(canvasId);
  charts[canvasId] = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: chartOpts() });
}
function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#fff', font: { family: 'Manrope', size: 11 } } } },
    scales: {
      x: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
    }
  };
}

/* ── Familias compartidas (cargadas una vez, alimentan todos los selects) ── */
let FAMILIES = [];
async function loadFamilies() {
  if (FAMILIES.length) return FAMILIES;
  FAMILIES = await api('/v1/vps/eacea/families');
  document.querySelectorAll('select[id^="filter-"][id$="-family"]').forEach(sel => {
    sel.innerHTML = '<option value="">Todas</option>' +
      FAMILIES.map(f => `<option value="${f}">${fmt.family(f)}</option>`).join('');
  });
  return FAMILIES;
}

/* ── Board: overview ─────────────────────────────────────── */
loaders.overview = async () => {
  const rows = await api('/v1/vps/eacea/overview');
  // Cards
  const cardsTotal = rows.reduce((acc, r) => {
    acc.projects += +r.projects;
    acc.grant    += +r.grant_total_eur;
    acc.with_report += +r.with_report;
    acc.gp       += +r.good_practice;
    acc.award    += +r.innovative_award;
    return acc;
  }, { projects: 0, grant: 0, with_report: 0, gp: 0, award: 0 });
  document.getElementById('overview-cards').innerHTML = `
    <div class="card"><span class="lbl">Proyectos EACEA</span><span class="val">${fmt.int(cardsTotal.projects)}</span><span class="sub">en ${rows.length} familias</span></div>
    <div class="card"><span class="lbl">Subvención total</span><span class="val">${fmt.meur(cardsTotal.grant)}</span><span class="sub">acumulado 2014–2025</span></div>
    <div class="card"><span class="lbl">Con informe final</span><span class="val">${fmt.int(cardsTotal.with_report)}</span><span class="sub">${fmt.pct(100*cardsTotal.with_report/cardsTotal.projects)} del total</span></div>
    <div class="card"><span class="lbl">Good Practice</span><span class="val">${fmt.int(cardsTotal.gp)}</span><span class="sub">${fmt.pct(100*cardsTotal.gp/cardsTotal.projects)} del total</span></div>
    <div class="card"><span class="lbl">Innovative Award</span><span class="val">${fmt.int(cardsTotal.award)}</span><span class="sub">${fmt.pct(100*cardsTotal.award/cardsTotal.projects)} del total</span></div>
  `;

  bar('ch-overview-projects',
    rows.map(r => fmt.family(r.eacea_family)),
    rows.map(r => +r.projects));
  bar('ch-overview-grant',
    rows.map(r => fmt.family(r.eacea_family)),
    rows.map(r => Math.round(+r.grant_total_eur / 1e6)),
    '#7d8cff');
};

/* ── Board: country ──────────────────────────────────────── */
loaders.country = async () => {
  await loadFamilies();
  const sel = document.getElementById('filter-country-family');
  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/by-country', { family: sel.value });
    bar('ch-by-country', rows.map(r => r.coordinator_country), rows.map(r => +r.projects));
    table('tbl-by-country', [
      { key: 'coordinator_country', label: 'País' },
      { key: 'projects', label: 'Proyectos', num: true, fmt: fmt.int },
      { key: 'grant_total_eur', label: 'Subvención', num: true, fmt: fmt.meur },
      { key: 'innovative_award', label: 'Award', num: true, fmt: fmt.int },
      { key: 'good_practice', label: 'GP', num: true, fmt: fmt.int }
    ], rows);
  };
  sel.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: timeline ─────────────────────────────────────── */
loaders.timeline = async () => {
  await loadFamilies();
  const fF = document.getElementById('filter-timeline-family');
  const fC = document.getElementById('filter-timeline-country');
  // poblar países
  const countries = await api('/v1/vps/eacea/by-country');
  fC.innerHTML = '<option value="">Todos</option>' +
    countries.map(c => `<option value="${c.coordinator_country}">${c.coordinator_country} (${fmt.int(c.projects)})</option>`).join('');

  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/timeline', { family: fF.value, country: fC.value });
    lines('ch-timeline', rows.map(r => r.funding_year), [
      { label: 'Proyectos',   data: rows.map(r => +r.projects),       borderColor: '#c3d63a', backgroundColor: 'rgba(231,235,0,0.15)', tension: 0.2, fill: false, yAxisID: 'y' },
      { label: 'Con informe', data: rows.map(r => +r.with_report),    borderColor: '#7d8cff', backgroundColor: 'rgba(125,140,255,0.15)', tension: 0.2, fill: false, yAxisID: 'y' }
    ]);
    table('tbl-timeline', [
      { key: 'funding_year', label: 'Año' },
      { key: 'projects', label: 'Proyectos', num: true, fmt: fmt.int },
      { key: 'grant_total_eur', label: 'Subvención', num: true, fmt: fmt.meur },
      { key: 'with_report', label: 'Con informe', num: true, fmt: fmt.int }
    ], rows);
  };
  fF.addEventListener('change', refresh);
  fC.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: coordinators ─────────────────────────────────── */
loaders.coordinators = async () => {
  await loadFamilies();
  const fF = document.getElementById('filter-coord-family');
  const fC = document.getElementById('filter-coord-country');
  const countries = await api('/v1/vps/eacea/by-country');
  fC.innerHTML = '<option value="">Todos</option>' + countries.map(c => `<option>${c.coordinator_country}</option>`).join('');
  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/top-coordinators', { family: fF.value, country: fC.value, limit: 50 });
    table('tbl-coordinators', [
      { key: 'coordinator_name', label: 'Coordinador' },
      { key: 'coordinator_country', label: 'País' },
      { key: 'eacea_family', label: 'Familia', fmt: fmt.family },
      { key: 'projects', label: 'Proyectos', num: true, fmt: fmt.int },
      { key: 'grant_total_eur', label: 'Subvención', num: true, fmt: fmt.meur },
      { key: 'good_practice', label: 'GP', num: true, fmt: fmt.int },
      { key: 'innovative_award', label: 'Award', num: true, fmt: fmt.int }
    ], rows);
  };
  fF.addEventListener('change', refresh);
  fC.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: topics ───────────────────────────────────────── */
loaders.topics = async () => {
  await loadFamilies();
  const sel = document.getElementById('filter-topics-family');
  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/topics', { family: sel.value, limit: 30 });
    bar('ch-topics', rows.map(r => r.topic.slice(0,40)), rows.map(r => +r.projects));
    table('tbl-topics',
      sel.value
        ? [
            { key: 'topic', label: 'Topic' },
            { key: 'projects', label: 'Proyectos', num: true, fmt: fmt.int },
            { key: 'grant_avg_eur', label: 'Grant medio', num: true, fmt: fmt.eur },
            { key: 'good_practice', label: 'GP', num: true, fmt: fmt.int },
            { key: 'innovative_award', label: 'Award', num: true, fmt: fmt.int }
          ]
        : [
            { key: 'topic', label: 'Topic' },
            { key: 'projects', label: 'Proyectos', num: true, fmt: fmt.int },
            { key: 'grant_avg_eur', label: 'Grant medio', num: true, fmt: fmt.eur },
            { key: 'pct_award', label: '% Award', num: true, fmt: fmt.pct },
            { key: 'families_using', label: 'Familias', num: true, fmt: fmt.int },
            { key: 'countries_using', label: 'Países', num: true, fmt: fmt.int }
          ],
      rows);
  };
  sel.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: winners ──────────────────────────────────────── */
loaders.winners = async () => {
  await loadFamilies();
  const sel = document.getElementById('filter-winners-family');
  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/topic-winners', { family: sel.value });
    table('tbl-winners', [
      { key: 'topic', label: 'Topic' },
      { key: 'eacea_family', label: 'Familia', fmt: fmt.family },
      { key: 'projects', label: 'Proyectos', num: true, fmt: fmt.int },
      { key: 'grant_avg_eur', label: 'Grant medio', num: true, fmt: fmt.eur },
      { key: 'median_grant', label: 'Mediana fam.', num: true, fmt: fmt.eur },
      { key: 'pct_above_median', label: '% sobre mediana', num: true, fmt: v => (v == null ? '—' : '+' + (+v).toFixed(1) + '%') },
      { key: 'pct_award_in_topic', label: '% Award', num: true, fmt: fmt.pct }
    ], rows);
  };
  sel.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: trend ────────────────────────────────────────── */
loaders.trend = async () => {
  const rows = await api('/v1/vps/eacea/topic-trend');
  const up   = rows.filter(r => +r.proj_2014_2020 > 0 && +r.proj_2021_2025 > 0).slice(0, 30);
  const down = [...rows].filter(r => +r.proj_2014_2020 > 0).sort((a,b) => (+a.growth_pct) - (+b.growth_pct)).slice(0, 30);
  const cols = [
    { key: 'topic', label: 'Topic' },
    { key: 'total_projects', label: 'Total', num: true, fmt: fmt.int },
    { key: 'proj_2014_2020', label: '14–20', num: true, fmt: fmt.int },
    { key: 'proj_2021_2025', label: '21–25', num: true, fmt: fmt.int },
    { key: 'growth_pct', label: 'Δ %', num: true, fmt: v => v == null ? '—' : (+v >= 0 ? '+' : '') + (+v).toFixed(1) + '%' }
  ];
  table('tbl-trend-up', cols, up);
  table('tbl-trend-down', cols, down);
};

/* ── Board: growth ───────────────────────────────────────── */
loaders.growth = async () => {
  await loadFamilies();
  const sel = document.getElementById('filter-growth-family');
  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/growth', { family: sel.value });
    table('tbl-growth', [
      { key: 'eacea_family', label: 'Familia', fmt: fmt.family },
      { key: 'coordinator_country', label: 'País' },
      { key: 'proj_2014_2020', label: '14–20', num: true, fmt: fmt.int },
      { key: 'proj_2021_2025', label: '21–25', num: true, fmt: fmt.int },
      { key: 'growth_pct_projects', label: 'Δ % Proy.', num: true, fmt: v => v == null ? '—' : (+v >= 0 ? '+' : '') + (+v).toFixed(1) + '%' },
      { key: 'growth_pct_grant',    label: 'Δ % Grant', num: true, fmt: v => v == null ? '—' : (+v >= 0 ? '+' : '') + (+v).toFixed(1) + '%' }
    ], rows);
  };
  sel.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: writing ──────────────────────────────────────── */
loaders.writing = async () => {
  const rows = await api('/v1/vps/eacea/writing');
  table('tbl-writing', [
    { key: 'eacea_family', label: 'Familia', fmt: fmt.family },
    { key: 'projects',    label: 'Proy.', num: true, fmt: fmt.int },
    { key: 'avg_chars',   label: '⌀ chars', num: true, fmt: fmt.int },
    { key: 'avg_words',   label: '⌀ palabras', num: true, fmt: fmt.int },
    { key: 'avg_sentences',label:'⌀ frases', num: true, fmt: v => (+v).toFixed(1) },
    { key: 'avg_numbers', label: '⌀ cifras', num: true, fmt: v => (+v).toFixed(1) },
    { key: 'pct_innov',     label: 'Innov', num: true, fmt: fmt.pct },
    { key: 'pct_digital',   label: 'Digit', num: true, fmt: fmt.pct },
    { key: 'pct_green',     label: 'Green', num: true, fmt: fmt.pct },
    { key: 'pct_inclusion', label: 'Incl', num: true, fmt: fmt.pct },
    { key: 'pct_youth',     label: 'Youth', num: true, fmt: fmt.pct },
    { key: 'pct_gender',    label: 'Gend', num: true, fmt: fmt.pct },
    { key: 'pct_business',  label: 'Biz', num: true, fmt: fmt.pct }
  ], rows);
  // grouped bar de %s léxicos
  charts['ch-writing']?.destroy();
  const labels = rows.map(r => fmt.family(r.eacea_family));
  const tags = ['pct_innov','pct_digital','pct_green','pct_inclusion','pct_youth','pct_gender','pct_business'];
  const colors = ['#c3d63a','#7d8cff','#7df3a3','#ff8ec7','#ffaa66','#a78bfa','#5fd7e0'];
  charts['ch-writing'] = new Chart(document.getElementById('ch-writing'), {
    type: 'bar',
    data: {
      labels,
      datasets: tags.map((t, i) => ({ label: t.replace('pct_',''), data: rows.map(r => +r[t]), backgroundColor: colors[i] }))
    },
    options: chartOpts()
  });
};

/* ── Board: network ──────────────────────────────────────── */
loaders.network = async () => {
  await loadFamilies();
  const sel = document.getElementById('filter-network-family');
  const inp = document.getElementById('filter-network-country');
  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/network', {
      family: sel.value,
      country: (inp.value || '').toUpperCase().trim() || ''
    });
    table('tbl-network', [
      { key: 'country_a', label: 'País A' },
      { key: 'country_b', label: 'País B' },
      { key: 'projects', label: 'Coincidencias', num: true, fmt: fmt.int }
    ], rows);
  };
  sel.addEventListener('change', refresh);
  inp.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: bertopic ─────────────────────────────────────── */
loaders.bertopic = async () => {
  await loadFamilies();
  const sel = document.getElementById('filter-bertopic-family');
  const refresh = async () => {
    const rows = await api('/v1/vps/eacea/bertopic', { family: sel.value });
    table('tbl-bertopic', [
      { key: 'eacea_family', label: 'Familia', fmt: fmt.family },
      { key: 'topic_id', label: '#', num: true },
      { key: 'projects', label: 'Proyectos', num: true, fmt: fmt.int },
      { key: 'words', label: 'Palabras clave', fmt: w => Array.isArray(w) ? w.slice(0,8).map(x => `<span class="pill" style="margin-right:4px">${x}</span>`).join('') : '' },
      { key: 'representative_titles', label: 'Proyectos representativos', fmt: t => Array.isArray(t) && t.length ? t.map(x => `<div style="font-size:11px;color:rgba(255,255,255,0.65);margin:2px 0">${x}</div>`).join('') : '<span class="muted">—</span>' }
    ], rows);
  };
  sel.addEventListener('change', refresh);
  await refresh();
};

/* ── Board: similar (búsqueda semántica) ─────────────────── */
loaders.similar = async () => {
  await loadFamilies();
  const q = document.getElementById('similar-q');
  const fam = document.getElementById('similar-family');
  const topk = document.getElementById('similar-topk');
  const status = document.getElementById('similar-status');
  const btn = document.getElementById('similar-go');

  // Health
  try {
    const h = await api('/v1/vps/eacea/similar/health');
    status.textContent = `Index: ${fmt.int(h.embeddings_count)} resúmenes · modelo ${h.model}`;
  } catch {
    status.textContent = '⚠ Servicio de búsqueda inactivo';
    status.style.color = '#ff7878';
  }

  const search = async () => {
    const text = q.value.trim();
    if (text.length < 5) { status.textContent = 'Escribe al menos 5 caracteres.'; return; }
    status.textContent = 'Buscando…';
    btn.disabled = true;
    try {
      const t0 = performance.now();
      const r = await fetch('/v1/vps/eacea/similar', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + getToken()
        },
        body: JSON.stringify({ q: text, family: fam.value || null, topk: parseInt(topk.value) || 20 })
      });
      const j = await r.json();
      const dt = Math.round(performance.now() - t0);
      if (!j.ok) throw new Error(j.error?.message || 'error');
      status.textContent = `${j.data.length} proyectos similares (${dt} ms)`;
      table('tbl-similar', [
        { key: 'score', label: 'Score', num: true, fmt: v => (+v).toFixed(3) },
        { key: 'project_title', label: 'Título', fmt: (v, r) => r.results_url ? `<a href="${r.results_url}" target="_blank" style="color:#fff;text-decoration:none">${v || '—'}</a>` : (v || '—') },
        { key: 'eacea_family', label: 'Familia', fmt: fmt.family },
        { key: 'coordinator_country', label: 'País' },
        { key: 'coordinator_name', label: 'Coordinador', fmt: v => v ? v.slice(0, 50) : '—' },
        { key: 'funding_year', label: 'Año', num: true },
        { key: 'eu_grant_eur', label: 'Grant', num: true, fmt: v => v ? fmt.eur(v) : '—' },
        { key: 'is_good_practice', label: 'GP', fmt: v => v ? '<span class="pill">GP</span>' : '' },
        { key: 'european_innovative_award', label: 'Award', fmt: v => v ? '<span class="pill">★</span>' : '' }
      ], j.data);
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  };
  btn.addEventListener('click', search);
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) search(); });
};

/* ── Bootstrap ──────────────────────────────────────────── */
loadHealth();
loadFamilies();
show('overview');
