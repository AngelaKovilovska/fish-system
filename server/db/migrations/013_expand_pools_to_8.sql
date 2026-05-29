-- Expand from 6 pools to 8 pools

-- 1. pool_feeding (from 001_initial.sql)
ALTER TABLE pool_feeding DROP CONSTRAINT IF EXISTS pool_feeding_pool_number_check;
ALTER TABLE pool_feeding ADD CONSTRAINT pool_feeding_pool_number_check CHECK (pool_number BETWEEN 1 AND 8);

-- 2. pool_measurements (from 002_pool_measurements.sql)
ALTER TABLE pool_measurements DROP CONSTRAINT IF EXISTS pool_measurements_pool_number_check;
ALTER TABLE pool_measurements ADD CONSTRAINT pool_measurements_pool_number_check CHECK (pool_number BETWEEN 1 AND 8);

-- 3. pool_meals (from 006_pool_meals.sql)
ALTER TABLE pool_meals DROP CONSTRAINT IF EXISTS pool_meals_pool_number_check;
ALTER TABLE pool_meals ADD CONSTRAINT pool_meals_pool_number_check CHECK (pool_number BETWEEN 1 AND 8);

-- 4. pool_fish_inventory (from 008_pool_fish_inventory.sql)
ALTER TABLE pool_fish_inventory DROP CONSTRAINT IF EXISTS pool_fish_inventory_pool_number_check;
ALTER TABLE pool_fish_inventory ADD CONSTRAINT pool_fish_inventory_pool_number_check CHECK (pool_number BETWEEN 1 AND 8);

-- 5. Add pool 7 and 8 to fish inventory
INSERT INTO pool_fish_inventory (pool_number, current_count)
VALUES (7, 0), (8, 0)
ON CONFLICT (pool_number) DO NOTHING;
