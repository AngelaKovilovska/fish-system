-- 031: Попис 17.10.2026 — типовите што ги нема на листот (Grower-13EF 3/4.5/6mm) имаат залиха 0 на тој датум.
-- Иста логика како 030: корекција = 0 − состојба на 17.10.2026; потрошено по тој датум се одзема нормално.
DO $$
DECLARE
  r RECORD;
  v_stock NUMERIC;
  v_diff NUMERIC;
  v_date DATE := DATE '2026-10-17';
BEGIN
  IF EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = '031_food_census_grower_zero') THEN
    RETURN;
  END IF;
  INSERT INTO _migration_flags (flag_name) VALUES ('031_food_census_grower_zero');

  FOR r IN SELECT * FROM (VALUES
      ('Grower-13EF (3mm)', 0.0),
      ('Grower-13EF (4.5mm)', 0.0),
      ('Grower-13EF (6mm)', 0.0)
    ) AS t(food_type, census_kg)
  LOOP
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

  UPDATE food_inventory fi SET quantity_kg = GREATEST(0, COALESCE(p.kg, 0)), updated_at = NOW()
  FROM (SELECT food_type, SUM(change_kg) AS kg FROM food_inventory_log WHERE reason = 'purchase' GROUP BY food_type) p
  WHERE p.food_type = fi.food_type;
END $$;
