/* ── Páginas en dos idiomas (oct-2026) ─────────────────────────
   Español en las direcciones de siempre; inglés en /en/… para la web
   pública (portada, misión, privacidad, recursos). La app (index.html)
   no cambia de dirección: sale en el idioma de la cookie `studio_lang`
   o, la primera vez, en el del navegador.

   - ?lang=es|en en cualquier página: guarda la preferencia y vuelve a
     la misma página en ese idioma (así funciona el selector sin JS).
   - /en/<página>: la versión inglesa; deja la preferencia en inglés.
   - Una página pública en español con la preferencia en inglés (o un
     navegador en inglés que llega por primera vez) salta a /en/.
   Solo tienen versión /en/ las páginas con `data-i18n` en <html>.     */

const fs = require('fs');
const path = require('path');
const i18n = require('../utils/i18n');
const { HINT_COOKIE } = require('./guestGate');

const PUBLIC_DIR   = path.join(__dirname, '..', '..', '..', 'public');
const WEB_DIR      = path.join(PUBLIC_DIR, 'web');
const LANDING_FILE = path.join(PUBLIC_DIR, 'landing.html');

// Sin cuenta solo se abren estas (como en guestGate).
const GUEST_OPEN = new Set(['/', '/privacidad']);

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse/i;

function logged(req) { return !!(req.cookies && req.cookies[HINT_COOKIE] === '1'); }

function cleanPath(p) {
  try { p = decodeURIComponent(p); } catch { /* tal cual */ }
  p = path.posix.normalize(String(p).replace(/\\/g, '/'));
  return p;
}

/* ¿Tiene la página su versión traducible? (data-i18n en <html>) */
const migratedCache = new Map();
function isMigrated(file) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const c = migratedCache.get(file);
  if (c && c.mtime === st.mtimeMs) return c.ok;
  const head = fs.readFileSync(file, 'utf8').slice(0, 4000);
  const ok = /<html\b[^>]*\bdata-i18n\b/i.test(head);
  migratedCache.set(file, { mtime: st.mtimeMs, ok });
  return ok;
}

/* Página pública (sin prefijo) → fichero, o null. «/» es la portada. */
function publicPageFile(p) {
  if (p === '/' || p === '/landing.html') return isMigrated(LANDING_FILE) ? LANDING_FILE : null;
  const bare = p.replace(/\/+$/, '');
  const cands = p.endsWith('/')
    ? [path.join(WEB_DIR, bare, 'index.html')]
    : /\.html?$/i.test(p) ? [path.join(WEB_DIR, p)] : [path.join(WEB_DIR, p + '.html'), path.join(WEB_DIR, p, 'index.html')];
  for (const f of cands) {
    if (!f.startsWith(WEB_DIR + path.sep)) continue;
    if (isMigrated(f)) return f;
  }
  return null;
}

function isPrefixable(p) { return !!publicPageFile(cleanPath(p || '/')); }

/* ── Envío de páginas traducidas (con caché por fichero e idioma) ── */
const pageCache = new Map();
function translatedPage(file, lang, prefix) {
  const st = fs.statSync(file);
  const key = `${file}|${lang}|${prefix || ''}`;
  const ver = `${st.mtimeMs}|${i18n.getDictVersion()}`;
  const hit = pageCache.get(key);
  if (hit && hit.ver === ver) return hit.html;
  const html = i18n.translateHtml(fs.readFileSync(file, 'utf8'), lang, {
    prefix, isPrefixable,
    dictScript: `/i18n/${lang}.js?v=${i18n.getDictVersion()}`,
  });
  pageCache.set(key, { ver, html });
  return html;
}

function noStore(res) {
  res.set('Cache-Control', 'private, no-cache');
  res.vary('Cookie');
  res.vary('Accept-Language');
}

/* Envía una página HTML en el idioma de la petición (o el pedido). */
function sendPage(req, res, file, { lang, prefix } = {}) {
  lang = lang || req.lang || i18n.langFromReq(req);
  noStore(res);
  if (lang === i18n.DEFAULT_LANG && !prefix) return res.sendFile(file);
  try {
    res.type('html').send(translatedPage(file, lang, prefix));
  } catch (e) {
    // Si la traducción falla, la página en español antes que un error.
    console.error('[i18n] no se pudo traducir', path.basename(file), e.message);
    res.sendFile(file);
  }
}

function wantsEnglish(req) {
  const c = i18n.cookieLang(req);
  if (c) return c === 'en';
  if (BOT_UA.test(req.headers['user-agent'] || '')) return false;   // Google: cada dirección, su idioma
  return i18n.langFromAcceptLanguage(req.headers['accept-language']) === 'en';
}

function queryWithout(req, name) {
  const u = new URL(req.originalUrl, 'http://x');
  u.searchParams.delete(name);
  const q = u.searchParams.toString();
  return q ? '?' + q : '';
}

/* Diccionario para el navegador: /i18n/en.js → window.__I18N_EN__ */
function dictScript(req, res, next) {
  if (req.path !== '/i18n/en.js') return next();
  res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.type('application/javascript')
    .send('window.__I18N_EN__=' + JSON.stringify(i18n.getDict()) + ';');
}

function i18nPages(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const raw = req.path;
  if (raw === '/v1' || raw.startsWith('/v1/') || raw === '/healthz') return next();
  const ext = path.posix.extname(raw).toLowerCase();
  if (ext && ext !== '.html' && ext !== '.htm') return next();

  // ?lang=… — el selector de idioma.
  if (i18n.isLang(req.query.lang)) {
    const lang = req.query.lang;
    i18n.setLangCookie(res, lang);
    let p = cleanPath(raw);
    if (p === '/en' || p.startsWith('/en/')) p = p.slice(3) || '/';
    const rest = queryWithout(req, 'lang');
    noStore(res);
    if (publicPageFile(p) && !(p === '/' && logged(req))) {
      return res.redirect(302, (lang === 'en' ? '/en' + (p === '/' ? '/' : p) : p) + rest);
    }
    return res.redirect(302, p + rest);
  }

  let p = cleanPath(raw);

  // /en/… — versión inglesa de la web pública.
  if (p === '/en' || p.startsWith('/en/')) {
    const inner = p.slice(3) || '/';
    if (i18n.cookieLang(req) !== 'en') i18n.setLangCookie(res, 'en');
    if (inner === '/' && logged(req)) { noStore(res); return res.redirect(302, '/' + queryWithout(req, '_')); }
    const file = publicPageFile(inner);
    if (!file) { noStore(res); return res.redirect(302, inner + queryWithout(req, '_')); }
    if (!logged(req) && !GUEST_OPEN.has(inner.replace(/\/+$/, '') || '/')) {
      noStore(res);
      return res.redirect(302, '/en/?volver=' + encodeURIComponent(inner));
    }
    return sendPage(req, res, file, { lang: 'en', prefix: '/en' });
  }

  // Página pública en español, pero la persona la quiere en inglés.
  const isGuestHome = p === '/' && !logged(req);
  if ((isGuestHome || (p !== '/' && publicPageFile(p))) && publicPageFile(p) && wantsEnglish(req)) {
    noStore(res);
    return res.redirect(302, '/en' + (p === '/' ? '/' : p) + queryWithout(req, '_'));
  }
  next();
}

module.exports = { i18nPages, dictScript, sendPage, publicPageFile };
