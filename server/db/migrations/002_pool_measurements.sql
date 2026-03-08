-- Pool measurements (admin enters fish count and avg weight per pool)
CREATE TABLE IF NOT EXISTS pool_measurements (
  id SERIAL PRIMARY KEY,
  pool_number INTEGER NOT NULL CHECK (pool_number BETWEEN 1 AND 6),
  fish_count INTEGER NOT NULL DEFAULT 0,
  avg_weight_gr DECIMAL NOT NULL DEFAULT 0,
  measured_by INTEGER REFERENCES users(id),
  measured_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_measurements_pool_date ON pool_measurements (pool_number, measured_at DESC);
