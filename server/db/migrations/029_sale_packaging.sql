-- 029: Начин на пакување на продажбата (за комерцијалниот документ): Кеси / Кутија / Вакуум
ALTER TABLE sales ADD COLUMN IF NOT EXISTS packaging VARCHAR(30) NOT NULL DEFAULT 'Кеси';
