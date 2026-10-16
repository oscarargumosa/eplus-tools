// ─────────────────────────────────────────────────────────────────────
// 128 · Foto de perfil del usuario (users.avatar_url).
// El círculo de «Mi cuenta» del menú superior muestra, por orden:
// logo de su entidad → esta foto → iniciales de nombre y apellido.
// Idempotente: comprueba information_schema antes de ALTER.
// ─────────────────────────────────────────────────────────────────────
module.exports = async (conn) => {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'`
  );
  if (!cols.length) {
    await conn.query(`ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NULL`);
  }
};
