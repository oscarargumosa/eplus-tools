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

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Trust proxy (behind Nginx/Caddy) ─────────────────────────── */
app.set('trust proxy', 1);

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
      frameSrc:    ["https://accounts.google.com"],
      // MapLibre GL JS usa Web Workers desde un blob para decodificar vector tiles
      workerSrc:   ["'self'", "blob:"],
      childSrc:    ["'self'", "blob:"],
    }
  },
  // Default helmet pone Referrer-Policy: no-referrer, lo que rompe los tile servers
  // (OSM y otros requieren Referer para identificar la fuente). Usamos la política
  // estándar más restrictiva que sí envía origin cross-origin.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS allow-list. Tool origins + WP origins (local + prod) so the WP
// newsletter form can POST to /v1/subscribers. Env var can override.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || [
  process.env.CORS_ORIGIN || 'http://localhost:3000',
  'http://localhost:3000',
  'http://eufundingschool.test',
  'https://eufundingschool.com',
  'https://www.eufundingschool.com',
  'https://intake.eufundingschool.com',
  'https://app.eufundingschool.com',
  'https://campus.eufundingschool.com', // Moodle: session-status para unificar CTA login
].join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // No Origin header: same-origin, curl, native apps. Allow.
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`), false);
  },
  credentials: true,
}));

/* ── Body parsing ─────────────────────────────────────────────── */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

/* ── AI request context (propagates userId/endpoint to ai.js) ── */
const aiContext = require('./node/src/utils/aiContext');
app.use((req, _res, next) => {
  const endpoint = (req.method + ' ' + (req.originalUrl || req.url || '')).split('?')[0];
  aiContext.run({ endpoint }, next);
});

/* ── Static files (SPA) ──────────────────────────────────────── */
app.use(express.static(path.join(__dirname, 'public')));

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

app.use('/v1/auth', require('./node/src/modules/auth/routes'));
app.use('/v1/intake', require('./node/src/modules/intake/routes'));
app.use('/v1/calculator', require('./node/src/modules/calculator/routes'));
app.use('/v1/admin', require('./node/src/modules/admin/routes'));
app.use('/v1/documents', require('./node/src/modules/documents/routes'));
app.use('/v1/organizations', require('./node/src/modules/organizations/routes'));
app.use('/v1/entities', require('./node/src/modules/entities/routes'));
app.use('/v1/research', require('./node/src/modules/research/routes'));
app.use('/v1/movilidades', require('./node/src/modules/movilidades/routes'));
app.use('/v1/convocatorias', require('./node/src/modules/convocatorias/routes'));

// Future modules:
// app.use('/v1/planner',     require('./node/src/modules/planner/routes'));
app.use('/v1/developer',   require('./node/src/modules/developer/routes'));
app.use('/v1/evaluator',   require('./node/src/modules/evaluator/routes'));
app.use('/v1/budget',      require('./node/src/modules/budget/routes'));
app.use('/v1/voice',       require('./node/src/modules/voice/routes'));
app.use('/v1/sandbox',     require('./node/src/modules/sandbox/routes'));
app.use('/v1/exporter',    require('./node/src/modules/exporter/routes'));
app.use('/v1/subscribers', require('./node/src/modules/subscribers/routes'));
app.use('/v1/events',      require('./node/src/modules/events/routes'));
app.use('/v1/vps',         require('./node/src/modules/vps/routes'));
app.use('/v1/master',      require('./node/src/modules/master/routes'));
app.use('/v1/diagnose',    require('./node/src/modules/diagnose/routes'));
app.use('/v1/academy',     require('./node/src/modules/academy/routes'));

/* ── SPA fallback — serve index.html for all non-API routes ─── */
app.get('*', (req, res) => {
  if (req.path.startsWith('/v1/')) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Global error handler ─────────────────────────────────────── */
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    ok: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'Something went wrong'
        : err.message
    }
  });
});

/* ── Startup security checks ──────────────────────────────────── */
function checkConfig() {
  const insecure = ['dev-secret-change-me', 'changeme', ''];
  const jwtSecret = process.env.JWT_SECRET || '';
  if (process.env.NODE_ENV === 'production' && insecure.includes(jwtSecret)) {
    console.error('[SECURITY] ⚠️  JWT_SECRET no está configurado o usa el valor por defecto. Detén el servidor y configura JWT_SECRET en .env');
    process.exit(1);
  }
  if (!process.env.DB_HOST) {
    console.warn('[CONFIG] DB_HOST no definido, usando localhost por defecto');
  }
}

/* ── Start ────────────────────────────────────────────────────── */
checkConfig();
app.listen(PORT, () => {
  console.log(`[E+ Tools] Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});
