-- ══════════════════════════════════════════════════
-- 024: Поправка на залихата на храна по пописот од 01.08.2026
-- ══════════════════════════════════════════════════
-- Миграцијата 015 се извршуваше при секој рестарт и внесуваше по еден нов
-- „ПОПИС-20260801“ запис. Овде: се бришат сите такви записи и се внесува
-- точно еден по тип храна, со вредност = физички попис + потрошено ДО 31.07.2026.
-- Резултат: залиха = попис − потрошено од 01.08.2026 наваму.
-- Се извршува само еднаш (flag).

CREATE TABLE IF NOT EXISTS _migration_flags (
  flag_name TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = '024_fix_food_inventory_census') THEN
    RETURN;
  END IF;
  INSERT INTO _migration_flags (flag_name) VALUES ('024_fix_food_inventory_census');

  -- 1. Избриши ги сите дупликат пописи
  DELETE FROM food_inventory_log WHERE document_number = 'ПОПИС-20260801';

  -- 2. Внеси точно еден попис по тип
  INSERT INTO food_inventory_log (food_type, change_kg, reason, purchased_at, supplier, document_number, created_by, created_at)
  SELECT
    census.food_type,
    census.physical_kg + COALESCE(consumed.total_kg, 0),
    'purchase',
    '2026-08-01',
    'Попис',
    'ПОПИС-20260801',
    (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1),
    '2026-08-01 00:00:00'
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
    SELECT food_type, SUM(kg) AS total_kg FROM (
      -- потрошено пред пописот (pool_meals)
      SELECT food_type, SUM(food_quantity_gr) / 1000.0 AS kg
      FROM pool_meals
      WHERE food_type IS NOT NULL AND food_type != '' AND food_quantity_gr > 0
        AND date < DATE '2026-08-01'
      GROUP BY food_type
      UNION ALL
      -- потрошено пред пописот (стари pool_feeding записи без дупликат)
      SELECT pf.food_type, SUM(pf.food_quantity_gr) / 1000.0 AS kg
      FROM pool_feeding pf
      JOIN daily_records dr ON pf.daily_record_id = dr.id
      WHERE pf.food_type IS NOT NULL AND pf.food_type != '' AND pf.food_quantity_gr > 0
        AND dr.date < DATE '2026-08-01'
        AND NOT EXISTS (
          SELECT 1 FROM pool_meals pm WHERE pm.date = dr.date AND pm.pool_number = pf.pool_number
        )
      GROUP BY pf.food_type
    ) x GROUP BY food_type
  ) consumed ON consumed.food_type = census.food_type;

  -- 3. Усогласи ја збирната табела (информативно; приказот се пресметува од дневникот)
  UPDATE food_inventory fi SET quantity_kg = GREATEST(0, sub.stock), updated_at = NOW()
  FROM (
    SELECT fi2.food_type,
      COALESCE((SELECT SUM(change_kg) FROM food_inventory_log l WHERE l.food_type = fi2.food_type AND l.reason = 'purchase'), 0)
      - COALESCE((SELECT SUM(food_quantity_gr) / 1000.0 FROM pool_meals pm WHERE pm.food_type = fi2.food_type AND pm.food_quantity_gr > 0), 0)
      AS stock
    FROM food_inventory fi2
  ) sub
  WHERE sub.food_type = fi.food_type;
END $$;
