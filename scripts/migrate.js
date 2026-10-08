/**
 * Migration runner con control de aplicadas.
 * Reads SQL/JS files from /migrations in order and executes them.
 * Usage: node scripts/migrate.js
 *
 * Tabla schema_migrations(name PK, checksum, applied_at):
 *   - Arranque normal: solo se ejecutan las migraciones que no están registradas
 *     (más las de ALWAYS_RERUN).
 *   - Primer arranque en una BD que aún no tiene la tabla: se ejecutan TODAS,
 *     como se hacía antes (son idempotentes), y se registran.
 *   - Si el contenido de una migración ya aplicada cambia (checksum distinto),
 *     se avisa en el log pero NO se re-ejecuta: los cambios van en una nueva.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

/* Migraciones de DATOS que dependen de ejecutarse en cada arranque. Se
   re-ejecutan siempre (son idempotentes y baratas cuando no hay nada que hacer):
   - 080, 084: crean vista/columnas solo si ya existen las tablas de entidades
     (en una BD nueva se saltan y se reintentan tras importar el dump).
   - 083: recalcula stats_cache cuando tiene más de 24 h.
   - 091: geocodifica las entidades nuevas que aún no tienen coordenadas.
   - 113: aplica los JSON nuevos que se añadan a data/seed-calls/ (el checksum
     del .js no cambia al añadir un JSON).
   - 119, 120: siembran KA220-YOU cuando el programa existe; 120 restaura por
     diseño los criterios de la guía en cada deploy (ver su cabecera).            */
const ALWAYS_RERUN = new Set([
  '080_entities_public_view.js',
  '083_populate_stats_cache.js',
  '084_entities_geocoded.js',
  '091_backfill_geocoded.js',
  '113_apply_call_seeds.js',
  '119_seed_ka220_you_eval.js',
  '120_seed_ka220_you_criteria_full.js',
]);

const TOLERATED = new Set(['ER_TABLE_EXISTS_ERROR', 'ER_DUP_ENTRY', 'ER_DUP_KEYNAME', 'ER_DUP_FIELDNAME']);

function checksumOf(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  // Si arrancan dos instancias a la vez, la segunda espera a la primera.
  const [[lock]] = await conn.query("SELECT GET_LOCK('eplus_schema_migrations', 900) AS got");
  if (!lock.got) throw new Error('No se pudo obtener el bloqueo de migraciones');

  const [[{ n: hasTable }]] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations'`);
  const firstRun = !hasTable;
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(191) NOT NULL PRIMARY KEY,
      checksum    CHAR(64)     NOT NULL,
      applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const applied = new Map();
  if (!firstRun) {
    const [rows] = await conn.query('SELECT name, checksum FROM schema_migrations');
    rows.forEach(r => applied.set(r.name, r.checksum));
  }

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
    .sort();

  console.log(`Found ${files.length} migration(s)${firstRun ? ' — schema_migrations nueva: se ejecutan todas y se registran' : `, ${applied.size} ya registradas`}.`);

  let ran = 0;
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sum = checksumOf(filePath);
    const known = applied.get(file);
    const always = ALWAYS_RERUN.has(file);

    if (known && !always) {
      if (known !== sum) {
        console.warn(`  ⚠ ${file} cambió desde que se aplicó (checksum distinto). NO se re-ejecuta: pon el cambio en una migración nueva.`);
      }
      continue;
    }

    console.log(`  Running ${file}${known ? ' (siempre se re-ejecuta)' : ''}...`);
    ran++;
    try {
      if (file.endsWith('.js')) {
        const migrationFn = require(filePath);
        await migrationFn(conn);
      } else {
        const sql = fs.readFileSync(filePath, 'utf8');
        await conn.query(sql);
      }
      console.log(`  ✓ ${file} done`);
    } catch (err) {
      // Tolerate "already exists" and "duplicate entry" errors — migrations are idempotent
      if (TOLERATED.has(err.code)) {
        console.log(`  ⊘ ${file} skipped (already applied): ${err.message}`);
      } else {
        console.error(`  ✗ ${file} failed:`, err.message);
        process.exit(1);
      }
    }
    await conn.query(
      `INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE checksum = VALUES(checksum)`, [file, sum]);
  }

  console.log(`All migrations complete (${ran} ejecutada(s)).`);
  await conn.query("SELECT RELEASE_LOCK('eplus_schema_migrations')");
  await conn.end();
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
