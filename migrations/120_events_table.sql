-- Behavioral events — first-party analytics for lead qualification.
-- See docs/LEAD_QUALIFICATION_PLAN.md (TASK-009, Fase 1).
--
-- Raw event log. user_id is set when the visitor is logged in; device_id
-- (a localStorage UUID) is always set so we can stitch a guest's
-- pre-registration behavior to the user account at signup time.
-- The rollup table (user_engagement) comes in Fase 3.

CREATE TABLE IF NOT EXISTS events (
  id          CHAR(36)     NOT NULL,
  ts          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id     CHAR(36)     NULL,
  device_id   CHAR(36)     NULL,
  session_id  CHAR(36)     NULL,
  name        VARCHAR(48)  NOT NULL,   -- session_start | section_view | call_opened | ...
  route       VARCHAR(48)  NULL,       -- SPA route / section
  ref_id      VARCHAR(64)  NULL,       -- callId / oid / projectId
  programme   VARCHAR(96)  NULL,       -- programme of opened call (interest signal)
  seconds     INT          NULL,       -- active seconds (section_time events)
  props       JSON         NULL,       -- extra props
  ua          VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_events_user (user_id),
  KEY idx_events_device (device_id),
  KEY idx_events_name (name),
  KEY idx_events_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
