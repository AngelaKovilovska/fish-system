-- 011: Allow multiple food types per pool per meal
-- Drop the UNIQUE constraint on (date, pool_number, meal_type) so we can
-- store one row per food-type entry within a single pool+meal combination.
-- The application layer handles delete-then-reinsert, so no upsert relies on this.

-- Try the standard auto-generated name first
ALTER TABLE pool_meals DROP CONSTRAINT IF EXISTS pool_meals_date_pool_number_meal_type_key;

-- Dynamically find and drop ANY remaining unique constraint on (date, pool_number, meal_type)
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  FOR constraint_rec IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'pool_meals'
      AND tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public'
    GROUP BY tc.constraint_name
    HAVING array_agg(kcu.column_name ORDER BY kcu.ordinal_position) @> ARRAY['date', 'pool_number', 'meal_type']
  LOOP
    EXECUTE format('ALTER TABLE pool_meals DROP CONSTRAINT %I', constraint_rec.constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_rec.constraint_name;
  END LOOP;
END $$;
