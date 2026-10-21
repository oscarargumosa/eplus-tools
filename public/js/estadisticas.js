/* ═══════════════════════════════════════════════════════════════
   Estadísticas Erasmus+ — #estadisticas
   ═══════════════════════════════════════════════════════════════
   Vistas: panorama · lineas · linea/<id> · comparar · paises · tasas
   El estado (vista + filtros) vive en el hash:
     #estadisticas/lineas?desde=2021&hasta=2025&grupo=asociaciones
   Los cambios de filtro usan replaceState (no recargan la sección);
   los cambios de vista, pushState (el botón Atrás vuelve).
   Datos: /v1/estadisticas/* (node/src/modules/estadisticas).
   ═══════════════════════════════════════════════════════════════ */

const Estadisticas = (() => {
  /* ── Paleta (validada con dataviz/validate_palette.js, 4 series) ── */
  const AZUL = '#4312d8', TINTA = '#1b0759', TEXTO2 = '#55577a', LINEA = '#efe8fe', LAVANDA = '#b392f6';
  const SERIES = ['#4312d8', '#c2408f', '#6f8500', '#9b7cf4'];
  const RAMPA = ['#efe8fe', '#cdb9fa', '#a487f5', '#7349f0', '#4312d8', '#2a0b8f', '#1b0759'];

  const VISTAS = [
    { id: 'panorama', nombre: 'Panorama',        icono: 'dashboard' },
    { id: 'lineas',   nombre: 'Líneas',          icono: 'view_list' },
    { id: 'comparar', nombre: 'Comparar',        icono: 'compare_arrows' },
    { id: 'paises',   nombre: 'Países',          icono: 'public' },
    { id: 'tasas',    nombre: 'Tasas de éxito',  icono: 'target' },
  ];

  let META = null;
  let built = false;
  let charts = [];
  let seq = 0;                       // descarta respuestas de peticiones viejas
  let tablaLineas = null;            // última consulta (para ordenar/buscar sin pedir otra vez)
  let geo = null;

  const S = {
    vista: 'panorama', id: null,
    f: { desde: 2021, hasta: 2025, grupo: '', sector: '', gestion: '', pais: '', rol: 'coord', foco: 'ES' },
    comp: { tipo: 'linea', ids: [] },
    orden: { col: 'importe', dir: -1 }, buscar: '', metrica: 'coord',
  };

  /* ── Formato ──────────────────────────────────────────────── */
  const nf = new Intl.NumberFormat('es-ES');
  const fmtN = v => (v == null ? '—' : nf.format(Math.round(v)));
  const dec1 = v => v.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  function fmtEur(v, corto = false) {
    if (v == null) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return dec1(v / 1e9) + '\u00a0mil\u00a0M€';
    if (a >= 1e6) return dec1(v / 1e6) + '\u00a0M€';
    if (corto && a >= 1e4) return nf.format(Math.round(v / 1000)) + 'k\u00a0€';
    return nf.format(Math.round(v)) + '\u00a0€';
  }
  // «25k–84k €», «1,4–1,5 M€»: una sola unidad al final.
  function rango(a, b) {
    if (a == null || b == null) return '—';
    if (a === b) return fmtEur(a, true);
    if (b >= 1e6) return `${dec1(a / 1e6)}–${dec1(b / 1e6)}\u00a0M€`;
    if (b >= 1e4) return `${nf.format(Math.round(a / 1000))}k–${nf.format(Math.round(b / 1000))}k\u00a0€`;
    return `${nf.format(a)}–${nf.format(b)}\u00a0€`;
  }
  const pct = (v, d = 0) => (v == null ? '—' : (v * 100).toLocaleString('es-ES', { maximumFractionDigits: d }) + ' %');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = (iso, sinAño) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', sinAño ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const $ = sel => document.querySelector(sel);

  const nombreGrupo = id => META?.grupos.find(g => g.id === id)?.nombre || id;
  const nombreSector = id => META?.sectores[id] || id;
  const nombrePais = code => META?.paises.find(p => p.code === code)?.nombre || code;
  const lineaMeta = id => META?.lineas.find(l => l.id === id);
  const gestionTxt = g => (g === 'AN' ? 'Agencia Nacional' : g === 'EACEA' ? 'Bruselas (EACEA)' : '—');

  /* ── Hash ⇄ estado ────────────────────────────────────────── */
  function leerHash(sub) {
    const [ruta, qs] = String(sub || '').split('?');
    const partes = ruta.split('/').filter(Boolean);
    const vista = partes[0] === 'linea' ? 'linea' : (VISTAS.some(v => v.id === partes[0]) ? partes[0] : 'panorama');
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
    if (q.get('metrica')) S.metrica = q.get('metrica');
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

  function hashActual() {
    const extra = {};
    if (S.vista === 'comparar') { if (S.comp.ids.length) extra.comparar = S.comp.ids.join(','); extra.tipo = S.comp.tipo; }
    if (S.vista === 'paises' && S.metrica !== 'coord') extra.metrica = S.metrica;
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

  function esperar(nombre) {
    return new Promise(res => {
      const t = () => (window[nombre] ? res(window[nombre]) : setTimeout(t, 120));
      t();
    });
  }

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
  function barrasH(sel, filas, { valor, etiqueta, fmt = fmtN, color = AZUL, colores, onClick, tooltip }) {
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
    if (onClick) el.querySelectorAll('.est-hbar__fila').forEach(b => b.addEventListener('click', () => onClick(filas[+b.dataset.i])));
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

  function sparkSvg(vals, w = 92, h = 26) {
    const max = Math.max(...vals, 1);
    const pasos = vals.length - 1 || 1;
    const pts = vals.map((v, i) => `${(i / pasos * (w - 4) + 2).toFixed(1)},${(h - 3 - v / max * (h - 6)).toFixed(1)}`).join(' ');
    const ult = pts.split(' ').pop().split(',');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${AZUL}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/><circle cx="${ult[0]}" cy="${ult[1]}" r="2.5" fill="${AZUL}"/></svg>`;
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

  const chip = (txt, cls = '') => `<span class="est-chip ${cls}">${esc(txt)}</span>`;

  function cargando(el) { el.innerHTML = '<div class="est-cargando"><span class="est-spin"></span>Calculando…</div>'; }
  function error(el, e) { el.innerHTML = `<div class="est-vacio"><span class="material-symbols-outlined">error</span><p>No se han podido cargar los datos.</p><p class="text-xs">${esc(e?.message || '')}</p></div>`; }

  function descargarCsv(nombre, filas) {
    const csv = filas.map(r => r.map(v => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ── Esqueleto (una vez) ──────────────────────────────────── */
  function construir() {
    const root = $('#est-root');
    const años = []; for (let y = META.años[0]; y <= META.años[1]; y++) años.push(y);
    const opAños = sel => años.map(y => `<option value="${y}" ${y === sel ? 'selected' : ''}>${y}</option>`).join('');
    const paisesOp = META.paises.filter(p => p.n > 0 || p.code === 'ES').map(p => `<option value="${p.code}">${esc(p.nombre)}</option>`).join('');

    root.innerHTML = `
      <header class="est-header">
        <div>
          <h1 class="font-headline text-2xl font-bold text-primary flex items-center gap-2">
            <span class="material-symbols-outlined">monitoring</span> Estadísticas Erasmus+
          </h1>
          <p class="text-sm text-on-surface-variant mt-1">Lo que se ha concedido de verdad, línea a línea: cuántos proyectos, cuánto dinero y quién lo consigue.</p>
          <p class="text-[11px] text-on-surface-variant/80 mt-1">${fmtN(META.lineas.reduce((a, l) => a + l.n, 0))} proyectos concedidos de ${META.años[0]} a ${META.años[1]} · ${esc(META.fuente)} · datos del ${fecha(META.generado.slice(0, 10))}</p>
        </div>
      </header>

      <nav class="est-tabs" role="tablist" aria-label="Vistas de estadísticas">
        ${VISTAS.map(v => `<button type="button" role="tab" class="est-tab" data-vista="${v.id}"><span class="material-symbols-outlined">${v.icono}</span>${v.nombre}</button>`).join('')}
      </nav>

      <section class="est-filtros" aria-label="Filtros">
        <div class="est-filtro est-filtro--periodo">
          <label>Periodo</label>
          <div class="est-seg" role="group" aria-label="Periodo">
            <button type="button" data-periodo="2021-${META.años[1]}">Programa actual</button>
            <button type="button" data-periodo="${META.años[0]}-2020">2014-2020</button>
            <button type="button" data-periodo="${META.años[0]}-${META.años[1]}">Todo</button>
          </div>
          <div class="est-años">
            <select id="est-desde" aria-label="Desde">${opAños(S.f.desde)}</select>
            <span>a</span>
            <select id="est-hasta" aria-label="Hasta">${opAños(S.f.hasta)}</select>
          </div>
        </div>
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
        <div class="est-filtro">
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
      <p id="est-resumen" class="est-resumen" aria-live="polite"></p>

      <div id="est-vista"></div>
      <p class="est-pie">Solo se publican los proyectos <b>concedidos</b>: no hay datos de solicitudes presentadas, salvo las tasas de éxito que sacamos de las agencias. «Al tope» = proyectos que reciben al menos el 97 % del máximo de su convocatoria. Las cantidades son la subvención total del proyecto, no lo que recibe cada socio.</p>
    `;

    root.querySelectorAll('.est-tab').forEach(b => b.addEventListener('click', () => irA(b.dataset.vista)));
    root.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => {
      const [d, h] = b.dataset.periodo.split('-').map(Number);
      S.f.desde = d; S.f.hasta = h; cambiarFiltros();
    }));
    const on = (id, fn) => $(id).addEventListener('change', fn);
    on('#est-desde', e => { S.f.desde = +e.target.value; if (S.f.hasta < S.f.desde) S.f.hasta = S.f.desde; cambiarFiltros(); });
    on('#est-hasta', e => { S.f.hasta = +e.target.value; if (S.f.desde > S.f.hasta) S.f.desde = S.f.hasta; cambiarFiltros(); });
    on('#est-grupo', e => { S.f.grupo = e.target.value; cambiarFiltros(); });
    on('#est-sector', e => { S.f.sector = e.target.value; cambiarFiltros(); });
    on('#est-gestion', e => { S.f.gestion = e.target.value; cambiarFiltros(); });
    on('#est-pais', e => { S.f.pais = e.target.value; cambiarFiltros(); });
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
    built = true;
  }

  function avisar(txt) {
    const b = document.createElement('div');
    b.className = 'est-toast'; b.setAttribute('role', 'status'); b.textContent = txt;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 2200);
  }

  function pintarControles() {
    const f = S.f;
    $('#est-desde').value = f.desde; $('#est-hasta').value = f.hasta;
    $('#est-grupo').value = f.grupo; $('#est-sector').value = f.sector; $('#est-gestion').value = f.gestion;
    $('#est-pais').value = f.pais; $('#est-rol').value = f.rol;
    $('#est-rol').hidden = !f.pais;
    document.querySelectorAll('[data-periodo]').forEach(b => b.classList.toggle('is-on', b.dataset.periodo === `${f.desde}-${f.hasta}`));
    const vistaTab = S.vista === 'linea' ? 'lineas' : S.vista;
    document.querySelectorAll('.est-tab').forEach(b => { const on = b.dataset.vista === vistaTab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    document.querySelectorAll('[data-est-vista]').forEach(a => a.classList.toggle('active', a.dataset.estVista === vistaTab));
    // En la ficha y en Tasas, los filtros de catálogo no aplican.
    const catalogo = !['linea', 'tasas'].includes(S.vista);
    ['#est-grupo', '#est-sector', '#est-gestion'].forEach(id => { $(id).closest('.est-filtro').classList.toggle('est-off', !catalogo); });
    $('.est-filtros').classList.toggle('est-off-all', S.vista === 'tasas');
    const n = [f.grupo, f.sector, f.gestion, f.pais].filter(Boolean).length + (f.desde !== 2021 || f.hasta !== META.años[1] ? 1 : 0);
    $('#est-limpiar').hidden = !n;
  }

  function frase(total) {
    const f = S.f, partes = [`${f.desde === f.hasta ? f.desde : `${f.desde}–${f.hasta}`}`];
    if (f.grupo && !['linea', 'tasas'].includes(S.vista)) partes.push(nombreGrupo(f.grupo));
    if (f.sector && !['linea', 'tasas'].includes(S.vista)) partes.push(nombreSector(f.sector));
    if (f.gestion && !['linea', 'tasas'].includes(S.vista)) partes.push(gestionTxt(f.gestion));
    if (f.pais) partes.push(`${f.rol === 'coord' ? 'coordinados por' : 'con participación de'} ${nombrePais(f.pais)}`);
    $('#est-resumen').innerHTML = total == null
      ? (S.vista === 'tasas' ? '' : `Con estos filtros: ${partes.map(esc).join(' · ')}`)
      : `<b>${fmtN(total)}</b> proyectos concedidos · ${partes.map(esc).join(' · ')}`;
  }

  /* ── Navegación interna ───────────────────────────────────── */
  function irA(vista, id = null) {
    S.vista = vista; S.id = id;
    escribirHash(true);
    render();
    $('#est-root')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function cambiarFiltros() { escribirHash(false); render(); }

  function render() {
    pintarControles();
    limpiarGraficas();
    const el = $('#est-vista');
    const n = ++seq;
    const vivo = () => n === seq;
    const vistas = { panorama, lineas, linea: ficha, comparar, paises, tasas };
    (vistas[S.vista] || panorama)(el, vivo);
  }

  /* ═══ PANORAMA ═══════════════════════════════════════════════ */
  async function panorama(el, vivo) {
    cargando(el);
    let d;
    try { d = await get('/consulta?' + qsFiltros()); } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(d.kpis.proyectos);
    if (!d.kpis.proyectos) { el.innerHTML = '<div class="est-vacio"><span class="material-symbols-outlined">search_off</span><p>No hay proyectos con estos filtros.</p></div>'; return; }
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

    el.innerHTML = `
      <div class="est-kpis">
        ${kpi('Proyectos concedidos', fmtN(k.proyectos), `${fmtN(k.lineas)} líneas`, true)}
        ${kpi('Dinero concedido', fmtEur(k.importe))}
        ${kpi('Importe mediano', fmtEur(k.mediana), `la mitad de los proyectos, por debajo`)}
        ${kpi('Rango habitual', rango(k.p25, k.p75), 'el 50 % central')}
        ${kpi('Entidades coordinadoras', fmtN(k.coordinadoras), `de ${fmtN(k.paisesCoord)} países`)}
        ${kpi('Buenas prácticas', fmtN(k.buenasPracticas), 'proyectos destacados por la Comisión')}
      </div>
      <div class="est-esencial"><h3>Lo esencial</h3><ul>${ideas.map(i => `<li>${i}</li>`).join('')}</ul></div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Proyectos concedidos por año', '<div id="est-g-año-n"></div>')}
        ${tarjeta('Dinero concedido por año', '<div id="est-g-año-g"></div>')}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Dinero por tipo de acción', '<div id="est-g-grupos"></div>', { sub: 'Pulsa una barra para filtrar por ese tipo' })}
        ${tarjeta('Las que más crecen', listaMini(crecen.slice(0, 6), l => `${l.crecimiento > 0 ? '+' : ''}${pct(l.crecimiento)}`, l => `${fmtN(l.spark.find(v => v > 0))} → ${fmtN(l.spark[l.spark.length - 1])} proyectos/año`), { sub: 'Proyectos del primer al último año del periodo (líneas con 25 o más al principio)' })}
      </div>
      <div class="est-grid">
        ${tarjeta('Las 10 líneas con más dinero', '<div id="est-g-top"></div>', { sub: 'Pulsa una línea para ver su ficha' })}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Donde se concede al máximo', topes.length ? listaMini(topes.slice(0, 6), l => pct(l.alTope), l => `mediana ${fmtEur(l.mediana)} · tope ${fmtEur(l.max2026)}`) : '<p class="est-nota">Ninguna línea de estos filtros tiene un máximo fijo.</p>', { sub: 'Porcentaje de proyectos con al menos el 97 % del máximo' })}
        ${tarjeta(`Donde más pesa ${esc(nFoco)}`, focoFuerte.length ? listaMini(focoFuerte.slice(0, 6), l => pct(l.focoCoord / l.proyectos), l => `coordina ${fmtN(l.focoCoord)} de ${fmtN(l.proyectos)} proyectos`) : '<p class="est-nota">Sin datos suficientes con estos filtros.</p>', { sub: `Parte de los proyectos que coordina ${esc(nFoco)} (líneas con 20 o más proyectos)` })}
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
  async function lineas(el, vivo) {
    cargando(el);
    let d;
    try { d = await get('/consulta?' + qsFiltros()); } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(d.kpis.proyectos);
    tablaLineas = d;
    const foco = d.filtros.foco;
    const focoOp = META.paises.filter(p => p.n > 0).map(p => `<option value="${p.code}" ${p.code === foco ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
    el.innerHTML = `
      <div class="est-toolbar">
        <div class="est-buscar"><span class="material-symbols-outlined">search</span>
          <input id="est-q" type="search" placeholder="Buscar línea (KA220, juventud, Capacity…)" value="${esc(S.buscar)}" aria-label="Buscar línea"></div>
        <label class="est-inline">Tu país en la tabla <select id="est-foco">${focoOp}</select></label>
        <button type="button" id="est-comp-sel" class="est-btn est-btn--primary" disabled><span class="material-symbols-outlined">compare_arrows</span>Comparar <span id="est-comp-n">0</span></button>
        <button type="button" id="est-csv" class="est-btn est-btn--ghost"><span class="material-symbols-outlined">download</span>CSV</button>
      </div>
      <div class="est-tabla-wrap"><table class="est-tabla" id="est-tabla-lineas"></table></div>
      <p class="est-nota mt-2">Marca hasta 4 líneas para compararlas. «Al año» divide entre los años con concesiones. «${esc(nombrePais(foco))} coord./partic.» = proyectos que coordina o en los que participa alguna entidad de ${esc(nombrePais(foco))}.</p>`;

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
      { k: 'crecimiento', t: 'Tendencia', title: 'Proyectos por año dentro del periodo' },
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
          <tr data-id="${l.id}">
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
            <td class="n" title="${l.spark.join(' · ')}">${sparkSvg(l.spark)}</td>
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
    };
    pintar();
    actualizarComp();
    $('#est-q').addEventListener('input', e => { S.buscar = e.target.value; pintar(); });
    $('#est-foco').addEventListener('change', e => { S.f.foco = e.target.value; cambiarFiltros(); });
    $('#est-comp-sel').addEventListener('click', () => { S.comp = { tipo: 'linea', ids: [...marcadas] }; irA('comparar'); });
    $('#est-csv').addEventListener('click', () => {
      descargarCsv(`estadisticas-lineas-${S.f.desde}-${S.f.hasta}.csv`, [
        ['Línea', 'Tipo de acción', 'Gestión', 'Sector', 'Proyectos', 'Al año', 'Dinero (€)', 'Media (€)', 'Mediana (€)', 'P25 (€)', 'P75 (€)', 'Al tope (%)', `${foco} coordina`, `${foco} participa`, 'Máximo 2026 (€)', 'Cierre 2026'],
        ...d.porLinea.map(l => [l.nombre, nombreGrupo(l.grupo), gestionTxt(l.gestion), nombreSector(l.sector), l.proyectos, l.porAño, l.importe, l.media, l.mediana, l.p25, l.p75, l.alTope == null ? '' : Math.round(l.alTope * 100), l.focoCoord, l.focoPart, l.max2026 || '', l.cierre2026 || '']),
      ]);
    });
  }

  /* ═══ FICHA DE LÍNEA ═════════════════════════════════════════ */
  async function ficha(el, vivo) {
    cargando(el);
    let d;
    try { d = await get(`/linea/${encodeURIComponent(S.id)}?` + qsFiltros()); } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(d.kpis.proyectos);
    const l = d.linea, k = d.kpis, foco = d.filtros.foco, nFoco = nombrePais(foco);
    const añosCon = d.porAño.filter(a => a.proyectos > 0).length || 1;
    const multiEnt = d.consorcio.some(c => c.entidades > 1 && c.n / (k.proyectos || 1) > 0.2);

    el.innerHTML = `
      <div class="est-ficha-head">
        <button type="button" class="est-volver" id="est-volver"><span class="material-symbols-outlined">arrow_back</span>Todas las líneas</button>
        <h2>${esc(l.nombre)}</h2>
        <div class="est-chips">${chip(nombreGrupo(l.grupo))}${chip(gestionTxt(l.gestion))}${chip(nombreSector(l.sector))}${l.financiacion ? chip('Financiación UE ' + l.financiacion) : ''}${chip(`Concedida de ${l.desde} a ${l.hasta}`, 'est-chip--tenue')}</div>
        ${l.nota ? `<p class="est-aviso"><span class="material-symbols-outlined">info</span>${esc(l.nota)}</p>` : ''}
        <div class="est-ficha-acciones">
          <button type="button" class="est-btn est-btn--ghost" id="est-a-comp"><span class="material-symbols-outlined">compare_arrows</span>Comparar con otra línea</button>
          <button type="button" class="est-btn est-btn--ghost" id="est-a-csv"><span class="material-symbols-outlined">download</span>CSV por año</button>
        </div>
      </div>
      ${!k.proyectos ? '<div class="est-vacio"><span class="material-symbols-outlined">search_off</span><p>Esta línea no tiene proyectos con estos filtros. Prueba con otro periodo.</p></div>' : `
      <div class="est-kpis">
        ${kpi('Proyectos concedidos', fmtN(k.proyectos), `${fmtN(Math.round(k.proyectos / añosCon))} al año`, true)}
        ${kpi('Importe mediano', fmtEur(k.mediana), `media ${fmtEur(k.media)}`)}
        ${kpi('Rango habitual', rango(k.p25, k.p75), 'el 50 % central')}
        ${kpi('Máximo 2026', l.maxTexto ? esc(l.maxTexto) : fmtEur(l.max2026), k.alTope != null ? `${pct(k.alTope)} de los proyectos, al tope` : '')}
        ${kpi('Cierre 2026', l.cierre2026 ? (l.cierreAprox ? '≈ ' : '') + fecha(l.cierre2026) : '—', l.cierreAprox ? 'fecha habitual, compruébala en la guía' : '17:00 hora de Bruselas')}
        ${kpi(`${esc(nFoco)} coordina / participa`, `${fmtN(k.focoCoord)} / ${fmtN(k.focoPart)}`, k.proyectos ? `${pct(k.focoCoord / k.proyectos, 1)} de los proyectos los coordina ${esc(nFoco)}` : '')}
        ${d.tasa ? kpi('Tasa de éxito', `${d.tasa.aprox ? '≈ ' : ''}${d.tasa.rango || dec1(d.tasa.tasa).replace(',0', '') + ' %'}`, `${esc(d.tasa.ambito)} · convocatoria ${d.tasa.convocatoria}`) : ''}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Proyectos concedidos por año', '<div id="est-f-n"></div>')}
        ${tarjeta('Importe por proyecto, año a año', '<div id="est-f-imp"></div>', { sub: 'Mediana y franja del 50 % central' + (d.porAño.some(a => a.tope) ? ' · línea discontinua: máximo de la convocatoria' : '') })}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Cuánto se concede', '<div id="est-f-dist"></div>', { sub: d.distribucion.tipo === 'tramos' ? 'Proyectos por cantidad fija concedida' : 'Número de proyectos por tramo de importe' })}
        ${tarjeta('Duración de los proyectos', '<div id="est-f-dur"></div>', { sub: 'Meses' })}
      </div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Qué países coordinan', '<div id="est-f-pc"></div>', { sub: `Proyectos coordinados · ${esc(nFoco)} resaltado` })}
        ${tarjeta('Qué países participan', '<div id="est-f-pp"></div>', { sub: 'Proyectos con al menos una entidad del país, en cualquier papel' })}
      </div>
      ${multiEnt ? `<div class="est-grid est-grid--2">${tarjeta('Tamaño del consorcio', '<div id="est-f-cons"></div>', { sub: 'Entidades por proyecto (20 = 20 o más)' })}${tarjeta('Quién coordina más', tablaCoord(d.coordinadoras))}</div>`
        : `<div class="est-grid">${tarjeta('Quién coordina más', tablaCoord(d.coordinadoras))}</div>`}
      ${d.ejemplos.length ? tarjeta('Buenas prácticas de esta línea', `<ul class="est-ejemplos">${d.ejemplos.map(e => `<li>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.titulo)}</a>` : esc(e.titulo)}<span>${e.año} · ${esc(e.nombrePais)} · ${fmtEur(e.importe)}</span></li>`).join('')}</ul>`, { sub: 'Proyectos destacados por la Comisión Europea (abre la Plataforma de Resultados)' }) : ''}
      `}`;

    $('#est-volver').addEventListener('click', () => irA('lineas'));
    $('#est-a-comp').addEventListener('click', () => {
      const ids = S.comp.tipo === 'linea' ? S.comp.ids.filter(x => x !== l.id) : [];
      S.comp = { tipo: 'linea', ids: [l.id, ...ids].slice(0, 4) };
      irA('comparar');
    });
    $('#est-a-csv').addEventListener('click', () => descargarCsv(`estadisticas-${l.id}-${S.f.desde}-${S.f.hasta}.csv`, [
      ['Año', 'Proyectos', 'Dinero (€)', 'Media (€)', 'Mediana (€)', 'P25 (€)', 'P75 (€)', 'Al tope (%)', 'Máximo (€)'],
      ...d.porAño.map(a => [a.año, a.proyectos, a.importe, a.media, a.mediana, a.p25, a.p75, a.alTope == null ? '' : Math.round(a.alTope * 100), a.tope || '']),
    ]));
    if (!k.proyectos) return;

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
    barrasH('#est-f-pc', d.paisesCoord.slice(0, 12), { valor: p => p.n, etiqueta: p => p.nombre, colores: resalta(d.paisesCoord.slice(0, 12)), tooltip: 'Proyectos' });
    barrasH('#est-f-pp', d.paisesPart.slice(0, 12), { valor: p => p.n, etiqueta: p => p.nombre, colores: resalta(d.paisesPart.slice(0, 12)), tooltip: 'Proyectos' });
    if (multiEnt) barrasV('#est-f-cons', d.consorcio.map(x => String(x.entidades)), d.consorcio.map(x => x.n), { nombre: 'Proyectos' });
  }

  function tablaCoord(filas) {
    if (!filas.length) return '<p class="est-nota">Sin datos.</p>';
    return `<div class="est-tabla-wrap"><table class="est-tabla est-tabla--compacta">
      <thead><tr><th>Entidad</th><th>País</th><th class="n">Proyectos</th><th class="n">Dinero</th></tr></thead>
      <tbody>${filas.map(o => `<tr><td>${esc(o.nombre || 'Sin nombre')}</td><td>${esc(o.nombrePais)}</td><td class="n">${fmtN(o.proyectos)}</td><td class="n">${fmtEur(o.importe)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ═══ COMPARAR ═══════════════════════════════════════════════ */
  const SUGERENCIAS = [
    { tipo: 'linea', ids: ['ka220-you', 'ka210-you'], t: 'KA220 frente a KA210 en juventud' },
    { tipo: 'linea', ids: ['cbhe', 'cbvet', 'cbyouth', 'cbsport'], t: 'Las cuatro de Capacity Building' },
    { tipo: 'linea', ids: ['sport-coop', 'ka220-ngo-et', 'ka220-sch'], t: 'Asociaciones: deporte, ONG europeas y escolar' },
    { tipo: 'pais', ids: ['ES', 'IT', 'DE', 'FR'], t: 'España, Italia, Alemania y Francia' },
    { tipo: 'pais', ids: ['ES', 'PT', 'EL'], t: 'España, Portugal y Grecia' },
  ];

  async function comparar(el, vivo) {
    const C = S.comp;
    const opciones = C.tipo === 'linea'
      ? META.grupos.map(g => {
        const ls = META.lineas.filter(l => l.grupo === g.id && l.modo !== 'acreditacion' && l.hasta >= S.f.desde && l.desde <= S.f.hasta && !C.ids.includes(l.id));
        return ls.length ? `<optgroup label="${esc(g.nombre)}">${ls.map(l => `<option value="${l.id}">${esc(l.nombre)}</option>`).join('')}</optgroup>` : '';
      }).join('')
      : META.paises.filter(p => p.n > 0 && !C.ids.includes(p.code)).map(p => `<option value="${p.code}">${esc(p.nombre)}</option>`).join('');

    el.innerHTML = `
      <div class="est-comp-barra">
        <div class="est-seg" role="group" aria-label="Qué comparar">
          <button type="button" data-ctipo="linea" class="${C.tipo === 'linea' ? 'is-on' : ''}">Líneas</button>
          <button type="button" data-ctipo="pais" class="${C.tipo === 'pais' ? 'is-on' : ''}">Países</button>
        </div>
        <div class="est-comp-sel">
          ${C.ids.map((id, i) => `<span class="est-comp-chip" style="--c:${SERIES[i]}"><i></i>${esc(C.tipo === 'linea' ? (lineaMeta(id)?.nombre || id) : nombrePais(id))}<button type="button" data-quitar="${esc(id)}" aria-label="Quitar"><span class="material-symbols-outlined">close</span></button></span>`).join('')}
          ${C.ids.length < 4 ? `<select id="est-comp-add" aria-label="Añadir"><option value="">+ Añadir ${C.tipo === 'linea' ? 'línea' : 'país'}…</option>${opciones}</select>` : ''}
        </div>
      </div>
      <div id="est-comp-cuerpo"></div>`;

    el.querySelectorAll('[data-ctipo]').forEach(b => b.addEventListener('click', () => {
      if (C.tipo === b.dataset.ctipo) return;
      S.comp = { tipo: b.dataset.ctipo, ids: [] }; escribirHash(false); render();
    }));
    el.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => { C.ids = C.ids.filter(x => x !== b.dataset.quitar); escribirHash(false); render(); }));
    $('#est-comp-add')?.addEventListener('change', e => { if (e.target.value) { C.ids.push(e.target.value); escribirHash(false); render(); } });

    const cuerpo = $('#est-comp-cuerpo');
    if (C.ids.length < 2) {
      frase(null);
      cuerpo.innerHTML = `<div class="est-sugerencias"><p>Elige al menos dos ${C.tipo === 'linea' ? 'líneas' : 'países'} arriba, o empieza por una de estas comparaciones:</p>
        <div>${SUGERENCIAS.map((s, i) => `<button type="button" class="est-btn est-btn--ghost" data-sug="${i}">${esc(s.t)}</button>`).join('')}</div></div>`;
      cuerpo.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => { const s = SUGERENCIAS[b.dataset.sug]; S.comp = { tipo: s.tipo, ids: [...s.ids] }; escribirHash(false); render(); }));
      return;
    }
    cargando(cuerpo);
    let d;
    try { d = await get(`/comparar?tipo=${C.tipo}&ids=${C.ids.join(',')}&` + qsFiltros()); } catch (e) { return vivo() && error(cuerpo, e); }
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
        ['Tasa de éxito', x => x.tasa ? `${x.tasa.aprox ? '≈ ' : ''}${x.tasa.rango || dec1(x.tasa.tasa).replace(',0', '') + ' %'} (${x.tasa.ambito})` : '—'],
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
    cuerpo.innerHTML = `
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
    enlazarLineas(cuerpo);

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

  /* ═══ PAÍSES (mapa + ranking) ════════════════════════════════ */
  const METRICAS = {
    coord: { t: 'Proyectos que coordina', v: p => p.coord, fmt: fmtN },
    part: { t: 'Proyectos en los que participa', v: p => p.part, fmt: fmtN },
    importeCoord: { t: 'Dinero de los proyectos que coordina', v: p => p.importeCoord, fmt: v => fmtEur(v) },
    ratio: { t: 'Coordina / participa', v: p => p.ratioCoord, fmt: v => pct(v), nota: 'De cada 100 proyectos en los que está, cuántos coordina' },
  };

  async function paises(el, vivo) {
    cargando(el);
    let d;
    try {
      [d, geo] = await Promise.all([get('/paises?' + qsFiltros()), geo || fetch('/data/europa.geo.json').then(r => r.json())]);
    } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(d.total);
    const M = METRICAS[S.metrica] || METRICAS.coord;
    const sel = S.f.pais || S.f.foco;

    el.innerHTML = `
      <div class="est-toolbar">
        <label class="est-inline">Qué mostrar
          <select id="est-metrica">${Object.entries(METRICAS).map(([k, m]) => `<option value="${k}" ${k === S.metrica ? 'selected' : ''}>${esc(m.t)}</option>`).join('')}</select></label>
        <span class="est-nota">${M.nota ? esc(M.nota) + ' · ' : ''}El filtro de país de arriba no se aplica aquí: el mapa los muestra todos.</span>
      </div>
      <div class="est-grid est-grid--mapa">
        <div class="est-card est-card--mapa">
          <div id="est-mapa" class="est-mapa" role="img" aria-label="Mapa de Europa: ${esc(M.t)}"></div>
          <div id="est-mapa-leyenda" class="est-leyenda"></div>
          <div id="est-mapa-tt" class="est-tt est-tt--flot" hidden></div>
        </div>
        <div class="est-card" id="est-pais-card"></div>
      </div>
      ${tarjeta('Ranking de países', `<div class="est-tabla-wrap est-tabla-wrap--alta"><table class="est-tabla est-tabla--compacta" id="est-rank"></table></div>`, { sub: 'Pulsa un país para ver su detalle · ordena por cualquier columna' })}`;
    $('#est-metrica').addEventListener('change', e => { S.metrica = e.target.value; escribirHash(false); render(); });

    const porCode = new Map(d.paises.map(p => [p.code, p]));
    const detalle = code => {
      const p = porCode.get(code);
      const card = $('#est-pais-card');
      if (!p) { card.innerHTML = `<div class="est-card__head"><h3>${esc(nombrePais(code))}</h3></div><p class="est-nota">Sin proyectos con estos filtros.</p>`; return; }
      card.innerHTML = `
        <div class="est-card__head"><h3>${esc(p.nombre)}</h3><p>Puesto ${p.rankCoord} de ${d.paises.filter(x => x.coord).length} en proyectos coordinados</p></div>
        <dl class="est-dl">
          <div><dt>Coordina</dt><dd>${fmtN(p.coord)}</dd></div>
          <div><dt>Participa</dt><dd>${fmtN(p.part)}</dd></div>
          <div><dt>Dinero que coordina</dt><dd>${fmtEur(p.importeCoord)}</dd></div>
          <div><dt>Coordina / participa</dt><dd>${pct(p.ratioCoord)}</dd></div>
          <div><dt>Frente a la media</dt><dd>${d.mediaCoord ? (p.coord / d.mediaCoord).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' veces' : '—'}</dd></div>
        </dl>
        <div class="flex flex-wrap gap-2 mt-3">
          <button type="button" class="est-btn est-btn--primary" data-p-filtrar="${p.code}"><span class="material-symbols-outlined">filter_alt</span>Ver sus líneas</button>
          <button type="button" class="est-btn est-btn--ghost" data-p-comp="${p.code}"><span class="material-symbols-outlined">compare_arrows</span>Comparar</button>
        </div>`;
      card.querySelector('[data-p-filtrar]').addEventListener('click', () => { S.f.pais = p.code; S.f.rol = 'coord'; irA('lineas'); });
      card.querySelector('[data-p-comp]').addEventListener('click', () => {
        const ids = S.comp.tipo === 'pais' ? S.comp.ids.filter(x => x !== p.code) : [];
        S.comp = { tipo: 'pais', ids: [p.code, ...(ids.length ? ids : [p.code === 'ES' ? 'IT' : 'ES'])].slice(0, 4) };
        irA('comparar');
      });
      document.querySelectorAll('#est-mapa path').forEach(pa => pa.classList.toggle('is-sel', pa.dataset.code === code));
    };

    // Ranking
    let orden = { k: S.metrica === 'ratio' ? 'ratioCoord' : (S.metrica === 'importeCoord' ? 'importeCoord' : S.metrica), dir: -1 };
    const colsR = [['nombre', 'País', true], ['coord', 'Coordina'], ['part', 'Participa'], ['importeCoord', 'Dinero coordinado'], ['ratioCoord', 'Coord./partic.']];
    const pintarRank = () => {
      const filas = [...d.paises].sort((a, b) => (typeof a[orden.k] === 'string' ? a[orden.k].localeCompare(b[orden.k], 'es') : a[orden.k] - b[orden.k]) * orden.dir);
      $('#est-rank').innerHTML = `<thead><tr><th class="n">#</th>${colsR.map(([k, t, txt]) => `<th class="${txt ? '' : 'n'}"><button type="button" data-k="${k}" class="${orden.k === k ? 'is-on' : ''}">${t}${orden.k === k ? (orden.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${filas.map((p, i) => `<tr data-code="${p.code}" class="${p.code === sel ? 'is-sel' : ''}"><td class="n est-tenue">${i + 1}</td><td><button type="button" class="est-link" data-code="${p.code}">${esc(p.nombre)}</button></td><td class="n">${fmtN(p.coord)}</td><td class="n">${fmtN(p.part)}</td><td class="n">${fmtEur(p.importeCoord)}</td><td class="n">${pct(p.ratioCoord)}</td></tr>`).join('')}</tbody>`;
      $('#est-rank').querySelectorAll('th button').forEach(b => b.addEventListener('click', () => { orden = { k: b.dataset.k, dir: orden.k === b.dataset.k ? -orden.dir : (b.dataset.k === 'nombre' ? 1 : -1) }; pintarRank(); }));
      $('#est-rank').querySelectorAll('button[data-code]').forEach(b => b.addEventListener('click', () => detalle(b.dataset.code)));
    };
    pintarRank();
    detalle(sel);
    await mapa(d, M, detalle, sel);
  }

  async function mapa(d, M, detalle, sel) {
    const d3 = await esperar('d3');
    const box = $('#est-mapa');
    if (!box) return;
    const W = box.clientWidth || 640, H = Math.round(W * 0.86);
    const porCode = new Map(d.paises.map(p => [p.code, p]));
    // Cortes solo con los países que se ven en el mapa (los de fuera de Europa los sesgarían).
    const enMapa = new Set(geo.features.map(f => f.id));
    const vals = d.paises.filter(p => enMapa.has(p.code)).map(p => M.v(p)).filter(v => v > 0).sort((a, b) => a - b);
    // Escala por cuantiles: con tamaños tan desiguales, una escala lineal deja casi todo en el mismo tono.
    const cortes = [0.2, 0.4, 0.6, 0.8, 0.92].map(q => d3.quantile(vals, q));
    const color = v => (!v ? '#f2f2f2' : RAMPA[1 + d3.bisectRight(cortes, v)]);
    const proj = d3.geoAzimuthalEqualArea().rotate([-11, -53]).translate([W / 2, H * 0.5]).scale(W * 1.02);
    const path = d3.geoPath(proj);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const tt = $('#est-mapa-tt');
    svg.append('g').selectAll('path').data(geo.features).join('path')
      .attr('d', path).attr('data-code', f => f.id)
      .attr('fill', f => color(porCode.has(f.id) ? M.v(porCode.get(f.id)) : 0))
      .attr('class', f => `est-pais ${porCode.has(f.id) ? 'con' : ''} ${f.id === sel ? 'is-sel' : ''}`)
      .on('mousemove', (ev, f) => {
        const p = porCode.get(f.id);
        tt.hidden = false;
        tt.innerHTML = `<b>${esc(p ? p.nombre : nombrePais(f.id))}</b><br>${p ? `${esc(M.t)}: ${M.fmt(M.v(p))}` : 'Sin proyectos'}`;
        const r = box.getBoundingClientRect();
        tt.style.left = Math.min(ev.clientX - r.left + 14, r.width - 180) + 'px';
        tt.style.top = (ev.clientY - r.top + 14) + 'px';
      })
      .on('mouseleave', () => { tt.hidden = true; })
      .on('click', (ev, f) => detalle(f.id));
    const leyenda = [0, ...cortes];
    $('#est-mapa-leyenda').innerHTML = `<span>${esc(M.t)}</span>${leyenda.map((c, i) => `<i style="background:${RAMPA[1 + i] || RAMPA[6]}" title="${i === 0 ? 'hasta ' + M.fmt(cortes[0]) : 'desde ' + M.fmt(c)}"></i>`).join('')}<small>menos → más</small>`;
  }

  /* ═══ TASAS DE ÉXITO ═════════════════════════════════════════ */
  async function tasas(el, vivo) {
    cargando(el);
    let d;
    try { d = await get('/tasas'); } catch (e) { return vivo() && error(el, e); }
    if (!vivo()) return;
    frase(null);
    const filas = [...d.tasas].sort((a, b) => b.tasa - a.tasa);
    el.innerHTML = `
      <div class="est-aviso est-aviso--grande"><span class="material-symbols-outlined">info</span>
        <div><b>De cada 100 solicitudes, cuántas se aprueban.</b> La Comisión solo publica los proyectos concedidos, así que estas cifras salen de las resoluciones del SEPIE y de los resultados de selección de la EACEA. Se actualizan a mano (última revisión: ${fecha(d.actualizado)}). Una cifra con ≈ es aproximada.</div></div>
      <div class="est-grid est-grid--2">
        ${tarjeta('Tasa de éxito por línea', '<div id="est-t-g"></div>')}
        ${tarjeta('Detalle y fuentes', `<div class="est-tabla-wrap"><table class="est-tabla est-tabla--compacta"><thead><tr><th>Línea</th><th>Ámbito</th><th class="n">Convoc.</th><th class="n">Tasa</th></tr></thead><tbody>
          ${filas.map(t => `<tr><td>${t.lineas.length === 1 ? `<a href="${linkLinea(t.lineas[0])}" data-linea="${t.lineas[0]}">${esc(t.linea)}</a>` : esc(t.linea)}<span class="est-sub">${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.fuente)}</a>` : esc(t.fuente)}</span></td><td>${esc(t.ambito)}</td><td class="n">${t.convocatoria}</td><td class="n"><b>${t.aprox ? '≈ ' : ''}${t.rango || dec1(t.tasa).replace(',0', '') + ' %'}</b></td></tr>`).join('')}
        </tbody></table></div>`)}
      </div>
      ${d.sinDato?.length ? tarjeta('Sin dato publicado', `<ul class="est-ejemplos">${d.sinDato.map(s => `<li><b>${esc(s.linea)}</b><span>${esc(s.motivo)}</span></li>`).join('')}</ul>`) : ''}`;
    enlazarLineas(el);
    barrasH('#est-t-g', filas, { valor: t => t.tasa, etiqueta: t => t.linea, fmt: v => dec1(v).replace(',0', '') + ' %', tooltip: 'Tasa de éxito' });
  }

  /* ── Entrada desde app.js ─────────────────────────────────── */
  async function init(sub) {
    leerHash(sub);
    const root = $('#est-root');
    if (!root) return;
    if (!META) {
      cargando(root);
      try { META = await get('/meta'); } catch (e) { error(root, e); return; }
    }
    if (!built || !$('#est-vista')) construir();
    render();
  }

  return { init };
})();
