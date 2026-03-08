-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'worker')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Parameter norms (admin sets these)
CREATE TABLE IF NOT EXISTS parameter_norms (
  id SERIAL PRIMARY KEY,
  parameter_name VARCHAR(100) UNIQUE NOT NULL,
  min_value DECIMAL,
  max_value DECIMAL,
  unit VARCHAR(50),
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Daily records (main table)
CREATE TABLE IF NOT EXISTS daily_records (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  checked_by INTEGER REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Section 1: Water control
CREATE TABLE IF NOT EXISTS water_control (
  id SERIAL PRIMARY KEY,
  daily_record_id INTEGER REFERENCES daily_records(id) ON DELETE CASCADE NOT NULL,
  temperature DECIMAL,
  ph DECIMAL,
  dissolved_oxygen DECIMAL,
  nitrates DECIMAL,
  nitrites DECIMAL,
  hardness DECIMAL,
  tds DECIMAL
);

-- Section 2: Filtration checks
CREATE TABLE IF NOT EXISTS filtration_checks (
  id SERIAL PRIMARY KEY,
  daily_record_id INTEGER REFERENCES daily_records(id) ON DELETE CASCADE NOT NULL,
  bio_filter_level BOOLEAN DEFAULT false,
  bio_filter_foam BOOLEAN DEFAULT false,
  mechanical_filter BOOLEAN DEFAULT false,
  circulation_pump BOOLEAN DEFAULT false,
  thermo_pump BOOLEAN DEFAULT false,
  aeration BOOLEAN DEFAULT false,
  sieve_filter BOOLEAN DEFAULT false,
  notes TEXT
);

-- Section 3: Fish visual control
CREATE TABLE IF NOT EXISTS fish_visual (
  id SERIAL PRIMARY KEY,
  daily_record_id INTEGER REFERENCES daily_records(id) ON DELETE CASCADE NOT NULL,
  normal_swimming BOOLEAN DEFAULT false,
  no_injuries BOOLEAN DEFAULT false,
  no_infection BOOLEAN DEFAULT false,
  normal_appetite BOOLEAN DEFAULT false,
  no_dead BOOLEAN DEFAULT false,
  notes TEXT
);

-- Section 4: Pool feeding (one row per pool per day)
CREATE TABLE IF NOT EXISTS pool_feeding (
  id SERIAL PRIMARY KEY,
  daily_record_id INTEGER REFERENCES daily_records(id) ON DELETE CASCADE NOT NULL,
  pool_number INTEGER NOT NULL CHECK (pool_number BETWEEN 1 AND 6),
  fish_count INTEGER DEFAULT 0,
  avg_weight_gr DECIMAL DEFAULT 0,
  sold_count INTEGER DEFAULT 0,
  dead_count INTEGER DEFAULT 0,
  food_type VARCHAR(255),
  food_quantity_gr DECIMAL DEFAULT 0
);

-- Section 5: Activities
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  daily_record_id INTEGER REFERENCES daily_records(id) ON DELETE CASCADE NOT NULL,
  sorting_date DATE,
  weight_control_date DATE,
  misc_1 TEXT,
  misc_2 TEXT
);

-- Alerts (auto-created when values are out of norm)
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  daily_record_id INTEGER REFERENCES daily_records(id) ON DELETE CASCADE NOT NULL,
  parameter_name VARCHAR(100) NOT NULL,
  value DECIMAL NOT NULL,
  min_norm DECIMAL,
  max_norm DECIMAL,
  created_at TIMESTAMP DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT false
);

-- Insert default norms
INSERT INTO parameter_norms (parameter_name, min_value, max_value, unit) VALUES
  ('temperature', 26, 28, '°C'),
  ('ph', 6.5, 7.5, ''),
  ('dissolved_oxygen', 5, NULL, 'mg/L'),
  ('nitrates', 50, 150, 'mg/L'),
  ('nitrites', NULL, 0.10, 'mg/L'),
  ('hardness', 80, 300, 'mg/L'),
  ('tds', 100, 400, 'ppm')
ON CONFLICT (parameter_name) DO NOTHING;
