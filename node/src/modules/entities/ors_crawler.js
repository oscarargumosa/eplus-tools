/**
 * ORS Crawler — iterative deepening with checkpoint/resume.
 * Spec: docs/ORS_CRAWL_SPEC.md §4
 */
const pool = require('../../utils/db');
const ors = require('./ors_client');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const MIN_PREFIX_LENGTH = 2; // ORS API returns 500 for single-char prefixes
const GLOBAL_TAX_ID = 'ALL'; // marker for the single global sweep (ORS API ignores the country filter)

// Validity type mapping (verified against webgate.ec.europa.eu portal, 2026-04-29)
const VALIDITY_MAP = {
  '42284356': 'na_certified',             // NA Certified — only fully validated state
  '42284353': 'waiting_na_certification', // Waiting for NA Certification — docs submitted, in review
  '42284359': 'waiting_confirmation',     // Waiting for Confirmation (declared, no docs yet)
  '42284365': 'registered',               // Registered (just signed up, identical to declared in practice)
  '42284362': 'invalidated',              // Invalidated — cannot apply for projects
};

// Status bucket for UI (4 buckets, see docs/STATUS_BUCKETS.md)
const STATUS_BUCKET_MAP = {
  na_certified: 'certified',
  waiting_na_certification: 'in_review',
  waiting_confirmation: 'declared',
  registered: 'declared',
  invalidated: 'invalid',
};

function getStatusBucket(label) {
  return STATUS_BUCKET_MAP[label] || null;
}

function isCertified(label) {
  return label === 'na_certified';
}

function canApply(label) {
  return label != null && label !== 'invalidated';
}

/**
 * Resolve ISO country code from taxonomy ID using cached country list.
 * @param {Array} countries - from ors.getCountries()
 * @param {string} taxId
 * @returns {string|null} ISO 2-letter code
 */
function resolveCountryISO(countries, taxId) {
  if (!taxId || !countries) return null;
  const entry = countries[taxId];
  return entry ? (entry.code || null) : null;
}

/**
 * Build ISO lookup map from country taxonomy.
 * ORS returns an object with taxId keys, each value has { id, code, ... }
 * @param {Object} countries - raw response from GET /configuration/countries
 * @returns {Map<string, string>} taxId -> ISO code
 */
function buildCountryMap(countries) {
  const map = new Map();
  const entries = Array.isArray(countries) ? countries : Object.values(countries);
  for (const c of entries) {
    if (c.id && c.code) {
      map.set(String(c.id), c.code);
    }
  }
  return map;
}

/**
 * Build reverse lookup: ISO -> taxonomy ID.
 * @param {Object} countries - raw response from GET /configuration/countries
 * @returns {Map<string, string>} ISO code -> taxId
 */
function buildISOToTaxMap(countries) {
  const map = new Map();
  const entries = Array.isArray(countries) ? countries : Object.values(countries);
  for (const c of entries) {
    if (c.id && c.code) {
      map.set(c.code.toUpperCase(), String(c.id));
    }
  }
  return map;
}

/**
 * Upsert a single entity from ORS API response into the DB.
 * Country is taken from raw.country (taxId) and resolved to ISO via taxToISO map.
 * The ORS API ignores the `country` filter in the request body, so we always
 * trust the `country` field of the response, not the filter we sent.
 */
async function upsertEntity(raw, taxToISO) {
  const oid = (raw.organisationId || '').trim();
  if (!oid) return;

  const legalName = (raw.legalName || '').trim();
  if (!legalName) return;

  const rawTaxId = (raw.country || '').toString().trim() || null;
  const countryISO = rawTaxId && taxToISO ? (taxToISO.get(rawTaxId) || null) : null;

  const validityLabel = VALIDITY_MAP[raw.validityType] || (raw.validityType ? 'unknown' : null);
  const statusBucket = getStatusBucket(validityLabel);
  const certified = isCertified(validityLabel);
  const applies = canApply(validityLabel);

  await pool.execute(
    `INSERT INTO entities (oid, pic, legal_name, business_name, country_code, country_tax_id,
       city, website, website_show, vat, registration_no, validity_type, validity_label,
       status_bucket, is_certified, can_apply, go_to_link, source, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ors_api', ?)
     ON DUPLICATE KEY UPDATE
       pic = VALUES(pic),
       legal_name = VALUES(legal_name),
       business_name = VALUES(business_name),
       country_code = VALUES(country_code),
       country_tax_id = VALUES(country_tax_id),
       city = VALUES(city),
       website = VALUES(website),
       website_show = VALUES(website_show),
       vat = VALUES(vat),
       registration_no = VALUES(registration_no),
       validity_type = VALUES(validity_type),
       validity_label = VALUES(validity_label),
       status_bucket = VALUES(status_bucket),
       is_certified = VALUES(is_certified),
       can_apply = VALUES(can_apply),
       go_to_link = VALUES(go_to_link),
       raw_json = VALUES(raw_json),
       last_seen_at = NOW()`,
    [
      oid,
      (raw.pic || '').trim() || null,
      legalName,
      (raw.businessName || '').trim() || null,
      countryISO,
      rawTaxId,
      (raw.city || '').trim() || null,
      (raw.website || '').trim() || null,
      (raw.websiteShow || '').trim() || null,
      (raw.vat || '').trim() || null,
      (raw.registration || '').trim() || null,
      (raw.validityType || '').trim() || null,
      validityLabel,
      statusBucket,
      certified ? 1 : 0,
      applies ? 1 : 0,
      (raw.goTolink || '').trim() || null,
      JSON.stringify(raw),
    ]
  );
}

