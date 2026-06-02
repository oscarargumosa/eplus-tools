-- ═══════════════════════════════════════════════════════════════
-- Migration 096: Project Risks (section 2.1.5 of Application Form Part B)
-- ═══════════════════════════════════════════════════════════════
-- Maps to the "Critical risks and risk management strategy" table:
--   Risk No                        → risk_no (R1, R2, ...)
--   Description                    → description
--   Work package No                → wp_id (FK; NULL allowed = "cross-cutting")
--   Proposed risk-mitigation       → mitigation
--
-- Likelihood / impact (low/medium/high) are conventionally embedded in the
-- description per EACEA guidance, but kept as optional structured columns
-- so we can later filter / score risk profiles without re-parsing.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_risks (
  id            CHAR(36)      NOT NULL,
  project_id    CHAR(36)      NOT NULL,
  wp_id         CHAR(36)      DEFAULT NULL,
  risk_no       VARCHAR(10)   DEFAULT NULL,
  description   TEXT          DEFAULT NULL,
  mitigation    TEXT          DEFAULT NULL,
  likelihood    ENUM('low','medium','high') DEFAULT NULL,
  impact        ENUM('low','medium','high') DEFAULT NULL,
  sort_order    INT           NOT NULL DEFAULT 0,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_risk_project (project_id),
  KEY idx_risk_wp      (wp_id),
  CONSTRAINT fk_risk_project FOREIGN KEY (project_id) REFERENCES projects(id)      ON DELETE CASCADE,
  CONSTRAINT fk_risk_wp      FOREIGN KEY (wp_id)      REFERENCES work_packages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
