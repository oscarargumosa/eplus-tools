-- ═══════════════════════════════════════════════════════════════
-- Migration 098: intake_programs.max_partners
-- ═══════════════════════════════════════════════════════════════
-- Pareja de min_partners para acotar el tamaño máximo del consorcio
-- por convocatoria. Editable desde Admin → Data E+ → Call Data.
--
-- NULL = sin límite superior declarado en la call.
-- Idempotente: comprueba information_schema antes de ALTER.
-- ═══════════════════════════════════════════════════════════════

SET @c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'intake_programs'
     AND COLUMN_NAME = 'max_partners'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE intake_programs ADD COLUMN max_partners INT NULL AFTER min_partners',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
