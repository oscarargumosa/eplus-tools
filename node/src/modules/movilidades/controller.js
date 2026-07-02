/* ── Movilidades Controller — sirve data/salto/trainings.json ──────── */
const fs   = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'salto', 'trainings.json');

let cache = null;
let cacheMtime = 0;

function loadData() {
  try {
    const stat = fs.statSync(DATA_PATH);
    if (!cache || stat.mtimeMs !== cacheMtime) {
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      cache = JSON.parse(raw);
      cacheMtime = stat.mtimeMs;
    }
    return cache;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { fetched_at: null, source: null, items: [], _missing: true };
    }
    throw err;
  }
}

exports.list = (_req, res, next) => {
  try {
    const data = loadData();
    res.json({
      ok: true,
      data: {
        fetched_at: data.fetched_at || null,
        source: data.source || null,
        total: (data.items || []).length,
        items: data.items || []
      }
    });
  } catch (err) {
    next(err);
  }
};
