-- Food inventory tracking
CREATE TABLE IF NOT EXISTS food_inventory (
  id SERIAL PRIMARY KEY,
  food_type VARCHAR(255) NOT NULL UNIQUE,
  quantity_kg DECIMAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS food_inventory_log (
  id SERIAL PRIMARY KEY,
  food_type VARCHAR(255) NOT NULL,
  change_kg DECIMAL NOT NULL,
  reason VARCHAR(50) NOT NULL,
  reference_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed with all food types at 0 kg
INSERT INTO food_inventory (food_type, quantity_kg)
VALUES
  ('Advance (1.5mm)', 0),
  ('Pregrower-15 (2mm)', 0),
  ('Grower (3mm)', 0),
  ('Grower-13EF (4.5mm)', 0),
  ('Grower-13EF (6mm)', 0),
  ('SpecialPro EF (3mm)', 0)
ON CONFLICT (food_type) DO NOTHING;
