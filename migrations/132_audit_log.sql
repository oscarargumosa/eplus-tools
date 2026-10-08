-- Registro de auditoría: quién hizo qué acción sensible (login, contraseñas,
-- borrados, exportaciones, acciones de admin, certificados).
-- Sin FK a users a propósito: si se borra el usuario, su rastro se conserva.
-- El email se guarda enmascarado (o***@dominio). Idempotente.

CREATE TABLE IF NOT EXISTS audit_log (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ts                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor_user_id       CHAR(36)        NULL,
  actor_email_masked  VARCHAR(255)    NULL,
  action              VARCHAR(64)     NOT NULL,
  target_type         VARCHAR(64)     NULL,
  target_id           VARCHAR(191)    NULL,
  ip                  VARCHAR(64)     NULL,
  user_agent          VARCHAR(255)    NULL,
  meta                JSON            NULL,
  INDEX idx_audit_ts (ts),
  INDEX idx_audit_action_ts (action, ts),
  INDEX idx_audit_actor_ts (actor_user_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
