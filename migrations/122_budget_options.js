/*
 * 122 — Menú de presupuestos por convocatoria (budget_options).
 *
 * Algunas calls (KA2) ofrecen varios importes cerrados a elegir (p.ej.
 * 120.000 / 250.000 / 400.000). Se guardan como array JSON de importes.
 *
 *   - null o 1 elemento  → modo clásico: un solo presupuesto (usa eu_grant_max).
 *   - ≥ 2 elementos      → el usuario elige uno al crear el proyecto; el
 *                          importe elegido se guarda en projects.eu_grant y
 *                          todo escala a ese máximo como hasta ahora.
 *
 * Idempotente: comprueba information_schema antes del ALTER.
 */
module.exports = async function (db) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intake_programs'
        AND COLUMN_NAME = 'budget_options'`
  );
  if (!rows.length) {
    await db.query(
      `ALTER TABLE intake_programs ADD COLUMN budget_options JSON NULL`
    );
  }
};
