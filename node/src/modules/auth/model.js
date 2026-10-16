const crypto = require('crypto');
const db = require('../../utils/db');
const uuid = require('../../utils/uuid');

const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_HOURS  = 1;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const User = {
  async findByEmail(email) {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email.toLowerCase().trim()]);
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await db.query(
      'SELECT id, email, name, role, subscription, email_verified, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  async create({ email, passwordHash, name }) {
    const id = uuid();
    // Solo se llega aquí con la casilla de privacidad marcada (controller.register).
    await db.query(
      'INSERT INTO users (id, email, password_hash, name, privacy_accepted_at) VALUES (?, ?, ?, ?, NOW())',
      [id, email.toLowerCase().trim(), passwordHash, name.trim()]
    );
    return { id, email: email.toLowerCase().trim(), name: name.trim(), role: 'user', subscription: 'free', email_verified: 0 };
  },

  async findOrCreateFromGoogle({ email, name, picture }) {
    let user = await User.findByEmail(email);
    // Foto de Google solo si es https de googleusercontent (nada de URLs
    // arbitrarias en el menú) y solo si la persona no tiene ya una.
    picture = User.safeGooglePicture(picture);
    const savePicture = async (id) => {
      if (!picture) return;
      try {
        await db.query('UPDATE users SET avatar_url = ? WHERE id = ? AND (avatar_url IS NULL OR avatar_url = \'\')', [picture, id]);
      } catch (e) { /* BD sin migrar: sin foto */ }
    };
    if (user) {
      await savePicture(user.id);
      // If they already exist via password but never verified, Google login auto-verifies them.
      if (!user.email_verified) {
        await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
      }
      return { id: user.id, email: user.email, name: user.name, role: user.role, subscription: user.subscription, token_version: user.token_version || 0 };
    }

    const id = uuid();
    // Alta con Google: el botón lleva debajo el aviso «Al continuar aceptas la política de privacidad».
    await db.query(
      "INSERT INTO users (id, email, password_hash, name, email_verified, privacy_accepted_at) VALUES (?, ?, '', ?, 1, NOW())",
      [id, email.toLowerCase().trim(), name.trim()]
    );
    await savePicture(id);
    return { id, email: email.toLowerCase().trim(), name: name.trim(), role: 'user', subscription: 'free', created: true };
  },

  /* Devuelve true si la cuenta no estaba verificada (alta que se completa ahora). */
  async markEmailVerified(userId) {
    const [r] = await db.query('UPDATE users SET email_verified = 1 WHERE id = ? AND email_verified = 0', [userId]);
    return r.affectedRows > 0;
  },

  async updatePassword(userId, passwordHash) {
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  },

  /* ── Foto de perfil ───────────────────────────────────────────
   * El círculo de «Mi cuenta» muestra, por orden de preferencia:
   * logo de su entidad → foto del usuario → iniciales (nombre y apellido).
   * Tolerante: si falta la columna (BD sin migrar) devuelve iniciales. */
  async getAvatar(userId, name = '') {
    const out = { avatar_url: null, avatar_source: 'initials', user_avatar_url: null, initials: User.initials(name) };
    try {
      const [orgs] = await db.query(
        `SELECT o.logo_url FROM user_organizations uo
           JOIN organizations o ON o.id = uo.organization_id
          WHERE uo.user_id = ? AND o.logo_url IS NOT NULL AND o.logo_url <> ''
          ORDER BY (o.claimed_by_user_id = uo.user_id) DESC, uo.created_at ASC LIMIT 1`,
        [userId]
      );
      const [[u]] = await db.query('SELECT avatar_url FROM users WHERE id = ? LIMIT 1', [userId]);
      out.user_avatar_url = (u && u.avatar_url) || null;
      if (orgs[0]) { out.avatar_url = orgs[0].logo_url; out.avatar_source = 'organization'; }
      else if (out.user_avatar_url) { out.avatar_url = out.user_avatar_url; out.avatar_source = 'user'; }
    } catch (e) {
      if (!/Unknown column|doesn't exist/i.test(e.message)) throw e;
    }
    return out;
  },

  /* URL de foto de Google aceptable: https y host *.googleusercontent.com. */
  safeGooglePicture(url) {
    if (!url || typeof url !== 'string' || url.length > 500) return null;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return null;
      if (!/(^|\.)googleusercontent\.com$/i.test(u.hostname)) return null;
      return u.toString();
    } catch { return null; }
  },

  /* «Óscar Argumosa Pérez» → «OA». Un solo nombre → sus dos primeras letras. */
  initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  },

  async setAvatarUrl(userId, url) {
    await db.query('UPDATE users SET avatar_url = ? WHERE id = ?', [url, userId]);
  },

  async getAvatarUrl(userId) {
    const [[u]] = await db.query('SELECT avatar_url FROM users WHERE id = ? LIMIT 1', [userId]);
    return (u && u.avatar_url) || null;
  },

  /* Borra del disco una foto subida (no las de Google). Nunca lanza. */
  removeAvatarFile(url) {
    const m = /^\/uploads\/avatars\/(avatar-[A-Za-z0-9-]+\.(?:jpg|png|webp|gif))$/.exec(url || '');
    if (!m) return;
    const file = require('path').join(__dirname, '../../../../public/uploads/avatars', m[1]);
    require('fs').unlink(file, () => {});
  },

  /* Full name update (self-service profile). Returns the fresh safe user. */
  async updateName(userId, name) {
    await db.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), userId]);
    return User.findById(userId);
  },

  /* ── Revocación de sesiones (migración 131) ───────────────────
     Los tokens llevan `tv`; subirlo invalida todos los anteriores. */
  async getTokenVersion(userId) {
    const [rows] = await db.query('SELECT token_version FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] ? (rows[0].token_version || 0) : 0;
  },

  async bumpTokenVersion(userId) {
    await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);
    require('../../middleware/auth').invalidateUserState(userId);
    return User.getTokenVersion(userId);
  },

  /* Password hash only — used to verify the current password before a change.
   * Google-only accounts have an empty hash ('') and can set one directly. */
  async getPasswordHash(userId) {
    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] ? rows[0].password_hash : null;
  },

  /* ── Email verification tokens ─────────────────────────────── */

  async createVerificationToken(userId) {
    // Invalidate any prior unused tokens for this user
    await db.query(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [userId]
    );
    const raw = crypto.randomBytes(32).toString('hex');
    const id  = uuid();
    const expires = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 3600 * 1000);
    await db.query(
      'INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [id, userId, hashToken(raw), expires]
    );
    return raw;
  },

  async consumeVerificationToken(rawToken) {
    const [rows] = await db.query(
      `SELECT t.*, u.id AS uid, u.email, u.name, u.email_verified
         FROM email_verification_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > NOW()
        LIMIT 1`,
      [hashToken(rawToken)]
    );
    const t = rows[0];
    if (!t) return null;
    await db.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?', [t.id]);
    // firstTime: la cuenta pasa ahora de no verificada a verificada (alta completa).
    let firstTime = false;
    if (!t.email_verified) {
      const [r] = await db.query('UPDATE users SET email_verified = 1 WHERE id = ? AND email_verified = 0', [t.uid]);
      firstTime = r.affectedRows > 0;
    }
    return { userId: t.uid, email: t.email, name: t.name, firstTime };
  },

  /* ── Password reset tokens ─────────────────────────────────── */

  async createPasswordResetToken(userId) {
    await db.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [userId]
    );
    const raw = crypto.randomBytes(32).toString('hex');
    const id  = uuid();
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 3600 * 1000);
    await db.query(
      'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [id, userId, hashToken(raw), expires]
    );
    return raw;
  },

  async consumePasswordResetToken(rawToken) {
    const [rows] = await db.query(
      `SELECT t.*, u.id AS uid, u.email
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > NOW()
        LIMIT 1`,
      [hashToken(rawToken)]
    );
    const t = rows[0];
    if (!t) return null;
    await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [t.id]);
    return { userId: t.uid, email: t.email, tokenId: t.id };
  }
};

module.exports = User;
