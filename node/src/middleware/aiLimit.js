/* ── Límites de uso de IA ───────────────────────────────────────
   Protegen la suscripción compartida (ai-bridge, máx. 2 en paralelo)
   de abusos o bucles. Se montan DESPUÉS de requireAuth.

   - Por usuario y hora (ventana deslizante de express-rate-limit):
       AI_USER_HOURLY_LIMIT  (por defecto 30)
       AI_ADMIN_HOURLY_LIMIT (por defecto 300; 0 = admins sin límite)
   - Tope diario global (todas las cuentas, día UTC, en memoria):
       AI_GLOBAL_DAILY_LIMIT (por defecto 1000; 0 = sin tope). Los
       admins cuentan pero no se bloquean.

   Contadores en memoria: se reinician al reiniciar el proceso (la app
   corre en un único proceso). enforceRefineCap (utils/ai.js) sigue
   aplicando además su tope diario de refinados.
   ─────────────────────────────────────────────────────────────── */
const rateLimit = require('express-rate-limit');

const USER_HOURLY  = parseInt(process.env.AI_USER_HOURLY_LIMIT  || '30', 10);
const ADMIN_HOURLY = parseInt(process.env.AI_ADMIN_HOURLY_LIMIT || '300', 10);
const GLOBAL_DAILY = parseInt(process.env.AI_GLOBAL_DAILY_LIMIT || '1000', 10);

const isAdmin = (req) => req.user?.role === 'admin';

function tooMany(res, message, code = 'AI_RATE_LIMITED') {
  return res.status(429).json({ ok: false, error: { code, message } });
}

const perUser = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: (req) => (isAdmin(req) ? ADMIN_HOURLY : USER_HOURLY),
  skip: (req) => !req.user || (isAdmin(req) && ADMIN_HOURLY === 0),
  keyGenerator: (req) => 'ai:' + req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooMany(res,
    `Has alcanzado el límite de ${isAdmin(req) ? ADMIN_HOURLY : USER_HOURLY} usos de IA por hora. Inténtalo de nuevo un poco más tarde.`),
});

let day = '';
let usedToday = 0;

function globalDaily(req, res, next) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; usedToday = 0; }
  if (GLOBAL_DAILY > 0 && usedToday >= GLOBAL_DAILY && !isAdmin(req)) {
    return tooMany(res, 'Se ha alcanzado el límite diario de uso de IA de la plataforma. Vuelve a intentarlo mañana.', 'AI_DAILY_CAP');
  }
  usedToday++;
  next();
}

/** Middleware para rutas de IA: router.post('/x', requireAuth, aiLimit, ctrl.x) */
const aiLimit = [perUser, globalDaily];

/** Variante condicional (p. ej. exportar .docx solo usa IA si traduce). */
function aiLimitIf(pred) {
  return aiLimit.map(mw => (req, res, next) => (pred(req) ? mw(req, res, next) : next()));
}

module.exports = { aiLimit, aiLimitIf, _stats: () => ({ day, usedToday, GLOBAL_DAILY, USER_HOURLY, ADMIN_HOURLY }) };
