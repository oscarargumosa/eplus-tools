/* Academia — correos (como lib/enrollment-notify.ts del aula de Emociona).

   - Alta nueva en un curso: confirmación a la persona + aviso a quien gestiona
     la academia (ACADEMIA_NOTIFY_EMAIL; si no, NEW_USER_NOTIFY_EMAIL; si no,
     oscarargumosa@gmail.com).
   - Mensaje de un alumno «para el tutor»: aviso a esa misma dirección.

   Fuera de producción (NODE_ENV ≠ production) no se escribe a personas reales:
   - el aviso interno está apagado salvo ACADEMIA_NOTIFY_ADMIN=1;
   - la confirmación al alumno solo sale si su correo es de prueba
     (ACADEMIA_TEST_EMAILS, expresión regular; por defecto @example.invalid y
     alumno.*@eufundingschool.com).
   En producción, ACADEMIA_NOTIFY_ADMIN=0 apaga el aviso interno.
   Sin RESEND_API_KEY, utils/email.js no envía nada (solo lo apunta en el log).
   Nunca lanza: un correo que falla no tumba la matrícula ni el mensaje.     */

const db = require('../../utils/db');

const PROD = () => process.env.NODE_ENV === 'production';
const base = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const adminTo = () => process.env.ACADEMIA_NOTIFY_EMAIL || process.env.NEW_USER_NOTIFY_EMAIL || 'oscarargumosa@gmail.com';

function adminOn() {
  const v = process.env.ACADEMIA_NOTIFY_ADMIN;
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return PROD();
}

function studentOk(email) {
  if (PROD()) return true;
  let re;
  try { re = new RegExp(process.env.ACADEMIA_TEST_EMAILS || '(@example\\.invalid|^alumno\\.[^@]+@eufundingschool\\.com)$', 'i'); }
  catch { return false; }
  return re.test(String(email || ''));
}

const skip = (what) => console.log(`[academia] correo no enviado (${what}): desactivado en este entorno`);
const VIA = { open: 'Se matriculó desde la academia', manual: 'Matrícula hecha por el equipo', purchase: 'Compra' };

/* Se llama solo cuando la matrícula acaba de crearse. Asíncrono y sin esperar. */
function enrollment(userId, course, source) {
  setImmediate(async () => {
    try {
      const [[u]] = await db.query('SELECT id, name, email FROM users WHERE id = ?', [userId]);
      if (!u) return;
      const email = require('../../utils/email');
      const courseUrl = `${base()}/academia/${encodeURIComponent(course.slug)}`;
      if (studentOk(u.email)) {
        try {
          await email.sendCourseEnrollmentEmail({ to: u.email, name: u.name, courseTitle: course.title, courseUrl, accountUrl: `${base()}/#account-courses` });
        } catch (e) { console.error('[academia] confirmación de alta falló:', e.message); }
      } else skip('confirmación de alta');
      if (adminOn()) {
        try {
          await email.sendCourseEnrollmentNotice({ to: adminTo(), user: u, courseTitle: course.title, via: VIA[source] || source,
            adminUrl: `${base()}/academia/admin/${encodeURIComponent(course.slug)}` });
        } catch (e) { console.error('[academia] aviso de alta falló:', e.message); }
      } else skip('aviso de alta');
    } catch (e) { console.error('[academia] correos de alta:', e.message); }
  });
}

function tutorMessage({ user, course, lesson, kind, body, shared }) {
  if (!adminOn()) { skip('aviso al tutor'); return; }
  setImmediate(async () => {
    try {
      await require('../../utils/email').sendAcademiaTutorNotice({
        to: adminTo(), user, courseTitle: course.title, lessonTitle: `${lesson.code} · ${lesson.title}`, kind, body, shared,
        lessonUrl: `${base()}/academia/${encodeURIComponent(course.slug)}/${encodeURIComponent(lesson.slug)}#ac-discussion`,
        adminUrl: `${base()}/academia/admin/comentarios`,
      });
    } catch (e) { console.error('[academia] aviso al tutor falló:', e.message); }
  });
}

module.exports = { enrollment, tutorMessage, studentOk, adminOn };
