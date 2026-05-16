-- ============================================================================
-- Migración 106 — call_documents.sort_order default = 1
-- ============================================================================
-- Cambiamos el valor por defecto de la prioridad CAG a 1 (en vez de 0).
-- Razón: el modelo mental es "1 = prioridad normal". Para SUBIR un doc en
-- la cola se baja a 0 (o -1); para BAJARLO se sube a 2, 3, etc.
-- Esto evita que un upload nuevo se cuele agresivamente arriba del orden.
--
-- Idempotente: solo actualiza valores 0 a 1 y modifica el DEFAULT.
-- ============================================================================

SET NAMES utf8mb4;

-- 1) Pasar todos los sort_order=0 actuales a 1 (default histórico)
UPDATE call_documents SET sort_order = 1 WHERE sort_order = 0;

-- 2) Cambiar el DEFAULT de la columna a 1 (los próximos inserts arrancan así)
ALTER TABLE call_documents MODIFY COLUMN sort_order INT DEFAULT 1;
