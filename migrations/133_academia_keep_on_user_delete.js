/**
 * Migration 133 — Los certificados y el registro de progreso de la Academia
 * sobreviven al borrado del usuario.
 *
 * En 127, academia_certificates.user_id y academia_events.user_id tienen
 * FK ... ON DELETE CASCADE a users: al borrar un usuario se perdía su
 * certificado y la verificación pública (/academia/certificado/:serial)
 * dejaba de funcionar. El certificado ya guarda copia del nombre (full_name),
 * así que basta con dejar user_id a NULL.
 *
 * Cambio: user_id pasa a NULL-able y la FK a ON DELETE SET NULL.
 * Idempotente: mira information_schema y solo toca lo que falte.
 */
'use strict';

const TARGETS = [
  { table: 'academia_certificates', column: 'user_id', fk: 'fk_acad_cert_user' },
  { table: 'academia_events',       column: 'user_id', fk: 'fk_acad_event_user' },
];

module.exports = async function (conn) {
  for (const t of TARGETS) {
    const [[tbl]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [t.table]);
    if (!tbl.n) { console.log(`    ⊘ 133 skip: ${t.table} no existe`); continue; }

    const [[col]] = await conn.query(
      `SELECT IS_NULLABLE, COLUMN_TYPE, COLLATION_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [t.table, t.column]);
    const [fks] = await conn.query(
      `SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS rc
         JOIN information_schema.KEY_COLUMN_USAGE k
           ON k.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
          AND k.TABLE_NAME = rc.TABLE_NAME
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND rc.TABLE_NAME = ?
          AND k.COLUMN_NAME = ? AND rc.REFERENCED_TABLE_NAME = 'users'`, [t.table, t.column]);

    const nullable = col && col.IS_NULLABLE === 'YES';
    const setNull  = fks.length > 0 && fks.every(f => f.DELETE_RULE === 'SET NULL');
    if (nullable && setNull) { console.log(`    ⊘ 133 ${t.table}: ya en SET NULL`); continue; }

    // MySQL no deja quitar y crear una FK con el mismo nombre en la misma
    // sentencia: primero se quita (y se permite NULL), luego se crea. Si se
    // corta entre medias, la siguiente ejecución ve la FK ausente y la crea.
    const parts = fks.map(f => `DROP FOREIGN KEY \`${f.CONSTRAINT_NAME}\``);
    parts.push(`MODIFY \`${t.column}\` ${col.COLUMN_TYPE} COLLATE ${col.COLLATION_NAME} NULL`);
    await conn.query(`ALTER TABLE \`${t.table}\` ${parts.join(', ')}`);
    await conn.query(`ALTER TABLE \`${t.table}\` ADD CONSTRAINT \`${t.fk}\` FOREIGN KEY (\`${t.column}\`) REFERENCES users(id) ON DELETE SET NULL`);
    console.log(`    ✓ 133 ${t.table}.${t.column}: NULL + ON DELETE SET NULL`);
  }
};
