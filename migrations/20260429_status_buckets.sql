-- 20260429_status_buckets.sql
-- Reetiquetado completo de validity_label + status_bucket + is_certified + can_apply
-- en la tabla `entities` (MySQL eplus_tools).
--
-- Códigos verificados contra webgate.ec.europa.eu (Permacultura el 2026-04-29):
--   42284356 -> na_certified           (NA Certified — único validado real)
--   42284353 -> waiting_na_certification (Waiting for NA Certification)
--   42284359 -> waiting_confirmation   (Declared / Waiting for Confirmation)
--   42284365 -> registered             (Registered, ~317 casos)
--   42284362 -> invalidated            (Invalidated — no operativa)

ALTER TABLE entities
  ADD COLUMN status_bucket VARCHAR(16) NULL AFTER validity_label,
  ADD COLUMN is_certified TINYINT(1) NOT NULL DEFAULT 0 AFTER status_bucket,
  ADD COLUMN can_apply TINYINT(1) NOT NULL DEFAULT 0 AFTER is_certified,
  ADD INDEX idx_status_bucket (status_bucket),
  ADD INDEX idx_is_certified (is_certified),
  ADD INDEX idx_can_apply (can_apply);

-- Reetiquetado masivo basado en validity_type
UPDATE entities SET
  validity_label = 'na_certified',
  status_bucket = 'certified',
  is_certified = 1,
  can_apply = 1
WHERE validity_type = '42284356';

UPDATE entities SET
  validity_label = 'waiting_na_certification',
  status_bucket = 'in_review',
  is_certified = 0,
  can_apply = 1
WHERE validity_type = '42284353';

UPDATE entities SET
  validity_label = 'waiting_confirmation',
  status_bucket = 'declared',
  is_certified = 0,
  can_apply = 1
WHERE validity_type = '42284359';

UPDATE entities SET
  validity_label = 'registered',
  status_bucket = 'declared',
  is_certified = 0,
  can_apply = 1
WHERE validity_type = '42284365';

UPDATE entities SET
  validity_label = 'invalidated',
  status_bucket = 'invalid',
  is_certified = 0,
  can_apply = 0
WHERE validity_type = '42284362';

-- Quedan en NULL las que no tengan validity_type (raras). Se dejan así.
