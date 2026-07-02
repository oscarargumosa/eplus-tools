// Migration 117 — Facts Ledger + Prompt Inspector (TASK-008)
//
// Three additions, all idempotent:
//
//   1. ai_generations.segments  (JSON)
//      The cascade Writer logs its assembled prompt here, broken into named
//      segments ({name, source, chars}) so the admin inspector can show a
//      desglosado view instead of a wall of text. ai_generations already
//      stores system_prompt/user_prompt/raw_response from the D+MS generator;
//      this column lets the Writer reuse the same table.
//
//   2. project_facts  (table)
//      Soft/emergent facts only. Hard facts (budget, partners, WP leaders)
//      are DERIVED at runtime, never stored here. A fact captured from a
//      generation enters as 'candidate' and only becomes 'canonical' after
//      validation — the gate that stops hallucinations from propagating.
//
//   3. prompt_blocks  (table)
//      Externalises the hardcoded prompt blocks (persona, anti-patterns,
//      output format) so they can be edited from Admin and versioned, without
//      touching code. Program-specific rows override the global (program_id
//      NULL) default. generateSection reads the active row, falling back to
//      the in-code constant when no row exists.

'use strict';

module.exports = async function (conn) {
  // ── 1. ai_generations.segments ──────────────────────────────
  const [seg] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ai_generations'
       AND COLUMN_NAME = 'segments'`
  );
  if (seg.length === 0) {
    await conn.query(`ALTER TABLE ai_generations ADD COLUMN segments JSON DEFAULT NULL`);
    console.log('[117] ai_generations.segments added');
  } else {
    console.log('[117] ai_generations.segments already exists — skipped');
  }

  // Optional section_id for fast filtering of writer-section generations
  const [sid] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ai_generations'
       AND COLUMN_NAME = 'section_id'`
  );
  if (sid.length === 0) {
    await conn.query(`ALTER TABLE ai_generations ADD COLUMN section_id VARCHAR(80) DEFAULT NULL`);
    await conn.query(`ALTER TABLE ai_generations ADD KEY idx_aig_section (project_id, section_id, created_at)`);
    console.log('[117] ai_generations.section_id added');
  } else {
    console.log('[117] ai_generations.section_id already exists — skipped');
  }

  // ── 2. project_facts ────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS project_facts (
      id            CHAR(36)     NOT NULL,
      project_id    CHAR(36)     NOT NULL,
      fact_key      VARCHAR(120) NOT NULL,
      fact_value    TEXT         NOT NULL,
      status        ENUM('candidate','canonical','rejected') NOT NULL DEFAULT 'candidate',
      source        VARCHAR(60)  DEFAULT NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      validated_at  DATETIME     DEFAULT NULL,
      validated_by  CHAR(36)     DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pf_project_key (project_id, fact_key),
      KEY idx_pf_project_status (project_id, status),
      CONSTRAINT fk_pf_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[117] project_facts ready');

  // ── 3. prompt_blocks ────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS prompt_blocks (
      id            CHAR(36)     NOT NULL,
      name          VARCHAR(80)  NOT NULL,
      program_id    CHAR(36)     DEFAULT NULL,
      content       MEDIUMTEXT   NOT NULL,
      version       INT          NOT NULL DEFAULT 1,
      active        TINYINT(1)   NOT NULL DEFAULT 1,
      updated_by    CHAR(36)     DEFAULT NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pb_name_program (name, program_id),
      KEY idx_pb_name (name, active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[117] prompt_blocks ready');
};
