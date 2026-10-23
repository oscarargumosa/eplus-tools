#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Mapa del mundo y población para Estadísticas (#estadisticas)
   ═══════════════════════════════════════════════════════════════
   Genera:
   - public/data/mundo.geo.json — países del mundo (Natural Earth vía
     world-atlas, 50m) con los códigos de Erasmus+ (EL, UK, XK) como id.
     Europa sale de public/data/europa.geo.json, que tiene más detalle.
   - data/estadisticas/poblacion.json — población por país (Banco
     Mundial, SP.POP.TOTL), para las cifras «por millón de habitantes».

   Uso: node scripts/estadisticas/build-mundo.js   (necesita red)
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
const CODIGOS = 'https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.11.0/codes.json';
const TOPOJSON = 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js';
const AÑO_POB = 2024;
const POBLACION = `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?date=${AÑO_POB}&format=json&per_page=400`;

// ISO → código que usa la Comisión en sus datos
const A_ERASMUS = { GR: 'EL', GB: 'UK' };

const bajar = async (url, tipo = 'json') => {
  const r = await fetch(url, { headers: { 'User-Agent': 'curl/8 eufundingstudio-estadisticas', Accept: '*/*' } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return tipo === 'json' ? r.json() : r.text();
};

// Redondea las coordenadas a 2 decimales (~1 km): el fichero pesa la mitad.
const redondear = c => (typeof c[0] === 'number' ? [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100] : c.map(redondear));

(async () => {
  const [atlas, codigos, tcTxt, pob] = await Promise.all([bajar(ATLAS), bajar(CODIGOS), bajar(TOPOJSON, 'text'), bajar(POBLACION)]);
  const mod = { exports: {} };
  new Function('module', 'exports', tcTxt)(mod, mod.exports);
  const topojson = mod.exports;

  const numA2 = new Map(codigos.map(([a2, , num]) => [num, a2]));
  const europa = JSON.parse(fs.readFileSync(path.join(RAIZ, 'public', 'data', 'europa.geo.json'), 'utf8'));
  const enEuropa = new Set(europa.features.map(f => f.id));

  const mundo = topojson.feature(atlas, atlas.objects.countries).features
    .map(f => {
      let a2 = numA2.get(String(f.id).padStart(3, '0'));
      if (f.properties.name === 'Kosovo') a2 = 'XK';
      if (!a2 || f.properties.name === 'Antarctica') return null;
      const id = A_ERASMUS[a2] || a2;
      if (enEuropa.has(id)) return null;
      return { type: 'Feature', id, properties: { n: f.properties.name }, geometry: { type: f.geometry.type, coordinates: redondear(f.geometry.coordinates) } };
    })
    .filter(Boolean);

  const salida = { type: 'FeatureCollection', features: [...europa.features, ...mundo] };
  fs.writeFileSync(path.join(RAIZ, 'public', 'data', 'mundo.geo.json'), JSON.stringify(salida));

  // El Banco Mundial no publica Taiwán: cifra de su oficina de estadística (2024).
  const poblacion = { TW: 23400000 };
  for (const r of pob[1] || []) {
    if (r.value == null || !/^[A-Z]{2}$/.test(r.country.id) || !r.countryiso3code) continue;
    poblacion[A_ERASMUS[r.country.id] || r.country.id] = r.value;
  }
  fs.writeFileSync(path.join(RAIZ, 'data', 'estadisticas', 'poblacion.json'), JSON.stringify({
    _nota: 'Población total por país (Banco Mundial, indicador SP.POP.TOTL). Generado por scripts/estadisticas/build-mundo.js.',
    año: AÑO_POB, fuente: 'Banco Mundial (SP.POP.TOTL)', generado: new Date().toISOString().slice(0, 10), poblacion,
  }, null, 0));

  console.log(`mundo.geo.json: ${salida.features.length} países (${europa.features.length} de Europa) · población de ${Object.keys(poblacion).length} países`);
})().catch(e => { console.error(e); process.exit(1); });
