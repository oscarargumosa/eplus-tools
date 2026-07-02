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
  if (!/^[A-Za-z0-9.\-_]+$/.test(id)) return null;       // anti path-traversal
  return readJSON(path.join(LESSONS, `${id}.json`), null);
}

function getNotes() {
  return readJSON(NOTES, {});
}

function writeNotes(data) {
  fs.writeFileSync(NOTES, JSON.stringify(data, null, 2), 'utf8');
}

/* Añade una nota a (lessonId, anchor). anchor = id de sección, o
   "_lesson" / "_module" para notas de nivel superior. */
function addNote(lessonId, anchor, text, author, quote) {
  const notes = getNotes();
  notes[lessonId] = notes[lessonId] || {};
  notes[lessonId][anchor] = notes[lessonId][anchor] || [];
  const note = {
    id: 'n_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    text: String(text || '').slice(0, 4000),
    author: author || 'Oscar',
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
  const notes = getNotes();
  const arr = (notes[lessonId] && notes[lessonId][anchor]) || [];
  const n = arr.find(x => x.id === noteId);
  if (!n) return null;
  if (typeof patch.text === 'string') n.text = patch.text.slice(0, 4000);
  if (typeof patch.status === 'string') n.status = patch.status;
  writeNotes(notes);
  return n;
}

function deleteNote(lessonId, anchor, noteId) {
  const notes = getNotes();
  if (!notes[lessonId] || !notes[lessonId][anchor]) return false;
  const before = notes[lessonId][anchor].length;
  notes[lessonId][anchor] = notes[lessonId][anchor].filter(x => x.id !== noteId);
  if (notes[lessonId][anchor].length === 0) delete notes[lessonId][anchor];
  if (notes[lessonId] && Object.keys(notes[lessonId]).length === 0) delete notes[lessonId];
  writeNotes(notes);
  return notes ? before !== (getNotes()[lessonId]?.[anchor]?.length || 0) || true : true;
}

module.exports = {
  getCurriculum, getLesson, getNotes,
  addNote, updateNote, deleteNote,
};
