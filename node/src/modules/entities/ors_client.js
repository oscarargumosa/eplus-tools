/**
 * ORS API Client — wrapper HTTP with rate limiting and retry.
 * Spec: docs/ORS_CRAWL_SPEC.md §5
 */
const pool = require('../../utils/db');

const BASE_URL = 'https://webgate.ec.europa.eu/eac-eescp-backend';

const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'X-Lang-Param': 'en',
  'Origin': 'https://webgate.ec.europa.eu',
  'Referer': 'https://webgate.ec.europa.eu/erasmus-esc/index/organisations/search-for-an-organisation',
  'User-Agent': `Mozilla/5.0 (compatible; EUFundingStudioBot/1.0; +${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')})`,
};

const RESULT_CAP = 200;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const RATE_LIMIT_MS = 1000;

let lastRequestTime = 0;

/**
 * Enforce rate limit: minimum 1 second between requests.
 */
async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Fetch with retry and exponential backoff.
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateLimit();
    const start = Date.now();

    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60000),
      });

      const durationMs = Date.now() - start;

      if (response.ok) {
        const data = await response.json();
        return { data, httpStatus: response.status, durationMs };
      }

      // Retry on 5xx or 429
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.log(`  [ors_client] HTTP ${response.status}, retry ${attempt + 1}/${retries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable error
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    } catch (err) {
      if (err.name === 'TimeoutError' && attempt < retries) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.log(`  [ors_client] Timeout, retry ${attempt + 1}/${retries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (attempt === retries) throw err;
      // Other fetch errors — retry
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      console.log(`  [ors_client] ${err.message}, retry ${attempt + 1}/${retries} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Advanced search against ORS API.
 * @param {Object} filters - advancedSearch body fields
 * @returns {{ results: Array, cappedAtLimit: boolean, durationMs: number }}
 */
async function advancedSearch(filters) {
  const body = {
    legalName: '',
    businessName: '',
    country: '',
    city: '',
    website: '',
    pic: '',
    organisationId: '',
    registrationNumber: '',
    vatNumber: '',
    erasmusCharterForHigherEducationCode: '',
    status: '',
    ...filters,
  };

  const { data, httpStatus, durationMs } = await fetchWithRetry(
    `${BASE_URL}/ext-api/organisation-registration/advancedSearch`,
    {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    }
  );

  const results = Array.isArray(data) ? data : [];
  return {
    results,
    cappedAtLimit: results.length >= RESULT_CAP,
    durationMs,
    httpStatus,
  };
}

/**
 * Fetch country taxonomy from ORS configuration endpoint.
 * @returns {Array} country list with taxonomy IDs
 */
async function getCountries() {
  const { data } = await fetchWithRetry(
    `${BASE_URL}/configuration/countries`,
    { method: 'GET', headers: HEADERS }
  );
  return data;
}

/**
 * Health check.
 */
async function healthCheck() {
  const { data } = await fetchWithRetry(
    `${BASE_URL}/actuator/health`,
    { method: 'GET', headers: HEADERS }
  );
  return data;
}

/**
 * Log a request to ors_crawl_log.
 */
async function logRequest(countryTaxId, prefix, httpStatus, resultCount, durationMs, error) {
  await pool.execute(
    `INSERT INTO ors_crawl_log (country_tax_id, prefix, http_status, result_count, duration_ms, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [countryTaxId, prefix, httpStatus, resultCount, durationMs, error || null]
  );
}

module.exports = {
  advancedSearch,
  getCountries,
  healthCheck,
  logRequest,
  RESULT_CAP,
};
