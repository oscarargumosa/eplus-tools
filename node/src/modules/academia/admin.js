/* Academia — panel de admin (/v1/academia/admin/*, solo role 'admin').
   Alumnos por curso, progreso por lección, intentos y notas del test,
   matricular/revocar, exportar CSV; corazones; dudas y comentarios.
   Las valoraciones de la clase (estrellas) NO salen aquí: son solo para cada
   alumno (decisión de Óscar; igual que en Emociona).                       */

const db = require('../../utils/db');
const m = require('./model');
const { HttpError } = m;

async function course(slug) {
  const [[c]] = await db.query('SELECT * FROM academia_courses WHERE slug = ?', [slug]);
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Curso no encontrado');
  return c;
}

async function courses() {
  const [rows] = await db.query(
    `SELECT c.slug, c.title, c.status, c.access, c.lang,
            (SELECT COUNT(*) FROM academia_lessons l WHERE l.course_id = c.id) AS lessons,
            (SELECT COUNT(*) FROM academia_enrollments e WHERE e.course_id = c.id) AS students,
            (SELECT COUNT(*) FROM academia_certificates ce WHERE ce.course_id = c.id) AS certificates
       FROM academia_courses c ORDER BY c.sort, c.title`);
  return rows.map(r => ({ ...r, lessons: Number(r.lessons), students: Number(r.students), certificates: Number(r.certificates) }));
}

