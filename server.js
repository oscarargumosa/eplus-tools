/* ═══════════════════════════════════════════════════════════════
   E+ Tools — Express Server (Entry Point)
   Single process, all modules under /v1/{module}/
   ═══════════════════════════════════════════════════════════════ */

require('dotenv').config();

const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const path     = require('path');
const cookieParser = require('cookie-parser');
const logger   = require('./node/src/utils/logger');
const { sendError, publicMessage, statusOf, codeFor } = require('./node/src/utils/httpError');
const { requestId, accessLog } = require('./node/src/middleware/requestLog');

/* ── Fallos fuera de una petición: log estructurado ───────────── */
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', logger.errFields(reason));
});
process.on('uncaughtException', (err) => {
  // El proceso queda en estado dudoso: se registra y se sale (Docker/systemd lo reinician).
  logger.error('uncaughtException', logger.errFields(err));
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Trust proxy (behind Nginx/Caddy) ─────────────────────────── */
app.set('trust proxy', 1);

/* ── Request id (req.id + cabecera X-Request-Id) ──────────────── */
app.use(requestId);

/* ── /healthz — público y ligero: sin auth, sin log, antes de todo lo pesado.
   200 si la BD responde a SELECT 1 en menos de 2 s; si no, 503. ── */
const db = require('./node/src/utils/db');
app.get('/healthz', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  let timer;
  try {
    await Promise.race([
      db.query({ sql: 'SELECT 1', timeout: 2000 }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 2000); }),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  } finally {
    clearTimeout(timer);
  }
});

/* ── Registro de peticiones de la API (una línea JSON) ────────── */
app.use(accessLog);

/* ── Security ─────────────────────────────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:    ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://accounts.google.com", "https://apis.google.com"],
      scriptSrcAttr:["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com", "https://cdn.jsdelivr.net"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      imgSrc:      ["'self'", "data:", "blob:", "https:"],
      connectSrc:  ["'self'", "https://cdn.jsdelivr.net", "https://accounts.google.com",
                    "https://tiles.openfreemap.org", "https://*.openfreemap.org",
                    "https://*.basemaps.cartocdn.com"],
      // Canva: Admin › Presentaciones incrusta diseños (solo la cuenta dueña)
      frameSrc:    ["https://accounts.google.com", "https://www.canva.com"],
      // Vídeos de la Academia (MP4 en el CDN de Bunny)
      mediaSrc:    ["'self'", "https://efs-media.b-cdn.net"],
      // MapLibre GL JS usa Web Workers desde un blob para decodificar vector tiles
      workerSrc:   ["'self'", "blob:"],
      childSrc:    ["'self'", "blob:"],
    }
  },
  // Default helmet pone Referrer-Policy: no-referrer, lo que rompe los tile servers
  // (OSM y otros requieren Referer para identificar la fuente). Usamos la política
  // estándar más restrictiva que sí envía origin cross-origin.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Default helmet pone COOP same-origin: la ventana de «Continuar con Google»
  // (ux_mode popup) no puede devolver la credencial y se queda en blanco en
  // accounts.google.com/gsi/transform. Google pide same-origin-allow-popups.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// CORS allow-list: el propio Studio (CORS_ORIGIN y el origen de APP_URL) y local.
// CORS_ORIGINS (lista separada por comas) la sustituye entera.
const appOrigin = (() => { try { return new URL(process.env.APP_URL).origin; } catch { return ''; } })();
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || [
  process.env.CORS_ORIGIN || 'http://localhost:3000',
  appOrigin,
  'http://localhost:3000',
].join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Origen no permitido: 403 directo, sin pasar por el manejador de errores.
// Un warn por origen y minuto como mucho (los bots repiten sin parar).
const corsWarned = new Map();   // origin → último aviso (ms)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Sin Origin: same-origin, curl, apps nativas. Se deja pasar.
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return next();
  const now = Date.now();
  if (now - (corsWarned.get(origin) || 0) > 60 * 1000) {
    if (corsWarned.size > 1000) corsWarned.clear();
    corsWarned.set(origin, now);
    logger.warn('CORS: origen no permitido', { origin: String(origin).slice(0, 200), reqId: req.id, method: req.method, path: req.path });
  }
  res.locals.skipAccessLog = true;
  res.status(403).json({ ok: false, error: { code: 'CORS_FORBIDDEN', message: 'Origen no permitido' } });
});

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));

/* ── Body parsing ─────────────────────────────────────────────── */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

/* ── Idioma de la petición: req.lang, req.t y mensajes de la API ──
   (node/src/utils/i18n.js — español de origen, inglés en public/i18n/en.json) */
app.use(require('./node/src/utils/i18n').requestLang);

/* ── AI request context (propagates userId/endpoint to ai.js) ── */
const aiContext = require('./node/src/utils/aiContext');
app.use((req, _res, next) => {
  const endpoint = (req.method + ' ' + (req.originalUrl || req.url || '')).split('?')[0];
  aiContext.run({ endpoint }, next);
});

/* ── Subidas privadas: nunca por estático ────────────────────────
   Documentos, papers y evaluaciones viven en PRIVATE_UPLOADS_DIR y se
   sirven solo por /v1/documents/download/:id y /v1/research/sources/:id/file.
   Los ficheros antiguos que sigan en public/uploads/{documents,research}
   quedan cortados aquí, antes de express.static. */
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch { /* ruta mal codificada: se mira tal cual */ }
  p = path.posix.normalize(p.replace(/\\/g, '/')).toLowerCase();
  // node/private (documentos de reclamación de entidades…) tampoco, nunca.
  if (/^\/+uploads\/+(documents|research|evaluator|org-claims)(\/|$)/.test(p) || /^\/+(node\/+)?private(\/|$)/.test(p)) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  next();
});

