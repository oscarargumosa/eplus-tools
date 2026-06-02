-- ============================================================================
-- Migración 103 — Documento Maestro: tablas estructurales base
-- ============================================================================
-- Crea el esqueleto de tablas para la arquitectura definida en
-- docs/PROJECT_MASTER_ARCHITECTURE.md (sesión 2026-05-16).
--
-- Esta migración SOLO crea tablas. No migra datos existentes, no hay UI ni
-- pipeline conectado todavía. Permite que las siguientes piezas
-- (compilación, diagnóstico, chat, mapping, exports) tengan dónde escribir.
--
-- Convenciones (CLAUDE.md):
--   - char(36) UUID v4 generado en Node
--   - snake_case inglés
--   - DECIMAL(12,2) para importes (no aplica aquí pero por consistencia)
--   - TINYINT(1) para booleanos
--   - CREATE TABLE IF NOT EXISTS (idempotente)
--   - FKs con ON DELETE CASCADE donde el dato pierde sentido sin el padre
-- ============================================================================

SET NAMES utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. master_documents
--    Un Documento Maestro por proyecto. Estructura raíz del libro del
--    proyecto, sin límites de caracteres. Versionado independiente del
--    proyecto: el proyecto puede tener varias versiones nombradas del Maestro.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_documents (
  id              CHAR(36) NOT NULL,
  project_id      CHAR(36) NOT NULL,
  version_tag     VARCHAR(50) NOT NULL DEFAULT 'v1',
  version_label   VARCHAR(255) DEFAULT NULL,
  status          ENUM('draft', 'compiling', 'ready', 'archived') NOT NULL DEFAULT 'draft',
  language        VARCHAR(10) NOT NULL DEFAULT 'es',
  total_chars     INT NOT NULL DEFAULT 0,
  parent_id       CHAR(36) DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project (project_id),
  KEY idx_project_version (project_id, version_tag),
  KEY idx_parent (parent_id),
  CONSTRAINT fk_master_doc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_master_doc_parent FOREIGN KEY (parent_id) REFERENCES master_documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. master_chapters
--    Capítulos del Documento Maestro (Resumen / WPs / Consorcio / Impacto /
--    Presupuesto / Q&A). Cada capítulo es un bloque de texto enriquecido
--    sin límite. La estructura se decide por chapter_key (estable) y
--    chapter_type (categoría semántica).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_chapters (
  id                CHAR(36) NOT NULL,
  master_doc_id     CHAR(36) NOT NULL,
  chapter_key       VARCHAR(100) NOT NULL,
  chapter_type      ENUM('summary', 'wp', 'partner', 'impact', 'budget', 'qa', 'custom') NOT NULL,
  title             VARCHAR(500) NOT NULL,
  body              MEDIUMTEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  parent_chapter_id CHAR(36) DEFAULT NULL,
  ref_entity_type   VARCHAR(50) DEFAULT NULL,
  ref_entity_id     CHAR(36) DEFAULT NULL,
  char_count        INT NOT NULL DEFAULT 0,
  last_ai_edit_at   DATETIME DEFAULT NULL,
  last_human_edit_at DATETIME DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_master_doc (master_doc_id),
  KEY idx_master_doc_sort (master_doc_id, sort_order),
  KEY idx_master_doc_key (master_doc_id, chapter_key),
  KEY idx_master_doc_type (master_doc_id, chapter_type),
  KEY idx_parent (parent_chapter_id),
  KEY idx_ref_entity (ref_entity_type, ref_entity_id),
  CONSTRAINT fk_master_chapter_doc FOREIGN KEY (master_doc_id) REFERENCES master_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_master_chapter_parent FOREIGN KEY (parent_chapter_id) REFERENCES master_chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. master_exports
--    Cada export del Maestro queda registrado: PDF generado, fecha,
--    convocatoria destino (si aplica), estado borrador/lista-para-presentar.
--    Los PDFs físicos van en disco; aquí solo metadatos + path.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_exports (
  id                  CHAR(36) NOT NULL,
  master_doc_id       CHAR(36) NOT NULL,
  project_id          CHAR(36) NOT NULL,
  export_kind         ENUM('amplio', 'formulario') NOT NULL,
  call_id             CHAR(36) DEFAULT NULL,
  form_template_id    CHAR(36) DEFAULT NULL,
  language            VARCHAR(10) NOT NULL DEFAULT 'es',
  state               ENUM('borrador', 'lista_para_presentar') NOT NULL DEFAULT 'borrador',
  pdf_path            VARCHAR(500) DEFAULT NULL,
  page_count          INT DEFAULT NULL,
  size_bytes          BIGINT DEFAULT NULL,
  generated_by_user_id CHAR(36) DEFAULT NULL,
  exported_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  marked_at           DATETIME DEFAULT NULL,
  notes               TEXT,
  PRIMARY KEY (id),
  KEY idx_master_doc (master_doc_id),
  KEY idx_project (project_id),
  KEY idx_project_kind (project_id, export_kind),
  KEY idx_call (call_id),
  CONSTRAINT fk_master_export_doc FOREIGN KEY (master_doc_id) REFERENCES master_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_master_export_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. chat_threads
--    Un hilo de chat por proyecto (puede haber más, pero el modelo asume
--    un hilo principal persistente). Anclaje visual al campo es solo UI;
--    en BD el hilo es uno solo y la IA tiene todo el contexto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_threads (
  id              CHAR(36) NOT NULL,
  project_id      CHAR(36) NOT NULL,
  user_id         CHAR(36) NOT NULL,
  title           VARCHAR(255) NOT NULL DEFAULT 'Hilo de proyecto',
  phase           ENUM('design', 'write', 'perfect', 'evaluate') NOT NULL DEFAULT 'perfect',
  is_archived     TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_message_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_project (project_id),
  KEY idx_project_phase (project_id, phase, is_archived),
  KEY idx_user (user_id),
  CONSTRAINT fk_chat_thread_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. chat_messages
--    Mensajes del hilo. anchor_kind + anchor_id permiten que la UI muestre
--    "anclado a la actividad X" cuando el usuario está mirando ese campo
--    al escribir el mensaje. La IA siempre tiene el contexto completo.
--    cache_breakpoint marca dónde Anthropic puede cortar la caché para
--    optimizar coste (la parte por debajo del breakpoint es estable).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id                  CHAR(36) NOT NULL,
  thread_id           CHAR(36) NOT NULL,
  role                ENUM('user', 'assistant', 'system') NOT NULL,
  content             MEDIUMTEXT NOT NULL,
  anchor_kind         VARCHAR(50) DEFAULT NULL,
  anchor_id           CHAR(36) DEFAULT NULL,
  anchor_label        VARCHAR(500) DEFAULT NULL,
  applied_to_master   TINYINT(1) NOT NULL DEFAULT 0,
  master_chapter_id   CHAR(36) DEFAULT NULL,
  llm_model           VARCHAR(100) DEFAULT NULL,
  llm_input_tokens    INT DEFAULT NULL,
  llm_output_tokens   INT DEFAULT NULL,
  llm_cached_tokens   INT DEFAULT NULL,
  cache_breakpoint    TINYINT(1) NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_thread (thread_id, created_at),
  KEY idx_anchor (anchor_kind, anchor_id),
  KEY idx_master_chapter (master_chapter_id),
  CONSTRAINT fk_chat_msg_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. call_form_templates
--    Por cada convocatoria, la plantilla del formulario oficial: tamaño
--    máximo, idioma, estructura. Una convocatoria puede tener varias
--    plantillas (proyectos <€60k vs ≥€60k, distintos formularios).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_form_templates (
  id              CHAR(36) NOT NULL,
  call_id         CHAR(36) NOT NULL,
  template_code   VARCHAR(100) NOT NULL,
  template_name   VARCHAR(255) NOT NULL,
  budget_threshold_eur DECIMAL(12,2) DEFAULT NULL,
  budget_op       ENUM('lt', 'gte', 'any') NOT NULL DEFAULT 'any',
  max_pages       INT DEFAULT NULL,
  language        VARCHAR(10) NOT NULL DEFAULT 'en',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_call (call_id),
  KEY idx_call_code (call_id, template_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. call_form_questions
--    Las preguntas/secciones del formulario, con sus límites de caracteres
--    o palabras y reglas de estilo si las tiene.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_form_questions (
  id                  CHAR(36) NOT NULL,
  form_template_id    CHAR(36) NOT NULL,
  question_code       VARCHAR(100) NOT NULL,
  section_code        VARCHAR(100) DEFAULT NULL,
  question_text       TEXT NOT NULL,
  hint                TEXT,
  max_chars           INT DEFAULT NULL,
  max_words           INT DEFAULT NULL,
  max_pages           INT DEFAULT NULL,
  sort_order          INT NOT NULL DEFAULT 0,
  is_required         TINYINT(1) NOT NULL DEFAULT 1,
  question_kind       ENUM('narrative', 'list', 'table', 'numeric') NOT NULL DEFAULT 'narrative',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_template (form_template_id, sort_order),
  KEY idx_template_code (form_template_id, question_code),
  CONSTRAINT fk_form_question_template FOREIGN KEY (form_template_id) REFERENCES call_form_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. master_to_form_mapping
--    El mapping declarativo: por cada pregunta del formulario, qué capítulos
--    del Maestro la nutren y qué reglas adicionales aplica la compresión.
--    Un mismo capítulo puede mapear a múltiples preguntas (ej. el capítulo
--    "Reto SUSTRAI" puede aparecer en sección Quality y en sección Impact).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_to_form_mapping (
  id                  CHAR(36) NOT NULL,
  form_template_id    CHAR(36) NOT NULL,
  question_code       VARCHAR(100) NOT NULL,
  chapter_key         VARCHAR(100) NOT NULL,
  weight              DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  rules               TEXT,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_template_question (form_template_id, question_code),
  KEY idx_template_chapter (form_template_id, chapter_key),
  CONSTRAINT fk_mapping_template FOREIGN KEY (form_template_id) REFERENCES call_form_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. call_documents
--    Documentos oficiales de cada convocatoria parseados, sin vectorizar
--    (la fase Perfeccionar es CAG, no RAG — ver arquitectura §5).
--    body_text contiene el texto extraído del PDF/DOCX, listo para
--    cargar al contexto del LLM.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_documents (
  id              CHAR(36) NOT NULL,
  call_id         CHAR(36) NOT NULL,
  doc_kind        ENUM('call_pdf', 'programme_guide', 'annotated_grant', 'eval_criteria', 'reference', 'annex') NOT NULL,
  title           VARCHAR(500) NOT NULL,
  source_filename VARCHAR(500) DEFAULT NULL,
  source_url      VARCHAR(1000) DEFAULT NULL,
  language        VARCHAR(10) NOT NULL DEFAULT 'en',
  body_text       LONGTEXT,
  page_count      INT DEFAULT NULL,
  char_count      INT NOT NULL DEFAULT 0,
  token_count_est INT NOT NULL DEFAULT 0,
  is_core         TINYINT(1) NOT NULL DEFAULT 1,
  uploaded_by_user_id CHAR(36) DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_call (call_id, doc_kind, is_core),
  KEY idx_call_kind (call_id, doc_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. master_diagnoses
--     Cada ejecución de Diagnóstico (inicial o avanzado) guarda sus items.
--     classification permite filtrar narrativos (resolubles en Perfeccionar)
--     vs económicos (redirigen a Diseñar/Calculator).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_diagnoses (
  id              CHAR(36) NOT NULL,
  master_doc_id   CHAR(36) NOT NULL,
  project_id      CHAR(36) NOT NULL,
  diagnosis_kind  ENUM('initial', 'advanced', 'score_estimate') NOT NULL,
  llm_model       VARCHAR(100) DEFAULT NULL,
  llm_input_tokens INT DEFAULT NULL,
  llm_output_tokens INT DEFAULT NULL,
  summary         TEXT,
  status          ENUM('running', 'ready', 'failed') NOT NULL DEFAULT 'running',
  score_value     DECIMAL(5,2) DEFAULT NULL,
  score_breakdown JSON DEFAULT NULL,
  started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_master_doc_kind (master_doc_id, diagnosis_kind),
  KEY idx_project (project_id),
  CONSTRAINT fk_diagnosis_master FOREIGN KEY (master_doc_id) REFERENCES master_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_diagnosis_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. master_diagnosis_items
--     Cada item accionable del diagnóstico, con su tipo (narrativo/económico),
--     severidad, capítulo del Maestro al que apunta y sugerencia concreta.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_diagnosis_items (
  id              CHAR(36) NOT NULL,
  diagnosis_id    CHAR(36) NOT NULL,
  classification  ENUM('narrative', 'economic') NOT NULL,
  severity        ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'warning',
  title           VARCHAR(500) NOT NULL,
  detail          TEXT,
  suggestion      TEXT,
  anchor_kind     VARCHAR(50) DEFAULT NULL,
  anchor_id       CHAR(36) DEFAULT NULL,
  anchor_label    VARCHAR(500) DEFAULT NULL,
  state           ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  resolved_at     DATETIME DEFAULT NULL,
  resolved_by_user_id CHAR(36) DEFAULT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_diagnosis (diagnosis_id, classification, state),
  KEY idx_anchor (anchor_kind, anchor_id),
  CONSTRAINT fk_diag_item_diagnosis FOREIGN KEY (diagnosis_id) REFERENCES master_diagnoses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. project_documents: extender con doc_purpose (núcleo vs apoyo)
--     La tabla project_documents es la relación project↔documents. Le añadimos
--     doc_purpose para distinguir docs de núcleo CAG (siempre en contexto
--     completo) vs apoyo. El body_text real vive en la tabla documents.
--     Idempotente: solo añade si la columna no existe.
-- ─────────────────────────────────────────────────────────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_documents' AND COLUMN_NAME = 'doc_purpose'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE project_documents ADD COLUMN doc_purpose ENUM(''core'', ''support'') NOT NULL DEFAULT ''support'' AFTER source',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
