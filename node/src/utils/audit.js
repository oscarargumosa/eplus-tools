/* ═══════════════════════════════════════════════════════════════
   Auditoría — audit(req, action, { targetType, targetId, meta, actor })
   ─────────────────────────────────────────────────────────────
   Guarda en audit_log quién hizo una acción sensible. NUNCA lanza ni
   bloquea la respuesta: si falla, deja un warn en el log y sigue.
   El email se guarda enmascarado. `actor` ({ id, email }) sustituye a
   req.user cuando aún no hay sesión (login fallido, reset…).
   `meta` no debe llevar contraseñas, tokens ni cuerpos completos.
   ═══════════════════════════════════════════════════════════════ */

const db = require('./db');
const logger = require('./logger');

function audit(req, action, { targetType = null, targetId = null, meta = null, actor = null } = {}) {
  try {
    const who = actor || (req && req.user) || {};
    const headers = (req && req.headers) || {};
    const row = [
      who.id || null,
      who.email ? logger.maskEmail(who.email).slice(0, 255) : null,
      String(action).slice(0, 64),
      targetType ? String(targetType).slice(0, 64) : null,
      targetId != null ? String(targetId).slice(0, 191) : null,
      (req && (req.ip || req.socket?.remoteAddress)) ? String(req.ip || req.socket.remoteAddress).slice(0, 64) : null,
      headers['user-agent'] ? String(headers['user-agent']).slice(0, 255) : null,
      meta ? JSON.stringify(meta) : null,
    ];
    db.query(
      `INSERT INTO audit_log (actor_user_id, actor_email_masked, action, target_type, target_id, ip, user_agent, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, row
    ).catch(e => logger.warn('audit: no se pudo registrar', { action, reqId: req && req.id, err: e.message }));
  } catch (e) {
    logger.warn('audit: no se pudo registrar', { action, reqId: req && req.id, err: e.message });
  }
}

/* Para routers enteros (admin): registra cada petición que modifica datos
   y termina bien (2xx). Se evalúa al final, cuando requireAuth ya puso req.user. */
function auditMutations(prefix) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    res.on('finish', () => {
      if (res.statusCode >= 400 || !req.user) return;
      // /data/programs/<id>/duplicate → tipo "programs", id "<id>"
      const segs = req.path.split('/').filter(s => s && s !== 'data');
      const action = `${prefix}.${req.method === 'DELETE' ? 'delete' : req.method === 'POST' ? 'create' : 'update'}`;
      audit(req, action, {
        targetType: segs[0] || null,
        targetId:   segs.slice(1).find(s => /^[0-9a-f-]{8,}$|^\d+$/i.test(s)) || null,
        meta:       { method: req.method, path: (req.baseUrl || '') + req.path, status: res.statusCode },
      });
    });
    next();
  };
}

module.exports = { audit, auditMutations };
