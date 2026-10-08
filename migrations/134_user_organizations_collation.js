// user_organizations nació con otra colación (utf8mb4_0900_ai_ci) que organizations
// (utf8mb4_unicode_ci) y el JOIN de «mis entidades» (/organizations/mine/all) fallaba
// con «Illegal mix of collations» (error 500 en «Mi organización»). Idempotente: la
// 126_org_claims hace lo mismo; la que llegue después no cambia nada.
module.exports = async function (conn) {
  const [[t]] = await conn.query(
    `SELECT TABLE_COLLATION AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_organizations'`
  );
  if (t && t.c !== 'utf8mb4_unicode_ci') {
    await conn.query('ALTER TABLE user_organizations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  }
};