/* ── Puerta de invitados: sin sesión, solo landing, acceso y privacidad.
   Va antes de express.static para que «/» no sirva index.html a cualquiera. */
/* ── Páginas en dos idiomas: selector ?lang=, versión /en/ de la web
   pública y diccionario del navegador (middleware/i18nPages.js).
   Antes de la puerta de invitados: /en/privacidad es pública.        */
const i18nPages = require('./node/src/middleware/i18nPages');
app.use(i18nPages.dictScript);
app.use(i18nPages.i18nPages);

app.use(require('./node/src/middleware/guestGate').guestGate);

/* ── Logos de marca: los correos web los cargan desde otro origen ── */
app.use('/img/marca', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

/* ── Static files (SPA) ──────────────────────────────────────── */
app.use(express.static(path.join(__dirname, 'public')));

/* ── Web pública ─────────────────────────────────────────────────
   Las páginas que antes vivían en WordPress (docs/SALIDA_DE_WORDPRESS.md).
   `extensions` sirve public/web/mision.html en /mision, sin listar rutas a mano.
   Va antes del catch-all de la SPA para que no acaben todas en index.html. */
app.use(express.static(path.join(__dirname, 'public/web'), { extensions: ['html'] }));

/* ── API Routes ───────────────────────────────────────────────── */

// Config pública (no sensible) para el frontend
app.get('/v1/config', (req, res) => {
  res.json({
    ok: true,
    data: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    }
  });
});

/* ── Fase beta cerrada: áreas por persona (node/src/utils/areas.js) ──
   Los routers de «proyectos» se montan detrás de areaGate (sesión + área;
   403 AREA_REQUIRED si falta). Lo libre (entidades, convocatorias,
   movilidades, visiones, cuenta) va sin área; dentro de vision, entities y
   academia el área se exige ruta a ruta.                                    */
const { areaGate } = require('./node/src/middleware/auth');
const proyectos = areaGate('proyectos');

app.use('/v1/auth', require('./node/src/modules/auth/routes'));
app.use('/v1/access-requests', require('./node/src/modules/access/routes'));
app.use('/v1/intake',      proyectos, require('./node/src/modules/intake/routes'));
app.use('/v1/calculator',  proyectos, require('./node/src/modules/calculator/routes'));
// Antes que /v1/admin: «Usuarios y accesos» lleva su propia auditoría.
app.use('/v1/admin/access', require('./node/src/modules/access/admin.routes'));
// Entidades reclamadas: revisar documentación y poner el sello «Verificada».
app.use('/v1/admin/org-claims', require('./node/src/modules/organizations/admin.routes'));
app.use('/v1/admin', require('./node/src/modules/admin/routes'));
app.use('/v1/documents',   proyectos, require('./node/src/modules/documents/routes'));
app.use('/v1/organizations', require('./node/src/modules/organizations/routes'));
app.use('/v1/entities', require('./node/src/modules/entities/routes'));
app.use('/v1/research',    proyectos, require('./node/src/modules/research/routes'));
app.use('/v1/movilidades', require('./node/src/modules/movilidades/routes'));
app.use('/v1/estadisticas', require('./node/src/modules/estadisticas/routes'));
app.use('/v1/presentaciones', require('./node/src/modules/presentaciones/routes'));
app.use('/v1/convocatorias', require('./node/src/modules/convocatorias/routes'));
app.use('/v1/vision',        require('./node/src/modules/vision/routes'));
// Traducir bajo demanda lo que escribe otra persona (botón «Traducir»).
app.use('/v1/translate',     require('./node/src/modules/translate/routes'));

