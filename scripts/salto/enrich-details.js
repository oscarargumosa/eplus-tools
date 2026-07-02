#!/usr/bin/env node
/**
 * Enriquece data/salto/trainings.json fetcheando cada ficha de detalle
 * (/training/<slug>.<id>/) — URL permitida por robots.txt.
 *
 * Añade campos: application_url, selection_date, short_url, participants_count,
 * working_languages, organiser_name, organiser_type, contact_name,
 * contact_email, contact_phone, fee_type, fee_amount_eur, fee_text,
 * accommodation_food_text, travel_reimbursement_text, description_text,
 * enriched_at.
 *
 * Uso:
 *   node scripts/salto/enrich-details.js
 *   node scripts/salto/enrich-details.js --limit=5     # solo primeras 5
 *   node scripts/salto/enrich-details.js --only=14607  # una sola
 *
 * Nota GDPR: contact_email se decodifica del JS ofuscado de SALTO. Mantener
 * de uso interno · NO exponer en frontend público sin consentimiento.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { classifyFee } = require('./_classify-fee');

const USER_AGENT = 'EUFundingSchool-NewsBot/0.1 (+https://eufundingschool.com; contact: oscar@eufundingschool.com)';
const REQUEST_DELAY_MS = 800;
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'salto');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    args[k] = v === undefined ? true : v;
  }
  return args;
}

function decodeObfuscatedEmail(scriptHtml) {
  // SALTO usa: eval(unescape('%64%6f...')) que ejecuta document.write("<a ...>EMAIL</a>")
  if (!scriptHtml) return null;
  // SALTO inserta /* random hash */ entre unescape y (, así que aceptamos cualquier cosa.
  const m = scriptHtml.match(/unescape[\s\S]*?'([^']+)'/);
  if (!m) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const e = decoded.match(/mailto:([^"\\]+)/);
  return e ? e[1].trim() : null;
}

function extractDetail(html, sourceUrl) {
  const $ = cheerio.load(html);

  const $apply = $('a.callforaction[href*="application-procedure"]').first();
  const application_url = ($apply.attr('href') || '').trim() || null;

  let selection_date = null;
  $apply.find('.call-addendum').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    const m = t.match(/Date of selection:\s*(.+)$/i);
    if (m) selection_date = m[1].trim();
  });

  const short_url = $('.short-url').first().text().trim() || null;

  // Aside: "for X participants"
  let participants_count = null;
  $('.aside p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    const m = t.match(/^for\s+(\d+)\s+participants?/i);
    if (m && participants_count === null) participants_count = parseInt(m[1], 10);
  });

  // Working language(s)
  let working_languages = null;
  $('.aside p.microcopy.microcopy-light').each((_, el) => {
    const label = $(el).text().replace(/\s+/g, ' ').trim();
    if (/working language/i.test(label)) {
      const $next = $(el).next('p.tightened-bodycopy');
      if ($next.length) working_languages = $next.text().replace(/\s+/g, ' ').trim();
    }
  });

  // Organiser name + type
  let organiser_name = null;
  let organiser_type = null;
  $('.aside span.microcopy.microcopy-light').each((_, el) => {
    if (/organiser:/i.test($(el).text())) {
      const $block = $(el).parent();
      const orgText = $block.find('p').first().text().replace(/\s+/g, ' ').trim();
      const m = orgText.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (m) {
        organiser_name = m[1].trim();
        organiser_type = m[2].trim();
      } else {
        organiser_name = orgText || null;
      }
    }
  });

  // Contact
  const $contact = $('.tool-item-contact-info').first();
  const contact_name = $contact.find('p.h5').first().text().replace(/\s+/g, ' ').trim() || null;
  const emailScript = $contact.find('script').first().html();
  const contact_email = decodeObfuscatedEmail(emailScript);
  let contact_phone = null;
  $contact.find('p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    const m = t.match(/Phone:\s*(.+)$/i);
    if (m) contact_phone = m[1].trim();
  });

  // Costs section
  let fee_text = null;
  let accommodation_food_text = null;
  let travel_reimbursement_text = null;
  $('.aside h4').each((_, el) => {
    const label = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
    const $body = $(el).next('.wysiwyg');
    const body = $body.length ? $body.text().replace(/\s+/g, ' ').trim() : null;
    if (label.includes('participation fee')) fee_text = body;
    else if (label.includes('accommodation')) accommodation_food_text = body;
    else if (label.includes('travel')) travel_reimbursement_text = body;
  });

  // Long description
  const description_text = $('.training-description').first().text().replace(/\s+/g, ' ').trim() || null;

  // Venue: "<dates> | <venue>" en la cabecera
  let venue_text = null;
  const $cat = $('.tool-item-category-container').first();
  if ($cat.length) {
    const ps = $cat.find('p');
    if (ps.length >= 2) {
      const second = $(ps[1]).text().replace(/\s+/g, ' ').trim();
      const m = second.match(/\|\s*(.+)$/);
      if (m) venue_text = m[1].trim();
    }
  }

  const { fee_type, fee_amount_eur } = classifyFee(fee_text);

  return {
    application_url,
    selection_date,
    short_url,
    participants_count,
    working_languages,
    organiser_name,
    organiser_type,
    contact_name,
    contact_email,
    contact_phone,
    fee_type,
    fee_amount_eur,
    fee_text,
    accommodation_food_text,
    travel_reimbursement_text,
    venue_text,
    description_text: description_text ? description_text.slice(0, 2000) : null,
    description_truncated: description_text && description_text.length > 2000,
    enriched_at: new Date().toISOString(),
    source_url: sourceUrl,
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.text();
}

async function main() {
  const args = parseArgs();
  const limit = args['limit'] ? parseInt(args['limit'], 10) : Infinity;
  const onlyId = args['only'] ? parseInt(args['only'], 10) : null;

  const inputPath = path.join(OUT_DIR, 'trainings.json');
  if (!fs.existsSync(inputPath)) {
    console.error(`[enrich] missing ${inputPath} · run scrape-salto.js first`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const items = data.items;
  console.log(`[enrich] loaded ${items.length} items from trainings.json`);

  let target = items;
  if (onlyId) target = items.filter((i) => i.salto_id === onlyId);
  target = target.slice(0, limit);

  console.log(`[enrich] enriching ${target.length} items`);

  let processed = 0;
  let failed = 0;
  for (const item of target) {
    try {
      const html = await fetchHtml(item.url);
      const detail = extractDetail(html, item.url);
      Object.assign(item, detail);
      processed += 1;
      if (processed % 5 === 0) {
        console.log(`[enrich] ${processed}/${target.length} · last: ${item.salto_id} ${item.fee_type}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[enrich] FAILED ${item.salto_id} ${item.url}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  data.enriched_at = new Date().toISOString();
  data.enriched_count = processed;

  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
  console.log(`[enrich] done · processed=${processed} · failed=${failed} · written to trainings.json`);

  // Stats
  const byFee = {};
  for (const i of items) byFee[i.fee_type || 'not_enriched'] = (byFee[i.fee_type || 'not_enriched'] || 0) + 1;
  console.log('[enrich] fee distribution:');
  for (const [k, v] of Object.entries(byFee).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)}${v}`);
}

main().catch((err) => {
  console.error('[enrich] FATAL:', err);
  process.exit(1);
});
