/* ═══════════════════════════════════════════════════════════════
   Estadísticas — motor en memoria
   ═══════════════════════════════════════════════════════════════
   Carga data/estadisticas/proyectos.json.gz (generado por
   scripts/estadisticas/build-snapshot.js) y lo cruza con
   lineas.json. Cada consulta recorre los ~320k proyectos en arrays
   planos: unos milisegundos, sin base de datos.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, '..', '..', '..', '..', 'data', 'estadisticas');
const PERIODO_ACTUAL = 2021;

let S = null;   // estado cargado

/* ── Carga ──────────────────────────────────────────────────── */
function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

const GRUPO_POR_KA = {
  'Learning Mobility of Individuals': 'movilidad',
  'Partnerships for cooperation and exchanges of practices': 'asociaciones',
  'Cooperation for innovation and the exchange of good practices': 'asociaciones',
  'Support for policy reform': 'ka3',
  'Jean Monnet Activities': 'jeanmonnet',
  'Sport': 'deporte',
};

const nombrePais = (() => {
  let dn = null;
  try { dn = new Intl.DisplayNames(['es'], { type: 'region' }); } catch { /* sin ICU */ }
  const fix = { EL: 'GR', UK: 'GB', XK: 'XK' };
  return code => {
    if (!code || code === '??') return 'Sin país';
    try { return (dn && dn.of(fix[code] || code)) || code; } catch { return code; }
  };
})();

function load() {
  if (S) return S;
  const t0 = Date.now();
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'proyectos.json.gz'))));
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'lineas.json'), 'utf8'));
  const tasas = JSON.parse(fs.readFileSync(path.join(DIR, 'tasas.json'), 'utf8'));
  let pob = { poblacion: {} };
  try { pob = JSON.parse(fs.readFileSync(path.join(DIR, 'poblacion.json'), 'utf8')); } catch { /* sin población: no hay «por habitante» */ }

  // Líneas curadas: id → ficha. Los alias y las particiones apuntan a otra ficha.
  const lineas = [];          // fichas finales
  const porId = new Map();
  const ficha = (id, base) => {
    if (porId.has(id)) return porId.get(id);
    const f = { id, ...base, idx: lineas.length };
    delete f.partir; delete f.alias;
    lineas.push(f); porId.set(id, f.idx);
    return f.idx;
  };
  // Primero las no-alias, para que el alias encuentre la ficha creada.
  const entradas = Object.entries(meta.lineas).sort((a, b) => (a[1].alias ? 1 : 0) - (b[1].alias ? 1 : 0));
  const rawMeta = new Map(entradas);

  // Mapa raw (índice en snap.lineas) → { normal, bajo, alto, desde, umbral }
  const rawMap = snap.lineas.map(([ka, at]) => {
    const m = rawMeta.get(at);
    if (!m) {
      return { normal: ficha('x-' + slug(at), { nombre: at, grupo: GRUPO_POR_KA[ka] || 'ka3', gestion: null, sector: 'varios', modo: 'presupuesto', sinFicha: true }) };
    }
    if (m.alias) return { normal: ficha(m.id, rawMeta.get(entradas.find(([, v]) => v.id === m.id && !v.alias)[0])) };
    const r = { normal: ficha(m.id, m) };
    if (m.partir) {
      r.desde = m.partir.desde; r.umbral = m.partir.umbral;
      r.bajo = ficha(m.partir.bajo.id, m.partir.bajo);
      r.alto = ficha(m.partir.alto.id, m.partir.alto);
    }
    return r;
  });

  // Arrays tipados: ~6 veces menos memoria que los arrays del JSON.
  const T = { y: Uint8Array, l: Uint16Array, c: Uint16Array, g: Int32Array, d: Uint16Array, n: Uint16Array, gp: Uint8Array, co: Int32Array };
  const P = {};
  for (const k of Object.keys(T)) P[k] = T[k].from(snap.p[k]);
  snap.p = null;
  snap.pc = { off: Uint32Array.from(snap.pc.off), c: Uint16Array.from(snap.pc.c) };
  const N = P.y.length;
  const L = new Uint16Array(N);       // línea curada de cada proyecto
  const Y = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const y = P.y[i] + 2000; Y[i] = y;
    const r = rawMap[P.l[i]];
    L[i] = r.bajo !== undefined && y >= r.desde ? (P.g[i] >= 0 && P.g[i] <= r.umbral ? r.bajo : r.alto) : r.normal;
  }

  // Periodos y volumen de cada línea
  for (const f of lineas) { f.n = 0; f.desdeAño = 9999; f.hastaAño = 0; }
  for (let i = 0; i < N; i++) {
    const f = lineas[L[i]]; f.n++;
    if (Y[i] < f.desdeAño) f.desdeAño = Y[i];
    if (Y[i] > f.hastaAño) f.hastaAño = Y[i];
  }
  const usadas = lineas.filter(f => f.n > 0);

  const tasaPorLinea = new Map();
  for (const t of tasas.tasas) for (const id of t.lineas || []) if (!tasaPorLinea.has(id)) tasaPorLinea.set(id, t);

  const ejemplosPorLinea = new Map();
  for (const [i, titulo, url] of snap.ejemplos) {
    const k = L[i];
    if (!ejemplosPorLinea.has(k)) ejemplosPorLinea.set(k, []);
    ejemplosPorLinea.get(k).push({ i, titulo, url, año: Y[i], pais: snap.paises[P.c[i]], importe: P.g[i] });
  }

  S = {
    snap, meta, tasas, lineas, usadas, porId, L, Y, N, P,
    pc: snap.pc, paises: snap.paises, orgs: snap.orgs,
    paisIdx: new Map(snap.paises.map((c, i) => [c, i])),
    tasaPorLinea, ejemplosPorLinea,
    pob: pob.poblacion, pobFuente: pob.fuente ? `${pob.fuente}, ${pob.año}` : null,
    años: [P.y.reduce((a, b) => Math.min(a, b), 99) + 2000, P.y.reduce((a, b) => Math.max(a, b), 0) + 2000],
  };
  console.log(`[estadisticas] ${N} proyectos, ${usadas.length} líneas en ${Date.now() - t0} ms`);
  return S;
}

