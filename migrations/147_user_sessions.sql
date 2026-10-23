-- Sesiones en servidor (cerrar sesión de verdad, 23-oct-2026).
-- Una fila por inicio de sesión (familia de tokens de refresco). El refresh
-- JWT lleva sid (= id) y jti; en cada /v1/auth/refresh se rota: jti nuevo,
-- prev_jti = el anterior. Si llega un jti que ya no es el actual ni el
-- anterior recién rotado (margen de unos segundos por pestañas a la vez),
-- es una reutilización: se revoca la fila entera (revoked_reason = 'reuse').
-- legacy_hash: sha256 del refresh antiguo sin jti que se convirtió en esta
-- sesión (transición: cada uno se acepta UNA vez).
-- user_agent corto e IP truncada (/24 en IPv4, /48 en IPv6): solo para que
-- la persona reconozca sus sesiones. Las caducadas se borran solas
-- (limpieza perezosa en node/src/modules/auth/sessions.js). Idempotente.

CREATE TABLE IF NOT EXISTS user_sessions (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  user_id         CHAR(36)     NOT NULL,
  jti             CHAR(36)     NOT NULL,
  prev_jti        CHAR(36)     NULL,
  rotated_at      DATETIME     NULL,
  legacy_hash     CHAR(64)     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME     NOT NULL,
  revoked_at      DATETIME     NULL,
  revoked_reason  VARCHAR(20)  NULL,
  user_agent      VARCHAR(120) NULL,
  ip              VARCHAR(45)  NULL,
  INDEX idx_user_sessions_user (user_id, revoked_at),
  INDEX idx_user_sessions_expires (expires_at),
  UNIQUE KEY uq_user_sessions_legacy (legacy_hash),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
