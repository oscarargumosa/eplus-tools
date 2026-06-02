#!/usr/bin/env node
/**
 * Funding Unifier — produces data/funding_unified.json by merging:
 *   - SEDIA calls (data/calls/{ID}/topic.json)            — EU level
 *   - BDNS calls (data/bdns/{codigoBDNS}/topic.json)      — Spain national/regional/local
 *   - SALTO trainings (data/salto/trainings.json)         — EU training events (Erasmus+ youth)
 *   - Curated overrides (data/erasmus_plus_2026_calls.clean.json) — fills the 3 fields SEDIA doesn't expose
 *
 * Output shape: array of normalized records with the cross-source schema agreed
 * with Cantabria Claude (Round 1+2). Single JSON file consumable as a static
 * dump by erasmuscantabria.com (architecture B' decided 2026-05-07).
 *
 * Usage:
 *   node scripts/funding/build-unified.js
 *   node scripts/funding/build-unified.js --pretty       # indented JSON (debug)
 *   node scripts/funding/build-unified.js --stats        # print summary stats
 *
 * Output:
 *   data/funding_unified.json     — flat array of records
 *   data/funding_unified.meta.json — generation metadata + counts
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SEDIA_DIR = path.join(REPO_ROOT, 'data', 'calls');
const BDNS_DIR = path.join(REPO_ROOT, 'data', 'bdns');
const SALTO_FILE = path.join(REPO_ROOT, 'data', 'salto', 'trainings.json');
const CURATED_ERASMUS = path.join(REPO_ROOT, 'data', 'erasmus_plus_2026_calls.clean.json');
const OUTPUT_JSON = path.join(REPO_ROOT, 'data', 'funding_unified.json');
const OUTPUT_META = path.join(REPO_ROOT, 'data', 'funding_unified.meta.json');

function parseArgs(argv) {
  const a = { _: [] };
  for (const x of argv) {
    if (x.startsWith('--')) {
      const [k, v] = x.slice(2).split('=');
      a[k] = v === undefined ? true : v;
    } else a._.push(x);
  }
  return a;
}

function deterministicUUID(source, sourceId) {
  // UUIDv5-style deterministic UUID over a fixed namespace.
  const hash = crypto.createHash('sha1').update(`${source}::${sourceId}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),                // version 5
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}

async function readJsonSafe(p) {
  try {
    const txt = await fsp.readFile(p, 'utf8');
    return JSON.parse(txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt);
  } catch {
    return null;
  }
}

// -------------------- SEDIA --------------------

async function loadSediaCalls() {
  if (!fs.existsSync(SEDIA_DIR)) return [];
  const dirs = (await fsp.readdir(SEDIA_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);
  const out = [];
  for (const d of dirs) {
    const topic = await readJsonSafe(path.join(SEDIA_DIR, d, 'topic.json'));
    if (topic) out.push(topic);
  }
  return out;
}

function programmeLevel(programme) {
  // SEDIA always EU level
  return 'eu';
}

function programmeFromSediaId(identifier) {
  if (!identifier) return null;
  if (/^EuropeAid/i.test(identifier)) return 'NDICI / EuropeAid';
  const prefix = identifier.split('-')[0].toUpperCase();
  const map = {
    HORIZON: 'Horizon Europe',
    ERASMUS: 'Erasmus+',
    DIGITAL: 'Digital Europe',
    CEF: 'Connecting Europe Facility',
    LIFE: 'LIFE',
    CERV: 'CERV',
    EDF: 'European Defence Fund',
    EUAF: 'EU Anti-Fraud',
    CREA: 'Creative Europe',
    PPPA: 'Pilot Projects',
    EUBA: 'EUBA',
    SOCPL: 'EaSI / SOCPL',
    SMP: 'Single Market Programme',
    EU4H: 'EU4Health',
    EU4HEALTH: 'EU4Health',
    JUST: 'Justice',
    AMIF: 'AMIF',
    BMVI: 'BMVI',
    ISF: 'ISF',
    INNOVFUND: 'Innovation Fund',
    EUSPA: 'EUSPA',
    EMFAF: 'EMFAF',
    PERI: 'Pericles IV',
    PERICLES: 'Pericles IV',
    CUST: 'Customs',
    FISC: 'Fiscalis',
    ESF: 'ESF+',
    EUI: 'European Urban Initiative',
    NDICI: 'NDICI',
    IPA: 'IPA III',
    ESC: 'European Solidarity Corps',
    JTM: 'Just Transition',
    UCPM: 'UCPM',
    I3: 'I3',
  };
  return map[prefix] || prefix;
}

function summarizeFromMarkdown(md, max = 320) {
  if (!md) return null;
  // Remove markdown headers, list bullets, code fences
  let t = md
    .replace(/^#+\s+.*$/gm, '')                  // headers
    .replace(/^\s*[-*]\s+/gm, '')                // bullets
    .replace(/[*_`]/g, '')                       // emphasis
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastDot = cut.lastIndexOf('. ');
  return (lastDot > max * 0.5 ? cut.slice(0, lastDot + 1) : cut.trimEnd() + '…');
}

async function readSediaDescription(identifier, slugDir) {
  const mdPath = path.join(SEDIA_DIR, slugDir, 'description.md');
  if (!fs.existsSync(mdPath)) return null;
  return await fsp.readFile(mdPath, 'utf8');
}

function normalizeSedia(topic, descriptionMd, curated) {
  const id = topic.identifier;
  const programme = programmeFromSediaId(id);
  const summaryEn = summarizeFromMarkdown(descriptionMd, 320);
  const cur = curated.get(id);
  return {
    call_id: deterministicUUID('sedia', id),
    source: 'sedia',
    source_id: id,
    source_lang: 'en',
    level: 'eu',
    category: 'call_for_proposals',
    programme,
    sub_programme: cur?.action_subline || topic.callTitle || null,
    publishing_authority_code: topic.programmeCode || null,
    nuts_codes: [],
    nuts_primary: null,
    title: topic.title || topic.callTitle || id,
    title_lang: 'en',
    summary_en: summaryEn,
    summary_es: null,                                       // backfill pending (Sonnet)
    summary_es_pending: true,
    status: topic.status || null,
    publication_date: null,                                  // SEDIA doesn't expose
    open_date: topic.opening || null,
    deadline: topic.deadline || null,
    deadline_model: topic.deadlineModel || null,
    deadlines_extra: null,
    budget_total_eur: topic.budget?.total_eur || null,
    budget_per_project_min_eur: cur?.amount_eur && cur?.amount_type?.includes('Min') ? cur.amount_eur : null,
    budget_per_project_max_eur: cur?.amount_eur && !cur?.amount_type?.includes('Min') ? cur.amount_eur : null,
    expected_grants: cur?.expected_grants || null,
    cofinancing_pct: cur?.funding_rate ? parseInt(cur.funding_rate, 10) : null,
    duration_months: cur?.duration ? parseDurationMonths(cur.duration) : null,
    audience: null,
    eligible_orgs: [],
    eligible_countries: ['EU27'],
    keywords: topic.keywords || [],
    crossCuttingPriorities: topic.crossCuttingPriorities || [],
    apply_url: topic.submissionUrl || null,
    details_url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${id}`,
    documents: (topic.documents || []).filter((d) => d.is_downloadable).map((d) => ({ label: d.label, url: d.url })),
    tags: cur?.tier ? [cur.tier] : [],
    mrr_flag: false,
    curated_enrichment: !!cur,
    fetched_at: topic.fetchedAt || null,
  };
}

function parseDurationMonths(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+)\s*months?/i);
  if (m) return parseInt(m[1], 10);
  const y = String(s).match(/(\d+)\s*years?/i);
  if (y) return parseInt(y[1], 10) * 12;
  return null;
}

// -------------------- BDNS --------------------

async function loadBdnsCalls() {
  if (!fs.existsSync(BDNS_DIR)) return [];
  const dirs = (await fsp.readdir(BDNS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);
  const out = [];
  for (const d of dirs) {
    const topic = await readJsonSafe(path.join(BDNS_DIR, d, 'topic.json'));
    if (topic) out.push(topic);
  }
  return out;
}

function normalizeBdns(b) {
  return {
    call_id: deterministicUUID('bdns', b.source_id),
    source: 'bdns',
    source_id: b.source_id,
    source_lang: 'es',
    level: b.level || 'unknown',
    category: 'call_for_proposals',
    programme: b.programme || 'Subvención pública España',
    sub_programme: null,
    publishing_authority_code: b.publishing_authority_code,
    nuts_codes: b.nuts_codes || [],
    nuts_primary: b.nuts_primary,
    title: b.title,
    title_lang: 'es',
    summary_en: null,
    summary_es: b.summary || null,
    summary_es_pending: false,
    status: b.status,
    publication_date: b.publication_date,
    open_date: b.open_date,
    deadline: b.deadline,
    deadline_model: b.deadline_model,
    deadlines_extra: { textInicio: b.text_inicio, textFin: b.text_fin },
    budget_total_eur: b.budget_total_eur,
    budget_per_project_min_eur: null,
    budget_per_project_max_eur: null,
    expected_grants: null,
    cofinancing_pct: null,
    duration_months: null,
    audience: b.audience,
    eligible_orgs: b.eligible_orgs || [],
    eligible_countries: b.eligible_countries || ['ES'],
    keywords: [],
    crossCuttingPriorities: [],
    apply_url: b.apply_url,
    details_url: b.details_url,
    documents: b.documents || [],
    tags: [],
    mrr_flag: !!b.mrr_flag,
    curated_enrichment: false,
    fetched_at: b.fetchedAt || null,
  };
}

// -------------------- SALTO --------------------

async function loadSalto() {
  const j = await readJsonSafe(SALTO_FILE);
  if (!j) return [];
  if (Array.isArray(j)) return j;
  return Array.isArray(j.items) ? j.items : [];
}

function normalizeSalto(s) {
  const countries = typeof s.participants_countries === 'string'
    ? s.participants_countries.split(/,\s*/).filter(Boolean)
    : (Array.isArray(s.participants_countries) ? s.participants_countries : []);
  return {
    call_id: deterministicUUID('salto', s.salto_id || s.url),
    source: 'salto',
    source_id: String(s.salto_id || s.url),
    source_lang: 'en',
    level: 'eu',
    category: 'training',
    programme: 'Erasmus+ Youth (SALTO)',
    sub_programme: s.type || null,
    publishing_authority_code: s.organiser_type || null,
    nuts_codes: [],
    nuts_primary: null,
    title: s.title,
    title_lang: 'en',
    summary_en: s.description_text || s.summary || null,
    summary_es: null,
    summary_es_pending: true,
    status: s.deadline_iso && new Date(s.deadline_iso) >= new Date() ? 'open' : 'closed',
    publication_date: null,
    open_date: null,
    deadline: s.deadline_iso || null,
    deadline_model: 'single-stage',
    deadlines_extra: { dates: s.dates, selection_date: s.selection_date },
    budget_total_eur: null,
    budget_per_project_min_eur: null,
    budget_per_project_max_eur: s.fee_amount_eur || null,
    expected_grants: s.participants_count || null,
    cofinancing_pct: null,
    duration_months: null,
    audience: countries.join(', ') || null,
    eligible_orgs: [],
    eligible_countries: countries.length ? countries : ['EU27'],
    keywords: [],
    crossCuttingPriorities: [],
    apply_url: s.application_url || null,
    details_url: s.url || null,
    documents: [],
    tags: [s.fee_type, s.country].filter(Boolean),
    mrr_flag: false,
    curated_enrichment: false,
    fetched_at: s.enriched_at || null,
    salto_specific: {
      city: s.city,
      country: s.country,
      working_languages: s.working_languages,
      organiser_name: s.organiser_name,
      fee_type: s.fee_type,
      fee_amount_eur: s.fee_amount_eur,
      fee_text: s.fee_text,
      accommodation_food_text: s.accommodation_food_text,
      travel_reimbursement_text: s.travel_reimbursement_text,
      venue_text: s.venue_text,
    },
  };
}

