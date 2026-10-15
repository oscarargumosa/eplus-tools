-- Fase beta cerrada (oct-2026): áreas de Studio que el admin abre a cada
-- persona. Hoy: 'proyectos' y 'academia' (lista en node/src/utils/areas.js).
-- El rol 'admin' las tiene todas sin fila aquí.
--
-- ON DELETE CASCADE en user_id a propósito: si se borra la cuenta, su
-- permiso ya no sirve de nada. El rastro de quién concedió o quitó qué
-- vive en audit_log (area.grant / area.revoke), que no tiene FK y se
-- conserva. granted_by sin FK por lo mismo: el admin puede borrarse.
-- seen_at: cuándo vio la persona el aviso «Ya tienes acceso a …» (NULL =
-- aún no; se le enseña una sola vez). Idempotente.

CREATE TABLE IF NOT EXISTS user_areas (
  user_id     CHAR(36)    NOT NULL,
  area        VARCHAR(32) NOT NULL,
  granted_by  CHAR(36)    NULL,
  granted_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  seen_at     DATETIME    NULL,
  PRIMARY KEY (user_id, area),
  INDEX idx_user_areas_area (area),
  CONSTRAINT fk_user_areas_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
