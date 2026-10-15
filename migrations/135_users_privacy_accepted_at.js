// Migration 135: users.privacy_accepted_at — fecha en que la persona aceptó la
// política de privacidad (casilla del registro propio o alta con Google).
// NULL en las cuentas anteriores a la casilla. Idempotente.

module.exports = async function(conn) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'privacy_accepted_at'`
  );
  if (!cols.length) {
    await conn.query(`ALTER TABLE users ADD COLUMN privacy_accepted_at DATETIME NULL`);
    console.log('[135] users: privacy_accepted_at añadida');
  } else {
    console.log('[135] users: privacy_accepted_at ya existe');
  }
};
