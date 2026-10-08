/* ── Subscribers Model — newsletter list ─────────────────────────────── */

const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');
const ghlSync = require('../ghl/sync');
const { maskEmail } = require('../../utils/logger');

const TAG_RANK = { cold: 0, warm: 1, hot: 2 };

/**
 * Fire-and-forget GHL sync. Logs warnings but never throws.
 * No-op if GHL is not configured (returns { skipped: true }).
 */
function _ghlSync(email, tag, source) {
  if (!email) return;
  ghlSync
    .upsertContact({ email, tag, source })
    .then(res => {
      if (res?.ok) {
        console.log(`[GHL] synced ${maskEmail(email)} → ${tag}${res.isNew ? ' (new contact)' : ''}`);
      } else if (!res?.skipped) {
        console.warn(`[GHL] sync failed for ${maskEmail(email)}:`, res?.error);
      }
    })
    .catch(err => console.warn(`[GHL] sync threw for ${maskEmail(email)}:`, err.message));
}

/**
 * Insert or upsert a subscriber. Promotion is monotonic:
 * an existing subscriber is only updated if the new tag is HIGHER
 * than the current one. We never demote.
 *
 * Returns { subscriber, created: boolean, promoted: boolean }.
 */
async function upsertSubscriber({ email, source = 'blog', tag = 'cold', userId = null, ip = null, ua = null }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    const err = new Error('email is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const err = new Error('email format invalid');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!(tag in TAG_RANK)) tag = 'cold';

  const [existing] = await db.execute(
    'SELECT id, email, source, tag, user_id, unsubscribed FROM newsletter_subscribers WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );

  if (existing.length) {
    const row = existing[0];
    const newRank = TAG_RANK[tag];
    const oldRank = TAG_RANK[row.tag] ?? 0;
    const shouldPromote = newRank > oldRank;
    const shouldAttachUser = userId && !row.user_id;

    if (shouldPromote || shouldAttachUser) {
      await db.execute(
        `UPDATE newsletter_subscribers
            SET tag = ?, user_id = COALESCE(user_id, ?), updated_at = NOW()
          WHERE id = ?`,
        [shouldPromote ? tag : row.tag, userId, row.id]
      );
    }

    const [refreshed] = await db.execute(
      'SELECT id, email, source, tag, user_id, unsubscribed, created_at, updated_at FROM newsletter_subscribers WHERE id = ?',
      [row.id]
    );
    // Sync to GHL only when promoted (existing contact's tag changed).
    if (shouldPromote) _ghlSync(refreshed[0].email, refreshed[0].tag, refreshed[0].source);
    return { subscriber: refreshed[0], created: false, promoted: shouldPromote };
  }

  const id = genUUID();
  await db.execute(
    `INSERT INTO newsletter_subscribers (id, email, source, tag, user_id, consent_ip, consent_ua)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, normalizedEmail, source, tag, userId, ip, ua]
  );
  const [rows] = await db.execute(
    'SELECT id, email, source, tag, user_id, unsubscribed, created_at, updated_at FROM newsletter_subscribers WHERE id = ?',
    [id]
  );
  // New subscriber → always sync to GHL.
  _ghlSync(rows[0].email, rows[0].tag, rows[0].source);
  return { subscriber: rows[0], created: true, promoted: false };
}

/**
 * Promote an email by user signal (signup → warm, first real project → hot).
 * No-op if email is not in the list; no-op if already at higher tag.
 */
async function promoteByEmail(email, targetTag, userId = null) {
  if (!email) return null;
  const [existing] = await db.execute(
    'SELECT id, tag FROM newsletter_subscribers WHERE email = ? LIMIT 1',
    [String(email).trim().toLowerCase()]
  );
  if (!existing.length) return null;
  const row = existing[0];
  if (TAG_RANK[targetTag] <= (TAG_RANK[row.tag] ?? 0)) return row;
  await db.execute(
    `UPDATE newsletter_subscribers
        SET tag = ?, user_id = COALESCE(user_id, ?), updated_at = NOW()
      WHERE id = ?`,
    [targetTag, userId, row.id]
  );
  // Reflect promotion in GHL (cold→warm or warm→hot).
  _ghlSync(String(email).trim().toLowerCase(), targetTag, null);
  return { id: row.id, tag: targetTag };
}

/**
 * List subscribers with optional filters. Admin use only.
 */
async function listSubscribers({ tag = null, source = null, page = 1, perPage = 50 } = {}) {
  const where = [];
  const params = [];
  if (tag)    { where.push('tag = ?'); params.push(tag); }
  if (source) { where.push('source = ?'); params.push(source); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM newsletter_subscribers ${whereSql}`, params);
  const total = countRows[0].total;

  const limit  = Math.min(Math.max(perPage, 1), 500);
  const offset = Math.max((page - 1) * limit, 0);
  const [rows] = await db.execute(
    `SELECT id, email, source, tag, user_id, unsubscribed, created_at, updated_at
       FROM newsletter_subscribers
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)]
  );
  return { data: rows, total, page, per_page: limit };
}

module.exports = { upsertSubscriber, promoteByEmail, listSubscribers };
