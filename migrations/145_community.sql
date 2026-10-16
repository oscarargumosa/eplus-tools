-- Comunidad de EU Funding Studio (v1, oct-2026). Ver docs/COMUNIDAD.md.
-- Área beta 'comunidad' (node/src/utils/areas.js): solo quien la tiene, y los admin.
--
-- Privacidad (reglas duras, también en node/src/modules/community/model.js):
--   · El perfil es voluntario e invisible por defecto (visible = 0).
--   · Nunca se guardan ni se publican emails ni teléfonos aquí.
--   · Ocultar el perfil o la ubicación BORRA lat/lng (no solo las esconde).
--   · Precisión 'approx' guarda las coordenadas ya redondeadas a 2 decimales.
--   · La audiencia de la ubicación se aplica en el servidor antes de enviarla.
--
-- ON DELETE CASCADE en user_id en todas las tablas: si se borra la cuenta,
-- se va con ella todo lo que la persona puso en la comunidad.
-- Solo cambios aditivos. Idempotente.

CREATE TABLE IF NOT EXISTS community_profiles (
  user_id             CHAR(36)     NOT NULL PRIMARY KEY,
  visible             TINYINT(1)   NOT NULL DEFAULT 0,
  headline            VARCHAR(120) NULL,          -- cargo
  bio                 VARCHAR(700) NULL,          -- presentación breve
  sectors             VARCHAR(255) NULL,          -- claves separadas por comas (constants.SECTORS)
  actions             VARCHAR(255) NULL,          -- claves (constants.ACTIONS)
  languages           VARCHAR(255) NULL,          -- claves (constants.LANGUAGES)
  seeks_partners      TINYINT(1)   NOT NULL DEFAULT 0,
  offers_partner      TINYINT(1)   NOT NULL DEFAULT 0,
  organization_id     CHAR(36)     NULL,          -- una de sus entidades de «Mi entidad» (sin FK: se valida al guardar)
  country             CHAR(2)      NULL,          -- ISO 3166-1 alfa-2
  location_label      VARCHAR(120) NULL,          -- ciudad o zona que la persona escribe
  lat                 DECIMAL(9,6) NULL,
  lng                 DECIMAL(9,6) NULL,
  location_source     ENUM('manual','organization') NULL,
  location_precision  ENUM('approx','exact') NOT NULL DEFAULT 'approx',
  location_audience   ENUM('members','connections','hidden') NOT NULL DEFAULT 'members',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cprof_visible (visible, country),
  CONSTRAINT fk_cprof_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conexiones: una fila por pareja (user_lo < user_hi), la pida quien la pida.
-- status 'declined': la destinataria la rechazó; quien la pidió sigue viendo
-- «Solicitud enviada» y no puede insistir. Al eliminar la conexión se borra la
-- fila y, por CASCADE, todos sus mensajes.
CREATE TABLE IF NOT EXISTS community_connections (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requester_id  CHAR(36)        NOT NULL,
  addressee_id  CHAR(36)        NOT NULL,
  user_lo       CHAR(36)        NOT NULL,
  user_hi       CHAR(36)        NOT NULL,
  status        ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  message       VARCHAR(300)    NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at  DATETIME        NULL,
  UNIQUE KEY uq_cconn_pair (user_lo, user_hi),
  INDEX idx_cconn_addressee (addressee_id, status),
  INDEX idx_cconn_requester (requester_id, status),
  CONSTRAINT fk_cconn_req  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cconn_addr FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mensajes privados: solo dentro de una conexión aceptada (lo comprueba el servidor).
CREATE TABLE IF NOT EXISTS community_messages (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id  BIGINT UNSIGNED NOT NULL,
  sender_id      CHAR(36)        NOT NULL,
  body           TEXT            NOT NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at        DATETIME        NULL,
  INDEX idx_cmsg_conn (connection_id, id),
  CONSTRAINT fk_cmsg_conn   FOREIGN KEY (connection_id) REFERENCES community_connections(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmsg_sender FOREIGN KEY (sender_id)     REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Grupos: los crea el equipo (admin). Adhesión explícita.
CREATE TABLE IF NOT EXISTS community_groups (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120)    NOT NULL,
  description  VARCHAR(600)    NULL,
  archived     TINYINT(1)      NOT NULL DEFAULT 0,
  created_by   CHAR(36)        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_group_members (
  group_id   BIGINT UNSIGNED NOT NULL,
  user_id    CHAR(36)        NOT NULL,
  joined_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  INDEX idx_cgm_user (user_id),
  CONSTRAINT fk_cgm_group FOREIGN KEY (group_id) REFERENCES community_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_cgm_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Aportaciones: conversaciones generales (group_id NULL, con tema) o de un
-- grupo (group_id, sin tema). Las respuestas llevan parent_id (un nivel).
-- hidden: retirada por su autor o por el equipo (hidden_by dice quién).
CREATE TABLE IF NOT EXISTS community_posts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id        CHAR(36)        NOT NULL,
  group_id       BIGINT UNSIGNED NULL,
  parent_id      BIGINT UNSIGNED NULL,
  topic          VARCHAR(20)     NULL,
  title          VARCHAR(160)    NULL,
  body           TEXT            NOT NULL,
  link_url       VARCHAR(500)    NULL,
  hidden         TINYINT(1)      NOT NULL DEFAULT 0,
  hidden_by      ENUM('author','team') NULL,
  hidden_reason  VARCHAR(300)    NULL,
  hidden_at      DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cpost_feed (group_id, parent_id, hidden, created_at),
  INDEX idx_cpost_parent (parent_id),
  INDEX idx_cpost_user (user_id),
  CONSTRAINT fk_cpost_user   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cpost_group  FOREIGN KEY (group_id)  REFERENCES community_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_cpost_parent FOREIGN KEY (parent_id) REFERENCES community_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Corazón: uno por persona y aportación (PK); nunca a una aportación propia.
CREATE TABLE IF NOT EXISTS community_hearts (
  post_id     BIGINT UNSIGNED NOT NULL,
  user_id     CHAR(36)        NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_cheart_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cheart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Denuncias: privadas, solo las ve el equipo. Una por persona y aportación.
CREATE TABLE IF NOT EXISTS community_reports (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id      BIGINT UNSIGNED NOT NULL,
  reporter_id  CHAR(36)        NOT NULL,
  reason       VARCHAR(500)    NULL,
  status       ENUM('open','hidden','dismissed') NOT NULL DEFAULT 'open',
  resolved_by  CHAR(36)        NULL,
  resolved_at  DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_creport (post_id, reporter_id),
  INDEX idx_creport_status (status, created_at),
  CONSTRAINT fk_creport_post FOREIGN KEY (post_id)     REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_creport_user FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
