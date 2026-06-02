-- ═══════════════════════════════════════════════════════════════
-- Migration 099: widen activity_intellectual_outputs.worker_category
-- ═══════════════════════════════════════════════════════════════
-- Tras el cambio de profileId numérico a `${partner_uuid}::${category}`
-- (commit 5668ad29), la columna varchar(60) se queda corta para
-- UUID(36) + "::" + "Auxiliar / Apoyo administrativo" (31) = 69 chars.
-- Se alarga a varchar(120) para acomodar nombres de categorías futuros.
--
-- Idempotente: comprueba el tamaño actual antes de modificar.
-- ═══════════════════════════════════════════════════════════════

SET @c := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'activity_intellectual_outputs'
     AND COLUMN_NAME = 'worker_category'
);
SET @sql := IF(@c < 120,
  'ALTER TABLE activity_intellectual_outputs MODIFY COLUMN worker_category VARCHAR(120) NULL',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
