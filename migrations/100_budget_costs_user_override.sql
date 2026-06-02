-- ═══════════════════════════════════════════════════════════════
-- Migration 100: budget_costs.is_user_override
-- ═══════════════════════════════════════════════════════════════
-- El budget v2 (tablas budget_*) se trata ahora como vista materializada
-- del calc_state: se regenera automáticamente al abrir el Writer.
--
-- Para no perder ediciones manuales futuras (notes, ajustes de cifra que
-- el usuario meta directamente desde el Writer), reservamos un flag
-- por row: si is_user_override=1, la regeneración respeta esa row y
-- no la machaca. Por ahora ningún flujo lo activa, pero el campo
-- existe para cuando se añada UI de edición.
--
-- Idempotente: comprueba information_schema antes de ALTER.
-- ═══════════════════════════════════════════════════════════════

SET @c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'budget_costs'
     AND COLUMN_NAME = 'is_user_override'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE budget_costs ADD COLUMN is_user_override TINYINT(1) NOT NULL DEFAULT 0 AFTER notes',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
