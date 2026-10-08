-- Academia nativa: cursos dentro de Studio (sustituyen al curso del campus Moodle).
-- Misma organización que las aulas de Proyecto Emociona: curso → módulo → lección;
-- en cada lección, vídeo + lectura por hojas + test. El test se abre con el vídeo
-- visto O la lectura terminada, y la lección queda completada al aprobarlo.
-- Prefijo academia_ para no chocar con el revisor interno /v1/academy (JSON).
-- Idempotente (safe to re-run on every deploy).

CREATE TABLE IF NOT EXISTS academia_courses (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  slug           VARCHAR(80)  NOT NULL,
  title          VARCHAR(200) NOT NULL,
  subtitle       VARCHAR(300) NULL,
  description    TEXT         NULL,
  level          VARCHAR(40)  NULL,
  lang           VARCHAR(5)   NOT NULL DEFAULT 'es',
  cover_url      VARCHAR(500) NULL,
  -- draft: solo admin · published: catálogo · hidden: solo quien ya está matriculado
  status         ENUM('draft','published','hidden') NOT NULL DEFAULT 'draft',
  -- open: cualquiera con cuenta se matricula al entrar · enrolled: solo matrícula previa
  access         ENUM('open','enrolled') NOT NULL DEFAULT 'enrolled',
  passing_score  TINYINT UNSIGNED NOT NULL DEFAULT 80,
  hours          INT          NULL,
  sort           INT          NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acad_course_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academia_modules (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  course_id   CHAR(36)     NOT NULL,
  number      INT          NOT NULL,
  title       VARCHAR(200) NOT NULL,
  UNIQUE KEY uq_acad_module (course_id, number),
  CONSTRAINT fk_acad_module_course FOREIGN KEY (course_id) REFERENCES academia_courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academia_lessons (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  course_id      CHAR(36)     NOT NULL,
  module_id      CHAR(36)     NOT NULL,
  code           VARCHAR(10)  NOT NULL,
  slug           VARCHAR(80)  NOT NULL,
  sort           INT          NOT NULL,
  title          VARCHAR(300) NOT NULL,
  idea           TEXT         NULL,
  goal           TEXT         NULL,
  why            TEXT         NULL,
  guide_ref      VARCHAR(300) NULL,
  verify_year    TEXT         NULL,
  video_url      VARCHAR(500) NULL,
  video_poster   VARCHAR(500) NULL,
  video_seconds  INT          NULL,
  pdf_url        VARCHAR(500) NULL,
  -- [{heading, paragraphs[]}]: una hoja por párrafo (zona de estudio)
  reading        JSON         NULL,
  UNIQUE KEY uq_acad_lesson (course_id, slug),
  INDEX idx_acad_lesson_sort (course_id, sort),
  CONSTRAINT fk_acad_lesson_course FOREIGN KEY (course_id) REFERENCES academia_courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_lesson_module FOREIGN KEY (module_id) REFERENCES academia_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada cambio de preguntas es una revisión nueva (huella SHA-256 del banco);
-- manda la última. Los intentos guardan su propia copia congelada.
CREATE TABLE IF NOT EXISTS academia_controls (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  lesson_id      CHAR(36)     NOT NULL,
  revision       CHAR(64)     NOT NULL,
  passing_score  TINYINT UNSIGNED NOT NULL DEFAULT 80,
  questions      JSON         NOT NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_acad_control (lesson_id, revision),
  CONSTRAINT fk_acad_control_lesson FOREIGN KEY (lesson_id) REFERENCES academia_lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academia_enrollments (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  user_id     CHAR(36)     NOT NULL,
  course_id   CHAR(36)     NOT NULL,
  source      ENUM('open','manual','purchase') NOT NULL DEFAULT 'manual',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acad_enrol (user_id, course_id),
  CONSTRAINT fk_acad_enrol_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_enrol_course FOREIGN KEY (course_id) REFERENCES academia_courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro del progreso. Solo se AÑADEN filas: el código no tiene ningún
-- UPDATE ni DELETE sobre esta tabla (en Emociona lo impide un trigger; aquí
-- no, porque con binlog activo crear triggers exige SUPER en producción).
-- request_key hace que repetir un envío no duplique nada.
CREATE TABLE IF NOT EXISTS academia_events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL,
  course_id    CHAR(36)     NOT NULL,
  lesson_id    CHAR(36)     NULL,
  kind         VARCHAR(40)  NOT NULL,
  data         JSON         NULL,
  request_key  VARCHAR(120) NOT NULL,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_acad_event (user_id, course_id, request_key),
  INDEX idx_acad_event_lesson (user_id, lesson_id, kind),
  CONSTRAINT fk_acad_event_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_event_course FOREIGN KEY (course_id) REFERENCES academia_courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academia_attempts (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  user_id       CHAR(36)     NOT NULL,
  lesson_id     CHAR(36)     NOT NULL,
  control_id    CHAR(36)     NOT NULL,
  -- preguntas con las opciones ya barajadas e índice correcto (copia congelada)
  definition    JSON         NOT NULL,
  answers       JSON         NULL,
  score         TINYINT UNSIGNED NULL,
  passed        TINYINT(1)   NULL,
  started_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at  DATETIME(3)  NULL,
  INDEX idx_acad_attempt (user_id, lesson_id),
  CONSTRAINT fk_acad_attempt_user    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_attempt_lesson  FOREIGN KEY (lesson_id)  REFERENCES academia_lessons(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_attempt_control FOREIGN KEY (control_id) REFERENCES academia_controls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notas privadas del alumno, una por lección. revision evita pisar cambios
-- hechos desde otra pestaña.
CREATE TABLE IF NOT EXISTS academia_notes (
  user_id     CHAR(36)     NOT NULL,
  lesson_id   CHAR(36)     NOT NULL,
  body        MEDIUMTEXT   NOT NULL,
  revision    INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, lesson_id),
  CONSTRAINT fk_acad_note_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_note_lesson FOREIGN KEY (lesson_id) REFERENCES academia_lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academia_certificates (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  serial      VARCHAR(24)  NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  course_id   CHAR(36)     NOT NULL,
  full_name   VARCHAR(200) NOT NULL,
  hours       INT          NULL,
  issued_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acad_cert_serial (serial),
  UNIQUE KEY uq_acad_cert_user (user_id, course_id),
  CONSTRAINT fk_acad_cert_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_cert_course FOREIGN KEY (course_id) REFERENCES academia_courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
