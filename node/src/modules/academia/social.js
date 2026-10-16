/* Academia — lo personal y lo compartido de una lección (como el aula de Emociona):
   - Corazones por hoja de lectura («me encanta esta hoja»).
   - Valoración de la clase, 1-5 estrellas, solo para la persona (no sale en
     ningún informe; queda como evento LESSON_RATING, el último manda).
   - Dudas y comentarios: un formulario con Para (Comunidad | Tutor) y Tipo
     (Pregunta | Comentario). Al tutor es privado salvo «Compartir». Las
     respuestas heredan todo del hilo. Me gusta, «Retirar» (el texto se
     conserva como prueba), máximo 4000 caracteres.                         */

const db = require('../../utils/db');
const uuid = require('../../utils/uuid');
const m = require('./model');
const { HttpError } = m;

const MAX_BODY = 4000;
const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/* ── Corazones ──────────────────────────────────────────────────────── */

async function toggleHeart(courseSlug, lessonSlug, user, body) {
  const { lesson } = await m.loadLesson(courseSlug, lessonSlug, user);
  const key = String(body?.slideKey || '');
  if (!/^[0-9a-f]{16}$/.test(key)) throw new HttpError(400, 'BAD_SLIDE', 'Hoja no válida');
  const slide = m.textSlides(lesson.reading).find(s => s.key === key);
  if (!slide) throw new HttpError(404, 'BAD_SLIDE', 'Esa hoja ya no está en la lectura');
  if (body?.on) {
    await db.query(
      `INSERT IGNORE INTO academia_hearts (user_id, lesson_id, slide_key, heading, excerpt) VALUES (?, ?, ?, ?, ?)`,
      [user.id, lesson.id, key, slide.heading.slice(0, 300) || null, plain(slide.html).slice(0, 500)]);
  } else {
    await db.query('DELETE FROM academia_hearts WHERE user_id = ? AND lesson_id = ? AND slide_key = ?', [user.id, lesson.id, key]);
  }
  return { on: !!body?.on };
}

/* ── Valoración (solo para mí) ──────────────────────────────────────── */

async function rate(courseSlug, lessonSlug, user, body) {
  const { course, lesson } = await m.loadLesson(courseSlug, lessonSlug, user);
  const r = body?.rating === null ? null : Number(body?.rating);
  if (r !== null && !(Number.isInteger(r) && r >= 1 && r <= 5)) throw new HttpError(400, 'BAD_RATING', 'Valoración no válida');
  await m.addEvent(user, course, lesson, 'LESSON_RATING', { rating: r }, `rating:${lesson.id}:${uuid()}`);
  return { rating: r };
}

/* ── Dudas y comentarios ────────────────────────────────────────────── */

/* ¿Puede esta persona ver el mensaje (hilo raíz)? */
function canSee(root, user, staff) {
  if (staff) return true;
  if (root.status === 'hidden') return false;
  if (root.visibility === 'private') return root.user_id === user.id;
  return true;
}

const authorName = (r) => {
  const n = String(r.author_name || '').trim();
  return n && !n.includes('@') ? n : 'Alumno/a';
};

async function listDiscussion(courseSlug, lessonSlug, user) {
  const { lesson } = await m.loadLesson(courseSlug, lessonSlug, user);
  const staff = m.isStaff(user);
  const [rows] = await db.query(
    `SELECT c.*, u.name AS author_name, u.role AS author_role,
            (SELECT COUNT(*) FROM academia_comment_likes k WHERE k.comment_id = c.id) AS likes,
            EXISTS (SELECT 1 FROM academia_comment_likes k WHERE k.comment_id = c.id AND k.user_id = ?) AS liked
       FROM academia_comments c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.lesson_id = ? ORDER BY c.created_at`, [user.id, lesson.id]);
  const roots = rows.filter(r => !r.parent_id && canSee(r, user, staff));
  const show = (r) => {
    const withdrawn = !!r.withdrawn_at;
    return {
      id: r.id,
      author: authorName(r),
      tutor: r.author_role === 'admin' || r.author_role === 'scribe',
      mine: r.user_id === user.id,
      // Retirado: el texto se conserva en la BD; solo el equipo lo sigue viendo.
      body: withdrawn && !staff ? null : r.body,
      withdrawn,
      hidden: r.status === 'hidden',
      date: r.created_at,
    };
  };
  return {
    staff,
    threads: roots.map(r => ({
      ...show(r),
      audience: r.audience, kind: r.kind, visibility: r.visibility,
      resolved: !!r.resolved_at,
      likes: Number(r.likes), liked: !!r.liked, canLike: r.visibility === 'shared' && !r.withdrawn_at,
      replies: rows.filter(x => x.parent_id === r.id && (staff || x.status !== 'hidden')).map(show),
    })),
  };
}

