// Migration 152: perfil completo de la persona (23-oct-2026). Ver docs/PERFIL.md.
//   users.phone              teléfono PRIVADO: solo lo ve el equipo (Admin), nunca otros usuarios.
//   users.profile_wizard_at  cuándo vio (y cerró o terminó) el asistente del primer acceso.
//   community_profiles       el perfil único de la persona (cargo, presentación, roles,
//                            entidad o «sin entidad», ubicación). Mismo esquema que las
//                            migraciones 145 + 146 de la Comunidad: cuando la Comunidad
//                            llegue a main, esas dos no harán nada (IF NOT EXISTS).
// Solo cambios aditivos. Idempotente.

async function addColumn(conn, table, col, ddl) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, col]);
  if (!cols.length) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`[152] ${table}: ${col} añadida`);
  }
}

module.exports = async function(conn) {
  await addColumn(conn, 'users', 'phone', 'phone VARCHAR(32) NULL');
  await addColumn(conn, 'users', 'profile_wizard_at', 'profile_wizard_at DATETIME NULL');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS community_profiles (
      user_id             CHAR(36)     NOT NULL PRIMARY KEY,
      visible             TINYINT(1)   NOT NULL DEFAULT 0,
      headline            VARCHAR(120) NULL,
      bio                 VARCHAR(700) NULL,
      roles               VARCHAR(255) NULL,
      sectors             VARCHAR(255) NULL,
      actions             VARCHAR(255) NULL,
      languages           VARCHAR(255) NULL,
      seeks_partners      TINYINT(1)   NOT NULL DEFAULT 0,
      offers_partner      TINYINT(1)   NOT NULL DEFAULT 0,
      organization_id     CHAR(36)     NULL,
      no_organization     TINYINT(1)   NOT NULL DEFAULT 0,
      country             CHAR(2)      NULL,
      location_label      VARCHAR(120) NULL,
      lat                 DECIMAL(9,6) NULL,
      lng                 DECIMAL(9,6) NULL,
      location_source     ENUM('manual','organization') NULL,
      location_precision  ENUM('approx','exact') NOT NULL DEFAULT 'approx',
      location_audience   ENUM('members','connections','hidden') NOT NULL DEFAULT 'members',
      created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cprof_visible (visible, country),
      CONSTRAINT fk_cprof_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  // Una BD con la tabla creada por la 145 antigua (sin la 146).
  await addColumn(conn, 'community_profiles', 'roles', 'roles VARCHAR(255) NULL AFTER bio');
  await addColumn(conn, 'community_profiles', 'no_organization', 'no_organization TINYINT(1) NOT NULL DEFAULT 0 AFTER organization_id');
  console.log('[152] perfil de usuario listo');
};
