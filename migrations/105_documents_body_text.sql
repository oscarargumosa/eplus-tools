-- ============================================================================
-- Migración 105 — Texto completo en documents para CAG
-- ============================================================================
-- Añade body_text (LONGTEXT) + métricas a la tabla documents para que en
-- el mismo upload (Admin → Plus Data o usuario en Writer) podamos guardar:
--   · el texto completo extraído del PDF/DOCX → para CAG (Master)
--   · los chunks vectorizados → para RAG (Writer cascade)
--
-- Antes de esta migración, solo se guardaba lo segundo. body_text se rellena
-- en vectorize.js::processDocument tras la extracción de texto.
--
-- Idempotente: comprueba information_schema antes de ALTER.
-- ============================================================================

SET NAMES utf8mb4;

-- body_text: texto plano completo extraído del fichero
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'body_text'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE documents ADD COLUMN body_text LONGTEXT NULL AFTER storage_path',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- body_text_chars: longitud en caracteres del texto extraído (para coste/preview)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'body_text_chars'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE documents ADD COLUMN body_text_chars INT NOT NULL DEFAULT 0 AFTER body_text',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tokens_estimated: estimación grosso modo (chars/4) para previsualizar coste IA
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'tokens_estimated'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE documents ADD COLUMN tokens_estimated INT NOT NULL DEFAULT 0 AFTER body_text_chars',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
