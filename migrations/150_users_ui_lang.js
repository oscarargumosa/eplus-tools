// Migration 150: users.ui_lang — idioma de la interfaz que eligió la persona
// ('es' | 'en'). NULL = aún no ha elegido (se usa el de su navegador).
// También decide el idioma de los correos de la cuenta. Idempotente.

module.exports = async function(conn) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'ui_lang'`
  );
  if (!cols.length) {
    await conn.query(`ALTER TABLE users ADD COLUMN ui_lang VARCHAR(5) NULL`);
    console.log('[150] users: ui_lang añadida');
  } else {
    console.log('[150] users: ui_lang ya existe');
  }
};
