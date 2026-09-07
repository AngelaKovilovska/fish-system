-- ═══════════════════════════════════════════════════════════
-- Migration 016: Production & Sales module
-- ═══════════════════════════════════════════════════════════

-- 1. Типови на производи (6 default + можност за нови)
CREATE TABLE IF NOT EXISTS product_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  latin_name VARCHAR(255) DEFAULT 'Clarias gariepinus',
  unit VARCHAR(20) DEFAULT 'кг',
  price_per_unit DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default product types
INSERT INTO product_types (code, name, price_per_unit, sort_order) VALUES
  ('РСГ', 'Риба свежа голема', 0, 1),
  ('РБГ', 'Риба без глава', 0, 2),
  ('ФСК', 'Филе со кожа', 0, 3),
  ('ФБК', 'Филе без кожа', 0, 4),
  ('ДР',  'Димена риба', 0, 5),
  ('ДЗЧ', 'Друго/Зачинета', 0, 6)
ON CONFLICT (code) DO NOTHING;

-- 2. Производствени серии (LOT)
CREATE TABLE IF NOT EXISTS production_batches (
  id SERIAL PRIMARY KEY,
  lot_number VARCHAR(50) UNIQUE NOT NULL,
  source_pool INTEGER,
  fish_count INTEGER DEFAULT 0,
  total_weight_kg DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'чиста_вода'
    CHECK (status IN ('чиста_вода', 'колење', 'обработка', 'пакување', 'завршено')),
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Производи по серија (што е произведено)
CREATE TABLE IF NOT EXISTS production_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES production_batches(id) ON DELETE CASCADE NOT NULL,
  product_type_id INTEGER REFERENCES product_types(id) NOT NULL,
  quantity_kg DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Залиха на готови производи
CREATE TABLE IF NOT EXISTS product_inventory (
  id SERIAL PRIMARY KEY,
  product_type_id INTEGER REFERENCES product_types(id) UNIQUE NOT NULL,
  quantity_kg DECIMAL(10,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize inventory for default types
INSERT INTO product_inventory (product_type_id, quantity_kg)
SELECT id, 0 FROM product_types
ON CONFLICT (product_type_id) DO NOTHING;

-- 5. Купувачи (се зачувуваат за повторна употреба)
CREATE TABLE IF NOT EXISTS buyers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  edb VARCHAR(30),
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Продажби
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  dispatch_number VARCHAR(50),
  buyer_id INTEGER REFERENCES buyers(id) NOT NULL,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_method VARCHAR(30) DEFAULT 'фактура'
    CHECK (payment_method IN ('фактура', 'готово', 'гратис')),
  lot_number VARCHAR(50),
  transport_vehicle VARCHAR(100),
  product_temp DECIMAL(5,1),
  subtotal DECIMAL(12,2) DEFAULT 0,
  vat_rate DECIMAL(5,2) DEFAULT 5.00,
  vat_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. Ставки по продажба
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  product_type_id INTEGER REFERENCES product_types(id) NOT NULL,
  lot_number VARCHAR(50),
  quantity_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
