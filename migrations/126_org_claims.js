// ─────────────────────────────────────────────────────────────────────
// 126 · Reclamar entidades del directorio
// - organizations.claimed_by_user_id / claimed_at: dueño único de la
//   entidad reclamada (el primero que la reclama; sin verificación previa).
// - organizations.verified_at: se rellena cuando el dueño aporta la
//   documentación de la entidad → sticker «Verificada» en el directorio.
// - org_claim_documents: estatutos, escrituras, acta, poderes (privados,
//   fuera de /public; se sirven solo al dueño y a admin).
// - org_claim_disputes: otra persona reclama una entidad que ya tiene
//   dueño → se registra el conflicto y se pide documentación a ambos.
// Idempotente: comprueba information_schema antes de ALTER.
// ─────────────────────────────────────────────────────────────────────
module.exports = async (conn) => {
  const addCol = async (name, ddl) => {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations' AND COLUMN_NAME = ?`,
      [name]
    );
    if (!cols.length) await conn.query(`ALTER TABLE organizations ADD COLUMN ${ddl}`);
  };
  // user_organizations nació con otra colación que organizations y el JOIN
  // de «mis entidades» (/organizations/mine/all) fallaba con «Illegal mix
  // of collations»: el selector de varias entidades nunca llegó a funcionar.
  const fixCollation = async (table) => {
    const [[t]] = await conn.query(
      `SELECT TABLE_COLLATION AS c FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table]
    );
    if (t && t.c !== 'utf8mb4_unicode_ci') {
      await conn.query(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
  };
  await fixCollation('user_organizations');

  await addCol('claimed_by_user_id', 'claimed_by_user_id CHAR(36) NULL');
  await addCol('claimed_at',         'claimed_at DATETIME NULL');
  await addCol('verified_at',        'verified_at DATETIME NULL');

  // Las organizaciones creadas antes de esta migración ya tenían dueño en
  // user_organizations: lo copiamos para que no queden «libres».
  // (En JS y no con JOIN: las dos tablas tienen colaciones distintas.)
  const [links] = await conn.query(
    'SELECT user_id, organization_id, created_at FROM user_organizations ORDER BY created_at ASC'
  );
  const seen = new Set();
  for (const l of links) {
    if (seen.has(l.organization_id)) continue;
    seen.add(l.organization_id);
    await conn.query(
      'UPDATE organizations SET claimed_by_user_id=?, claimed_at=? WHERE id=? AND claimed_by_user_id IS NULL',
      [l.user_id, l.created_at, l.organization_id]
    );
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS org_claim_documents (
      id              CHAR(36)     NOT NULL PRIMARY KEY,
      organization_id CHAR(36)     NOT NULL,
      user_id         CHAR(36)     NOT NULL,
      doc_type        VARCHAR(30)  NOT NULL,
      original_name   VARCHAR(255) NOT NULL,
      stored_name     VARCHAR(255) NOT NULL,
      mime            VARCHAR(100) NULL,
      size_bytes      INT          NULL,
      created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ocd_org (organization_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS org_claim_disputes (
      id                 CHAR(36)    NOT NULL PRIMARY KEY,
      organization_id    CHAR(36)    NOT NULL,
      claimant_user_id   CHAR(36)    NOT NULL,
      owner_user_id      CHAR(36)    NULL,
      message            TEXT        NULL,
      status             VARCHAR(20) NOT NULL DEFAULT 'open',
      created_at         TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
      resolved_at        DATETIME    NULL,
      INDEX idx_ocdisp_org (organization_id),
      INDEX idx_ocdisp_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Por si se crearon antes con la colación por defecto (primer intento en dev).
  await fixCollation('org_claim_documents');
  await fixCollation('org_claim_disputes');
};
