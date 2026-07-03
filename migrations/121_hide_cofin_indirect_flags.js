/*
 * 121 — Flags "no aplica" para Financiado (cofin) e Indirectos.
 *
 * Cuando una convocatoria marca uno de estos flags, el campo NO aplica al
 * diseño del proyecto: se oculta en Presupuesto y WorkPackages y sale de las
 * cuentas (indirecto = 0 / financiado = 100%). Sirve para KA2 y cualquier
 * call donde cofinanciación o indirectos no tengan sentido.
 *
 * Se guardan en el call (intake_programs) y se copian al proyecto al crearlo
 * (projects), que es de donde los lee el calculador.
 *
 * Idempotente: comprueba information_schema antes de cada ALTER (MySQL 8.x no
 * soporta ADD COLUMN IF NOT EXISTS).
 */
module.exports = async function (db) {
  async function addFlag(table, column) {
    const [rows] = await db.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!rows.length) {
      await db.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` TINYINT(1) NOT NULL DEFAULT 0`
      );
    }
  }

  await addFlag('intake_programs', 'hide_cofin');
  await addFlag('intake_programs', 'hide_indirect');
  await addFlag('projects', 'hide_cofin');
  await addFlag('projects', 'hide_indirect');
};
