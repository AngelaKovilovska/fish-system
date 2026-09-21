-- 028: Купувач може да биде физичко лице (стандардно: фирма)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS is_individual BOOLEAN NOT NULL DEFAULT false;
