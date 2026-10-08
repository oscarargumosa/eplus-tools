/* Academia — modelo. Cursos nativos de Studio (ver migrations/127_academia_cursos.sql).

   Reglas, las mismas que las aulas de Proyecto Emociona:
   - Lectura por hojas: portada + una hoja por párrafo. Para pasar a una hoja
     NUEVA la anterior tiene que haber estado abierta 7 s (hora del servidor).
     Con la última hoja leída se registra READING_DONE. Releer es libre.
   - Vídeo visto: se dan por buenas las muestras de los últimos 30 s, seguidas
     y sin saltos, y a una velocidad que una persona pueda seguir (≤ 2,5x).
   - El test se abre con el vídeo visto O la lectura terminada.
   - La lección queda completada al aprobar su test (80 % por defecto).
   - Con todas las lecciones completadas se emite el certificado.
   Todo el progreso va a academia_events, que solo crece.                 */

const crypto = require('crypto');
const db = require('../../utils/db');
const uuid = require('../../utils/uuid');

const SLIDE_MS = 7000;
const SLIDE_MIN_MS = SLIDE_MS - 500;   // margen por la latencia de red
const VIDEO_TAIL = 30;                 // segundos finales que hay que reproducir
const MAX_SPEED = 2.5;

const isStaff = (user) => !!user && (user.role === 'admin' || user.role === 'scribe');
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

class HttpError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

/* ── Cursos ─────────────────────────────────────────────────────────── */

async function getCourse(slug, user) {
  const [[c]] = await db.query('SELECT * FROM academia_courses WHERE slug = ?', [slug]);
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Curso no encontrado');
  if (c.status === 'draft' && !isStaff(user)) throw new HttpError(404, 'NOT_FOUND', 'Curso no encontrado');
  return c;
}