/* ── Utilidades numéricas ───────────────────────────────────── */
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}
const sortNum = a => a.sort((x, y) => x - y);

function resumen(grants, n) {
  const g = sortNum(grants);
  let sum = 0; for (const v of g) sum += v;
  return {
    proyectos: n,
    conImporte: g.length,
    importe: sum,
    media: g.length ? Math.round(sum / g.length) : null,
    mediana: quantile(g, 0.5),
    p25: quantile(g, 0.25),
    p75: quantile(g, 0.75),
  };
}

function tope(f, y) {
  if (f.sinTope || !f.max2026) return null;
  if (f.topes && f.topes[y]) return f.topes[y];
  return y < 2026 && f.maxAnterior ? f.maxAnterior : f.max2026;
}

/* ── Filtros ────────────────────────────────────────────────── */
const lista = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);

function parseFiltros(q) {
  const s = load();
  const desde = Math.max(s.años[0], parseInt(q.desde, 10) || PERIODO_ACTUAL);
  const hasta = Math.min(s.años[1], parseInt(q.hasta, 10) || s.años[1]);
  const grupos = new Set(lista(q.grupo));
  const sectores = new Set(lista(q.sector));
  const ids = lista(q.linea);
  const lineasSel = ids.length ? new Set(ids.map(id => s.porId.get(id)).filter(x => x !== undefined)) : null;
  const gestion = q.gestion === 'AN' || q.gestion === 'EACEA' ? q.gestion : null;
  const pais = q.pais && s.paisIdx.has(String(q.pais).toUpperCase()) ? s.paisIdx.get(String(q.pais).toUpperCase()) : null;
  const rol = q.rol === 'part' ? 'part' : 'coord';
  const conImporte = q.acreditaciones !== '1';   // por defecto fuera lo que no reparte dinero
  const foco = s.paisIdx.has(String(q.foco || 'ES').toUpperCase()) ? s.paisIdx.get(String(q.foco || 'ES').toUpperCase()) : s.paisIdx.get('ES');

  // Líneas que pasan los filtros de catálogo
  const okLinea = new Uint8Array(s.lineas.length);
  for (const f of s.lineas) {
    if (lineasSel && !lineasSel.has(f.idx)) continue;
    if (grupos.size && !grupos.has(f.grupo)) continue;
    if (sectores.size && !sectores.has(f.sector)) continue;
    if (gestion && f.gestion !== gestion) continue;
    if (conImporte && f.modo === 'acreditacion' && !lineasSel) continue;
    okLinea[f.idx] = 1;
  }
  return { desde, hasta, okLinea, pais, rol, foco, clave: JSON.stringify([desde, hasta, [...grupos], [...sectores], ids, gestion, pais, rol, conImporte, foco]) };
}

