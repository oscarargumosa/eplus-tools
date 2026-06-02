/* ── Convocatorias Curation — admin-only state per call ─────────────
   Persists in data/call_curation.json with the shape:
     {
       "<source_id>": {
         hidden: bool,
         reviewed_at: ISO|null,
         reviewed_by: user_id|null,
         notes: string|null,
         updated_at: ISO
       }
     }
   ───────────────────────────────────────────────────────────────── */
'use strict';
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', '..', '..', 'data', 'call_curation.json');

let _cache = null;
let _cacheMtime = 0;

function load() {
  if (!fs.existsSync(FILE)) return {};
  try {
    const stat = fs.statSync(FILE);
    if (_cache && stat.mtimeMs === _cacheMtime) return _cache;
    _cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    _cacheMtime = stat.mtimeMs;
    return _cache;
  } catch { return {}; }
}

function save(map) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
  _cache = map;
  _cacheMtime = fs.statSync(FILE).mtimeMs;
}

function getAll() { return load(); }
function get(sourceId) { return load()[sourceId] || null; }

function migrateLegacyNotes(entry, userId, userName) {
  // Legacy: notes was a single string. Convert to a single log entry on first touch.
  if (entry && typeof entry.notes === 'string' && entry.notes.trim() && !Array.isArray(entry.notes_log)) {
    entry.notes_log = [{
      text: entry.notes,
      author_id: entry.reviewed_by || null,
      author_name: '(migrado de nota legacy)',
      created_at: entry.updated_at || new Date().toISOString(),
    }];
    delete entry.notes;
  }
  if (!Array.isArray(entry.notes_log)) entry.notes_log = [];
  return entry;
}

function patch(sourceId, partial, user) {
  if (!sourceId) throw Object.assign(new Error('sourceId required'), { status: 400 });
  const userId = user?.id || null;
  const userName = user?.name || user?.email || 'admin';
  const map = { ...load() };
  let prev = map[sourceId] || { hidden: false, reviewed_at: null, reviewed_by: null, notes_log: [] };
  prev = migrateLegacyNotes({ ...prev }, userId, userName);
  const next = { ...prev };

  if ('hidden' in partial) next.hidden = !!partial.hidden;
  if ('reviewed' in partial) {
    if (partial.reviewed) {
      next.reviewed_at = new Date().toISOString();
      next.reviewed_by = userId || null;
      next.reviewed_by_name = userName;
    } else {
      next.reviewed_at = null;
      next.reviewed_by = null;
      next.reviewed_by_name = null;
    }
  }
  // Add a new log entry (preferred path going forward)
  if (typeof partial.add_note === 'string' && partial.add_note.trim()) {
    next.notes_log = [
      ...(next.notes_log || []),
      {
        text: partial.add_note.trim().slice(0, 2000),
        author_id: userId,
        author_name: userName,
        created_at: new Date().toISOString(),
      },
    ];
  }
  // Delete a log entry by index
  if (Number.isInteger(partial.delete_note_index)) {
    next.notes_log = (next.notes_log || []).filter((_, i) => i !== partial.delete_note_index);
  }
  next.updated_at = new Date().toISOString();

  // Cleanup: drop entry if everything default
  const hasNotes = (next.notes_log || []).length > 0;
  if (!next.hidden && !next.reviewed_at && !hasNotes) {
    delete map[sourceId];
  } else {
    map[sourceId] = next;
  }
  save(map);
  return map[sourceId] || null;
}

module.exports = { getAll, get, patch };
