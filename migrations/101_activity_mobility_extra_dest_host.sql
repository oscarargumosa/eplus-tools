-- ═══════════════════════════════════════════════════════════════
-- Migration 101: activity_mobility supports extra_destination host
-- ═══════════════════════════════════════════════════════════════
-- Cuando un meeting/ltta tiene su host como una extra_destination
-- (típico para Brussels Event, conferencias en sedes externas, etc.),
-- el schema actual obliga a poner un partner como host (host_partner_id NOT NULL)
-- y descarta toda la mobility en saveFullState (ver calculator/model.js:1256).
--
-- Cambios:
--   1) host_partner_id pasa a NULLABLE.
--   2) Nueva columna host_extra_dest_id char(36) NULL referenciando extra_destinations(id).
--   3) Constraint lógico (validado en código): exactamente uno de los dos debe ser NOT NULL.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- 1) host_partner_id → NULLABLE
SET @nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'activity_mobility'
     AND COLUMN_NAME = 'host_partner_id'
);
SET @sql := IF(@nullable = 'NO',
  'ALTER TABLE activity_mobility MODIFY COLUMN host_partner_id CHAR(36) NULL',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) Add host_extra_dest_id
SET @c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'activity_mobility'
     AND COLUMN_NAME = 'host_extra_dest_id'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE activity_mobility ADD COLUMN host_extra_dest_id CHAR(36) NULL AFTER host_partner_id',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
