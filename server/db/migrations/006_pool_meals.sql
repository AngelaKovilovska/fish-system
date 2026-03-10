-- 006: Create pool_meals table for per-meal feeding data (breakfast, lunch, dinner)
CREATE TABLE IF NOT EXISTS pool_meals (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  pool_number INTEGER NOT NULL CHECK (pool_number BETWEEN 1 AND 6),
  meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  food_type VARCHAR(255),
  food_quantity_gr DECIMAL DEFAULT 0,
  fed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (date, pool_number, meal_type)
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_pool_meals_date ON pool_meals(date);
