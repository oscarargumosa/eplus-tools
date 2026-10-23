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

   Repetir cuando se recargue la BD de proyectos y commitear los .gz.
   Escribe también data/estadisticas/entidades.json.gz: las entidades
   (ya unificadas, ghl.entity_unified) y, alineadas con los proyectos de
   la foto, las de cada proyecto. Las dos fotos van siempre juntas: la
   «huella» comprueba al cargar que salen de la misma ejecución.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Client } = require('pg');

const URL = process.env.PG_ANALYTICS_URL || 'postgresql://erasmus:erasmus@localhost:5433/erasmus';
const OUT = path.join(__dirname, '..', '..', 'data', 'estadisticas', 'proyectos.json.gz');
const OUT_ENT = path.join(__dirname, '..', '..', 'data', 'estadisticas', 'entidades.json.gz');

// Tipo de entidad: de los ~200 org_type de la Comisión a 11 grupos.
const TIPOS = [
  ['uni', t => /higher education|^university$|associations of higher/i.test(t)],
  ['fp', t => /vocational/i.test(t)],
  ['adultos', t => /adult education/i.test(t)],
  ['escuela', t => /general education|state_school|school/i.test(t)],
  ['deporte', t => /sport/i.test(t)],
  ['cultura', t => /cultur|\bart\b|theatre|dance|music|orchestra|choir|film|multimedia|design|audiovisual|gallery/i.test(t)],
  ['investigacion', t => /research/i.test(t)],
  ['publico', t => /public body|public service|public law|international agenc|territorial cooperation|accreditation|counselling|international organisation/i.test(t)],
  // «Non-governmental organisation/association/social enterprise» es una ONG: va antes que empresa.
  ['ong', t => /non-governmental|association|foundation|fundacion|youth|^ets$|^aps$|^ev$|civil society|ngo|non-profit|twinning|humanitarian|council|network/i.test(t)],
  ['empresa', t => /enterprise|company|plc_ltd|profit making body|social partner|chamber/i.test(t)],
];
const UNI_NOMBRE = /universit|univerzit|uniwersytet|universidad|università|hochschule|politecn|polytechn|egyetem|yliopisto/i;
function tipoDe(orgType, nombre) {
  const t = (orgType || '').trim();
  for (const [id, fn] of TIPOS) if (t && fn(t)) return id;
  if (UNI_NOMBRE.test(nombre || '')) return 'uni';
  return t ? 'otro' : 'sin';
}

const norm = s => (s || '').replace(/\s+/g, ' ').trim();

async function main() {
  const db = new Client({ connectionString: URL });
  await db.connect();

  // Tamaño del consorcio sobre la capa normalizada (la tabla original duplica PIC/OID).
  const { rows } = await db.query(`
    with cons as (
      select project_identifier,
             count(*)::int as n,
             max(canonical_id) filter (where role = 'coordinator') as coord_id,
             array_agg(distinct canonical_id) as ents
        from ghl.entity_projects
       group by 1
    )
    select p.project_identifier as id, p.funding_year as y, p.key_action as ka, p.action_type as at,
           p.coordinator_country as cc, p.coordinator_name as cn, p.eu_grant_eur as g,
           p.duration_months as d, p.participating_countries as pcs, p.is_good_practice as gp,
           case when p.is_good_practice then p.project_title end as title,
           case when p.is_good_practice then p.results_url end as url,
           cons.n, cons.coord_id, cons.ents
      from eplus2021.projects p
      left join cons using (project_identifier)
     where p.funding_year is not null
     order by p.funding_year, p.project_identifier`);
  const { rows: entRows } = await db.query(`
    select u.canonical_id as id, u.name, u.country_code as cc, u.org_type as tipo, u.oid, u.pic
      from ghl.entity_unified u
     where exists (select 1 from ghl.entity_projects ep where ep.canonical_id = u.canonical_id)`);
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

  // Entidades: [nombre, país, tipo, id de su ficha (OID o PIC)]
  const entIdx = new Map(), entList = [], tipos = new Map();
  for (const e of entRows) {
    const nombre = norm(e.name);
    entIdx.set(e.id, entList.length);
    entList.push([nombre, -1, idx(tipos, tipoDe(e.tipo, nombre)), e.oid || e.pic || null, (e.cc || '').trim().toUpperCase()]);
  }
  const PE = { off: [0], e: [] };   // entidades de cada proyecto, en el orden de la foto
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
    const co = name || r.coord_id ? idx(orgs, okey, () => orgList.push([name, c, r.coord_id || null, r.coord_id && entIdx.has(r.coord_id) ? entIdx.get(r.coord_id) : -1])) : -1;
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

    // Coordinadora primero (P.co ya la identifica; aquí basta con el orden).
    const es = (r.ents || []).map(id => entIdx.get(id)).filter(x => x !== undefined);
    const ci = r.coord_id && entIdx.has(r.coord_id) ? entIdx.get(r.coord_id) : -1;
    if (ci >= 0) PE.e.push(ci);
    for (const x of es) if (x !== ci) PE.e.push(x);
    PE.off.push(PE.e.length);
  }
  // País de la entidad como índice de la foto de proyectos.
  for (const e of entList) { e[1] = e[4] ? country(e[4]) : country(null); e.length = 4; }
  const huella = `${P.y.length}:${rows[0]?.id}:${rows[rows.length - 1]?.id}:${PE.e.length}`;

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
    huella,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const gz = zlib.gzipSync(JSON.stringify(snap), { level: 9 });
  fs.writeFileSync(OUT, gz);
  const ent = { v: 1, huella, tipos: [...tipos.keys()], ents: entList, pe: PE };
  const gzE = zlib.gzipSync(JSON.stringify(ent), { level: 9 });
  fs.writeFileSync(OUT_ENT, gzE);
  console.log(`[estadisticas] ${entList.length} entidades · ${PE.e.length} participaciones · ${(gzE.length / 1e6).toFixed(1)} MB → ${OUT_ENT}`);
  console.log(`[estadisticas] ${P.y.length} proyectos · ${lineList.length} líneas · ${orgList.length} coordinadoras · ${(gz.length / 1e6).toFixed(1)} MB → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
