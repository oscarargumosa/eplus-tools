// worker_category guarda «<uuid>::<perfil>» desde la calculadora («…::Investigador / Profesional
// senior» son 71 caracteres) y activity_management_staff solo admitía 60: guardar la calculadora
// daba 500 en proyectos nuevos. Se amplía a 255 (también en intellectual outputs, que tenía 120).
// Idempotente: solo actúa si la columna es más corta.
module.exports = async function (conn) {
  for (const table of ['activity_management_staff', 'activity_intellectual_outputs']) {
    const [[col]] = await conn.query(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS len, IS_NULLABLE AS nul FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'worker_category'`, [table]
    );
    if (col && col.len < 255) {
      await conn.query(`ALTER TABLE ${table} MODIFY worker_category VARCHAR(255) ${col.nul === 'YES' ? 'NULL' : 'NOT NULL'}`);
    }
  }
};