async function enrollment(userId, courseId) {
  const [[e]] = await db.query('SELECT * FROM academia_enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
  return e || null;
}

/* Puede entrar a las lecciones: matriculado, o staff (que se matricula solo). */
async function requireAccess(course, user) {
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Inicia sesión para entrar al curso');
  if (await enrollment(user.id, course.id)) return;
  if (isStaff(user) || course.access === 'open') {
    await db.query(
      `INSERT IGNORE INTO academia_enrollments (id, user_id, course_id, source) VALUES (?, ?, ?, ?)`,
      [uuid(), user.id, course.id, course.access === 'open' ? 'open' : 'manual']);
    return;
  }
  throw new HttpError(403, 'NOT_ENROLLED', 'No estás matriculado en este curso');
}

/* Estado de cada lección del curso para una persona, en dos consultas. */
async function lessonStates(userId, courseId) {
  const [ev] = await db.query(
    `SELECT lesson_id, kind FROM academia_events
      WHERE user_id = ? AND course_id = ? AND kind IN ('LESSON_STARTED','READING_DONE','VIDEO_SEEN')`,
    [userId, courseId]);
  const [passed] = await db.query(
    `SELECT DISTINCT a.lesson_id FROM academia_attempts a JOIN academia_lessons l ON l.id = a.lesson_id
      WHERE a.user_id = ? AND l.course_id = ? AND a.passed = 1`, [userId, courseId]);
  const st = new Map();
  for (const e of ev) {
    const s = st.get(e.lesson_id) || {};
    s[e.kind] = true;
    st.set(e.lesson_id, s);
  }
  for (const p of passed) st.set(p.lesson_id, { ...(st.get(p.lesson_id) || {}), PASSED: true });
  return st;
}

const stateOf = (s) => (s?.PASSED ? 'done' : s ? 'in_progress' : 'pending');

async function listCourses(user) {
  const [rows] = await db.query(
    `SELECT c.*, (SELECT COUNT(*) FROM academia_lessons l WHERE l.course_id = c.id) AS lessons,
            (SELECT COUNT(*) FROM academia_modules m WHERE m.course_id = c.id) AS modules
       FROM academia_courses c
      WHERE c.status = 'published' ${isStaff(user) ? "OR c.status = 'draft'" : ''}
         ${user ? 'OR c.id IN (SELECT course_id FROM academia_enrollments WHERE user_id = ?)' : ''}
      ORDER BY c.sort, c.title`, user ? [user.id] : []);
  const out = [];
  for (const c of rows) {
    const item = {
      slug: c.slug, title: c.title, subtitle: c.subtitle, description: c.description, level: c.level,
      lang: c.lang, cover_url: c.cover_url, status: c.status, access: c.access, hours: c.hours,
      lessons: Number(c.lessons), modules: Number(c.modules),
    };
    if (user) {
      const enrolled = !!(await enrollment(user.id, c.id));
      const st = enrolled ? await lessonStates(user.id, c.id) : new Map();
      item.enrolled = enrolled;
      item.done = [...st.values()].filter(s => s.PASSED).length;
      const [[cert]] = await db.query('SELECT serial FROM academia_certificates WHERE user_id = ? AND course_id = ?', [user.id, c.id]);
      item.certificate = cert?.serial || null;
    }
    out.push(item);
  }
  return out;
}

async function courseDetail(slug, user) {
  const c = await getCourse(slug, user);
  const [mods] = await db.query('SELECT id, number, title FROM academia_modules WHERE course_id = ? ORDER BY number', [c.id]);
  const [lessons] = await db.query(
    'SELECT id, module_id, code, slug, title, video_seconds FROM academia_lessons WHERE course_id = ? ORDER BY sort', [c.id]);
  const enrolled = user ? !!(await enrollment(user.id, c.id)) : false;
  const st = enrolled ? await lessonStates(user.id, c.id) : new Map();
  let cert = null;
  if (user) {
    const [[r]] = await db.query('SELECT serial, issued_at FROM academia_certificates WHERE user_id = ? AND course_id = ?', [user.id, c.id]);
    cert = r || null;
  }
  const next = lessons.find(l => !st.get(l.id)?.PASSED) || lessons[0];
  return {
    slug: c.slug, title: c.title, subtitle: c.subtitle, description: c.description, level: c.level,
    cover_url: c.cover_url, hours: c.hours, status: c.status, access: c.access, passing_score: c.passing_score,
    enrolled, canEnroll: !!user && (c.access === 'open' || isStaff(user)),
    certificate: cert, next_lesson: next?.slug || null,
    modules: mods.map(m => ({
      number: m.number, title: m.title,
      lessons: lessons.filter(l => l.module_id === m.id).map(l => ({
        code: l.code, slug: l.slug, title: l.title, minutes: l.video_seconds ? Math.round(l.video_seconds / 60) : null,
        state: stateOf(st.get(l.id)),
      })),
    })),
  };
}

async function enroll(slug, user) {
  const c = await getCourse(slug, user);
  await requireAccess(c, user);
  return { enrolled: true };
}

/* ── Lección ────────────────────────────────────────────────────────── */

async function loadLesson(courseSlug, lessonSlug, user) {
  const c = await getCourse(courseSlug, user);
  await requireAccess(c, user);
  const [[l]] = await db.query('SELECT * FROM academia_lessons WHERE course_id = ? AND slug = ?', [c.id, lessonSlug]);
  if (!l) throw new HttpError(404, 'NOT_FOUND', 'Lección no encontrada');
  l.reading = json(l.reading) || [];
  return { course: c, lesson: l };
}

const slideCount = (reading) => 1 + reading.reduce((n, s) => n + s.paragraphs.length, 0);

async function currentControl(lessonId) {
  const [[ctl]] = await db.query(
    'SELECT * FROM academia_controls WHERE lesson_id = ? ORDER BY created_at DESC LIMIT 1', [lessonId]);
  return ctl || null;
}

async function phaseState(userId, course, lesson) {
  const [ev] = await db.query(
    `SELECT kind, data, TIMESTAMPDIFF(MICROSECOND, created_at, NOW(3)) DIV 1000 AS age_ms
       FROM academia_events WHERE user_id = ? AND lesson_id = ? ORDER BY id`, [userId, lesson.id]);
  const slides = ev.filter(e => e.kind === 'READING_SLIDE').map(e => ({ index: json(e.data).index, age: Number(e.age_ms) }));
  const last = slides.reduce((a, s) => (a && a.index >= s.index ? a : s), null);
  const [att] = await db.query(
    `SELECT score, passed FROM academia_attempts WHERE user_id = ? AND lesson_id = ? AND submitted_at IS NOT NULL`,
    [userId, lesson.id]);
  const has = k => ev.some(e => e.kind === k);
  const total = slideCount(lesson.reading);
  const videoSeen = has('VIDEO_SEEN');
  const readingDone = has('READING_DONE');
  return {
    started: has('LESSON_STARTED'),
    videoSeen,
    readingDone,
    slides: { total, reached: last ? last.index : -1, waitMs: last && !readingDone ? Math.max(0, SLIDE_MS - last.age) : 0 },
    testUnlocked: videoSeen || readingDone || !lesson.video_url && total <= 1,
    testPassed: att.some(a => a.passed),
    bestScore: att.length ? Math.max(...att.map(a => a.score)) : null,
    attempts: att.length,
    passingScore: (await currentControl(lesson.id))?.passing_score ?? course.passing_score,
  };
}

async function lessonDetail(courseSlug, lessonSlug, user) {
  const { course, lesson } = await loadLesson(courseSlug, lessonSlug, user);
  const [all] = await db.query(
    `SELECT l.slug, l.code, l.title, m.number AS module, m.title AS module_title
       FROM academia_lessons l JOIN academia_modules m ON m.id = l.module_id
      WHERE l.course_id = ? ORDER BY l.sort`, [course.id]);
  const i = all.findIndex(x => x.slug === lesson.slug);
  const [[note]] = await db.query('SELECT body, revision FROM academia_notes WHERE user_id = ? AND lesson_id = ?', [user.id, lesson.id]);
  const ctl = await currentControl(lesson.id);
  return {
    course: { slug: course.slug, title: course.title },
    module: { number: all[i].module, title: all[i].module_title },
    lesson: {
      code: lesson.code, slug: lesson.slug, title: lesson.title, idea: lesson.idea, goal: lesson.goal, why: lesson.why,
      guide_ref: lesson.guide_ref, verify_year: lesson.verify_year, video_url: lesson.video_url,
      video_poster: lesson.video_poster, video_seconds: lesson.video_seconds, pdf_url: lesson.pdf_url,
      reading: lesson.reading, questions: ctl ? json(ctl.questions).length : 0,
    },
    prev: all[i - 1] ? { slug: all[i - 1].slug, code: all[i - 1].code, title: all[i - 1].title } : null,
    next: all[i + 1] ? { slug: all[i + 1].slug, code: all[i + 1].code, title: all[i + 1].title } : null,
    phases: await phaseState(user.id, course, lesson),
    note: note ? { body: note.body, revision: note.revision } : { body: '', revision: 0 },
  };
}

async function addEvent(user, course, lesson, kind, data, key) {
  const [r] = await db.query(
    `INSERT IGNORE INTO academia_events (user_id, course_id, lesson_id, kind, data, request_key) VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, course.id, lesson ? lesson.id : null, kind, data ? JSON.stringify(data) : null, key]);
  return r.affectedRows === 1;
}

async function savePhase(courseSlug, lessonSlug, user, body) {
  const { course, lesson } = await loadLesson(courseSlug, lessonSlug, user);
  const action = body?.action;
  const ph = await phaseState(user.id, course, lesson);

  if (action === 'start') {
    await addEvent(user, course, lesson, 'LESSON_STARTED', null, `start:${lesson.id}`);
  } else if (action === 'slide') {
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index >= ph.slides.total) throw new HttpError(400, 'BAD_SLIDE', 'Hoja no válida');
    if (!ph.readingDone && index > ph.slides.reached) {
      if (index > ph.slides.reached + 1) throw new HttpError(409, 'SLIDE_LOCKED', 'Lee las hojas en orden');
      if (ph.slides.reached >= 0 && ph.slides.waitMs > SLIDE_MS - SLIDE_MIN_MS) {
        throw new HttpError(409, 'SLIDE_TOO_SOON', 'Aún no ha pasado el tiempo mínimo de esta hoja', { waitMs: ph.slides.waitMs });
      }
      await addEvent(user, course, lesson, 'READING_SLIDE', { index, total: ph.slides.total }, `slide:${lesson.id}:${index}`);
    }
  } else if (action === 'read') {
    if (!ph.readingDone) {
      if (ph.slides.reached < ph.slides.total - 1) throw new HttpError(409, 'READING_INCOMPLETE', 'Faltan hojas por leer');
      if (ph.slides.waitMs > SLIDE_MS - SLIDE_MIN_MS) {
        throw new HttpError(409, 'SLIDE_TOO_SOON', 'Aún no ha pasado el tiempo mínimo de la última hoja', { waitMs: ph.slides.waitMs });
      }
      await addEvent(user, course, lesson, 'READING_DONE', { policy: 'STUDY_DECK_7S_PER_SLIDE', slides: ph.slides.total }, `read:${lesson.id}`);
    }
  } else if (action === 'video') {
    await videoSample(user, course, lesson, ph, body);
  } else {
    throw new HttpError(400, 'BAD_ACTION', 'Acción no válida');
  }
  return phaseState(user.id, course, lesson);
}

/* Muestras del final del vídeo. El cliente manda {watchId, from, to} cada ~2 s
   cuando entra en los últimos 31 s, y un watchId nuevo si la persona salta. */
async function videoSample(user, course, lesson, ph, body) {
  const dur = lesson.video_seconds;
  if (!lesson.video_url || !dur || ph.videoSeen) return;
  const watchId = String(body.watchId || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  const from = Number(body.from), to = Number(body.to);
  if (!watchId || !Number.isFinite(from) || !Number.isFinite(to) || to < from || to > dur + 2 || to < dur - VIDEO_TAIL - 1) return;
  await addEvent(user, course, lesson, 'VIDEO_TAIL_SAMPLE', { watchId, from, to },
    `vs:${lesson.id}:${watchId}:${Math.round(to * 10)}`);

  const [rows] = await db.query(
    `SELECT data, TIMESTAMPDIFF(MICROSECOND, created_at, NOW(3)) DIV 1000 AS age_ms FROM academia_events
      WHERE user_id = ? AND lesson_id = ? AND kind = 'VIDEO_TAIL_SAMPLE' ORDER BY id`, [user.id, lesson.id]);
  const chain = rows.map(r => ({ ...json(r.data), age: Number(r.age_ms) })).filter(s => s.watchId === watchId);
  if (!chain.length) return;
  for (let i = 1; i < chain.length; i++) if (chain[i].from > chain[i - 1].to + 2.5) return;   // hubo un salto
  const first = chain[0], last = chain[chain.length - 1];
  const media = last.to - first.from;
  const real = (first.age - last.age) / 1000;
  if (first.from <= dur - VIDEO_TAIL && last.to >= dur - 1.5 && real >= media / MAX_SPEED - 2.5) {
    await addEvent(user, course, lesson, 'VIDEO_SEEN', { policy: 'PLAYBACK_IN_FINAL_30_SECONDS', watchId }, `video:${lesson.id}`);
  }
}

/* ── Test ───────────────────────────────────────────────────────────── */

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

const publicQuestions = (def) => def.questions.map(q => ({ id: q.id, question: q.question, options: q.options.map(o => o.text) }));

async function startTest(courseSlug, lessonSlug, user) {
  const { course, lesson } = await loadLesson(courseSlug, lessonSlug, user);
  const ph = await phaseState(user.id, course, lesson);
  if (!ph.testUnlocked) throw new HttpError(409, 'TEST_LOCKED', 'Mira el vídeo o termina la lectura para abrir el test');
  const ctl = await currentControl(lesson.id);
  if (!ctl) throw new HttpError(404, 'NO_TEST', 'Esta lección no tiene test');

  // Un intento abierto de la misma revisión se reutiliza (no se baraja otra vez).
  const [[open]] = await db.query(
    `SELECT id, definition FROM academia_attempts
      WHERE user_id = ? AND lesson_id = ? AND control_id = ? AND submitted_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [user.id, lesson.id, ctl.id]);
  if (open) {
    const def = json(open.definition);
    return { attemptId: open.id, passingScore: def.passingScore, questions: publicQuestions(def) };
  }
  const questions = json(ctl.questions).map(q => {
    const opts = shuffle(q.options);
    return { id: q.id, question: q.question, options: opts.map(o => ({ text: o.text, feedback: o.feedback })),
             correct: opts.findIndex(o => o.correct) };
  });
  const def = { revision: ctl.revision, passingScore: ctl.passing_score, questions };
  const id = uuid();
  await db.query('INSERT INTO academia_attempts (id, user_id, lesson_id, control_id, definition) VALUES (?, ?, ?, ?, ?)',
    [id, user.id, lesson.id, ctl.id, JSON.stringify(def)]);
  return { attemptId: id, passingScore: def.passingScore, questions: publicQuestions(def) };
}

async function submitTest(courseSlug, lessonSlug, user, body) {
  const { course, lesson } = await loadLesson(courseSlug, lessonSlug, user);
  const [[att]] = await db.query(
    'SELECT * FROM academia_attempts WHERE id = ? AND user_id = ? AND lesson_id = ?', [body?.attemptId, user.id, lesson.id]);
  if (!att) throw new HttpError(404, 'NOT_FOUND', 'Intento no encontrado');
  if (att.submitted_at) throw new HttpError(409, 'ALREADY_SUBMITTED', 'Este intento ya se entregó');
  const def = json(att.definition);
  const answers = body.answers;
  if (!Array.isArray(answers) || answers.length !== def.questions.length ||
      answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= def.questions[i].options.length)) {
    throw new HttpError(400, 'BAD_ANSWERS', 'Responde todas las preguntas');
  }
  const right = def.questions.filter((q, i) => answers[i] === q.correct).length;
  const score = Math.round((100 * right) / def.questions.length);
  const passed = score >= def.passingScore;
  const [r] = await db.query(
    `UPDATE academia_attempts SET answers = ?, score = ?, passed = ?, submitted_at = NOW(3)
      WHERE id = ? AND submitted_at IS NULL`, [JSON.stringify(answers), score, passed ? 1 : 0, att.id]);
  if (r.affectedRows !== 1) throw new HttpError(409, 'ALREADY_SUBMITTED', 'Este intento ya se entregó');
  if (passed) {
    await addEvent(user, course, lesson, 'LESSON_COMPLETED', { attemptId: att.id, score }, `done:${lesson.id}`);
  }
  const certificate = passed ? await issueCertificateIfEarned(user, course) : null;
  return {
    score, passed, right, total: def.questions.length, passingScore: def.passingScore, certificate,
    review: def.questions.map((q, i) => ({
      id: q.id, question: q.question, options: q.options.map(o => o.text),
      chosen: answers[i], correct: q.correct,
      feedback: q.options[answers[i]].feedback, correctFeedback: q.options[q.correct].feedback,
    })),
  };
}

