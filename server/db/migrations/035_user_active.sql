-- 035: Корисник со внесови не може да се избрише (записите го носат неговото име) — наместо тоа се деактивира.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
