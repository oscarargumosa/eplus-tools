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
        const loc = I18N.lang === 'en' ? 'en-GB' : 'es-ES';
        const fmt = isNaN(d.getTime()) ? data.fetched_at : d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
        meta.textContent = _t('Fuente: SALTO European Training Calendar · actualizado el {fecha}', { fecha: fmt });
      }
    } catch (err) {
      list.innerHTML = `<div class="col-span-full text-center text-error py-12 text-sm">${_t('No se han podido cargar las movilidades: {error}', { error: U.escapeHtml(err.message || _t('error desconocido')) })}</div>`;
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
      list.innerHTML = `<div class="col-span-full text-center text-on-surface-variant py-12 text-sm">${_t('No hay movilidades que coincidan con tu búsqueda.')}</div>`;
      return;
    }
    list.innerHTML = items.map(renderCard).join('');
  }

  function renderCard(item) {
    const id        = U.escapeHtml(item.salto_id);
    const place     = [item.city, item.country].filter(Boolean).map(U.escapeHtml).join(', ');
    const organiser = (item.organiser_name || '').slice(0, 60);
    const dl        = U.dateParts(item.deadline_iso);

    return `
    <article data-salto-id="${id}"
      class="bg-cream rounded-3xl border border-transparent p-5 hover:shadow-lg hover:shadow-primary/10 hover:border-primary/25 transition-all cursor-pointer flex flex-col gap-3">

      <div class="flex items-start gap-2 justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-primary">${U.escapeHtml(item.type || _t('Actividad'))}</span>
        ${U.deadlinePill(item)}
      </div>

      <h3 class="text-base font-semibold text-primary leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${U.escapeHtml(item.title || '')}</h3>

      <p class="text-xs text-on-surface-variant" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${U.escapeHtml(item.summary || '')}</p>

      <div class="text-[12px] text-on-surface-variant space-y-1 mt-auto">
        ${place ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">place</span><span>${place}</span></div>` : ''}
        ${item.dates ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">event</span><span>${U.escapeHtml(item.dates)}</span></div>` : ''}
        ${item.deadline_raw && !dl ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">schedule</span><span>${_t('Inscripción hasta {fecha}', { fecha: '<strong>' + U.escapeHtml(item.deadline_raw) + '</strong>' })}</span></div>` : ''}
        ${dl ? '' : U.feeIconInline(item)}
      </div>

      ${dl ? `
      <div class="flex items-end justify-between gap-3">
        <div class="bg-white rounded-2xl px-3 py-2 min-w-[92px]" title="${U.escapeHtml(item.deadline_raw || '')}">
          <div class="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">${_t('Inscripción hasta')}</div>
          <div class="flex items-baseline gap-1.5 text-primary">
            <span class="text-[30px] font-light leading-none tabular-nums">${U.escapeHtml(dl.day)}</span>
            <span class="text-[12px] leading-tight">${U.escapeHtml(dl.month)}<br>${U.escapeHtml(dl.year)}</span>
          </div>
        </div>
        <div class="text-[12px]">${U.feeIconInline(item)}</div>
      </div>` : ''}

      <div class="flex items-center justify-between gap-2 pt-3 border-t border-outline-variant">
        <span class="text-[11px] text-on-surface-variant truncate">${U.escapeHtml(organiser)}</span>
        <span class="text-[11px] font-bold text-primary whitespace-nowrap bg-secondary-fixed rounded-full px-3 py-1">${_t('Ver →')}</span>
      </div>
    </article>`;
  }

  function openDetail(saltoId) {
    // Muro de login: explorar el listado es libre; abrir el detalle exige cuenta.
    if (typeof App !== 'undefined' && App.requireLogin && !App.requireLogin({ what: 'el detalle de esta movilidad' })) return; // i18n-no (requireLogin no usa «what»)
    const item = allItems.find(i => String(i.salto_id) === String(saltoId));
    if (!item) return;
    if (typeof Track !== 'undefined') Track.event('mobility_opened', { route: 'movilidades', ref_id: saltoId });
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
