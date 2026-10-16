/**
 * Migration 140 — Academia v2: recursos de estudio por lección.
 *
 * Pestañas de la lectura (como el aula de Proyecto Emociona): Lectura · Esquema ·
 * Infografía · PDF. El PDF ya existía (pdf_url); se añaden:
 *   - mind_map    JSON {center, lead, branches:[{title, ideas[]}]}  → pestaña «Esquema»
 *   - infographic JSON {src, alt, width, height}                    → pestaña «Infografía»
 * Vacíos (NULL) mientras no haya contenido: la pestaña no aparece.
 * Solo añade columnas; idempotente (mira information_schema).
 */
'use strict';

const COLS = [
  ['mind_map', 'JSON NULL'],
  ['infographic', 'JSON NULL'],
];

module.exports = async function (conn) {
  const [[t]] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'academia_lessons'`);
  if (!t.n) { console.log('    ⊘ 140 skip: academia_lessons no existe'); return; }
  for (const [name, type] of COLS) {
    const [[c]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'academia_lessons' AND COLUMN_NAME = ?`, [name]);
    if (c.n) { console.log(`    ⊘ 140 academia_lessons.${name} ya existe`); continue; }
    await conn.query(`ALTER TABLE academia_lessons ADD COLUMN \`${name}\` ${type}`);
    console.log(`    ✓ 140 academia_lessons.${name}`);
  }
};
