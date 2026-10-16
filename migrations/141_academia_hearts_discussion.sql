-- Academia v2 (como el aula de Proyecto Emociona): corazones por hoja de lectura
-- y dudas/comentarios por lección. Solo crea tablas nuevas; idempotente.

-- Corazón «me encanta esta hoja». slide_key = huella de apartado + texto (FNV-1a
-- de 64 bits en hex), así sobrevive a reimportar el curso si la hoja no cambia.
-- heading y excerpt guardan copia para el panel de admin aunque la hoja cambie.
CREATE TABLE IF NOT EXISTS academia_hearts (
  user_id     CHAR(36)     NOT NULL,
  lesson_id   CHAR(36)     NOT NULL,
  slide_key   CHAR(16)     NOT NULL,
  heading     VARCHAR(300) NULL,
  excerpt     VARCHAR(500) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, lesson_id, slide_key),
  INDEX idx_acad_heart_slide (lesson_id, slide_key),
  CONSTRAINT fk_acad_heart_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_heart_lesson FOREIGN KEY (lesson_id) REFERENCES academia_lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dudas y comentarios de una lección. Un hilo = mensaje sin parent_id; las
-- respuestas heredan audience, kind y visibility del hilo.
--   audience   community: lo ve todo el curso · tutor: va al equipo docente
--   visibility private: solo autor + equipo docente · shared: visible en el curso
-- «Retirar» no borra: pone withdrawn_at y el texto se conserva como prueba.
-- El admin puede ocultar (status hidden), marcar resuelto o borrar.
CREATE TABLE IF NOT EXISTS academia_comments (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  course_id     CHAR(36)     NOT NULL,
  lesson_id     CHAR(36)     NOT NULL,
  user_id       CHAR(36)     NULL,
  parent_id     CHAR(36)     NULL,
  audience      ENUM('community','tutor')   NOT NULL DEFAULT 'community',
  kind          ENUM('question','comment')  NOT NULL DEFAULT 'question',
  visibility    ENUM('private','shared')    NOT NULL DEFAULT 'shared',
  body          TEXT         NOT NULL,
  status        ENUM('visible','hidden')    NOT NULL DEFAULT 'visible',
  withdrawn_at  DATETIME     NULL,
  resolved_at   DATETIME     NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_acad_comment_lesson (lesson_id, parent_id, created_at),
  INDEX idx_acad_comment_course (course_id, created_at),
  CONSTRAINT fk_acad_comment_course FOREIGN KEY (course_id) REFERENCES academia_courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_comment_lesson FOREIGN KEY (lesson_id) REFERENCES academia_lessons(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_comment_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_acad_comment_parent FOREIGN KEY (parent_id) REFERENCES academia_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academia_comment_likes (
  comment_id  CHAR(36)  NOT NULL,
  user_id     CHAR(36)  NOT NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, user_id),
  CONSTRAINT fk_acad_like_comment FOREIGN KEY (comment_id) REFERENCES academia_comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_like_user    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
