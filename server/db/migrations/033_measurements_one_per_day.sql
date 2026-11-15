-- 033: Мерења (сортирање) — едно мерење по базен по датум + час на внес.
--  * created_at: кога е внесено мерењето (за серии внесени истиот ден пред мерењето да не се одземаат двапати)
--  * чистење дупликати: за ист базен и ист датум останува еден запис — оној со бројки (не 0/0), па последно внесениот
--  * уникатен индекс за да не може повторно да настанат дупликати
ALTER TABLE pool_measurements ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;
UPDATE pool_measurements SET created_at = measured_at WHERE created_at IS NULL;
ALTER TABLE pool_measurements ALTER COLUMN created_at SET DEFAULT NOW();

DELETE FROM pool_measurements pm
USING (
  SELECT id, ROW_NUMBER() OVER (
           PARTITION BY pool_number, measured_at::date
           ORDER BY (CASE WHEN fish_count > 0 AND avg_weight_gr > 0 THEN 0 ELSE 1 END), id DESC
         ) AS rn
  FROM pool_measurements
) d
WHERE pm.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pool_measurements_pool_day ON pool_measurements (pool_number, (measured_at::date));
