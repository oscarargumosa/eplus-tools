// ─────────────────────────────────────────────────────────────────────
// 125 · EU Vision — columna vision_text (el texto único de la visión,
// redactado por el usuario o la IA). El rediseño a una sola ventana usa
// un solo texto en vez de reto+valor por separado.
// Idempotente: comprueba information_schema antes de ALTER.
// ─────────────────────────────────────────────────────────────────────
module.exports = async (conn) => {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visions' AND COLUMN_NAME = 'vision_text'`
  );
  if (!cols.length) {
    await conn.query(`ALTER TABLE visions ADD COLUMN vision_text TEXT NULL AFTER european_value`);
  }
};
