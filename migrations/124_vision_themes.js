// ─────────────────────────────────────────────────────────────────────
// 124 · EU Vision — columna themes (temas marcados por el usuario en el reto)
// Idempotente: comprueba information_schema antes de ALTER (MySQL 8 no
// soporta ADD COLUMN IF NOT EXISTS).
// ─────────────────────────────────────────────────────────────────────
module.exports = async (conn) => {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visions' AND COLUMN_NAME = 'themes'`
  );
  if (!cols.length) {
    await conn.query(`ALTER TABLE visions ADD COLUMN themes JSON NULL AFTER differentiator`);
  }
};
