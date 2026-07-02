-- ============================================================================
-- Migración 111 — Evaluation letters, findings, pattern library, proposal versions
-- ============================================================================
-- Replanteo Diagnose & Improve (TASK-007).
-- Crea las 4 tablas centrales del sistema nuevo:
--   - evaluation_letters       : cartas de evaluador subidas (raw + metadata)
--   - evaluation_findings      : findings parseados estructurados
--   - pattern_library          : patrones agregados (activo defensible)
--   - proposal_versions        : historial de versiones del Form Part B
--
-- Convención FK (consistente con call_eligibility, eval_templates, etc.):
--   program_id CHAR(36) referencia intake_programs(id) — UUID interno.
--   intake_programs.program_id (VARCHAR) es el código externo
--   ("ERASMUS-YOUTH-2025-YOUTH-TOG"), no se usa como FK directa.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

SET NAMES utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. evaluation_letters
--    Cada carta de evaluador subida. Una carta = una propuesta evaluada.
--    Una misma propuesta puede tener varias cartas (re-presentaciones).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluation_letters (
  id                      CHAR(36) NOT NULL,
  program_id              CHAR(36) NOT NULL,
  proposal_number         VARCHAR(50) DEFAULT NULL,
  proposal_acronym        VARCHAR(100) DEFAULT NULL,
  proposal_title          VARCHAR(500) DEFAULT NULL,
  total_score             DECIMAL(5,2) DEFAULT NULL,
  total_threshold         DECIMAL(5,2) DEFAULT NULL,
  result                  ENUM('awarded', 'rejected_threshold', 'rejected_ranking', 'unknown') NOT NULL DEFAULT 'unknown',
  letter_date             DATE DEFAULT NULL,
  source_format           ENUM('eacea_pdf', 'eacea_docx', 'narrative', 'summary', 'manual') NOT NULL DEFAULT 'manual',
  source_filename         VARCHAR(500) DEFAULT NULL,
  raw_text                LONGTEXT,
  scores_by_criterion     JSON DEFAULT NULL,
  language                VARCHAR(10) NOT NULL DEFAULT 'en',
  uploaded_by_user_id     CHAR(36) DEFAULT NULL,
  notes                   TEXT,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_program (program_id),
  KEY idx_program_result (program_id, result),
  KEY idx_proposal_number (proposal_number),
  CONSTRAINT fk_eval_letter_program FOREIGN KEY (program_id) REFERENCES intake_programs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. evaluation_findings
--    Cada finding parseado de una carta. Granularidad: una crítica concreta
--    o un elogio concreto del ponente.
--
--    severity mapea al "vocabulario del ponente" mapeado en el plan:
--      critical    = "is a major shortcoming"
--      high        = "is a shortcoming" / "is inadequate"
--      medium_high = "does not sufficiently address" / "lacks sufficient"
--      medium      = "does not clearly demonstrate" / "falls short in"
--      medium_low  = "lacks clarity on" / "is not fully clear"
--      low         = "small shortcoming" / "minor concern"
--      positive    = elogio explícito (mantener para reglas del Writer)
--
--    applies_to_section: field_id del Form (s1_1_text, s2_2_2_text, ...).
--    Es FK suave, no enforced, porque puede aplicar a múltiples secciones.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluation_findings (
  id                      CHAR(36) NOT NULL,
  letter_id               CHAR(36) NOT NULL,
  program_id              CHAR(36) NOT NULL,
  criterion               VARCHAR(100) NOT NULL,
  sub_criterion           VARCHAR(100) DEFAULT NULL,
  severity                ENUM('critical', 'high', 'medium_high', 'medium', 'medium_low', 'low', 'positive') NOT NULL DEFAULT 'medium',
  is_positive             TINYINT(1) NOT NULL DEFAULT 0,
  finding_text            TEXT NOT NULL,
  fragment_quote          TEXT,
  applies_to_section      VARCHAR(50) DEFAULT NULL,
  pattern_id              CHAR(36) DEFAULT NULL,
  sort_order              INT NOT NULL DEFAULT 0,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_letter (letter_id, sort_order),
  KEY idx_program (program_id),
  KEY idx_criterion (criterion, sub_criterion),
  KEY idx_severity (severity),
  KEY idx_pattern (pattern_id),
  CONSTRAINT fk_finding_letter FOREIGN KEY (letter_id) REFERENCES evaluation_letters(id) ON DELETE CASCADE,
  CONSTRAINT fk_finding_program FOREIGN KEY (program_id) REFERENCES intake_programs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pattern_library
--    Patrones agregados desde evaluation_findings. El activo defensible.
--
--    scope:
--      universal = aparece en cartas de ≥2 programas distintos con N≥2 total
--      programme = aparece en N≥2 cartas del mismo programa
--      emergent  = aparece en N=1 (esperando confirmación)
--
--    writer_rule_text: redacción humana de la regla que el Writer aplica
--    ("Cuando el usuario escriba sustainability, validar que hay fuente
--    concreta de financiación post-proyecto").
--
--    pattern_text es la formulación canónica del patrón (ej. "Budget equal
--    allocation entre partners sin justificar variaciones de salario o
--    workload del coordinador").
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pattern_library (
  id                      CHAR(36) NOT NULL,
  scope                   ENUM('universal', 'programme', 'emergent') NOT NULL DEFAULT 'emergent',
  programme_id            CHAR(36) DEFAULT NULL,
  pattern_text            VARCHAR(500) NOT NULL,
  criterion               VARCHAR(100) DEFAULT NULL,
  sub_criterion           VARCHAR(100) DEFAULT NULL,
  severity_avg            ENUM('critical', 'high', 'medium_high', 'medium', 'medium_low', 'low', 'positive') NOT NULL DEFAULT 'medium',
  occurrences_count       INT NOT NULL DEFAULT 0,
  letter_ids              JSON DEFAULT NULL,
  writer_rule_text        TEXT,
  active                  TINYINT(1) NOT NULL DEFAULT 1,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_scope_active (scope, active),
  KEY idx_programme (programme_id),
  KEY idx_criterion (criterion, sub_criterion),
  CONSTRAINT fk_pattern_programme FOREIGN KEY (programme_id) REFERENCES intake_programs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. proposal_versions
--    Snapshot del Form Part B (form_field_values) en momentos clave.
--    Permite diff y rollback en Perfeccionar dirigido.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_versions (
  id                      CHAR(36) NOT NULL,
  project_id              CHAR(36) NOT NULL,
  version_number          INT NOT NULL DEFAULT 1,
  triggered_by            ENUM('manual_save', 'improvement_action', 'import', 'diagnosis', 'pre_export') NOT NULL DEFAULT 'manual_save',
  snapshot_json           JSON NOT NULL,
  notes                   TEXT,
  created_by_user_id      CHAR(36) DEFAULT NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project (project_id, version_number),
  KEY idx_project_date (project_id, created_at),
  CONSTRAINT fk_version_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SELECT '[111] evaluation_letters, evaluation_findings, pattern_library, proposal_versions created' AS status;
