-- Traducciones bajo demanda de lo que escriben los usuarios (botón «Traducir»
-- en el foro, visiones publicadas, fichas de entidad…; /v1/translate).
-- Clave: hash del texto original + idioma de destino. Si el autor edita su
-- texto, el hash cambia y la traducción vieja deja de usarse sola.
-- Idempotente.

CREATE TABLE IF NOT EXISTS content_translations (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_hash  CHAR(64)        NOT NULL,
  target_lang  VARCHAR(5)      NOT NULL,
  translated   MEDIUMTEXT      NOT NULL,
  chars        INT UNSIGNED    NOT NULL DEFAULT 0,
  created_by   VARCHAR(36)     NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_content_tr (source_hash, target_lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
