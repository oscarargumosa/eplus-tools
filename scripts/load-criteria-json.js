/**
 * Carga criterios de evaluación (eval_criteria) y la Parte A de las preguntas
 * (eval_questions) de UNA convocatoria desde un JSON que vive fuera del repo
 * (el contenido de los briefs es método propio y el repo es público).
 *
 *   node scripts/load-criteria-json.js <programId> <fichero.json> [--dry-run]
 *
 * Prudente e idempotente (se puede repetir):
 *   - Solo toca el programa <programId>, y el JSON tiene que traer ese mismo
 *     program_id (si no, no carga nada). Nunca otros programas.
 *   - Pregunta: por question_id del JSON si es de ese programa y tiene el mismo
 *     code; si no, por (programa, code). Las que no existen se listan, no se crean.
 *   - Criterios: si la pregunta ya tiene algún criterio CON contenido (algún
 *     campo narrativo de 30+ caracteres) no se toca. Si solo tiene criterios
 *     vacíos o de prueba («New criterion», «erfef»…), se borran y se insertan
 *     los del JSON; si no tiene ninguno, se crean.
 *   - Parte A (description, writing_guidance, general_context, connects_from,
 *     connects_to, global_rule): cada campo solo si está vacío o es basura de
 *     prueba (menos de 30 caracteres).
 *   - Secciones (opcional, "sections" del JSON): max_score solo si está a 0 y
 *     eval_notes solo si está vacío.
 *   - Todo en una transacción; con --dry-run se hace y se deshace, y se
 *     enseña el resumen.
 *
 * Formato del JSON:
 * {
 *   "program_id": "<uuid>",
 *   "sections":  [{ "code_prefix": "1" | "2.1" | …, "max_score": 30, "eval_notes": "…" }],
 *   "questions": [{
 *     "code": "1.1", "question_id": "<uuid opcional>",
 *     "description": "…", "writing_guidance": "…", "general_context": "…",
 *     "connects_from": "…", "connects_to": "…", "global_rule": "…",
 *     "criteria": [{ "title": "…", "max_score": 1, "mandatory": true, "priority": "alta|media|baja",
 *       "intent": "…", "elements": "…", "example_weak": "…", "example_strong": "…", "avoid": "…",
 *       "meaning": "…", "structure": "…", "relations": "…", "rules": "…", "red_flags": "…",
 *       "score_rubric": { "0": "…", "50": "…", "100": "…" } }]
 *   }]
 * }
 */
require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const NARRATIVE = ['intent', 'elements', 'example_weak', 'example_strong', 'avoid',
  'meaning', 'structure', 'relations', 'rules', 'red_flags'];
const PART_A = ['description', 'writing_guidance', 'general_context', 'connects_from', 'connects_to', 'global_rule'];
const PRIORITIES = ['alta', 'media', 'baja'];
const isEmpty = (v) => v == null || String(v).trim().length < 30;
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// Sección por prefijo de código: «1» → «1. …», «2.1» → «2.1 …»
function sectionMatches(title, prefix) {
  const t = String(title || '').trim();
  return prefix.includes('.') ? t.startsWith(prefix + ' ') : t.startsWith(prefix + '.');
}

