/* Academy — controlador. Sistema de revisión de contenido de cursos. */

const model = require('./model');

const ok  = (res, data) => res.json({ ok: true, data });
const bad = (res, code, message, status = 400) =>
  res.status(status).json({ ok: false, error: { code, message } });

exports.curriculum = (req, res) => ok(res, model.getCurriculum());

exports.lesson = (req, res) => {
  const lesson = model.getLesson(req.params.id);
  if (!lesson) return bad(res, 'NOT_FOUND', 'Lección sin contenido todavía', 404);
  return ok(res, lesson);
};

exports.notes = (req, res) => ok(res, model.getNotes());

exports.addNote = (req, res) => {
  const { lessonId, anchor, text, author, quote } = req.body || {};
  if (!lessonId || !anchor) return bad(res, 'BAD_INPUT', 'Falta lessonId o anchor');
  if (!text || !String(text).trim()) return bad(res, 'BAD_INPUT', 'La nota está vacía');
  const note = model.addNote(lessonId, anchor, text, author, quote);
  return ok(res, note);
};

exports.updateNote = (req, res) => {
  const { lessonId, anchor, noteId } = req.params;
  const n = model.updateNote(lessonId, anchor, noteId, req.body || {});
  if (!n) return bad(res, 'NOT_FOUND', 'Nota no encontrada', 404);
  return ok(res, n);
};

exports.deleteNote = (req, res) => {
  const { lessonId, anchor, noteId } = req.params;
  model.deleteNote(lessonId, anchor, noteId);
  return ok(res, { deleted: true });
};
