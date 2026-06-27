/* ═══════════════════════════════════════════════════════════════
   Análisis — ranking de experiencia de entidades (Partner Engine)
   ═══════════════════════════════════════════════════════════════
   Lista entidades por inversión movilizada / nº de proyectos / nº como
   coordinador, con filtros (país, excluir universidades, mín. proyectos).
   Datos: GET /v1/entities/rankings (hoy dataset precomputado con
   resolución de identidad; mañana passthrough a la directory-api).
   Clic en una fila → abre la ficha de la entidad (Entities.openFicha).
   ═══════════════════════════════════════════════════════════════ */
const Analysis = (() => {
  const PAGE = 50;

  const COUNTRIES = ['ES','IT','DE','FR','PT','EL','PL','RO','BE','NL','TR',
    'BG','HR','CZ','DK','EE','FI','HU','IE','LT','LV','AT','SE','SI','SK','CY',
    'LU','MT','NO','IS','RS','MK','NG','UK'];

  const META = [
    { key: 'investment',  label: 'Inversión',      icon: 'payments' },
    { key: 'projects',    label: 'Nº proyectos',   icon: 'folder' },
    { key: 'coordinator', label: 'Coordinador',    icon: 'military_tech' },
  ];

  let state = { metric: 'investment', country: '', min_projects: 0, exclude_universities: false };
  let rows = [];
  let total = { count: 0, total_investment_eur: 0, total_entities: 0 };

  /* ── helpers ──────────────────────────────────────────────── */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmtN = (n) => (Number(n) || 0).toLocaleString('es-ES');
  const fmtMoney = (n) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
  const flag = (cc) => !cc ? '' : String(cc).toUpperCase().replace(/./g, c =>
    String.fromCodePoint(127397 + c.charCodeAt(0)));

  // Cabecera de columna ordenable (clic → ordena por esa métrica)
  const sortableTh = (label, key, w) => `
    <th class="an-sort px-3 py-2.5 text-right ${w} cursor-pointer select-none hover:text-primary transition-colors ${key === state.metric ? 'text-primary font-bold' : ''}" data-sort="${key}" title="Ordenar por ${label}">
      <span class="inline-flex items-center gap-1 justify-end whitespace-nowrap">${label}<span class="an-arrow material-symbols-outlined text-[15px] ${key === state.metric ? '' : 'opacity-0'}">arrow_downward</span></span>
    </th>`;

  /* ── init / render shell ──────────────────────────────────── */
  function init() {
    const root = document.getElementById('analysis-root');
    if (!root) return;
    root.innerHTML = shell();
    bind(root);
    load(true);
  }

  function shell() {
    const metricBtns = META.map(m => `
      <button type="button" data-metric="${m.key}"
        class="an-metric inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${m.key === state.metric ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}">
        <span class="material-symbols-outlined text-[18px]">${m.icon}</span>${m.label}
      </button>`).join('');

    const countryOpts = ['<option value="">Todos los países</option>']
      .concat(COUNTRIES.map(c => `<option value="${c}">${c}</option>`)).join('');

    return `
      <header class="mb-6">
        <h1 class="font-headline text-3xl font-extrabold text-primary tracking-tight">
          <span class="yellow-underline">Análisis</span> de experiencia
        </h1>
        <p class="text-on-surface-variant text-sm mt-1">Ranking de entidades por inversión movilizada y proyectos Erasmus+. Clic en una entidad para ver su ficha y todos sus proyectos.</p>
      </header>

      <div class="bg-white rounded-2xl border border-outline-variant/25 p-4 mb-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-1.5">${metricBtns}</div>
          <div class="h-6 w-px bg-outline-variant/30 mx-1"></div>
          <select id="an-country" class="text-sm border border-outline-variant/40 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40">${countryOpts}</select>
          <select id="an-minproj" class="text-sm border border-outline-variant/40 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            <option value="0">Cualquier nº proyectos</option>
            <option value="3">≥ 3 proyectos</option>
            <option value="5">≥ 5 proyectos</option>
            <option value="10">≥ 10 proyectos</option>
            <option value="20">≥ 20 proyectos</option>
          </select>
          <label class="inline-flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input type="checkbox" id="an-nouni" class="rounded border-outline-variant text-primary focus:ring-primary/40">
            Excluir universidades
          </label>
          <button id="an-export" type="button" class="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-outline-variant/40 hover:border-primary px-3 py-2 rounded-lg transition-colors">
            <span class="material-symbols-outlined text-[18px]">download</span>Exportar CSV
          </button>
        </div>
      </div>

      <div id="an-kpis" class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4"></div>

      <div class="bg-white rounded-2xl border border-outline-variant/25 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-container-low text-xs text-on-surface-variant uppercase">
              <tr>
                <th class="px-3 py-2.5 text-left w-12">#</th>
                <th class="px-3 py-2.5 text-left">Entidad</th>
                <th class="px-3 py-2.5 text-left w-16">País</th>
                ${sortableTh('Proyectos', 'projects', 'w-24')}
                ${sortableTh('Coord.', 'coordinator', 'w-24')}
                ${sortableTh('Inversión movilizada', 'investment', 'w-44')}
              </tr>
            </thead>
            <tbody id="an-tbody">
              <tr><td colspan="6" class="py-8 text-center text-on-surface-variant text-sm">Cargando…</td></tr>
            </tbody>
          </table>
        </div>
        <div id="an-more" class="hidden border-t border-outline-variant/20 p-3 text-center">
          <button type="button" id="an-loadmore" class="text-sm font-semibold text-primary hover:underline">Cargar más</button>
        </div>
      </div>`;
  }

  function setMetric(root, metric) {
    if (state.metric === metric) return;
    state.metric = metric;
    refreshMetricButtons(root);
    updateSortHeaders(root);
    load(true);
  }

  function bind(root) {
    root.querySelectorAll('.an-metric').forEach(b =>
      b.addEventListener('click', () => setMetric(root, b.dataset.metric)));
    root.querySelectorAll('.an-sort').forEach(th =>
      th.addEventListener('click', () => setMetric(root, th.dataset.sort)));
    root.querySelector('#an-country').addEventListener('change', e => { state.country = e.target.value; load(true); });
    root.querySelector('#an-minproj').addEventListener('change', e => { state.min_projects = parseInt(e.target.value, 10) || 0; load(true); });
    root.querySelector('#an-nouni').addEventListener('change', e => { state.exclude_universities = e.target.checked; load(true); });
    root.querySelector('#an-export').addEventListener('click', exportCsv);
    root.querySelector('#an-loadmore').addEventListener('click', () => load(false));
  }

  function refreshMetricButtons(root) {
    root.querySelectorAll('.an-metric').forEach(b => {
      const on = b.dataset.metric === state.metric;
      b.className = `an-metric inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${on ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`;
    });
  }

  function updateSortHeaders(root) {
    root.querySelectorAll('.an-sort').forEach(th => {
      const on = th.dataset.sort === state.metric;
      th.classList.toggle('text-primary', on);
      th.classList.toggle('font-bold', on);
      const arrow = th.querySelector('.an-arrow');
      if (arrow) arrow.classList.toggle('opacity-0', !on);
    });
  }

  /* ── data ─────────────────────────────────────────────────── */
  async function load(reset) {
    const tbody = document.getElementById('an-tbody');
    if (!tbody) return;
    const offset = reset ? 0 : rows.length;
    if (reset) tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-on-surface-variant text-sm">Cargando…</td></tr>`;

    const qs = new URLSearchParams({
      metric: state.metric, limit: String(PAGE), offset: String(offset),
    });
    if (state.country) qs.set('country', state.country);
    if (state.min_projects) qs.set('min_projects', String(state.min_projects));
    if (state.exclude_universities) qs.set('exclude_universities', 'true');

    let data;
    try {
      data = await API.get(`/entities/rankings?${qs.toString()}`);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-error text-sm">No se pudo cargar el ranking. ${esc(e.message || '')}</td></tr>`;
      return;
    }

    const batch = (data && data.results) || [];
    rows = reset ? batch : rows.concat(batch);
    total = { count: data.count || 0, total_investment_eur: data.total_investment_eur || 0, total_entities: data.total_entities || 0 };

    renderKpis();
    renderRows();
    const more = document.getElementById('an-more');
    if (more) more.classList.toggle('hidden', rows.length >= total.count);
  }

  function renderKpis() {
    const host = document.getElementById('an-kpis');
    if (!host) return;
    const kpi = (label, value, sub) => `
      <div class="bg-white rounded-2xl border border-outline-variant/25 p-4">
        <div class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">${esc(label)}</div>
        <div class="text-2xl font-extrabold text-primary leading-tight mt-1">${value}</div>
        ${sub ? `<div class="text-[11px] text-on-surface-variant/70">${esc(sub)}</div>` : ''}
      </div>`;
    host.innerHTML =
      kpi('Entidades (filtro)', fmtN(total.count), `de ${fmtN(total.total_entities)} con ≥2 proyectos`) +
      kpi('Inversión total movilizada', fmtMoney(total.total_investment_eur), 'suma del conjunto filtrado') +
      kpi('Mostrando', fmtN(rows.length), 'ordenadas por ' + (META.find(m => m.key === state.metric)?.label || ''));
  }

  function renderRows() {
    const tbody = document.getElementById('an-tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-on-surface-variant text-sm italic">No hay entidades con esos filtros.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const id = r.oid || r.pic || '';
      return `
      <tr class="border-t border-outline-variant/20 hover:bg-surface-container-low/40 cursor-pointer" data-id="${esc(id)}">
        <td class="px-3 py-2.5 font-bold text-on-surface-variant">${r.rank}</td>
        <td class="px-3 py-2.5">
          <div class="font-semibold text-primary leading-snug truncate max-w-[420px]" title="${esc(r.name)}">${esc(r.name)}</div>
          ${r.is_university ? '<span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Universidad</span>' : ''}
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">${flag(r.country_code)} <span class="text-on-surface-variant text-xs">${esc(r.country_code || '')}</span></td>
        <td class="px-3 py-2.5 text-right font-semibold">${fmtN(r.n_projects)}</td>
        <td class="px-3 py-2.5 text-right text-on-surface-variant">${fmtN(r.n_coord)}</td>
        <td class="px-3 py-2.5 text-right font-bold text-primary whitespace-nowrap">${fmtMoney(r.total_investment_eur)}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => {
      const id = tr.dataset.id;
      if (id && typeof Entities !== 'undefined' && Entities.openFicha) Entities.openFicha(id);
    }));
  }

  /* ── export CSV (de lo cargado) ───────────────────────────── */
  function exportCsv() {
    if (!rows.length) return;
    const head = ['rank','name','country','n_projects','n_coord','investment_eur','oid','pic'];
    const lines = [head.join(',')].concat(rows.map(r => [
      r.rank, '"' + String(r.name || '').replace(/"/g,'""') + '"', r.country_code || '',
      r.n_projects, r.n_coord, r.total_investment_eur, r.oid || '', r.pic || '',
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ranking_entidades_${state.metric}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { init };
})();
