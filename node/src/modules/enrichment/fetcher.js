/**
 * fetcher.js — HTTP(S) fetcher for the entity enrichment crawler.
 *
 * Responsibilities:
 *   - Honest User-Agent (identifies the bot, provides a contact/info URL)
 *   - Timeout per request (default 20s)
 *   - Follow redirects and capture the chain
 *   - Tolerate invalid/expired TLS certs (warn, continue) — many .tr, .gov.*
 *     and small-school domains have broken certs
 *   - Categorize every failure into a stable error_type for the DB
 *   - Limit response size (default 2 MB) to survive adversarial payloads
 *
 * Returns an object shaped as:
 *   {
 *     ok: true,
 *     final_url, http_status_final, redirect_chain, ssl_valid,
 *     content_type, html, fetched_at
 *   }
 *   or
 *   {
 *     ok: false,
 *     error_type, error_message, http_status_final?, redirect_chain?
 *   }
 */

const https = require('node:https');
const http = require('node:http');

/**
 * Decode an HTML response body, picking the charset from (in order):
 *   1. Content-Type header (charset=...)
 *   2. <meta charset=...> in first 2 KB
 *   3. <meta http-equiv="Content-Type" content="text/html; charset=...">
 *   4. Default to utf-8.
 *
 * Uses Node's built-in TextDecoder which supports most legacy single-byte
 * encodings (windows-1250/1252, iso-8859-*, etc.) without adding a dep.
 */
function decodeHtmlBody(bodyBuf, contentTypeHeader) {
  if (!Buffer.isBuffer(bodyBuf)) return String(bodyBuf || '');
  let cs = null;
  if (contentTypeHeader) {
    const m = /charset\s*=\s*["']?([\w\-]+)["']?/i.exec(contentTypeHeader);
    if (m) cs = m[1].toLowerCase();
  }
  if (!cs) {
    // Probe the first 2 KB as utf-8 to read any <meta charset>.
    const head = bodyBuf.slice(0, 2048).toString('latin1');
    const m1 = /<meta\s+charset\s*=\s*["']?([\w\-]+)/i.exec(head);
    if (m1) cs = m1[1].toLowerCase();
    else {
      const m2 = /<meta\s+http-equiv\s*=\s*["']?content-type["']?\s+content\s*=\s*["']?[^"']*charset=([\w\-]+)/i.exec(head);
      if (m2) cs = m2[1].toLowerCase();
    }
  }
  if (!cs) cs = 'utf-8';
  try {
    return new TextDecoder(cs, { fatal: false }).decode(bodyBuf);
  } catch {
    // Unknown charset label — fall back to utf-8.
    return new TextDecoder('utf-8', { fatal: false }).decode(bodyBuf);
  }
}

const DEFAULT_UA = `Mozilla/5.0 (compatible; EUFundingStudioBot/1.0; +${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')})`;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 5;

/**
 * Fetch a URL, following redirects, with TLS-tolerant mode.
 */
async function fetchPage(inputUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = opts.userAgent ?? DEFAULT_UA;
  const chain = [];
  let currentUrl = inputUrl;
  let sslValid = true;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await singleRequest(currentUrl, { timeoutMs, userAgent });
    } catch (err) {
      return mapNetworkError(err, chain);
    }

    // Track TLS validity for the chain — if any hop had an invalid cert we flag it.
    if (res.sslValid === false) sslValid = false;

    // Redirect?
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      chain.push({ url: currentUrl, status: res.statusCode, location: res.headers.location });
      if (hop === MAX_REDIRECTS) {
        return {
          ok: false,
          error_type: 'too_many_redirects',
          error_message: `Redirect limit ${MAX_REDIRECTS} exceeded`,
          redirect_chain: chain,
        };
      }
      try {
        currentUrl = new URL(res.headers.location, currentUrl).toString();
      } catch {
        return {
          ok: false,
          error_type: 'invalid_redirect_target',
          error_message: `Bad Location header: ${res.headers.location}`,
          redirect_chain: chain,
        };
      }
      continue;
    }

    // Terminal response. Classify.
    if (res.statusCode === 403) {
      return {
        ok: false,
        error_type: 'http_403',
        error_message: 'Access forbidden — likely bot blocking',
        http_status_final: 403,
        redirect_chain: chain,
        final_url: currentUrl,
      };
    }
    if (res.statusCode === 404) {
      return {
        ok: false,
        error_type: 'http_404',
        error_message: 'Page not found',
        http_status_final: 404,
        redirect_chain: chain,
        final_url: currentUrl,
      };
    }
    if (res.statusCode >= 500) {
      return {
        ok: false,
        error_type: 'http_5xx',
        error_message: `Server error ${res.statusCode}`,
        http_status_final: res.statusCode,
        redirect_chain: chain,
        final_url: currentUrl,
      };
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return {
        ok: false,
        error_type: 'http_other',
        error_message: `Unexpected status ${res.statusCode}`,
        http_status_final: res.statusCode,
        redirect_chain: chain,
        final_url: currentUrl,
      };
    }

    // Known MEB "dead DNS" page — treated as error, not success.
    // Example: torbali7eylulal.meb.k12.tr → /HataliDns.php?DNS=...
    if (/\/HataliDns\.php/i.test(currentUrl)) {
      return {
        ok: false,
        error_type: 'redirect_to_error_page',
        error_message: 'Redirected to MEB dead-DNS page',
        http_status_final: res.statusCode,
        redirect_chain: chain,
        final_url: currentUrl,
      };
    }

    const html = decodeHtmlBody(res.body, res.headers['content-type']);
    if (!html || html.trim().length < 50) {
      return {
        ok: false,
        error_type: 'empty_content',
        error_message: `Response too short (${html?.length ?? 0} bytes)`,
        http_status_final: res.statusCode,
        redirect_chain: chain,
        final_url: currentUrl,
      };
    }

    return {
      ok: true,
      final_url: currentUrl,
      http_status_final: res.statusCode,
      redirect_chain: chain,
      ssl_valid: sslValid,
      content_type: res.headers['content-type'] || null,
      html,
      fetched_at: new Date().toISOString(),
    };
  }

  // Should not reach here.
  return { ok: false, error_type: 'unknown', error_message: 'Unreachable', redirect_chain: chain };
}

