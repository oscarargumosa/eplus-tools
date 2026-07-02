/* ── Events Model — first-party behavioral tracking (TASK-009 Fase 1) ──
   Bulk-inserts a batch of validated events. user_id when logged in;
   device_id always (stitch guest→user later). Never throws to caller
   on individual bad events — it just skips them. */

const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');

// Whitelist of accepted event names (anything else is dropped silently).
const ALLOWED = new Set([
  'session_start', 'section_view', 'section_time', 'gate_hit',
  'call_opened', 'entity_opened', 'mobility_opened',
  'project_started', 'search',
]);

const MAX_BATCH = 50;
const s = (v, n) => (v == null ? null : String(v).slice(0, n));

async function insertBatch(events, { userId = null, ua = null } = {}) {
  if (!Array.isArray(events) || !events.length) return 0;
  const rows = [];
  for (const e of events.slice(0, MAX_BATCH)) {
    if (!e || typeof e.name !== 'string' || !ALLOWED.has(e.name)) continue;
    let seconds = null;
    if (typeof e.seconds === 'number' && Number.isFinite(e.seconds)) {
      seconds = Math.max(0, Math.min(86400, Math.round(e.seconds)));
    }
    let props = null;
    if (e.props && typeof e.props === 'object') {
      try { props = JSON.stringify(e.props).slice(0, 2000); } catch {}
    }
    rows.push([
      genUUID(),
      userId,
      s(e.device_id, 36),
      s(e.session_id, 36),
      e.name,
      s(e.route, 48),
      s(e.ref_id, 64),
      s(e.programme, 96),
      seconds,
      props,
      s(ua, 255),
    ]);
  }
  if (!rows.length) return 0;
  await db.query(
    `INSERT INTO events
       (id, user_id, device_id, session_id, name, route, ref_id, programme, seconds, props, ua)
     VALUES ?`,
    [rows]
  );
  return rows.length;
}

/* ── Engagement rollup (admin dashboard, read-only) ──────────────────
   Agregaciones ligeras sobre la tabla events para el panel Admin. */
async function engagement() {
  const [[summary]] = await db.query(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT device_id) AS devices,
            COUNT(DISTINCT user_id)   AS users,
            COUNT(DISTINCT session_id) AS sessions,
            SUM(ts >= NOW() - INTERVAL 7 DAY) AS last7d
       FROM events`
  );
  const [byType] = await db.query(
    `SELECT name, COUNT(*) AS n FROM events GROUP BY name ORDER BY n DESC`
  );
  const [sections] = await db.query(
    `SELECT route,
            SUM(name = 'section_view') AS views,
            COALESCE(SUM(seconds), 0)  AS secs
       FROM events
      WHERE route IS NOT NULL
      GROUP BY route
      ORDER BY views DESC
      LIMIT 30`
  );
  const [programmes] = await db.query(
    `SELECT programme, COUNT(*) AS n
       FROM events
      WHERE name = 'call_opened' AND programme IS NOT NULL AND programme <> ''
      GROUP BY programme ORDER BY n DESC LIMIT 15`
  );
  const [gates] = await db.query(
    `SELECT route, COUNT(*) AS n
       FROM events
      WHERE name = 'gate_hit'
      GROUP BY route ORDER BY n DESC LIMIT 15`
  );
  const [visitors] = await db.query(
    `SELECT COALESCE(user_id, device_id) AS who,
            MAX(user_id IS NOT NULL)      AS logged,
            COUNT(*)                      AS events,
            COUNT(DISTINCT route)         AS sections,
            COALESCE(SUM(seconds), 0)     AS secs,
            MAX(ts)                       AS last_seen
       FROM events
      GROUP BY who
      ORDER BY last_seen DESC
      LIMIT 25`
  );
  return { summary, byType, sections, programmes, gates, visitors };
}

module.exports = { insertBatch, engagement };
