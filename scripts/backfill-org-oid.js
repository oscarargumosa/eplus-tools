#!/usr/bin/env node
/* Backfill one-shot: para todas las organizations con pic IS NOT NULL AND oid IS NULL,
   intenta resolver el OID vía directory-api y lo persiste. */
require('dotenv').config();
const pool = require('../node/src/utils/db');
const m = require('../node/src/modules/organizations/model');

(async () => {
  const [rows] = await pool.query(
    `SELECT id, pic, organization_name FROM organizations WHERE pic IS NOT NULL AND oid IS NULL`
  );
  console.log(`Candidatas: ${rows.length}`);
  let resolved = 0;
  for (const r of rows) {
    try {
      const oid = await m.backfillOidFromPic(r.id);
      if (oid) {
        console.log(`  ✓ ${r.organization_name} (pic=${r.pic}) → oid=${oid}`);
        resolved++;
      } else {
        console.log(`  · ${r.organization_name} (pic=${r.pic}) — no match`);
      }
    } catch (e) {
      console.log(`  ✗ ${r.organization_name}: ${e.message}`);
    }
  }
  console.log(`Resueltas: ${resolved}/${rows.length}`);
  await pool.end();
})();
