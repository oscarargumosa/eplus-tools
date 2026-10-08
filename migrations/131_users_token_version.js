// Migration 131: users.token_version — revocación de sesiones.
// El refresh/access token lleva `tv`; subir este número (logout-all, cambio o
// reseteo de contraseña) invalida todos los tokens anteriores del usuario.
// Idempotente: se re-ejecuta en cada arranque.

module.exports = async function(conn) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version'`
  );
  if (!cols.length) {
    await conn.query(`ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0`);
    console.log('[131] users: token_version añadida');
  } else {
    console.log('[131] users: token_version ya existe');
  }
};
