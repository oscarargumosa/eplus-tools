/* ═══════════════════════════════════════════════════════════════
   Entities — Partner Engine (atlas Erasmus+)
   ═══════════════════════════════════════════════════════════════
   - Listado paginado con scroll infinito
   - Filtros laterales (calidad, país, tipo, idioma, contacto)
   - Búsqueda full-text
   - Ficha overlay (S3 rellena contenido)
   - Estilo Ana: cards con hover lift, donuts amarillos para scores
   ═══════════════════════════════════════════════════════════════ */

const Entities = (() => {
  let initDone = false;
  let observer = null;

  const state = {
    q: '',
    country: '',
    category: '',
    tier: '',
    language: '',
    has_email: false,
    has_phone: false,
    sort: 'quality',
    page: 1,
    limit: 24,
  };

  let totalCount = 0;
  let isLoading = false;
  let hasMore = true;
  let firstStatsLoaded = false;

  /* ── Init ─────────────────────────────────────────────────────── */
  function init() {
    if (!initDone) {
      bindEvents();
      restoreState();
      initDone = true;
    }
    loadGlobalStats();
    loadFacets();
    loadList(true);
    // Si Atlas redirigió aquí con un oid pendiente de abrir, hazlo
    try {
      const pending = sessionStorage.getItem('entitiesOpenOid');
      if (pending) {
        sessionStorage.removeItem('entitiesOpenOid');
        setTimeout(() => openFicha(pending), 200);
      }
    } catch {}
  }

  /* ── State persistence (sessionStorage) ──────────────────────── */
  function saveState() {
    try { sessionStorage.setItem('entitiesState', JSON.stringify(state)); } catch {}
  }
  function restoreState() {
    try {
      const raw = sessionStorage.getItem('entitiesState');
      if (!raw) return;
      const s = JSON.parse(raw);
      Object.assign(state, s, { page: 1 }); // siempre arrancar en pag 1
      // reflect in UI
      const q = document.getElementById('entities-q'); if (q) q.value = state.q || '';
      const sortSel = document.getElementById('entities-sort'); if (sortSel) sortSel.value = state.sort || 'quality';
      const tierEl = document.querySelector(`input[name="ent-tier"][value="${state.tier || ''}"]`); if (tierEl) tierEl.checked = true;
      const heEl = document.getElementById('ent-has-email'); if (heEl) heEl.checked = !!state.has_email;
      const hpEl = document.getElementById('ent-has-phone'); if (hpEl) hpEl.checked = !!state.has_phone;
    } catch {}
  }

  /* ── Stats globales (KPI hero) ───────────────────────────────── */
  async function loadGlobalStats() {
    if (firstStatsLoaded) return;
    firstStatsLoaded = true;
    try {
      const stat = await API.get('/entities/stats/global');
      const v = stat?.value || {};
      const totalEl = document.getElementById('entities-total-real');
      if (totalEl && v.total_alive) totalEl.textContent = formatNumber(v.total_alive);
      const meta = document.getElementById('entities-sync-meta');
      if (meta && stat?.computed_at) {
        const when = new Date(stat.computed_at);
        meta.textContent = `Sincronizado ${relativeTime(when)}`;
      }
    } catch { /* silencioso, hero queda con valor por defecto */ }
  }

  /* ── Facets (poblar filtros con conteos reales) ──────────────── */
  async function loadFacets() {
    try {
      const [byCountry, byCategory, byLanguage] = await Promise.all([
        API.get('/entities/stats/by-country').catch(() => null),
        API.get('/entities/stats/by-category').catch(() => null),
        API.get('/entities/stats/by-language').catch(() => null),
      ]);
      renderFilterList('entities-filter-country', byCountry?.value || [], 'country',
        (it) => `${countryFlag(it.country_code)} ${it.country_code}`,
        (it) => it.country_code,
        (it) => it.count
      );
      renderFilterList('entities-filter-category', byCategory?.value || [], 'category',
        (it) => capitalize(it.category),
        (it) => it.category,
        (it) => it.count,
        12
      );
      renderFilterList('entities-filter-language', byLanguage?.value || [], 'language',
        (it) => (it.lang || '').toUpperCase(),
        (it) => it.lang,
        (it) => it.count,
        12
      );
    } catch { /* silencioso */ }
  }

  function renderFilterList(containerId, items, key, labelFn, valueFn, countFn, limit = 20) {
    const el = document.getElementById(containerId);
    if (!el || !items?.length) return;
    const top = items.slice(0, limit);
    el.innerHTML = top.map(it => {
      const v = valueFn(it);
      const checked = state[key] === v ? 'checked' : '';
      return `
        <label class="filter-radio">
          <input type="radio" name="ent-${key}" value="${esc(v)}" ${checked}>
          <span class="flex-1 truncate">${labelFn(it)}</span>
          <span class="filter-count">${formatNumber(countFn(it))}</span>
        </label>
      `;
    }).join('') + `
      <label class="filter-radio">
        <input type="radio" name="ent-${key}" value="" ${state[key] ? '' : 'checked'}>
        <span class="text-on-surface-variant">Todas</span>
      </label>
    `;
    // bind change
    el.querySelectorAll(`input[name="ent-${key}"]`).forEach(inp => {
      inp.addEventListener('change', () => {
        state[key] = inp.value;
        state.page = 1;
        saveState();
        renderActiveChips();
        loadList(true);
      });
    });
  }

  /* ── Bind events ─────────────────────────────────────────────── */
  function bindEvents() {
    // Searchbar
    const q = document.getElementById('entities-q');
    q?.addEventListener('input', debounce(() => {
      state.q = q.value.trim();
      state.page = 1;
      saveState();
      renderActiveChips();
      loadList(true);
    }, 300));

    // Sort
    document.getElementById('entities-sort')?.addEventListener('change', (e) => {
      state.sort = e.target.value;
      state.page = 1;
      saveState();
      loadList(true);
    });

    // Tier (radios)
    document.querySelectorAll('input[name="ent-tier"]').forEach(inp => {
      inp.addEventListener('change', () => {
        state.tier = inp.value;
        state.page = 1;
        saveState();
        renderActiveChips();
        loadList(true);
      });
    });

    // has_email / has_phone
    document.getElementById('ent-has-email')?.addEventListener('change', (e) => {
      state.has_email = e.target.checked;
      state.page = 1;
      saveState();
      renderActiveChips();
      loadList(true);
    });
    document.getElementById('ent-has-phone')?.addEventListener('change', (e) => {
      state.has_phone = e.target.checked;
      state.page = 1;
      saveState();
      renderActiveChips();
      loadList(true);
    });

    // Clear filters
    document.getElementById('entities-clear')?.addEventListener('click', clearAllFilters);

    // Smart shortlist button
    document.getElementById('entities-smart-btn')?.addEventListener('click', openSmartModal);

    // Ficha overlay close on backdrop / ESC
    document.getElementById('entity-ficha-backdrop')?.addEventListener('click', closeFicha);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFicha();
    });

    // Infinite scroll observer
    const sentinel = document.getElementById('entities-sentinel');
    if (sentinel && 'IntersectionObserver' in window) {
      observer?.disconnect();
      observer = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting) && !isLoading && hasMore) {
          state.page++;
          loadList(false);
        }
      }, { rootMargin: '200px' });
      observer.observe(sentinel);
    }
  }

  function clearAllFilters() {
    state.q = '';
    state.country = '';
    state.category = '';
    state.tier = '';
    state.language = '';
    state.has_email = false;
    state.has_phone = false;
    state.sort = 'quality';
    state.page = 1;
    saveState();
    // reflect in UI
    const q = document.getElementById('entities-q'); if (q) q.value = '';
    document.querySelectorAll('input[name="ent-tier"]').forEach(i => i.checked = i.value === '');
    document.querySelectorAll('input[name="ent-country"]').forEach(i => i.checked = i.value === '');
    document.querySelectorAll('input[name="ent-category"]').forEach(i => i.checked = i.value === '');
    document.querySelectorAll('input[name="ent-language"]').forEach(i => i.checked = i.value === '');
    const he = document.getElementById('ent-has-email'); if (he) he.checked = false;
    const hp = document.getElementById('ent-has-phone'); if (hp) hp.checked = false;
    const sortSel = document.getElementById('entities-sort'); if (sortSel) sortSel.value = 'quality';
    renderActiveChips();
    loadList(true);
  }

  /* ── Render active filter chips ──────────────────────────────── */
  function renderActiveChips() {
    const el = document.getElementById('entities-active-chips');
    if (!el) return;
    const chips = [];
    if (state.q)        chips.push(chip('Búsqueda', state.q,        () => { state.q = ''; document.getElementById('entities-q').value = ''; afterChipChange(); }));
    if (state.tier)     chips.push(chip('Calidad', tierLabel(state.tier),  () => { state.tier = ''; uncheck('ent-tier'); afterChipChange(); }));
    if (state.country)  chips.push(chip('País',    state.country,    () => { state.country = ''; uncheck('ent-country'); afterChipChange(); }));
    if (state.category) chips.push(chip('Tipo',    capitalize(state.category), () => { state.category = ''; uncheck('ent-category'); afterChipChange(); }));
    if (state.language) chips.push(chip('Idioma',  state.language.toUpperCase(), () => { state.language = ''; uncheck('ent-language'); afterChipChange(); }));
    if (state.has_email) chips.push(chip('Contacto', 'Con email',     () => { state.has_email = false; document.getElementById('ent-has-email').checked = false; afterChipChange(); }));
    if (state.has_phone) chips.push(chip('Contacto', 'Con teléfono',  () => { state.has_phone = false; document.getElementById('ent-has-phone').checked = false; afterChipChange(); }));

    el.innerHTML = '';
    chips.forEach(c => el.appendChild(c));

    const clearBtn = document.getElementById('entities-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', chips.length === 0);
  }

  function chip(label, value, onRemove) {
    const span = document.createElement('span');
    span.className = 'inline-flex items-center gap-1.5 text-xs font-semibold bg-secondary-fixed text-primary px-3 py-1 rounded-full';
    span.innerHTML = `<span class="opacity-60 font-medium">${esc(label)}:</span> ${esc(value)}`;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-primary/10';
    x.innerHTML = `<span class="material-symbols-outlined text-[14px] leading-none">close</span>`;
    x.addEventListener('click', onRemove);
    span.appendChild(x);
    return span;
  }
  function uncheck(name) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(i => i.checked = i.value === '');
  }
  function afterChipChange() {
    state.page = 1;
    saveState();
    renderActiveChips();
    loadList(true);
  }

  /* ── Load list ───────────────────────────────────────────────── */
  async function loadList(reset) {
    if (isLoading) return;
    isLoading = true;
    const grid = document.getElementById('entities-grid');
    const countEl = document.getElementById('entities-results-count');
    const loadEl = document.getElementById('entities-loadmore');
    if (!grid) { isLoading = false; return; }

    if (reset) {
      grid.innerHTML = renderSkeleton(8);
      hasMore = true;
      state.page = 1;
    }
    if (loadEl) loadEl.textContent = 'Cargando…';

    try {
      const params = new URLSearchParams();
      if (state.q)        params.set('q', state.q);
      if (state.country)  params.set('country', state.country);
      if (state.category) params.set('category', state.category);
      if (state.tier)     params.set('tier', state.tier);
      if (state.language) params.set('language', state.language);
      if (state.has_email) params.set('has_email', '1');
      if (state.has_phone) params.set('has_phone', '1');
      params.set('sort', state.sort);
      params.set('page', state.page);
      params.set('limit', state.limit);

      const res = await API.get(`/entities?${params.toString()}`);
      totalCount = res.meta?.total ?? 0;

      if (countEl) {
        countEl.innerHTML = totalCount === 0
          ? '<span class="text-on-surface-variant">Sin resultados</span>'
          : `<strong class="text-primary">${formatNumber(totalCount)}</strong> entidades`;
      }

      if (reset) grid.innerHTML = '';
      const cards = (res.rows || []).map(renderCard).join('');
      grid.insertAdjacentHTML('beforeend', cards);

      // Bind cards click
      grid.querySelectorAll('[data-oid]:not([data-bound])').forEach(card => {
        card.dataset.bound = '1';
        card.addEventListener('click', () => openFicha(card.dataset.oid));
      });

      hasMore = state.page < (res.meta?.pages || 1);
      if (!hasMore && loadEl) {
        loadEl.textContent = totalCount > 0
          ? `Has visto las ${formatNumber(totalCount)} entidades disponibles`
          : 'Prueba a quitar filtros o ampliar la búsqueda';
      } else if (loadEl) {
        loadEl.textContent = '';
      }

      if (reset && totalCount === 0) {
        grid.innerHTML = renderEmptyState();
      }
    } catch (e) {
      if (countEl) countEl.innerHTML = '<span class="text-error">Error cargando</span>';
      if (grid && reset) grid.innerHTML = `<div class="col-span-full py-8 text-center text-error text-sm">${esc(e.message || 'Error')}</div>`;
    } finally {
      isLoading = false;
    }
  }

  /* ── Card render (Ana-style, v2 — barras etiquetadas) ─────── */
  function renderCard(o) {
    const logo = o.logo_url
      ? `<img src="${esc(o.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"
           class="w-14 h-14 rounded-xl object-contain bg-white border border-outline-variant/20 shrink-0"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0',innerHTML:'<span class=\\'material-symbols-outlined text-primary text-[28px]\\'>apartment</span>'}))">`
      : `<div class="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
           <span class="material-symbols-outlined text-primary text-[28px]">apartment</span>
         </div>`;

    const flag = countryFlag(o.country_code);
    const tier = tierBadge(o.quality_tier);
    const cat  = o.category
      ? `<span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">${esc(o.category)}</span>`
      : '';
    const cms = o.cms_detected
      ? `<span class="text-[10px] text-on-surface-variant/60 ml-auto self-center">${esc(o.cms_detected)}</span>`
      : '';

    return `
      <button type="button" data-oid="${esc(o.oid)}"
        class="entity-card group bg-white rounded-2xl border border-outline-variant/25 p-5 text-left
               hover:border-primary/30 hover:shadow-[0_10px_30px_rgba(27,20,100,0.10)]
               hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-4">

        <div class="flex items-start gap-3">
          ${logo}
          <div class="flex-1 min-w-0">
            <h3 class="font-headline font-bold text-primary text-[15px] leading-snug line-clamp-2">${esc(o.display_name || '(sin nombre)')}</h3>
            <div class="flex items-center gap-1.5 mt-1.5 text-[11px] text-on-surface-variant">
              <span class="text-base leading-none">${flag}</span>
              <span class="font-semibold">${esc(o.country_code || '')}</span>
              ${o.city ? `<span class="opacity-40">·</span><span class="truncate">${esc(o.city)}</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5 flex-wrap mt-2">
              ${tier}
              ${cat}
            </div>
          </div>
        </div>

        <div class="space-y-1.5">
          ${scoreBar('Personal',    o.score_personal,    { max: 10 })}
          ${scoreBar('Experiencia', o.score_experience,  { max: 10 })}
          ${scoreBar('Alianzas',    o.score_alliances,   { max: 10 })}
        </div>
        ${o.is_newcomer ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-secondary-fixed px-2 py-0.5 rounded-full mt-1"><span class="material-symbols-outlined text-[12px]">auto_awesome</span>Newcomer</span>` : ''}

        ${cms ? `<div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant/60 -mt-1">
          <span class="material-symbols-outlined text-[12px]">code</span>
          ${esc(o.cms_detected)}
        </div>` : ''}
      </button>
    `;
  }

  /* ── Barra horizontal etiquetada (sustituye los donuts P/E/V) ─ */
  function scoreBar(label, value, opts = {}) {
    const max = opts.max || 100;
    const v = (value == null ? 0 : Math.max(0, Math.min(max, value)));
    const pct = max > 0 ? (v / max) * 100 : 0;
    const display = max === 10 ? `${v}/10` : `${v}`;
    return `
      <div class="grid grid-cols-[1fr_auto] gap-x-2 items-center">
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-medium text-on-surface-variant">${esc(label)}</span>
          <span class="font-bold text-primary tabular-nums">${display}</span>
        </div>
        <span class="col-span-2 block h-1.5 bg-surface-container rounded-full overflow-hidden">
          <span class="block h-full rounded-full transition-all" style="width:${pct}%; background:#1b1464"></span>
        </span>
      </div>
    `;
  }

  function tierBadge(tier) {
    const t = tier || 'minimal';
    return `<span class="badge-tier badge-${t}">${tierLabel(t)}</span>`;
  }
  function tierLabel(t) {
    return ({premium:'Premium', good:'Buena', acceptable:'Aceptable', minimal:'Mínima', 'premium+':'Premium+'})[t] || t;
  }

  function renderSkeleton(n) {
    return Array.from({length:n}, () => `
      <div class="bg-white rounded-2xl border border-outline-variant/25 p-4 animate-pulse">
        <div class="flex items-start gap-3 mb-3">
          <div class="w-11 h-11 rounded-lg bg-surface-container"></div>
          <div class="flex-1 space-y-2">
            <div class="h-3 w-3/4 rounded bg-surface-container"></div>
            <div class="h-2 w-1/2 rounded bg-surface-container"></div>
          </div>
        </div>
        <div class="flex gap-2 mb-3">
          <div class="w-8 h-8 rounded-full bg-surface-container"></div>
          <div class="w-8 h-8 rounded-full bg-surface-container"></div>
          <div class="w-8 h-8 rounded-full bg-surface-container"></div>
        </div>
        <div class="h-3 w-16 rounded-full bg-surface-container"></div>
      </div>
    `).join('');
  }

  function renderEmptyState() {
    return `
      <div class="col-span-full py-16 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-container flex items-center justify-center">
          <span class="material-symbols-outlined text-primary/40 text-[32px]">search_off</span>
        </div>
        <h3 class="font-bold text-primary mb-1">Ningún resultado coincide</h3>
        <p class="text-sm text-on-surface-variant mb-4">Prueba a quitar filtros o cambiar la búsqueda.</p>
        <button type="button" onclick="Entities.clearFilters()"
          class="text-xs font-semibold text-primary bg-secondary-fixed px-4 py-2 rounded-full hover:bg-secondary-fixed-dim transition-colors">
          Limpiar filtros
        </button>
      </div>
    `;
  }

  /* ── Ficha overlay (S3 rellena contenido) ────────────────────── */
  async function openFicha(oid) {
    const overlay = document.getElementById('entity-ficha-overlay');
    const content = document.getElementById('entity-ficha-content');
    if (!overlay || !content) return;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Self-wire close affordances once (idempotent flag). When openFicha
    // is invoked from Atlas — or any module that loads before
    // Entities.init() runs — bindEvents() may never have run, leaving
    // close handlers unbound and trapping the user with body overflow
    // locked. Delegating on the OVERLAY (not just the backdrop) closes
    // on any click outside the drawer panel, plus Esc and hashchange.
    if (!document._fichaCloseBound) {
      document._fichaCloseBound = true;
      overlay.addEventListener('click', (e) => {
        if (!e.target.closest('#entity-ficha-panel')) closeFicha();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeFicha();
      });
      // Browser back / hash navigation must release the body scroll lock
      window.addEventListener('hashchange', () => {
        if (!overlay.classList.contains('hidden')) closeFicha();
      });
    }
    content.innerHTML = `
      <div class="p-8">
        <div class="animate-pulse space-y-4">
          <div class="h-8 w-2/3 rounded bg-surface-container"></div>
          <div class="h-4 w-1/2 rounded bg-surface-container"></div>
          <div class="h-32 rounded bg-surface-container mt-6"></div>
        </div>
      </div>
    `;
    try {
      const entity = await API.get(`/entities/${encodeURIComponent(oid)}`);
      // Render real ficha (función definida abajo, será sobreescrita en S3 polish)
      content.innerHTML = renderFicha(entity);
      bindFichaEvents(entity);
    } catch (e) {
      content.innerHTML = `<div class="p-8 text-error">${esc(e.message || 'Error cargando ficha')}</div>`;
    }
  }
  function closeFicha() {
    const overlay = document.getElementById('entity-ficha-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ── Render ficha completa (S3) ──────────────────────────────── */
  function renderFicha(o) {
    const logo = o.logo_url
      ? `<img src="${esc(o.logo_url)}" alt="" referrerpolicy="no-referrer"
           class="w-20 h-20 rounded-2xl object-contain bg-white border border-outline-variant/30 shrink-0"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0',innerHTML:'<span class=\\'material-symbols-outlined text-primary text-[36px]\\'>apartment</span>'}))">`
      : `<div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
           <span class="material-symbols-outlined text-primary text-[36px]">apartment</span>
         </div>`;

    const flag = countryFlag(o.country_code);
    const langs = (o.website_languages || []).map(l => l.toUpperCase()).join(' · ');
    const social = o.social_links || {};

    return `
      <div class="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-outline-variant/20 px-6 py-3 flex items-center gap-2">
        <button type="button" id="entity-ficha-close"
          class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant" title="Cerrar (ESC)">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="flex-1 truncate text-xs text-on-surface-variant font-medium">
          OID <span class="font-mono text-primary">${esc(o.oid)}</span>
        </div>
        ${o.website ? `
          <a href="${esc(o.website)}" target="_blank" rel="noopener noreferrer"
            class="text-xs font-semibold text-primary inline-flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-secondary-fixed/40 transition-colors">
            <span class="material-symbols-outlined text-[16px]">open_in_new</span>
            Abrir web
          </a>` : ''}
      </div>

      <!-- Hero -->
      <div class="px-6 lg:px-8 py-6 relative overflow-hidden">
        <div class="splash-yellow-sm hidden lg:block" aria-hidden="true"></div>
        <div class="flex items-start gap-5 relative">
          ${logo}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 text-xs text-on-surface-variant mb-1">
              <span class="text-base">${flag}</span>
              <span class="font-semibold uppercase tracking-wider">${esc(o.country_code || '')}</span>
              ${o.city ? `<span class="opacity-40">·</span><span>${esc(o.city)}</span>` : ''}
              ${o.category ? `<span class="opacity-40">·</span><span class="font-medium">${esc(o.category)}</span>` : ''}
            </div>
            <h2 class="font-headline text-2xl lg:text-3xl font-extrabold text-primary leading-tight">
              ${esc(o.display_name || o.legal_name || '(sin nombre)')}
            </h2>
            ${o.legal_name && o.legal_name !== o.display_name ? `<p class="text-sm text-on-surface-variant mt-1">${esc(o.legal_name)}</p>` : ''}
            <div class="flex items-center gap-2 mt-3">
              ${tierBadge(o.quality_tier)}
              ${o.has_erasmus_accreditation ? `<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">workspace_premium</span> Erasmus+ accredited</span>` : ''}
              ${o.validity_label === 'certified' ? `<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-blue-100 text-blue-700">${esc(o.validity_label)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Bloque scores con donuts ApexCharts -->
      <section class="px-6 lg:px-8 pb-6">
        <div class="bg-surface-container-low rounded-2xl p-5">
          <h3 class="text-[11px] font-bold uppercase tracking-[.2em] text-on-surface-variant mb-4">Personal · Experiencia · Alianzas</h3>
          <div class="grid grid-cols-3 gap-4">
            <div id="ficha-donut-prof" class="ficha-donut-wrap"></div>
            <div id="ficha-donut-eu"   class="ficha-donut-wrap"></div>
            <div id="ficha-donut-vit"  class="ficha-donut-wrap"></div>
          </div>
        </div>
      </section>

      <!-- Sobre + Contacto en grid 2 cols -->
      <section class="px-6 lg:px-8 pb-6 grid lg:grid-cols-2 gap-4">
        <!-- Sobre -->
        <div class="bg-white rounded-2xl border border-outline-variant/25 p-5">
          <h3 class="text-[11px] font-bold uppercase tracking-[.2em] text-on-surface-variant mb-3">Sobre</h3>
          ${o.description ? `<p class="text-sm leading-relaxed text-on-surface mb-4 line-clamp-6">${esc(o.description)}</p>` : '<p class="text-sm text-on-surface-variant italic mb-4">Sin descripción disponible.</p>'}
          <dl class="space-y-1.5 text-xs">
            ${row('Forma legal', o.legal_form)}
            ${row('Año fundación', o.year_founded)}
            ${row('Estudiantes', o.students_count ? formatNumber(o.students_count) : null)}
            ${row('VAT', o.vat)}
            ${row('Idiomas web', langs)}
            ${row('CMS', o.cms_detected)}
          </dl>
        </div>

        <!-- Contacto -->
        <div class="bg-white rounded-2xl border border-outline-variant/25 p-5">
          <h3 class="text-[11px] font-bold uppercase tracking-[.2em] text-on-surface-variant mb-3">Contacto</h3>
          ${renderContactList(o.emails, 'mail', 'mailto:')}
          ${renderContactList(o.phones, 'call', 'tel:')}
          ${renderSocialList(social)}
          ${(!o.emails?.length && !o.phones?.length && !Object.keys(social).length)
            ? '<p class="text-sm text-on-surface-variant italic">Sin información de contacto.</p>' : ''}
        </div>
      </section>

      <!-- Proyectos ejecutados -->
      ${Array.isArray(o.recent_projects) && o.recent_projects.length ? `
        <section class="px-6 lg:px-8 pb-6">
          <div class="flex items-end justify-between mb-3">
            <h3 class="text-[11px] font-bold uppercase tracking-[.2em] text-on-surface-variant">Proyectos ejecutados</h3>
            <span class="text-[11px] text-on-surface-variant">
              ${o.total_projects ? `Mostrando ${o.recent_projects.length} de ${formatNumber(o.total_projects)}` : `${o.recent_projects.length}`}
            </span>
          </div>
          <ul class="divide-y divide-outline-variant/30 bg-white rounded-2xl border border-outline-variant/25 overflow-hidden">
            ${o.recent_projects.map(p => renderProjectRow(p)).join('')}
          </ul>
        </section>` : ''}

      <!-- Socios habituales -->
      ${Array.isArray(o.top_copartners) && o.top_copartners.length ? `
        <section class="px-6 lg:px-8 pb-6">
          <div class="flex items-end justify-between mb-3">
            <h3 class="text-[11px] font-bold uppercase tracking-[.2em] text-on-surface-variant">Socios habituales</h3>
            <span class="text-[11px] text-on-surface-variant">${o.top_copartners.length} top copartners</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${o.top_copartners.map(c => renderCopartnerCard(c)).join('')}
          </div>
        </section>` : ''}

      <!-- Similares -->
      <section class="px-6 lg:px-8 pb-8">
        <h3 class="text-[11px] font-bold uppercase tracking-[.2em] text-on-surface-variant mb-3">Entidades similares</h3>
        <div id="entity-similar-grid" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="text-xs text-on-surface-variant col-span-full">Buscando…</div>
        </div>
      </section>

      <!-- CTAs sticky bottom -->
      <div class="sticky bottom-0 bg-white border-t border-outline-variant/30 px-6 py-3 flex items-center gap-2">
        <button type="button" data-action="shortlist" data-oid="${esc(o.oid)}"
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-primary bg-secondary-fixed px-4 py-2 rounded-lg hover:bg-secondary-fixed-dim transition-colors">
          <span class="material-symbols-outlined text-[18px]">favorite_border</span>
          Añadir a shortlist
        </button>
        <button type="button" data-action="contact" data-oid="${esc(o.oid)}"
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant border border-outline-variant/40 px-4 py-2 rounded-lg hover:border-primary hover:text-primary transition-colors">
          <span class="material-symbols-outlined text-[18px]">mail</span>
          Plantilla de contacto
        </button>
      </div>
    `;
  }

  function row(label, value) {
    if (value == null || value === '') return '';
    return `<div class="flex gap-3"><dt class="text-on-surface-variant w-24 shrink-0">${esc(label)}</dt><dd class="font-medium text-on-surface flex-1 break-words">${esc(value)}</dd></div>`;
  }
  function renderProjectRow(p) {
    const title = p.project_title || p.title || p.project_identifier || '(sin título)';
    const year = p.funding_year || (p.start_date ? new Date(p.start_date).getFullYear() : null);
    const grant = p.eu_grant_eur ? Math.round(parseFloat(p.eu_grant_eur)) : null;
    const role = p.role || null;
    const action = p.action_type || null;
    const isGood = p.is_good_practice;
    const roleBg = role === 'coordinator' ? 'bg-secondary-fixed text-primary' : 'bg-accent-warm/40 text-primary';
    return `
      <li class="px-4 py-3 hover:bg-surface-container/40 transition-colors">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-primary leading-snug truncate" title="${esc(title)}">${esc(title)}</div>
            <div class="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
              ${role ? `<span class="${roleBg} px-1.5 py-0.5 rounded font-bold uppercase">${esc(role)}</span>` : ''}
              ${action ? `<span class="text-on-surface-variant">${esc(action)}</span>` : ''}
              ${isGood ? `<span class="text-amber-700 font-bold uppercase">★ Good practice</span>` : ''}
            </div>
          </div>
          <div class="text-right shrink-0">
            ${year ? `<div class="text-sm font-bold text-primary">${year}</div>` : ''}
            ${grant ? `<div class="text-[11px] text-on-surface-variant">${formatNumber(grant)} €</div>` : ''}
          </div>
        </div>
      </li>`;
  }
  function renderCopartnerCard(c) {
    const oid = c.copartner_pic || c.oid || null;
    const name = c.name || c.display_name || '(sin nombre)';
    const cc = (c.country_code || '').toUpperCase();
    const shared = parseInt(c.shared_projects, 10) || 0;
    const orgType = c.org_type || c.category || null;
    return `
      <div class="bg-white rounded-xl border border-outline-variant/25 p-3 ${oid ? 'cursor-pointer hover:border-primary/50' : ''}"
           ${oid ? `data-action="open-entity" data-oid="${esc(oid)}"` : ''}>
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <div class="text-sm font-semibold text-primary truncate" title="${esc(name)}">${esc(name)}</div>
          <div class="text-[11px] font-bold text-primary bg-secondary-fixed px-1.5 py-0.5 rounded shrink-0">${shared} proy.</div>
        </div>
        <div class="text-[11px] text-on-surface-variant flex flex-wrap gap-1.5">
          ${cc ? `<span class="font-medium">${cc}</span>` : ''}
          ${orgType ? `<span class="truncate">${esc(orgType)}</span>` : ''}
        </div>
      </div>`;
  }
  function renderContactList(items, icon, hrefPrefix) {
    if (!items || !items.length) return '';
    return `<ul class="space-y-1 mb-3">
      ${items.slice(0, 4).map(v => `
        <li><a href="${hrefPrefix}${esc(v)}" class="text-sm text-on-surface hover:text-primary inline-flex items-center gap-2 group">
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-primary">${icon}</span>
          <span class="truncate">${esc(v)}</span>
        </a></li>
      `).join('')}
      ${items.length > 4 ? `<li class="text-xs text-on-surface-variant pl-6">+${items.length - 4} más</li>` : ''}
    </ul>`;
  }
  function renderSocialList(s) {
    const keys = Object.keys(s || {});
    if (!keys.length) return '';
    const icons = { twitter:'tag', x:'tag', facebook:'facebook', linkedin:'work', instagram:'photo_camera', youtube:'play_circle', tiktok:'graphic_eq' };
    return `<div class="flex flex-wrap gap-1.5 pt-1">
      ${keys.map(k => `<a href="${esc(s[k])}" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-surface-container hover:bg-secondary-fixed/40 px-2 py-1 rounded-full transition-colors capitalize">
          <span class="material-symbols-outlined text-[14px]">${icons[k] || 'link'}</span>${esc(k)}
        </a>`).join('')}
    </div>`;
  }

  /* ── Bind ficha events (close button, similar, donuts, CTAs) ── */
  function bindFichaEvents(o) {
    document.getElementById('entity-ficha-close')?.addEventListener('click', closeFicha);

    // Render donuts via ApexCharts
    const drawDonuts = () => {
      renderDonut('ficha-donut-prof', 'Personal',    o.score_personal,   { max: 10 });
      renderDonut('ficha-donut-eu',   'Experiencia', o.score_experience, { max: 10, newcomer: o.is_newcomer });
      renderDonut('ficha-donut-vit',  'Alianzas',    o.score_alliances,  { max: 10 });
    };
    if (typeof ApexCharts !== 'undefined') drawDonuts();
    else setTimeout(drawDonuts, 500);

    // Load similares
    loadSimilar(o.oid);

    // CTAs (S4 implementará; por ahora toast)
    document.querySelectorAll('#entity-ficha-content [data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const oid = btn.dataset.oid;
        if (action === 'shortlist' && typeof Shortlists !== 'undefined') {
          Shortlists.toggle(oid, btn);
        } else if (action === 'contact' && typeof Shortlists !== 'undefined') {
          Shortlists.openContactTemplate(oid);
        } else if (action === 'open-entity' && oid) {
          openFicha(oid);
        } else {
          Toast.show('Disponible en próxima sesión', 'ok');
        }
      });
    });
  }

  function renderDonut(targetId, label, value, opts = {}) {
    if (typeof ApexCharts === 'undefined') return;
    const el = document.getElementById(targetId);
    if (!el) return;
    const max = opts.max || 100;
    const v = value == null ? 0 : Math.max(0, Math.min(max, value));
    const pct = max > 0 ? (v / max) * 100 : 0;
    const isMax10 = max === 10;
    const valueText = isMax10 ? `${Math.round(v)}/10` : `${Math.round(v)}`;
    const chartOpts = {
      chart: { type: 'radialBar', height: 160, sparkline: { enabled: true } },
      series: [pct],
      colors: ['#fbff12'],
      plotOptions: {
        radialBar: {
          hollow: { size: '62%' },
          track: { background: '#eeeeee', strokeWidth: '90%' },
          dataLabels: {
            name: { show: true, color: '#474551', offsetY: 22, fontSize: '11px', fontWeight: 600, fontFamily: 'Poppins' },
            value: { show: true, color: '#1b1464', fontSize: isMax10 ? '22px' : '26px', fontWeight: 800, fontFamily: 'Poppins', offsetY: -10, formatter: () => valueText },
          },
        },
      },
      stroke: { lineCap: 'round' },
      labels: [label],
      tooltip: { enabled: false },
    };
    new ApexCharts(el, chartOpts).render();
    // Newcomer badge sobre el donut de Experiencia si aplica
    if (opts.newcomer) {
      el.style.position = 'relative';
      const badge = document.createElement('div');
      badge.className = 'absolute -top-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-primary bg-secondary-fixed px-2 py-0.5 rounded-full whitespace-nowrap z-10';
      badge.innerHTML = '<span class="material-symbols-outlined text-[11px]">auto_awesome</span>Newcomer';
      el.appendChild(badge);
    }
  }

  async function loadSimilar(oid) {
    const grid = document.getElementById('entity-similar-grid');
    if (!grid) return;
    try {
      const sim = await API.get(`/entities/${encodeURIComponent(oid)}/similar?limit=3`);
      if (!sim?.length) {
        grid.innerHTML = `<div class="text-xs text-on-surface-variant col-span-full">No hay entidades similares en la muestra local.</div>`;
        return;
      }
      grid.innerHTML = sim.map(s => `
        <button type="button" data-oid="${esc(s.oid)}"
          class="entity-card-mini bg-white rounded-xl border border-outline-variant/25 p-3 text-left hover:border-primary/30 hover:shadow-md transition-all">
          <div class="flex items-start gap-2">
            ${s.logo_url ? `<img src="${esc(s.logo_url)}" referrerpolicy="no-referrer" class="w-8 h-8 rounded object-contain bg-white border border-outline-variant/20 shrink-0" onerror="this.style.display='none'">` : ''}
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-primary text-xs leading-tight line-clamp-2">${esc(s.display_name || '')}</div>
              <div class="text-[10px] text-on-surface-variant mt-1">${countryFlag(s.country_code)} ${esc(s.country_code || '')}${s.city ? ' · ' + esc(s.city) : ''}</div>
            </div>
          </div>
        </button>
      `).join('');
      grid.querySelectorAll('[data-oid]').forEach(el => {
        el.addEventListener('click', () => openFicha(el.dataset.oid));
      });
    } catch {
      grid.innerHTML = `<div class="text-xs text-on-surface-variant col-span-full">No hay entidades similares.</div>`;
    }
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  // Limpia mojibake `??` (datos perdidos por inserción con conexión non-utf8mb4 en
  // el crawler del VPS). Se aplica en display; los datos crudos se preservan en DB
  // por si se hace re-crawl.
  function cleanMojibake(s) {
    if (s == null) return '';
    return String(s).replace(/\?{2,}/g, '');
  }
  function esc(v) {
    if (v == null) return '';
    const d = document.createElement('div');
    d.textContent = cleanMojibake(v);
    return d.innerHTML;
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function formatNumber(n) {
    if (n == null) return '';
    return n.toLocaleString('es-ES');
  }
  function relativeTime(date) {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'hace unos segundos';
    if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`;
    return `hace ${Math.floor(diff/86400)} días`;
  }
  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function countryFlag(code) {
    if (!code) return '';
    let c = code.toUpperCase();
    // Map non-ISO to ISO
    if (c === 'EL') c = 'GR';   // Greece
    if (c === 'UK') c = 'GB';   // United Kingdom
    if (c.length !== 2) return '';
    const A = 0x1F1E6;
    return String.fromCodePoint(A + c.charCodeAt(0) - 65, A + c.charCodeAt(1) - 65);
  }

  /* ── Smart Shortlist (IA) ────────────────────────────────────── */
  function openSmartModal() {
    if (!API.getToken()) {
      Toast.show('Inicia sesión para usar Smart Shortlist', 'err');
      return;
    }
    document.getElementById('smart-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'smart-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/30 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-outline-variant/30 flex items-center gap-3">
          <span class="material-symbols-outlined text-primary">auto_awesome</span>
          <div class="flex-1">
            <h3 class="font-bold text-primary">Smart Shortlist</h3>
            <p class="text-xs text-on-surface-variant">Pregunta en lenguaje natural y la IA filtra el atlas.</p>
          </div>
          <button type="button" class="sm-close p-2 rounded-lg hover:bg-surface-container">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="px-5 py-4 border-b border-outline-variant/30">
          <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Tu petición</label>
          <textarea class="sm-q w-full mt-1 px-3 py-2 text-sm border border-outline-variant/40 rounded-lg" rows="2"
            placeholder="Ej: 5 ONGs italianas con web en inglés y email&#10;3 universidades premium de España&#10;10 colegios alemanes contactables"></textarea>
          <div class="flex flex-wrap gap-2 mt-2 text-[11px]">
            ${['5 ONGs italianas con web en inglés','3 universidades premium en España','10 colegios alemanes contactables','5 fundaciones culturales en Francia']
              .map(s => `<button type="button" class="sm-example px-2 py-1 rounded-full bg-surface-container hover:bg-secondary-fixed/40 text-on-surface-variant">${s}</button>`).join('')}
          </div>
          <div class="flex items-center justify-end gap-2 mt-3">
            <button type="button" class="sm-go inline-flex items-center gap-1.5 text-sm font-semibold text-primary bg-secondary-fixed hover:bg-secondary-fixed-dim px-4 py-2 rounded-lg">
              <span class="material-symbols-outlined text-[18px]">search</span>
              Buscar con IA
            </button>
          </div>
        </div>

        <div class="sm-results flex-1 overflow-y-auto p-5">
          <div class="text-sm text-on-surface-variant text-center py-8">Escribe tu petición arriba para empezar.</div>
        </div>

        <div class="sm-cta hidden px-5 py-3 border-t border-outline-variant/30 flex items-center justify-end gap-2 bg-surface-container-low/40">
          <button type="button" class="sm-save inline-flex items-center gap-1.5 text-sm font-semibold text-primary bg-secondary-fixed hover:bg-secondary-fixed-dim px-4 py-2 rounded-lg">
            <span class="material-symbols-outlined text-[18px]">favorite</span>
            Guardar todos en nueva shortlist
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.sm-close').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelectorAll('.sm-example').forEach(b => b.addEventListener('click', () => {
      modal.querySelector('.sm-q').value = b.textContent;
    }));
    modal.querySelector('.sm-go').onclick = () => runSmart(modal);
    modal.querySelector('.sm-q').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runSmart(modal);
    });
  }

  let lastSmartResults = null;
  let lastSmartInterp  = null;
  async function runSmart(modal) {
    const q = modal.querySelector('.sm-q').value.trim();
    if (!q) { Toast.show('Escribe una petición', 'err'); return; }
    const results = modal.querySelector('.sm-results');
    const cta = modal.querySelector('.sm-cta');
    cta.classList.add('hidden');
    results.innerHTML = `
      <div class="text-center py-12">
        <div class="spinner text-primary mx-auto mb-3"></div>
        <p class="text-sm text-on-surface-variant">La IA está leyendo tu petición y filtrando el atlas…</p>
      </div>
    `;
    try {
      const r = await API.post('/entities/smart-shortlist', { query: q });
      lastSmartResults = r.results || [];
      lastSmartInterp  = r.interpretation || {};
      results.innerHTML = renderSmartResults(r);
      results.querySelectorAll('[data-oid]').forEach(card => {
        card.addEventListener('click', () => { openFicha(card.dataset.oid); });
      });
      if (lastSmartResults.length) {
        cta.classList.remove('hidden');
        modal.querySelector('.sm-save').onclick = () => saveSmartToShortlist(modal, lastSmartInterp, lastSmartResults);
      }
    } catch (e) {
      results.innerHTML = `<div class="py-8 text-center text-error">${esc(e.message || 'Error de IA')}</div>`;
    }
  }

  function renderSmartResults(r) {
    const interp = r.interpretation || {};
    const filters = r.filters_applied || {};
    const chips = [];
    if (filters.country)  chips.push(`País: ${esc(filters.country)}`);
    if (filters.category) chips.push(`Tipo: ${esc(capitalize(filters.category))}`);
    if (filters.tier)     chips.push(`Calidad: ${esc(tierLabel(filters.tier))}`);
    if (filters.language) chips.push(`Idioma: ${esc(filters.language.toUpperCase())}`);
    if (filters.has_email) chips.push('Con email');
    if (filters.has_phone) chips.push('Con teléfono');
    if (filters.q)        chips.push(`Texto: ${esc(filters.q)}`);

    return `
      <div class="bg-secondary-fixed/30 rounded-xl p-4 mb-5">
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">auto_awesome</span>
          <div class="flex-1">
            <p class="text-sm font-semibold text-primary">${esc(interp.summary || 'Resultados:')}</p>
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${chips.map(c => `<span class="text-[11px] font-semibold bg-white text-primary px-2 py-0.5 rounded-full">${c}</span>`).join('')}
            </div>
            <p class="text-[11px] text-on-surface-variant mt-2">
              ${formatNumber(r.total_matching || 0)} entidades coinciden globalmente · mostrando ${(r.results || []).length}
            </p>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${(r.results || []).map(renderCard).join('') || '<div class="col-span-full text-center text-sm text-on-surface-variant py-8">Sin coincidencias. Reformula la petición.</div>'}
      </div>
    `;
  }

  async function saveSmartToShortlist(modal, interp, items) {
    if (!items?.length) return;
    const defaultName = (interp.summary || 'Smart shortlist').slice(0, 80);
    const name = await Modal.prompt('Nombre de la nueva shortlist', defaultName);
    if (!name) return;
    try {
      const created = await API.post('/entities/shortlists', { name, description: `Generada con IA: ${interp.original || ''}` });
      // Add items in parallel
      await Promise.all(items.map(it => API.post(`/entities/shortlists/${created.id}/items`, { oid: it.oid }).catch(() => null)));
      Toast.show(`Guardadas ${items.length} entidades en "${name}"`, 'ok');
      modal.remove();
      // Navegar a Mi Pool
      location.hash = 'shortlists';
    } catch (e) { Toast.show(e.message || 'Error guardando', 'err'); }
  }

  /* ── Public API ──────────────────────────────────────────────── */
  return {
    init,
    clearFilters: clearAllFilters,
    openFicha,
    closeFicha,
    openSmartModal,
  };
})();
