-- ============================================================================
-- Migración 113 — Diagnosis runs + diagnosis findings (TASK-007 Fase 2)
-- ============================================================================
-- Tablas para findings generados por el motor de diagnóstico in-app.
-- Distintas de evaluation_findings (que son findings parseados de cartas
-- reales de evaluador) — éstas son SINTÉTICAS, generadas por las 3 pasadas
-- del diagnose engine sobre el form_field_values del cliente.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

SET NAMES utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. diagnosis_runs
--    Una fila por ejecución del diagnóstico sobre un proyecto.
--    triage_verdict deriva de las reglas numéricas:
--      redesign      = ≥2 criterios con score <3/5
--      perfect       = todos ≥3/5 pero alguno <4/5
--      export        = todos ≥4/5
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnosis_runs (
  id                    CHAR(36) NOT NULL,
  project_id            CHAR(36) NOT NULL,
  program_id            CHAR(36) DEFAULT NULL,
  triage_verdict        ENUM('redesign', 'perfect', 'export', 'unknown') NOT NULL DEFAULT 'unknown',
  scores_by_criterion   JSON DEFAULT NULL,
  total_score_estimate  DECIMAL(5,2) DEFAULT NULL,
  total_findings        INT NOT NULL DEFAULT 0,
  critical_findings     INT NOT NULL DEFAULT 0,
  high_findings         INT NOT NULL DEFAULT 0,
  has_letter_input      TINYINT(1) NOT NULL DEFAULT 0,
  letter_id             CHAR(36) DEFAULT NULL,
  status                ENUM('running', 'ready', 'failed') NOT NULL DEFAULT 'running',
  llm_input_tokens      INT DEFAULT NULL,
  llm_output_tokens     INT DEFAULT NULL,
  notes                 TEXT,
  started_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at           DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_project (project_id, started_at),
  KEY idx_status (status),
  CONSTRAINT fk_diag_run_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_diag_run_letter  FOREIGN KEY (letter_id)  REFERENCES evaluation_letters(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. diagnosis_findings
--    Cada finding sintético generado por las pasadas A/B/C.
--    pattern_id puede ser NULL para findings de la Pasada C (cross-section
--    coherence) que detectan contradicciones específicas y no provienen del
--    pattern_library.
--    applies_to_section es field_id del Form (s1_1_text, etc.) — FK suave.
--    suggested_action es texto humano: "Añade fuente concreta de financiación
--    post-proyecto a s5_1_text".
--    state se usa luego en F5 (Perfeccionar dirigido) para tracking.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnosis_findings (
  id                    CHAR(36) NOT NULL,
  run_id                CHAR(36) NOT NULL,
  source_pass           ENUM('A', 'B', 'C', 'D') NOT NULL,
  pattern_id            CHAR(36) DEFAULT NULL,
  criterion             VARCHAR(100) DEFAULT NULL,
  severity              ENUM('critical', 'high', 'medium_high', 'medium', 'medium_low', 'low', 'positive') NOT NULL DEFAULT 'medium',
  finding_text          TEXT NOT NULL,
  evidence_quote        TEXT,
  applies_to_section    VARCHAR(50) DEFAULT NULL,
  suggested_action      TEXT,
  estimated_score_delta DECIMAL(4,2) DEFAULT NULL,
  state                 ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  sort_order            INT NOT NULL DEFAULT 0,
  resolved_at           DATETIME DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_run (run_id, sort_order),
  KEY idx_pattern (pattern_id),
  KEY idx_severity (severity),
  KEY idx_state (state),
  CONSTRAINT fk_diag_finding_run     FOREIGN KEY (run_id)     REFERENCES diagnosis_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_diag_finding_pattern FOREIGN KEY (pattern_id) REFERENCES pattern_library(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SELECT '[113] diagnosis_runs, diagnosis_findings created' AS status;
