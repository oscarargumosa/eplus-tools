/* ═══════════════════════════════════════════════════════════════
   Convocatorias — Lista de calls UE/ES (funding_unified)
   Patrón espejo de Movilidades: contador prominente, search bar,
   chips de estado, programa filter, cards con drawer detail.
   ═══════════════════════════════════════════════════════════════ */

const Convocatorias = (() => {

  let allItems = [];
  let loaded   = false;
  let bound    = false;
  const state  = { q: '', status: '', programme: '', sort: 'deadline' };

  /* ── helpers ─────────────────────────────────────────────── */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function daysUntil(iso) {
    if (!iso) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return Math.round((d - today) / 86400000);
  }

  function deadlinePill(item) {
    if (item.status === 'forthcoming') {
      return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">Próxima</span>`;
    }
    const d = daysUntil(item.deadline);
    if (d === null) {
      return item.status === 'open'
        ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">Abierta</span>`
        : '';
    }
    if (d < 0)    return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 whitespace-nowrap">Cerrada</span>`;
    if (d === 0)  return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white whitespace-nowrap">Hoy</span>`;
    if (d <= 7)   return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">${d} día${d === 1 ? '' : 's'}</span>`;
    if (d <= 30)  return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">${d} días</span>`;
    return         `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">${d} días</span>`;
  }

  function fmtMoney(n) {
    if (n == null || isNaN(Number(n))) return null;
    const v = Number(n);
    if (v >= 1e9)  return `€${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6)  return `€${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3)  return `€${(v / 1e3).toFixed(0)}k`;
    return `€${v}`;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function sourceBadge(src) {
    const map = {
      sedia:  { label: 'EU · SEDIA', class: 'bg-blue-50 text-blue-700 border-blue-200' },
      salto:  { label: 'Erasmus+ Youth', class: 'bg-purple-50 text-purple-700 border-purple-200' },
      bdns:   { label: 'ES · BDNS', class: 'bg-amber-50 text-amber-800 border-amber-200' },
    };
    const m = map[src] || { label: src || '—', class: 'bg-gray-100 text-gray-700 border-gray-200' };
    return `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${m.class}">${escapeHtml(m.label)}</span>`;
  }

  function availabilityBadge(item) {
    if (!item.available_in_efs) return '';
    const code = escapeHtml(item.source_id || item.call_id || '');
    return `<button type="button"
      class="conv-create-project inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 transition-colors"
      data-action-type="${code}"
      data-title="${escapeHtml(item.title || '')}"
      data-deadline="${escapeHtml(item.deadline || '')}"
      data-grant="${escapeHtml(String(item.budget_per_project_max_eur || ''))}"
      title="Crear un proyecto vinculado a esta convocatoria">
      <span class="material-symbols-outlined text-[12px]" style="font-variation-settings:'FILL' 1">check_circle</span>
      Convocatoria disponible → Crear proyecto
    </button>`;
  }

  /* ── lifecycle ───────────────────────────────────────────── */

  async function init() {
    bindEvents();
    if (!loaded) await load();
    populateProgrammes();
    render();
  }

  async function load() {
    const list = document.getElementById('convocatorias-list');
    try {
      // pedimos todas (limit alto), filtramos client-side para velocidad
      const res = await API.get('/convocatorias?limit=2000');
      const data = (res && res.data) || res || {};
      const raw = data.items || [];

      // Defensa en profundidad: aplicamos los mismos filtros que el backend
      // (por si el servidor todavía no está reiniciado con la nueva versión).
      const today = todayISO();
      allItems = raw.filter(r => {
        if (String(r.source || '').toLowerCase() === 'salto') return false;
        if (String(r.status || '').toLowerCase() === 'closed') return false;
        if (r.deadline && String(r.deadline) < today) return false;
        return true;
      });

      loaded = true;
      const meta = document.getElementById('convocatorias-meta');
      if (meta) {
        const open = allItems.filter(r => String(r.status || '').toLowerCase() === 'open').length;
        const fc   = allItems.filter(r => String(r.status || '').toLowerCase() === 'forthcoming').length;
        const ts   = data.meta && data.meta.generatedAt ? new Date(data.meta.generatedAt).toISOString().slice(0, 10) : null;
        meta.textContent = `Fuente: SEDIA + BDNS · ${open} abiertas · ${fc} próximas${ts ? ' · actualizado ' + ts : ''}`;
      }
    } catch (err) {
      list.innerHTML = `<div class="col-span-full text-center text-red-600 py-12 text-sm">No se pudieron cargar las convocatorias: ${escapeHtml(err.message || 'error desconocido')}</div>`;
    }
  }

  function populateProgrammes() {
    const sel = document.getElementById('convocatorias-programme');
    if (!sel || sel.dataset.populated === '1') return;
    const counts = {};
    for (const c of allItems) {
      const p = c.programme || '—';
      counts[p] = (counts[p] || 0) + 1;
    }
    const opts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `<option value="${escapeHtml(p)}">${escapeHtml(p)} (${n})</option>`)
      .join('');
    sel.insertAdjacentHTML('beforeend', opts);
    sel.dataset.populated = '1';
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    const q    = document.getElementById('convocatorias-q');
    const sort = document.getElementById('convocatorias-sort');
    const prog = document.getElementById('convocatorias-programme');
    const chips = document.getElementById('convocatorias-status-chips');

    if (q)    q.addEventListener('input',   debounce(() => { state.q = q.value.trim(); render(); }, 180));
    if (sort) sort.addEventListener('change', () => { state.sort = sort.value; render(); });
    if (prog) prog.addEventListener('change', () => { state.programme = prog.value; render(); });

    if (chips) {
      chips.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-status]');
        if (!btn) return;
        chips.querySelectorAll('.conv-chip').forEach(c => c.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.status = btn.dataset.status;
        render();
      });
    }

    document.getElementById('convocatorias-list')?.addEventListener('click', (e) => {
      // Create-project button — intercept BEFORE generic card click.
      const btn = e.target.closest('.conv-create-project');
      if (btn) {
        e.stopPropagation();
        createProjectFromCall(btn);
        return;
      }
      const card = e.target.closest('[data-call-id]');
      if (card) openDetail(card.dataset.callId);
    });

    // Semantic search
    const semQ = document.getElementById('convocatorias-semantic-q');
    const semGo = document.getElementById('convocatorias-semantic-go');
    const semClear = document.getElementById('convocatorias-semantic-clear');
    semGo?.addEventListener('click', () => runSemanticSearch(semQ.value));
    semQ?.addEventListener('keydown', e => { if (e.key === 'Enter') runSemanticSearch(semQ.value); });
    semClear?.addEventListener('click', () => {
      semQ.value = '';
      semClear.classList.add('hidden');
      render();
    });
  }

  async function runSemanticSearch(query) {
    if (!query || query.trim().length < 3) return;
    const list = document.getElementById('convocatorias-list');
    list.innerHTML = '<div class="col-span-full text-center text-on-surface-variant py-12 text-sm"><span class="spinner"></span> Buscando con IA…</div>';
    try {
      const res = await API.get('/convocatorias/search-semantic?q=' + encodeURIComponent(query) + '&top=12');
      const items = res.items || [];
      if (!items.length) {
        list.innerHTML = '<div class="col-span-full text-center text-on-surface-variant py-12 text-sm">Sin resultados. Prueba con otras palabras clave.</div>';
        return;
      }
      // Marry semantic results with full feed data (for budget, badges, etc.)
      const enriched = items.map(it => {
        const full = allItems.find(x => x.source_id === it.source_id) || it;
        return { ...full, _semanticScore: it.score, _semanticSnippet: it.snippet };
      });
      list.innerHTML = enriched.map(item => {
        const card = renderCard(item);
        const snippetBlock = `<div class="mt-3 pt-3 border-t border-outline-variant/15 text-[11px] text-on-surface-variant italic">… ${escapeHtml((item._semanticSnippet || '').slice(0, 200))} …</div>`;
        return card.replace('</article>', snippetBlock + '</article>');
      }).join('');
      document.getElementById('convocatorias-semantic-clear')?.classList.remove('hidden');
    } catch (e) {
      list.innerHTML = `<div class="col-span-full text-center text-error py-12 text-sm">Error: ${escapeHtml(e.message || e)}</div>`;
    }
  }

  async function createProjectFromCall(btn) {
    const actionType = btn.dataset.actionType;
    const title      = btn.dataset.title || actionType;
    const deadline   = btn.dataset.deadline || null;
    const grantStr   = btn.dataset.grant || '';
    const grant      = grantStr ? parseFloat(grantStr) : null;

    // If not logged in: redirect to login with redirect hint.
    const token = (window.API && API.getToken && API.getToken());
    if (!token) {
      sessionStorage.setItem('post_login_create_call', JSON.stringify({ actionType, title, deadline, grant }));
      location.hash = '#auth';
      return;
    }

    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner inline-block"></span> Creando…';
    try {
      const project = await API.post('/intake/projects', {
        name: title.slice(0, 200),
        type: actionType,
        deadline: deadline || null,
        eu_grant: grant || 0,
      });
      const pid = project?.id || project?.data?.id;
      // Navigate to My Projects and open the new one.
      location.hash = '#my-projects';
      if (pid && typeof window.Intake !== 'undefined' && typeof Intake.openProject === 'function') {
        setTimeout(() => Intake.openProject(pid), 200);
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      alert('Error creando proyecto: ' + (err.message || err));
    }
  }

  /* ── render ─────────────────────────────────────────────── */

  function filterAndSort() {
    let out = allItems.slice();

    if (state.status) out = out.filter(i => String(i.status || '').toLowerCase() === state.status);
    if (state.programme) out = out.filter(i => i.programme === state.programme);

    if (state.q) {
      const needle = state.q.toLowerCase();
      out = out.filter(i =>
        [i.title, i.summary_en, i.summary_es, i.programme, i.sub_programme, i.source_id, ...(i.keywords || [])]
          .filter(Boolean).join(' ').toLowerCase().includes(needle)
      );
    }

    if (state.sort === 'deadline') {
      out.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });
    } else if (state.sort === 'budget') {
      out.sort((a, b) => (Number(b.budget_total_eur) || 0) - (Number(a.budget_total_eur) || 0));
    } else if (state.sort === 'title') {
      out.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    return out;
  }

  function render() {
    const list    = document.getElementById('convocatorias-list');
    const counter = document.getElementById('convocatorias-count');
    if (!list) return;

    const items = filterAndSort();
    if (counter) counter.textContent = items.length;

    if (!items.length) {
      list.innerHTML = `<div class="col-span-full text-center text-on-surface-variant py-12 text-sm">No hay convocatorias que coincidan con la búsqueda.</div>`;
      return;
    }
    list.innerHTML = items.map(renderCard).join('');
  }

  function renderCard(item) {
    const id        = escapeHtml(item.call_id);
    const programme = item.sub_programme || item.programme || '';
    const summary   = item.summary_es || item.summary_en || '';
    const totalBudget = fmtMoney(item.budget_total_eur);
    const perProj   = fmtMoney(item.budget_per_project_max_eur || item.budget_per_project_min_eur);

    // Línea destacada: deadline a la izquierda, €/proyecto a la derecha
    const deadlineCell = item.deadline
      ? `<div class="flex items-center gap-1.5 text-on-surface">
           <span class="material-symbols-outlined text-[16px] text-primary">schedule</span>
           <span class="text-[12px]"><span class="text-on-surface-variant">Deadline:</span> <strong>${escapeHtml(fmtDate(item.deadline))}</strong></span>
         </div>`
      : '';

    const perProjCell = perProj
      ? `<div class="flex items-center gap-1.5 text-emerald-700">
           <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1">euro</span>
           <span class="text-[12px] font-bold">Hasta ${escapeHtml(perProj)}/proyecto</span>
         </div>`
      : (totalBudget
          ? `<div class="flex items-center gap-1.5 text-emerald-700">
               <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1">euro</span>
               <span class="text-[12px] font-bold">${escapeHtml(totalBudget)} total</span>
             </div>`
          : '');

    const moneyRow = (deadlineCell || perProjCell)
      ? `<div class="flex items-center justify-between gap-2 flex-wrap mt-auto pt-2 border-t border-outline-variant/15">
           ${deadlineCell}
           ${perProjCell}
         </div>`
      : '';

    return `
    <article data-call-id="${id}"
      class="bg-surface rounded-2xl border border-outline-variant/30 p-5 hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer flex flex-col gap-3">

      <div class="flex items-start gap-2 justify-between flex-wrap">
        ${availabilityBadge(item) || sourceBadge(item.source)}
        ${deadlinePill(item)}
      </div>

      <h3 class="text-base font-bold text-on-surface leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(item.title || '')}</h3>

      ${programme ? `<div class="text-[11px] font-semibold text-primary uppercase tracking-wider truncate">${escapeHtml(programme)}</div>` : ''}

      ${summary ? `<p class="text-xs text-on-surface-variant" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(summary)}</p>` : ''}

      ${moneyRow}

      <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20">
        <span class="text-[11px] text-on-surface-variant truncate font-mono">${escapeHtml(item.source_id || '')}</span>
        <span class="text-[11px] font-bold text-primary whitespace-nowrap">Ver →</span>
      </div>
    </article>`;
  }

  /* ── detail drawer ───────────────────────────────────────── */

  function row(label, val) {
    if (!val || val === 'N/A') return '';
    return `<div class="flex flex-col gap-0.5">
      <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">${escapeHtml(label)}</span>
      <span class="text-sm text-on-surface">${escapeHtml(val)}</span>
    </div>`;
  }

  function block(label, val) {
    if (!val || val === 'N/A') return '';
    return `<div>
      <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">${escapeHtml(label)}</div>
      <p class="text-sm text-on-surface whitespace-pre-line">${escapeHtml(val)}</p>
    </div>`;
  }

  function renderSummaryTable(item) {
    // 20-row structured summary table (per Oscar's spec). Uses AI-extracted
    // fields when feed lacks them.
    const fmt = (v) => (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) ? null : v;
    const money = (n) => n ? `€${Number(n).toLocaleString('es-ES')}` : null;
    const pct = (n) => n != null ? `${n}%` : null;
    const list = (arr) => Array.isArray(arr) && arr.length ? arr.join(' · ') : null;

    const rows = [
      ['Programa',                            fmt(item.programme)],
      ['Código de la convocatoria',           fmt(item.source_id)],
      ['Objetivo principal',                  fmt(item.main_objective)],
      ['Presupuesto total',                   money(item.budget_total_eur)],
      ['Presupuesto por proyecto',            money(item.budget_per_project_max_eur) || money(item.budget_per_project_min_eur)],
      ['Nº estimado de proyectos',            fmt(item.expected_grants)],
      ['% financiación europea',              pct(item.cofinancing_pct)],
      ['Cofinanciación requerida',            item.cofinancing_pct != null ? `${100 - Number(item.cofinancing_pct)}% del solicitante` : null],
      ['Deadline',                            fmt(fmtDate(item.deadline))],
      ['Duración del proyecto',               item.duration_months ? `${item.duration_months} meses` : null],
      ['Tipo de convocatoria',                fmt(item.call_type) || fmt(item.deadline_model)],
      ['Dirección General / Agencia',         fmt(item.managing_agency)],
      ['Plataforma de presentación',          fmt(item.submission_platform) || 'EU Funding & Tenders Portal'],
      ['Nº mínimo de socios',                 fmt(item.min_partners) || fmt(item.min_countries)],
      ['Países mínimos requeridos',           fmt(item.min_countries)],
      ['Tipos de socios elegibles',           list(item.eligible_entity_types)],
      ['Tipo de coordinador permitido',       list(item.coordinator_types_allowed)],
      ['Actividades financiables',            list(item.eligible_activities)],
      ['Público objetivo',                    fmt(item.audience_ai) || fmt(item.audience)],
      ['Prioridades temáticas',               list(item.themes_ai) || list(item.crossCuttingPriorities)],
    ];
    const present = rows.filter(([, v]) => v !== null);
    if (!present.length) return '';
    return `
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Tabla resumen</div>
        <table class="w-full text-sm">
          <tbody>
            ${present.map(([k, v]) => `
              <tr class="border-b border-outline-variant/15 last:border-b-0">
                <td class="py-2 pr-3 text-on-surface-variant text-[12px] font-semibold w-1/3 align-top">${escapeHtml(k)}</td>
                <td class="py-2 text-on-surface text-[13px] align-top">${escapeHtml(String(v))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderFaq(item) {
    if (!item.faq || !item.faq.length) return '';
    return `
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Preguntas frecuentes</div>
        <div class="space-y-1.5">
          ${item.faq.map((f, i) => `
            <details class="group rounded-lg bg-surface-container-low border border-outline-variant/15 px-3 py-2.5 ${i === 0 ? 'open' : ''}" ${i === 0 ? 'open' : ''}>
              <summary class="cursor-pointer text-sm font-semibold text-on-surface flex items-center gap-2 list-none">
                <span class="material-symbols-outlined text-[16px] text-primary transition-transform group-open:rotate-90">chevron_right</span>
                <span class="flex-1">${escapeHtml(f.q || '')}</span>
              </summary>
              <div class="mt-2 ml-6 text-[13px] text-on-surface whitespace-pre-wrap">${escapeHtml(f.a || '')}</div>
            </details>`).join('')}
        </div>
      </div>`;
  }

  function renderListSection(label, arr, icon = 'list') {
    if (!Array.isArray(arr) || !arr.length) return '';
    return `
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2 flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px]">${icon}</span>${escapeHtml(label)}
        </div>
        <ul class="space-y-1 list-disc list-inside text-[13px] text-on-surface">
          ${arr.map(it => `<li>${escapeHtml(it)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function renderDetail(item) {
    const programme = [item.programme, item.sub_programme].filter(Boolean).join(' · ');
    const summary   = item.summary_es || item.summary_en || '';
    const budget    = fmtMoney(item.budget_total_eur);
    const minProj   = fmtMoney(item.budget_per_project_min_eur);
    const maxProj   = fmtMoney(item.budget_per_project_max_eur);
    const projRange = (minProj && maxProj && minProj !== maxProj) ? `${minProj} – ${maxProj}` : (maxProj || minProj);

    const apply = item.apply_url
      ? `<a href="${escapeHtml(item.apply_url)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1b1464] text-[#fbff12] text-sm font-bold hover:bg-[#1b1464]/80 transition-colors">
            <span>Solicitar</span>
            <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const details = item.details_url
      ? `<a href="${escapeHtml(item.details_url)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-transparent border border-outline-variant/30 text-on-surface-variant text-sm font-bold hover:bg-[#f8f8f8] transition-colors">
            <span>Ver en portal</span>
            <span class="material-symbols-outlined" style="font-size:16px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const docs = (item.documents || []).slice(0, 12).map(d => `
      <li><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" class="text-sm text-primary hover:underline">${escapeHtml(d.label || d.url)}</a></li>
    `).join('');

    const keywords = (item.keywords || []).slice(0, 12).map(k =>
      `<span class="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/30">${escapeHtml(k)}</span>`
    ).join(' ');

    const priorities = (item.crossCuttingPriorities || []).map(k =>
      `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">${escapeHtml(k)}</span>`
    ).join(' ');

    return `
      <div class="space-y-5">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-2">
            ${sourceBadge(item.source)}
            ${deadlinePill(item)}
          </div>
          <h2 class="text-xl font-bold text-on-surface leading-tight pr-12">${escapeHtml(item.title || '')}</h2>
          ${programme ? `<div class="text-[12px] font-semibold text-primary uppercase tracking-wider mt-1">${escapeHtml(programme)}</div>` : ''}
        </div>

        ${summary ? `<p class="text-sm text-on-surface-variant">${escapeHtml(summary)}</p>` : ''}

        ${renderSummaryTable(item)}

        ${renderListSection('Actividades financiables', item.eligible_activities, 'check_circle')}
        ${renderListSection('Gastos elegibles', item.eligible_costs, 'paid')}
        ${renderListSection('Gastos NO permitidos', item.non_eligible_costs, 'block')}
        ${renderListSection('Resultados esperados', item.expected_outcomes, 'rocket_launch')}

        ${renderFaq(item)}

        ${priorities ? `<div><div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Prioridades transversales</div><div class="flex flex-wrap gap-1.5">${priorities}</div></div>` : ''}
        ${keywords ? `<div><div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Palabras clave</div><div class="flex flex-wrap gap-1.5">${keywords}</div></div>` : ''}

        ${docs ? `<div><div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Documentos oficiales</div><ul class="list-disc list-inside space-y-1">${docs}</ul></div>` : ''}

        <div class="pt-4 border-t border-outline-variant/20">
          <button type="button" id="conv-chat-open"
            data-source-id="${escapeHtml(item.source_id || '')}"
            data-title="${escapeHtml(item.title || '')}"
            class="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-50 border-2 border-purple-200 text-purple-800 text-sm font-bold hover:bg-purple-100 transition-colors">
            <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1">smart_toy</span>
            Chat con esta convocatoria
          </button>
        </div>

        <div class="flex items-center justify-between pt-4 border-t border-outline-variant/20 flex-wrap gap-3">
          <div>${details}</div>
          <div>${apply}</div>
        </div>
      </div>
    `;
  }

  /* ── per-call chat ───────────────────────────────────────── */
  let _chatThread = []; // [{role, content}]
  function openChat(sourceId, title) {
    _chatThread = [];
    const content = document.getElementById('convocatorias-drawer-content');
    if (!content) return;
    content.innerHTML = `
      <div class="flex flex-col h-full">
        <div class="flex items-center gap-2 pb-3 border-b border-outline-variant/20 mb-3">
          <button type="button" id="conv-chat-back" class="text-on-surface-variant hover:text-primary">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] uppercase tracking-wider text-on-surface-variant">Chat con la convocatoria</div>
            <div class="text-sm font-bold text-on-surface truncate">${escapeHtml(title)}</div>
          </div>
        </div>
        <div id="conv-chat-messages" class="flex-1 overflow-y-auto space-y-3 mb-3 min-h-[300px]">
          <div class="text-xs text-on-surface-variant text-center py-6">
            Pregúntame lo que quieras sobre esta convocatoria: presupuesto, quién puede aplicar, criterios de evaluación, fechas, qué entregar… Solo respondo en base al documento oficial.
          </div>
        </div>
        <div class="border-t border-outline-variant/20 pt-3">
          <form id="conv-chat-form" class="flex gap-2">
            <input id="conv-chat-input" type="text" placeholder="Escribe tu pregunta..."
              class="flex-1 px-3 py-2 rounded-xl border border-outline-variant/40 focus:border-primary focus:outline-none text-sm">
            <button type="submit" class="px-4 py-2 rounded-xl bg-primary text-[#fbff12] text-sm font-bold hover:bg-primary/80">Enviar</button>
          </form>
          <div class="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            ${['¿Cuál es el presupuesto?','¿Quién puede aplicar?','¿Qué documentos hay que entregar?','¿Cuáles son los criterios de evaluación?'].map(s =>
              `<button type="button" class="conv-chat-suggest px-2 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant" data-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`
            ).join('')}
          </div>
        </div>
      </div>`;

    document.getElementById('conv-chat-back')?.addEventListener('click', () => {
      const item = allItems.find(i => i.source_id === sourceId);
      if (item) content.innerHTML = renderDetail(item);
    });
    document.getElementById('conv-chat-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const input = document.getElementById('conv-chat-input');
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      await sendChat(sourceId, q);
    });
    document.querySelectorAll('.conv-chat-suggest').forEach(btn => {
      btn.addEventListener('click', () => sendChat(sourceId, btn.dataset.q));
    });
  }

  async function sendChat(sourceId, q) {
    const msgs = document.getElementById('conv-chat-messages');
    if (!msgs) return;
    if (_chatThread.length === 0) msgs.innerHTML = ''; // clear placeholder
    _chatThread.push({ role: 'user', content: q });
    msgs.insertAdjacentHTML('beforeend', `
      <div class="flex justify-end">
        <div class="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-white text-sm">${escapeHtml(q)}</div>
      </div>`);
    const thinkingId = 'thinking_' + Date.now();
    msgs.insertAdjacentHTML('beforeend', `
      <div id="${thinkingId}" class="flex justify-start">
        <div class="max-w-[80%] px-3 py-2 rounded-2xl rounded-tl-sm bg-surface-container text-on-surface-variant text-sm"><span class="spinner inline-block"></span> Pensando…</div>
      </div>`);
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const res = await API.post(`/convocatorias/${encodeURIComponent(sourceId)}/chat`, { messages: _chatThread });
      const ans = res.answer || '(sin respuesta)';
      _chatThread.push({ role: 'assistant', content: ans });
      document.getElementById(thinkingId)?.remove();
      msgs.insertAdjacentHTML('beforeend', `
        <div class="flex justify-start">
          <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-purple-50 border border-purple-200 text-on-surface text-sm whitespace-pre-wrap">${escapeHtml(ans)}</div>
        </div>`);
      msgs.scrollTop = msgs.scrollHeight;
    } catch (e) {
      document.getElementById(thinkingId)?.remove();
      const msg = (e && (e.code === 'NO_VECTORS' || /no vectors/i.test(e.message || '')))
        ? 'Esta convocatoria aún no está indexada para chat. Aparecerán pronto las nuevas.'
        : 'Error: ' + (e.message || e);
      msgs.insertAdjacentHTML('beforeend', `
        <div class="flex justify-start">
          <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-red-50 border border-red-200 text-error text-sm">${escapeHtml(msg)}</div>
        </div>`);
    }
  }

  function openDetail(callId) {
    const item = allItems.find(i => String(i.call_id) === String(callId));
    if (!item) return;
    const overlay = document.getElementById('convocatorias-drawer-overlay');
    const content = document.getElementById('convocatorias-drawer-content');
    if (!overlay || !content) return;

    content.innerHTML = renderDetail(item);
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (!document._convocatoriasDrawerCloseBound) {
      document._convocatoriasDrawerCloseBound = true;
      overlay.addEventListener('click', (e) => {
        if (!e.target.closest('#convocatorias-drawer-panel')) closeDetail();
      });
      document.getElementById('convocatorias-drawer-close')
        ?.addEventListener('click', closeDetail);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeDetail();
      });
      window.addEventListener('hashchange', () => {
        if (!overlay.classList.contains('hidden')) closeDetail();
      });
    }
    // Drawer-level delegation: chat button (re-renders on each open, so bind inside drawer scope)
    content.addEventListener('click', (e) => {
      const btn = e.target.closest('#conv-chat-open');
      if (btn) {
        e.preventDefault();
        openChat(btn.dataset.sourceId, btn.dataset.title);
      }
    });
  }

  function closeDetail() {
    const overlay = document.getElementById('convocatorias-drawer-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  return { init };
})();