// Future modules:
// app.use('/v1/planner',     require('./node/src/modules/planner/routes'));
app.use('/v1/developer',   proyectos, require('./node/src/modules/developer/routes'));
app.use('/v1/evaluator',   proyectos, require('./node/src/modules/evaluator/routes'));
app.use('/v1/budget',      proyectos, require('./node/src/modules/budget/routes'));
app.use('/v1/voice',       require('./node/src/modules/voice/routes'));
app.use('/v1/sandbox',     proyectos, require('./node/src/modules/sandbox/routes'));
app.use('/v1/exporter',    proyectos, require('./node/src/modules/exporter/routes'));
app.use('/v1/subscribers', require('./node/src/modules/subscribers/routes'));
app.use('/v1/events',      require('./node/src/modules/events/routes'));
app.use('/v1/vps',         require('./node/src/modules/vps/routes'));
app.use('/v1/master',      proyectos, require('./node/src/modules/master/routes'));
// Biblioteca de patrones (admin/scribe, con su propio guarda): sin área.
app.use('/v1/diagnose',    areaGate('proyectos', { except: /^\/(patterns|letters|stats)(\/|$)/ }),
                           require('./node/src/modules/diagnose/routes'));
app.use('/v1/academy',     require('./node/src/modules/academy/routes'));
app.use('/v1/academia',    require('./node/src/modules/academia/routes'));
app.get('/academia/certificado/:serial', require('./node/src/modules/academia/certificate-page'));
app.get(['/academia', '/academia/*'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'academia.html')));

/* ── SPA fallback — serve index.html for all non-API routes ─── */
app.get('*', (req, res) => {
  if (req.path.startsWith('/v1/')) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  }
  i18nPages.sendPage(req, res, path.join(__dirname, 'public', 'index.html'));
});

/* ── Global error handler ─────────────────────────────────────── */
// 4xx con status puesto a mano (o de body-parser/multer): su mensaje.
// 5xx: mensaje genérico + requestId; el detalle y el stack, solo al log.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err && err.name === 'MulterError' ? 400 : statusOf(err);
  sendError(res, status, { code: codeFor(status, err), message: publicMessage(err, status) }, err);
});

/* ── Startup security checks ──────────────────────────────────── */
function checkConfig() {
  const insecure = ['dev-secret-change-me', 'changeme', ''];
  const jwtSecret = process.env.JWT_SECRET || '';
  if (process.env.NODE_ENV === 'production' && insecure.includes(jwtSecret)) {
    console.error('[SECURITY] ⚠️  JWT_SECRET no está configurado o usa el valor por defecto. Detén el servidor y configura JWT_SECRET en .env');
    process.exit(1);
  }
  // Refresh y access deben firmarse con secretos distintos. No se para el
  // servidor (la live aún no lo tiene), pero se avisa fuerte en cada arranque.
  const refreshSecret = process.env.JWT_REFRESH_SECRET || '';
  if (process.env.NODE_ENV === 'production' && (insecure.includes(refreshSecret) || refreshSecret === jwtSecret)) {
    console.error('[SECURITY] ⚠️⚠️  JWT_REFRESH_SECRET falta o es igual a JWT_SECRET. Configura un secreto propio (32+ bytes aleatorios). Al cambiarlo se cierran las sesiones abiertas.');
  }
  if (!process.env.DB_HOST) {
    console.warn('[CONFIG] DB_HOST no definido, usando localhost por defecto');
  }
}

/* ── Start ────────────────────────────────────────────────────── */
checkConfig();
// HOST=127.0.0.1 deja el puerto solo detrás del proxy (lo usa la instancia dev del VPS).
// Por defecto 0.0.0.0, que es lo que necesita el contenedor de Coolify.
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`[E+ Tools] Server running on ${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
  // Los 200.000 marcadores del Atlas tardan segundos en construirse. Se dejan
  // listos al arrancar para que no los pague el primer visitante.
  require('./node/src/modules/entities/controller').warmGeoCache();
  // Vectorizados que murieron con el proceso anterior: no dejarlos en 'processing'
  require('./node/src/modules/documents/model').failStaleProcessing(30)
    .then(n => { if (n) console.log(`[DOCUMENTS] ${n} documento(s) atascados en 'processing' marcados como 'error'`); })
    .catch(e => console.error('[DOCUMENTS] failStaleProcessing:', e.message));
});
