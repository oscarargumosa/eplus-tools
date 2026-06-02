/* ═══════════════════════════════════════════════════════════════
   Movilidades — V1: Card grid layout (3-column)
   ═══════════════════════════════════════════════════════════════ */

const Movilidades = (() => {
  const U = MovilidadesUtils;

  let allItems = [];
  let loaded   = false;
  let bound    = false;
  const state  = { q: '', sort: 'deadline', includePast: false };

  async function init() {
    bindEvents();
    if (!loaded) await load();
    render();
  }

  async function load() {
    const list = document.getElementById('movilidades-list');
    try {
      const data = await API.get('/movilidades');
      allItems = data.items || [];
      loaded = true;
      const meta = document.getElementById('movilidades-meta');
      if (meta && data.fetched_at) {
        const d = new Date(data.fetched_at);
        const fmt = isNaN(d.getTime()) ? data.fetched_at : d.toISOString().slice(0, 10);
        meta.textContent = `Source: SALTO European Training Calendar · last fetched ${fmt}`;
      }
    } catch (err) {
      list.innerHTML = `<div class="col-span-full text-center text-red-600 py-12 text-sm">Could not load mobilities: ${U.escapeHtml(err.message || 'unknown error')}</div>`;
    }
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    const q    = document.getElementById('movilidades-q');
    const sort = document.getElementById('movilidades-sort');
    const past = document.getElementById('movilidades-past');

    if (q) q.addEventListener('input', debounce(() => { state.q = q.value.trim(); render(); }, 180));
    if (sort) sort.addEventListener('change', () => { state.sort = sort.value; render(); });
    if (past) past.addEventListener('change', () => { state.includePast = past.checked; render(); });

    document.getElementById('movilidades-list')?.addEventListener('click', (e) => {
      const card = e.target.closest('[data-salto-id]');
      if (card) openDetail(card.dataset.saltoId);
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function render() {
    const list    = document.getElementById('movilidades-list');
    const counter = document.getElementById('movilidades-count');
    if (!list) return;

    const items = U.filterAndSort(allItems, state);
    if (counter) counter.textContent = items.length;

    if (!items.length) {
      list.innerHTML = `<div class="col-span-full text-center text-on-surface-variant py-12 text-sm">No mobilities match your search.</div>`;
      return;
    }
    list.innerHTML = items.map(renderCard).join('');
  }

  function renderCard(item) {
    const id        = U.escapeHtml(item.salto_id);
    const place     = [item.city, item.country].filter(Boolean).map(U.escapeHtml).join(', ');
    const organiser = (item.organiser_name || '').slice(0, 60);

    return `
    <article data-salto-id="${id}"
      class="bg-surface rounded-2xl border border-outline-variant/30 p-5 hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer flex flex-col gap-3">

      <div class="flex items-start gap-2 justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-primary">${U.escapeHtml(item.type || 'Activity')}</span>
        ${U.deadlinePill(item)}
      </div>

      <h3 class="text-base font-bold text-on-surface leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${U.escapeHtml(item.title || '')}</h3>

      <p class="text-xs text-on-surface-variant" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${U.escapeHtml(item.summary || '')}</p>

      <div class="text-[12px] text-on-surface-variant space-y-1 mt-auto">
        ${place ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">place</span><span>${place}</span></div>` : ''}
        ${item.dates ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">event</span><span>${U.escapeHtml(item.dates)}</span></div>` : ''}
        ${item.deadline_raw ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">schedule</span><span>Apply by <strong>${U.escapeHtml(item.deadline_raw)}</strong></span></div>` : ''}
        ${U.feeIconInline(item)}
      </div>

      <div class="flex items-center justify-between pt-3 border-t border-outline-variant/20">
        <span class="text-[11px] text-on-surface-variant truncate">${U.escapeHtml(organiser)}</span>
        <span class="text-[11px] font-bold text-primary whitespace-nowrap">View →</span>
      </div>
    </article>`;
  }

  function openDetail(saltoId) {
    const item = allItems.find(i => String(i.salto_id) === String(saltoId));
    if (!item) return;
    const overlay = document.getElementById('movilidades-drawer-overlay');
    const content = document.getElementById('movilidades-drawer-content');
    if (!overlay || !content) return;

    content.innerHTML = U.renderDetail(item);
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Idempotent close wiring (mirrors entities.js openFicha pattern):
    // delegated overlay click closes when target is outside the drawer panel,
    // Esc closes, hashchange releases the body scroll lock so SPA navigation
    // can never strand the user.
    if (!document._movilidadesDrawerCloseBound) {
      document._movilidadesDrawerCloseBound = true;
      overlay.addEventListener('click', (e) => {
        if (!e.target.closest('#movilidades-drawer-panel')) closeDetail();
      });
      document.getElementById('movilidades-drawer-close')
        ?.addEventListener('click', closeDetail);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeDetail();
      });
      window.addEventListener('hashchange', () => {
        if (!overlay.classList.contains('hidden')) closeDetail();
      });
    }
  }

  function closeDetail() {
    const overlay = document.getElementById('movilidades-drawer-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  return { init };
})();
