/* ── Enlaces firmados a /media/ (oct-2026) ─────────────────────────
   nginx sirve /data/eplus-tools/media/ en /media/ sin pasar por la app.
   Lo privado (dossieres PDF, pósters y portada de la academia) solo se
   abre con un enlace que firma la API al dar los datos a quien tiene
   permiso: ?md5=<firma>&expires=<epoch>, el formato de secure_link de
   nginx (secure_link_md5 "$secure_link_expires$uri <secreto>").
   Así no hace falta cookie: un <video poster>, un <img> o un PDF en otra
   pestaña llevan la firma en la URL. Quien recibe el enlace es quien pasó
   el guarda de la ruta (en la academia: sesión + área «academia»).

   Carpetas públicas (landing y galería): se devuelven tal cual.
   Sin MEDIA_LINK_SECRET no se firma nada (dev sin nginx).

   nginx (mismo secreto que MEDIA_LINK_SECRET):
     location /media/ {                       # privado por defecto
       alias /data/eplus-tools/media/;
       secure_link $arg_md5,$arg_expires;
       secure_link_md5 "$secure_link_expires$uri <MEDIA_LINK_SECRET>";
       if ($secure_link = "")  { return 403; }
       if ($secure_link = "0") { return 410; }
       expires 12h; add_header Cache-Control "private";
       try_files $uri =404;
     }
     location /media/bienvenida/ { alias …/bienvenida/; … }   # públicas
     location /media/galeria/    { alias …/galeria/;    … }              */

const crypto = require('crypto');

const PUBLIC_PREFIXES = ['/media/bienvenida/', '/media/galeria/'];
// Solo rutas simples: lo que se firma tiene que coincidir byte a byte con
// el $uri que ve nginx (ya decodificado y normalizado).
const SIGNABLE = /^\/media\/[A-Za-z0-9._\-\/]+$/;

// Ventanas de 12 h: el enlace vale entre 12 y 24 h y no cambia dentro de
// la ventana, así el navegador lo puede guardar en caché.
const WINDOW_S = 12 * 3600;

function secret() { return process.env.MEDIA_LINK_SECRET || ''; }

function expiresAt(nowMs = Date.now()) {
  return (Math.floor(nowMs / 1000 / WINDOW_S) + 2) * WINDOW_S;
}

function signature(uri, expires, key) {
  return crypto.createHash('md5').update(`${expires}${uri} ${key}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** '/media/docs/x.pdf' → '/media/docs/x.pdf?md5=…&expires=…'. Lo demás, igual. */
function signMediaUrl(url, nowMs) {
  const key = secret();
  if (!key || typeof url !== 'string' || !SIGNABLE.test(url) || url.includes('..')) return url;
  if (PUBLIC_PREFIXES.some(p => url.startsWith(p))) return url;
  const expires = expiresAt(nowMs);
  return `${url}?md5=${signature(url, expires, key)}&expires=${expires}`;
}

/** Recorre una respuesta (objetos y arrays) y firma cada cadena /media/… */
function signMediaUrls(data, nowMs = Date.now()) {
  if (!secret()) return data;
  if (typeof data === 'string') return signMediaUrl(data, nowMs);
  if (Array.isArray(data)) return data.map(v => signMediaUrls(v, nowMs));
  if (data && typeof data === 'object' && !(data instanceof Date) && !Buffer.isBuffer(data)) {
    const out = {};
    for (const [k, v] of Object.entries(data)) out[k] = signMediaUrls(v, nowMs);
    return out;
  }
  return data;
}

module.exports = { signMediaUrl, signMediaUrls, signature, expiresAt, PUBLIC_PREFIXES };
