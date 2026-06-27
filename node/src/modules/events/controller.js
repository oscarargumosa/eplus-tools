/* ── Events Controller — POST /v1/events ──────────────────────────────
   Receives a batch of behavioral events from the client tracker.
   Auth is optional: logged-in → user_id; guest → device_id only. */

const model = require('./model');

exports.track = async (req, res, next) => {
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    const ua = String(req.headers['user-agent'] || '').slice(0, 255);
    const stored = await model.insertBatch(events, { userId: req.user?.id || null, ua });
    res.json({ ok: true, data: { stored } });
  } catch (err) {
    next(err);
  }
};

// Admin-only engagement rollup for the Admin dashboard.
exports.engagement = async (req, res, next) => {
  try {
    const data = await model.engagement();
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};