/**
 * Check if a prefix has reached a terminal state (done, capped, error).
 * Errors are terminal to avoid the PM2 restart loop on HTTP 500 prefixes;
 * to retry them, use scripts/retry_errors.js which expands errors to children.
 */
async function isPrefixTerminal(countryTaxId, prefix) {
  const [rows] = await pool.execute(
    `SELECT status FROM ors_crawl_state WHERE country_tax_id = ? AND prefix = ?`,
    [countryTaxId, prefix]
  );
  return rows.length > 0 && ['done', 'capped', 'error'].includes(rows[0].status);
}

/**
 * Mark a prefix as in_progress.
 */
async function markInProgress(countryTaxId, prefix) {
  await pool.execute(
    `INSERT INTO ors_crawl_state (country_tax_id, prefix, status, started_at)
     VALUES (?, ?, 'in_progress', NOW())
     ON DUPLICATE KEY UPDATE status = 'in_progress', started_at = NOW(), error_message = NULL`,
    [countryTaxId, prefix]
  );
}

/**
 * Mark a prefix as done with result count.
 */
async function markDone(countryTaxId, prefix, resultCount) {
  await pool.execute(
    `UPDATE ors_crawl_state SET status = 'done', result_count = ?, finished_at = NOW()
     WHERE country_tax_id = ? AND prefix = ?`,
    [resultCount, countryTaxId, prefix]
  );
}

/**
 * Mark a prefix as capped (200 results, needs deepening).
 */
async function markCapped(countryTaxId, prefix, resultCount) {
  await pool.execute(
    `UPDATE ors_crawl_state SET status = 'capped', result_count = ?, finished_at = NOW()
     WHERE country_tax_id = ? AND prefix = ?`,
    [resultCount, countryTaxId, prefix]
  );
}

/**
 * Mark a prefix as error.
 */
async function markError(countryTaxId, prefix, errorMessage) {
  await pool.execute(
    `UPDATE ors_crawl_state SET status = 'error', error_message = ?, finished_at = NOW()
     WHERE country_tax_id = ? AND prefix = ?`,
    [errorMessage.slice(0, 500), countryTaxId, prefix]
  );
}

/**
 * Global ORS crawl: one single sweep by legalName prefix (aa, ab, ..., 99),
 * expanding deeper prefixes (aaa, aab, ...) when the 200-result cap is hit.
 *
 * Country filtering is done on the response side (raw.country) because the ORS
 * advancedSearch endpoint silently ignores the `country` field in the body.
 *
 * State is tracked in ors_crawl_state with country_tax_id = 'ALL'.
 *
 * @param {Map<string,string>} taxToISO - taxId -> ISO map (from buildCountryMap)
 * @param {Object} options - { dryRun, maxPrefixes, onProgress, saturationThreshold }
 */
