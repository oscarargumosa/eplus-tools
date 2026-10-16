/**
 * Migration 142 — Academia v2: nueva regla de «lección completada» sin quitar
 * nada a quien ya avanzó.
 *
 * Hasta ahora una lección quedaba completada al aprobar su test. Desde la v2
 * hace falta vídeo visto + lectura terminada + test aprobado. Para no romper
 * el progreso (ni los certificados) de quien ya había completado lecciones,
 * esta migración apunta en academia_events un LEGACY_COMPLETED por cada
 * lección con un test aprobado ANTES del cambio. El modelo cuenta esas
 * lecciones como completadas («Completada anteriormente»).
 *
 * Se ejecuta una sola vez (schema_migrations) y justo en el despliegue que trae
 * la regla nueva, así que el corte es ese momento. Solo AÑADE eventos (la tabla
 * es de solo añadir); request_key único → repetirla no duplica nada.
 */
'use strict';

module.exports = async function (conn) {
  const [[t]] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'academia_attempts'`);
  if (!t.n) { console.log('    ⊘ 142 skip: academia_attempts no existe'); return; }
  const [r] = await conn.query(
    `INSERT IGNORE INTO academia_events (user_id, course_id, lesson_id, kind, data, request_key)
     SELECT a.user_id, l.course_id, a.lesson_id, 'LEGACY_COMPLETED',
            JSON_OBJECT('rule', 'TEST_PASSED_V1', 'passedAt', DATE_FORMAT(MIN(a.submitted_at), '%Y-%m-%dT%H:%i:%s')),
            CONCAT('legacy:', a.lesson_id)
       FROM academia_attempts a JOIN academia_lessons l ON l.id = a.lesson_id
      WHERE a.passed = 1 AND a.submitted_at IS NOT NULL
      GROUP BY a.user_id, l.course_id, a.lesson_id`);
  console.log(`    ✓ 142 lecciones completadas con la regla anterior: ${r.affectedRows}`);
};
