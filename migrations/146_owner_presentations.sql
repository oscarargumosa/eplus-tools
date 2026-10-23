-- Presentaciones privadas de Óscar (Admin › Presentaciones, /v1/presentaciones).
-- Solo guarda enlaces de Canva incrustables: el enlace no va en el código
-- porque el repo es público. Lo ve y lo edita únicamente la cuenta dueña
-- (STUDIO_OWNER_EMAIL). Idempotente.

CREATE TABLE IF NOT EXISTS owner_presentations (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200)    NOT NULL,
  design_id   VARCHAR(40)     NOT NULL,
  share_token VARCHAR(80)     NOT NULL,
  sort_order  INT             NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_owner_pres_design (design_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