async function crawlGlobal(taxToISO, options = {}) {
  const { dryRun = false, maxPrefixes = Infinity, onProgress = null, saturationThreshold = 5 } = options;
  const stateKey = GLOBAL_TAX_ID;

  const queued = new Set();
  const queue = [];
  const enqueue = (p) => { if (!queued.has(p)) { queued.add(p); queue.push(p); } };
  for (const a of ALPHABET) {
    for (const b of ALPHABET) {
      enqueue(a + b);
    }
  }

  // Resume-safe: rehydrate children of previously capped prefixes (lost on process kill)
  const [cappedRows] = await pool.execute(
    `SELECT prefix FROM ors_crawl_state WHERE country_tax_id = ? AND status = 'capped'`,
    [stateKey]
  );
  for (const { prefix } of cappedRows) {
    for (const letter of ALPHABET) enqueue(prefix + letter);
  }

  // Also rehydrate pending longer prefixes (from a previously interrupted run)
  const [pendingRows] = await pool.execute(
    `SELECT prefix FROM ors_crawl_state WHERE country_tax_id = ? AND status IN ('pending','in_progress') AND CHAR_LENGTH(prefix) > 2`,
    [stateKey]
  );
  for (const { prefix } of pendingRows) enqueue(prefix);

  console.log(`[crawler] Queue primed: ${queue.length} prefixes (incl. ${cappedRows.length} capped → children, ${pendingRows.length} pending)`);

  let processedCount = 0;
  let totalEntities = 0;
  let cappedPrefixes = 0;
  let saturatedSkipped = 0;

  console.log(`[crawler] Starting GLOBAL crawl (taxId filter disabled; country resolved from response)`);
  if (dryRun) console.log('[crawler] DRY RUN mode — limited prefixes');

  while (queue.length > 0) {
    if (processedCount >= maxPrefixes) {
      console.log(`[crawler] Max prefixes (${maxPrefixes}) reached, stopping.`);
      break;
    }

    const prefix = queue.shift();

    if (await isPrefixTerminal(stateKey, prefix)) {
      continue;
    }

    await markInProgress(stateKey, prefix);

    try {
      // Do NOT send `country`: the ORS API ignores it and returns the global pool anyway.
      const { results, cappedAtLimit, durationMs, httpStatus } = await ors.advancedSearch({
        legalName: prefix,
      });

      await ors.logRequest(stateKey, prefix, httpStatus, results.length, durationMs, null);

      // Novelty check BEFORE upsert — unique OIDs not yet in DB
      let newOids = 0;
      const oids = results.map(r => (r.organisationId || '').trim()).filter(Boolean);
      if (oids.length > 0) {
        const placeholders = oids.map(() => '?').join(',');
        const [existing] = await pool.execute(
          `SELECT oid FROM entities WHERE oid IN (${placeholders})`, oids
        );
        newOids = oids.length - existing.length;
      }

      // Upsert all entities — each one tagged with its real country from raw.country
      for (const r of results) {
        await upsertEntity(r, taxToISO);
      }
      totalEntities += results.length;

      if (cappedAtLimit) {
        if (newOids < saturationThreshold) {
          await markDone(stateKey, prefix, results.length);
          saturatedSkipped++;
          console.log(`  [${prefix}] 200 results, only ${newOids} new → SATURATED, not expanding, ${durationMs}ms`);
        } else {
          for (const letter of ALPHABET) enqueue(prefix + letter);
          await markCapped(stateKey, prefix, results.length);
          cappedPrefixes++;
          console.log(`  [${prefix}] 200 results, ${newOids} new (CAPPED) — expanding, ${durationMs}ms`);
        }
      } else {
        await markDone(stateKey, prefix, results.length);
        console.log(`  [${prefix}] ${results.length} results (${newOids} new), ${durationMs}ms`);
      }

      processedCount++;

      if (onProgress) {
        try {
          await onProgress({ processedCount, totalEntities, cappedPrefixes, saturatedSkipped, queueLength: queue.length });
        } catch (_) { /* don't let report errors stop the crawl */ }
      }
    } catch (err) {
      console.error(`  [${prefix}] ERROR: ${err.message}`);
      await markError(stateKey, prefix, err.message);
      await ors.logRequest(stateKey, prefix, null, null, null, err.message);
      processedCount++;
    }
  }

  console.log(`[crawler] Done: ${processedCount} prefixes processed, ${totalEntities} entities upserted, ${cappedPrefixes} capped, ${saturatedSkipped} saturated-skipped`);
  return { processedCount, totalEntities, cappedPrefixes, saturatedSkipped, remaining: queue.length };
}

/**
 * Get crawl progress for a country.
 */
async function getProgress(countryTaxId) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_prefixes,
       SUM(status='done') AS done,
       SUM(status='capped') AS capped,
       SUM(status='in_progress') AS in_progress,
       SUM(status='error') AS errors,
       SUM(status='pending') AS pending
     FROM ors_crawl_state
     WHERE country_tax_id = ?`,
    [countryTaxId]
  );
  return rows[0];
}

module.exports = {
  crawlGlobal,
  getProgress,
  buildCountryMap,
  buildISOToTaxMap,
  upsertEntity,
  GLOBAL_TAX_ID,
  VALIDITY_MAP,
  STATUS_BUCKET_MAP,
  getStatusBucket,
  isCertified,
  canApply,
};
