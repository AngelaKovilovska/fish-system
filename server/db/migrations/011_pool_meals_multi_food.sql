-- 011: Allow multiple food types per pool per meal
-- Drop the UNIQUE constraint on (date, pool_number, meal_type) so we can
-- store one row per food-type entry within a single pool+meal combination.
-- The application layer handles delete-then-reinsert, so no upsert relies on this.

ALTER TABLE pool_meals DROP CONSTRAINT IF EXISTS pool_meals_date_pool_number_meal_type_key;
