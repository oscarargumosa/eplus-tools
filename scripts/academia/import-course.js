/**
 * Carga (o actualiza) un curso de la Academia desde su JSON.
 *
 *   node scripts/academia/import-course.js data/academia/ecosistema-erasmus.json \
 *        [--status=draft|published|hidden] [--access=open|enrolled]
 *
 * Es idempotente: curso, módulos y lecciones se casan por slug/número y
 * conservan su id, así que el progreso de los alumnos no se pierde. Si cambian
 * las preguntas de una lección se crea una revisión nueva del test; las
 * anteriores se quedan (los intentos hechos apuntan a ellas).
 * Las lecciones que ya no estén en el JSON NO se borran: solo se avisa.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const uuid = require('../../node/src/utils/uuid');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
if (!file) { console.error('Falta el JSON del curso'); process.exit(1); }

function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])]));
  return v;
}
const hash = v => crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

(async () => {
  const course = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
  console.log(`BD ${process.env.DB_NAME} · curso ${course.slug}`);
  await conn.beginTransaction();
  try {
    const [[existing]] = await conn.query('SELECT id FROM academia_courses WHERE slug = ?', [course.slug]);
    const courseId = existing?.id || uuid();
    await conn.query(
      `INSERT INTO academia_courses (id, slug, title, subtitle, description, level, lang, cover_url, status, access, passing_score, hours, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title=VALUES(title), subtitle=VALUES(subtitle), description=VALUES(description),
         level=VALUES(level), lang=VALUES(lang), cover_url=VALUES(cover_url), passing_score=VALUES(passing_score),
         hours=VALUES(hours), sort=VALUES(sort)${opt.status ? ', status=VALUES(status)' : ''}${opt.access ? ', access=VALUES(access)' : ''}`,
      [courseId, course.slug, course.title, course.subtitle || null, course.description || null,
       course.level || null, course.lang || 'es', course.cover_url || null,
       opt.status || 'draft', opt.access || 'enrolled', course.passing_score || 80, course.hours || null, course.sort || 0]);

    const seen = new Set();
    let sort = 0, newControls = 0;
    for (const mod of course.modules) {
      const [[m]] = await conn.query('SELECT id FROM academia_modules WHERE course_id = ? AND number = ?', [courseId, mod.number]);
      const moduleId = m?.id || uuid();
      await conn.query(
        `INSERT INTO academia_modules (id, course_id, number, title) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title)`, [moduleId, courseId, mod.number, mod.title]);

      for (const l of mod.lessons) {
        sort += 1;
        seen.add(l.slug);
        const [[row]] = await conn.query('SELECT id FROM academia_lessons WHERE course_id = ? AND slug = ?', [courseId, l.slug]);
        const lessonId = row?.id || uuid();
        await conn.query(
          `INSERT INTO academia_lessons (id, course_id, module_id, code, slug, sort, title, idea, goal, why, guide_ref,
             verify_year, video_url, video_poster, video_seconds, pdf_url, reading)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE module_id=VALUES(module_id), code=VALUES(code), sort=VALUES(sort), title=VALUES(title),
             idea=VALUES(idea), goal=VALUES(goal), why=VALUES(why), guide_ref=VALUES(guide_ref),
             verify_year=VALUES(verify_year), video_url=VALUES(video_url), video_poster=VALUES(video_poster),
             video_seconds=VALUES(video_seconds), pdf_url=VALUES(pdf_url), reading=VALUES(reading)`,
          [lessonId, courseId, moduleId, l.code, l.slug, sort, l.title, l.idea || null, l.goal || null, l.why || null,
           l.guide_ref || null, l.verify_year || null, l.video_url || null, l.video_poster || null,
           l.video_seconds || null, l.pdf_url || null, JSON.stringify(l.reading || [])]);

        if (l.questions?.length) {
          const passing = l.passing_score || course.passing_score || 80;
          const revision = hash({ passing, questions: l.questions });
          const [r] = await conn.query(
            `INSERT IGNORE INTO academia_controls (id, lesson_id, revision, passing_score, questions) VALUES (?, ?, ?, ?, ?)`,
            [uuid(), lessonId, revision, passing, JSON.stringify(l.questions)]);
          newControls += r.affectedRows;
        }
      }
    }
    const [all] = await conn.query('SELECT slug FROM academia_lessons WHERE course_id = ?', [courseId]);
    const orphans = all.map(r => r.slug).filter(s => !seen.has(s));
    if (orphans.length) console.warn('⚠️  Lecciones en la BD que ya no están en el JSON (no se borran):', orphans.join(', '));
    await conn.commit();
    console.log(`✓ ${sort} lecciones · ${newControls} revisiones de test nuevas`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
