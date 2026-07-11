-- ─────────────────────────────────────────────────────────────────────
-- 123 · EU Vision (TASK-012) — asistente idea → ficha de visión
-- Doc canónico: docs/EU_VISION_PLAN.md §3
-- Idempotente: CREATE TABLE IF NOT EXISTS, índices inline.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visions (
  id                CHAR(36)      NOT NULL,
  user_id           CHAR(36)      NOT NULL,
  entity_oid        VARCHAR(15)   NULL,
  call_id           VARCHAR(190)  NOT NULL,
  call_title        VARCHAR(255)  NULL,
  programme         VARCHAR(80)   NULL,
  call_deadline     DATE          NULL,
  title             VARCHAR(255)  NULL,
  problem           TEXT          NULL,
  european_value    TEXT          NULL,
  budget_option_eur DECIMAL(14,2) NULL,
  budget_label      VARCHAR(120)  NULL,
  wp_count          TINYINT       NULL,
  duration_months   SMALLINT      NULL,
  partner_types     JSON          NULL,
  partner_countries JSON          NULL,
  own_role          VARCHAR(255)  NULL,
  differentiator    TEXT          NULL,
  status            ENUM('draft','complete') NOT NULL DEFAULT 'draft',
  visibility        ENUM('private','public') NOT NULL DEFAULT 'private',
  current_step      TINYINT       NOT NULL DEFAULT 1,
  published_at      DATETIME      NULL,
  project_id        CHAR(36)      NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vision_user (user_id),
  KEY idx_vision_visibility (visibility, published_at),
  KEY idx_vision_call (call_id),
  CONSTRAINT fk_vision_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vision_references (
  id                  CHAR(36)     NOT NULL,
  vision_id           CHAR(36)     NOT NULL,
  project_identifier  VARCHAR(120) NOT NULL,
  title               VARCHAR(255) NULL,
  programme           VARCHAR(80)  NULL,
  funding_year        SMALLINT     NULL,
  coordinator_country VARCHAR(8)   NULL,
  match_score         DECIMAL(4,3) NULL,
  snapshot            JSON         NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vref (vision_id, project_identifier),
  KEY idx_vref_vision (vision_id),
  CONSTRAINT fk_vref_vision FOREIGN KEY (vision_id) REFERENCES visions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vision_interests (
  id          CHAR(36)    NOT NULL,
  vision_id   CHAR(36)    NOT NULL,
  user_id     CHAR(36)    NOT NULL,
  entity_oid  VARCHAR(15) NULL,
  message     TEXT        NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interest (vision_id, user_id),
  KEY idx_interest_vision (vision_id),
  CONSTRAINT fk_interest_vision FOREIGN KEY (vision_id) REFERENCES visions (id) ON DELETE CASCADE,
  CONSTRAINT fk_interest_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
