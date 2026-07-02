/* ═══════════════════════════════════════════════════════════════
   Atlas Stats — MapLibre GL JS (2D mapa + 3D globo cartográfico)
   ═══════════════════════════════════════════════════════════════
   Una sola librería renderiza:
     - 2D Mercator (mapa plano clásico)
     - 3D Globe (proyección esférica)
   Los DOS modos usan los mismos vector tiles (OpenFreeMap Liberty),
   por lo que las calles, ciudades, países y zoom se ven igual de
   nítidos en cualquier proyección.

   - Clustering nativo de MapLibre (GeoJSON source con cluster:true)
     escala a millones de puntos sin problema.
   - Click sobre punto → popup rico (logo, descripción, contacto,
     scores) + botón "Ver ficha completa" que abre el slide-over.
   - Filtros por tier ajustan opacidad de los puntos en GPU.
   ═══════════════════════════════════════════════════════════════ */

const AtlasStats = (() => {
  let cached = null;
  let geoCache = null;
  let charts = [];
  let activeMode = '2d';
  let activeTierFilter = null;
  let map = null;
  let activePopup = null;

  const TIER_BY_CODE = { 0: 'unenriched', 1: 'premium', 2: 'good', 3: 'acceptable', 4: 'minimal' };
  const TIER_COLOR = {
    premium:    '#fbff12',
    good:       '#c7afdf',
    acceptable: '#9aa0a6',
    minimal:    '#5a5a6a',
    unenriched: '#3a3a48',
  };
  const TIER_LABEL = {
    premium: 'Premium', good: 'Buena', acceptable: 'Aceptable',
    minimal: 'Mínima', unenriched: 'Sin enriquecer',
  };
  const TIER_CODE = { premium:1, good:2, acceptable:3, minimal:4, unenriched:0 };

  // OpenFreeMap Liberty: vector tiles open-source, gratis, sin API key,
  // estilo limpio cartográfico tipo Mapbox Light. https://openfreemap.org
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  async function init() {
    destroyAll();
    if (!cached)   await loadData();
    if (!geoCache) await loadGeo();
    bindToggle();
    bindSearch();
    renderKpis();
    renderTierDonut();
    renderBars();
    renderMap();
    renderTierFilters();
  }

  /* ── Buscador (entidad / ciudad) ─────────────────────────── */
  function bindSearch() {
    const input = document.getElementById('atlas-search-input');
    const drop  = document.getElementById('atlas-search-results');
    const wrap  = document.getElementById('atlas-search-wrapper');
    if (!input || !drop || input._bound) return;
    input._bound = true;

    let lastReqId = 0;
    let debounceTimer = null;
    const debounce = (fn, ms) => (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), ms);
    };

    async function doSearch() {
      const q = input.value.trim();
      if (q.length < 2) { drop.classList.add('hidden'); drop.innerHTML = ''; return; }
      const reqId = ++lastReqId;
      try {
        const resp = await API.get(`/entities?q=${encodeURIComponent(q)}&limit=8`);
        if (reqId !== lastReqId) return;
        const rows = (resp && resp.rows) || [];
        if (!rows.length) {
          drop.innerHTML = '<div class="px-3 py-2 text-xs text-on-surface-variant">Sin resultados</div>';
          drop.classList.remove('hidden');
          return;
        }
        drop.innerHTML = rows.map(r => {
          const oid  = r.oid || '';
          const name = r.name || r.display_name || '(sin nombre)';
          const sub  = [r.city, r.country_code].filter(Boolean).join(' · ');
          return `
            <button type="button" class="atlas-search-item w-full text-left px-3 py-2 hover:bg-secondary-fixed/40 border-b border-outline-variant/20 last:border-b-0"
              data-oid="${esc(oid)}" data-name="${esc(name)}">
              <div class="text-sm font-semibold text-primary truncate">${esc(name)}</div>
              <div class="text-[11px] text-on-surface-variant truncate">${esc(sub)}</div>
            </button>`;
        }).join('');
        drop.classList.remove('hidden');
      } catch (e) {
        drop.innerHTML = `<div class="px-3 py-2 text-xs text-error">${esc(e.message || 'Error')}</div>`;
        drop.classList.remove('hidden');
      }
    }

    const debounced = debounce(doSearch, 300);
    input.addEventListener('input', debounced);
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) doSearch(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { drop.classList.add('hidden'); input.blur(); }
    });
    document.addEventListener('click', (e) => {
      if (wrap && !wrap.contains(e.target)) drop.classList.add('hidden');
    });

    drop.addEventListener('click', async (e) => {
      const btn = e.target.closest('.atlas-search-item');
      if (!btn) return;
      const oid  = btn.dataset.oid;
      const name = btn.dataset.name;
      drop.classList.add('hidden');
      input.value = name;
      await flyToEntity(oid);
    });
  }

  async function flyToEntity(oid) {
    if (!map || !oid) return;
    const m = (geoCache || []).find(x => x && x.o === oid);
    if (m && m.a != null && m.g != null) {
      map.flyTo({ center: [Number(m.g), Number(m.a)], zoom: 13, duration: 1200 });
      return;
    }
    try {
      const e = await API.get(`/entities/${encodeURIComponent(oid)}`);
      const lat = parseFloat(e?.lat ?? e?.geocoded_lat);
      const lng = parseFloat(e?.lng ?? e?.geocoded_lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.flyTo({ center: [lng, lat], zoom: 13, duration: 1200 });
      } else if (typeof Toast !== 'undefined') {
        Toast.show('La entidad no tiene coordenadas', 'error');
      }
    } catch (err) {
      if (typeof Toast !== 'undefined') Toast.show(err.message || 'Error', 'error');
    }
  }

  /* ── Toggle 2D / 3D ──────────────────────────────────────── */
  function bindToggle() {
    const b2 = document.getElementById('atlas-mode-2d');
    const b3 = document.getElementById('atlas-mode-3d');
    if (b2 && !b2._bound) { b2._bound = true; b2.addEventListener('click', () => setProjection('2d')); }
    if (b3 && !b3._bound) { b3._bound = true; b3.addEventListener('click', () => setProjection('3d')); }
  }
  function setProjection(mode) {
    if (mode === activeMode) return;
    activeMode = mode;
    document.getElementById('atlas-mode-2d')?.classList.toggle('bg-primary', mode === '2d');
    document.getElementById('atlas-mode-2d')?.classList.toggle('text-white', mode === '2d');
    document.getElementById('atlas-mode-2d')?.classList.toggle('text-primary', mode !== '2d');
    document.getElementById('atlas-mode-3d')?.classList.toggle('bg-primary', mode === '3d');
    document.getElementById('atlas-mode-3d')?.classList.toggle('text-white', mode === '3d');
    document.getElementById('atlas-mode-3d')?.classList.toggle('text-primary', mode !== '3d');
    const hint = document.getElementById('atlas-mode-hint');
    if (hint) hint.textContent = mode === '2d'
      ? 'Pan y zoom · click una entidad para abrir su ficha'
      : 'Arrastra para rotar · scroll para zoom · misma cartografía con calles y nombres';
    if (map) {
      map.setProjection({ type: mode === '3d' ? 'globe' : 'mercator' });
      // Pequeño zoom-out para apreciar la curvatura en 3D
      if (mode === '3d') map.flyTo({ zoom: Math.min(map.getZoom(), 2.8), pitch: 0, bearing: 0, duration: 800 });
    }
  }

  /* ── Data fetch ──────────────────────────────────────────── */
  async function loadData() {
    const safe = (p) => p.catch(() => null);
    const [g, c, cat, cms, lang, tier] = await Promise.all([
      safe(API.get('/entities/stats/global')),
      safe(API.get('/entities/stats/by-country')),
      safe(API.get('/entities/stats/by-category')),
      safe(API.get('/entities/stats/by-cms')),
      safe(API.get('/entities/stats/by-language')),
      safe(API.get('/entities/stats/tiers')),
    ]);
    cached = {
      global:    g?.value || {},
      countries: c?.value || [],
      categories: cat?.value || [],
      cms:       cms?.value || [],
      languages: lang?.value || [],
      tiers:     tier?.value || [],
    };
  }
  async function loadGeo() {
    try {
      const r = await API.get('/entities/geo');
      geoCache = Array.isArray(r) ? r : [];
    } catch { geoCache = []; }
  }

  /* ── KPIs ─────────────────────────────────────────────────── */
  function renderKpis() {
    const g = cached.global;
    const tierPremium = cached.tiers.find(t => t.tier === 'premium')?.count || 0;
    const totalRowEl = document.getElementById('stats-total-hero');
    const total = g.total_alive || (geoCache?.length || 0);
    if (totalRowEl && total) totalRowEl.textContent = formatNumber(total);
    const cards = [
      kpi('Entidades vivas', total, 'public', 'primary', 'En la base de datos enriquecida.'),
      kpi('Proyectos ejecutados', g.total_projects, 'rocket_launch', 'lavender',
        'Proyectos Erasmus+ históricos en la base de datos.'),
      kpi('Países cubiertos', g.countries || new Set((geoCache||[]).map(m=>m.c)).size,
        'flag', 'yellow', 'Toda la UE + países asociados.'),
      kpi('Premium tier', tierPremium, 'workspace_premium', 'primary', 'Top 9% por completitud.'),
    ];
    document.getElementById('stats-kpis').innerHTML = cards.join('');
  }
  function kpi(label, value, icon, variant, sub) {
    const variants = {
      primary:  'bg-primary text-white',
      lavender: 'bg-accent-warm text-primary',
      yellow:   'bg-secondary-fixed text-primary',
      neutral:  'bg-white border border-outline-variant/30 text-primary',
    };
    return `
      <div class="${variants[variant] || variants.neutral} rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden">
        <div class="flex items-start justify-between">
          <span class="text-[10px] font-bold uppercase tracking-wider opacity-80">${esc(label)}</span>
          <span class="material-symbols-outlined text-[20px] opacity-70">${icon}</span>
        </div>
        <div class="font-headline text-3xl font-extrabold leading-none">${formatNumber(value || 0)}</div>
        <div class="text-[11px] opacity-80">${esc(sub || '')}</div>
      </div>`;
  }

  /* ── Donut + bars ─────────────────────────────────────────── */
  function renderTierDonut() {
    if (typeof ApexCharts === 'undefined') return setTimeout(renderTierDonut, 200);
    const el = document.getElementById('stats-tier-donut');
    if (!el) return;
    const order = ['premium','good','acceptable','minimal'];
    const series = [], names = [], cols = [];
    for (const k of order) {
      const r = cached.tiers.find(x => x.tier === k);
      if (r) { series.push(r.count); names.push(TIER_LABEL[k]); cols.push(TIER_COLOR[k]); }
    }
    if (!series.length && geoCache?.length) {
      for (const k of order) {
        const n = geoCache.filter(m => m.t === TIER_CODE[k]).length;
        if (n) { series.push(n); names.push(TIER_LABEL[k]); cols.push(TIER_COLOR[k]); }
      }
    }
    if (!series.length) {
      el.innerHTML = '<div class="text-xs text-on-surface-variant text-center py-8">Sin datos de calidad</div>';
      return;
    }
    const chart = new ApexCharts(el, {
      chart: { type: 'donut', height: 260, fontFamily: 'Poppins' },
      series, labels: names, colors: cols,
      legend: { position: 'bottom', fontSize: '12px', fontWeight: 600, labels: { colors: '#1b1464' } },
      stroke: { width: 2, colors: ['#fff'] },
      dataLabels: { enabled: false },
      plotOptions: {
        pie: { donut: { size: '70%', labels: { show: true,
          total: { show: true, label: 'Total', color: '#474551', fontSize: '11px', fontWeight: 600,
                   formatter: () => formatNumber(series.reduce((a,b) => a+b, 0)) },
          value: { color: '#1b1464', fontSize: '20px', fontWeight: 800 },
        }}}},
      tooltip: { y: { formatter: (v) => formatNumber(v) + ' entidades' } },
    });
    chart.render();
    charts.push(chart);
  }
  function renderBars() {
    if (typeof ApexCharts === 'undefined') return setTimeout(renderBars, 200);
    bar('stats-bar-countries', cached.countries.slice(0, 15), 'country_code', 'count', '#fbff12', '#1b1464');
    bar('stats-bar-categories', cached.categories.slice(0, 12), 'category', 'count', '#c7afdf', '#1b1464');
    bar('stats-bar-cms',       cached.cms.slice(0, 12),       'cms', 'count', '#fbff12', '#1b1464');
    bar('stats-bar-languages', cached.languages.slice(0, 12), 'lang', 'count', '#c7afdf', '#1b1464');
  }
  function bar(elId, data, labelKey, valueKey, fill, text) {
    const el = document.getElementById(elId);
    if (!el || !data?.length) {
      if (el) el.innerHTML = '<div class="text-xs text-on-surface-variant text-center py-8">Sin datos</div>';
      return;
    }
    const labels = data.map(d => (d[labelKey] || '').toString().toUpperCase());
    const values = data.map(d => d[valueKey] || 0);
    const chart = new ApexCharts(el, {
      chart: { type: 'bar', height: Math.max(260, data.length * 26), fontFamily: 'Poppins', toolbar: { show: false } },
      series: [{ name: 'Entidades', data: values }],
      xaxis: { categories: labels, labels: { style: { fontWeight: 600 } } },
      colors: [fill],
      plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '70%', dataLabels: { position: 'top' } } },
      dataLabels: { enabled: true, offsetX: 30, style: { fontWeight: 700, colors: [text] }, formatter: (v) => formatNumber(v) },
      grid: { borderColor: '#eeeeee' },
      tooltip: { y: { formatter: (v) => formatNumber(v) } },
    });
    chart.render();
    charts.push(chart);
  }

  /* ── Mapa MapLibre GL (2D/3D unificado) ──────────────────── */
  function renderMap() {
    if (typeof maplibregl === 'undefined') return setTimeout(renderMap, 200);
    const container = document.getElementById('stats-map-container');
    if (!container) return;
    if (!geoCache || !geoCache.length) {
      container.innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-xs text-on-surface-variant">Sin entidades geolocalizadas. Ejecuta <code>node scripts/backfill_geocoded.js</code></div>';
      return;
    }

    if (map) {
      // Si el mapa ya existe (re-init), refrescar fuente
      const src = map.getSource('entities');
      if (src) src.setData(buildGeoJSON());
      map.resize();
      return;
    }

    container.innerHTML = '';
    map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [12, 50],
      zoom: 3.2,
      attributionControl: { compact: true },
      projection: { type: activeMode === '3d' ? 'globe' : 'mercator' },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.addControl(new maplibregl.FullscreenControl(), 'top-left');
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => attachEntityLayers());
    map.on('error', (e) => console.warn('[MapLibre]', e?.error?.message || e));
  }

  function buildGeoJSON() {
    const features = [];
    for (const m of geoCache) {
      if (m.a == null || m.g == null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(m.g), Number(m.a)] },
        properties: {
          oid: m.o,
          name: m.n || '',
          cc: m.c || '',
          tier: TIER_BY_CODE[m.t] || 'unenriched',
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  function attachEntityLayers() {
    map.addSource('entities', {
      type: 'geojson',
      data: buildGeoJSON(),
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 55,
    });

    // Cluster circles
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'entities',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#1b1464',
        'circle-stroke-color': '#fbff12',
        'circle-stroke-width': 3,
        'circle-radius': [
          'step', ['get', 'point_count'],
          18,  50,
          22, 500,
          28, 5000,
          36,
        ],
      },
    });

    // Cluster count labels
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'entities',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#fbff12' },
    });

    // Individual points colored by tier
    map.addLayer({
      id: 'unclustered',
      type: 'circle',
      source: 'entities',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'match', ['get', 'tier'],
          'premium', TIER_COLOR.premium,
          'good',    TIER_COLOR.good,
          'acceptable', TIER_COLOR.acceptable,
          'minimal',    TIER_COLOR.minimal,
          TIER_COLOR.unenriched,
        ],
        'circle-radius': [
          'match', ['get', 'tier'],
          'premium', 8,
          'good',    7,
          6,
        ],
        'circle-stroke-color': '#1b1464',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.95,
      },
    });

    applyTierFilterToLayer();

    // Click cluster → expand zoom
    map.on('click', 'clusters', async (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!features.length) return;
      const clusterId = features[0].properties.cluster_id;
      const src = map.getSource('entities');
      try {
        const zoom = await src.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: features[0].geometry.coordinates, zoom });
      } catch {}
    });

    // Click individual point → popup rico
    map.on('click', 'unclustered', (e) => {
      const f = e.features[0];
      showEntityPopup(f);
    });

    // Cursor pointer sobre cluster/punto
    ['clusters', 'unclustered'].forEach(layer => {
      map.on('mouseenter', layer, () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', layer, () => map.getCanvas().style.cursor = '');
    });
  }

  function applyTierFilterToLayer() {
    if (!map || !map.getLayer('unclustered')) return;
    const opacity = activeTierFilter
      ? ['case', ['==', ['get', 'tier'], activeTierFilter], 0.95, 0.12]
      : 0.95;
    map.setPaintProperty('unclustered', 'circle-opacity', opacity);
    map.setPaintProperty('unclustered', 'circle-stroke-opacity', opacity);
  }

  /* ── Popup rico (lazy-fetch ficha completa) ──────────────── */
  function showEntityPopup(feature) {
    if (activePopup) { activePopup.remove(); activePopup = null; }
    const p = feature.properties;
    const tierName = p.tier || 'unenriched';
    const popup = new maplibregl.Popup({
      maxWidth: '360px',
      closeButton: true,
      className: 'atlas-popup',
      offset: 12,
    })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(buildPopupSkeleton(p, tierName))
      .addTo(map);
    activePopup = popup;
    fetchAndFillPopup(popup, p, tierName);
  }
  async function fetchAndFillPopup(popup, p, tierName) {
    try {
      const e = await API.get(`/entities/${encodeURIComponent(p.oid)}`);
      popup.setHTML(buildPopupFull(e, p.oid, tierName));
    } catch (err) {
      popup.setHTML(`<div class="atlas-popup-body p-4 text-xs text-error">${esc(err.message || 'Error cargando')}</div>`);
    }
  }

  // Event delegation: sobrevive a re-renders del popup de MapLibre
  // Se monta una sola vez al cargar el script.
  if (typeof document !== 'undefined' && !document._atlasFichaDelegated) {
    document._atlasFichaDelegated = true;
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-atlas-open-ficha]');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const oid = btn.getAttribute('data-atlas-open-ficha');
      if (activePopup) { try { activePopup.remove(); } catch {} activePopup = null; }
      if (typeof Entities !== 'undefined' && Entities.openFicha) {
        Entities.openFicha(oid);
      } else {
        try { sessionStorage.setItem('entitiesOpenOid', oid); } catch {}
        if (typeof App !== 'undefined') App.navigate('organizations');
      }
    });
  }
  function buildPopupSkeleton(p, tierName) {
    return `
      <div class="atlas-popup-body">
        <div class="flex items-start gap-3 p-4">
          <div class="w-12 h-12 rounded-lg bg-surface-container shrink-0"></div>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-primary text-sm leading-tight">${escAttr(p.name || p.oid)}</div>
            <div class="text-[11px] text-on-surface-variant mt-0.5">${escAttr(p.cc || '')} · ${TIER_LABEL[tierName]}</div>
            <div class="mt-3 space-y-1.5 animate-pulse">
              <div class="h-3 rounded bg-surface-container"></div>
              <div class="h-3 w-3/4 rounded bg-surface-container"></div>
            </div>
          </div>
        </div>
      </div>`;
  }
  function buildPopupFull(e, oid, tierName) {
    const logo = e.logo_url
      ? `<img src="${escAttr(e.logo_url)}" alt="" referrerpolicy="no-referrer" class="w-12 h-12 rounded-lg object-contain bg-white border border-outline-variant/30 shrink-0" onerror="this.style.display='none'">`
      : `<div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-primary text-[22px]">apartment</span></div>`;
    const desc = (e.description || '').slice(0, 220);
    const descMore = (e.description || '').length > 220 ? '…' : '';
    const emails = Array.isArray(e.emails) ? e.emails.slice(0, 1) : [];
    const phones = Array.isArray(e.phones) ? e.phones.slice(0, 1) : [];
    const langs = Array.isArray(e.website_languages) ? e.website_languages.slice(0, 4).map(l => String(l).toUpperCase()).join(' · ') : '';
    const scores = [
      e.score_professionalism != null ? `Prof ${e.score_professionalism}` : null,
      e.score_eu_readiness != null    ? `EU ${e.score_eu_readiness}`     : null,
      e.score_vitality != null        ? `Vit ${e.score_vitality}`        : null,
    ].filter(Boolean).join(' · ');
    const tierBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style="background:${TIER_COLOR[tierName]};color:#1b1464">${TIER_LABEL[tierName]}</span>`;
    return `
      <div class="atlas-popup-body">
        <div class="p-4">
          <div class="flex items-start gap-3 mb-3">
            ${logo}
            <div class="min-w-0 flex-1">
              <div class="font-bold text-primary text-sm leading-tight">${escAttr(e.display_name || e.legal_name || oid)}</div>
              <div class="text-[11px] text-on-surface-variant mt-0.5">
                ${escAttr([e.city, e.country_code].filter(Boolean).join(', '))}
                ${e.category ? ` · ${escAttr(e.category)}` : ''}
              </div>
              <div class="mt-1.5 flex items-center gap-1.5">${tierBadge}${e.year_founded ? `<span class="text-[10px] text-on-surface-variant">desde ${escAttr(e.year_founded)}</span>` : ''}</div>
            </div>
          </div>
          ${desc ? `<p class="text-[12px] text-on-surface-variant leading-snug mb-3">${esc(desc)}${descMore}</p>` : ''}
          ${(emails.length || phones.length || e.website || langs) ? `
            <div class="space-y-1 text-[11px] mb-3">
              ${e.website ? `<div class="flex items-center gap-1.5 text-primary"><span class="material-symbols-outlined text-[14px]">language</span><a href="${escAttr(e.website)}" target="_blank" rel="noopener" class="underline truncate">${escAttr(e.website.replace(/^https?:\/\//,''))}</a></div>` : ''}
              ${emails[0] ? `<div class="flex items-center gap-1.5 text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">mail</span><a href="mailto:${escAttr(emails[0])}" class="truncate">${escAttr(emails[0])}</a></div>` : ''}
              ${phones[0] ? `<div class="flex items-center gap-1.5 text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">call</span>${escAttr(phones[0])}</div>` : ''}
              ${langs ? `<div class="flex items-center gap-1.5 text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">translate</span>${escAttr(langs)}</div>` : ''}
            </div>` : ''}
          ${scores ? `<div class="text-[10px] font-mono text-on-surface-variant mb-3">${escAttr(scores)}</div>` : ''}
          <button type="button" data-atlas-open-ficha="${escAttr(oid)}"
            class="w-full text-xs font-bold text-primary bg-secondary-fixed hover:bg-secondary-fixed-dim px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">open_in_full</span>
            Ver ficha completa
          </button>
        </div>
      </div>`;
  }

  function openEntityFicha(oid) {
    if (!oid) return;
    if (typeof Entities !== 'undefined' && Entities.openFicha) {
      Entities.openFicha(oid);
      return;
    }
    try { sessionStorage.setItem('entitiesOpenOid', oid); } catch {}
    if (typeof App !== 'undefined') App.navigate('organizations');
  }

  /* ── Tier filter chips ───────────────────────────────────── */
  function renderTierFilters() {
    const el = document.getElementById('stats-globe-filters');
    if (!el) return;
    const order = ['premium','good','acceptable','minimal','unenriched'];
    const counts = {};
    for (const k of order) counts[k] = (geoCache || []).filter(m => m.t === TIER_CODE[k]).length;
    el.innerHTML = `
      <button class="tier-chip ${!activeTierFilter ? 'active' : ''}" data-tier="">
        Todos · ${formatNumber(geoCache?.length || 0)}
      </button>
      ${order.map(k => `
        <button class="tier-chip ${activeTierFilter === k ? 'active' : ''}" data-tier="${k}"
          style="--chip:${TIER_COLOR[k]}">
          <span class="chip-dot"></span>${TIER_LABEL[k]} · ${formatNumber(counts[k])}
        </button>
      `).join('')}`;
    el.querySelectorAll('.tier-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTierFilter = btn.dataset.tier || null;
        applyTierFilterToLayer();
        renderTierFilters();
      });
    });
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function destroyAll() {
    charts.forEach(c => { try { c.destroy(); } catch {} });
    charts = [];
    if (activePopup) { try { activePopup.remove(); } catch {} activePopup = null; }
    // map se mantiene entre re-inits para evitar re-fetch de tiles
  }
  // Saneamiento de mojibake: el crawler del VPS insertó datos con conexión latin1
  // y MySQL reemplazó cada char multibyte por '?'. Aquí limpiamos los `??` consecutivos
  // (corresponden a 1 char UTF-8 perdido, p.ej. ó → 2 bytes → '??'). No es recuperable;
  // sólo evitamos que el UI parezca roto.
  function cleanMojibake(s) {
    if (s == null) return '';
    return String(s).replace(/\?{2,}/g, '');
  }
  function esc(v) { if (v == null) return ''; const d = document.createElement('div'); d.textContent = cleanMojibake(v); return d.innerHTML; }
  function escAttr(v) { return cleanMojibake(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function formatNumber(n) { if (n == null) return ''; return Number(n).toLocaleString('es-ES'); }

  return { init };
})();
