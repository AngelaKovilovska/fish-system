-- ═══════════════════════════════════════════════════════════
-- Migration 021: Залиха по LOT (следливост по серија)
-- product_inventory останува како збир по производ и секогаш
-- се синхронизира од product_lots.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_lots (
  id SERIAL PRIMARY KEY,
  product_type_id INTEGER REFERENCES product_types(id) NOT NULL,
  lot_number VARCHAR(50) NOT NULL,
  batch_id INTEGER REFERENCES production_batches(id) ON DELETE SET NULL,
  production_date DATE,
  expiry_date DATE,
  initial_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  quantity_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (product_type_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots(product_type_id, production_date);

CREATE TABLE IF NOT EXISTS _migration_flags (
  flag_name TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);

-- Еднократно полнење од постоечките податоци
DO $$
DECLARE
  r RECORD;
  v_diff NUMERIC;
  v_lot RECORD;
  v_take NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = '021_product_lots') THEN
    RETURN;
  END IF;
  INSERT INTO _migration_flags (flag_name) VALUES ('021_product_lots');

  -- 1. Завршени серии → LOT редови
  INSERT INTO product_lots (product_type_id, lot_number, batch_id, production_date, expiry_date, initial_kg, quantity_kg)
  SELECT pi.product_type_id, pb.lot_number, pb.id, pb.production_date,
         pb.production_date + INTERVAL '6 months', pi.quantity_kg, pi.quantity_kg
  FROM production_items pi
  JOIN production_batches pb ON pb.id = pi.batch_id
  WHERE pb.status = 'завршено' AND pi.quantity_kg > 0
  ON CONFLICT (product_type_id, lot_number) DO UPDATE
    SET initial_kg = product_lots.initial_kg + EXCLUDED.initial_kg,
        quantity_kg = product_lots.quantity_kg + EXCLUDED.quantity_kg;

  -- 2. Веќе продадено од тие LOT-ови
  UPDATE product_lots pl
  SET quantity_kg = GREATEST(0, pl.quantity_kg - s.sold)
  FROM (
    SELECT si.product_type_id, si.lot_number, SUM(si.quantity_kg) AS sold
    FROM sale_items si
    WHERE si.lot_number IS NOT NULL
    GROUP BY si.product_type_id, si.lot_number
  ) s
  WHERE s.product_type_id = pl.product_type_id AND s.lot_number = pl.lot_number;

  -- 3. Усогласување со тековната збирна залиха (попис)
  FOR r IN
    SELECT pt.id AS product_type_id,
           COALESCE(inv.quantity_kg, 0) AS inv_qty,
           COALESCE((SELECT SUM(quantity_kg) FROM product_lots WHERE product_type_id = pt.id), 0) AS lot_qty
    FROM product_types pt
    LEFT JOIN product_inventory inv ON inv.product_type_id = pt.id
  LOOP
    v_diff := r.inv_qty - r.lot_qty;

    IF v_diff > 0.005 THEN
      -- вишок → LOT од попис
      INSERT INTO product_lots (product_type_id, lot_number, production_date, expiry_date, initial_kg, quantity_kg)
      VALUES (r.product_type_id, 'ПОПИС-260912', DATE '2026-09-12', DATE '2026-09-12' + INTERVAL '6 months', v_diff, v_diff)
      ON CONFLICT (product_type_id, lot_number) DO UPDATE
        SET initial_kg = product_lots.initial_kg + EXCLUDED.initial_kg,
            quantity_kg = product_lots.quantity_kg + EXCLUDED.quantity_kg;

    ELSIF v_diff < -0.005 THEN
      -- кусок → одземи FIFO од најстарите LOT-ови
      v_diff := -v_diff;
      FOR v_lot IN
        SELECT id, quantity_kg FROM product_lots
        WHERE product_type_id = r.product_type_id AND quantity_kg > 0
        ORDER BY production_date NULLS LAST, id
      LOOP
        EXIT WHEN v_diff <= 0;
        v_take := LEAST(v_lot.quantity_kg, v_diff);
        UPDATE product_lots SET quantity_kg = quantity_kg - v_take WHERE id = v_lot.id;
        v_diff := v_diff - v_take;
      END LOOP;
    END IF;
  END LOOP;

  -- 4. Збирната залиха = сума на LOT-ови
  INSERT INTO product_inventory (product_type_id, quantity_kg, updated_at)
  SELECT pt.id, COALESCE((SELECT SUM(quantity_kg) FROM product_lots WHERE product_type_id = pt.id), 0), NOW()
  FROM product_types pt
  ON CONFLICT (product_type_id) DO UPDATE
    SET quantity_kg = EXCLUDED.quantity_kg, updated_at = NOW();
END $$;
