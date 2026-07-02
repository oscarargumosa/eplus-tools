-- ═══════════════════════════════════════════════════════════════
-- Migration 108: activity_management_staff
-- ═══════════════════════════════════════════════════════════════
-- Replaces the flat-rate model of activity_management (rate_applicant
-- + rate_partner per month) with an IO-style per-worker breakdown:
-- each row = one assigned worker on the activity, with their profile,
-- days and a free-text task description.
--
-- Legacy table `activity_management` is preserved untouched for
-- historical projects; new persistence flows through this new table.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_management_staff (
  id              CHAR(36)      NOT NULL,
  activity_id     CHAR(36)      NOT NULL,
  partner_id      CHAR(36)      NOT NULL,
  days            INT           NOT NULL DEFAULT 0,
  worker_category VARCHAR(60)   DEFAULT NULL,
  tasks_text      TEXT          DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_ams_activity (activity_id),
  KEY idx_ams_partner  (partner_id),
  CONSTRAINT fk_ams_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_ams_partner  FOREIGN KEY (partner_id)  REFERENCES partners(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
