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
  'cta_click', 'video_play',          // landing de invitados (public/landing.html)
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
   Agregaciones ligeras sobre la tabla events para el panel Admin.

   Cada evento lleva un origen:
   - 'casa'  : cuenta del equipo (users.interno = 1 o rol distinto de 'user')
               o un dispositivo en el que alguna vez entró una de ellas
               (cubre lo que hicimos antes de iniciar sesión).
   - 'robot' : navegador automático por su user-agent (buscadores, vistas
               previas de enlaces, nuestras capturas con Chrome headless).
   - 'fuera' : todo lo demás. Es lo que interesa por defecto. */
const ORIGENES = ['fuera', 'casa', 'robot', 'todo'];
const BOT_UA = 'bot|crawl|spider|slurp|headless|preview|scrapy|python-|curl/|wget|webindexer|lighthouse|facebookexternalhit|playwright|puppeteer|-detect/';

const WITH_ORIGEN = `
  WITH casa_u AS (SELECT id FROM users WHERE interno = 1 OR role <> 'user'),
       casa_d AS (SELECT DISTINCT device_id FROM events
                   WHERE device_id IS NOT NULL AND user_id IN (SELECT id FROM casa_u)),
       ev AS (
         SELECT e.*,
                CASE
                  WHEN e.user_id IN (SELECT id FROM casa_u)
                    OR e.device_id IN (SELECT device_id FROM casa_d) THEN 'casa'
                  WHEN LOWER(COALESCE(e.ua, '')) REGEXP '${BOT_UA}' THEN 'robot'
                  ELSE 'fuera'
                END AS origen
           FROM events e)`;

async function engagement({ origen = 'fuera' } = {}) {
  if (!ORIGENES.includes(origen)) origen = 'fuera';
  const where = origen === 'todo' ? '1=1' : 'origen = ?';
  const p = origen === 'todo' ? [] : [origen];

  const [[summary]] = await db.query(
    `${WITH_ORIGEN}
     SELECT COUNT(*) AS total,
            COUNT(DISTINCT device_id) AS devices,
            COUNT(DISTINCT user_id)   AS users,
            COUNT(DISTINCT session_id) AS sessions,
            COALESCE(SUM(ts >= NOW() - INTERVAL 7 DAY), 0) AS last7d
       FROM ev WHERE ${where}`, p
  );
  const [byOrigin] = await db.query(
    `${WITH_ORIGEN}
     SELECT origen, COUNT(*) AS events, COUNT(DISTINCT COALESCE(user_id, device_id)) AS visitors
       FROM ev GROUP BY origen`
  );
  const [byType] = await db.query(
    `${WITH_ORIGEN}
     SELECT name, COUNT(*) AS n FROM ev WHERE ${where} GROUP BY name ORDER BY n DESC`, p
  );
  const [sections] = await db.query(
    `${WITH_ORIGEN}
     SELECT route,
            SUM(name = 'section_view') AS views,
            COALESCE(SUM(seconds), 0)  AS secs
       FROM ev
      WHERE route IS NOT NULL AND ${where}
      GROUP BY route
      ORDER BY views DESC
      LIMIT 30`, p
  );
  const [programmes] = await db.query(
    `${WITH_ORIGEN}
     SELECT programme, COUNT(*) AS n
       FROM ev
      WHERE name = 'call_opened' AND programme IS NOT NULL AND programme <> '' AND ${where}
      GROUP BY programme ORDER BY n DESC LIMIT 15`, p
  );
  const [gates] = await db.query(
    `${WITH_ORIGEN}
     SELECT route, COUNT(*) AS n
       FROM ev
      WHERE name = 'gate_hit' AND ${where}
      GROUP BY route ORDER BY n DESC LIMIT 15`, p
  );
  // Los de fuera con cuenta salen con nombre y email (el panel es solo admin).
  const [visitors] = await db.query(
    `${WITH_ORIGEN}
     SELECT v.*, u.name, u.email
       FROM (SELECT COALESCE(user_id, device_id) AS who,
                    MAX(user_id)                  AS user_id,
                    MAX(origen)                   AS origen,
                    COUNT(*)                      AS events,
                    COUNT(DISTINCT route)         AS sections,
                    COALESCE(SUM(seconds), 0)     AS secs,
                    MIN(ts)                       AS first_seen,
                    MAX(ts)                       AS last_seen,
                    MAX(ua)                       AS ua
               FROM ev WHERE ${where}
              GROUP BY who) v
       LEFT JOIN users u ON u.id = v.user_id
      ORDER BY v.last_seen DESC
      LIMIT 25`, p
  );
  return { origen, summary, byOrigin, byType, sections, programmes, gates, visitors };
}

module.exports = { insertBatch, engagement };
