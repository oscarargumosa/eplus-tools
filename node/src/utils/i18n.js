/* ═══════════════════════════════════════════════════════════════
   Idiomas de la interfaz (oct-2026) — español (origen) e inglés.
   ─────────────────────────────────────────────────────────────
   El texto en español ES la clave: public/i18n/en.json dice
   «Iniciar sesión» → «Sign in». Si un texto no está en el diccionario
   se ve en español, nunca una clave rara.

   En HTML, un elemento con `data-i18n` marca una zona traducible: se
   traducen todos sus nodos de texto y los atributos visibles
   (placeholder, title, aria-label, alt). Dentro de una zona:
     - `translate="no"`, los iconos (material-symbols) y code/pre/
       textarea/svg no se tocan;
     - `data-i18n-html` traduce el contenido entero del elemento como
       una sola frase (para frases con <b>, <a>… dentro).
   En JS del navegador: _t('Texto {x}', { x }) (public/js/i18n.js).
   En el servidor: req.t('Texto') o tl(lang, 'Texto').

   El servidor traduce las páginas antes de enviarlas (sin parpadeo, y
   Google lee las páginas /en/). scripts/i18n-check.js comprueba antes
   de desplegar que no falte ninguna traducción.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LANGS = ['es', 'en'];
const DEFAULT_LANG = 'es';          // idioma de origen: el del código (sin traducir)
// Dentro de la app, quien aún no ha elegido trabaja en inglés (decisión de
// Óscar, 23-oct-2026), aunque su navegador esté en español. La web pública
// no usa esto: «/» en español, /en/ en inglés (middleware/i18nPages.js).
const APP_DEFAULT_LANG = 'en';
const COOKIE = 'studio_lang';
const DICT_FILE = path.join(__dirname, '..', '..', '..', 'public', 'i18n', 'en.json');

// Lenguas de España: la interfaz en español.
const SPANISH_FAMILY = new Set(['es', 'ca', 'gl', 'eu', 'ast', 'an', 'oc']);

const TEXT_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const META_CONTENT = /^(description|og:title|og:description|og:site_name|twitter:title|twitter:description)$/;
const SKIP_TAGS = new Set(['code', 'pre', 'textarea', 'svg', 'math', 'kbd', 'samp']);
const ICON_CLASS = /(^|\s)material-(symbols-outlined|symbols-rounded|icons)(\s|$)/;
const HAS_LETTER = /\p{L}/u;

/* ── Diccionario ─────────────────────────────────────────────── */
let dict = {};
let dictMtime = -1;
let dictVersion = '0';

function loadDict() {
  let st;
  try { st = fs.statSync(DICT_FILE); } catch { return dict; }
  if (st.mtimeMs === dictMtime) return dict;
  try {
    const raw = fs.readFileSync(DICT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const clean = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('_') || typeof v !== 'string' || !v.trim()) continue;
      clean[norm(k)] = v;
    }
    dict = clean;
    dictVersion = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10);
    dictMtime = st.mtimeMs;
  } catch (e) {
    // JSON roto: se queda el diccionario anterior (la comprobación lo detecta).
    console.error('[i18n] en.json no se puede leer:', e.message);
    dictMtime = st.mtimeMs;
  }
  return dict;
}

function getDict() { return loadDict(); }
function getDictVersion() { loadDict(); return dictVersion; }

function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

function isLang(l) { return LANGS.includes(l); }

function lookup(lang, text) {
  if (lang === DEFAULT_LANG) return null;
  const v = loadDict()[norm(text)];
  return v || null;
}

