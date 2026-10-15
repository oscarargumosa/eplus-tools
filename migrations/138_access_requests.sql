-- Solicitudes de acceso a un área beta (POST /v1/access-requests).
-- Una sola pendiente por persona y área: lo garantiza el índice único
-- sobre pending_flag, que vale 1 solo mientras status = 'pending' (los
-- NULL no chocan, así que el histórico aprobado/rechazado no estorba).
--
-- ON DELETE CASCADE en user_id: la solicitud (con su mensaje) es dato
-- personal y se va con la cuenta. Quién aprobó o rechazó queda en
-- audit_log (request.approve / request.reject). resolved_by sin FK.
-- Idempotente.

CREATE TABLE IF NOT EXISTS access_requests (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       CHAR(36)        NOT NULL,
  area          VARCHAR(32)     NOT NULL,
  message       VARCHAR(500)    NULL,
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME        NULL,
  resolved_by   CHAR(36)        NULL,
  pending_flag  TINYINT AS (IF(status = 'pending', 1, NULL)) STORED,
  UNIQUE KEY uq_access_req_pending (user_id, area, pending_flag),
  INDEX idx_access_req_status (status, created_at),
  CONSTRAINT fk_access_req_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
