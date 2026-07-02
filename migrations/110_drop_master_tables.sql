-- ============================================================================
-- Migración 110 — Drop tablas master_*
-- ============================================================================
-- Replanteo Diagnose & Improve (TASK-007, docs/DIAGNOSE_AND_IMPROVE_PLAN.md).
--
-- El concepto de "Documento Maestro" se elimina del sistema. El Form Part B
-- pasa a ser el documento canónico. Las 6 tablas master_* y sus FKs se borran.
--
-- Decisión confirmada 2026-05-25: borrado limpio (no archivar). El sistema
-- está en borrador interno, sin clientes externos, sin coste de migración.
--
-- Nota: la tabla call_documents (creada en migración 103 junto a las master_*)
-- NO se borra — sigue siendo útil para Diagnóstico y reglas del Writer.
-- La extensión de project_documents.doc_purpose tampoco se toca.
--
-- Orden de DROP respeta dependencias FK (hijas antes que padres).
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS master_diagnosis_items;
DROP TABLE IF EXISTS master_diagnoses;
DROP TABLE IF EXISTS master_to_form_mapping;
DROP TABLE IF EXISTS master_exports;
DROP TABLE IF EXISTS master_chapters;
DROP TABLE IF EXISTS master_documents;

SET FOREIGN_KEY_CHECKS = 1;

SELECT '[110] master_* tables dropped' AS status;
