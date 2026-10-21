/* ── Presentaciones privadas — /v1/presentaciones/* ─────────────────
   Solo la cuenta dueña (STUDIO_OWNER_EMAIL, por defecto la de Óscar) y
   con rol admin: los otros admins no las ven. Guarda diseños de Canva
   (id + token del enlace) y los devuelve como URL incrustable.            */
const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const db = require('../../utils/db');
const { sendError } = require('../../utils/httpError');

const OWNER = () => (process.env.STUDIO_OWNER_EMAIL || 'oscarargumosa@gmail.com').toLowerCase();

// El email del token lo firma el servidor, pero se comprueba contra la BD
// por si la cuenta cambió de correo después del login.
async function requireOwner(req, res, next) {
  try {
    if (req.user?.role !== 'admin') return sendError(res, 403, { code: 'FORBIDDEN', message: 'Solo el dueño' });
    const [[u]] = await db.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
    if (!u || String(u.email).toLowerCase() !== OWNER()) return sendError(res, 403, { code: 'FORBIDDEN', message: 'Solo el dueño' });
    next();
  } catch (e) { sendError(res, 500, { code: 'PRESENTACIONES_ERROR', message: e.message }, e); }
}

router.use(requireAuth, requireOwner, require('../../utils/audit').auditMutations('presentaciones'));

// Acepta cualquier enlace de Canva del diseño: /edit, /view, /view?embed…
const CANVA_RE = /^https:\/\/(?:www\.)?canva\.com\/design\/([A-Za-z0-9_-]{6,40})\/([A-Za-z0-9_-]{6,80})(?:\/(?:edit|view|watch))?(?:[/?#].*)?$/;

const salida = r => ({
  id: r.id,
  title: r.title,
  embed_url: `https://www.canva.com/design/${r.design_id}/${r.share_token}/view?embed`,
  edit_url: `https://www.canva.com/design/${r.design_id}/${r.share_token}/edit`,
  created_at: r.created_at,
});

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM owner_presentations ORDER BY sort_order, id');
    res.json({ ok: true, data: rows.map(salida) });
  } catch (e) { sendError(res, 500, { code: 'PRESENTACIONES_ERROR', message: e.message }, e); }
});

router.post('/', async (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 200);
  const m = CANVA_RE.exec(String(req.body?.url || '').trim());
  if (!title) return sendError(res, 400, { code: 'VALIDATION', message: 'Falta el título' });
  if (!m) return sendError(res, 400, { code: 'VALIDATION', message: 'El enlace no es de un diseño de Canva (https://www.canva.com/design/…)' });
  try {
    await db.query(
      `INSERT INTO owner_presentations (title, design_id, share_token) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), share_token = VALUES(share_token)`,
      [title, m[1], m[2]]
    );
    const [[row]] = await db.query('SELECT * FROM owner_presentations WHERE design_id = ?', [m[1]]);
    res.json({ ok: true, data: salida(row) });
  } catch (e) { sendError(res, 500, { code: 'PRESENTACIONES_ERROR', message: e.message }, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM owner_presentations WHERE id = ?', [req.params.id]);
    res.json({ ok: true, data: { deleted: true } });
  } catch (e) { sendError(res, 500, { code: 'PRESENTACIONES_ERROR', message: e.message }, e); }
});

module.exports = router;