function participa(s, i, pais) {
  const { off, c } = s.pc;
  for (let k = off[i]; k < off[i + 1]; k++) if (c[k] === pais) return true;
  return false;
}

/* Recorre los proyectos que pasan el filtro. */
function forEach(F, fn, { ignorarPais = false, ignorarAños = false } = {}) {
  const s = load();
  const { L, Y, P, N } = s;
  for (let i = 0; i < N; i++) {
    const y = Y[i];
    if (!ignorarAños && (y < F.desde || y > F.hasta)) continue;
    if (!F.okLinea[L[i]]) continue;
    if (!ignorarPais && F.pais !== null) {
      if (F.rol === 'coord' ? P.c[i] !== F.pais : !participa(s, i, F.pais)) continue;
    }
    fn(i);
  }
}

/* ── Caché pequeña por consulta ─────────────────────────────── */
const cache = new Map();
function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const v = fn();
  cache.set(key, v);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return v;
}

/* ── API pública ────────────────────────────────────────────── */
function meta() {
  const s = load();
  const cuenta = new Map();
  for (let i = 0; i < s.N; i++) if (s.Y[i] >= PERIODO_ACTUAL) cuenta.set(s.P.c[i], (cuenta.get(s.P.c[i]) || 0) + 1);
  return {
    generado: s.snap.generado,
    fuente: s.snap.fuente,
    fuentePoblacion: s.pobFuente,
    años: s.años,
    periodoActual: PERIODO_ACTUAL,
    grupos: s.meta.grupos,
    sectores: s.meta.sectores,
    lineas: s.usadas.map(f => ({
      id: f.id, nombre: f.nombre, grupo: f.grupo, gestion: f.gestion, sector: f.sector, modo: f.modo,
      desde: f.desdeAño, hasta: f.hastaAño, n: f.n,
      max2026: f.max2026 || null, maxTexto: f.maxTexto || null, tramos: f.tramos || null,
      cierre2026: f.cierre2026 || null, cierreAprox: !!f.cierreAprox, financiacion: f.financiacion || null,
      nota: f.nota || null, tasa: s.tasaPorLinea.get(f.id) || null,
    })),
    paises: s.paises
      .map((c, i) => ({ code: c, nombre: nombrePais(c), n: cuenta.get(i) || 0 }))
      .filter(p => p.code !== '??')
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  };
}

