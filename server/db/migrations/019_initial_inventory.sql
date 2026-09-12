-- Почетна залиха (попис од 12.09.2026) - се извршува САМО ЕДНАШ
-- ФСК: 40.96 кг вкупно, РБГ: 29.815 кг вкупно
-- Од ова се одзема веќе внесеното производство за да не се дуплира

CREATE TABLE IF NOT EXISTS _migration_flags (
  flag_name TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = '019_initial_inventory') THEN
    INSERT INTO _migration_flags (flag_name) VALUES ('019_initial_inventory');

    -- ФСК: попис 40.96 кг минус веќе завршено производство
    UPDATE product_inventory SET quantity_kg = GREATEST(0, 40.96 - COALESCE(
      (SELECT SUM(pi.quantity_kg) FROM production_items pi
       JOIN production_batches pb ON pb.id = pi.batch_id
       WHERE pi.product_type_id = product_inventory.product_type_id
       AND pb.status = 'завршено'), 0
    )), updated_at = NOW()
    WHERE product_type_id = (SELECT id FROM product_types WHERE code = 'ФСК');

    -- РБГ: попис 29.815 кг минус веќе завршено производство
    UPDATE product_inventory SET quantity_kg = GREATEST(0, 29.815 - COALESCE(
      (SELECT SUM(pi.quantity_kg) FROM production_items pi
       JOIN production_batches pb ON pb.id = pi.batch_id
       WHERE pi.product_type_id = product_inventory.product_type_id
       AND pb.status = 'завршено'), 0
    )), updated_at = NOW()
    WHERE product_type_id = (SELECT id FROM product_types WHERE code = 'РБГ');

    -- Сите останати типови: 0 (ако веќе не се поставени)
    UPDATE product_inventory SET quantity_kg = 0, updated_at = NOW()
    WHERE product_type_id IN (
      SELECT id FROM product_types WHERE code NOT IN ('ФСК', 'РБГ')
    ) AND quantity_kg != 0
    AND product_type_id NOT IN (
      SELECT DISTINCT pi.product_type_id FROM production_items pi
      JOIN production_batches pb ON pb.id = pi.batch_id
      WHERE pb.status = 'завршено'
    );
  END IF;
END $$;