/* Alumnos de un curso con su resumen. */
async function students(slug) {
  const c = await course(slug);
  const [lessons] = await db.query('SELECT id FROM academia_lessons WHERE course_id = ?', [c.id]);
  const reqs = await m.lessonRequirements(c.id);
  const testTotal = [...reqs.values()].filter(r => r.test).length;
  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, e.source, e.created_at AS enrolled_at,
            (SELECT MAX(ev.created_at) FROM academia_events ev WHERE ev.user_id = u.id AND ev.course_id = e.course_id) AS last_activity,
            (SELECT serial FROM academia_certificates ce WHERE ce.user_id = u.id AND ce.course_id = e.course_id) AS certificate
       FROM academia_enrollments e JOIN users u ON u.id = e.user_id
      WHERE e.course_id = ? ORDER BY e.created_at DESC`, [c.id]);
  const [best] = await db.query(
    `SELECT a.user_id, a.lesson_id, MAX(a.score) AS best, MAX(a.passed) AS passed, COUNT(*) AS n
       FROM academia_attempts a JOIN academia_lessons l ON l.id = a.lesson_id
      WHERE l.course_id = ? AND a.submitted_at IS NOT NULL GROUP BY a.user_id, a.lesson_id`, [c.id]);
  const out = [];
  for (const u of rows) {
    const st = await m.lessonStates(u.id, c.id);
    const mine = best.filter(b => b.user_id === u.id);
    out.push({
      id: u.id, name: u.name, email: u.email, staff: u.role === 'admin' || u.role === 'scribe',
      source: u.source, enrolled_at: u.enrolled_at, last_activity: u.last_activity, certificate: u.certificate,
      done: [...st.values()].filter(s => s.completed).length, total: lessons.length,
      tests_passed: mine.filter(b => b.passed).length, tests_total: testTotal,
      attempts: mine.reduce((n, b) => n + Number(b.n), 0),
      avg_best: mine.length ? Math.round(mine.reduce((n, b) => n + b.best, 0) / mine.length) : null,
    });
  }
  return { course: { slug: c.slug, title: c.title, access: c.access, status: c.status }, students: out };
}

/* Una persona en un curso: lección a lección, y todos sus intentos. */
async function student(slug, userId) {
  const c = await course(slug);
  const [[u]] = await db.query(
    `SELECT u.id, u.name, u.email, e.created_at AS enrolled_at, e.source FROM users u
       LEFT JOIN academia_enrollments e ON e.user_id = u.id AND e.course_id = ? WHERE u.id = ?`, [c.id, userId]);
  if (!u) throw new HttpError(404, 'NOT_FOUND', 'Persona no encontrada');
  const [lessons] = await db.query('SELECT id, code, title FROM academia_lessons WHERE course_id = ? ORDER BY sort', [c.id]);
  const st = await m.lessonStates(userId, c.id);
  const reqs = await m.lessonRequirements(c.id);
  const [att] = await db.query(
    `SELECT a.lesson_id, a.score, a.passed, a.submitted_at FROM academia_attempts a JOIN academia_lessons l ON l.id = a.lesson_id
      WHERE a.user_id = ? AND l.course_id = ? AND a.submitted_at IS NOT NULL ORDER BY a.submitted_at`, [userId, c.id]);
  return {
    user: u,
    lessons: lessons.map(l => {
      const s = st.get(l.id) || {}, r = reqs.get(l.id) || {};
      const a = att.filter(x => x.lesson_id === l.id);
      return {
        code: l.code, title: l.title,
        video: r.video ? !!s.video : null, reading: r.reading ? !!s.reading : null, test: r.test ? !!s.passed : null,
        completed: !!s.completed, legacy: !!s.legacy, started: !!s.started,
        best: a.length ? Math.max(...a.map(x => x.score)) : null,
        attempts: a.map(x => ({ score: x.score, passed: !!x.passed, date: x.submitted_at })),
      };
    }),
  };
}

/* Resumen por lección: cuántos la empiezan, la terminan, intentos y notas. */
async function lessonsReport(slug) {
  const c = await course(slug);
  const [lessons] = await db.query('SELECT id, code, title FROM academia_lessons WHERE course_id = ? ORDER BY sort', [c.id]);
  const [enr] = await db.query('SELECT user_id FROM academia_enrollments WHERE course_id = ?', [c.id]);
  const states = new Map();
  for (const e of enr) states.set(e.user_id, await m.lessonStates(e.user_id, c.id));
  const [att] = await db.query(
    `SELECT a.user_id, a.lesson_id, MAX(a.score) AS best, COUNT(*) AS n, SUM(a.passed = 0) AS fails
       FROM academia_attempts a JOIN academia_lessons l ON l.id = a.lesson_id
      WHERE l.course_id = ? AND a.submitted_at IS NOT NULL GROUP BY a.user_id, a.lesson_id`, [c.id]);
  return {
    students: enr.length,
    lessons: lessons.map(l => {
      const ss = [...states.values()].map(st => st.get(l.id)).filter(Boolean);
      const a = att.filter(x => x.lesson_id === l.id);
      return {
        code: l.code, title: l.title,
        started: ss.length, video: ss.filter(s => s.video).length, reading: ss.filter(s => s.reading).length,
        passed: ss.filter(s => s.passed).length, completed: ss.filter(s => s.completed).length,
        attempts: a.reduce((n, x) => n + Number(x.n), 0), fails: a.reduce((n, x) => n + Number(x.fails), 0),
        avg_best: a.length ? Math.round(a.reduce((n, x) => n + x.best, 0) / a.length) : null,
      };
    }),
  };
}

async function enrollByEmail(slug, body, adminUser) {
  const c = await course(slug);
  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'BAD_EMAIL', 'Escribe un correo válido');
  const [[u]] = await db.query('SELECT id, name, email, role FROM users WHERE LOWER(email) = ?', [email]);
  if (!u) throw new HttpError(404, 'NO_USER', 'No hay ninguna cuenta con ese correo. La persona tiene que crearse una cuenta primero.');
  const fresh = await m.addEnrollment(u, c, 'manual');
  if (fresh) {
    require('./notify').enrollment(u.id, c, 'manual');
    require('../../utils/audit').audit({ user: adminUser }, 'academia.enroll', { targetType: 'user', targetId: u.id, meta: { course: c.slug } });
  }
  // Sin el área «academia» no podría entrar: se avisa (el área se da en Usuarios y accesos).
  const areas = await require('../../middleware/auth').getUserAreas(u.id, u.role).catch(() => []);
  return { enrolled: true, already: !fresh, hasArea: areas.includes('academia'), user: { id: u.id, name: u.name, email: u.email } };
}

/* Revocar: se quita la matrícula. El progreso y el registro se conservan
   (si se vuelve a matricular, sigue por donde iba).                        */
async function revoke(slug, userId, adminUser) {
  const c = await course(slug);
  const [r] = await db.query('DELETE FROM academia_enrollments WHERE course_id = ? AND user_id = ?', [c.id, userId]);
  if (r.affectedRows) require('../../utils/audit').audit({ user: adminUser }, 'academia.revoke', { targetType: 'user', targetId: userId, meta: { course: c.slug } });
  return { revoked: r.affectedRows === 1 };
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Evita fórmulas al abrirlo en una hoja de cálculo.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');

async function exportCsv(slug) {
  const c = await course(slug);
  const { students: rows } = await students(slug);
  const [lessons] = await db.query('SELECT id, code FROM academia_lessons WHERE course_id = ? ORDER BY sort', [c.id]);
  const [best] = await db.query(
    `SELECT a.user_id, a.lesson_id, MAX(a.score) AS best FROM academia_attempts a JOIN academia_lessons l ON l.id = a.lesson_id
      WHERE l.course_id = ? AND a.submitted_at IS NOT NULL GROUP BY a.user_id, a.lesson_id`, [c.id]);
  const head = ['Nombre', 'Correo', 'Matrícula', 'Fecha de alta', 'Última actividad', 'Lecciones completadas', 'Total lecciones', '%',
    'Tests aprobados', 'Intentos', 'Nota media (mejor por test)', 'Certificado',
    ...lessons.map(l => `${l.code} estado`), ...lessons.map(l => `${l.code} nota`)];
  const lines = [head.map(csvCell).join(';')];
  for (const s of rows) {
    const st = await m.lessonStates(s.id, c.id);
    const label = (x) => (!x ? 'pendiente' : x.completed ? (x.legacy ? 'completada (regla anterior)' : 'completada') : 'empezada');
    lines.push([
      s.name, s.email, s.source, ymd(s.enrolled_at), ymd(s.last_activity), s.done, s.total, s.total ? Math.round(100 * s.done / s.total) : 0,
      `${s.tests_passed}/${s.tests_total}`, s.attempts, s.avg_best ?? '', s.certificate || '',
      ...lessons.map(l => label(st.get(l.id))),
      ...lessons.map(l => best.find(b => b.user_id === s.id && b.lesson_id === l.id)?.best ?? ''),
    ].map(csvCell).join(';'));
  }
  return { filename: `academia-${c.slug}-${new Date().toISOString().slice(0, 10)}.csv`, csv: '﻿' + lines.join('\r\n') };
}

/* Las 60 hojas con más corazones, sin contar al equipo (admin/scribe). */
async function hearts() {
  const [top] = await db.query(
    `SELECT h.lesson_id, h.slide_key, COUNT(*) AS n,
            MAX(h.heading) AS heading, MAX(h.excerpt) AS excerpt,
            l.code, l.title, l.slug, c.title AS course, c.slug AS course_slug
       FROM academia_hearts h JOIN users u ON u.id = h.user_id
       JOIN academia_lessons l ON l.id = h.lesson_id JOIN academia_courses c ON c.id = l.course_id
      WHERE u.role NOT IN ('admin','scribe')
      GROUP BY h.lesson_id, h.slide_key, l.code, l.title, l.slug, c.title, c.slug
      ORDER BY n DESC, MAX(h.created_at) DESC LIMIT 60`);
  const [[tot]] = await db.query(
    `SELECT COUNT(*) AS hearts, COUNT(DISTINCT h.user_id) AS people FROM academia_hearts h JOIN users u ON u.id = h.user_id
      WHERE u.role NOT IN ('admin','scribe')`);
  return { total: Number(tot.hearts), people: Number(tot.people), top: top.map(t => ({ ...t, n: Number(t.n) })) };
}

/* Dudas y comentarios de todos los cursos, con filtro. */
async function comments(q) {
  const where = ['c.parent_id IS NULL'];
  const args = [];
  const f = q?.filter || 'open';
  if (f === 'open') where.push("c.resolved_at IS NULL AND c.status = 'visible' AND c.withdrawn_at IS NULL");
  if (f === 'tutor') where.push("c.audience = 'tutor' AND c.resolved_at IS NULL AND c.withdrawn_at IS NULL");
  if (f === 'resolved') where.push('c.resolved_at IS NOT NULL');
  if (f === 'hidden') where.push("c.status = 'hidden'");
  if (f === 'withdrawn') where.push('c.withdrawn_at IS NOT NULL');
  if (q?.course) { where.push('co.slug = ?'); args.push(q.course); }
  const [rows] = await db.query(
    `SELECT c.id, c.audience, c.kind, c.visibility, c.body, c.status, c.withdrawn_at, c.resolved_at, c.created_at,
            u.name AS author, u.email AS author_email, l.code, l.title AS lesson, l.slug AS lesson_slug, co.slug AS course_slug, co.title AS course,
            (SELECT COUNT(*) FROM academia_comments r WHERE r.parent_id = c.id) AS replies,
            (SELECT COUNT(*) FROM academia_comments r JOIN users ru ON ru.id = r.user_id
              WHERE r.parent_id = c.id AND ru.role IN ('admin','scribe')) AS staff_replies,
            (SELECT COUNT(*) FROM academia_comment_likes k WHERE k.comment_id = c.id) AS likes
       FROM academia_comments c LEFT JOIN users u ON u.id = c.user_id
       JOIN academia_lessons l ON l.id = c.lesson_id JOIN academia_courses co ON co.id = c.course_id
      WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC LIMIT 300`, args);
  return rows.map(r => ({ ...r, replies: Number(r.replies), staff_replies: Number(r.staff_replies), likes: Number(r.likes) }));
}

async function commentAction(id, body, adminUser) {
  const [[c]] = await db.query('SELECT id FROM academia_comments WHERE id = ?', [id]);
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Mensaje no encontrado');
  const SQL = {
    hide: "status = 'hidden'", show: "status = 'visible'",
    resolve: 'resolved_at = NOW()', reopen: 'resolved_at = NULL',
  }[body?.action];
  if (!SQL) throw new HttpError(400, 'BAD_ACTION', 'Acción no válida');
  await db.query(`UPDATE academia_comments SET ${SQL} WHERE id = ?`, [id]);
  require('../../utils/audit').audit({ user: adminUser }, `academia.comment.${body.action}`, { targetType: 'comment', targetId: id });
  return { ok: true };
}

async function deleteComment(id, adminUser) {
  const [r] = await db.query('DELETE FROM academia_comments WHERE id = ?', [id]);
  if (r.affectedRows) require('../../utils/audit').audit({ user: adminUser }, 'academia.comment.delete', { targetType: 'comment', targetId: id });
  return { deleted: r.affectedRows === 1 };
}

module.exports = { courses, students, student, lessonsReport, enrollByEmail, revoke, exportCsv, hearts, comments, commentAction, deleteComment };
