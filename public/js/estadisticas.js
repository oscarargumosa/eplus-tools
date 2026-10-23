/* ═══════════════════════════════════════════════════════════════
   Estadísticas Erasmus+ — #estadisticas
   ═══════════════════════════════════════════════════════════════
   El mapa es el centro de todas las vistas: vive en un «escenario»
   fijo (mapa + línea de tiempo + panel lateral) que no se destruye al
   cambiar de vista; cada vista decide qué pinta el mapa, qué hace un
   clic en un país y qué cuenta el panel. Debajo va el detalle.

   Vistas: paises · panorama · lineas · linea/<id> · comparar · tasas
   El estado (vista + filtros) vive en el hash:
     #estadisticas/lineas?desde=2021&hasta=2025&grupo=asociaciones
   Los cambios de filtro usan replaceState (no recargan la sección);
   los cambios de vista, pushState (el botón Atrás vuelve).
   Datos: /v1/estadisticas/* (node/src/modules/estadisticas). /paises
   trae cada país año a año: la línea de tiempo y la reproducción
   repintan el mapa sin pedir nada al servidor.

   Diales (web-composicion): varianza 3 · movimiento 5 · densidad 7.
   ═══════════════════════════════════════════════════════════════ */

const Estadisticas = (() => {
  /* ── Paleta (validada con dataviz/validate_palette.js, 4 series) ── */
  const AZUL = '#4312d8', TINTA = '#1b0759', TEXTO2 = '#55577a', LINEA = '#efe8fe', LAVANDA = '#b392f6', MAGENTA = '#c2408f';
  const SERIES = ['#4312d8', '#c2408f', '#6f8500', '#9b7cf4'];
  const RAMPA = ['#efe8fe', '#cdb9fa', '#a487f5', '#7349f0', '#4312d8', '#2a0b8f', '#1b0759'];
  const SIN_DATO = '#ebeaf0', MEDIA = '#8a8aa3';

  const VISTAS = [
    { id: 'paises',   nombre: 'Países',          icono: 'public' },
    { id: 'panorama', nombre: 'Panorama',        icono: 'dashboard' },
    { id: 'lineas',   nombre: 'Líneas',          icono: 'view_list' },
    { id: 'comparar', nombre: 'Comparar',        icono: 'compare_arrows' },
    { id: 'tasas',    nombre: 'Tasas de éxito',  icono: 'target' },
    { id: 'entidades', nombre: 'Ranking de entidades', icono: 'leaderboard' },
  ];

  let META = null;
  let built = false;
  let charts = [];
  let seq = 0;                       // descarta respuestas de peticiones viejas

  const S = {
    vista: 'paises', id: null,
    f: { desde: 2021, hasta: 2025, grupo: '', sector: '', gestion: '', pais: '', rol: 'coord', foco: 'ES' },
    comp: { tipo: 'linea', ids: [] },
    orden: { col: 'importe', dir: -1 }, buscar: '',
    metrica: 'coord', mapa: 'europa', sel: '', red: false, ver: '', tasa: 0, compVer: 0,
    ent: { tipo: '', sinUni: false, min: 1, orden: 'proyectos', buscar: '' }, emetrica: 'n',
  };

  /* ── Formato ──────────────────────────────────────────────── */
  const nf = new Intl.NumberFormat('es-ES');
  const fmtN = v => (v == null ? '—' : nf.format(Math.round(v)));
  const dec1 = v => v.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  function fmtEur(v, corto = false) {
    if (v == null) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return dec1(v / 1e9) + ' mil M€';
    if (a >= 1e6) return dec1(v / 1e6) + ' M€';
    if (corto && a >= 1e4) return nf.format(Math.round(v / 1000)) + 'k €';
    return nf.format(Math.round(v)) + ' €';
  }
  // «25k–84k €», «1,4–1,5 M€»: una sola unidad al final.
  function rango(a, b) {
    if (a == null || b == null) return '—';
    if (a === b) return fmtEur(a, true);
    if (b >= 1e6) return `${dec1(a / 1e6)}–${dec1(b / 1e6)} M€`;
    if (b >= 1e4) return `${nf.format(Math.round(a / 1000))}k–${nf.format(Math.round(b / 1000))}k €`;
    return `${nf.format(a)}–${nf.format(b)} €`;
  }
  const pct = (v, d = 0) => (v == null ? '—' : (v * 100).toLocaleString('es-ES', { maximumFractionDigits: d }) + ' %');
  const fmtHab = v => (v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: v < 10 ? 1 : 0 }));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = (iso, sinAño) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', sinAño ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const $ = sel => document.querySelector(sel);
  const tasaTxt = t => `${t.aprox ? '≈ ' : ''}${t.rango || dec1(t.tasa).replace(',0', '') + ' %'}`;

  const nombreGrupo = id => META?.grupos.find(g => g.id === id)?.nombre || id;
  const nombreSector = id => META?.sectores[id] || id;
  const nombrePais = code => META?.paises.find(p => p.code === code)?.nombre || code;
  const lineaMeta = id => META?.lineas.find(l => l.id === id);
  const gestionTxt = g => (g === 'AN' ? 'Agencia Nacional' : g === 'EACEA' ? 'Bruselas (EACEA)' : '—');
  const periodoTxt = (a = S.f.desde, b = S.f.hasta) => (a === b ? String(a) : `${a}–${b}`);

  /* ── Hash ⇄ estado ────────────────────────────────────────── */
  function leerHash(sub) {
    const [ruta, qs] = String(sub || '').split('?');
    const partes = ruta.split('/').filter(Boolean);
    const vista = partes[0] === 'linea' ? 'linea' : (VISTAS.some(v => v.id === partes[0]) ? partes[0] : 'paises');
    S.vista = vista;
    S.id = vista === 'linea' ? decodeURIComponent(partes[1] || '') : null;
    const q = new URLSearchParams(qs || '');
    const f = S.f;
    f.desde = parseInt(q.get('desde'), 10) || 2021;
    f.hasta = parseInt(q.get('hasta'), 10) || 2025;
    f.grupo = q.get('grupo') || '';
    f.sector = q.get('sector') || '';
    f.gestion = q.get('gestion') || '';
    f.pais = q.get('pais') || '';
    f.rol = q.get('rol') === 'part' ? 'part' : 'coord';
    f.foco = q.get('foco') || 'ES';
    if (q.get('comparar')) S.comp.ids = q.get('comparar').split(',').filter(Boolean).slice(0, 4);
    if (q.get('tipo')) S.comp.tipo = q.get('tipo') === 'pais' ? 'pais' : 'linea';
    S.metrica = METRICAS[q.get('metrica')] ? q.get('metrica') : 'coord';
    S.mapa = q.get('mapa') === 'mundo' ? 'mundo' : 'europa';
    S.sel = q.get('sel') || '';
    S.red = q.get('red') === '1';
    S.ver = q.get('ver') || '';
    S.tasa = parseInt(q.get('tasa'), 10) || 0;
    S.ent.tipo = q.get('etipo') || '';
    S.ent.sinUni = q.get('sinuni') === '1';
    S.ent.min = Math.max(1, parseInt(q.get('min'), 10) || 1);
    S.ent.orden = ['proyectos', 'coordina', 'dinero'].includes(q.get('eorden')) ? q.get('eorden') : 'proyectos';
    S.emetrica = ['n', 'dinero', 'hab'].includes(q.get('emetrica')) ? q.get('emetrica') : 'n';
  }

  function qsFiltros(extra = {}) {
    const f = S.f, q = new URLSearchParams();
    q.set('desde', f.desde); q.set('hasta', f.hasta);
    if (f.grupo) q.set('grupo', f.grupo);
    if (f.sector) q.set('sector', f.sector);
    if (f.gestion) q.set('gestion', f.gestion);
    if (f.pais) { q.set('pais', f.pais); q.set('rol', f.rol); }
    if (f.foco && f.foco !== 'ES') q.set('foco', f.foco);
    for (const [k, v] of Object.entries(extra)) if (v !== '' && v != null) q.set(k, v);
    return q.toString();
  }
  // El mapa enseña todos los países: el filtro de país solo lo resalta.
  function qsSinPais(extra = {}) {
    const pais = S.f.pais; S.f.pais = '';
    try { return qsFiltros(extra); } finally { S.f.pais = pais; }
  }
  // Solo el periodo: para el mapa de una línea concreta (los filtros de catálogo no aplican).
  const qsBase = (extra = {}) => new URLSearchParams({ desde: S.f.desde, hasta: S.f.hasta, ...extra }).toString();

  function hashActual() {
    const extra = {};
    if (S.vista === 'comparar') { if (S.comp.ids.length) extra.comparar = S.comp.ids.join(','); extra.tipo = S.comp.tipo; }
    if (S.metrica !== 'coord') extra.metrica = S.metrica;
    if (S.mapa === 'mundo') extra.mapa = 'mundo';
    if (S.vista === 'paises' && S.sel) extra.sel = S.sel;
    if (S.vista === 'paises' && S.red) extra.red = '1';
    if (S.vista === 'lineas' && S.ver) extra.ver = S.ver;
    if (S.vista === 'tasas' && S.tasa) extra.tasa = S.tasa;
    if (S.vista === 'entidades') {
      if (S.ent.tipo) extra.etipo = S.ent.tipo;
      if (S.ent.sinUni) extra.sinuni = '1';
      if (S.ent.min > 1) extra.min = S.ent.min;
      if (S.ent.orden !== 'proyectos') extra.eorden = S.ent.orden;
      if (S.emetrica !== 'n') extra.emetrica = S.emetrica;
    }
    const ruta = S.vista === 'linea' ? `linea/${encodeURIComponent(S.id)}` : S.vista;
    return `#estadisticas/${ruta}?${qsFiltros(extra)}`;
  }

  function escribirHash(push) {
    const h = hashActual();
    if (location.hash === h) return;
    history[push ? 'pushState' : 'replaceState'](null, '', h);
  }

  /* ── API ──────────────────────────────────────────────────── */
  const get = path => API.get('/estadisticas' + path);
  const memo = new Map();
  function getMemo(path) {
    if (!memo.has(path)) {
      memo.set(path, get(path).catch(e => { memo.delete(path); throw e; }));
      if (memo.size > 80) memo.delete(memo.keys().next().value);
    }
    return memo.get(path);
  }

  function esperar(nombre) {
    return new Promise(res => {
      const t = () => (window[nombre] ? res(window[nombre]) : setTimeout(t, 120));
      t();
    });
  }

  /* ── Métricas del mapa ────────────────────────────────────── */
  // Cada país trae sus cifras año a año (cY coordina, pY participa, iY dinero
  // que coordina). ra/rb = índices de año dentro de esos arrays.
  const suma = (arr, ra, rb) => { let t = 0; for (let k = ra; k <= rb; k++) t += arr[k] || 0; return t; };
  const METRICAS = {
    coord: { t: 'Proyectos que coordina', corto: 'Coordina', v: (p, a, b) => suma(p.cY, a, b), fmt: fmtN, rol: 'coord' },
    part: { t: 'Proyectos en los que participa', corto: 'Participa', v: (p, a, b) => suma(p.pY, a, b), fmt: fmtN, rol: 'part' },
    importeCoord: { t: 'Dinero de los proyectos que coordina', corto: 'Dinero', v: (p, a, b) => suma(p.iY, a, b), fmt: v => fmtEur(v), fmtCorto: v => fmtEur(v, true), rol: 'coord' },
    hab: { t: 'Proyectos en los que participa por millón de habitantes', corto: 'Por habitante', v: (p, a, b) => (p.pob ? suma(p.pY, a, b) / (p.pob / 1e6) : null), fmt: fmtHab, rol: 'part', nota: 'Participación en relación con la población del país' },
    ratio: { t: 'De cada 100 proyectos en los que está, cuántos coordina', corto: 'Coordina / participa', v: (p, a, b) => { const pa = suma(p.pY, a, b); return pa >= 10 ? suma(p.cY, a, b) / pa : null; }, fmt: v => pct(v), rol: 'coord', nota: 'Solo países con 10 o más participaciones' },
  };
  const metrica = () => METRICAS[S.metrica] || METRICAS.coord;
  const ENT_METRICAS = {
    n: { t: 'Entidades con proyectos', corto: 'Entidades', fmt: fmtN },
    dinero: { t: 'Dinero de los proyectos de sus entidades', corto: 'Dinero', fmt: v => fmtEur(v), fmtCorto: v => fmtEur(v, true) },
    hab: { t: 'Entidades por millón de habitantes', corto: 'Por habitante', fmt: fmtHab },
  };

  // Nombre de una entidad que abre su ficha del directorio (si se conoce su OID/PIC).
  function abrirFicha(id) { if (id && typeof Entities !== 'undefined' && Entities.openFicha) Entities.openFicha(id); }
  function enlazarFichas(el) {
    el.querySelectorAll('[data-ficha]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); abrirFicha(b.dataset.ficha); }));
  }
  const nombreEnt = o => (o.ficha
    ? `<button type="button" class="est-link est-link--ent" data-ficha="${esc(o.ficha)}" title="Abrir su ficha">${esc(o.nombre || 'Sin nombre')}</button>`
    : esc(o.nombre || 'Sin nombre'));

  /* ═══ MAPA (persistente) ═════════════════════════════════════ */
  const Mapa = (() => {
    const geo = { europa: null, mundo: null };
    let d3, box, svg, gZoom, gPaises, gMarcas, gArcos, gEtiq, proj, path, zoom, modo = null, W = 0, H = 0, zk = 1;
    let feats = [], centro = new Map(), cfg = null, porCode = new Map(), colorDe = () => SIN_DATO, ro = null, roBox = null;

    async function cargarGeo(m) {
      if (!geo[m]) geo[m] = fetch(m === 'mundo' ? '/data/mundo.geo.json?v=20261023' : '/data/europa.geo.json').then(r => r.json());
      return geo[m];
    }

    // Polígono más grande de cada país: centra etiquetas y arcos en la
    // península, no en la Guayana o en Canarias.
    function mayor(f) {
      if (f.geometry.type !== 'MultiPolygon') return f;
      const area = c => { const a = d3.geoArea({ type: 'Polygon', coordinates: c }); return a > 2 * Math.PI ? 4 * Math.PI - a : a; };
      let best = null, bestA = -1;
      for (const c of f.geometry.coordinates) { const a = area(c); if (a > bestA) { bestA = a; best = c; } }
      return { type: 'Feature', geometry: { type: 'Polygon', coordinates: best } };
    }

    async function montar(m) {
      d3 = await esperar('d3');
      box = $('#est-mapa');
      if (!box) return false;
      const g = await cargarGeo(m);
      if (!box.isConnected) return false;
      if (modo === m && svg && svg.node().isConnected && Math.abs(box.clientWidth - W) < 2) return true;
      modo = m;
      W = box.clientWidth || 800; H = box.clientHeight || Math.round(W * 0.62);
      // Europa: proyección de áreas iguales centrada en el continente;
      // el encuadre va de Islandia a Chipre, sin Siberia.
      proj = m === 'mundo'
        ? d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: g.features.filter(f => f.id !== 'GL' && f.id !== 'AQ') })
        : d3.geoAzimuthalEqualArea().rotate([-12, -52]).fitExtent([[6, 6], [W - 6, H - 6]], { type: 'MultiPoint', coordinates: [[-23, 63], [-10, 36], [35, 34], [44, 41], [33, 70], [-8, 58], [25, 71]] });
      path = d3.geoPath(proj);
      feats = g.features;
      centro = new Map(feats.map(f => [f.id, path.centroid(mayor(f))]));

      box.querySelector('svg')?.remove();
      svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H)
        .attr('role', 'img').attr('aria-label', 'Mapa de países');
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent').on('click', () => cfg?.onFondo?.());
      gZoom = svg.append('g');
      gPaises = gZoom.append('g').attr('class', 'est-capa-paises');
      gMarcas = gZoom.append('g').attr('class', 'est-capa-marcas');
      gArcos = gZoom.append('g').attr('class', 'est-capa-arcos');
      gEtiq = gZoom.append('g').attr('class', 'est-capa-etiquetas');

      gPaises.selectAll('path').data(feats, f => f.id).join('path')
        .attr('d', path).attr('data-code', f => f.id).attr('class', 'est-pais').attr('fill', SIN_DATO)
        .on('mousemove', (ev, f) => tooltip(ev, f.id))
        .on('mouseleave', () => { $('#est-mapa-tt').hidden = true; })
        .on('click', (ev, f) => { ev.stopPropagation(); if (porCode.has(f.id)) cfg?.onClick?.(f.id); });

      // Países diminutos (Malta, Luxemburgo, Liechtenstein…): un punto para poder pulsarlos.
      const peques = feats.filter(f => path.area(f) < 30);
      gMarcas.selectAll('circle').data(peques, f => f.id).join('circle')
        .attr('cx', f => centro.get(f.id)[0]).attr('cy', f => centro.get(f.id)[1]).attr('r', 3.6)
        .attr('data-code', f => f.id).attr('class', 'est-pais est-pais--punto').attr('fill', SIN_DATO)
        .on('mousemove', (ev, f) => tooltip(ev, f.id))
        .on('mouseleave', () => { $('#est-mapa-tt').hidden = true; })
        .on('click', (ev, f) => { ev.stopPropagation(); if (porCode.has(f.id)) cfg?.onClick?.(f.id); });

      // Zoom: botones siempre; rueda solo con Ctrl/⌘ (o pellizco) para no
      // secuestrar el scroll de la página; arrastrar, solo con el mapa ampliado.
      zoom = d3.zoom().scaleExtent([1, 10]).translateExtent([[-W * 0.2, -H * 0.2], [W * 1.2, H * 1.2]])
        .filter(ev => {
          if (ev.type === 'wheel') {
            if (ev.ctrlKey || ev.metaKey) return true;
            avisar('Ctrl + rueda (o los botones +/−) para acercar el mapa', 'zoom');
            return false;
          }
          if (ev.type === 'dblclick') return false;
          if (ev.type === 'touchstart') return ev.touches.length > 1 || zk > 1.01;
          return !ev.button && zk > 1.01;
        })
        .on('zoom', ev => {
          zk = ev.transform.k;
          gZoom.attr('transform', ev.transform);
          gEtiq.selectAll('text').attr('font-size', 12 / zk).attr('stroke-width', 3 / zk);
          gMarcas.selectAll('circle').attr('r', 3.6 / Math.sqrt(zk));
          box.classList.toggle('is-ampliado', zk > 1.01);
        });
      svg.call(zoom);
      zk = 1;

      if (roBox !== box) {
        ro?.disconnect();
        let t = null;
        ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (box?.isConnected && Math.abs(box.clientWidth - W) > 4 && cfg) { modo = null; pintar(cfg); } }, 180); });
        ro.observe(box); roBox = box;
      }
      return true;
    }

    function rangoIdx(c, r) {
      const a0 = c.datos.años[0];
      const [a, b] = r || c.rango || [S.f.desde, S.f.hasta];
      return [Math.max(0, a - a0), Math.min(c.datos.años[1], b) - a0];
    }
    const valorDe = (p, c, r) => { const [a, b] = rangoIdx(c, r); return (c.valor || metrica().v)(p, a, b); };

    function escalaColor(c) {
      const visibles = new Set(feats.map(f => f.id));
      const fn = c.valor || metrica().v;
      let vals;
      if (c.anual) {
        // Reproduciendo: una escala para todos los años, así se ve crecer.
        vals = [];
        const n = c.datos.años[1] - c.datos.años[0] + 1;
        for (const p of c.datos.paises) if (visibles.has(p.code)) for (let k = 0; k < n; k++) { const v = fn(p, k, k); if (v > 0) vals.push(v); }
      } else {
        vals = c.datos.paises.filter(p => visibles.has(p.code)).map(p => valorDe(p, c)).filter(v => v > 0);
      }
      vals.sort((a, b) => a - b);
      const cortes = [0.2, 0.4, 0.6, 0.8, 0.93].map(q => d3.quantile(vals, q)).filter((v, i, a) => v != null && (i === 0 || v > a[i - 1]));
      return { cortes, color: v => (v == null || !(v > 0) ? SIN_DATO : RAMPA[1 + d3.bisectRight(cortes, v)] || RAMPA[6]) };
    }

    /* cfg: { datos, titulo, rango?, valor?, fmt?, sel?, resaltar?: {code: color}, onClick, onFondo, anual? } */
    async function pintar(c) {
      cfg = c;
      if (!(await montar(S.mapa))) return;
      if (cfg !== c) return;
      porCode = new Map(c.datos.paises.map(p => [p.code, p]));
      const esc_ = escalaColor(c);
      colorDe = code => { const p = porCode.get(code); return p ? esc_.color(valorDe(p, c)) : SIN_DATO; };
      const res = c.resaltar || null;
      const anim = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      gZoom.selectAll('.est-pais')
        .classed('con', f => porCode.has(f.id))
        .classed('is-sel', f => f.id === c.sel)
        .classed('is-res', f => !!(res && res[f.id]))
        .classed('is-atenuado', f => !!(res && !res[f.id]))
        .transition().duration(anim ? (c.anual ? 520 : 380) : 0)
        .attr('fill', f => (res && res[f.id]) || colorDe(f.id));
      if (c.sel) gZoom.selectAll('.est-pais').filter(f => f.id === c.sel).raise();
      etiquetas(c);
      leyenda(esc_.cortes, c);
      $('#est-mapa-titulo').innerHTML = `<b>${esc(c.titulo || metrica().t)}</b><span>${esc(c.subtitulo || periodoTxt(...(c.rango || [S.f.desde, S.f.hasta])))}</span>`;
      if (!c.mantenerArcos) arcos(null);
    }

    function etiquetas(c) {
      const codes = new Set([...(c.sel ? [c.sel] : []), ...Object.keys(c.resaltar || {})]);
      const datos = [...codes].filter(code => centro.has(code)).map(code => ({ code, xy: centro.get(code), n: porCode.get(code)?.nombre || nombrePais(code) }));
      gEtiq.selectAll('text').data(datos, d => d.code).join('text')
        .attr('x', d => d.xy[0]).attr('y', d => d.xy[1] - 10 / zk)
        .attr('font-size', 12 / zk).attr('stroke-width', 3 / zk)
        .attr('class', 'est-etiqueta').text(d => d.n);
    }

    function leyenda(cortes, c) {
      const fmt = c.fmtCorto || c.fmt || metrica().fmtCorto || metrica().fmt;
      const tramos = [0, ...cortes];
      $('#est-mapa-leyenda').innerHTML = `
        <span class="est-leyenda__sin"><i style="background:${SIN_DATO}"></i>sin datos</span>
        ${tramos.map((v, i) => `<span><i style="background:${RAMPA[1 + i]}"></i>${i === 0 ? (cortes[0] != null ? 'hasta ' + esc(fmt(cortes[0])) : 'con datos') : esc(fmt(v)) + (i === tramos.length - 1 ? ' o más' : '')}</span>`).join('')}`;
    }

    function tooltip(ev, code) {
      const tt = $('#est-mapa-tt');
      if (!cfg || !tt) return;
      const p = porCode.get(code);
      const M = metrica(), fmt = cfg.fmt || M.fmt;
      const n = cfg.datos.años[1] - cfg.datos.años[0] + 1;
      let spark = '';
      if (p) {
        const fn = cfg.serie ? (x, a) => cfg.serie(x)[a] || 0 : (cfg.valor || M.v);
        const serie = Array.from({ length: n }, (_, k) => fn(p, k, k) || 0);
        const [ra, rb] = rangoIdx(cfg);
        const media = mediaPaises(cfg.datos, (cfg.serie ? 'serie:' : cfg.valor ? 'mapa:' : '') + (cfg.valor || cfg.serie ? cfg.titulo : S.metrica), fn);
        spark = sparkSvg(serie, 168, 34, { desde: ra, hasta: rb }, media) + leyendaSpark(p.nombre, 'media');
      }
      tt.hidden = false;
      tt.innerHTML = `<b>${esc(p ? p.nombre : (nombrePais(code) || code))}</b>${p ? `<span class="est-tt__v">${esc(fmt(valorDe(p, cfg)))}</span><span class="est-tt__t">${esc(cfg.titulo || M.t)} · ${esc(periodoTxt(...(cfg.rango || [S.f.desde, S.f.hasta])))}</span>${spark}<span class="est-tt__t">${esc(cfg.serieTxt || 'año a año')}, ${cfg.datos.años[0]}–${cfg.datos.años[1]}</span>` : '<span class="est-tt__t">Sin proyectos con estos filtros</span>'}`;
      const r = box.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      tt.style.left = Math.min(x + 16, r.width - 200) + 'px';
      tt.style.top = Math.min(y + 16, r.height - 120) + 'px';
    }

    function hover(code) {
      if (!gZoom) return;
      gZoom.selectAll('.est-pais').classed('is-hover', f => f.id === code);
      if (code) gZoom.selectAll('.est-pais').filter(f => f.id === code).raise();
    }

    /* Red de socios: arcos desde un país a sus socios más frecuentes. */
    function arcos(origen, socios = []) {
      if (!gArcos) return;
      if (!origen || !centro.has(origen)) { gArcos.selectAll('*').remove(); return; }
      const [x0, y0] = centro.get(origen);
      const top = socios.filter(s => centro.has(s.code)).slice(0, 15);
      const max = Math.max(...top.map(s => s.n), 1);
      const curva = s => {
        const [x1, y1] = centro.get(s.code);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0;
        const k = 0.22, cx = mx - dy * k, cy = my + dx * k;
        return `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`;
      };
      const anim = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const g = gArcos.selectAll('g.est-arco').data(top, s => s.code).join(enter => {
        const e = enter.append('g').attr('class', 'est-arco');
        e.append('path').attr('class', 'est-arco__halo');
        e.append('path').attr('class', 'est-arco__linea');
        e.append('circle').attr('class', 'est-arco__nodo');
        return e;
      });
      g.select('.est-arco__halo').attr('d', curva).attr('stroke-width', s => 2 + 5 * Math.sqrt(s.n / max));
      g.select('.est-arco__linea').attr('d', curva).attr('stroke-width', s => 1 + 3.2 * Math.sqrt(s.n / max))
        .each(function () {
          if (!anim) return;
          const L = this.getTotalLength();
          d3.select(this).attr('stroke-dasharray', `${L} ${L}`).attr('stroke-dashoffset', L)
            .transition().duration(700).delay((_, i) => i * 40).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0);
        });
      g.select('.est-arco__nodo').attr('cx', s => centro.get(s.code)[0]).attr('cy', s => centro.get(s.code)[1])
        .attr('r', s => (2.5 + 5 * Math.sqrt(s.n / max)) / Math.sqrt(zk));
      g.selectAll('title').remove();
      g.append('title').text(s => `${s.nombre}: ${fmtN(s.n)} proyectos en común (${pct(s.pct)})`);
      gArcos.selectAll('circle.est-arco__origen').data([origen]).join('circle')
        .attr('class', 'est-arco__origen').attr('cx', x0).attr('cy', y0).attr('r', 5 / Math.sqrt(zk)).raise();
    }

    function zoomA(code) {
      const f = feats.find(x => x.id === code);
      if (!f || !svg) return;
      const [[x0, y0], [x1, y1]] = path.bounds(mayor(f));
      const k = Math.max(1, Math.min(6, 0.45 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
      svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
    }
    function zoomPaso(f) { if (svg) svg.transition().duration(300).call(zoom.scaleBy, f); }
    function zoomReset() { if (svg) svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity); }
    function cambiarModo() { modo = null; if (cfg) pintar(cfg); }
    const actual = () => cfg;

    return { pintar, hover, arcos, zoomA, zoomPaso, zoomReset, cambiarModo, actual, valorDe, colorDe: code => colorDe(code) };
  })();

  /* Mini-mapa estático (Comparar líneas): misma escala para todos. */
  async function miniMapa(el, datos, valor, color, titulo) {
    const d3 = await esperar('d3');
    const g = await fetch('/data/europa.geo.json').then(r => r.json());
    const W = el.clientWidth || 300, H = Math.round(W * 0.78);
    const proj = d3.geoAzimuthalEqualArea().rotate([-12, -52]).fitExtent([[4, 4], [W - 4, H - 4]], { type: 'MultiPoint', coordinates: [[-23, 63], [-10, 36], [35, 34], [44, 41], [33, 70]] });
    const path = d3.geoPath(proj);
    const por = new Map(datos.paises.map(p => [p.code, p]));
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const tt = el.parentElement.querySelector('.est-mini-tt');
    svg.selectAll('path').data(g.features).join('path').attr('d', path).attr('class', 'est-pais')
      .attr('fill', f => { const p = por.get(f.id); return p ? color(valor(p)) : SIN_DATO; })
      .on('mousemove', (ev, f) => {
        const p = por.get(f.id);
        tt.hidden = false;
        tt.innerHTML = `<b>${esc(p ? p.nombre : f.id)}</b><br>${p ? `${pct(valor(p), 1)} de los proyectos de ${esc(titulo)}<br>${fmtN(p.coord)} coordinados` : 'Sin proyectos'}`;
        const r = el.parentElement.getBoundingClientRect();
        tt.style.left = Math.min(ev.clientX - r.left + 12, r.width - 170) + 'px';
        tt.style.top = (ev.clientY - r.top + 12) + 'px';
      })
      .on('mouseleave', () => { tt.hidden = true; });
  }

  /* ── Línea de tiempo (persistente) ────────────────────────── */
  const Tiempo = (() => {
    let datos = null, drag = null, play = null;
    function pintar(d) {
      datos = d;
      const el = $('#est-tiempo-barras');
      if (!el) return;
      const [a0, a1] = d.años, max = Math.max(...d.totalY, 1);
      el.innerHTML = d.totalY.map((v, k) => {
        const y = a0 + k;
        return `<button type="button" class="est-año" data-y="${y}" title="${y}: ${fmtN(v)} proyectos concedidos">
          <span class="est-año__bar" style="height:${Math.max(3, v / max * 100).toFixed(1)}%"></span><span class="est-año__txt">${String(y).slice(2)}</span></button>`;
      }).join('');
      marcar(S.f.desde, S.f.hasta);
      el.querySelectorAll('.est-año').forEach(b => b.addEventListener('click', e => {
        if (e.detail !== 0) return;            // ratón y dedo van por los pointer events
        const y = +b.dataset.y;
        if (e.shiftKey) fijar(Math.min(y, S.f.desde), Math.max(y, S.f.hasta)); else fijar(y, y);
      }));
      $('#est-tiempo-desc').textContent = `${a0}–${a1}`;
    }
    function marcar(a, b) {
      document.querySelectorAll('#est-tiempo-barras .est-año').forEach(x => { const y = +x.dataset.y; x.classList.toggle('is-on', y >= a && y <= b); });
      const t = $('#est-tiempo-rango'); if (t) t.textContent = periodoTxt(a, b);
      document.querySelectorAll('[data-periodo]').forEach(x => x.classList.toggle('is-on', x.dataset.periodo === `${a}-${b}`));
    }
    function fijar(a, b) {
      parar();
      if (a === S.f.desde && b === S.f.hasta) return;
      S.f.desde = a; S.f.hasta = b; cambiarFiltros();
    }
    function yearAt(ev) {
      const el = $('#est-tiempo-barras'), r = el.getBoundingClientRect(), n = datos.totalY.length;
      return datos.años[0] + Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - r.left) / r.width * n)));
    }
    function previa(a, b) {
      marcar(a, b);
      const c = Mapa.actual();
      if (c) Mapa.pintar({ ...c, rango: [a, b], mantenerArcos: true });
    }
    function enlazar() {
      const el = $('#est-tiempo-barras');
      el.addEventListener('pointerdown', ev => {
        if (!datos || ev.button) return;
        parar();
        const y = yearAt(ev);
        drag = { a: y, b: y, x: ev.clientX, movido: false };
        el.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });
      el.addEventListener('pointermove', ev => {
        if (!drag) return;
        const y = yearAt(ev);
        if (Math.abs(ev.clientX - drag.x) > 4) drag.movido = true;
        if (y !== drag.b) { drag.b = y; previa(Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)); }
      });
      const fin = ev => {
        if (!drag) return;
        const d = drag; drag = null;
        let a = Math.min(d.a, d.b), b = Math.max(d.a, d.b);
        if (!d.movido && ev.shiftKey) { a = Math.min(a, S.f.desde); b = Math.max(b, S.f.hasta); }
        fijar(a, b);
        if (a === S.f.desde && b === S.f.hasta) marcar(a, b);
      };
      el.addEventListener('pointerup', fin);
      el.addEventListener('pointercancel', () => { drag = null; marcar(S.f.desde, S.f.hasta); const c = Mapa.actual(); if (c) Mapa.pintar({ ...c, rango: null }); });
      $('#est-play').addEventListener('click', () => (play ? parar(true) : reproducir()));
    }
    function reproducir() {
      const c = Mapa.actual();
      if (!c || !datos) return;
      const [a0, a1] = datos.años;
      let y = a0;
      const btn = $('#est-play');
      btn.classList.add('is-on'); btn.querySelector('.material-symbols-outlined').textContent = 'pause'; btn.setAttribute('aria-label', 'Pausar');
      const marca = $('#est-mapa-año');
      const paso = () => {
        if (y > a1) { parar(true); return; }
        marcar(y, y);
        marca.hidden = false; marca.textContent = y;
        Mapa.pintar({ ...Mapa.actual(), rango: [y, y], anual: true, mantenerArcos: true });
        y++;
      };
      paso();
      play = setInterval(paso, 1100);
    }
    function parar(restaurar) {
      if (!play) return;
      clearInterval(play); play = null;
      const btn = $('#est-play');
      if (btn) { btn.classList.remove('is-on'); btn.querySelector('.material-symbols-outlined').textContent = 'play_arrow'; btn.setAttribute('aria-label', 'Reproducir año a año'); }
      const marca = $('#est-mapa-año'); if (marca) marca.hidden = true;
      marcar(S.f.desde, S.f.hasta);
      const c = Mapa.actual();
      if (restaurar && c) Mapa.pintar({ ...c, rango: null, anual: false, mantenerArcos: true });
    }
    return { pintar, enlazar, parar, marcar };
  })();

  /* ── Gráficas ─────────────────────────────────────────────── */
  function limpiarGraficas() { charts.forEach(c => { try { c.destroy(); } catch { /* ya destruida */ } }); charts = []; }

  const BASE = () => ({
    chart: { fontFamily: 'Poppins, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, animations: { speed: 250 }, parentHeightOffset: 0 },
    grid: { borderColor: LINEA, strokeDashArray: 0, padding: { left: 8, right: 8 } },
    dataLabels: { enabled: false },
    legend: { fontWeight: 600, labels: { colors: TINTA }, markers: { width: 10, height: 10, radius: 10 } },
    tooltip: { theme: 'light' },
    xaxis: { labels: { style: { colors: TEXTO2, fontWeight: 500 } }, axisBorder: { color: '#d6d3dc' }, axisTicks: { color: '#d6d3dc' } },
    yaxis: { labels: { style: { colors: TEXTO2, fontWeight: 500 } } },
    states: { hover: { filter: { type: 'darken', value: 0.88 } } },
  });

  function merge(a, b) {
    const o = { ...a };
    for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
    return o;
  }

  async function grafica(sel, opts) {
    await esperar('ApexCharts');
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return null;
    const c = new ApexCharts(el, merge(BASE(), opts));
    charts.push(c);
    await c.render();
    return c;
  }

  // Barras horizontales en HTML: el nombre completo cabe (salta de línea) y la
  // cifra va siempre fuera de la barra. Hover = fila resaltada + title.
  function barrasH(sel, filas, { valor, etiqueta, fmt = fmtN, color = AZUL, colores, onClick, onHover, tooltip }) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return;
    const max = Math.max(...filas.map(valor), 1);
    el.innerHTML = `<ol class="est-hbar ${onClick ? 'est-hbar--click' : ''}">${filas.map((f, i) => {
      const v = valor(f), w = Math.max(0.6, v / max * 100);
      const tag = onClick ? 'button type="button"' : 'div';
      return `<li><${tag} class="est-hbar__fila" data-i="${i}" title="${esc(etiqueta(f))}: ${esc(fmt(v))}${tooltip ? ' · ' + esc(tooltip) : ''}">
        <span class="est-hbar__label">${esc(etiqueta(f))}</span>
        <span class="est-hbar__track"><span class="est-hbar__bar" style="width:${w.toFixed(2)}%;background:${colores ? colores[i] : color}"></span><span class="est-hbar__val">${esc(fmt(v))}</span></span>
      </${onClick ? 'button' : 'div'}></li>`;
    }).join('')}</ol>`;
    el.querySelectorAll('.est-hbar__fila').forEach(b => {
      if (onClick) b.addEventListener('click', () => onClick(filas[+b.dataset.i]));
      if (onHover) { b.addEventListener('mouseenter', () => onHover(filas[+b.dataset.i])); b.addEventListener('mouseleave', () => onHover(null)); }
    });
  }

  function barrasV(sel, cats, datos, { nombre, fmt = fmtN, color = AZUL, alto = 240 }) {
    return grafica(sel, {
      chart: { type: 'bar', height: alto },
      series: [{ name: nombre, data: datos }],
      xaxis: { categories: cats },
      yaxis: { labels: { formatter: v => fmt(v) }, tickAmount: 4 },
      colors: [color],
      plotOptions: { bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: cats.length > 8 ? '70%' : '48%' } },
      tooltip: { y: { formatter: v => fmt(v) } },
    });
  }

  // Sparkline; con {desde, hasta} sombrea el periodo elegido y con `media`
  // añade la serie de referencia (discontinua, gris) en la misma escala.
  function sparkSvg(vals, w = 92, h = 26, marca = null, media = null) {
    const max = Math.max(...vals, ...(media || []), 1);
    const pasos = vals.length - 1 || 1;
    const X = i => i / pasos * (w - 4) + 2;
    const puntos = serie => serie.map((v, i) => `${X(i).toFixed(1)},${(h - 3 - (v || 0) / max * (h - 6)).toFixed(1)}`).join(' ');
    const pts = puntos(vals);
    const ult = pts.split(' ').pop().split(',');
    const banda = marca ? `<rect x="${(X(marca.desde) - 3).toFixed(1)}" y="0" width="${(X(marca.hasta) - X(marca.desde) + 6).toFixed(1)}" height="${h}" rx="3" fill="${LINEA}"/>` : '';
    const ref = media ? `<polyline fill="none" stroke="${MEDIA}" stroke-width="1.5" stroke-dasharray="3 3" stroke-linejoin="round" points="${puntos(media)}"/>` : '';
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${banda}${ref}<polyline fill="none" stroke="${AZUL}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/><circle cx="${ult[0]}" cy="${ult[1]}" r="2.5" fill="${AZUL}"/></svg>`;
  }
  const leyendaSpark = (nombre, media) => `<span class="est-spark-ley"><i class="est-spark-ley__a"></i>${esc(nombre)}<i class="est-spark-ley__m"></i>${esc(media)}</span>`;

  // Media año a año de los países que coordinan algún proyecto (los mismos
  // que usa «Frente a la media») o, en el ranking, de los que tienen alguna
  // entidad: la línea de referencia de los sparklines.
  const mediasCache = new WeakMap();
  function mediaPaises(datos, clave, fn) {
    let m = mediasCache.get(datos);
    if (!m) mediasCache.set(datos, m = new Map());
    if (m.has(clave)) return m.get(clave);
    const n = datos.años[1] - datos.años[0] + 1;
    const base = datos.paises.filter(p => p.coord > 0 || p.n > 0);
    const out = Array.from({ length: n }, (_, k) => {
      const vs = base.map(p => fn(p, k, k)).filter(v => v > 0);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    });
    m.set(clave, out);
    return out;
  }

  // 100 puntos: de cada 100 solicitudes, cuántas salen.
  function waffle(tasa) {
    const n = Math.round(tasa);
    return `<div class="est-waffle" role="img" aria-label="${n} de cada 100 solicitudes aprobadas">${Array.from({ length: 100 }, (_, i) => `<i class="${i < n ? 'is-on' : ''}"></i>`).join('')}</div>`;
  }

  /* ── Piezas de interfaz ───────────────────────────────────── */
  const tarjeta = (titulo, cuerpo, { sub = '', cls = '' } = {}) => `
    <div class="est-card ${cls}">
      <div class="est-card__head"><h3>${titulo}</h3>${sub ? `<p>${sub}</p>` : ''}</div>
      ${cuerpo}
    </div>`;

  const kpi = (label, valor, nota = '', destacado = false) => `
    <div class="est-kpi ${destacado ? 'est-kpi--lima' : ''}">
      <span class="est-kpi__label">${label}</span>
      <span class="est-kpi__valor ${String(valor).replace(/<[^>]+>/g, '').length > 16 ? 'est-kpi__valor--texto' : ''}">${valor}</span>
      ${nota ? `<span class="est-kpi__nota">${nota}</span>` : ''}
    </div>`;

  // Cifra del panel lateral: etiqueta y valor en una fila.
  const dato = (label, valor, nota = '') => `<div class="est-dato"><dt>${label}${nota ? `<small>${nota}</small>` : ''}</dt><dd>${valor}</dd></div>`;

  const chip = (txt, cls = '') => `<span class="est-chip ${cls}">${esc(txt)}</span>`;

  function cargando(el, filas = 3) {
    el.innerHTML = `<div class="est-esqueleto" aria-busy="true" aria-label="Calculando">${'<span></span>'.repeat(filas)}</div>`;
  }
  function error(el, e) { el.innerHTML = `<div class="est-vacio"><span class="material-symbols-outlined">error</span><p>No se han podido cargar los datos.</p><p class="text-xs">${esc(e?.message || '')}</p></div>`; }

  /* ── Esqueleto (una vez) ──────────────────────────────────── */
  function construir() {
    const root = $('#est-root');
    const paisesOp = META.paises.filter(p => p.n > 0 || p.code === 'ES').map(p => `<option value="${p.code}">${esc(p.nombre)}</option>`).join('');

    root.innerHTML = `
      <header class="est-header">
        <h1 class="font-headline text-2xl font-bold text-primary flex items-center gap-2">
          <span class="material-symbols-outlined">monitoring</span> Estadísticas Erasmus+
        </h1>
        <p class="text-sm text-on-surface-variant mt-1">Lo que se ha concedido de verdad, país a país y línea a línea: cuántos proyectos, cuánto dinero y quién lo consigue.</p>
        <p class="text-[11px] text-on-surface-variant/80 mt-1">${fmtN(META.lineas.reduce((a, l) => a + l.n, 0))} proyectos concedidos de ${META.años[0]} a ${META.años[1]} · ${esc(META.fuente)} · datos del ${fecha(META.generado.slice(0, 10))}</p>
      </header>

      <nav class="est-tabs" role="tablist" aria-label="Vistas de estadísticas">
        ${VISTAS.map(v => `<button type="button" role="tab" class="est-tab" data-vista="${v.id}"><span class="material-symbols-outlined">${v.icono}</span>${v.nombre}</button>`).join('')}
      </nav>

      <section class="est-filtros" aria-label="Filtros">
        <div class="est-filtro">
          <label for="est-grupo">Tipo de acción</label>
          <select id="est-grupo"><option value="">Todas</option>${META.grupos.map(g => `<option value="${g.id}">${esc(g.nombre)}</option>`).join('')}</select>
        </div>
        <div class="est-filtro">
          <label for="est-sector">Sector</label>
          <select id="est-sector"><option value="">Todos</option>${Object.entries(META.sectores).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
        </div>
        <div class="est-filtro">
          <label for="est-gestion">Quién la gestiona</label>
          <select id="est-gestion"><option value="">Todas</option><option value="AN">Agencia Nacional</option><option value="EACEA">Bruselas (EACEA)</option></select>
        </div>
        <div class="est-filtro est-filtro--pais">
          <label for="est-pais">País</label>
          <div class="flex gap-1.5">
            <select id="est-pais"><option value="">Todos</option>${paisesOp}</select>
            <select id="est-rol" aria-label="Papel del país"><option value="coord">coordina</option><option value="part">participa</option></select>
          </div>
        </div>
        <div class="est-filtro est-filtro--acciones">
          <button type="button" id="est-limpiar" class="est-btn est-btn--ghost"><span class="material-symbols-outlined">filter_alt_off</span>Limpiar</button>
          <button type="button" id="est-enlace" class="est-btn est-btn--ghost" title="Copiar un enlace a esta vista con estos filtros"><span class="material-symbols-outlined">link</span>Copiar enlace</button>
        </div>
      </section>

      <section class="est-escenario" aria-label="Mapa">
        <div class="est-escenario__mapa">
          <div class="est-mapa-barra">
            <div class="est-seg est-seg--scroll" role="group" aria-label="Qué mide el mapa" id="est-metricas">
              ${Object.entries(METRICAS).map(([k, m]) => `<button type="button" data-metrica="${k}" title="${esc(m.t)}">${esc(m.corto)}</button>`).join('')}
            </div>
            <div class="est-seg est-seg--scroll" role="group" aria-label="Qué mide el mapa" id="est-metricas-ent" hidden>
              ${Object.entries(ENT_METRICAS).map(([k, m]) => `<button type="button" data-emetrica="${k}" title="${esc(m.t)}">${esc(m.corto)}</button>`).join('')}
            </div>
            <div class="est-mapa-barra__dcha">
              <div class="est-buscar est-buscar--mapa"><span class="material-symbols-outlined">search</span>
                <input id="est-buscar-pais" type="search" list="est-paises-lista" placeholder="Buscar país" aria-label="Buscar país en el mapa"></div>
              <datalist id="est-paises-lista">${META.paises.map(p => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
              <div class="est-seg" role="group" aria-label="Zona del mapa">
                <button type="button" data-mapa="europa">Europa</button>
                <button type="button" data-mapa="mundo">Mundo</button>
              </div>
            </div>
          </div>
          <div class="est-mapa-marco">
            <div id="est-mapa" class="est-mapa"></div>
            <div id="est-mapa-titulo" class="est-mapa-titulo"></div>
            <div id="est-mapa-año" class="est-mapa-año" hidden></div>
            <div class="est-zoom" role="group" aria-label="Zoom del mapa">
              <button type="button" data-zoom="mas" aria-label="Acercar"><span class="material-symbols-outlined">add</span></button>
              <button type="button" data-zoom="menos" aria-label="Alejar"><span class="material-symbols-outlined">remove</span></button>
              <button type="button" data-zoom="reset" aria-label="Ver todo el mapa"><span class="material-symbols-outlined">fit_screen</span></button>
            </div>
            <div id="est-mapa-tt" class="est-tt est-tt--flot" hidden></div>
            <div id="est-mapa-aviso" class="est-mapa-aviso" hidden></div>
          </div>
          <div id="est-mapa-leyenda" class="est-leyenda"></div>
          <div class="est-tiempo">
            <button type="button" id="est-play" class="est-play" aria-label="Reproducir año a año" title="Reproducir año a año"><span class="material-symbols-outlined">play_arrow</span></button>
            <div class="est-tiempo__cuerpo">
              <div class="est-tiempo__cab"><span>Periodo <b id="est-tiempo-rango"></b></span><small>Arrastra sobre los años para elegir un periodo · <span id="est-tiempo-desc"></span></small></div>
              <div id="est-tiempo-barras" class="est-tiempo__barras" aria-label="Años"></div>
            </div>
            <div class="est-seg est-seg--vertical" role="group" aria-label="Periodos rápidos">
              <button type="button" data-periodo="2021-${META.años[1]}">Programa actual</button>
              <button type="button" data-periodo="${META.años[0]}-2020">2014-2020</button>
              <button type="button" data-periodo="${META.años[0]}-${META.años[1]}">Todo</button>
            </div>
          </div>
        </div>
        <aside id="est-panel" class="est-panel" aria-live="polite"></aside>
      </section>
      <p id="est-resumen" class="est-resumen" aria-live="polite"></p>

      <div id="est-vista"></div>
      <p class="est-pie">Solo se publican los proyectos <b>concedidos</b>: no hay datos de solicitudes presentadas, salvo las tasas de éxito que sacamos de las agencias. «Al tope» = proyectos que reciben al menos el 97 % del máximo de su convocatoria. Las cantidades son la subvención total del proyecto, no lo que recibe cada socio. «Participa» cuenta los proyectos con al menos una entidad del país en cualquier papel, coordinación incluida.${META.fuentePoblacion ? ` Población: ${esc(META.fuentePoblacion)}.` : ''} Mapa: Natural Earth.</p>
    `;

    root.querySelectorAll('.est-tab').forEach(b => b.addEventListener('click', () => irA(b.dataset.vista)));
    // Barra lateral: app.js anula el clic de los .nav-link sin data-route; aquí
    // se navega dentro de la sección, conservando los filtros.
    document.querySelectorAll('#sidebar-group-estadisticas [data-est-vista]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      irA(a.dataset.estVista);
    }));
    root.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => {
      const [d, h] = b.dataset.periodo.split('-').map(Number);
      Tiempo.parar(); S.f.desde = d; S.f.hasta = h; cambiarFiltros();
    }));
    root.querySelectorAll('[data-metrica]').forEach(b => b.addEventListener('click', () => {
      S.metrica = b.dataset.metrica;
      const r = METRICAS[S.metrica].rol;
      if (S.f.pais && S.f.rol !== r && S.vista !== 'paises') S.f.rol = r;
      cambiarFiltros();
    }));
    root.querySelectorAll('[data-emetrica]').forEach(b => b.addEventListener('click', () => { S.emetrica = b.dataset.emetrica; cambiarFiltros(); }));
    root.querySelectorAll('[data-mapa]').forEach(b => b.addEventListener('click', () => {
      if (S.mapa === b.dataset.mapa) return;
      S.mapa = b.dataset.mapa; escribirHash(false); pintarControles(); Mapa.cambiarModo();
    }));
    root.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      const z = b.dataset.zoom;
      if (z === 'mas') Mapa.zoomPaso(1.6); else if (z === 'menos') Mapa.zoomPaso(1 / 1.6); else Mapa.zoomReset();
    }));
    $('#est-buscar-pais').addEventListener('change', e => {
      const t = e.target.value.trim().toLowerCase();
      if (!t) return;
      const p = META.paises.find(x => x.nombre.toLowerCase() === t) || META.paises.find(x => x.nombre.toLowerCase().startsWith(t));
      if (!p) { avisar('No encuentro ese país'); return; }
      e.target.value = '';
      e.target.blur();
      if (S.mapa === 'europa' && !EUROPA.has(p.code)) { S.mapa = 'mundo'; escribirHash(false); pintarControles(); Mapa.cambiarModo(); }
      setTimeout(() => Mapa.zoomA(p.code), 120);
      Mapa.actual()?.onClick?.(p.code, { desdeBuscador: true });
    });
    const on = (id, fn) => $(id).addEventListener('change', fn);
    on('#est-grupo', e => { S.f.grupo = e.target.value; cambiarFiltros(); });
    on('#est-sector', e => { S.f.sector = e.target.value; cambiarFiltros(); });
    on('#est-gestion', e => { S.f.gestion = e.target.value; cambiarFiltros(); });
    on('#est-pais', e => { if (S.vista === 'paises') { S.sel = e.target.value; S.f.pais = ''; } else S.f.pais = e.target.value; cambiarFiltros(); });
    on('#est-rol', e => { S.f.rol = e.target.value; cambiarFiltros(); });
    $('#est-limpiar').addEventListener('click', () => {
      Object.assign(S.f, { desde: 2021, hasta: META.años[1], grupo: '', sector: '', gestion: '', pais: '', rol: 'coord' });
      cambiarFiltros();
    });
    $('#est-enlace').addEventListener('click', async () => {
      const url = location.origin + '/' + hashActual();
      try { await navigator.clipboard.writeText(url); avisar('Enlace copiado'); }
      catch { prompt('Copia este enlace:', url); }
    });
    Tiempo.enlazar();
    built = true;
  }

  // Países que dibuja el mapa de Europa (si buscas otro, se pasa a Mundo).
  const EUROPA = new Set('VA JE GG IM UK UA TR TN SY CH SE ES SK SI RS SM RU RO PT PL NO NL MA ME MD MC MT MK LU LT LI LY LB LV XK KZ JO IT IL IE IQ IR IS HU EL DE GE FR AX FI EE GL FO DK CZ CY HR BG BA BE BY AZ AT AM AD DZ AL PS EG'.split(' '));

  let avisoT = {};
  function avisar(txt, clave) {
    if (clave === 'zoom') {
      const a = $('#est-mapa-aviso');
      if (!a) return;
      a.textContent = txt; a.hidden = false;
      clearTimeout(avisoT.zoom); avisoT.zoom = setTimeout(() => { a.hidden = true; }, 1400);
      return;
    }
    const b = document.createElement('div');
    b.className = 'est-toast'; b.setAttribute('role', 'status'); b.textContent = txt;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 2200);
  }

  function pintarControles() {
    const f = S.f;
    $('#est-grupo').value = f.grupo; $('#est-sector').value = f.sector; $('#est-gestion').value = f.gestion;
    $('#est-pais').value = S.vista === 'paises' ? (S.sel || '') : f.pais; $('#est-rol').value = f.rol;
    $('#est-rol').hidden = !f.pais || S.vista === 'paises' || S.vista === 'entidades';
    Tiempo.marcar(f.desde, f.hasta);
    const vistaTab = S.vista === 'linea' ? 'lineas' : S.vista;
    document.querySelectorAll('.est-tab').forEach(b => { const on = b.dataset.vista === vistaTab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    document.querySelectorAll('[data-est-vista]').forEach(a => a.classList.toggle('active', a.dataset.estVista === vistaTab));
    document.querySelectorAll('[data-metrica]').forEach(b => b.classList.toggle('is-on', b.dataset.metrica === S.metrica));
    document.querySelectorAll('[data-emetrica]').forEach(b => b.classList.toggle('is-on', b.dataset.emetrica === S.emetrica));
    $('#est-metricas').hidden = S.vista === 'entidades';
    $('#est-metricas-ent').hidden = S.vista !== 'entidades';
    document.querySelectorAll('[data-mapa]').forEach(b => b.classList.toggle('is-on', b.dataset.mapa === S.mapa));
    // En la ficha y en Tasas, los filtros de catálogo no aplican.
    const catalogo = !['linea', 'tasas'].includes(S.vista);
    ['#est-grupo', '#est-sector', '#est-gestion'].forEach(id => { $(id).closest('.est-filtro').classList.toggle('est-off', !catalogo); });
    $('#est-pais').closest('.est-filtro').classList.toggle('est-off', S.vista === 'tasas');
    const n = [f.grupo, f.sector, f.gestion, f.pais].filter(Boolean).length + (f.desde !== 2021 || f.hasta !== META.años[1] ? 1 : 0);
    $('#est-limpiar').hidden = !n;
  }

  function frase(total) {
    const f = S.f, partes = [periodoTxt()];
    if (f.grupo && !['linea', 'tasas'].includes(S.vista)) partes.push(nombreGrupo(f.grupo));
    if (f.sector && !['linea', 'tasas'].includes(S.vista)) partes.push(nombreSector(f.sector));
    if (f.gestion && !['linea', 'tasas'].includes(S.vista)) partes.push(gestionTxt(f.gestion));
    if (f.pais && S.vista === 'entidades') partes.push(`entidades de ${nombrePais(f.pais)}`);
    else if (f.pais && S.vista !== 'paises') partes.push(`${f.rol === 'coord' ? 'coordinados por' : 'con participación de'} ${nombrePais(f.pais)}`);
    if (S.vista === 'entidades') {
      $('#est-resumen').innerHTML = `<b>${fmtN(total)}</b> entidades con ${S.ent.min > 1 ? `${S.ent.min} proyectos o más` : 'proyectos'} · ${partes.map(esc).join(' · ')}`;
      return;
    }
    $('#est-resumen').innerHTML = total == null
      ? (S.vista === 'tasas' ? '' : `Con estos filtros: ${partes.map(esc).join(' · ')}`)
      : `<b>${fmtN(total)}</b> proyectos concedidos · ${partes.map(esc).join(' · ')}`;
  }

  /* ── Navegación interna ───────────────────────────────────── */
  function irA(vista, id = null) {
    Tiempo.parar();
    if (vista !== S.vista) Mapa.zoomReset();
    S.vista = vista; S.id = id;
    escribirHash(true);
    render();
    $('#est-root')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function cambiarFiltros() { Tiempo.parar(); escribirHash(false); render(); }

  function render() {
    pintarControles();
    limpiarGraficas();
    const el = $('#est-vista'), panel = $('#est-panel');
    const n = ++seq;
    const vivo = () => n === seq;
    const vistas = { panorama, lineas, linea: ficha, comparar, paises, tasas, entidades };
    (vistas[S.vista] || paises)(el, panel, vivo);
  }

  // Clic en el mapa = filtrar por ese país (o quitar el filtro si ya lo era).
  function filtrarPais(code) {
    if (S.f.pais === code) S.f.pais = '';
    else { S.f.pais = code; S.f.rol = metrica().rol; }
    cambiarFiltros();
  }
  const quitarPais = () => `<button type="button" class="est-quitar" id="est-quitar-pais"><span class="material-symbols-outlined">close</span>${esc(nombrePais(S.f.pais))}</button>`;
  function enlazarQuitar(panel) { panel.querySelector('#est-quitar-pais')?.addEventListener('click', () => { S.f.pais = ''; cambiarFiltros(); }); }

  async function cargarMapa(qs, vivo, extra = {}) {
    const d = await getMemo('/paises?' + qs);
    if (!vivo()) return null;
    Tiempo.pintar(d);
    await Mapa.pintar({ datos: d, ...extra });
    return d;
  }

  /* ═══ PAÍSES (mapa + ranking) ════════════════════════════════ */
  async function paises(el, panel, vivo) {
    cargando(el, 6); cargando(panel, 5);
    const M = metrica();
    const sel = S.sel || S.f.pais || S.f.foco;
    let d;
    try {
      d = await cargarMapa(qsSinPais(), vivo, {
        titulo: M.t, sel,
        onClick: code => { S.sel = code; escribirHash(false); detalle(code); Mapa.pintar({ ...Mapa.actual(), sel: code, mantenerArcos: true }); },
      });
    } catch (e) { return vivo() && error(el, e); }
    if (!d) return;
    frase(d.total);

    const [ra, rb] = [S.f.desde - d.años[0], S.f.hasta - d.años[0]];
    const val = p => M.v(p, ra, rb);
    const conDato = d.paises.filter(p => val(p) > 0);
    const rankDe = code => { const o = [...conDato].sort((a, b) => val(b) - val(a)); return o.findIndex(p => p.code === code) + 1; };

    // Panel: el país seleccionado
    async function detalle(code) {
      const p = d.paises.find(x => x.code === code);
      if (!p) { panel.innerHTML = `<div class="est-panel__head"><h2>${esc(nombrePais(code))}</h2><p>Sin proyectos con estos filtros.</p></div>`; Mapa.arcos(null); return; }
      const rol = M.rol;
      const hab = METRICAS.hab.v(p, ra, rb);
      const clave = rol === 'part' ? 'pY' : 'cY';
      const serie = p[clave];
      const media = mediaPaises(d, clave, (x, a, b) => suma(x[clave], a, b));
      panel.innerHTML = `
        <div class="est-panel__head">
          <h2>${esc(p.nombre)}</h2>
          <p>${val(p) > 0 ? `Puesto <b>${rankDe(code)}</b> de ${conDato.length} · ${esc(M.corto.toLowerCase())}` : 'Sin dato para esta medida'}</p>
        </div>
        <div class="est-panel__spark">${sparkSvg(serie, 300, 46, { desde: ra, hasta: rb }, media)}<small>Proyectos que ${rol === 'part' ? 'participa' : 'coordina'} por año, ${d.años[0]}–${d.años[1]}</small>${leyendaSpark(p.nombre, 'media de los países')}</div>
        <dl class="est-datos">
          ${dato('Coordina', fmtN(p.coord))}
          ${dato('Participa', fmtN(p.part))}
          ${dato('Dinero que coordina', fmtEur(p.importeCoord))}
          ${dato('Por millón de habitantes', fmtHab(hab), 'participación')}
          ${dato('Coordina de cada 100', p.part ? fmtN(p.coord / p.part * 100) : '—')}
          ${dato('Frente a la media', d.mediaCoord ? (p.coord / d.mediaCoord).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' veces' : '—', 'proyectos coordinados')}
        </dl>
        <label class="est-switch"><input type="checkbox" id="est-red" ${S.red ? 'checked' : ''}><span></span>Ver en el mapa con quién trabaja</label>
        <div id="est-pais-extra">${'<div class="est-esqueleto est-esqueleto--fino"><span></span><span></span></div>'}</div>
        <div class="est-panel__acciones">
          <button type="button" class="est-btn est-btn--primary" data-p="panorama"><span class="material-symbols-outlined">dashboard</span>Su panorama</button>
          <button type="button" class="est-btn est-btn--ghost" data-p="lineas"><span class="material-symbols-outlined">view_list</span>Sus líneas</button>
          <button type="button" class="est-btn est-btn--ghost" data-p="comparar"><span class="material-symbols-outlined">compare_arrows</span>Comparar</button>
        </div>`;
      panel.querySelector('#est-red').addEventListener('change', e => { S.red = e.target.checked; escribirHash(false); pintarRed(); });
      panel.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.p;
        if (a === 'comparar') {
          const ids = S.comp.tipo === 'pais' ? S.comp.ids.filter(x => x !== p.code) : [];
          S.comp = { tipo: 'pais', ids: [p.code, ...(ids.length ? ids : [p.code === 'ES' ? 'IT' : 'ES'])].slice(0, 4) };
        } else { S.f.pais = p.code; S.f.rol = rol; }
        irA(a);
      }));
      document.querySelectorAll('#est-rank tr[data-code]').forEach(tr => tr.classList.toggle('is-sel', tr.dataset.code === code));

      let x;
      try { x = await getMemo(`/pais/${code}?` + qsSinPais({ rol })); } catch (e) { return; }
      if (!vivo() || (S.sel || sel) !== code) return;
      const extra = panel.querySelector('#est-pais-extra');
      if (!extra) return;
      extra.innerHTML = `
        <div class="est-panel__bloque" id="est-socios" ${S.red ? '' : 'hidden'}>
          <h4>Con quién trabaja más</h4>
          <p class="est-nota">Países presentes en los proyectos en los que ${rol === 'part' ? 'participa' : 'coordina'} ${esc(p.nombre)}</p>
          <div id="est-socios-barras"></div>
        </div>
        <div class="est-panel__bloque">
          <h4>Sus líneas principales</h4>
          <ol class="est-mini est-mini--plano">${x.lineas.slice(0, 5).map(l => `<li><a href="${linkLinea(l.id)}" data-linea="${l.id}"><span class="est-mini__nombre">${esc(l.nombre)}<small>${fmtEur(l.importe)}</small></span><span class="est-mini__valor">${fmtN(l.proyectos)}</span></a></li>`).join('') || '<li class="est-nota">Sin líneas con estos filtros.</li>'}</ol>
        </div>
        ${x.entidades.length ? `<div class="est-panel__bloque"><h4>Quién coordina más</h4><ol class="est-mini est-mini--plano est-mini--org">${x.entidades.slice(0, 5).map(o => `<li><span class="est-mini__fila"><span class="est-mini__nombre">${nombreEnt(o)}<small>${fmtEur(o.importe)}</small></span><span class="est-mini__valor">${fmtN(o.proyectos)}</span></span></li>`).join('')}</ol></div>` : ''}`;
      enlazarLineas(extra);
      enlazarFichas(extra);
      barrasH('#est-socios-barras', x.socios.slice(0, 8), { valor: s => s.n, etiqueta: s => s.nombre, fmt: fmtN, color: MAGENTA, tooltip: 'proyectos en común', onHover: s => Mapa.hover(s ? s.code : null), onClick: s => { S.sel = s.code; escribirHash(false); detalle(s.code); Mapa.pintar({ ...Mapa.actual(), sel: s.code, mantenerArcos: true }); } });
      pais_ = x;
      pintarRed();
    }
    let pais_ = null;
    function pintarRed() {
      const bloque = $('#est-socios');
      if (bloque) bloque.hidden = !S.red;
      if (S.red && pais_) Mapa.arcos(pais_.code, pais_.socios);
      else Mapa.arcos(null);
    }

    // Debajo: ranking completo
    el.innerHTML = `
      ${tarjeta('Ranking de países', `<div class="est-toolbar est-toolbar--tabla"><span class="est-nota">${M.nota ? esc(M.nota) + ' · ' : ''}Pasa el ratón por un país para verlo en el mapa; pulsa para ver su ficha.</span></div><div class="est-tabla-wrap est-tabla-wrap--alta"><table class="est-tabla est-tabla--compacta" id="est-rank"></table></div>`, { sub: `${periodoTxt()} · ordena por cualquier columna` })}`;
    let orden = { k: 'metrica', dir: -1 };
    // La columna de la medida del mapa va primero y en negrita; su gemela no se repite.
    const gemela = { coord: 'coord', part: 'part', importeCoord: 'importeCoord', hab: 'hab', ratio: 'ratioCoord' }[S.metrica];
    const colsR = [['nombre', 'País', true], ['metrica', M.corto], ['coord', 'Coordina'], ['part', 'Participa'], ['importeCoord', 'Dinero coordinado'], ['hab', 'Por millón hab.'], ['ratioCoord', 'Coord./partic.']].filter(([k]) => k !== gemela);
    const vk = (p, k) => (k === 'metrica' ? val(p) : k === 'hab' ? METRICAS.hab.v(p, ra, rb) : p[k]);
    const celda = (p, k) => ({
      metrica: () => `<b>${esc(M.fmt(val(p)))}</b>`, coord: () => fmtN(p.coord), part: () => fmtN(p.part),
      importeCoord: () => fmtEur(p.importeCoord), hab: () => fmtHab(METRICAS.hab.v(p, ra, rb)), ratioCoord: () => pct(p.ratioCoord),
    })[k]();
    const pintarRank = () => {
      const filas = [...d.paises].sort((a, b) => {
        const x = vk(a, orden.k), y = vk(b, orden.k);
        if (typeof x === 'string') return x.localeCompare(y, 'es') * orden.dir;
        return ((x ?? -1) - (y ?? -1)) * orden.dir;
      });
      const cur = S.sel || sel;
      $('#est-rank').innerHTML = `<thead><tr><th class="n">#</th>${colsR.map(([k, t, txt]) => `<th class="${txt ? '' : 'n'}"><button type="button" data-k="${k}" class="${orden.k === k ? 'is-on' : ''}">${esc(t)}${orden.k === k ? (orden.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${filas.map((p, i) => `<tr data-code="${p.code}" class="${p.code === cur ? 'is-sel' : ''}"><td class="n est-tenue">${i + 1}</td><td><button type="button" class="est-link" data-code="${p.code}"><i class="est-cuadro" style="background:${Mapa.colorDe(p.code)}"></i>${esc(p.nombre)}</button></td>${colsR.slice(1).map(([k]) => `<td class="n">${celda(p, k)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      $('#est-rank').querySelectorAll('th button').forEach(b => b.addEventListener('click', () => { orden = { k: b.dataset.k, dir: orden.k === b.dataset.k ? -orden.dir : (b.dataset.k === 'nombre' ? 1 : -1) }; pintarRank(); }));
      $('#est-rank').querySelectorAll('tr[data-code]').forEach(tr => {
        tr.addEventListener('mouseenter', () => Mapa.hover(tr.dataset.code));
        tr.addEventListener('mouseleave', () => Mapa.hover(null));
      });
      $('#est-rank').querySelectorAll('button[data-code]').forEach(b => b.addEventListener('click', () => {
        const code = b.dataset.code;
        if (S.mapa === 'europa' && !EUROPA.has(code)) { S.mapa = 'mundo'; pintarControles(); }
        S.sel = code; escribirHash(false);
        Mapa.pintar({ ...Mapa.actual(), sel: code }).then(() => Mapa.zoomA(code));
        detalle(code);
        $('.est-escenario')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }));
    };
    pintarRank();
    detalle(sel);
  }

  /* ═══ PANORAMA ═══════════════════════════════════════════════ */
  async function panorama(el, panel, vivo) {
    cargando(el, 6); cargando(panel, 6);
    const M = metrica();
    let d;
    try {
      const [, c] = await Promise.all([
        cargarMapa(qsSinPais(), vivo, { titulo: M.t, sel: S.f.pais, onClick: filtrarPais, onFondo: () => S.f.pais && filtrarPais(S.f.pais) }),
        get('/consulta?' + qsFiltros()),
      ]);
      d = c;
    } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(d.kpis.proyectos);
    if (!d.kpis.proyectos) {
      panel.innerHTML = `<div class="est-panel__head"><h2>Panorama</h2>${S.f.pais ? quitarPais() : ''}</div><p class="est-nota">No hay proyectos con estos filtros.</p>`;
      enlazarQuitar(panel);
      el.innerHTML = '<div class="est-vacio"><span class="material-symbols-outlined">search_off</span><p>No hay proyectos con estos filtros.</p></div>';
      return;
    }
    const k = d.kpis, foco = d.filtros.foco, nFoco = nombrePais(foco);
    const focoCoord = d.porLinea.reduce((a, l) => a + l.focoCoord, 0);
    const focoPart = d.porLinea.reduce((a, l) => a + l.focoPart, 0);

    // Lo esencial: frases calculadas, no adjetivos
    const top = d.porLinea[0];
    const crecen = d.porLinea.filter(l => l.crecimiento != null && l.spark.find(v => v > 0) >= 25).sort((a, b) => b.crecimiento - a.crecimiento);
    const topes = d.porLinea.filter(l => l.alTope != null && l.proyectos >= 20).sort((a, b) => b.alTope - a.alTope);
    const focoFuerte = S.f.pais ? [] : d.porLinea.filter(l => l.proyectos >= 20 && l.focoCoord > 0).sort((a, b) => b.focoCoord / b.proyectos - a.focoCoord / a.proyectos);
    const ideas = [
      `Se concedieron <b>${fmtN(k.proyectos)}</b> proyectos por <b>${fmtEur(k.importe)}</b>. La mitad recibió menos de <b>${fmtEur(k.mediana)}</b>.`,
      top && `La línea con más dinero es <a href="${linkLinea(top.id)}" data-linea="${top.id}">${esc(top.nombre)}</a>: ${fmtEur(top.importe)}, el ${pct(top.importe / k.importe)} del total.`,
      crecen[0] && crecen[0].crecimiento > 0.1 && `La que más crece: <a href="${linkLinea(crecen[0].id)}" data-linea="${crecen[0].id}">${esc(crecen[0].nombre)}</a>, de ${fmtN(crecen[0].spark.find(v => v > 0))} a ${fmtN(crecen[0].spark[crecen[0].spark.length - 1])} proyectos al año.`,
      topes[0] && `Donde más se concede al máximo: <a href="${linkLinea(topes[0].id)}" data-linea="${topes[0].id}">${esc(topes[0].nombre)}</a> (${pct(topes[0].alTope)} de los proyectos, al tope).`,
      !S.f.pais && `${esc(nFoco)} coordina <b>${fmtN(focoCoord)}</b> de estos proyectos (${pct(focoCoord / k.proyectos, 1)}) y participa en <b>${fmtN(focoPart)}</b>.`,
    ].filter(Boolean);

    panel.innerHTML = `
      <div class="est-panel__head">
        <h2>${S.f.pais ? `Panorama de ${esc(nombrePais(S.f.pais))}` : 'Panorama general'}</h2>
        <p>${S.f.pais ? `Proyectos que ${S.f.rol === 'part' ? 'tienen alguna entidad de' : 'coordina'} ${esc(nombrePais(S.f.pais))} · pulsa otro país para cambiar` : 'Pulsa un país en el mapa para ver su panorama'}</p>
        ${S.f.pais ? quitarPais() : ''}
      </div>
      <dl class="est-datos est-datos--grande">
        ${dato('Proyectos concedidos', fmtN(k.proyectos), `${fmtN(k.lineas)} líneas`)}
        ${dato('Dinero concedido', fmtEur(k.importe))}
        ${dato('Importe mediano', fmtEur(k.mediana), 'la mitad, por debajo')}
        ${dato('Rango habitual', rango(k.p25, k.p75), 'el 50 % central')}
        ${dato('Entidades coordinadoras', fmtN(k.coordinadoras), `de ${fmtN(k.paisesCoord)} países`)}
        ${dato('Buenas prácticas', fmtN(k.buenasPracticas), 'destacados por la Comisión')}
      </dl>
      <div class="est-esencial est-esencial--panel"><h3>Lo esencial</h3><ul>${ideas.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
    enlazarQuitar(panel);
    enlazarLineas(panel);

    el.innerHTML = `
      <div class="est-grid est-grid--2">
        ${tarjeta('Proyectos concedidos por año', '<div id="est-g-año-n"></div>')}
        ${tarjeta('Dinero concedido por año', '<div id="est-g-año-g"></div>')}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Dinero por tipo de acción', '<div id="est-g-grupos"></div>', { sub: 'Pulsa una barra para filtrar por ese tipo: el mapa cambia con él' })}
        ${tarjeta('Las que más crecen', listaMini(crecen.slice(0, 6), l => `${l.crecimiento > 0 ? '+' : ''}${pct(l.crecimiento)}`, l => `${fmtN(l.spark.find(v => v > 0))} → ${fmtN(l.spark[l.spark.length - 1])} proyectos/año`), { sub: 'Proyectos del primer al último año del periodo (líneas con 25 o más al principio)' })}
      </div>
      <div class="est-grid">
        ${tarjeta('Las 10 líneas con más dinero', '<div id="est-g-top"></div>', { sub: 'Pulsa una línea para ver su ficha y su mapa' })}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Donde se concede al máximo', topes.length ? listaMini(topes.slice(0, 6), l => pct(l.alTope), l => `mediana ${fmtEur(l.mediana)} · tope ${fmtEur(l.max2026)}`) : '<p class="est-nota">Ninguna línea de estos filtros tiene un máximo fijo.</p>', { sub: 'Porcentaje de proyectos con al menos el 97 % del máximo' })}
        ${tarjeta(`Donde más pesa ${esc(nFoco)}`, focoFuerte.length ? listaMini(focoFuerte.slice(0, 6), l => pct(l.focoCoord / l.proyectos), l => `coordina ${fmtN(l.focoCoord)} de ${fmtN(l.proyectos)} proyectos`) : `<p class="est-nota">${S.f.pais ? 'Quita el filtro de país para ver esta lista.' : 'Sin datos suficientes con estos filtros.'}</p>`, { sub: `Parte de los proyectos que coordina ${esc(nFoco)} (líneas con 20 o más proyectos)` })}
      </div>`;
    enlazarLineas(el);

    const años = d.porAño.map(a => String(a.año));
    barrasV('#est-g-año-n', años, d.porAño.map(a => a.proyectos), { nombre: 'Proyectos' });
    barrasV('#est-g-año-g', años, d.porAño.map(a => a.importe), { nombre: 'Dinero', fmt: v => fmtEur(v) });
    const grupos = [...d.porGrupo].sort((a, b) => b.importe - a.importe);
    barrasH('#est-g-grupos', grupos, { valor: g => g.importe, etiqueta: g => g.nombre, fmt: v => fmtEur(v), tooltip: 'Dinero', onClick: g => { S.f.grupo = g.id; cambiarFiltros(); } });
    const top10 = d.porLinea.slice(0, 10);
    barrasH('#est-g-top', top10, { valor: l => l.importe, etiqueta: l => l.nombre, fmt: v => fmtEur(v), tooltip: 'Dinero', onClick: l => irA('linea', l.id) });
  }

  function listaMini(filas, valor, detalle) {
    if (!filas.length) return '<p class="est-nota">Sin datos suficientes con estos filtros.</p>';
    return `<ol class="est-mini">${filas.map(l => `
      <li><a href="${linkLinea(l.id)}" data-linea="${l.id}">
        <span class="est-mini__nombre">${esc(l.nombre)}<small>${detalle(l)}</small></span>
        <span class="est-mini__valor">${valor(l)}</span></a></li>`).join('')}</ol>`;
  }

  const linkLinea = id => `#estadisticas/linea/${encodeURIComponent(id)}?${qsFiltros()}`;
  function enlazarLineas(el) {
    el.querySelectorAll('a[data-linea]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); irA('linea', a.dataset.linea); }));
  }

  /* ═══ LÍNEAS (catálogo) ══════════════════════════════════════ */
  async function lineas(el, panel, vivo) {
    cargando(el, 8); cargando(panel, 4);
    const M = metrica();
    const qsMapa = id => qsSinPais({ linea: id || '' });
    const cfgMapa = id => ({ titulo: id ? `${M.t} · ${lineaMeta(id)?.nombre || id}` : M.t, sel: S.f.pais, onClick: filtrarPais, onFondo: () => S.f.pais && filtrarPais(S.f.pais) });
    let d;
    try {
      const [, c] = await Promise.all([cargarMapa(qsMapa(S.ver), vivo, cfgMapa(S.ver)), get('/consulta?' + qsFiltros())]);
      d = c;
    } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(d.kpis.proyectos);

    // Media año a año de las líneas con proyectos ese año: la referencia de los sparklines.
    const mediaLineas = (d.porLinea[0]?.spark || []).map((_, k) => {
      const vs = d.porLinea.map(l => l.spark[k]).filter(v => v > 0);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    });

    // Pasar por una línea = verla en el mapa; pulsar la fila = dejarla fijada.
    let previaT = null, previaId = null;
    const verEnMapa = async id => {
      previaId = id;
      try {
        const m = await getMemo('/paises?' + qsMapa(id));
        if (!vivo() || previaId !== id) return;
        Tiempo.pintar(m);
        Mapa.pintar({ datos: m, ...cfgMapa(id) });
      } catch { /* se queda el mapa anterior */ }
    };
    const previa = id => { clearTimeout(previaT); previaT = setTimeout(() => verEnMapa(id || S.ver), id ? 140 : 260); };
    const fijar = id => { S.ver = S.ver === id ? '' : id; escribirHash(false); pintarPanel(); verEnMapa(S.ver); document.querySelectorAll('#est-tabla-lineas tr[data-id]').forEach(tr => tr.classList.toggle('is-sel', tr.dataset.id === S.ver)); };

    const pintarPanel = () => {
      const l = d.porLinea.find(x => x.id === S.ver);
      const cab = `<div class="est-panel__head"><h2>Líneas</h2><p>${fmtN(d.porLinea.length)} líneas con proyectos${S.f.pais ? ` de ${esc(nombrePais(S.f.pais))}` : ''} · ${periodoTxt()}</p>${S.f.pais ? quitarPais() : ''}</div>`;
      if (!l) {
        panel.innerHTML = `${cab}
          <ul class="est-pasos"><li><span class="material-symbols-outlined">ads_click</span>Pasa el ratón por una línea de la tabla para ver en el mapa dónde se concede. Pulsa la fila para dejarla fijada.</li>
          <li><span class="material-symbols-outlined">public</span>Pulsa un país en el mapa para quedarte con sus líneas.</li></ul>
          <div class="est-panel__bloque"><h4>Las 5 con más presupuesto</h4>${listaMini(d.porLinea.slice(0, 5), x => fmtN(x.proyectos), x => fmtEur(x.importe))}</div>`;
      } else {
        panel.innerHTML = `${cab}
          <div class="est-panel__linea">
            <span class="est-chip">En el mapa</span>
            <h3>${esc(l.nombre)}</h3>
            <p class="est-nota">${esc(nombreGrupo(l.grupo))} · ${esc(gestionTxt(l.gestion))}</p>
          </div>
          <div class="est-panel__spark">${sparkSvg(l.spark, 300, 46, null, mediaLineas)}<small>Proyectos por año, ${periodoTxt()}</small>${leyendaSpark('esta línea', 'media de las líneas')}</div>
          <dl class="est-datos">
            ${dato('Proyectos', fmtN(l.proyectos), `${fmtN(l.porAño)} al año`)}
            ${dato('Dinero', fmtEur(l.importe))}
            ${dato('Importe mediano', fmtEur(l.mediana))}
            ${dato('Rango habitual', rango(l.p25, l.p75))}
            ${l.alTope != null ? dato('Al tope', pct(l.alTope)) : ''}
            ${l.cierre2026 ? dato('Cierre 2026', fecha(l.cierre2026)) : ''}
          </dl>
          <div class="est-panel__acciones">
            <button type="button" class="est-btn est-btn--primary" id="est-l-ficha"><span class="material-symbols-outlined">open_in_full</span>Abrir su ficha</button>
            <button type="button" class="est-btn est-btn--ghost" id="est-l-quitar"><span class="material-symbols-outlined">close</span>Quitar del mapa</button>
          </div>`;
        panel.querySelector('#est-l-ficha').addEventListener('click', () => irA('linea', l.id));
        panel.querySelector('#est-l-quitar').addEventListener('click', () => fijar(l.id));
      }
      enlazarQuitar(panel);
      enlazarLineas(panel);
    };
    pintarPanel();

    const foco = d.filtros.foco;
    const focoOp = META.paises.filter(p => p.n > 0).map(p => `<option value="${p.code}" ${p.code === foco ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
    el.innerHTML = `
      <div class="est-toolbar">
        <div class="est-buscar"><span class="material-symbols-outlined">search</span>
          <input id="est-q" type="search" placeholder="Buscar línea (KA220, juventud, Capacity…)" value="${esc(S.buscar)}" aria-label="Buscar línea"></div>
        <label class="est-inline">Tu país en la tabla <select id="est-foco">${focoOp}</select></label>
        <button type="button" id="est-comp-sel" class="est-btn est-btn--primary" disabled><span class="material-symbols-outlined">compare_arrows</span>Comparar <span id="est-comp-n">0</span></button>
      </div>
      <div class="est-tabla-wrap"><table class="est-tabla" id="est-tabla-lineas"></table></div>
      <p class="est-nota mt-2">Marca hasta 4 líneas para compararlas. «Al año» divide entre los años con concesiones. En «Tendencia», la línea gris discontinua es la media de las líneas. «${esc(nombrePais(foco))} coord./partic.» = proyectos que coordina o en los que participa alguna entidad de ${esc(nombrePais(foco))}.</p>`;

    const marcadas = new Set(S.comp.tipo === 'linea' ? S.comp.ids : []);
    const actualizarComp = () => { $('#est-comp-n').textContent = marcadas.size; $('#est-comp-sel').disabled = marcadas.size < 2; };

    const cols = [
      { k: 'nombre', t: 'Línea', txt: true },
      { k: 'proyectos', t: 'Proyectos' },
      { k: 'porAño', t: 'Al año' },
      { k: 'importe', t: 'Dinero' },
      { k: 'mediana', t: 'Mediana' },
      { k: 'p25', t: 'Rango habitual', title: 'Del percentil 25 al 75: la mitad central de los proyectos' },
      { k: 'alTope', t: 'Al tope' },
      { k: 'focoCoord', t: `${foco} coord.` },
      { k: 'focoPart', t: `${foco} partic.` },
      { k: 'crecimiento', t: 'Tendencia', title: 'Proyectos por año dentro del periodo · discontinua: media de las líneas' },
      { k: 'cierre2026', t: 'Cierre 2026', txt: true },
    ];

    const pintar = () => {
      const q = S.buscar.trim().toLowerCase();
      const filas = d.porLinea.filter(l => !q || (l.nombre + ' ' + nombreGrupo(l.grupo) + ' ' + nombreSector(l.sector)).toLowerCase().includes(q));
      const { col, dir } = S.orden;
      filas.sort((a, b) => {
        const x = a[col], y = b[col];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y, 'es') : x - y) * dir;
      });
      $('#est-tabla-lineas').innerHTML = `
        <thead><tr><th class="est-th-check"><span class="sr-only">Comparar</span></th>${cols.map(c => `<th ${c.title ? `title="${esc(c.title)}"` : ''} class="${c.txt ? '' : 'n'}"><button type="button" data-col="${c.k}" class="${col === c.k ? 'is-on' : ''}">${esc(c.t)}${col === c.k ? (dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${filas.map(l => `
          <tr data-id="${l.id}" class="est-fila-mapa ${l.id === S.ver ? 'is-sel' : ''}" title="Pulsa para ver esta línea en el mapa">
            <td class="est-th-check"><input type="checkbox" data-comp="${l.id}" ${marcadas.has(l.id) ? 'checked' : ''} aria-label="Comparar ${esc(l.nombre)}"></td>
            <td class="est-td-nombre"><a href="${linkLinea(l.id)}" data-linea="${l.id}">${esc(l.nombre)}</a><span>${esc(nombreGrupo(l.grupo))} · ${esc(gestionTxt(l.gestion))}</span></td>
            <td class="n">${fmtN(l.proyectos)}</td>
            <td class="n">${fmtN(l.porAño)}</td>
            <td class="n">${fmtEur(l.importe)}</td>
            <td class="n">${fmtEur(l.mediana)}</td>
            <td class="n est-rango">${rango(l.p25, l.p75)}</td>
            <td class="n">${l.alTope == null ? '<span class="est-tenue">—</span>' : pct(l.alTope)}</td>
            <td class="n">${fmtN(l.focoCoord)}</td>
            <td class="n">${fmtN(l.focoPart)}</td>
            <td class="n" title="Proyectos por año: ${l.spark.join(' · ')} · media de las líneas: ${mediaLineas.map(v => Math.round(v)).join(' · ')}">${sparkSvg(l.spark, 92, 26, null, mediaLineas)}</td>
            <td class="est-nowrap">${l.cierre2026 ? fecha(l.cierre2026, true) : '<span class="est-tenue">—</span>'}</td>
          </tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="est-vacio-td">Ninguna línea coincide con «${esc(S.buscar)}».</td></tr>`}</tbody>`;
      enlazarLineas($('#est-tabla-lineas'));
      $('#est-tabla-lineas').querySelectorAll('th button').forEach(b => b.addEventListener('click', () => {
        const c = b.dataset.col;
        S.orden = { col: c, dir: S.orden.col === c ? -S.orden.dir : (cols.find(x => x.k === c).txt ? 1 : -1) };
        pintar();
      }));
      $('#est-tabla-lineas').querySelectorAll('[data-comp]').forEach(cb => cb.addEventListener('change', () => {
        if (cb.checked) { if (marcadas.size >= 4) { cb.checked = false; avisar('Puedes comparar hasta 4 líneas'); return; } marcadas.add(cb.dataset.comp); }
        else marcadas.delete(cb.dataset.comp);
        actualizarComp();
      }));
      $('#est-tabla-lineas').querySelectorAll('tr[data-id]').forEach(tr => {
        tr.addEventListener('mouseenter', () => previa(tr.dataset.id));
        tr.addEventListener('mouseleave', () => previa(null));
        tr.addEventListener('click', e => {
          if (e.target.closest('a, input')) return;
          fijar(tr.dataset.id);
          if (window.matchMedia('(max-width: 1023px)').matches) $('.est-escenario')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      });
    };
    pintar();
    actualizarComp();
    $('#est-q').addEventListener('input', e => { S.buscar = e.target.value; pintar(); });
    $('#est-foco').addEventListener('change', e => { S.f.foco = e.target.value; cambiarFiltros(); });
    $('#est-comp-sel').addEventListener('click', () => { S.comp = { tipo: 'linea', ids: [...marcadas] }; irA('comparar'); });
  }

  /* ═══ FICHA DE LÍNEA ═════════════════════════════════════════ */
  async function ficha(el, panel, vivo) {
    cargando(el, 6); cargando(panel, 6);
    const M = metrica();
    const lm = lineaMeta(S.id);
    let d;
    try {
      const [, x] = await Promise.all([
        cargarMapa(qsBase({ linea: S.id }), vivo, { titulo: `${M.t} · ${lm?.nombre || S.id}`, sel: S.f.pais, onClick: filtrarPais, onFondo: () => S.f.pais && filtrarPais(S.f.pais) }),
        get(`/linea/${encodeURIComponent(S.id)}?` + qsFiltros()),
      ]);
      d = x;
    } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(d.kpis.proyectos);
    const l = d.linea, k = d.kpis, foco = d.filtros.foco, nFoco = nombrePais(foco);
    const añosCon = d.porAño.filter(a => a.proyectos > 0).length || 1;
    const multiEnt = d.consorcio.some(c => c.entidades > 1 && c.n / (k.proyectos || 1) > 0.2);

    panel.innerHTML = `
      <button type="button" class="est-volver" id="est-volver"><span class="material-symbols-outlined">arrow_back</span>Todas las líneas</button>
      <div class="est-panel__head">
        <h2>${esc(l.nombre)}</h2>
        <div class="est-chips">${chip(nombreGrupo(l.grupo))}${chip(gestionTxt(l.gestion))}${chip(nombreSector(l.sector))}${l.financiacion ? chip('Financiación UE ' + l.financiacion) : ''}${chip(`Concedida de ${l.desde} a ${l.hasta}`, 'est-chip--tenue')}</div>
        ${S.f.pais ? `<p>Solo proyectos que ${S.f.rol === 'part' ? 'tienen alguna entidad de' : 'coordina'} ${esc(nombrePais(S.f.pais))}</p>${quitarPais()}` : '<p>Pulsa un país para ver solo sus proyectos</p>'}
      </div>
      ${l.nota ? `<p class="est-aviso"><span class="material-symbols-outlined">info</span>${esc(l.nota)}</p>` : ''}
      ${k.proyectos ? `<dl class="est-datos">
        ${dato('Proyectos concedidos', fmtN(k.proyectos), `${fmtN(Math.round(k.proyectos / añosCon))} al año`)}
        ${dato('Importe mediano', fmtEur(k.mediana), `media ${fmtEur(k.media)}`)}
        ${dato('Rango habitual', rango(k.p25, k.p75), 'el 50 % central')}
        ${dato('Máximo 2026', l.maxTexto ? esc(l.maxTexto) : fmtEur(l.max2026), k.alTope != null ? `${pct(k.alTope)} al tope` : '')}
        ${dato('Cierre 2026', l.cierre2026 ? (l.cierreAprox ? '≈ ' : '') + fecha(l.cierre2026) : '—', l.cierreAprox ? 'fecha habitual' : '17:00 Bruselas')}
        ${S.f.pais ? '' : dato(`${esc(nFoco)} coordina / participa`, `${fmtN(k.focoCoord)} / ${fmtN(k.focoPart)}`)}
        ${d.tasa ? dato('Tasa de éxito', tasaTxt(d.tasa), `${esc(d.tasa.ambito)} · ${d.tasa.convocatoria}`) : ''}
      </dl>` : ''}
      <div class="est-panel__acciones">
        <button type="button" class="est-btn est-btn--ghost" id="est-a-comp"><span class="material-symbols-outlined">compare_arrows</span>Comparar</button>
      </div>`;
    enlazarQuitar(panel);
    $('#est-volver').addEventListener('click', () => irA('lineas'));
    $('#est-a-comp').addEventListener('click', () => {
      const ids = S.comp.tipo === 'linea' ? S.comp.ids.filter(x => x !== l.id) : [];
      S.comp = { tipo: 'linea', ids: [l.id, ...ids].slice(0, 4) };
      irA('comparar');
    });

    if (!k.proyectos) {
      el.innerHTML = '<div class="est-vacio"><span class="material-symbols-outlined">search_off</span><p>Esta línea no tiene proyectos con estos filtros. Prueba con otro periodo o quita el país.</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="est-grid est-grid--2">
        ${tarjeta('Proyectos concedidos por año', '<div id="est-f-n"></div>')}
        ${tarjeta('Importe por proyecto, año a año', '<div id="est-f-imp"></div>', { sub: 'Mediana y franja del 50 % central' + (d.porAño.some(a => a.tope) ? ' · línea discontinua: máximo de la convocatoria' : '') })}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Cuánto se concede', '<div id="est-f-dist"></div>', { sub: d.distribucion.tipo === 'tramos' ? 'Proyectos por cantidad fija concedida' : 'Número de proyectos por tramo de importe' })}
        ${tarjeta('Duración de los proyectos', '<div id="est-f-dur"></div>', { sub: 'Meses' })}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Qué países coordinan', '<div id="est-f-pc"></div>', { sub: `Proyectos coordinados · ${esc(nFoco)} resaltado · pasa el ratón para verlo en el mapa` })}
        ${tarjeta('Qué países participan', '<div id="est-f-pp"></div>', { sub: 'Proyectos con al menos una entidad del país, en cualquier papel' })}
      </div>
      ${multiEnt ? `<div class="est-grid est-grid--2">${tarjeta('Tamaño del consorcio', '<div id="est-f-cons"></div>', { sub: 'Entidades por proyecto (20 = 20 o más)' })}${tarjeta('Quién coordina más', tablaCoord(d.coordinadoras))}</div>`
        : `<div class="est-grid">${tarjeta('Quién coordina más', tablaCoord(d.coordinadoras))}</div>`}
      ${d.ejemplos.length ? tarjeta('Buenas prácticas de esta línea', `<ul class="est-ejemplos">${d.ejemplos.map(e => `<li>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.titulo)}</a>` : esc(e.titulo)}<span>${e.año} · ${esc(e.nombrePais)} · ${fmtEur(e.importe)}</span></li>`).join('')}</ul>`, { sub: 'Proyectos destacados por la Comisión Europea (abre la Plataforma de Resultados)' }) : ''}`;

    // Solo los años en que la línea existió (sin ceros delante ni detrás).
    const ini = d.porAño.findIndex(a => a.proyectos > 0);
    const fin = d.porAño.length - 1 - [...d.porAño].reverse().findIndex(a => a.proyectos > 0);
    d.porAño = d.porAño.slice(ini, fin + 1);
    const años = d.porAño.map(a => String(a.año));
    barrasV('#est-f-n', años, d.porAño.map(a => a.proyectos), { nombre: 'Proyectos' });

    const conTope = d.porAño.some(a => a.tope);
    grafica('#est-f-imp', {
      chart: { type: 'rangeArea', height: 260 },
      series: [
        { type: 'rangeArea', name: 'Franja del 50 % central', data: d.porAño.map(a => ({ x: String(a.año), y: a.p25 == null ? null : [a.p25, a.p75] })) },
        { type: 'line', name: 'Mediana', data: d.porAño.map(a => ({ x: String(a.año), y: a.mediana })) },
        ...(conTope ? [{ type: 'line', name: 'Máximo de la convocatoria', data: d.porAño.map(a => ({ x: String(a.año), y: a.tope })) }] : []),
      ],
      colors: [LAVANDA, AZUL, TINTA],
      fill: { opacity: [0.28, 1, 1] },
      stroke: { curve: 'straight', width: [0, 2, 2], dashArray: [0, 0, 5] },
      markers: { size: [0, 4, 0], strokeWidth: 2, strokeColors: '#fff', hover: { sizeOffset: 2 } },
      yaxis: { labels: { formatter: v => fmtEur(v, true) }, tickAmount: 4, min: 0 },
      tooltip: { shared: true, y: { formatter: (v, o) => (Array.isArray(v) ? '' : fmtEur(v)) },
        custom: ({ dataPointIndex: i }) => { const a = d.porAño[i]; return `<div class="est-tt"><b>${a.año}</b><br>Mediana: ${fmtEur(a.mediana)}<br>50 % central: ${fmtEur(a.p25)} – ${fmtEur(a.p75)}<br>Media: ${fmtEur(a.media)}${a.tope ? `<br>Máximo: ${fmtEur(a.tope)}${a.alTope != null ? ` · al tope ${pct(a.alTope)}` : ''}` : ''}<br>${fmtN(a.proyectos)} proyectos</div>`; } },
      legend: { position: 'bottom' },
    });

    if (d.distribucion.tipo === 'tramos') {
      const t = d.distribucion.tramos.concat(d.distribucion.otros ? [{ importe: null, n: d.distribucion.otros }] : []);
      const tot = t.reduce((a, x) => a + x.n, 0) || 1;
      grafica('#est-f-dist', {
        chart: { type: 'bar', height: 240 },
        series: [{ name: 'Proyectos', data: t.map(x => x.n) }],
        xaxis: { categories: t.map(x => (x.importe ? fmtEur(x.importe) : 'Otras cantidades')) },
        yaxis: { labels: { formatter: v => fmtN(v) }, tickAmount: 4 },
        colors: [AZUL],
        plotOptions: { bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '46%', dataLabels: { position: 'top' } } },
        dataLabels: { enabled: true, offsetY: -20, style: { colors: [TINTA], fontWeight: 600 }, formatter: v => pct(v / tot) },
        tooltip: { y: { formatter: v => `${fmtN(v)} proyectos (${pct(v / tot)})` } },
      });
    } else {
      const b = d.distribucion.bins;
      barrasV('#est-f-dist', b.map(x => (x.hasta == null ? `más de ${fmtEur(x.desde, true)}` : `${fmtEur(x.desde, true)}`)), b.map(x => x.n), { nombre: 'Proyectos' });
    }
    barrasV('#est-f-dur', d.duracion.map(x => String(x.meses)), d.duracion.map(x => x.n), { nombre: 'Proyectos', color: AZUL });

    const resalta = filas => filas.map(p => (p.code === foco ? TINTA : LAVANDA));
    const hoverPais = p => Mapa.hover(p ? p.code : null);
    barrasH('#est-f-pc', d.paisesCoord.slice(0, 12), { valor: p => p.n, etiqueta: p => p.nombre, colores: resalta(d.paisesCoord.slice(0, 12)), tooltip: 'Proyectos', onHover: hoverPais, onClick: p => filtrarPais(p.code) });
    barrasH('#est-f-pp', d.paisesPart.slice(0, 12), { valor: p => p.n, etiqueta: p => p.nombre, colores: resalta(d.paisesPart.slice(0, 12)), tooltip: 'Proyectos', onHover: hoverPais, onClick: p => filtrarPais(p.code) });
    enlazarFichas(el);
    if (multiEnt) barrasV('#est-f-cons', d.consorcio.map(x => String(x.entidades)), d.consorcio.map(x => x.n), { nombre: 'Proyectos' });
  }

  function tablaCoord(filas) {
    if (!filas.length) return '<p class="est-nota">Sin datos.</p>';
    return `<div class="est-tabla-wrap"><table class="est-tabla est-tabla--compacta">
      <thead><tr><th>Entidad</th><th>País</th><th class="n">Proyectos</th><th class="n">Dinero</th></tr></thead>
      <tbody>${filas.map(o => `<tr><td>${nombreEnt(o)}</td><td>${esc(o.nombrePais)}</td><td class="n">${fmtN(o.proyectos)}</td><td class="n">${fmtEur(o.importe)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ═══ COMPARAR ═══════════════════════════════════════════════ */
  const SUGERENCIAS = [
    { tipo: 'linea', ids: ['ka220-you', 'ka210-you'], t: 'KA220 frente a KA210 en juventud' },
    { tipo: 'linea', ids: ['cbhe', 'cbvet', 'cbyouth', 'cbsport'], t: 'Las cuatro de Capacity Building' },
    { tipo: 'linea', ids: ['sport-coop', 'ka220-ngo-et', 'ka220-sch'], t: 'Asociaciones: deporte, ONG europeas y escolar' },
    { tipo: 'pais', ids: ['ES', 'IT', 'DE', 'FR'], t: 'España, Italia, Alemania y Francia' },
    { tipo: 'pais', ids: ['ES', 'PT', 'EL'], t: 'España, Portugal y Grecia' },
  ];

  async function comparar(el, panel, vivo) {
    const C = S.comp;
    const M = metrica();
    if (S.compVer >= C.ids.length) S.compVer = 0;
    const opciones = C.tipo === 'linea'
      ? META.grupos.map(g => {
        const ls = META.lineas.filter(l => l.grupo === g.id && l.modo !== 'acreditacion' && l.hasta >= S.f.desde && l.desde <= S.f.hasta && !C.ids.includes(l.id));
        return ls.length ? `<optgroup label="${esc(g.nombre)}">${ls.map(l => `<option value="${l.id}">${esc(l.nombre)}</option>`).join('')}</optgroup>` : '';
      }).join('')
      : META.paises.filter(p => p.n > 0 && !C.ids.includes(p.code)).map(p => `<option value="${p.code}">${esc(p.nombre)}</option>`).join('');

    const nombreId = id => (C.tipo === 'linea' ? (lineaMeta(id)?.nombre || id) : nombrePais(id));
    panel.innerHTML = `
      <div class="est-panel__head">
        <h2>Comparar</h2>
        <p>${C.tipo === 'pais' ? 'Pulsa países en el mapa para añadirlos o quitarlos (hasta 4)' : 'Elige hasta 4 líneas; el mapa enseña una y debajo tienes un mapa de cada una'}</p>
      </div>
      <div class="est-seg est-seg--ancho" role="group" aria-label="Qué comparar">
        <button type="button" data-ctipo="pais" class="${C.tipo === 'pais' ? 'is-on' : ''}">Países</button>
        <button type="button" data-ctipo="linea" class="${C.tipo === 'linea' ? 'is-on' : ''}">Líneas</button>
      </div>
      <ul class="est-comp-lista">
        ${C.ids.map((id, i) => `<li class="${C.tipo === 'linea' && i === S.compVer ? 'is-on' : ''}" style="--c:${SERIES[i]}">
          ${C.tipo === 'linea' ? `<button type="button" class="est-comp-lista__ver" data-ver="${i}" title="Ver en el mapa"><i></i><span>${esc(nombreId(id))}</span><span class="material-symbols-outlined">map</span></button>` : `<span class="est-comp-lista__ver"><i></i><span>${esc(nombreId(id))}</span></span>`}
          <button type="button" data-quitar="${esc(id)}" aria-label="Quitar ${esc(nombreId(id))}"><span class="material-symbols-outlined">close</span></button></li>`).join('')}
      </ul>
      ${C.ids.length < 4 ? `<select id="est-comp-add" class="est-select" aria-label="Añadir"><option value="">+ Añadir ${C.tipo === 'linea' ? 'línea' : 'país'}…</option>${opciones}</select>` : ''}
      ${C.ids.length < 2 ? `<div class="est-panel__bloque"><h4>O empieza por una de estas</h4><div class="est-sug">${SUGERENCIAS.filter(s => s.tipo === C.tipo).map(s => `<button type="button" class="est-btn est-btn--ghost" data-sug="${SUGERENCIAS.indexOf(s)}">${esc(s.t)}</button>`).join('')}</div></div>` : ''}
      ${C.tipo === 'linea' && C.ids.length ? `<p class="est-nota mt-3">Pulsa un país en el mapa para ver sus cifras en cada línea (ahora: <b>${esc(nombrePais(S.f.foco))}</b>).</p>` : ''}`;

    panel.querySelectorAll('[data-ctipo]').forEach(b => b.addEventListener('click', () => {
      if (C.tipo === b.dataset.ctipo) return;
      S.comp = { tipo: b.dataset.ctipo, ids: [] }; S.compVer = 0; escribirHash(false); render();
    }));
    panel.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => { C.ids = C.ids.filter(x => x !== b.dataset.quitar); escribirHash(false); render(); }));
    panel.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => { S.compVer = +b.dataset.ver; render(); }));
    panel.querySelector('#est-comp-add')?.addEventListener('change', e => { if (e.target.value) { C.ids.push(e.target.value); escribirHash(false); render(); } });
    panel.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => { const s = SUGERENCIAS[b.dataset.sug]; S.comp = { tipo: s.tipo, ids: [...s.ids] }; S.compVer = 0; escribirHash(false); render(); }));

    // El mapa
    const togglePais = code => {
      if (C.ids.includes(code)) C.ids = C.ids.filter(x => x !== code);
      else if (C.ids.length >= 4) { avisar('Puedes comparar hasta 4 países'); return; }
      else C.ids.push(code);
      escribirHash(false); render();
    };
    try {
      if (C.tipo === 'pais') {
        await cargarMapa(qsSinPais(), vivo, {
          titulo: M.t, resaltar: Object.fromEntries(C.ids.map((id, i) => [id, SERIES[i]])), onClick: togglePais,
          subtitulo: `${periodoTxt()} · color = país comparado`,
        });
      } else {
        const idMapa = C.ids[S.compVer];
        await cargarMapa(idMapa ? qsBase({ linea: idMapa }) : qsSinPais(), vivo, {
          titulo: idMapa ? `${M.t} · ${nombreId(idMapa)}` : M.t, sel: S.f.foco,
          onClick: code => { S.f.foco = code; cambiarFiltros(); },
        });
      }
    } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;

    if (C.ids.length < 2) {
      frase(null);
      el.innerHTML = `<div class="est-sugerencias"><p>${C.tipo === 'pais' ? 'Pulsa al menos dos países en el mapa, o elige una comparación en el panel.' : 'Añade al menos dos líneas en el panel de la derecha, o empieza por una sugerencia.'}</p></div>`;
      return;
    }
    cargando(el, 6);
    let d, mapas = null;
    try {
      [d, mapas] = await Promise.all([
        get(`/comparar?tipo=${C.tipo}&ids=${C.ids.join(',')}&` + qsFiltros()),
        C.tipo === 'linea' ? Promise.all(C.ids.map(id => getMemo('/paises?' + qsBase({ linea: id })))) : null,
      ]);
    } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(null);
    const filas = C.tipo === 'linea'
      ? [
        ['Proyectos concedidos', x => fmtN(x.kpis.proyectos)],
        ['Dinero concedido', x => fmtEur(x.kpis.importe)],
        ['Importe mediano', x => fmtEur(x.kpis.mediana)],
        ['Rango habitual', x => rango(x.kpis.p25, x.kpis.p75)],
        ['Máximo 2026', x => fmtEur(x.max2026)],
        ['Al tope', x => pct(x.kpis.alTope)],
        ['Tasa de éxito', x => x.tasa ? `${tasaTxt(x.tasa)} (${x.tasa.ambito})` : '—'],
        ['Entidades coordinadoras', x => fmtN(x.kpis.coordinadoras)],
        [`${nombrePais(S.f.foco)} coordina`, x => fmtN(x.kpis.focoCoord)],
        [`${nombrePais(S.f.foco)} participa`, x => fmtN(x.kpis.focoPart)],
      ]
      : [
        ['Proyectos coordinados', x => fmtN(x.kpis.proyectos)],
        ['Dinero coordinado', x => fmtEur(x.kpis.importe)],
        ['Importe mediano', x => fmtEur(x.kpis.mediana)],
        ['Entidades coordinadoras', x => fmtN(x.kpis.coordinadoras)],
        ['Líneas con proyectos', x => fmtN(x.kpis.lineas)],
        ['Buenas prácticas', x => fmtN(x.kpis.buenasPracticas)],
      ];
    el.innerHTML = `
      ${C.tipo === 'linea' ? tarjeta('Dónde se concede cada línea', `<div class="est-minimapas">${d.map((x, i) => `<figure class="est-minimapa"><figcaption><span class="est-dot" style="background:${SERIES[i]}"></span>${esc(x.nombre)}</figcaption><div class="est-minimapa__svg" id="est-mm-${i}"></div><div class="est-tt est-tt--flot est-mini-tt" hidden></div></figure>`).join('')}</div>`, { sub: 'Parte de los proyectos de cada línea que coordina cada país · misma escala de color en todos' }) : ''}
      <div class="est-tabla-wrap"><table class="est-tabla est-tabla--comp">
        <thead><tr><th></th>${d.map((x, i) => `<th class="n"><span class="est-dot" style="background:${SERIES[i]}"></span>${C.tipo === 'linea' ? `<a href="${linkLinea(x.id)}" data-linea="${x.id}">${esc(x.nombre)}</a>` : esc(x.nombre)}</th>`).join('')}</tr></thead>
        <tbody>${filas.map(([t, fn]) => `<tr><th scope="row">${esc(t)}</th>${d.map(x => `<td class="n">${fn(x)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      ${C.tipo === 'pais' ? '<p class="est-nota mt-2">En países se cuentan los proyectos que coordinan sus entidades, con los filtros de arriba.</p>' : ''}
      <div class="est-grid est-grid--2 mt-4">
        ${tarjeta('Proyectos concedidos por año', '<div id="est-c-n"></div>')}
        ${tarjeta(C.tipo === 'linea' ? 'Importe mediano por año' : 'Dinero coordinado por año', '<div id="est-c-m"></div>')}
      </div>
      ${C.tipo === 'linea' ? tarjeta('Cuánto se concede: la mitad central de los proyectos', '<div id="est-c-r"></div>', { sub: 'Barra = del percentil 25 al 75 · marca = mediana' })
        : `<div class="est-grid est-grid--${Math.min(d.length, 4)}">${d.map((x, i) => tarjeta(`<span class="est-dot" style="background:${SERIES[i]}"></span>${esc(x.nombre)}: sus líneas principales`, `<ol class="est-mini est-mini--plano">${x.topLineas.map(l => `<li><a href="${linkLinea(l.id)}" data-linea="${l.id}"><span class="est-mini__nombre">${esc(l.nombre)}<small>${fmtEur(l.importe)}</small></span><span class="est-mini__valor">${fmtN(l.proyectos)}</span></a></li>`).join('')}</ol>`)).join('')}</div>`}`;
    enlazarLineas(el);

    if (mapas) {
      // Cuota de cada país en cada línea, con una escala común para todas.
      const d3 = await esperar('d3');
      const cuota = (datos, p) => (datos.total ? p.coord / datos.total : 0);
      const vals = mapas.flatMap(m => m.paises.map(p => cuota(m, p)).filter(v => v > 0)).sort((a, b) => a - b);
      const cortes = [0.2, 0.4, 0.6, 0.8, 0.93].map(q => d3.quantile(vals, q));
      const color = v => (!(v > 0) ? SIN_DATO : RAMPA[1 + d3.bisectRight(cortes, v)] || RAMPA[6]);
      mapas.forEach((m, i) => { const box = $(`#est-mm-${i}`); if (box) miniMapa(box, m, p => cuota(m, p), color, d[i].nombre); });
    }

    const años = d[0].porAño.map(a => String(a.año));
    const lineasOpts = (serie, fmt) => ({
      chart: { type: 'line', height: 260 },
      series: d.map(x => ({ name: x.nombre, data: x.porAño.map(serie) })),
      xaxis: { categories: años },
      yaxis: { labels: { formatter: v => fmt(v) }, tickAmount: 4, min: 0 },
      colors: SERIES.slice(0, d.length),
      stroke: { width: 2, curve: 'straight' },
      markers: { size: 4, strokeWidth: 2, strokeColors: '#fff', hover: { sizeOffset: 2 } },
      tooltip: { shared: true, y: { formatter: v => fmt(v) } },
      legend: { position: 'bottom' },
    });
    grafica('#est-c-n', lineasOpts(a => a.proyectos, fmtN));
    grafica('#est-c-m', C.tipo === 'linea' ? lineasOpts(a => a.mediana, v => fmtEur(v, true)) : lineasOpts(a => a.importe, v => fmtEur(v)));
    if (C.tipo === 'linea') rangos($('#est-c-r'), d);
  }

  // Franja p25–p75 con la mediana marcada, en HTML (misma escala, desde 0).
  function rangos(el, d) {
    const max = Math.max(...d.map(x => x.kpis.p75 || 0), 1) * 1.05;
    const pos = v => `${(v / max * 100).toFixed(2)}%`;
    const marcas = [0, 0.25, 0.5, 0.75, 1].map(q => max / 1.05 * q);
    el.innerHTML = `<ol class="est-rangos">${d.map((x, i) => {
      const k = x.kpis;
      return `<li title="${esc(x.nombre)}: mediana ${esc(fmtEur(k.mediana))}, 50 % central ${esc(rango(k.p25, k.p75))}">
        <span class="est-rangos__label"><span class="est-dot" style="background:${SERIES[i]}"></span>${esc(x.nombre)}</span>
        <span class="est-rangos__track">
          <span class="est-rangos__bar" style="left:${pos(k.p25 || 0)};width:max(4px, calc(${pos((k.p75 || 0) - (k.p25 || 0))}));background:${SERIES[i]}"></span>
          <span class="est-rangos__med" style="left:${pos(k.mediana || 0)}"></span>
          <span class="est-rangos__txt" style="left:${pos(k.p75 || 0)}">${esc(fmtEur(k.mediana, true))}</span>
        </span></li>`;
    }).join('')}</ol>
    <div class="est-rangos__eje">${marcas.map(m => `<span style="left:${pos(m)}">${esc(fmtEur(m, true))}</span>`).join('')}</div>`;
  }

  /* ═══ TASAS DE ÉXITO ═════════════════════════════════════════ */
  async function tasas(el, panel, vivo) {
    cargando(el, 5); cargando(panel, 6);
    const M = metrica();
    let d;
    try { d = await getMemo('/tasas'); } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(null);
    const filas = d.tasas.map((t, i) => ({ ...t, i })).sort((a, b) => b.tasa - a.tasa);
    if (S.tasa >= d.tasas.length) S.tasa = 0;
    const t = d.tasas[S.tasa];
    // Sin líneas concretas (KA2 España en total) = todas las asociaciones de Agencia Nacional.
    const qsMapa = t.lineas.length ? qsBase({ linea: t.lineas.join(',') }) : qsBase({ grupo: 'asociaciones', gestion: 'AN' });

    panel.innerHTML = `
      <div class="est-panel__head"><h2>Tasas de éxito</h2><p>De cada 100 solicitudes, cuántas se aprueban. Elige una línea para ver en el mapa dónde acaban sus proyectos concedidos.</p></div>
      <div class="est-tasa">
        <div class="est-tasa__cab"><span class="est-tasa__valor">${esc(tasaTxt(t))}</span><span><b>${esc(t.linea)}</b><small>${esc(t.ambito)} · convocatoria ${t.convocatoria}</small></span></div>
        ${waffle(t.tasa)}
        <p class="est-nota">${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.fuente)}</a>` : esc(t.fuente)}</p>
      </div>
      <ol class="est-tasas-lista">${filas.map(x => `<li><button type="button" data-tasa="${x.i}" class="${x.i === S.tasa ? 'is-on' : ''}"><span>${esc(x.linea)}<small>${esc(x.ambito)} · ${x.convocatoria}</small></span><b>${esc(tasaTxt(x))}</b></button></li>`).join('')}</ol>
      <p class="est-nota mt-2">El mapa enseña los proyectos <b>concedidos</b>, no la tasa por país: ni el SEPIE ni la EACEA la publican así.</p>`;
    panel.querySelectorAll('[data-tasa]').forEach(b => b.addEventListener('click', () => { S.tasa = +b.dataset.tasa; escribirHash(false); render(); }));

    try {
      await cargarMapa(qsMapa, vivo, {
        titulo: `${M.t} · ${t.linea}`, sel: t.ambito === 'España' ? 'ES' : '',
        subtitulo: `${periodoTxt()} · proyectos concedidos${t.ambito === 'España' ? ' · la tasa es de España' : ''}`,
        onClick: () => {},
      });
    } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;

    el.innerHTML = `
      <div class="est-aviso est-aviso--grande"><span class="material-symbols-outlined">info</span>
        <div><b>De cada 100 solicitudes, cuántas se aprueban.</b> La Comisión solo publica los proyectos concedidos, así que estas cifras salen de las resoluciones del SEPIE y de los resultados de selección de la EACEA. Se actualizan a mano (última revisión: ${fecha(d.actualizado)}). Una cifra con ≈ es aproximada.</div></div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Tasa de éxito por línea', '<div id="est-t-g"></div>', { sub: 'Pulsa una barra para verla en el mapa' })}
        ${tarjeta('Detalle y fuentes', `<div class="est-tabla-wrap"><table class="est-tabla est-tabla--compacta"><thead><tr><th>Línea</th><th>Ámbito</th><th class="n">Convoc.</th><th class="n">Tasa</th></tr></thead><tbody>
          ${filas.map(x => `<tr class="${x.i === S.tasa ? 'is-sel' : ''}"><td>${x.lineas.length === 1 ? `<a href="${linkLinea(x.lineas[0])}" data-linea="${x.lineas[0]}">${esc(x.linea)}</a>` : esc(x.linea)}<span class="est-sub">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.fuente)}</a>` : esc(x.fuente)}</span></td><td>${esc(x.ambito)}</td><td class="n">${x.convocatoria}</td><td class="n"><b>${tasaTxt(x)}</b></td></tr>`).join('')}
        </tbody></table></div>`)}
      </div>
      ${d.sinDato?.length ? tarjeta('Sin dato publicado', `<ul class="est-ejemplos">${d.sinDato.map(s => `<li><b>${esc(s.linea)}</b><span>${esc(s.motivo)}</span></li>`).join('')}</ul>`) : ''}`;
    enlazarLineas(el);
    barrasH('#est-t-g', filas, { valor: x => x.tasa, etiqueta: x => x.linea, fmt: v => dec1(v).replace(',0', '') + ' %', tooltip: 'Tasa de éxito', colores: filas.map(x => (x.i === S.tasa ? TINTA : AZUL)), onClick: x => { S.tasa = x.i; escribirHash(false); render(); } });
  }


  /* ═══ RANKING DE ENTIDADES ═══════════════════════════════════
     Antes era «Análisis» (solo admin, agregado fijo 2014-2025). Ahora
     responde a todos los filtros: /entidades/mapa da el mapa (entidades
     por país y activas año a año) y /entidades, las páginas del ranking.
     Abierto a cualquier cuenta y sin descargas (decisión del 23-oct-2026). */
  const TIPOS_ENT = {
    uni: 'Universidades', escuela: 'Centros escolares', fp: 'Formación profesional', adultos: 'Educación de adultos',
    ong: 'ONG y asociaciones', deporte: 'Deporte', cultura: 'Cultura', investigacion: 'Investigación',
    publico: 'Organismos públicos', empresa: 'Empresas', otro: 'Otros', sin: 'Sin clasificar',
  };
  const ORDEN_ENT = [['proyectos', 'Proyectos'], ['coordina', 'Coordina'], ['dinero', 'Dinero']];
  const qsEnt = (extra = {}) => qsSinPais({ tipo: S.ent.tipo, sinUni: S.ent.sinUni ? '1' : '', min: S.ent.min > 1 ? S.ent.min : '', ...extra });

  async function entidades(el, panel, vivo) {
    cargando(el, 8); cargando(panel, 6);
    const EM = ENT_METRICAS[S.emetrica] || ENT_METRICAS.n;
    let m;
    try { m = await getMemo('/entidades/mapa?' + qsEnt()); } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    const a0 = m.años[0], ra = S.f.desde - a0, rb = S.f.hasta - a0;
    const porHab = (p, v) => (p.pob ? v / (p.pob / 1e6) : null);
    const base = p => (S.emetrica === 'dinero' ? p.dinero : S.emetrica === 'hab' ? porHab(p, p.n) : p.n);
    // Un año suelto (reproducción o arrastre) = entidades activas ese año.
    const valor = (p, a, b) => (a === b && !(a === ra && b === rb) && S.emetrica !== 'dinero'
      ? (S.emetrica === 'hab' ? porHab(p, p.nY[a]) : p.nY[a]) : base(p));
    Tiempo.pintar(m);
    await Mapa.pintar({
      datos: m, valor, fmt: EM.fmt, fmtCorto: EM.fmtCorto, sel: S.f.pais,
      titulo: EM.t + (S.ent.min > 1 ? ` · con ${S.ent.min} proyectos o más` : ''),
      serie: p => p.nY, serieTxt: 'entidades activas cada año',
      onClick: filtrarPais, onFondo: () => S.f.pais && filtrarPais(S.f.pais),
    });
    if (!vivo()) return;
    frase(S.f.pais ? (m.paises.find(x => x.code === S.f.pais)?.n || 0) : m.total);

    // Panel: el país pulsado o el conjunto
    const ranking = m.paises.filter(p => base(p) > 0).sort((a, b) => base(b) - base(a));
    const p = S.f.pais ? m.paises.find(x => x.code === S.f.pais) : null;
    const media = mediaPaises(m, 'serie:entidades', (x, a) => x.nY[a] || 0);
    if (S.f.pais) {
      panel.innerHTML = `
        <div class="est-panel__head">
          <h2>${esc(nombrePais(S.f.pais))}</h2>
          <p>${p && base(p) > 0 ? `Puesto <b>${ranking.indexOf(p) + 1}</b> de ${ranking.length} · ${esc(EM.corto.toLowerCase())}` : 'Sin entidades con estos filtros'}</p>
          ${quitarPais()}
        </div>
        ${p ? `<div class="est-panel__spark">${sparkSvg(p.nY, 300, 46, { desde: ra, hasta: rb }, media)}<small>Entidades activas cada año, ${m.años[0]}–${m.años[1]}</small>${leyendaSpark(p.nombre, 'media de los países')}</div>
        <dl class="est-datos">
          ${dato('Entidades', fmtN(p.n), S.ent.min > 1 ? `con ${S.ent.min} proyectos o más` : 'con algún proyecto')}
          ${dato('Universidades', fmtN(p.uni), p.n ? pct(p.uni / p.n) + ' del total' : '')}
          ${dato('Dinero de sus proyectos', fmtEur(p.dinero), 'subvención total, no lo que recibe cada una')}
          ${dato('Por millón de habitantes', fmtHab(porHab(p, p.n)))}
        </dl>` : ''}
        <div class="est-panel__bloque"><h4>Las 10 que más ${S.ent.orden === 'coordina' ? 'coordinan' : S.ent.orden === 'dinero' ? 'dinero mueven' : 'proyectos tienen'}</h4><div id="est-ent-top">${'<div class="est-esqueleto est-esqueleto--fino"><span></span><span></span><span></span></div>'}</div></div>`;
      enlazarQuitar(panel);
      getMemo('/entidades?' + qsEnt({ epais: S.f.pais, orden: S.ent.orden, limit: 10 })).then(r => {
        if (!vivo()) return;
        const box = $('#est-ent-top');
        box.innerHTML = r.filas.length ? `<ol class="est-mini est-mini--plano est-mini--org">${r.filas.map(f => `<li><span class="est-mini__fila"><span class="est-mini__nombre">${nombreEnt(f)}<small>${esc(TIPOS_ENT[f.tipo] || '')} · ${fmtEur(f.dinero)}</small></span><span class="est-mini__valor" title="${esc(ORDEN_ENT.find(o => o[0] === S.ent.orden)[1])}">${S.ent.orden === 'dinero' ? fmtEur(f.dinero, true) : fmtN(S.ent.orden === 'coordina' ? f.coordina : f.proyectos)}</span></span></li>`).join('')}</ol>` : '<p class="est-nota">Ninguna con estos filtros.</p>';
        enlazarFichas(box);
      }).catch(() => {});
    } else {
      panel.innerHTML = `
        <div class="est-panel__head"><h2>Ranking de entidades</h2><p>Quién consigue los proyectos. Pulsa un país para ver sus entidades; pulsa una entidad para abrir su ficha.</p></div>
        <div class="est-panel__spark">${sparkSvg(m.totalY, 300, 46, { desde: ra, hasta: rb })}<small>Entidades activas cada año, ${m.años[0]}–${m.años[1]}</small></div>
        <dl class="est-datos">
          ${dato('Entidades', fmtN(m.total), S.ent.min > 1 ? `con ${S.ent.min} proyectos o más` : 'con algún proyecto')}
          ${dato('Países', fmtN(ranking.length))}
          ${m.sinPais ? dato('Sin país en los datos', fmtN(m.sinPais)) : ''}
        </dl>
        <div class="est-panel__bloque"><h4>Por tipo de entidad</h4><p class="est-nota">Pulsa un tipo para quedarte solo con él</p><div id="est-ent-tipos"></div></div>`;
      barrasH('#est-ent-tipos', [...m.tipos].sort((a, b) => b.n - a.n), {
        valor: t => t.n, etiqueta: t => TIPOS_ENT[t.id] || t.id, fmt: fmtN, tooltip: 'entidades',
        colores: [...m.tipos].sort((a, b) => b.n - a.n).map(t => (t.id === S.ent.tipo ? TINTA : AZUL)),
        onClick: t => { S.ent.tipo = S.ent.tipo === t.id ? '' : t.id; cambiarFiltros(); },
      });
    }

    // Debajo: el ranking completo, por páginas
    el.innerHTML = `
      <div class="est-toolbar">
        <div class="est-buscar"><span class="material-symbols-outlined">search</span>
          <input id="est-eq" type="search" placeholder="Buscar entidad por nombre" value="${esc(S.ent.buscar)}" aria-label="Buscar entidad"></div>
        <label class="est-inline">Tipo <select id="est-etipo"><option value="">Todos</option>${Object.entries(TIPOS_ENT).filter(([k]) => k === S.ent.tipo || m.tipos.some(t => t.id === k)).map(([k, v]) => `<option value="${k}" ${k === S.ent.tipo ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <label class="est-inline">Mínimo <select id="est-emin">${[1, 3, 5, 10, 20].map(v => `<option value="${v}" ${v === S.ent.min ? 'selected' : ''}>${v === 1 ? '1 proyecto' : v + ' proyectos'}</option>`).join('')}</select></label>
        <label class="est-check"><input type="checkbox" id="est-euni" ${S.ent.sinUni ? 'checked' : ''}>Sin universidades</label>
      </div>
      <div class="est-tabla-wrap"><table class="est-tabla" id="est-tabla-ent"></table></div>
      <div class="est-mas"><button type="button" id="est-emas" class="est-btn est-btn--ghost" hidden><span class="material-symbols-outlined">expand_more</span>Ver 50 más</button><span id="est-ecuenta" class="est-nota"></span></div>
      <p class="est-nota mt-2">«Proyectos» cuenta los proyectos en los que está, en cualquier papel; «Coordina», los que encabeza. «Dinero» es la subvención total de esos proyectos, no lo que recibe cada entidad. Las entidades están unificadas: los PIC y OID de una misma organización cuentan juntos.</p>`;

    let offset = 0, filas = [];
    const cols = [['pos', '#'], ['nombre', 'Entidad'], ['pais', 'País'], ['proyectos', 'Proyectos'], ['coordina', 'Coordina'], ['dinero', 'Dinero de sus proyectos'], ['dineroCoord', 'Dinero que coordina']];
    const pintarTabla = () => {
      $('#est-tabla-ent').innerHTML = `
        <thead><tr>${cols.map(([k, t]) => {
          const ord = ORDEN_ENT.some(o => o[0] === k);
          const cls = ['pos', 'proyectos', 'coordina', 'dinero', 'dineroCoord'].includes(k) ? 'n' : '';
          return `<th class="${cls}">${ord ? `<button type="button" data-eorden="${k}" class="${S.ent.orden === k ? 'is-on' : ''}">${esc(t)}${S.ent.orden === k ? ' ↓' : ''}</button>` : esc(t)}</th>`;
        }).join('')}</tr></thead>
        <tbody>${filas.map(f => `<tr data-code="${esc(f.code)}" class="${f.ficha ? 'est-fila-mapa' : ''}" data-fila-ficha="${esc(f.ficha || '')}">
          <td class="n est-tenue">${f.pos}</td>
          <td class="est-td-nombre">${nombreEnt(f)}<span>${esc(TIPOS_ENT[f.tipo] || '')}</span></td>
          <td>${esc(f.nombrePais)}</td>
          <td class="n">${fmtN(f.proyectos)}</td><td class="n">${fmtN(f.coordina)}</td>
          <td class="n">${fmtEur(f.dinero)}</td><td class="n">${f.dineroCoord ? fmtEur(f.dineroCoord) : '<span class="est-tenue">—</span>'}</td>
        </tr>`).join('') || `<tr><td colspan="${cols.length}" class="est-vacio-td">${S.ent.buscar ? `Ninguna entidad coincide con «${esc(S.ent.buscar)}».` : 'Ninguna entidad con estos filtros.'}</td></tr>`}</tbody>`;
      enlazarFichas($('#est-tabla-ent'));
      $('#est-tabla-ent').querySelectorAll('[data-eorden]').forEach(b => b.addEventListener('click', () => { S.ent.orden = b.dataset.eorden; cambiarFiltros(); }));
      $('#est-tabla-ent').querySelectorAll('tr[data-code]').forEach(tr => {
        tr.addEventListener('mouseenter', () => Mapa.hover(tr.dataset.code));
        tr.addEventListener('mouseleave', () => Mapa.hover(null));
        tr.addEventListener('click', e => { if (!e.target.closest('button') && tr.dataset.filaFicha) abrirFicha(tr.dataset.filaFicha); });
      });
    };
    const cargar = async (mas = false) => {
      if (!mas) { offset = 0; filas = []; }
      const pedido = S.ent.buscar;
      let r;
      try { r = await getMemo('/entidades?' + qsEnt({ epais: S.f.pais, orden: S.ent.orden, buscar: S.ent.buscar, offset, limit: 50 })); }
      catch (e) { if (vivo()) error(el, e); return; }
      if (!vivo() || pedido !== S.ent.buscar) return;
      filas = filas.concat(r.filas);
      offset = filas.length;
      pintarTabla();
      $('#est-emas').hidden = filas.length >= r.total;
      $('#est-ecuenta').textContent = `${fmtN(filas.length)} de ${fmtN(r.total)}${S.f.pais ? ' de ' + nombrePais(S.f.pais) : ''}`;
    };
    cargar();
    $('#est-emas').addEventListener('click', () => cargar(true));
    let tBuscar = null;
    $('#est-eq').addEventListener('input', e => { S.ent.buscar = e.target.value; clearTimeout(tBuscar); tBuscar = setTimeout(() => cargar(), 250); });
    $('#est-etipo').addEventListener('change', e => { S.ent.tipo = e.target.value; cambiarFiltros(); });
    $('#est-emin').addEventListener('change', e => { S.ent.min = +e.target.value; cambiarFiltros(); });
    $('#est-euni').addEventListener('change', e => { S.ent.sinUni = e.target.checked; cambiarFiltros(); });
  }

  /* ── Entrada desde app.js ─────────────────────────────────── */
  async function init(sub) {
    leerHash(sub);
    const root = $('#est-root');
    if (!root) return;
    if (!META) {
      cargando(root, 6);
      try { META = await get('/meta'); } catch (e) { error(root, e); return; }
    }
    if (!built || !$('#est-vista')) construir();
    render();
  }

  return { init };
})();
