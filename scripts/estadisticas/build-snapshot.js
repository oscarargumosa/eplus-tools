#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Estadísticas — genera data/estadisticas/proyectos.json.gz
   ═══════════════════════════════════════════════════════════════
   Lee la BD de proyectos Erasmus+ (erasmus-pg) y escribe una foto
   compacta, por columnas, que el módulo /v1/estadisticas carga en
   memoria. Así la app no necesita llegar a Postgres en producción.

   Uso (en el host, donde erasmus-pg escucha en 5433):
     node scripts/estadisticas/build-snapshot.js
     PG_ANALYTICS_URL=postgresql://... node scripts/estadisticas/build-snapshot.js

   Repetir cuando se recargue la BD de proyectos y commitear el .gz.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Client } = require('pg');

const URL = process.env.PG_ANALYTICS_URL || 'postgresql://erasmus:erasmus@localhost:5433/erasmus';
const OUT = path.join(__dirname, '..', '..', 'data', 'estadisticas', 'proyectos.json.gz');

const norm = s => (s || '').replace(/\s+/g, ' ').trim();

async function main() {
  const db = new Client({ connectionString: URL });
  await db.connect();

  // Tamaño del consorcio sobre la capa normalizada (la tabla original duplica PIC/OID).
  const { rows } = await db.query(`
    with cons as (
      select project_identifier,
             count(*)::int as n,
             max(canonical_id) filter (where role = 'coordinator') as coord_id
        from ghl.entity_projects
       group by 1
    )
    select p.project_identifier as id, p.funding_year as y, p.key_action as ka, p.action_type as at,
           p.coordinator_country as cc, p.coordinator_name as cn, p.eu_grant_eur as g,
           p.duration_months as d, p.participating_countries as pcs, p.is_good_practice as gp,
           case when p.is_good_practice then p.project_title end as title,
           case when p.is_good_practice then p.results_url end as url,
           cons.n, cons.coord_id
      from eplus2021.projects p
      left join cons using (project_identifier)
     where p.funding_year is not null
     order by p.funding_year, p.project_identifier`);
  await db.end();

  const countries = new Map();   // ISO2 -> índice
  const lines = new Map();       // "ka|action_type" -> índice
  const orgs = new Map();        // clave de coordinadora -> índice
  const idx = (map, key, make) => {
    let i = map.get(key);
    if (i === undefined) { i = map.size; map.set(key, i); if (make) make(key, i); }
    return i;
  };
  const country = cc => idx(countries, (cc || '??').trim().toUpperCase());

  const lineList = [], orgList = [];
  const P = { y: [], l: [], c: [], g: [], d: [], n: [], gp: [], co: [] };
  const PC = { off: [0], c: [] };
  const ejemplos = [];

  for (const r of rows) {
    const ka = norm(r.ka), at = norm(r.at);
    const l = idx(lines, `${ka}|${at}`, () => lineList.push([ka, at]));
    const c = country(r.cc);
    const name = norm(r.cn);
    const okey = r.coord_id ? `id:${r.coord_id}` : `n:${name.toUpperCase()}|${c}`;
    const co = name || r.coord_id ? idx(orgs, okey, () => orgList.push([name, c, r.coord_id || null])) : -1;
    const i = P.y.length;

    P.y.push(r.y - 2000);
    P.l.push(l);
    P.c.push(c);
    P.g.push(r.g == null ? -1 : Math.round(Number(r.g)));   // -1 = sin importe publicado
    P.d.push(r.d || 0);
    P.n.push(r.n || 1);
    P.gp.push(r.gp ? 1 : 0);
    P.co.push(co);

    // Países del consorcio (incluye el del coordinador), sin repetir.
    const set = new Set([c]);
    for (const x of (r.pcs || '').split(',')) if (x.trim()) set.add(country(x));
    for (const x of set) PC.c.push(x);
    PC.off.push(PC.c.length);

    if (r.gp && r.y >= 2021 && r.title) ejemplos.push([i, norm(r.title), r.url || null]);
  }

  const snap = {
    v: 1,
    generado: new Date().toISOString(),
    fuente: 'Comisión Europea · Erasmus+ Project Results (proyectos concedidos)',
    paises: [...countries.keys()],
    lineas: lineList,
    orgs: orgList,
    p: P,
    pc: PC,
    ejemplos,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const gz = zlib.gzipSync(JSON.stringify(snap), { level: 9 });
  fs.writeFileSync(OUT, gz);
  console.log(`[estadisticas] ${P.y.length} proyectos · ${lineList.length} líneas · ${orgList.length} coordinadoras · ${(gz.length / 1e6).toFixed(1)} MB → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
