/* ── Puerta de invitados (oct-2026) ──────────────────────────────
   EU Funding Studio no se explora sin cuenta. Un visitante sin sesión
   solo ve la landing (en «/»), /privacidad, las pantallas de acceso
   y la verificación pública de certificados. Cualquier otra página le
   devuelve a la landing con ?volver=<ruta> para regresar tras entrar.

   El servidor no ve la sesión en «/» (la cookie de refresco va con
   Path=/v1/auth y el access token vive en memoria del navegador), así
   que se guía por la cookie-pista `studio_sesion` (Path=/), que ponen y
   quitan las rutas de auth junto a la de refresco. Es solo una pista
   de enrutado: la seguridad la da la API, que exige sesión en los datos.
   Ficheros con extensión: solo se sirven los de las carpetas de
   STATIC_DIRS (css, js, imágenes, tipografías…), con o sin sesión. Un
   fichero suelto en public/ o en otra carpeta da 404 aunque haya sesión:
   así no se publica nada por dejarlo ahí por descuido (pasó con un PDF
   interno y prototipos, oct-2026). Una ruta con punto que no es fichero
   sigue como página.                                                     */

const fs   = require('fs');
const path = require('path');

const PUBLIC_DIR   = path.join(__dirname, '..', '..', '..', 'public');
const LANDING_FILE = path.join(PUBLIC_DIR, 'landing.html');
const APP_FILE     = path.join(PUBLIC_DIR, 'index.html');

const HINT_COOKIE = 'studio_sesion';

// Pantallas de acceso: las sirve la SPA (index.html) con o sin sesión.
const AUTH_PAGES = new Set(['/entrar', '/crear-cuenta', '/recuperar', '/verify-email', '/reset-password']);
// Páginas estáticas abiertas a todo el mundo.
const OPEN_PAGES = new Set(['/privacidad', '/privacidad.html', '/landing.html']);
// Carpetas de public/ cuyos ficheros puede pedir cualquiera. Un fichero que
// exista fuera de ellas (p. ej. /uploads/documents/…, /algo.pdf) da 404.
const STATIC_DIRS = ['/css/', '/js/', '/img/', '/fonts/', '/data/', '/uploads/avatars/', '/uploads/logos/'];

// ¿Existe como fichero en public/ (o public/web)? p ya viene normalizada.
function isPublicFile(p) {
  for (const base of [PUBLIC_DIR, path.join(PUBLIC_DIR, 'web')]) {
    try { if (fs.statSync(path.join(base, p)).isFile()) return true; } catch { /* no existe */ }
  }
  return false;
}

function hasSessionHint(req) {
  return !!(req.cookies && req.cookies[HINT_COOKIE] === '1');
}

/* Opciones de la cookie-pista: mismas que la de refresco salvo Path=/ y
   legible por JS (la SPA la borra si descubre que la sesión ya no vale). */
function hintCookieOpts() {
  return {
    httpOnly: false,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   30 * 24 * 60 * 60 * 1000,
  };
}
function setSessionHint(res) { res.cookie(HINT_COOKIE, '1', hintCookieOpts()); }
function clearSessionHint(res) {
  const { maxAge, ...base } = hintCookieOpts();
  res.clearCookie(HINT_COOKIE, base);
}

function noStore(res) {
  // «/» cambia según la cookie: que ningún proxy guarde una versión para todos.
  res.set('Cache-Control', 'private, no-cache');
  res.vary('Cookie');
}

function guestGate(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let p = req.path;
  try { p = decodeURIComponent(p); } catch { /* ruta mal codificada: tal cual */ }
  p = path.posix.normalize(p.replace(/\\/g, '/'));
  if (p.length > 1) p = p.replace(/\/+$/, '');

  if (p === '/v1' || p.startsWith('/v1/') || p === '/healthz') return next();
  if (p.startsWith('/academia/certificado/')) return next();

  // Ficheros (assets): solo los de STATIC_DIRS. Las páginas no llevan
  // extensión o son .html.
  const ext = path.posix.extname(p).toLowerCase();
  if (ext && ext !== '.html' && ext !== '.htm') {
    if (STATIC_DIRS.some(d => p.startsWith(d))) return next();
    if (isPublicFile(p)) return res.status(404).type('text/plain').send('Not found');
  }

  const logged = hasSessionHint(req);

  if (p === '/' || p === '/index.html') {
    noStore(res);
    // La app sale en el idioma de la persona; la portada de «/» siempre en
    // español (la inglesa vive en /en/, middleware/i18nPages.js).
    const { sendPage } = require('./i18nPages');
    return logged ? sendPage(req, res, APP_FILE) : sendPage(req, res, LANDING_FILE, { lang: 'es' });
  }
  if (logged || AUTH_PAGES.has(p) || OPEN_PAGES.has(p)) return next();

  // Cualquier otra página: a la landing, recordando adónde quería ir.
  noStore(res);
  const target = req.originalUrl && req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//')
    ? req.originalUrl.slice(0, 500) : '/';
  return res.redirect(302, '/?volver=' + encodeURIComponent(target));
}

module.exports = { guestGate, setSessionHint, clearSessionHint, HINT_COOKIE };
