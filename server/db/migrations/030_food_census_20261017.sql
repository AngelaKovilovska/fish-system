-- ══════════════════════════════════════════════════
-- 030: Нов тип храна „SpecialPro EF (4.5mm)“ + попис на храна од 17.10.2026
-- ══════════════════════════════════════════════════
-- Попис (старо + ново = вкупно) на 17.10.2026:
--   Advance (1.5mm)          20 kg
--   Pregrower-15 (2mm)      840 kg
--   SpecialPro EF (3mm)    1005 kg
--   SpecialPro EF (4.5mm)  2400 kg
-- Залихата на тој датум се поставува точно на овие вредности (корекција = попис − состојба на 17.10.2026);
-- потрошувачката по 17.10.2026 се одзема нормално. Се извршува само еднаш (flag).

INSERT INTO food_inventory (food_type, quantity_kg) VALUES ('SpecialPro EF (4.5mm)', 0)
ON CONFLICT (food_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS _migration_flags (
  flag_name TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);

DO $$
DECLARE
  r RECORD;
  v_stock NUMERIC;
  v_diff NUMERIC;
  v_date DATE := DATE '2026-10-17';
BEGIN
  IF EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = '030_food_census_20261017') THEN
    RETURN;
  END IF;
  INSERT INTO _migration_flags (flag_name) VALUES ('030_food_census_20261017');

  FOR r IN SELECT * FROM (VALUES
      ('Advance (1.5mm)', 20.0),
      ('Pregrower-15 (2mm)', 840.0),
      ('SpecialPro EF (3mm)', 1005.0),
      ('SpecialPro EF (4.5mm)', 2400.0)
    ) AS t(food_type, census_kg)
  LOOP
    -- Состојба на денот на пописот: Σ набавки (до датумот) − потрошено (до датумот)
    SELECT COALESCE((SELECT SUM(change_kg) FROM food_inventory_log
                     WHERE reason = 'purchase' AND food_type = r.food_type AND purchased_at <= v_date), 0)
         - COALESCE((SELECT SUM(consumed_gr) / 1000.0 FROM (
              SELECT food_quantity_gr AS consumed_gr FROM pool_meals
              WHERE food_type = r.food_type AND food_quantity_gr > 0 AND date <= v_date
              UNION ALL
              SELECT pf.food_quantity_gr FROM pool_feeding pf JOIN daily_records dr ON pf.daily_record_id = dr.id
              WHERE pf.food_type = r.food_type AND pf.food_quantity_gr > 0 AND dr.date <= v_date
                AND NOT EXISTS (SELECT 1 FROM pool_meals pm WHERE pm.date = dr.date AND pm.pool_number = pf.pool_number)
            ) c), 0)
    INTO v_stock;

    v_diff := r.census_kg - v_stock;
    IF ABS(v_diff) >= 0.001 THEN
      INSERT INTO food_inventory_log (food_type, change_kg, reason, purchased_at, supplier, document_number, created_at)
      VALUES (r.food_type, v_diff, 'purchase', v_date, 'Попис', 'ПОПИС-20261017', NOW());
    END IF;
  END LOOP;

  -- Освежи ја збирната табела (информативно)
  UPDATE food_inventory fi SET quantity_kg = GREATEST(0, COALESCE(p.kg, 0)), updated_at = NOW()
  FROM (SELECT food_type, SUM(change_kg) AS kg FROM food_inventory_log WHERE reason = 'purchase' GROUP BY food_type) p
  WHERE p.food_type = fi.food_type;
END $$;
