// ─────────────────────────────────────────────────────────────────────
// 139 · Revisión de la documentación de las entidades reclamadas
// El sello «Verificada» (organizations.verified_at, de la 072) ya no se
// pone al subir un fichero: la entidad queda «pendiente de revisión» y
// un admin la verifica o la rechaza desde «Entidades reclamadas».
// - organizations.verification_status: NULL (sin documentos) | pending |
//   verified | rejected
// - verification_reviewed_at / verification_note: cuándo y por qué
//   (el motivo se enseña al dueño si se rechaza).
// Datos: un verified_at puesto por la regla antigua (sin verified_by,
// es decir, sin admin) vuelve a «pendiente». En producción no existe
// ninguno (la 126 no llegó a desplegarse con esa regla).
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
  await addCol('verification_status',      'verification_status VARCHAR(20) NULL');
  await addCol('verification_reviewed_at', 'verification_reviewed_at DATETIME NULL');
  await addCol('verification_note',        'verification_note VARCHAR(500) NULL');

  // Sello puesto sin admin (regla del 8-oct, solo en dev) → pendiente.
  await conn.query(
    `UPDATE organizations SET verified_at = NULL, verification_status = 'pending'
      WHERE verified_at IS NOT NULL AND verified_by IS NULL
        AND EXISTS (SELECT 1 FROM org_claim_documents d WHERE d.organization_id = organizations.id)`
  );
  // Verificadas por un admin (072: verified_by) sin estado → verified.
  await conn.query(
    `UPDATE organizations SET verification_status = 'verified'
      WHERE verified_at IS NOT NULL AND verified_by IS NOT NULL AND verification_status IS NULL`
  );
  // Con documentos y sin estado → pendiente.
  await conn.query(
    `UPDATE organizations o SET o.verification_status = 'pending'
      WHERE o.verification_status IS NULL AND o.verified_at IS NULL
        AND EXISTS (SELECT 1 FROM org_claim_documents d WHERE d.organization_id = o.id)`
  );

  const [idx] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations' AND INDEX_NAME = 'idx_org_verification_status'`
  );
  if (!idx.length) await conn.query('CREATE INDEX idx_org_verification_status ON organizations (verification_status)');
};
