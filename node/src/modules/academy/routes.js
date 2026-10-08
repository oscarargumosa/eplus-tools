/* Academy — rutas. Montado en /v1/academy (ver server.js).
   Sistema interno de revisión de contenido de cursos.
   Solo admin (antes era público: cualquiera leía y escribía notes.json). */

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../../middleware/auth');
const c       = require('./controller');

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
  }
  next();
}

router.use(requireAuth, requireAdmin);

router.get('/curriculum', c.curriculum);
router.get('/lesson/:id', c.lesson);

router.get('/notes', c.notes);
router.post('/notes', c.addNote);
router.patch('/notes/:lessonId/:anchor/:noteId', c.updateNote);
router.delete('/notes/:lessonId/:anchor/:noteId', c.deleteNote);

module.exports = router;
