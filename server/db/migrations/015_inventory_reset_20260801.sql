-- ══════════════════════════════════════════════════
-- 015: Ресетирање залихи по физички попис (01.08.2026)
-- ══════════════════════════════════════════════════
-- Стратегија: за секој тип храна, внесуваме нова "попис" набавка
-- каде change_kg = физички_попис + досега_потрошено.
-- Потоа ги бришеме старите набавки.
-- Резултат: залиха = (попис + потрошено) - потрошено = точно пописот.
-- ══════════════════════════════════════════════════

BEGIN;

-- 1. Внеси нови "попис" записи за секој тип храна
--    change_kg = физички попис + вкупно потрошено од оброци
INSERT INTO food_inventory_log (food_type, change_kg, reason, purchased_at, supplier, document_number, created_by, created_at)
SELECT
  census.food_type,
  census.physical_kg + COALESCE(consumed.total_kg, 0),
  'purchase',
  '2026-08-01',
  'Попис',
  'ПОПИС-20260801',
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
  NOW()
FROM (
  VALUES
    ('Pregrower-15 (2mm)',   540.0),
    ('Grower-13EF (3mm)',     75.0),
    ('SpecialPro EF (3mm)',  120.0),
    ('Grower-13EF (4.5mm)',  810.0),
    ('Grower-13EF (6mm)',   1935.0),
    ('Advance (1.5mm)',        0.0)
) AS census(food_type, physical_kg)
LEFT JOIN (
  -- Вкупна потрошувачка од pool_meals
  SELECT food_type, SUM(food_quantity_gr) / 1000.0 AS total_kg
  FROM pool_meals
  WHERE food_type IS NOT NULL AND food_type != '' AND food_quantity_gr > 0
  GROUP BY food_type

  UNION ALL

  -- Вкупна потрошувачка од pool_feeding (legacy, без дупликати)
  SELECT pf.food_type, SUM(pf.food_quantity_gr) / 1000.0 AS total_kg
  FROM pool_feeding pf
  JOIN daily_records dr ON pf.daily_record_id = dr.id
  WHERE pf.food_type IS NOT NULL AND pf.food_type != '' AND pf.food_quantity_gr > 0
  AND NOT EXISTS (
    SELECT 1 FROM pool_meals pm
    WHERE pm.date = dr.date AND pm.pool_number = pf.pool_number
  )
  GROUP BY pf.food_type
) consumed ON consumed.food_type = census.food_type;

-- 2. Избриши ги сите СТАРИ набавки (пред пописот)
DELETE FROM food_inventory_log
WHERE document_number IS DISTINCT FROM 'ПОПИС-20260801'
  AND reason = 'purchase';

-- 3. Ажурирај ја food_inventory табелата со точни количини
UPDATE food_inventory SET quantity_kg = 540.0,  updated_at = NOW() WHERE food_type = 'Pregrower-15 (2mm)';
UPDATE food_inventory SET quantity_kg = 75.0,   updated_at = NOW() WHERE food_type = 'Grower-13EF (3mm)';
UPDATE food_inventory SET quantity_kg = 120.0,  updated_at = NOW() WHERE food_type = 'SpecialPro EF (3mm)';
UPDATE food_inventory SET quantity_kg = 810.0,  updated_at = NOW() WHERE food_type = 'Grower-13EF (4.5mm)';
UPDATE food_inventory SET quantity_kg = 1935.0, updated_at = NOW() WHERE food_type = 'Grower-13EF (6mm)';
UPDATE food_inventory SET quantity_kg = 0.0,    updated_at = NOW() WHERE food_type = 'Advance (1.5mm)';

COMMIT;