function consulta(q) {
  const F = parseFiltros(q);
  return cached('c' + F.clave, () => {
    const s = load();
    const { P, L, Y } = s;
    const años = []; for (let y = F.desde; y <= F.hasta; y++) años.push(y);
    const ai = y => y - F.desde;

    const tot = { g: [], n: 0, gp: 0, coord: new Set(), paises: new Set() };
    const porAño = años.map(() => ({ n: 0, g: [] }));
    const porLinea = new Map();
    const porGrupo = new Map();

    forEach(F, i => {
      const g = P.g[i], y = Y[i], li = L[i], f = s.lineas[li];
      tot.n++; if (g > 0) tot.g.push(g);
      if (P.gp[i]) tot.gp++;
      if (P.co[i] >= 0) tot.coord.add(P.co[i]);
      tot.paises.add(P.c[i]);
      const a = porAño[ai(y)]; a.n++; if (g > 0) a.g.push(g);

      let pl = porLinea.get(li);
      if (!pl) porLinea.set(li, pl = { n: 0, g: [], spark: años.map(() => 0), sparkG: años.map(() => 0), alTope: 0, conTope: 0, focoCoord: 0, focoPart: 0, añosCon: new Set() });
      pl.n++; if (g > 0) pl.g.push(g);
      pl.spark[ai(y)]++; if (g > 0) pl.sparkG[ai(y)] += g;
      pl.añosCon.add(y);
      const t = tope(f, y);
      if (t && g > 0) { pl.conTope++; if (g >= t * 0.97) pl.alTope++; }
      if (P.c[i] === F.foco) pl.focoCoord++;
      if (participa(s, i, F.foco)) pl.focoPart++;

      let pg = porGrupo.get(f.grupo);
      if (!pg) porGrupo.set(f.grupo, pg = { n: 0, importe: 0 });
      pg.n++; if (g > 0) pg.importe += g;
    });

    const r = resumen(tot.g, tot.n);
    // Crecimiento: primer año con datos frente al último del rango
    const lineasOut = [...porLinea.entries()].map(([li, pl]) => {
      const f = s.lineas[li];
      const rs = resumen(pl.g, pl.n);
      const nA = pl.añosCon.size || 1;
      const ini = pl.spark.findIndex(v => v > 0);
      const fin = pl.spark.length - 1 - [...pl.spark].reverse().findIndex(v => v > 0);
      const crec = ini >= 0 && fin > ini && pl.spark[ini] > 0 ? (pl.spark[fin] - pl.spark[ini]) / pl.spark[ini] : null;
      return {
        id: f.id, nombre: f.nombre, grupo: f.grupo, gestion: f.gestion, sector: f.sector,
        ...rs, porAño: Math.round(pl.n / nA), spark: pl.spark, sparkImporte: pl.sparkG,
        alTope: pl.conTope ? pl.alTope / pl.conTope : null,
        focoCoord: pl.focoCoord, focoPart: pl.focoPart, crecimiento: crec,
        max2026: f.max2026 || null, cierre2026: f.cierre2026 || null,
      };
    }).sort((a, b) => b.importe - a.importe);

    return {
      filtros: { desde: F.desde, hasta: F.hasta, pais: F.pais !== null ? s.paises[F.pais] : null, rol: F.rol, foco: s.paises[F.foco] },
      kpis: { ...r, buenasPracticas: tot.gp, coordinadoras: tot.coord.size, paisesCoord: tot.paises.size, lineas: porLinea.size },
      porAño: años.map((y, k) => { const rs = resumen(porAño[k].g, porAño[k].n); return { año: y, proyectos: rs.proyectos, importe: rs.importe, mediana: rs.mediana, media: rs.media }; }),
      porLinea: lineasOut,
      porGrupo: s.meta.grupos.map(g => ({ id: g.id, nombre: g.nombre, ...(porGrupo.get(g.id) || { n: 0, importe: 0 }) })).filter(g => g.n > 0),
    };
  });
}

/* Mapa y ranking de países (ignora el filtro de país).
   Además del periodo pedido, devuelve cada país año a año en TODO el
   rango de la foto: el navegador recalcula el mapa al mover la línea de
   tiempo o al reproducirla sin pedir nada más. */
function paises(q) {
  const F = parseFiltros(q);
  return cached('p' + F.clave, () => {
    const s = load();
    const { P, Y } = s;
    const n = s.paises.length;
    const [a0, a1] = s.años, nA = a1 - a0 + 1;
    const cY = Array.from({ length: n }, () => new Array(nA).fill(0));
    const pY = Array.from({ length: n }, () => new Array(nA).fill(0));
    const iY = Array.from({ length: n }, () => new Array(nA).fill(0));
    const totalY = new Array(nA).fill(0);
    forEach(F, i => {
      const k = Y[i] - a0, g = Math.max(0, P.g[i]);
      totalY[k]++;
      cY[P.c[i]][k]++; iY[P.c[i]][k] += g;
      const { off, c } = s.pc;
      for (let j = off[i]; j < off[i + 1]; j++) pY[c[j]][k]++;
    }, { ignorarPais: true, ignorarAños: true });
    const ra = F.desde - a0, rb = F.hasta - a0;
    const suma = arr => { let t = 0; for (let k = ra; k <= rb; k++) t += arr[k]; return t; };
    const out = [];
    for (let k = 0; k < n; k++) {
      if (s.paises[k] === '??') continue;
      const coord = suma(cY[k]), part = suma(pY[k]);
      if (!cY[k].some(Boolean) && !pY[k].some(Boolean)) continue;
      out.push({
        code: s.paises[k], nombre: nombrePais(s.paises[k]), pob: s.pob[s.paises[k]] || null,
        coord, importeCoord: suma(iY[k]), part, ratioCoord: part ? coord / part : 0,
        cY: cY[k], pY: pY[k], iY: iY[k],
      });
    }
    out.sort((a, b) => b.coord - a.coord);
    out.forEach((p, k) => { p.rankCoord = k + 1; });
    const conCoord = out.filter(p => p.coord > 0);
    const media = conCoord.length ? conCoord.reduce((a, p) => a + p.coord, 0) / conCoord.length : 0;
    return { total: suma(totalY), años: [a0, a1], totalY, mediaCoord: Math.round(media), paises: out };
  });
}