async function main() {
  const [programId, file] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  if (!programId || !file) {
    console.error('Uso: node scripts/load-criteria-json.js <programId> <fichero.json> [--dry-run]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // El JSON dice de qué programa es: así no se carga por error en otra convocatoria.
  if (data.program_id !== programId) {
    console.error(`El JSON es del programa ${data.program_id || '(sin program_id)'}, no de ${programId}. No se carga nada.`);
    process.exit(1);
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER,
    password: process.env.DB_PASS, database: process.env.DB_NAME, charset: 'utf8mb4',
  });
  console.log(`BD ${process.env.DB_NAME} · programa ${programId}${dryRun ? ' · DRY-RUN (no se guarda nada)' : ''}`);

  const [[prog]] = await db.query('SELECT id, name, action_type FROM intake_programs WHERE id = ?', [programId]);
  if (!prog) { console.error('El programa no existe en esta BD.'); await db.end(); process.exit(1); }
  console.log(`  ${prog.name} (${prog.action_type})`);

  const [questions] = await db.query(
    `SELECT q.* FROM eval_questions q JOIN eval_sections s ON s.id = q.section_id
      WHERE s.program_id = ? ORDER BY s.sort_order, q.sort_order`, [programId]);

  const summary = { created: 0, replaced: 0, partA: 0, kept: [], missing: [], sections: 0 };
  await db.beginTransaction();
  try {
    for (const item of data.questions || []) {
      const q = questions.find(x => x.id === item.question_id && x.code === item.code)
             || questions.find(x => x.code === item.code);
      if (!q) { summary.missing.push(item.code); continue; }

      const sets = [], vals = [], filled = [];
      for (const k of PART_A) {
        if (txt(item[k]) && isEmpty(q[k])) { sets.push(`${k} = ?`); vals.push(txt(item[k])); filled.push(k); }
      }
      if (sets.length) {
        await db.query(`UPDATE eval_questions SET ${sets.join(', ')} WHERE id = ?`, [...vals, q.id]);
        summary.partA++;
      }

      const [crit] = await db.query('SELECT * FROM eval_criteria WHERE question_id = ?', [q.id]);
      const hasContent = crit.some(c => NARRATIVE.some(k => !isEmpty(c[k])));
      let action = 'sin criterios en el JSON';
      if (hasContent) {
        summary.kept.push(item.code);
        action = `se conservan sus ${crit.length} criterios (tienen contenido)`;
      } else if ((item.criteria || []).length) {
        if (crit.length) await db.query('DELETE FROM eval_criteria WHERE question_id = ?', [q.id]);
        let order = 0;
        for (const c of item.criteria) {
          await db.query(
            `INSERT INTO eval_criteria
               (id, question_id, title, max_score, mandatory, priority,
                intent, elements, example_weak, example_strong, avoid,
                meaning, structure, relations, rules, red_flags, score_rubric, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [randomUUID(), q.id, String(c.title || 'Criterion').slice(0, 500),
             Number(c.max_score) > 0 ? Number(c.max_score) : 1, c.mandatory ? 1 : 0,
             PRIORITIES.includes(c.priority) ? c.priority : 'media',
             txt(c.intent), txt(c.elements), txt(c.example_weak), txt(c.example_strong), txt(c.avoid),
             txt(c.meaning), txt(c.structure), txt(c.relations), txt(c.rules), txt(c.red_flags),
             c.score_rubric && typeof c.score_rubric === 'object' ? JSON.stringify(c.score_rubric) : null,
             order++]
          );
        }
        if (crit.length) summary.replaced++; else summary.created++;
        action = `${item.criteria.length} criterios${crit.length ? ` (sustituyen ${crit.length} vacíos)` : ''}`;
      }
      console.log(`  ${item.code.padEnd(6)} ${String(q.title).slice(0, 48).padEnd(48)} ${action}${filled.length ? ` · Parte A: ${filled.join(', ')}` : ''}`);
    }

    const [srows] = await db.query('SELECT id, title, max_score, eval_notes FROM eval_sections WHERE program_id = ?', [programId]);
    for (const sec of data.sections || []) {
      const s = srows.find(r => sectionMatches(r.title, String(sec.code_prefix)));
      if (!s) continue;
      if (Number(s.max_score) === 0 && Number(sec.max_score) > 0) {
        await db.query('UPDATE eval_sections SET max_score = ? WHERE id = ?', [sec.max_score, s.id]);
        summary.sections++;
      }
      if (isEmpty(s.eval_notes) && txt(sec.eval_notes)) {
        await db.query('UPDATE eval_sections SET eval_notes = ? WHERE id = ?', [txt(sec.eval_notes), s.id]);
        summary.sections++;
      }
    }

    if (dryRun) await db.rollback(); else await db.commit();
  } catch (e) {
    await db.rollback();
    await db.end();
    throw e;
  }

  const covered = new Set((data.questions || []).map(q => q.code));
  const notCovered = questions.filter(q => !covered.has(q.code)).map(q => q.code);
  console.log(`\nResumen${dryRun ? ' (DRY-RUN, deshecho)' : ''}: ${summary.created} preguntas con criterios nuevos, ` +
    `${summary.replaced} con criterios vacíos sustituidos, Parte A en ${summary.partA}, ${summary.sections} cambios en secciones.`);
  if (summary.kept.length) console.log(`  Con criterios propios (sin tocar): ${summary.kept.join(', ')}`);
  if (summary.missing.length) console.log(`  En el JSON pero no en la BD: ${summary.missing.join(', ')}`);
  if (notCovered.length) console.log(`  En la BD pero no en el JSON: ${notCovered.join(', ')}`);
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
