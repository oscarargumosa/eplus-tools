#!/usr/bin/env node
/**
 * SEDIA Calls Sync — pulls EU Funding & Tenders Portal calls into data/calls/.
 *
 * Three phases (run independently or chained via `all`):
 *   fetch    POST SEDIA search API, save paginated results to data/calls/_raw/
 *   extract  Parse raw pages, write per-call dirs to data/calls/{IDENTIFIER}/
 *   docs     Download every PDF/document linked in topicConditions per call
 *
 * Usage:
 *   node scripts/sedia/sync.js                           # fetch + extract (no PDFs)
 *   node scripts/sedia/sync.js fetch
 *   node scripts/sedia/sync.js extract
 *   node scripts/sedia/sync.js docs --filter=ERASMUS,LIFE
 *   node scripts/sedia/sync.js all --with-pdfs
 *
 * Flags:
 *   --status=open,forthcoming      Status filter for fetch (default both; values: open|forthcoming|closed)
 *   --filter=ERASMUS,LIFE          Only process identifiers starting with these prefixes (extract/docs)
 *   --with-pdfs                    Include docs phase when running `all`
 *   --concurrency=5                Parallel HTTP requests for PDFs (default 5)
 *   --skip-existing                Don't re-download existing files (default true)
 *   --force                        Overwrite existing files
 *   --max=<N>                      Cap number of calls processed (testing)
 *   --dry-run                      Print plan, don't write
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RAW_DIR = path.join(REPO_ROOT, 'data', 'calls', '_raw');
const CALLS_DIR = path.join(REPO_ROOT, 'data', 'calls');
const INDEX_CSV = path.join(CALLS_DIR, '_index.csv');
const META_FILE = path.join(CALLS_DIR, '_meta.json');

const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
const STATUS_CODES = { open: '31094502', forthcoming: '31094501', closed: '31094503' };

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

// -------------------- Programme labels --------------------

const PROGRAMME_BY_PREFIX = {
  HORIZON: 'Horizon Europe',
  ERASMUS: 'Erasmus+',
  DIGITAL: 'Digital Europe',
  CEF: 'Connecting Europe Facility',
  LIFE: 'LIFE',
  CERV: 'CERV',
  SMP: 'Single Market Programme',
  EU4H: 'EU4Health',
  EU4HEALTH: 'EU4Health',
  I3: 'I3',
  CREA: 'Creative Europe',
  AMIF: 'AMIF',
  BMVI: 'BMVI',
  ISF: 'ISF',
  JUST: 'Justice',
  INNOVFUND: 'Innovation Fund',
  EDF: 'European Defence Fund',
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
  EUAF: 'EU Anti-Fraud',
  PPPA: 'Pilot Projects',
  ESC: 'European Solidarity Corps',
  JTM: 'Just Transition',
  UCPM: 'UCPM',
  SOCPL: 'EaSI / SOCPL',
};

function resolveProgramme(identifier) {
  if (!identifier) return 'Unknown';
  if (identifier.toUpperCase().startsWith('EUROPEAID')) return 'NDICI / EuropeAid';
  const prefix = identifier.split('-')[0].toUpperCase();
  return PROGRAMME_BY_PREFIX[prefix] || prefix;
}

function statusName(code) {
  return Object.entries(STATUS_CODES).find(([, c]) => c === String(code))?.[0] || String(code);
}

// -------------------- Phase 1: fetch --------------------

async function fetchSediaPage(pageNumber, statusCodes) {
  const url = `${SEDIA_URL}?apiKey=SEDIA&text=***&pageSize=100&pageNumber=${pageNumber}&sortBy=deadlineDate&sortOrder=ASC`;
  const fd = new FormData();
  fd.append(
    'query',
    new Blob(
      [
        JSON.stringify({
          bool: {
            must: [
              { terms: { type: ['1', '2'] } },
              { terms: { status: statusCodes } },
            ],
          },
        }),
      ],
      { type: 'application/json' },
    ),
  );
  fd.append('languages', new Blob(['["en"]'], { type: 'application/json' }));
  const res = await fetch(url, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`SEDIA page ${pageNumber}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function phaseFetch(args) {
  const statuses = (args.status || 'open,forthcoming').split(',').map((s) => s.trim().toLowerCase());
  const codes = statuses.map((s) => STATUS_CODES[s]).filter(Boolean);
  if (!codes.length) throw new Error(`Bad --status; use open|forthcoming|closed`);

  if (args['dry-run']) {
    console.log(`[fetch] would fetch SEDIA with statuses=${statuses.join(',')} (codes ${codes.join(',')})`);
    return;
  }

  await fsp.mkdir(RAW_DIR, { recursive: true });

  // Page 1 to learn totalResults
  console.log(`[fetch] page 1...`);
  const first = await fetchSediaPage(1, codes);
  const total = first.totalResults;
  const pageSize = first.pageSize || 100;
  const pages = Math.ceil(total / pageSize);
  console.log(`[fetch] totalResults=${total} → ${pages} pages of ${pageSize}`);

  await fsp.writeFile(path.join(RAW_DIR, 'page-1.json'), JSON.stringify(first));
  for (let p = 2; p <= pages; p++) {
    console.log(`[fetch] page ${p}/${pages}...`);
    const j = await fetchSediaPage(p, codes);
    await fsp.writeFile(path.join(RAW_DIR, `page-${p}.json`), JSON.stringify(j));
  }

  await fsp.writeFile(
    path.join(RAW_DIR, '_meta.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), totalResults: total, pages, statuses, codes }, null, 2),
  );
  console.log(`[fetch] done → ${RAW_DIR}`);
}

// -------------------- Phase 2: extract --------------------

function asString(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('');
  return String(v);
}

function firstDateOf(v) {
  const s = asString(Array.isArray(v) ? v[0] : v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseBudgetOverview(raw) {
  const s = asString(raw);
  if (!s) return null;
  let bo;
  try {
    bo = JSON.parse(s);
  } catch {
    return null;
  }
  let total = 0;
  let expectedGrants = 0;
  let minContribution = 0;
  let maxContribution = 0;
  const byYear = {};
  for (const actions of Object.values(bo.budgetTopicActionMap || {})) {
    for (const a of actions) {
      expectedGrants = Math.max(expectedGrants, a.expectedGrants || 0);
      minContribution = Math.max(minContribution, a.minContribution || 0);
      maxContribution = Math.max(maxContribution, a.maxContribution || 0);
      for (const [y, v] of Object.entries(a.budgetYearMap || {})) {
        const n = Number(v) || 0;
        byYear[y] = (byYear[y] || 0) + n;
        total += n;
      }
    }
  }
  return {
    total_eur: total || null,
    by_year: byYear,
    expected_grants: expectedGrants || null,
    min_contribution_eur: minContribution || null,
    max_contribution_eur: maxContribution || null,
  };
}

function htmlToMarkdown(html) {
  if (!html) return '';
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const root = $('#root');

  // Promote topicdescriptionkind labels into ## headers
  root.find('p.topicdescriptionkind, span.topicdescriptionkind').each((_, el) => {
    const text = $(el).text().trim().replace(/:$/, '');
    $(el).replaceWith(`\n\n## ${text}\n\n`);
  });
  // Headers
  root.find('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const level = Number(el.tagName.slice(1));
    const text = $(el).text().trim();
    $(el).replaceWith(`\n\n${'#'.repeat(Math.max(2, level))} ${text}\n\n`);
  });
  // Lists
  root.find('li').each((_, el) => {
    const text = $(el).text().trim();
    $(el).replaceWith(`\n- ${text}`);
  });
  // Paragraphs and breaks
  root.find('p').each((_, el) => {
    $(el).replaceWith(`\n\n${$(el).text()}`);
  });
  root.find('br').each((_, el) => $(el).replaceWith('\n'));
  // Bold/italic
  root.find('strong, b').each((_, el) => $(el).replaceWith(`**${$(el).text()}**`));
  root.find('em, i').each((_, el) => $(el).replaceWith(`*${$(el).text()}*`));
  // Anchors → markdown links
  root.find('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href) $(el).replaceWith(`[${text}](${href})`);
    else $(el).replaceWith(text);
  });

  let text = root.text();
  text = text.replace(/ /g, ' ');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function extractDocuments(conditionsHtml) {
  if (!conditionsHtml) return [];
  const $ = cheerio.load(`<div id="root">${conditionsHtml}</div>`);
  const docs = [];
  const seenUrls = new Set();
  let currentSection = null;
  $('#root').find('h4, a').each((_, el) => {
    if (el.tagName === 'h4') {
      currentSection = $(el).text().trim();
    } else if (el.tagName === 'a') {
      const href = $(el).attr('href');
      const label = $(el).text().trim();
      if (!href || !label) return;
      if (seenUrls.has(href)) return;
      seenUrls.add(href);
      const lower = href.toLowerCase();
      const ext = path.extname(new URL(href, 'https://ec.europa.eu/').pathname).toLowerCase();
      const isDocumentLink = ['.pdf', '.docx', '.xlsx', '.xlsm', '.doc'].includes(ext) || lower.includes('eur-lex');
      docs.push({
        section: currentSection,
        label,
        url: href,
        ext,
        is_downloadable: isDocumentLink,
      });
    }
  });
  return docs;
}

function parseRecord(rec) {
  const m = rec.metadata || {};
  const identifier = asString(m.identifier);
  const callId = asString(m.callIdentifier);
  const ccm2Id = asString(m.ccm2Id);
  const linksRaw = asString(m.links);
  let submissionUrl = null;
  let actionCode = null;
  let mgaCode = null;
  try {
    const links = JSON.parse(linksRaw);
    if (Array.isArray(links) && links[0]) {
      submissionUrl = links[0].url || null;
      actionCode = links[0].criterionCode || null;
      mgaCode = links[0].mgaCode || null;
    }
  } catch {}
  const desc = asString(m.descriptionByte);
  const cond = asString(m.topicConditions);
  return {
    identifier,
    ccm2Id,
    callIdentifier: callId,
    callTitle: asString(m.callTitle),
    title: asString(m.title),
    programme: resolveProgramme(identifier),
    programmeCode: asString(m.frameworkProgramme),
    programmePeriod: asString(m.programmePeriod),
    status: statusName(asString(m.status)),
    statusCode: asString(m.status),
    opening: firstDateOf(m.startDate),
    deadline: firstDateOf(m.deadlineDate),
    deadlineModel: asString(m.deadlineModel),
    actionType: asString(m.typesOfAction),
    actionCode,
    mgaCode,
    budget: parseBudgetOverview(m.budgetOverview),
    keywords: Array.isArray(m.keywords) ? m.keywords : [],
    crossCuttingPriorities: Array.isArray(m.crossCuttingPriorities) ? m.crossCuttingPriorities : [],
    supportInfoText: htmlToMarkdown(asString(m.supportInfo)).slice(0, 4000),
    submissionUrl,
    topicUrl: rec.url || null,
    descriptionHtml: desc,
    descriptionMarkdown: htmlToMarkdown(desc),
    conditionsHtml: cond,
    documents: extractDocuments(cond),
    rawReference: rec.REFERENCE,
    fetchedAt: new Date().toISOString(),
  };
}

function slugifyId(id) {
  // Replace filesystem-invalid chars (e.g. EuropeAid identifiers contain '/').
  return id.replace(/[\/\\:*?"<>|]/g, '_');
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function phaseExtract(args) {
  const filterPrefixes = args.filter ? String(args.filter).split(',').map((s) => s.trim().toUpperCase()) : null;
  const max = args.max ? Number(args.max) : Infinity;

  const rawFiles = (await fsp.readdir(RAW_DIR)).filter((f) => f.startsWith('page-') && f.endsWith('.json')).sort();
  if (!rawFiles.length) throw new Error(`No raw pages in ${RAW_DIR}. Run "fetch" first.`);

  const all = [];
  for (const f of rawFiles) {
    let txt = await fsp.readFile(path.join(RAW_DIR, f), 'utf8');
    if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1); // strip UTF-8 BOM
    const j = JSON.parse(txt);
    all.push(...(j.results || []));
  }

  // Deduplicate by identifier (keep entry with longest description)
  const byId = new Map();
  for (const rec of all) {
    const id = asString(rec.metadata?.identifier);
    if (!id) continue;
    if (filterPrefixes && !filterPrefixes.some((p) => id.toUpperCase().startsWith(p))) continue;
    const existing = byId.get(id);
    const descLen = asString(rec.metadata?.descriptionByte).length;
    if (!existing || descLen > existing.descLen) {
      byId.set(id, { rec, descLen });
    }
  }

  console.log(`[extract] ${all.length} raw records → ${byId.size} unique calls${filterPrefixes ? ` (filter: ${filterPrefixes.join(',')})` : ''}`);

  await fsp.mkdir(CALLS_DIR, { recursive: true });

  const indexRows = ['identifier,programme,status,opening,deadline,deadline_model,budget_total_eur,action_type,topic_url'];
  let done = 0;
  for (const [id, { rec }] of byId) {
    if (done >= max) break;
    const parsed = parseRecord(rec);
    if (args['dry-run']) {
      console.log(`[extract:dry] ${id} → ${parsed.title}`);
      done++;
      continue;
    }
    const dir = path.join(CALLS_DIR, slugifyId(id));
    await fsp.mkdir(dir, { recursive: true });
    const topicJson = { ...parsed };
    delete topicJson.descriptionHtml;
    delete topicJson.conditionsHtml;
    delete topicJson.descriptionMarkdown;
    await fsp.writeFile(path.join(dir, 'topic.json'), JSON.stringify(topicJson, null, 2));
    if (parsed.descriptionMarkdown) await fsp.writeFile(path.join(dir, 'description.md'), parsed.descriptionMarkdown);
    if (parsed.descriptionHtml) await fsp.writeFile(path.join(dir, 'description.html'), parsed.descriptionHtml);
    if (parsed.conditionsHtml) await fsp.writeFile(path.join(dir, 'conditions.html'), parsed.conditionsHtml);
    await fsp.writeFile(path.join(dir, 'documents.json'), JSON.stringify(parsed.documents, null, 2));

    indexRows.push(
      [
        parsed.identifier,
        parsed.programme,
        parsed.status,
        parsed.opening,
        parsed.deadline,
        parsed.deadlineModel,
        parsed.budget?.total_eur ?? '',
        parsed.actionType,
        parsed.topicUrl,
      ]
        .map(csvEscape)
        .join(','),
    );
    done++;
  }

  if (!args['dry-run']) {
    await fsp.writeFile(INDEX_CSV, indexRows.join('\n'));
    await fsp.writeFile(
      META_FILE,
      JSON.stringify(
        {
          extractedAt: new Date().toISOString(),
          totalCalls: byId.size,
          extracted: done,
          filter: filterPrefixes,
        },
        null,
        2,
      ),
    );
  }
  console.log(`[extract] wrote ${done} calls → ${CALLS_DIR}`);
}

// -------------------- Phase 3: docs --------------------

async function downloadFile(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destPath, buf);
  return buf.length;
}

function safeFilenameFromUrl(url, fallbackLabel) {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    if (base && base !== '/' && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  } catch {}
  return fallbackLabel.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) + '.bin';
}

async function phaseDocs(args) {
  const filterPrefixes = args.filter ? String(args.filter).split(',').map((s) => s.trim().toUpperCase()) : null;
  const max = args.max ? Number(args.max) : Infinity;
  const concurrency = Math.max(1, Number(args.concurrency) || 5);
  const force = !!args.force;

  const dirs = (await fsp.readdir(CALLS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((dirName) => !filterPrefixes || filterPrefixes.some((p) => dirName.toUpperCase().startsWith(p)));

  console.log(`[docs] ${dirs.length} calls to scan${filterPrefixes ? ` (filter: ${filterPrefixes.join(',')})` : ''}`);

  let processed = 0;
  let downloaded = 0;
  let skipped = 0;
  let errored = 0;
  for (const id of dirs) {
    if (processed >= max) break;
    const docsPath = path.join(CALLS_DIR, id, 'documents.json');
    if (!fs.existsSync(docsPath)) continue;
    const docs = JSON.parse(await fsp.readFile(docsPath, 'utf8'));
    const downloadable = docs.filter((d) => d.is_downloadable);
    if (!downloadable.length) {
      processed++;
      continue;
    }
    const targetDir = path.join(CALLS_DIR, id, 'documents');
    if (!args['dry-run']) await fsp.mkdir(targetDir, { recursive: true });

    // Process docs in parallel batches
    for (let i = 0; i < downloadable.length; i += concurrency) {
      const batch = downloadable.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (doc) => {
          const filename = safeFilenameFromUrl(doc.url, doc.label);
          const target = path.join(targetDir, filename);
          if (!force && fs.existsSync(target)) {
            skipped++;
            return;
          }
          if (args['dry-run']) {
            console.log(`[docs:dry] ${id}  ${doc.label} → ${filename}`);
            return;
          }
          try {
            const bytes = await downloadFile(doc.url, target);
            console.log(`[docs] ${id}  ${filename}  ${(bytes / 1024).toFixed(0)}KB`);
            downloaded++;
          } catch (err) {
            console.error(`[docs:err] ${id}  ${doc.label}  ${doc.url}: ${err.message}`);
            errored++;
          }
        }),
      );
    }
    processed++;
  }
  console.log(`[docs] processed=${processed}  downloaded=${downloaded}  skipped=${skipped}  errored=${errored}`);
}

// -------------------- Main --------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'all';

  if (!['fetch', 'extract', 'docs', 'all'].includes(cmd)) {
    console.error(`Unknown command: ${cmd}\nUse: fetch | extract | docs | all`);
    process.exit(1);
  }

  if (cmd === 'fetch' || cmd === 'all') await phaseFetch(args);
  if (cmd === 'extract' || cmd === 'all') await phaseExtract(args);
  if (cmd === 'docs' || (cmd === 'all' && args['with-pdfs'])) await phaseDocs(args);

  console.log(`[sync] ${cmd} complete`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