/* Detalle de un país: sus cifras, sus líneas, quién coordina y con qué
   países trabaja (la red de socios que dibuja el mapa). */
function pais(code, q) {
  const s = load();
  const k = s.paisIdx.get(String(code).toUpperCase());
  if (k === undefined) return null;
  const rol = q.rol === 'part' ? 'part' : 'coord';
  const F = parseFiltros({ ...q, pais: s.paises[k], rol });
  return cached('d' + F.clave, () => {
    const { P } = s;
    const socios = new Map(), orgs = new Map();
    let n = 0;
    forEach(F, i => {
      n++;
      const { off, c } = s.pc;
      const vistos = new Set();
      for (let j = off[i]; j < off[i + 1]; j++) {
        const o = c[j];
        if (o === k || vistos.has(o) || s.paises[o] === '??') continue;
        vistos.add(o);
        socios.set(o, (socios.get(o) || 0) + 1);
      }
      if (P.c[i] === k && P.co[i] >= 0) {
        let x = orgs.get(P.co[i]);
        if (!x) orgs.set(P.co[i], x = { n: 0, importe: 0 });
        x.n++; x.importe += Math.max(0, P.g[i]);
      }
    });
    const c = consulta({ ...q, pais: s.paises[k], rol });
    return {
      code: s.paises[k], nombre: nombrePais(s.paises[k]), rol, pob: s.pob[s.paises[k]] || null,
      kpis: c.kpis, porAño: c.porAño,
      lineas: c.porLinea.slice(0, 10).map(l => ({ id: l.id, nombre: l.nombre, grupo: l.grupo, proyectos: l.proyectos, importe: l.importe, mediana: l.mediana })),
      socios: [...socios.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
        .map(([o, v]) => ({ code: s.paises[o], nombre: nombrePais(s.paises[o]), n: v, pct: n ? v / n : 0 })),
      entidades: [...orgs.entries()].sort((a, b) => b[1].n - a[1].n || b[1].importe - a[1].importe).slice(0, 10)
        .map(([o, v]) => ({ nombre: s.orgs[o][0], proyectos: v.n, importe: v.importe, ficha: fichaOrg(o) })),
    };
  });
}

function bins(sorted, nBins = 14) {
  if (!sorted.length) return [];
  const lo = sorted[0], hi = quantile(sorted, 0.98) || sorted[sorted.length - 1];
  const raw = (hi - lo) / nBins || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(x => x >= raw);
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let a = start; a <= hi; a += step) out.push({ desde: a, hasta: a + step, n: 0 });
  let resto = 0;
  for (const v of sorted) {
    const k = Math.floor((v - start) / step);
    if (k >= 0 && k < out.length) out[k].n++; else resto++;
  }
  if (resto) out.push({ desde: out.length ? out[out.length - 1].hasta : hi, hasta: null, n: resto });
  return out;
}

function distribucionTramos(sorted, tramos) {
  const t = [...tramos].sort((a, b) => a - b);
  const cuenta = t.map(v => ({ importe: v, n: 0 }));
  let otros = 0;
  for (const g of sorted) {
    const k = t.findIndex(v => Math.abs(g - v) <= v * 0.005);
    if (k >= 0) cuenta[k].n++; else otros++;
  }
  return { tramos: cuenta, otros };
}

