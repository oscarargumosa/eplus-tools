/* ── VPS Analytics Module — controller (read-only) ─────────── */
const m = require('./model');

const ok = (res, data) => res.json({ ok: true, data });
const { sendError } = require('../../utils/httpError');
// 5xx: mensaje genérico + requestId (el detalle va al log). Ver utils/httpError.
const fail = (res, err) => sendError(res, 500, { code: 'VPS_QUERY_ERROR', message: err.message }, err);

/* ── /v1/vps/health ──────────────────────────────────────────── */
exports.health = async (req, res) => {
  try {
    const row = await m.queryOne('SELECT now() AS now, version() AS version');
    ok(res, { now: row.now, pg: row.version.split(' ').slice(0,2).join(' ') });
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/overview ─────────────────────────────────── */
exports.eaceaOverview = async (req, res) => {
  try {
    const rows = await m.query(`
      SELECT eacea_family,
             projects,
             grant_total_eur::float8 AS grant_total_eur,
             grant_avg_eur,
             duration_avg_months,
             with_report,
             good_practice,
             innovative_award,
             year_min,
             year_max,
             consortium_avg_countries,
             consortium_median_countries,
             consortium_max_countries
      FROM directory.eacea_dashboard_overview
      ORDER BY projects DESC`);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/by-country?family=... ────────────────────── */
exports.eaceaByCountry = async (req, res) => {
  const { family } = req.query;
  try {
    const params = []; let where = '';
    if (family) { params.push(family); where = `WHERE eacea_family = $1`; }
    const rows = await m.query(`
      SELECT coordinator_country,
             SUM(projects)::int AS projects,
             SUM(grant_total_eur)::float8 AS grant_total_eur,
             SUM(innovative_award)::int AS innovative_award,
             SUM(good_practice)::int AS good_practice
      FROM directory.eacea_stats_country_family_year
      ${where}
      GROUP BY coordinator_country
      ORDER BY projects DESC
      LIMIT 60`, params);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/timeline?family=&country= ────────────────── */
exports.eaceaTimeline = async (req, res) => {
  const { family, country } = req.query;
  try {
    const where = []; const params = [];
    if (family)  { params.push(family);  where.push(`eacea_family = $${params.length}`); }
    if (country) { params.push(country); where.push(`coordinator_country = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await m.query(`
      SELECT funding_year,
             SUM(projects)::int AS projects,
             SUM(grant_total_eur)::float8 AS grant_total_eur,
             SUM(with_report)::int AS with_report
      FROM directory.eacea_stats_country_family_year
      ${w}
      GROUP BY funding_year
      ORDER BY funding_year`, params);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/top-coordinators?family=&country= ────────── */
exports.eaceaTopCoordinators = async (req, res) => {
  const { family, country, limit = 25 } = req.query;
  try {
    const where = []; const params = [];
    if (family)  { params.push(family);  where.push(`eacea_family = $${params.length}`); }
    if (country) { params.push(country); where.push(`coordinator_country = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit) || 25, 100));
    const rows = await m.query(`
      SELECT coordinator_name, coordinator_country, eacea_family, projects,
             grant_total_eur::float8 AS grant_total_eur,
             good_practice, innovative_award, year_min, year_max
      FROM directory.eacea_top_coordinators
      ${w}
      ORDER BY projects DESC, grant_total_eur DESC
      LIMIT $${params.length}`, params);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/topics?family= ───────────────────────────── */
exports.eaceaTopics = async (req, res) => {
  const { family, limit = 50 } = req.query;
  try {
    if (family) {
      const rows = await m.query(`
        SELECT topic, projects, grant_avg_eur, good_practice, innovative_award
        FROM directory.eacea_topic_family
        WHERE eacea_family = $1
        ORDER BY projects DESC LIMIT $2`,
        [family, Math.min(parseInt(limit) || 50, 200)]);
      ok(res, rows);
    } else {
      const rows = await m.query(`
        SELECT topic, projects, grant_avg_eur, good_practice, innovative_award,
               pct_award, families_using, countries_using
        FROM directory.eacea_topics_catalog
        ORDER BY projects DESC LIMIT $1`,
        [Math.min(parseInt(limit) || 50, 200)]);
      ok(res, rows);
    }
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/topic-trend ──────────────────────────────── */
exports.eaceaTopicTrend = async (req, res) => {
  try {
    const rows = await m.query(`
      SELECT topic, total_projects, proj_2014_2020, proj_2021_2025, growth_pct
      FROM directory.eacea_topic_trend
      WHERE total_projects >= 20
      ORDER BY growth_pct DESC NULLS LAST`);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/topic-winners?family= ────────────────────── */
exports.eaceaTopicWinners = async (req, res) => {
  const { family } = req.query;
  try {
    const params = []; let where = '';
    if (family) { params.push(family); where = `WHERE eacea_family = $1`; }
    const rows = await m.query(`
      SELECT topic, eacea_family, projects,
             grant_avg_eur,
             median_grant::float8 AS median_grant,
             pct_above_median::float8 AS pct_above_median,
             pct_award_in_topic::float8 AS pct_award_in_topic
      FROM directory.eacea_topic_winners_family
      ${where}
      ORDER BY pct_above_median DESC NULLS LAST
      LIMIT 100`, params);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/growth ───────────────────────────────────── */
exports.eaceaGrowth = async (req, res) => {
  const { family } = req.query;
  try {
    const params = []; let where = '';
    if (family) { params.push(family); where = `WHERE eacea_family = $1`; }
    const rows = await m.query(`
      SELECT eacea_family, coordinator_country, proj_2014_2020, proj_2021_2025,
             growth_pct_projects, growth_pct_grant
      FROM directory.eacea_growth
      ${where}
      ORDER BY growth_pct_projects DESC NULLS LAST
      LIMIT 100`, params);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/writing ──────────────────────────────────── */
exports.eaceaWriting = async (req, res) => {
  try {
    const rows = await m.query(`
      SELECT eacea_family, projects,
             avg_chars, avg_words, avg_sentences, avg_numbers,
             pct_innov, pct_digital, pct_green, pct_inclusion,
             pct_youth, pct_gender, pct_business
      FROM directory.eacea_writing_agg
      ORDER BY projects DESC`);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/network?family= ──────────────────────────── */
exports.eaceaNetwork = async (req, res) => {
  const { family, country, limit = 100 } = req.query;
  try {
    const where = []; const params = [];
    if (family)  { params.push(family);  where.push(`eacea_family = $${params.length}`); }
    if (country) { params.push(country); where.push(`(country_a = $${params.length} OR country_b = $${params.length})`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit) || 100, 500));
    const rows = await m.query(`
      SELECT country_a, country_b, SUM(projects)::int AS projects
      FROM directory.eacea_country_pairs
      ${w}
      GROUP BY country_a, country_b
      ORDER BY projects DESC
      LIMIT $${params.length}`, params);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/bertopic ─────────────────────────────────── */
exports.eaceaBertopic = async (req, res) => {
  const { family } = req.query;
  try {
    const params = []; let where = 'WHERE topic_id <> -1';
    if (family) { params.push(family); where += ` AND eacea_family = $${params.length}`; }
    const rows = await m.query(`
      SELECT eacea_family, topic_id, label, words, projects, representative_titles
      FROM directory.eacea_bertopic_topics
      ${where}
      ORDER BY projects DESC
      LIMIT 200`, params);
    ok(res, rows);
  } catch (e) { fail(res, e); }
};

/* ── /v1/vps/eacea/similar (proxy a microservicio Python 5051) ── */
const SIMILAR_URL = process.env.EACEA_SIMILAR_URL || 'http://127.0.0.1:5051';

exports.eaceaSimilar = async (req, res) => {
  const { q, family, topk = 20 } = req.body || {};
  if (!q || typeof q !== 'string' || q.trim().length < 3) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_QUERY', message: 'q (>=3 chars) requerido' } });
  }
  try {
    const r = await fetch(`${SIMILAR_URL}/similar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: q.trim(), family: family || null, topk: Math.min(parseInt(topk) || 20, 50) })
    });
    const j = await r.json();
    if (!j.ok) return res.status(502).json({ ok: false, error: { code: 'SIMILAR_DOWN', message: j.error || 'similarity service error' } });
    res.json({ ok: true, data: j.data });
  } catch (e) {
    fail(res, e);
  }
};

exports.eaceaSimilarHealth = async (req, res) => {
  try {
    const r = await fetch(`${SIMILAR_URL}/health`);
    const j = await r.json();
    res.json({ ok: true, data: j });
  } catch (e) {
    sendError(res, 502, { code: 'SIMILAR_DOWN', message: e.message }, e);
  }
};

/* ── /v1/vps/eacea/families ─────────────────────────────────── */
exports.eaceaFamilies = async (req, res) => {
  try {
    const rows = await m.query(`
      SELECT DISTINCT eacea_family FROM directory.projects_eacea ORDER BY 1`);
    ok(res, rows.map(r => r.eacea_family));
  } catch (e) { fail(res, e); }
};
