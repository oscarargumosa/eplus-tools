/* ═══════════════════════════════════════════════════════════════
   Academy — modelo de datos basado en ficheros JSON del repo.
   El contenido de los cursos vive en data/academy/. Las notas de
   revisión de Oscar se persisten en data/academy/notes.json para
   que Claude pueda leerlas desde el repo (sistema de revisión).
   ═══════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..', '..', '..', '..', 'data', 'academy');
const LESSONS   = path.join(ROOT, 'lessons');
const NOTES     = path.join(ROOT, 'notes.json');
const CURR      = path.join(ROOT, 'curriculum.json');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

/* Currículo con ids deterministas por lección: `${moduleCode}.${idx+1}`.
   Añade hasContent=true si existe el JSON de contenido de esa lección. */
function getCurriculum() {
  const raw = readJSON(CURR, { tronco: [], esp: [] });
  const decorate = (mods) => (mods || []).map(m => ({
    ...m,
    ls: (m.ls || []).map((l, i) => {
      const id = `${m.c}.${i + 1}`;
      return { ...l, id, hasContent: fs.existsSync(path.join(LESSONS, `${id}.json`)) };
    })
  }));
  return {
    nota: raw.nota || '',
    tronco: decorate(raw.tronco),
    esp: decorate(raw.esp),
  };
}

function getLesson(id) {
  if (!isValidId(id)) return null;       // anti path-traversal
  return readJSON(path.join(LESSONS, `${id}.json`), null);
}

/* Ids válidos para lessonId / anchor / noteId: alfanumérico, punto, guion y
   guion bajo. Se rechazan nombres que tocan el prototipo ("__proto__",
   "constructor", "prototype") aunque además usamos objetos sin prototipo. */
const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
function isValidId(s) {
  return typeof s === 'string' && ID_RE.test(s) && !RESERVED.has(s);
}

/* Lee notes.json como objetos sin prototipo (Object.create(null)), así una
   clave "__proto__" no puede contaminar Object.prototype. */
function getNotes() {
  const raw = readJSON(NOTES, {});
  const out = Object.create(null);
  if (!raw || typeof raw !== 'object') return out;
  for (const lessonId of Object.keys(raw)) {
    if (!isValidId(lessonId) || !raw[lessonId] || typeof raw[lessonId] !== 'object') continue;
    const byAnchor = Object.create(null);
    for (const anchor of Object.keys(raw[lessonId])) {
      if (!isValidId(anchor) || !Array.isArray(raw[lessonId][anchor])) continue;
      byAnchor[anchor] = raw[lessonId][anchor];
    }
    out[lessonId] = byAnchor;
  }
  return out;
}

function writeNotes(data) {
  fs.writeFileSync(NOTES, JSON.stringify(data, null, 2), 'utf8');
}

/* Añade una nota a (lessonId, anchor). anchor = id de sección, o
   "_lesson" / "_module" para notas de nivel superior. */
function addNote(lessonId, anchor, text, author, quote) {
  if (!isValidId(lessonId) || !isValidId(anchor)) return null;
  const notes = getNotes();
  notes[lessonId] = notes[lessonId] || Object.create(null);
  notes[lessonId][anchor] = notes[lessonId][anchor] || [];
  const note = {
    id: 'n_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    text: String(text || '').slice(0, 4000),
    author: String(author || 'Oscar').slice(0, 100),
    ts: new Date().toISOString(),
    status: 'open',
  };
  // Nota anclada a una selección de texto resaltada: guardamos la cita.
  if (quote && String(quote).trim()) note.quote = String(quote).slice(0, 500);
  notes[lessonId][anchor].push(note);
  writeNotes(notes);
  return note;
}

function updateNote(lessonId, anchor, noteId, patch) {
  if (!isValidId(lessonId) || !isValidId(anchor) || !isValidId(noteId)) return null;
  const notes = getNotes();
  const arr = (notes[lessonId] && notes[lessonId][anchor]) || [];
  const n = arr.find(x => x.id === noteId);
  if (!n) return null;
  if (typeof patch.text === 'string') n.text = patch.text.slice(0, 4000);
  if (patch.status === 'open' || patch.status === 'done') n.status = patch.status;
  writeNotes(notes);
  return n;
}

function deleteNote(lessonId, anchor, noteId) {
  if (!isValidId(lessonId) || !isValidId(anchor) || !isValidId(noteId)) return false;
  const notes = getNotes();
  if (!notes[lessonId] || !notes[lessonId][anchor]) return false;
  const before = notes[lessonId][anchor].length;
  notes[lessonId][anchor] = notes[lessonId][anchor].filter(x => x.id !== noteId);
  const removed = notes[lessonId][anchor].length !== before;
  if (notes[lessonId][anchor].length === 0) delete notes[lessonId][anchor];
  if (Object.keys(notes[lessonId]).length === 0) delete notes[lessonId];
  writeNotes(notes);
  return removed;
}

module.exports = {
  isValidId,
  getCurriculum, getLesson, getNotes,
  addNote, updateNote, deleteNote,
};