function linea(id, q) {
  const s = load();
  const li = s.porId.get(id);
  if (li === undefined) return null;
  const F = parseFiltros({ ...q, linea: id, acreditaciones: '1', grupo: '', sector: '', gestion: '' });
  return cached('l' + F.clave, () => {
    const f = s.lineas[li];
    const { P, Y } = s;
    const años = []; for (let y = F.desde; y <= F.hasta; y++) años.push(y);
    const porAño = años.map(() => ({ n: 0, g: [], alTope: 0, conTope: 0 }));
    const all = [], dur = new Map(), cons = new Map();
    const coordP = new Map(), partP = new Map(), orgs = new Map();
    let n = 0, focoCoord = 0, focoPart = 0, gp = 0;

    forEach(F, i => {
      n++;
      const g = P.g[i], y = Y[i], a = porAño[y - F.desde];
      a.n++;
      if (g > 0) {
        all.push(g); a.g.push(g);
        const t = tope(f, y);
        if (t) { a.conTope++; if (g >= t * 0.97) a.alTope++; }
      }
      if (P.d[i]) dur.set(P.d[i], (dur.get(P.d[i]) || 0) + 1);
      const nc = Math.min(P.n[i], 20);
      cons.set(nc, (cons.get(nc) || 0) + 1);
      coordP.set(P.c[i], (coordP.get(P.c[i]) || 0) + 1);
      const { off, c } = s.pc;
      for (let k = off[i]; k < off[i + 1]; k++) partP.set(c[k], (partP.get(c[k]) || 0) + 1);
      if (P.c[i] === F.foco) focoCoord++;
      if (participa(s, i, F.foco)) focoPart++;
      if (P.gp[i]) gp++;
      if (P.co[i] >= 0) {
        let o = orgs.get(P.co[i]);
        if (!o) orgs.set(P.co[i], o = { n: 0, importe: 0 });
        o.n++; o.importe += Math.max(0, g);
      }
    });

    const sorted = sortNum(all);
    const rs = resumen(sorted.slice(), n);
    let alTope = 0, conTope = 0;
    porAño.forEach(a => { alTope += a.alTope; conTope += a.conTope; });

    const topPaises = (m, k = 15) => [...m.entries()].filter(([c]) => s.paises[c] !== '??')
      .sort((a, b) => b[1] - a[1]).slice(0, k)
      .map(([c, v]) => ({ code: s.paises[c], nombre: nombrePais(s.paises[c]), n: v, pct: n ? v / n : 0 }));

    const ejemplos = (s.ejemplosPorLinea.get(li) || [])
      .filter(e => e.año >= F.desde && e.año <= F.hasta && (F.pais === null || (F.rol === 'coord' ? s.P.c[e.i] === F.pais : participa(s, e.i, F.pais))))
      .sort((a, b) => b.año - a.año).slice(0, 8)
      .map(({ titulo, url, año, pais, importe }) => ({ titulo, url, año, pais, nombrePais: nombrePais(pais), importe }));

    return {
      linea: {
        id: f.id, nombre: f.nombre, grupo: f.grupo, gestion: f.gestion, sector: f.sector, modo: f.modo,
        max2026: f.max2026 || null, maxTexto: f.maxTexto || null, tramos: f.tramos || null,
        cierre2026: f.cierre2026 || null, cierreAprox: !!f.cierreAprox, financiacion: f.financiacion || null,
        nota: f.nota || null, desde: f.desdeAño, hasta: f.hastaAño,
      },
      filtros: { desde: F.desde, hasta: F.hasta, pais: F.pais !== null ? s.paises[F.pais] : null, rol: F.rol, foco: s.paises[F.foco] },
      kpis: { ...rs, alTope: conTope ? alTope / conTope : null, buenasPracticas: gp, focoCoord, focoPart, coordinadoras: orgs.size, paisesCoord: coordP.size },
      porAño: años.map((y, k) => {
        const a = porAño[k]; const r2 = resumen(a.g, a.n);
        return { año: y, proyectos: a.n, importe: r2.importe, media: r2.media, mediana: r2.mediana, p25: r2.p25, p75: r2.p75, alTope: a.conTope ? a.alTope / a.conTope : null, tope: tope(f, y) };
      }),
      distribucion: f.tramos && f.modo === 'fijo' ? { tipo: 'tramos', ...distribucionTramos(sorted, f.tramos) } : { tipo: 'histograma', bins: bins(sorted) },
      duracion: [...dur.entries()].sort((a, b) => a[0] - b[0]).map(([meses, v]) => ({ meses, n: v })),
      consorcio: [...cons.entries()].sort((a, b) => a[0] - b[0]).map(([entidades, v]) => ({ entidades, n: v })),
      paisesCoord: topPaises(coordP),
      paisesPart: topPaises(partP),
      coordinadoras: [...orgs.entries()].sort((a, b) => b[1].n - a[1].n || b[1].importe - a[1].importe).slice(0, 15)
        .map(([o, v]) => ({ nombre: s.orgs[o][0], pais: s.paises[s.orgs[o][1]], nombrePais: nombrePais(s.paises[s.orgs[o][1]]), proyectos: v.n, importe: v.importe, ficha: fichaOrg(o) })),
      ejemplos,
      tasa: s.tasaPorLinea.get(f.id) || null,
    };
  });
}