function interpolate(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

/* tl(lang, 'Texto con {x}', { x }) → traducido (o el español si falta). */
function tl(lang, text, vars) {
  return interpolate(lookup(lang, text) || String(text), vars);
}

/* ── Idioma de una petición ──────────────────────────────────── */
function langFromAcceptLanguage(header) {
  if (!header) return null;
  const tags = String(header).split(',')
    .map(p => p.trim().split(';')[0].toLowerCase().split('-')[0])
    .filter(t => t && t !== '*');
  if (!tags.length) return null;
  if (SPANISH_FAMILY.has(tags[0])) return 'es';
  if (tags[0] === 'en') return 'en';
  // Otra lengua primero: la primera de las nuestras que aparezca; si no, inglés.
  for (const t of tags) {
    if (t === 'en') return 'en';
    if (SPANISH_FAMILY.has(t)) return 'es';
  }
  return 'en';
}

function cookieLang(req) {
  const c = req.cookies && req.cookies[COOKIE];
  return isLang(c) ? c : null;
}

function langFromReq(req) {
  return cookieLang(req) || APP_DEFAULT_LANG;
}

function cookieOpts() {
  return {
    httpOnly: false,                       // la lee public/js/i18n.js
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   365 * 24 * 60 * 60 * 1000,
  };
}
function setLangCookie(res, lang) { if (isLang(lang)) res.cookie(COOKIE, lang, cookieOpts()); }

/* Middleware: req.lang, req.t y los mensajes de la API traducidos.
   Los controladores escriben sus mensajes en español; si la persona usa
   la interfaz en inglés, `error.message` y `data.message` salen en inglés
   (cuando están en el diccionario). */
function requestLang(req, res, next) {
  req.lang = langFromReq(req);
  req.t = (text, vars) => tl(req.lang, text, vars);
  if (req.lang !== DEFAULT_LANG) {
    const json = res.json.bind(res);
    res.json = (body) => {
      try {
        if (body && typeof body === 'object') {
          if (body.error && typeof body.error === 'object' && typeof body.error.message === 'string') {
            body.error.message = tl(req.lang, body.error.message);
          } else if (typeof body.error === 'string') {
            body.error = tl(req.lang, body.error);
          }
          if (body.data && typeof body.data === 'object' && typeof body.data.message === 'string') {
            body.data.message = tl(req.lang, body.data.message);
          }
        }
      } catch { /* nunca romper una respuesta por traducirla */ }
      return json(body);
    };
  }
  next();
}

/* ── HTML ────────────────────────────────────────────────────── */
function attr(el, name) { return el.attribs ? el.attribs[name] : undefined; }

function skipElement(el) {
  if (!el.attribs) return false;
  if (el.attribs.translate === 'no') return true;
  if (SKIP_TAGS.has(el.name)) return true;
  if (ICON_CLASS.test(el.attribs.class || '')) return true;
  return false;
}

function translatableAttrs(el) {
  const out = TEXT_ATTRS.filter(a => el.attribs && typeof el.attribs[a] === 'string');
  if (el.name === 'meta' && el.attribs && (META_CONTENT.test(el.attribs.name || '') || META_CONTENT.test(el.attribs.property || ''))) {
    out.push('content');
  }
  return out;
}

/* Recorre las zonas `data-i18n` del documento y llama a visit(kind, ...)
   para cada texto traducible: ('text', node) · ('attr', el, name) ·
   ('html', el). Lo usan traducir y scripts/i18n-check.js. */
function walkScopes($, visit) {
  const roots = $('[data-i18n]').toArray().filter(el => !$(el).parents('[data-i18n]').length);
  const walkEl = (el) => {
    if (skipElement(el)) return;
    for (const a of translatableAttrs(el)) {
      if (HAS_LETTER.test(el.attribs[a])) visit('attr', el, a);
    }
    if (el.attribs && Object.prototype.hasOwnProperty.call(el.attribs, 'data-i18n-html')) {
      if (HAS_LETTER.test($(el).text())) visit('html', el);
      return;
    }
    for (const child of el.children || []) {
      if (child.type === 'text') {
        if (HAS_LETTER.test(child.data)) visit('text', child);
      } else if (child.type === 'tag') {
        walkEl(child);
      }
      // script, style y comentarios: fuera.
    }
  };
  roots.forEach(walkEl);
}

/* Clave de un elemento data-i18n-html: su HTML interior normalizado. */
function htmlKey($, el) { return norm($(el).html()); }

/* Rutas internas que tienen versión /en/ (las decide el llamador). */
function prefixLinks($, prefix, isPrefixable) {
  $('a[href], link[rel="canonical"][href]').each((_, el) => {
    const href = el.attribs.href;
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    const m = /^([^?#]*)(.*)$/.exec(href);
    if (!isPrefixable(m[1])) return;
    el.attribs.href = prefix + (m[1] === '/' ? '/' : m[1]) + m[2];
  });
}

/* Traduce un documento HTML entero. opts: { prefix, isPrefixable, dictScript } */
function translateHtml(html, lang, opts = {}) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('html').attr('lang', lang);
  if (lang !== DEFAULT_LANG) {
    walkScopes($, (kind, node, name) => {
      if (kind === 'text') {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.data);
        const v = lookup(lang, m[2]);
        if (v) node.data = m[1] + v + m[3];   // el serializador ya escapa < y &
      } else if (kind === 'attr') {
        const v = lookup(lang, node.attribs[name]);
        if (v) node.attribs[name] = v;
      } else if (kind === 'html') {
        const v = lookup(lang, htmlKey($, node));
        if (v) $(node).html(v);
      }
    });
    // Diccionario para los textos que pinta el JS (_t), antes que cualquier script.
    if (opts.dictScript) $('head').prepend(`<script src="${opts.dictScript}"></script>\n`);
  }
  if (opts.prefix && opts.isPrefixable) prefixLinks($, opts.prefix, opts.isPrefixable);
  return $.html();
}

module.exports = {
  LANGS, DEFAULT_LANG, APP_DEFAULT_LANG, COOKIE, DICT_FILE,
  getDict, getDictVersion, norm, isLang, tl, lookup,
  langFromReq, langFromAcceptLanguage, cookieLang, setLangCookie, requestLang,
  walkScopes, htmlKey, translateHtml,
};
