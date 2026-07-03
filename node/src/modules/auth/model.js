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
    await db.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
      [id, email.toLowerCase().trim(), passwordHash, name.trim()]
    );
    return { id, email: email.toLowerCase().trim(), name: name.trim(), role: 'user', subscription: 'free', email_verified: 0 };
  },

  async findOrCreateFromGoogle({ email, name }) {
    let user = await User.findByEmail(email);
    if (user) {
      // If they already exist via password but never verified, Google login auto-verifies them.
      if (!user.email_verified) {
        await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
      }
      return { id: user.id, email: user.email, name: user.name, role: user.role, subscription: user.subscription };
    }

    const id = uuid();
    await db.query(
      "INSERT INTO users (id, email, password_hash, name, email_verified) VALUES (?, ?, '', ?, 1)",
      [id, email.toLowerCase().trim(), name.trim()]
    );
    return { id, email: email.toLowerCase().trim(), name: name.trim(), role: 'user', subscription: 'free' };
  },

  async markEmailVerified(userId) {
    await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);
  },

  async updatePassword(userId, passwordHash) {
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  },

  /* Full name update (self-service profile). Returns the fresh safe user. */
  async updateName(userId, name) {
    await db.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), userId]);
    return User.findById(userId);
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
      `SELECT t.*, u.id AS uid, u.email, u.email_verified
         FROM email_verification_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > NOW()
        LIMIT 1`,
      [hashToken(rawToken)]
    );
    const t = rows[0];
    if (!t) return null;
    await db.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?', [t.id]);
    if (!t.email_verified) {
      await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [t.uid]);
    }
    return { userId: t.uid, email: t.email };
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