/* Comparar 2–4 líneas o países con los mismos filtros. */
function comparar(q) {
  const s = load();
  const tipo = q.tipo === 'pais' ? 'pais' : 'linea';
  const ids = lista(q.ids).slice(0, 4);
  return ids.map(id => {
    if (tipo === 'linea') {
      const d = linea(id, q);
      if (!d) return null;
      return { id, nombre: d.linea.nombre, kpis: d.kpis, porAño: d.porAño, distribucion: d.distribucion, max2026: d.linea.max2026, tasa: d.tasa };
    }
    const code = id.toUpperCase();
    if (!s.paisIdx.has(code)) return null;
    const c = consulta({ ...q, pais: code });
    return { id: code, nombre: nombrePais(code), kpis: c.kpis, porAño: c.porAño, topLineas: c.porLinea.slice(0, 8).map(l => ({ id: l.id, nombre: l.nombre, proyectos: l.proyectos, importe: l.importe })) };
  }).filter(Boolean);
}

function tasas() { return load().tasas; }

/* ── Entidades: ranking y mapa (entidades.json.gz) ──────────────
   Las entidades vienen unificadas (ghl.entity_unified) y, para cada
   proyecto de la foto, la lista de las que participan (la coordinadora
   primero). Se cargan la primera vez que alguien las pide. */
let E = null;
function cargarEntidades() {
  if (E !== null) return E || null;
  const s = load();
  try {
    const t0 = Date.now();
    const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'entidades.json.gz'))));
    if (raw.huella !== s.snap.huella) {
      console.error(`[estadisticas] entidades.json.gz no casa con proyectos.json.gz (${raw.huella} ≠ ${s.snap.huella}): regenera las dos con build-snapshot.js`);
      E = false; return null;
    }
    const n = raw.ents.length;
    E = {
      n, tipos: raw.tipos,
      nombre: raw.ents.map(e => e[0]),
      pais: Uint16Array.from(raw.ents, e => e[1]),
      tipo: Uint8Array.from(raw.ents, e => e[2]),
      ficha: raw.ents.map(e => e[3]),
      off: Uint32Array.from(raw.pe.off), e: Uint32Array.from(raw.pe.e),
      bajo: null,
    };
    E.uni = E.tipos.indexOf('uni');
    console.log(`[estadisticas] ${n} entidades, ${E.e.length} participaciones en ${Date.now() - t0} ms`);
  } catch (e) {
    console.error('[estadisticas] sin entidades:', e.message);
    E = false;
  }
  return E || null;
}

// Id de la ficha (OID o PIC) de una coordinadora de la foto de proyectos.
function fichaOrg(o) {
  const s = load(), x = s.orgs[o]?.[3];
  const e = cargarEntidades();
  return e && x >= 0 ? e.ficha[x] : null;
}

const ORDENES = { proyectos: 'np', coordina: 'nc', dinero: 'din', dineroCoord: 'dinC' };

