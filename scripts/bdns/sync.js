#!/usr/bin/env node
/**
 * BDNS Calls Sync — pulls Spanish public-grant calls into data/bdns/.
 *
 * Source: Base de Datos Nacional de Subvenciones (Ministerio de Hacienda).
 *   Listado: GET https://www.pap.hacienda.gob.es/bdnstrans/api/convocatorias/ultimas?page=N&size=100
 *   Detalle: GET https://www.pap.hacienda.gob.es/bdnstrans/api/convocatorias?numConv=<numeroConvocatoria>
 *
 * Three phases (run independently or chained via `all`):
 *   fetch    Paginate listing endpoint, save raw pages to data/bdns/_raw/
 *   detail   For each listing entry, fetch full detail (31 fields) to data/bdns/_raw/details/
 *   extract  Parse + filter (open by deadline, optional region) → data/bdns/{codigoBDNS}/
 *
 * Usage:
 *   node scripts/bdns/sync.js                              # all phases, last 30 days, only open
 *   node scripts/bdns/sync.js fetch --days=180             # broader window
 *   node scripts/bdns/sync.js extract --region=ES13        # only Cantabria
 *   node scripts/bdns/sync.js all --max=50                 # smoke test with cap
 *
 * Flags:
 *   --days=N             Cutoff for listing pagination (stop when fechaRecepcion < today-N). Default 30.
 *   --max=N              Cap calls processed (for testing).
 *   --region=ESxx        NUTS code filter (ES13=Cantabria, ES11=Galicia, etc.). Match against regiones[].
 *   --only-open          Filter out calls with fechaFinSolicitud in the past (default true).
 *   --include-closed     Disable open-only filter.
 *   --concurrency=10     Parallel detail fetches.
 *   --skip-existing      Skip detail fetch if file already on disk (default true).
 *   --force              Overwrite existing files.
 *   --dry-run            Print plan, don't write.
 *
 * Notes:
 *   - The "encoding bug" reported in the BDNS handoff (Â/Ã³ corruption) is a PowerShell 5.1 issue
 *     when reading Content-Type without charset. Node's fetch decodes UTF-8 correctly by default.
 *     Bytes from BDNS are valid UTF-8.
 *   - `abierto`, `region` query params are ignored by the server. Filter post-fetch.
 *   - Listing endpoint caps `totalElements` at 10000 (Spring default). Older calls fall off, but
 *     paginating by `fechaRecepcion` cutoff handles the open-call subset fine.
 *   - Cantabria is NUTS code ES13. Region match is `startsWith` against `regiones[].descripcion` ("ES13 - ...").
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RAW_DIR = path.join(REPO_ROOT, 'data', 'bdns', '_raw');
const DETAILS_DIR = path.join(RAW_DIR, 'details');
const BDNS_DIR = path.join(REPO_ROOT, 'data', 'bdns');
const INDEX_CSV = path.join(BDNS_DIR, '_index.csv');
const META_FILE = path.join(BDNS_DIR, '_meta.json');

const LISTING_URL = 'https://www.pap.hacienda.gob.es/bdnstrans/api/convocatorias/ultimas';
const DETAIL_URL = 'https://www.pap.hacienda.gob.es/bdnstrans/api/convocatorias';

// -------------------- CLI --------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v === undefined ? true : v;
    } else {
      args._.push(a);
    }
  }
  return args;
}

// -------------------- Phase 1: fetch listing --------------------

async function fetchListingPage(page, size = 100) {
  const url = `${LISTING_URL}?page=${page}&size=${size}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Listing page ${page}: ${res.status} ${res.statusText}`);
  return res.json();
}

function dateAddDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

async function phaseFetch(args) {
  const days = Number(args.days) || 30;
  const cutoff = dateAddDays(new Date(), -days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  console.log(`[fetch] paginating listing, stopping at fechaRecepcion < ${cutoffISO} (${days} days)`);

  if (args['dry-run']) {
    console.log(`[fetch:dry] would paginate /convocatorias/ultimas`);
    return;
  }

  await fsp.mkdir(RAW_DIR, { recursive: true });

  let page = 0;
  let total = 0;
  let stopped = false;
  while (!stopped) {
    const j = await fetchListingPage(page);
    const items = j.content || [];
    if (!items.length) break;

    await fsp.writeFile(path.join(RAW_DIR, `page-${page}.json`), JSON.stringify(j));
    total += items.length;

    const last = items[items.length - 1];
    const lastDate = last?.fechaRecepcion;
    console.log(`[fetch] page ${page} (${items.length} items, last fechaRecepcion=${lastDate})`);

    if (lastDate && lastDate < cutoffISO) {
      console.log(`[fetch] hit cutoff at page ${page}, stopping`);
      stopped = true;
      break;
    }
    if (j.last) {
      console.log(`[fetch] reached last page ${page}`);
      break;
    }
    page++;
    if (page > 200) {
      console.warn(`[fetch] safety brake at page 200, stopping`);
      break;
    }
  }

  await fsp.writeFile(
    path.join(RAW_DIR, '_listing_meta.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), pages: page + 1, totalItems: total, cutoffDays: days }, null, 2),
  );
  console.log(`[fetch] done — ${total} items across ${page + 1} pages → ${RAW_DIR}`);
}

// -------------------- Phase 2: fetch detail per call --------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchDetail(numConv, attempt = 1) {
  const url = `${DETAIL_URL}?numConv=${encodeURIComponent(numConv)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429) {
    if (attempt > 5) throw new Error(`Detail ${numConv}: 429 after 5 retries`);
    const wait = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, 32s
    await sleep(wait);
    return fetchDetail(numConv, attempt + 1);
  }
  if (!res.ok) throw new Error(`Detail ${numConv}: ${res.status}`);
  return res.json();
}

async function phaseDetail(args) {
  const concurrency = Math.max(1, Number(args.concurrency) || 3);
  const interBatchMs = Math.max(0, Number(args['inter-batch-ms']) || 200);
  const force = !!args.force;
  const max = args.max ? Number(args.max) : Infinity;

  const pageFiles = (await fsp.readdir(RAW_DIR)).filter((f) => /^page-\d+\.json$/.test(f)).sort();
  if (!pageFiles.length) throw new Error(`No listing pages in ${RAW_DIR}. Run "fetch" first.`);

  // Collect all numeroConvocatoria from listing pages
  const numConvs = [];
  for (const f of pageFiles) {
    const j = JSON.parse(await fsp.readFile(path.join(RAW_DIR, f), 'utf8'));
    for (const item of j.content || []) {
      if (item.numeroConvocatoria) numConvs.push(String(item.numeroConvocatoria));
    }
  }

  // Dedup
  const unique = Array.from(new Set(numConvs));
  console.log(`[detail] ${unique.length} unique numeroConvocatoria from listing`);

  if (args['dry-run']) {
    console.log(`[detail:dry] would fetch detail for ${unique.length} calls (concurrency=${concurrency})`);
    return;
  }

  await fsp.mkdir(DETAILS_DIR, { recursive: true });

  let processed = 0;
  let fetched = 0;
  let skipped = 0;
  let errored = 0;
  for (let i = 0; i < unique.length && processed < max; i += concurrency) {
    const batch = unique.slice(i, Math.min(i + concurrency, unique.length, processed + (max - processed) + concurrency));
    await Promise.all(
      batch.map(async (nc) => {
        if (processed >= max) return;
        const target = path.join(DETAILS_DIR, `${nc}.json`);
        if (!force && fs.existsSync(target)) {
          skipped++;
          processed++;
          return;
        }
        try {
          const j = await fetchDetail(nc);
          await fsp.writeFile(target, JSON.stringify(j));
          fetched++;
          processed++;
          if (fetched % 50 === 0) console.log(`[detail] progress: fetched=${fetched} skipped=${skipped} errored=${errored}`);
        } catch (err) {
          console.error(`[detail:err] ${nc}: ${err.message}`);
          errored++;
          processed++;
        }
      }),
    );
    if (interBatchMs > 0) await sleep(interBatchMs);
  }
  console.log(`[detail] done — fetched=${fetched} skipped=${skipped} errored=${errored}`);
}

// -------------------- Phase 3: extract --------------------

function nutsFromRegiones(regiones) {
  // regiones[].descripcion looks like "ES13 - CANTABRIA" or "ES61 - ANDALUCÍA"
  const codes = [];
  for (const r of regiones || []) {
    const desc = r?.descripcion || '';
    const m = desc.match(/^(ES\d+)\b/);
    if (m) codes.push(m[1]);
  }
  return codes;
}

function level(organo) {
  // Map organo.nivel1 to a level enum: estado | ccaa | local | otros
  const n1 = (organo?.nivel1 || '').toUpperCase();
  if (n1 === 'LOCAL') return 'local';
  if (n1 === 'AUTONOMICA' || n1.includes('AUTÓNOMA') || n1.includes('AUTONÓMICA')) return 'ccaa';
  if (n1 === 'ESTADO' || n1 === 'AGE') return 'estado';
  if (n1 === 'OTROS') return 'otros';
  return n1.toLowerCase() || 'unknown';
}

function publishingAuthorityCode(organo) {
  // Build a stable code from organo nivel1/2/3 hash-free
  return [organo?.nivel1, organo?.nivel2, organo?.nivel3].filter(Boolean).join(' / ');
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function safeName(s) {
  return String(s).replace(/[\/\\:*?"<>|]/g, '_');
}

function isOpen(detail, todayISO) {
  // BDNS `abierto` is unreliable: marks false when no explicit start/end dates
  // are set, even if the textual deadline (textFin) implies the call is still open.
  // Use a layered heuristic instead.
  const inicio = detail.fechaInicioSolicitud;
  const fin = detail.fechaFinSolicitud;

  // 1. If we have an explicit deadline, it's authoritative.
  if (fin) return fin >= todayISO;

  // 2. If we have a start date but no end → continuous call from that date. Open if start <= today.
  if (inicio && !fin) return inicio <= todayISO;

  // 3. No explicit dates but textual signals (textInicio/textFin) → treat as open.
  //    Most "PRÓXIMA PUBLICACIÓN BOLETÍN" / "ÚLTIMO DÍA HÁBIL" calls fall here.
  if (detail.textInicio || detail.textFin) return true;

  // 4. Last resort: trust the API flag.
  return !!detail.abierto;
}

function normalize(detail, todayISO) {
  const codigo = detail.codigoBDNS || String(detail.id);
  const regiones = detail.regiones || [];
  const nutsCodes = nutsFromRegiones(regiones);
  return {
    source: 'bdns',
    source_id: codigo,
    source_lang: 'es',
    level: level(detail.organo),
    programme: detail.tipoConvocatoria || null,
    sub_programme: null,
    publishing_authority_code: publishingAuthorityCode(detail.organo),
    nuts_codes: nutsCodes,
    nuts_primary: nutsCodes[0] || null,
    title: detail.descripcion || null,
    title_lang: 'es',
    summary: detail.descripcionFinalidad || null,
    status: isOpen(detail, todayISO) ? 'open' : 'closed',
    publication_date: detail.fechaRecepcion || null,
    open_date: detail.fechaInicioSolicitud || null,
    deadline: detail.fechaFinSolicitud || null,
    deadline_model: detail.fechaInicioSolicitud && detail.fechaFinSolicitud ? 'single-stage' : 'continuous',
    deadlines_extra: null,
    budget_total_eur: detail.presupuestoTotal ?? null,
    budget_per_project_min_eur: null,
    budget_per_project_max_eur: null,
    expected_grants: null,
    cofinancing_pct: null,
    duration_months: null,
    audience: (detail.tiposBeneficiarios || []).map((b) => b.descripcion).filter(Boolean).join('; ') || null,
    eligible_orgs: (detail.tiposBeneficiarios || []).map((b) => b.descripcion).filter(Boolean),
    eligible_countries: ['ES'],
    sectores: (detail.sectores || []).map((s) => ({ codigo: s.codigo, descripcion: s.descripcion })),
    apply_url: detail.sedeElectronica || null,
    details_url: `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/${codigo}`,
    documents: (detail.documentos || []).map((d) => ({ label: d.descripcion || d.nombreFic, url: d.descargaUrl || null })),
    bases_reguladoras_url: detail.urlBasesReguladoras || null,
    text_inicio: detail.textInicio || null,
    text_fin: detail.textFin || null,
    se_publica_diario_oficial: !!detail.sePublicaDiarioOficial,
    ayuda_estado: detail.ayudaEstado || null,
    fondos: detail.fondos || [],
    reglamento: detail.reglamento || null,
    objetivos: detail.objetivos || [],
    sectores_productos: detail.sectoresProductos || [],
    anuncios: detail.anuncios || [],
    mrr_flag: !!detail.mrr,
    fetchedAt: new Date().toISOString(),
  };
}

async function phaseExtract(args) {
  const onlyOpen = args['include-closed'] ? false : true;
  const region = args.region ? String(args.region).toUpperCase() : null;
  const max = args.max ? Number(args.max) : Infinity;
  const todayISO = new Date().toISOString().slice(0, 10);

  if (!fs.existsSync(DETAILS_DIR)) throw new Error(`No details in ${DETAILS_DIR}. Run "detail" first.`);

  const detailFiles = (await fsp.readdir(DETAILS_DIR)).filter((f) => f.endsWith('.json')).sort();
  console.log(`[extract] ${detailFiles.length} detail files to process`);

  const indexRows = ['source_id,level,nuts_primary,title,status,open_date,deadline,budget_total_eur,publishing_authority,details_url,mrr'];
  let written = 0;
  let filtered = 0;

  for (const f of detailFiles) {
    if (written >= max) break;
    let detail;
    try {
      detail = JSON.parse(await fsp.readFile(path.join(DETAILS_DIR, f), 'utf8'));
    } catch (err) {
      console.error(`[extract:err] parse ${f}: ${err.message}`);
      continue;
    }
    if (!detail || !detail.codigoBDNS) continue;

    if (onlyOpen && !isOpen(detail, todayISO)) {
      filtered++;
      continue;
    }
    if (region) {
      const codes = nutsFromRegiones(detail.regiones);
      if (!codes.some((c) => c.toUpperCase() === region)) {
        filtered++;
        continue;
      }
    }

    const norm = normalize(detail, todayISO);

    if (args['dry-run']) {
      console.log(`[extract:dry] ${norm.source_id} | ${norm.level} | ${norm.nuts_primary || '?'} | ${(norm.title || '').slice(0, 70)}`);
      written++;
      continue;
    }

    const dir = path.join(BDNS_DIR, safeName(norm.source_id));
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'topic.json'), JSON.stringify(norm, null, 2));
    await fsp.writeFile(path.join(dir, 'raw.json'), JSON.stringify(detail, null, 2));

    indexRows.push(
      [
        norm.source_id,
        norm.level,
        norm.nuts_primary,
        norm.title,
        norm.status,
        norm.open_date,
        norm.deadline,
        norm.budget_total_eur,
        norm.publishing_authority_code,
        norm.details_url,
        norm.mrr_flag,
      ]
        .map(csvEscape)
        .join(','),
    );
    written++;
  }

  if (!args['dry-run']) {
    await fsp.writeFile(INDEX_CSV, indexRows.join('\n'));
    await fsp.writeFile(
      META_FILE,
      JSON.stringify(
        {
          extractedAt: new Date().toISOString(),
          totalDetails: detailFiles.length,
          written,
          filteredOut: filtered,
          onlyOpen,
          region,
        },
        null,
        2,
      ),
    );
  }
  console.log(`[extract] done — written=${written} filteredOut=${filtered}`);
}

// -------------------- Main --------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'all';

  if (!['fetch', 'detail', 'extract', 'all'].includes(cmd)) {
    console.error(`Unknown command: ${cmd}\nUse: fetch | detail | extract | all`);
    process.exit(1);
  }

  if (cmd === 'fetch' || cmd === 'all') await phaseFetch(args);
  if (cmd === 'detail' || cmd === 'all') await phaseDetail(args);
  if (cmd === 'extract' || cmd === 'all') await phaseExtract(args);

  console.log(`[sync] ${cmd} complete`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
