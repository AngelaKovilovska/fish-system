-- Коригирај залиха на производи (попис 12.09.2026)
-- Се извршува само еднаш

CREATE TABLE IF NOT EXISTS _migration_flags (
  flag_name TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migration_flags WHERE flag_name = '020_fix_inventory') THEN
    INSERT INTO _migration_flags (flag_name) VALUES ('020_fix_inventory');

    UPDATE product_inventory SET quantity_kg = 40.96, updated_at = NOW()
    WHERE product_type_id = (SELECT id FROM product_types WHERE code = 'ФСК');

    UPDATE product_inventory SET quantity_kg = 29.815, updated_at = NOW()
    WHERE product_type_id = (SELECT id FROM product_types WHERE code = 'РБГ');
  END IF;
END $$;
