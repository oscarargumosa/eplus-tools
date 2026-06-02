-- ============================================================================
-- Migración 115 — improvement_actions (TASK-007 Fase 5)
-- ============================================================================
-- Cada propuesta de mejora generada por el motor (Claude Sonnet 4) para un
-- diagnosis_finding. El usuario puede aceptar/rechazar/modificar cada una.
-- Al aceptar, se aplica al form_field_values y se persiste un snapshot en
-- proposal_versions.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS improvement_actions (
  id                      CHAR(36) NOT NULL,
  finding_id              CHAR(36) NOT NULL,
  project_id              CHAR(36) NOT NULL,
  where_field_id          VARCHAR(50) DEFAULT NULL,
  change_type             ENUM('add', 'replace', 'delete') NOT NULL DEFAULT 'replace',
  before_text             LONGTEXT,
  after_text              LONGTEXT,
  rationale               TEXT,
  risk                    TEXT,
  estimated_score_delta   DECIMAL(4,2) DEFAULT NULL,
  state                   ENUM('proposed', 'accepted', 'rejected', 'modified') NOT NULL DEFAULT 'proposed',
  llm_model               VARCHAR(100) DEFAULT NULL,
  input_tokens            INT DEFAULT NULL,
  output_tokens           INT DEFAULT NULL,
  cache_read_tokens       INT DEFAULT NULL,
  cache_creation_tokens   INT DEFAULT NULL,
  llm_cost_usd            DECIMAL(8,4) DEFAULT NULL,
  applied_version_id      CHAR(36) DEFAULT NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at              DATETIME DEFAULT NULL,
  created_by_user_id      CHAR(36) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_finding (finding_id),
  KEY idx_project (project_id, state, created_at),
  KEY idx_state (state),
  CONSTRAINT fk_action_finding FOREIGN KEY (finding_id) REFERENCES diagnosis_findings(id) ON DELETE CASCADE,
  CONSTRAINT fk_action_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_action_version FOREIGN KEY (applied_version_id) REFERENCES proposal_versions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '[115] improvement_actions created' AS status;