/**
 * Perform a single HTTP(S) request without following redirects.
 * Two-pass: first try strict TLS; on cert error retry with TLS disabled and
 * flag sslValid=false.
 */
function singleRequest(urlStr, { timeoutMs, userAgent }) {
  return new Promise((resolve, reject) => {
    const doRequest = (rejectUnauthorized) => {
      let u;
      try { u = new URL(urlStr); } catch (e) { return reject(e); }
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          method: 'GET',
          host: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: (u.pathname || '/') + (u.search || ''),
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en,es;q=0.8,*;q=0.5',
            'Accept-Encoding': 'identity', // no gzip — keep it simple
            'Connection': 'close',
          },
          rejectUnauthorized,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          let total = 0;
          let aborted = false;
          res.on('data', (c) => {
            if (aborted) return;
            total += c.length;
            if (total > MAX_BYTES) {
              aborted = true;
              res.destroy();
              return resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).slice(0, MAX_BYTES),
                sslValid: rejectUnauthorized,
              });
            }
            chunks.push(c);
          });
          res.on('end', () => {
            if (!aborted) {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks),
                sslValid: rejectUnauthorized,
              });
            }
          });
          res.on('error', reject);
        },
      );
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });
      req.on('error', (err) => {
        // Retry once with TLS disabled if this is a cert problem.
        if (
          rejectUnauthorized &&
          (err.code === 'CERT_HAS_EXPIRED' ||
            err.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
            err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
            err.code === 'SELF_SIGNED_CERT_IN_CHAIN')
        ) {
          return doRequest(false);
        }
        reject(err);
      });
      req.end();
    };
    doRequest(true);
  });
}

function mapNetworkError(err, chain) {
  const code = err.code || '';
  const msg = err.message || String(err);
  const map = {
    ENOTFOUND: 'dns_fail',
    EAI_AGAIN: 'dns_fail',
    ECONNREFUSED: 'connection_refused',
    ECONNRESET: 'connection_refused',
    EHOSTUNREACH: 'connection_refused',
    EPROTO: 'tls_invalid',
    ERR_TLS_CERT_ALTNAME_INVALID: 'tls_invalid',
    CERT_HAS_EXPIRED: 'tls_expired',
  };
  let error_type = map[code];
  if (!error_type && msg === 'timeout') error_type = 'timeout';
  if (!error_type) error_type = 'fetch_failed';
  return { ok: false, error_type, error_message: `${code || ''} ${msg}`.trim(), redirect_chain: chain };
}

module.exports = { fetchPage };

// --- Self-test ---
if (require.main === module) {
  (async () => {
    const urls = [
      'https://example.org',
      'http://www.sekundarschule-brilon.de', // real school
      'http://e.gajewska1@gmail.com',        // invalid — caller should filter first
      'http://nonexistent-domain-aaaaa.tld', // DNS fail
    ];
    for (const u of urls) {
      try {
        const r = await fetchPage(u);
        console.log(u);
        if (r.ok) {
          console.log('  OK', r.http_status_final, r.html.length, 'bytes, redirects:', r.redirect_chain.length);
        } else {
          console.log('  FAIL', r.error_type, r.error_message);
        }
      } catch (e) {
        console.log(u, 'THREW', e.message);
      }
    }
  })();
}
