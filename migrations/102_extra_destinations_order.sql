-- Add order_index to extra_destinations so loadFullState can reconstruct
-- the same _edN mapping that saveFullState used (host_extra_dest_id → _edN).
-- Without this, multi-extra-dest projects would lose host references after reload.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'extra_destinations' AND COLUMN_NAME = 'order_index'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE extra_destinations ADD COLUMN order_index INT NOT NULL DEFAULT 0 AFTER subsistence_rate',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
