#!/usr/bin/env node
/**
 * SALTO European Training Calendar — listing scraper.
 *
 * Uso:
 *   node scripts/salto/scrape-salto.js                # paginación completa, escribe data/salto/
 *   node scripts/salto/scrape-salto.js --max-pages=2  # debug
 *   node scripts/salto/scrape-salto.js --no-write     # solo log, sin tocar disco
 *   node scripts/salto/scrape-salto.js --json-only    # no genera CSV
 *
 * Output:
 *   data/salto/trainings.json            (último snapshot, sobreescrito)
 *   data/salto/trainings.csv             (último snapshot, sobreescrito)
 *   data/salto/snapshots/YYYY-MM-DD.json (histórico append-only)
 *
 * El listado contiene: tipo, título, URL, fechas, lugar, resumen breve,
 * deadline aplicación, países participantes elegibles. Para fee/idioma/
 * organizador hace falta pasar a modo --enrich (futuro, no incluido aquí).
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.salto-youth.net/tools/european-training-calendar/browse/';
const PAGE_SIZE = 10;
const USER_AGENT = 'EUFundingSchool-NewsBot/0.1 (+https://eufundingschool.com; contact: oscar@eufundingschool.com)';
const REQUEST_DELAY_MS = 800;
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'salto');
const SNAPSHOT_DIR = path.join(OUT_DIR, 'snapshots');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    args[k] = v === undefined ? true : v;
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(offset) {
  const url = offset === 0 ? BASE_URL : `${BASE_URL}?b_offset=${offset}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.text();
}

function extractTotal($) {
  // Ej: "We found 77 training offers matching your search!"
  const text = $('body').text();
  const m = text.match(/We found\s+(\d+)\s+training offers/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseDeadline(rawText) {
  if (!rawText) return null;
  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  // Ej: "6 May 2026"
  const m = cleaned.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return cleaned || null;
  const months = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const month = months[m[2].toLowerCase()];
  if (!month) return cleaned;
  return `${m[3]}-${month}-${String(m[1]).padStart(2, '0')}`;
}

function parseLocation(rawText) {
  if (!rawText) return { city: null, country: null, raw: null };
  const raw = rawText.trim();
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, country: null, raw };
  if (parts.length === 1) return { city: null, country: parts[0], raw };
  return { city: parts.slice(0, -1).join(', '), country: parts[parts.length - 1], raw };
}

function extractIdAndSlug(url) {
  // .../training/<slug>.<id>/
  const m = url.match(/\/training\/([^/]+?)\.(\d+)\/?$/);
  if (!m) return { slug: null, salto_id: null };
  return { slug: m[1], salto_id: parseInt(m[2], 10) };
}

function parseListingHtml(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('li.result-container').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('h2.tool-item-name a').first();
    const url = ($a.attr('href') || '').trim();
    const title = $a.text().replace(/\s+/g, ' ').trim();
    if (!url || !title) return;

    const { slug, salto_id } = extractIdAndSlug(url);
    const type = $el.find('.tool-item-category').first().text().trim();
    const dates = $el.find('.tool-item-description > p.h5').first().text().replace(/\s+/g, ' ').trim();
    const locationRaw = $el.find('.tool-item-description > p.microcopy').first().text().trim();
    const location = parseLocation(locationRaw);
    const summary = $el.find('.tool-item-description > p.mrgn-btm-22.h5').first().text().replace(/\s+/g, ' ').trim();

    // Deadline puede no existir
    let deadline_raw = null;
    let deadline = null;
    const $deadlineBlock = $el.find('.callout-module').first();
    if ($deadlineBlock.length) {
      const blockText = $deadlineBlock.text().replace(/\s+/g, ' ').trim();
      // Buscar fecha tras "deadline"
      const m = blockText.match(/deadline[^:]*:\s*(.+)$/i);
      deadline_raw = m ? m[1].trim() : blockText;
      deadline = parseDeadline(deadline_raw);
    }

    const participantsCountries = $el
      .find('.tool-item-short-overview p.tightened-bodycopy')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim() || null;

    items.push({
      salto_id,
      slug,
      type,
      title,
      url,
      dates,
      location_raw: location.raw,
      city: location.city,
      country: location.country,
      summary: summary || null,
      deadline_raw,
      deadline_iso: deadline,
      participants_countries: participantsCountries,
    });
  });

  return { total: extractTotal($), items };
}

function toCsv(rows) {
  const cols = [
    'salto_id', 'type', 'title', 'dates', 'city', 'country',
    'deadline_iso', 'deadline_raw', 'participants_countries',
    'summary', 'url',
  ];
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

async function main() {
  const args = parseArgs();
  const maxPages = args['max-pages'] ? parseInt(args['max-pages'], 10) : 20;
  const noWrite = !!args['no-write'];
  const jsonOnly = !!args['json-only'];

  console.log(`[salto] start · UA="${USER_AGENT}"`);

  // Página 1 nos da el total + primeros 10
  let allItems = [];
  let total = null;
  let pagesFetched = 0;

  for (let offset = 0; offset < maxPages * PAGE_SIZE; offset += PAGE_SIZE) {
    const html = await fetchPage(offset);
    const { total: t, items } = parseListingHtml(html);
    pagesFetched += 1;
    if (total === null && t !== null) {
      total = t;
      console.log(`[salto] page reports total=${total}`);
    }
    if (items.length === 0) {
      console.log(`[salto] offset=${offset}: 0 items, stop`);
      break;
    }
    console.log(`[salto] offset=${offset}: ${items.length} items`);
    allItems = allItems.concat(items);
    if (total !== null && allItems.length >= total) break;
    await sleep(REQUEST_DELAY_MS);
  }

  // Dedupe por salto_id (por si hay solapamiento entre páginas)
  const byId = new Map();
  for (const it of allItems) {
    if (it.salto_id == null) continue;
    if (!byId.has(it.salto_id)) byId.set(it.salto_id, it);
  }
  const items = Array.from(byId.values());

  console.log(`[salto] done · pages=${pagesFetched} · unique=${items.length} · expected=${total ?? '?'}`);

  if (noWrite) {
    console.log(JSON.stringify(items.slice(0, 3), null, 2));
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const snapshot = {
    fetched_at: new Date().toISOString(),
    source: BASE_URL,
    expected_total: total,
    actual_count: items.length,
    items,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'trainings.json'), JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(path.join(SNAPSHOT_DIR, `${today}.json`), JSON.stringify(snapshot, null, 2));
  console.log(`[salto] wrote data/salto/trainings.json`);
  console.log(`[salto] wrote data/salto/snapshots/${today}.json`);

  if (!jsonOnly) {
    fs.writeFileSync(path.join(OUT_DIR, 'trainings.csv'), toCsv(items));
    console.log(`[salto] wrote data/salto/trainings.csv`);
  }
}

main().catch((err) => {
  console.error('[salto] FAILED:', err);
  process.exit(1);
});
