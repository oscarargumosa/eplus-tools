#!/usr/bin/env node
require('dotenv').config();
const pool = require('../node/src/utils/db');

(async () => {
  try {
    const [rows] = await pool.query(
      `SELECT id, oid, pic, organization_name, is_public, lat, lng, city, region, address, post_code, geocoded_source, description
         FROM organizations
        WHERE oid IS NOT NULL OR organization_name LIKE '%PERMACULTURA%'
        ORDER BY id DESC
        LIMIT 10`
    );
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await pool.end();
  }
})();
