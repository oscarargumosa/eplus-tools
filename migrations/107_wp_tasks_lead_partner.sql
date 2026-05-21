-- ═══════════════════════════════════════════════════════════════
-- Migration 107: wp_tasks lead_partner_id
-- ═══════════════════════════════════════════════════════════════
-- Adds the "Lead partner" concept to per-WP tasks (developer module).
-- Eligible leaders are restricted in the UI to partners that have any
-- budget cost in the WP (regla: si una entidad no recibe importe en el
-- presupuesto del WP, no puede liderar tareas de ese WP).
--
-- The column is nullable: tasks can exist before a leader is assigned.
-- FK is ON DELETE SET NULL so removing a partner doesn't break tasks.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- 1) ADD COLUMN lead_partner_id (only if not already present)
SET @c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wp_tasks'
     AND COLUMN_NAME = 'lead_partner_id'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE wp_tasks ADD COLUMN lead_partner_id CHAR(36) NULL AFTER description',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) ADD INDEX on lead_partner_id (only if not already present)
SET @c := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wp_tasks'
     AND INDEX_NAME = 'idx_wp_task_lead'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE wp_tasks ADD INDEX idx_wp_task_lead (lead_partner_id)',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) ADD FOREIGN KEY (only if not already present)
SET @c := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wp_tasks'
     AND CONSTRAINT_NAME = 'fk_wp_task_lead'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE wp_tasks ADD CONSTRAINT fk_wp_task_lead FOREIGN KEY (lead_partner_id) REFERENCES partners(id) ON DELETE SET NULL',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
