/* Academy — rutas. Montado en /v1/academy (ver server.js).
   Sistema interno de revisión de contenido de cursos. */

const express = require('express');
const router  = express.Router();
const c       = require('./controller');

router.get('/curriculum', c.curriculum);
router.get('/lesson/:id', c.lesson);

router.get('/notes', c.notes);
router.post('/notes', c.addNote);
router.patch('/notes/:lessonId/:anchor/:noteId', c.updateNote);
router.delete('/notes/:lessonId/:anchor/:noteId', c.deleteNote);

module.exports = router;
