-- ══════════════════════════════════════════════════
-- 027: Количини во кг со три децимали (пр. 11.215 кг од вага)
-- ══════════════════════════════════════════════════
-- Идемпотентно: ALTER TYPE на ист тип е безопасен.

ALTER TABLE production_items  ALTER COLUMN quantity_kg TYPE DECIMAL(10,3);
ALTER TABLE product_inventory ALTER COLUMN quantity_kg TYPE DECIMAL(10,3);
ALTER TABLE sale_items        ALTER COLUMN quantity_kg TYPE DECIMAL(10,3);
ALTER TABLE product_lots      ALTER COLUMN initial_kg  TYPE DECIMAL(10,3);
ALTER TABLE product_lots      ALTER COLUMN quantity_kg TYPE DECIMAL(10,3);