async function postMessage(courseSlug, lessonSlug, user, body) {
  const { course, lesson } = await m.loadLesson(courseSlug, lessonSlug, user);
  const staff = m.isStaff(user);
  const text = String(body?.body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) throw new HttpError(400, 'EMPTY', 'Escribe tu mensaje');
  if (text.length > MAX_BODY) throw new HttpError(400, 'TOO_LONG', `El mensaje no puede pasar de ${MAX_BODY} caracteres`);

  let audience = body?.audience === 'tutor' ? 'tutor' : 'community';
  let kind = body?.kind === 'comment' ? 'comment' : 'question';
  let visibility = audience === 'community' || body?.share ? 'shared' : 'private';
  let parentId = null;
  if (body?.parentId) {
    const [[root]] = await db.query('SELECT * FROM academia_comments WHERE id = ? AND lesson_id = ? AND parent_id IS NULL', [body.parentId, lesson.id]);
    if (!root || !canSee(root, user, staff) || root.withdrawn_at || root.status === 'hidden') {
      throw new HttpError(404, 'NOT_FOUND', 'Esa conversación ya no está disponible');
    }
    // Las respuestas heredan destinatario, tipo y privacidad del hilo.
    ({ audience, kind, visibility } = root);
    parentId = root.id;
  }
  const id = uuid();
  await db.query(
    `INSERT INTO academia_comments (id, course_id, lesson_id, user_id, parent_id, audience, kind, visibility, body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, course.id, lesson.id, user.id, parentId, audience, kind, visibility, text]);
  await m.addEvent(user, course, lesson, 'DISCUSSION_MESSAGE', { messageId: id, parentId, audience, kind, visibility }, `msg:${id}`);
  // Aviso al tutor cuando un alumno abre un hilo para el tutor o responde en uno.
  if (audience === 'tutor' && !staff) {
    const [[u]] = await db.query('SELECT name, email FROM users WHERE id = ?', [user.id]);
    require('./notify').tutorMessage({ user: u || user, course, lesson, kind, body: text, shared: visibility === 'shared' });
  }
  return { id };
}

async function ownedMessage(courseSlug, lessonSlug, user, id) {
  const { lesson } = await m.loadLesson(courseSlug, lessonSlug, user);
  const [[c]] = await db.query('SELECT * FROM academia_comments WHERE id = ? AND lesson_id = ?', [id, lesson.id]);
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Mensaje no encontrado');
  return c;
}

/* Retirar: el mensaje deja de verse, pero el texto se guarda como prueba. */
async function withdraw(courseSlug, lessonSlug, user, id) {
  const c = await ownedMessage(courseSlug, lessonSlug, user, id);
  if (c.user_id !== user.id) throw new HttpError(403, 'FORBIDDEN', 'Solo puedes retirar tus mensajes');
  await db.query('UPDATE academia_comments SET withdrawn_at = NOW() WHERE id = ? AND withdrawn_at IS NULL', [id]);
  return { withdrawn: true };
}

async function like(courseSlug, lessonSlug, user, id, on) {
  const c = await ownedMessage(courseSlug, lessonSlug, user, id);
  if (c.parent_id || c.visibility !== 'shared' || c.status === 'hidden' || c.withdrawn_at) {
    throw new HttpError(409, 'CANNOT_LIKE', 'Este mensaje no admite «Me gusta»');
  }
  if (on) await db.query('INSERT IGNORE INTO academia_comment_likes (comment_id, user_id) VALUES (?, ?)', [id, user.id]);
  else await db.query('DELETE FROM academia_comment_likes WHERE comment_id = ? AND user_id = ?', [id, user.id]);
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM academia_comment_likes WHERE comment_id = ?', [id]);
  return { liked: !!on, likes: Number(n) };
}

module.exports = { toggleHeart, rate, listDiscussion, postMessage, withdraw, like, MAX_BODY };