/* ── Certificado ────────────────────────────────────────────────────── */

const SERIAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sin 0, O, 1, I

async function issueCertificateIfEarned(user, course) {
  const [[existing]] = await db.query('SELECT serial FROM academia_certificates WHERE user_id = ? AND course_id = ?', [user.id, course.id]);
  if (existing) return existing.serial;
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM academia_lessons WHERE course_id = ?', [course.id]);
  const st = await lessonStates(user.id, course.id);
  const done = [...st.values()].filter(s => s.PASSED).length;
  if (!total || done < Number(total)) return null;
  const [[u]] = await db.query('SELECT name FROM users WHERE id = ?', [user.id]);
  for (let tries = 0; tries < 5; tries++) {
    const code = Array.from({ length: 10 }, () => SERIAL_ALPHABET[crypto.randomInt(SERIAL_ALPHABET.length)]).join('');
    const serial = `EFS-${new Date().getFullYear()}-${code}`;
    try {
      await db.query(
        'INSERT INTO academia_certificates (id, serial, user_id, course_id, full_name, hours) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), serial, user.id, course.id, u?.name || user.email, course.hours]);
      require('../../utils/audit').audit({ user }, 'academia.certificate.issue', { targetType: 'certificate', targetId: serial, meta: { course: course.slug } });
      return serial;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
      const [[again]] = await db.query('SELECT serial FROM academia_certificates WHERE user_id = ? AND course_id = ?', [user.id, course.id]);
      if (again) return again.serial;   // otra petición lo emitió a la vez
    }
  }
  throw new Error('No se pudo generar un número de certificado');
}

async function certificate(serial) {
  const [[c]] = await db.query(
    `SELECT ce.serial, ce.full_name, ce.hours, ce.issued_at, co.title, co.slug,
            (SELECT COUNT(*) FROM academia_modules m WHERE m.course_id = co.id) AS modules,
            (SELECT COUNT(*) FROM academia_lessons l WHERE l.course_id = co.id) AS lessons
       FROM academia_certificates ce JOIN academia_courses co ON co.id = ce.course_id WHERE ce.serial = ?`, [serial]);
  return c || null;
}

/* ── Notas privadas ─────────────────────────────────────────────────── */

async function saveNote(courseSlug, lessonSlug, user, body) {
  const { lesson } = await loadLesson(courseSlug, lessonSlug, user);
  const text = String(body?.body ?? '').slice(0, 20000);
  const rev = Number(body?.revision) || 0;
  const [[cur]] = await db.query('SELECT body, revision FROM academia_notes WHERE user_id = ? AND lesson_id = ?', [user.id, lesson.id]);
  if ((cur?.revision || 0) !== rev) {
    throw new HttpError(409, 'NOTE_CONFLICT', 'La nota cambió en otra pestaña', { note: cur });
  }
  if (cur) {
    await db.query('UPDATE academia_notes SET body = ?, revision = revision + 1 WHERE user_id = ? AND lesson_id = ? AND revision = ?',
      [text, user.id, lesson.id, rev]);
  } else {
    await db.query('INSERT INTO academia_notes (user_id, lesson_id, body, revision) VALUES (?, ?, ?, 1)', [user.id, lesson.id, text]);
  }
  return { body: text, revision: rev + 1 };
}

module.exports = {
  HttpError, listCourses, courseDetail, enroll, lessonDetail, savePhase, startTest, submitTest, certificate, saveNote,
};
