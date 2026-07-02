/**
 * Backfill: default-select every key_staff for every existing project.
 *
 * For each project × partner with an organization link, finds key_staff
 * members from the organization that don't yet have a project_partner_staff
 * row, and inserts one with selected=1. Idempotent — safe to run multiple
 * times. Never modifies existing rows (so user deselections are preserved).
 *
 * Usage:
 *   node scripts/backfill-staff-selected.js          # apply
 *   node scripts/backfill-staff-selected.js --dry    # report without writing
 */
'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const DRY = process.argv.includes('--dry');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
    charset: 'utf8mb4',
  });

  // 1. List all (project_id, partner_id, organization_id) triples where the
  //    partner is linked to an organization.
  const [partners] = await conn.execute(`
    SELECT p.id   AS partner_id,
           p.project_id,
           p.organization_id,
           p.name
      FROM partners p
     WHERE p.organization_id IS NOT NULL
  `);

  let totalInserted = 0;
  let totalScanned = 0;
  let totalSkipped = 0;

  for (const pp of partners) {
    const [staff] = await conn.execute(
      `SELECT id FROM org_key_staff WHERE organization_id = ?`,
      [pp.organization_id]
    );
    if (!staff.length) continue;

    const [tracked] = await conn.execute(
      `SELECT staff_id FROM project_partner_staff
        WHERE project_id = ? AND partner_id = ?`,
      [pp.project_id, pp.partner_id]
    );
    const trackedIds = new Set(tracked.map(r => r.staff_id));

    for (const s of staff) {
      totalScanned++;
      if (trackedIds.has(s.id)) { totalSkipped++; continue; }
      if (DRY) {
        totalInserted++;
        continue;
      }
      try {
        await conn.execute(
          `INSERT IGNORE INTO project_partner_staff
             (id, project_id, partner_id, staff_id, selected)
           VALUES (?, ?, ?, ?, 1)`,
          [randomUUID(), pp.project_id, pp.partner_id, s.id]
        );
        totalInserted++;
      } catch (e) {
        console.warn(`  ! insert failed for partner=${pp.name} staff=${s.id}: ${e.message}`);
      }
    }
  }

  console.log('');
  console.log('Backfill summary');
  console.log('-----------------');
  console.log(`  Partners with org link:   ${partners.length}`);
  console.log(`  Staff rows scanned:       ${totalScanned}`);
  console.log(`  Already tracked (skip):   ${totalSkipped}`);
  console.log(`  ${DRY ? 'Would insert' : 'Inserted (selected=1)'}: ${totalInserted}`);
  console.log('');

  await conn.end();
}

run().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