// Agregado base (periodo, líneas, tipo de entidad, mínimo de proyectos):
// sirve para el mapa y para todas las páginas del ranking.
function baseEntidades(q) {
  const s = load(), e = cargarEntidades();
  if (!e) return null;
  const F = parseFiltros({ ...q, pais: '' });
  const tiposSel = new Set(lista(q.tipo).map(t => e.tipos.indexOf(t)).filter(i => i >= 0));
  const sinUni = q.sinUni === '1';
  const min = Math.max(1, parseInt(q.min, 10) || 1);
  const clave = 'eb' + F.clave + JSON.stringify([[...tiposSel], sinUni, min]);
  return cached(clave, () => {
    const { P, Y } = s;
    const okT = i => (!tiposSel.size || tiposSel.has(e.tipo[i])) && !(sinUni && e.tipo[i] === e.uni);
    const np = new Uint32Array(e.n), nc = new Uint32Array(e.n), din = new Float64Array(e.n), dinC = new Float64Array(e.n);
    forEach(F, i => {
      const g = Math.max(0, P.g[i]);
      // La coordinadora es la entidad unificada de su organización (si se conoce).
      const ce = P.co[i] >= 0 ? s.orgs[P.co[i]][3] : -1;
      for (let j = e.off[i]; j < e.off[i + 1]; j++) {
        const x = e.e[j];
        np[x]++; din[x] += g;
        if (x === ce) { nc[x]++; dinC[x] += g; }
      }
    }, { ignorarPais: true });

    // Año a año (todo el rango de la foto): entidades activas por país.
    const [a0, a1] = s.años, nA = a1 - a0 + 1, nP = s.paises.length;
    const act = new Uint8Array(e.n * nA);
    const nY = Array.from({ length: nP }, () => new Array(nA).fill(0));
    const totalY = new Array(nA).fill(0);
    forEach(F, i => {
      const k = Y[i] - a0;
      for (let j = e.off[i]; j < e.off[i + 1]; j++) {
        const x = e.e[j];
        if (!okT(x) || act[x * nA + k]) continue;
        act[x * nA + k] = 1; nY[e.pais[x]][k]++; totalY[k]++;
      }
    }, { ignorarPais: true, ignorarAños: true });

    const ids = [], dentro = new Uint8Array(e.n);
    const nPais = new Float64Array(nP), dinPais = new Float64Array(nP), uniPais = new Float64Array(nP);
    const porTipo = new Array(e.tipos.length).fill(0);
    for (let x = 0; x < e.n; x++) {
      if (np[x] < min || !okT(x)) continue;
      ids.push(x); dentro[x] = 1;
      nPais[e.pais[x]]++;
      if (e.tipo[x] === e.uni) uniPais[e.pais[x]]++;
      porTipo[e.tipo[x]]++;
    }
    // Dinero por país: cada proyecto una vez, aunque tenga varias entidades del país.
    const visto = new Int32Array(nP).fill(-1);
    forEach(F, i => {
      const g = Math.max(0, P.g[i]);
      for (let j = e.off[i]; j < e.off[i + 1]; j++) {
        const x = e.e[j], c = e.pais[x];
        if (!dentro[x] || visto[c] === i) continue;
        visto[c] = i; dinPais[c] += g;
      }
    }, { ignorarPais: true });
    const paises = [];
    for (let k = 0; k < nP; k++) {
      if (s.paises[k] === '??' || (!nPais[k] && !nY[k].some(Boolean))) continue;
      paises.push({ code: s.paises[k], nombre: nombrePais(s.paises[k]), pob: s.pob[s.paises[k]] || null, n: nPais[k], dinero: dinPais[k], uni: uniPais[k], nY: nY[k] });
    }
    paises.sort((a, b) => b.n - a.n);
    return {
      F, min, np, nc, din, dinC, ids, ordenados: new Map(),
      mapa: {
        años: [a0, a1], totalY, total: ids.length, paises,
        tipos: e.tipos.map((t, i) => ({ id: t, n: porTipo[i] })).filter(t => t.n),
        sinPais: ids.filter(x => s.paises[e.pais[x]] === '??').length,
      },
    };
  });
}

function entidades(q) {
  const s = load(), e = cargarEntidades();
  const b = baseEntidades(q);
  if (!e || !b) return null;
  const orden = ORDENES[q.orden] ? q.orden : 'proyectos';
  const epais = q.epais && s.paisIdx.has(String(q.epais).toUpperCase()) ? s.paisIdx.get(String(q.epais).toUpperCase()) : null;
  const k = orden + ':' + epais;
  let lista_ = b.ordenados.get(k);
  if (!lista_) {
    const v = b[ORDENES[orden]], v2 = b.din;
    lista_ = (epais === null ? b.ids.slice() : b.ids.filter(x => e.pais[x] === epais))
      .sort((x, y) => v[y] - v[x] || v2[y] - v2[x]);
    b.ordenados.set(k, lista_);
    if (b.ordenados.size > 40) b.ordenados.delete(b.ordenados.keys().next().value);
  }
  // Puesto en el ranking completo, también cuando se busca un nombre.
  let filas = lista_.map((x, i) => [x, i + 1]);
  const t = String(q.buscar || '').trim().toLowerCase();
  if (t) {
    if (!e.bajo) e.bajo = e.nombre.map(n => n.toLowerCase());
    filas = filas.filter(([x]) => e.bajo[x].includes(t));
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  return {
    total: filas.length,
    totalPais: lista_.length,
    orden, min: b.min,
    filas: filas.slice(offset, offset + limit).map(([x, pos]) => ({
      pos, nombre: e.nombre[x] || 'Sin nombre', code: s.paises[e.pais[x]], nombrePais: nombrePais(s.paises[e.pais[x]]),
      tipo: e.tipos[e.tipo[x]], proyectos: b.np[x], coordina: b.nc[x], dinero: b.din[x], dineroCoord: b.dinC[x], ficha: e.ficha[x],
    })),
  };
}

function mapaEntidades(q) {
  const b = baseEntidades(q);
  return b ? b.mapa : null;
}

module.exports = { load, meta, consulta, paises, pais, linea, comparar, tasas, entidades, mapaEntidades, fichaOrg };
