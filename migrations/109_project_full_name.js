// Migration 109: Add full_name to projects (legal/full name, separate from short display name)

module.exports = async function(conn) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects'`
  );
  const existing = cols.map(c => c.COLUMN_NAME);

  if (!existing.includes('full_name')) {
    await conn.query(`ALTER TABLE projects ADD COLUMN full_name VARCHAR(255) DEFAULT NULL AFTER name`);
  }

  console.log('[109] projects: full_name column added');
};