// -------------------- Curated overrides --------------------

async function loadCuratedErasmus() {
  const list = await readJsonSafe(CURATED_ERASMUS);
  if (!Array.isArray(list)) return new Map();
  const m = new Map();
  for (const r of list) {
    if (r.topic_id) m.set(r.topic_id, r);
  }
  return m;
}

// -------------------- Main --------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('[unify] loading sources...');

  const [sediaTopics, bdnsTopics, saltoList, curated] = await Promise.all([
    loadSediaCalls(),
    loadBdnsCalls(),
    loadSalto(),
    loadCuratedErasmus(),
  ]);

  console.log(`[unify] sedia=${sediaTopics.length} bdns=${bdnsTopics.length} salto=${saltoList.length} curated=${curated.size}`);

  // SEDIA — read description.md per slug to compute summary_en
  const sediaDirs = await fsp.readdir(SEDIA_DIR);
  const slugMap = new Map(); // identifier → slug dir name
  for (const slug of sediaDirs) {
    if (slug.startsWith('_')) continue;
    const topic = await readJsonSafe(path.join(SEDIA_DIR, slug, 'topic.json'));
    if (topic?.identifier) slugMap.set(topic.identifier, slug);
  }

  const sediaNorm = [];
  for (const t of sediaTopics) {
    const slug = slugMap.get(t.identifier);
    const desc = slug ? await readSediaDescription(t.identifier, slug) : null;
    sediaNorm.push(normalizeSedia(t, desc, curated));
  }

  const bdnsNorm = bdnsTopics.map(normalizeBdns);
  const saltoNorm = saltoList.map(normalizeSalto);

  const all = [...sediaNorm, ...bdnsNorm, ...saltoNorm];

  // Dedupe by call_id (shouldn't happen but defensive)
  const byId = new Map();
  for (const r of all) byId.set(r.call_id, r);
  const unique = Array.from(byId.values());

  // Sort: open first by closest deadline, then forthcoming, then closed
  const statusRank = { open: 0, forthcoming: 1, closed: 2 };
  unique.sort((a, b) => {
    const sa = statusRank[a.status] ?? 3;
    const sb = statusRank[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  const output = unique;

  if (args.pretty) {
    await fsp.writeFile(OUTPUT_JSON, JSON.stringify(output, null, 2));
  } else {
    await fsp.writeFile(OUTPUT_JSON, JSON.stringify(output));
  }

  // Stats
  const stats = {
    generatedAt: new Date().toISOString(),
    total: output.length,
    bySource: {},
    byCategory: {},
    byLevel: {},
    byStatus: {},
    byProgramme: {},
    curatedEnrichmentCount: 0,
    sumBudgetEur: 0,
    summaryEsPendingCount: 0,
  };
  for (const r of output) {
    stats.bySource[r.source] = (stats.bySource[r.source] || 0) + 1;
    stats.byCategory[r.category] = (stats.byCategory[r.category] || 0) + 1;
    stats.byLevel[r.level] = (stats.byLevel[r.level] || 0) + 1;
    stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
    stats.byProgramme[r.programme] = (stats.byProgramme[r.programme] || 0) + 1;
    if (r.curated_enrichment) stats.curatedEnrichmentCount++;
    if (r.budget_total_eur) stats.sumBudgetEur += r.budget_total_eur;
    if (r.summary_es_pending) stats.summaryEsPendingCount++;
  }

  await fsp.writeFile(OUTPUT_META, JSON.stringify(stats, null, 2));

  console.log(`[unify] wrote ${output.length} records to ${OUTPUT_JSON}`);
  console.log(`[unify] sizes: ${(JSON.stringify(output).length / 1024).toFixed(0)} KB (compact) | ${(JSON.stringify(output, null, 2).length / 1024).toFixed(0)} KB (pretty)`);

  if (args.stats || true) {
    console.log('\n=== STATS ===');
    console.log('bySource:', stats.bySource);
    console.log('byCategory:', stats.byCategory);
    console.log('byLevel:', stats.byLevel);
    console.log('byStatus:', stats.byStatus);
    console.log('top programmes:', Object.entries(stats.byProgramme).sort((a, b) => b[1] - a[1]).slice(0, 10));
    console.log(`curated_enrichment: ${stats.curatedEnrichmentCount} / ${stats.total}`);
    console.log(`summary_es pending (translation backfill): ${stats.summaryEsPendingCount}`);
    console.log(`sum_budget_eur (declared): ${stats.sumBudgetEur.toLocaleString()} €`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
