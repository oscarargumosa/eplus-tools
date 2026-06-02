-- ═══════════════════════════════════════════════════════════════
-- Migration 097: project_partner_eu_projects passes to project_identifier
-- ═══════════════════════════════════════════════════════════════
-- Contexto: el sub-tab Consorcio del Writer ahora carga los proyectos UE
-- de cada partner desde directory-api (pass-through a erasmus-pg, ~317k
-- proyectos reales) en lugar de la tabla MySQL legacy `org_eu_projects`
-- (que sólo tenía cargas manuales, ~5 proyectos por org).
--
-- Implicación: la tabla project_partner_eu_projects, que registra qué
-- proyectos selecciona el usuario por partner, debe pasar a guardar el
-- identificador canónico del directory-api (project_identifier, p. ej.
-- "2025-3-IT03-KA153-YOU-000382840") en vez del UUID local de
-- `org_eu_projects.id`.
--
-- Decisión Oscar 2026-05-08: vaciar la tabla y empezar limpio. Los pocos
-- registros existentes son tests viejos; el matching fuzzy a identifier
-- por título+año no merece la pena.
--
-- Idempotente: comprueba columnas en information_schema antes de alterar.
-- ═══════════════════════════════════════════════════════════════

-- 1) Vaciar la tabla (si existe). TRUNCATE evita disparar FKs.
SET @t := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_partner_eu_projects'
);
SET @sql := IF(@t = 1, 'DELETE FROM project_partner_eu_projects', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) Drop UNIQUE key uq_ppep (si existe), porque referencia eu_project_id.
SET @k := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'project_partner_eu_projects'
     AND INDEX_NAME = 'uq_ppep'
);
SET @sql := IF(@k > 0, 'ALTER TABLE project_partner_eu_projects DROP INDEX uq_ppep', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) Si existe la columna eu_project_id, renombrar+retipar a project_identifier.
--    Si ya existe project_identifier, no hacer nada.
SET @old := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'project_partner_eu_projects'
     AND COLUMN_NAME = 'eu_project_id'
);
SET @new := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'project_partner_eu_projects'
     AND COLUMN_NAME = 'project_identifier'
);
SET @sql := IF(@old = 1 AND @new = 0,
  'ALTER TABLE project_partner_eu_projects CHANGE eu_project_id project_identifier VARCHAR(64) NOT NULL',
  IF(@new = 0,
    'ALTER TABLE project_partner_eu_projects ADD COLUMN project_identifier VARCHAR(64) NOT NULL',
    'DO 0'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4) Recrear UNIQUE sobre la nueva columna (si no existe).
SET @k2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'project_partner_eu_projects'
     AND INDEX_NAME = 'uq_ppep_v2'
);
SET @sql := IF(@k2 = 0,
  'ALTER TABLE project_partner_eu_projects ADD UNIQUE KEY uq_ppep_v2 (project_id, partner_id, project_identifier)',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
