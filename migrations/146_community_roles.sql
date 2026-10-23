-- Comunidad: roles profesionales y «sin entidad» (23-oct-2026). Ver docs/COMUNIDAD.md.
--   roles            claves separadas por comas (constants.ROLES): redactor, evaluador…
--   no_organization  1 = la persona dice que no pertenece a ninguna entidad
--                    (distinto de tener entidad y no querer mostrarla).
-- La columna `languages` se deja (ya no se pide ni se muestra). Idempotente.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'community_profiles' AND COLUMN_NAME = 'roles');
SET @sql := IF(@c = 0, 'ALTER TABLE community_profiles ADD COLUMN roles VARCHAR(255) NULL AFTER bio', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'community_profiles' AND COLUMN_NAME = 'no_organization');
SET @sql := IF(@c = 0, 'ALTER TABLE community_profiles ADD COLUMN no_organization TINYINT(1) NOT NULL DEFAULT 0 AFTER organization_id', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
