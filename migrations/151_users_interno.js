// Migration 151: users.interno — la cuenta es «de casa» (equipo, pruebas).
// Engagement la aparta del tráfico de fuera. Los roles admin, writer y scribe
// cuentan siempre como de casa sin necesidad de marcarlos. Se marca en
// Admin › Usuarios y accesos. Idempotente.

module.exports = async function(conn) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'interno'`
  );
  if (!cols.length) {
    await conn.query(`ALTER TABLE users ADD COLUMN interno TINYINT(1) NOT NULL DEFAULT 0`);
    console.log('[151] users: interno añadida');
  } else {
    console.log('[151] users: interno ya existe');
  }
};
