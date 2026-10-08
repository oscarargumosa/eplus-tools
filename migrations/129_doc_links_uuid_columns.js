// ─────────────────────────────────────────────────────────────────────
// 129 · Columnas de enlace que eran INT pero guardan UUID (CHAR(36)):
//   - project_sources.project_id  (projects.id es UUID)
//   - project_documents.added_by  (users.id es UUID)
// Con ellas en INT, enlazar una fuente o un documento a un proyecto fallaba
// siempre en modo estricto. Se pasan a CHAR(36) con la collation de
// projects/users. Idempotente: solo altera si la columna sigue siendo entera.
// ─────────────────────────────────────────────────────────────────────
const CHANGES = [
  { table: 'project_sources',   column: 'project_id', def: 'CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL' },
  { table: 'project_documents', column: 'added_by',   def: 'CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL' },
];

module.exports = async (conn) => {
  for (const c of CHANGES) {
    const [cols] = await conn.query(
      `SELECT DATA_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [c.table, c.column]
    );
    if (cols.length && /int/i.test(cols[0].DATA_TYPE)) {
      await conn.query(`ALTER TABLE ${c.table} MODIFY ${c.column} ${c.def}`);
    }
  }
};
