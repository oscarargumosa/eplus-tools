// Migration 152: Ideas (antes EU Vision) — solicitudes para unirse.
// vision_interests pasa a ser la tabla de solicitudes: cada entidad pide unirse
// a una idea publicada y el dueño la acepta o la rechaza. Al aceptar se comparten
// los contactos; el socio NO entra solo en el consorcio de Diseñar (decisión de
// Óscar, 23-oct-2026). visions gana la entidad del dueño (organizations.id) y
// qué busca: coordinador y/o socios. Idempotente.

async function addColumn(conn, table, col, ddl) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, col]);
  if (rows.length) return false;
  await conn.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  return true;
}

module.exports = async function(conn) {
  const added = [];
  if (await addColumn(conn, 'visions', 'organization_id', 'CHAR(36) NULL AFTER entity_oid')) added.push('visions.organization_id');
  if (await addColumn(conn, 'visions', 'looking_for', 'JSON NULL AFTER partner_countries')) added.push('visions.looking_for');

  const cols = [
    ['status', "ENUM('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending' AFTER message"],
    ['organization_id', 'CHAR(36) NULL AFTER entity_oid'],
    ['role_offered', 'VARCHAR(255) NULL AFTER organization_id'],
    ['decided_at', 'DATETIME NULL AFTER status'],
    ['decided_by', 'CHAR(36) NULL AFTER decided_at'],
    ['decision_note', 'TEXT NULL AFTER decided_by'],
    ['updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'],
  ];
  for (const [c, ddl] of cols) {
    if (await addColumn(conn, 'vision_interests', c, ddl)) added.push('vision_interests.' + c);
  }
  const [idx] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vision_interests' AND INDEX_NAME = 'idx_interest_user'`);
  if (!idx.length) {
    await conn.query('ALTER TABLE vision_interests ADD KEY idx_interest_user (user_id, status)');
    added.push('vision_interests.idx_interest_user');
  }
  console.log('[152] ideas/solicitudes:', added.length ? added.join(', ') : 'nada que añadir');
};
