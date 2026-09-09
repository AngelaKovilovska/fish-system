# CLARIO v2 — План за имплементација

## 1. Нова навигација (Sidebar + Mobile tabs)

### Desktop Sidebar — групирано:
```
🏠 Дома (нов dashboard)

── Фарма ──
📋 Внес
📊 Извештаи
📈 Проекции

── Производство ──        ← НОВО
🔪 Припрема
📦 Преработка
🧊 Залиха производи

── Продажба ──            ← НОВО
🛒 Нова продажба
📋 Историја
👥 Купувачи

── Админ ──  (само admin)
⚙️ Мерења / Залихи храна / Норми / Корисници / Типови производи
```

### Mobile — bottom tabs:
4 главни: Дома, Внес, Производство, Продажба
(Извештаи, Проекции, Админ → достапни од Дома или хамбургер мени)


## 2. Database Schema (нови табели)

### `product_types` — Типови производи (динамички)
```sql
CREATE TABLE product_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,    -- 'Цела', 'Филетирана', 'Без глава'
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `slaughter_batches` — Припрема за колење
```sql
CREATE TABLE slaughter_batches (
  id SERIAL PRIMARY KEY,
  from_pool INTEGER NOT NULL,               -- од кој базен
  fish_count INTEGER NOT NULL,              -- број риби
  estimated_weight_kg DECIMAL,              -- проценета тежина
  moved_date DATE NOT NULL,                 -- датум на вадење
  planned_slaughter_date DATE,              -- планирано колење
  actual_slaughter_date DATE,               -- реално колење
  status VARCHAR(20) DEFAULT 'preparing'    -- preparing | slaughtered | cancelled
    CHECK (status IN ('preparing', 'slaughtered', 'cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `processing_records` — Преработка
```sql
CREATE TABLE processing_records (
  id SERIAL PRIMARY KEY,
  slaughter_batch_id INTEGER REFERENCES slaughter_batches(id),
  processing_date DATE NOT NULL,
  input_weight_kg DECIMAL NOT NULL,         -- колку kg влезе
  created_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `processing_items` — Ставки од преработка
```sql
CREATE TABLE processing_items (
  id SERIAL PRIMARY KEY,
  processing_record_id INTEGER REFERENCES processing_records(id) ON DELETE CASCADE,
  product_type_id INTEGER REFERENCES product_types(id),
  output_weight_kg DECIMAL NOT NULL,        -- колку kg излезе
  storage_type VARCHAR(20) DEFAULT 'fresh'  -- fresh | frozen
    CHECK (storage_type IN ('fresh', 'frozen')),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `product_inventory` — Залиха на готови производи
```sql
CREATE TABLE product_inventory (
  id SERIAL PRIMARY KEY,
  product_type_id INTEGER REFERENCES product_types(id),
  storage_type VARCHAR(20) NOT NULL CHECK (storage_type IN ('fresh', 'frozen')),
  quantity_kg DECIMAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (product_type_id, storage_type)
);
```

### `buyers` — Купувачи
```sql
CREATE TABLE buyers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  edb VARCHAR(20),                          -- ЕДБ (опционо, за фактура)
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `sales` — Продажби
```sql
CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  sale_number VARCHAR(50) NOT NULL UNIQUE,  -- ПР-2026-001
  buyer_id INTEGER REFERENCES buyers(id),
  sale_date DATE NOT NULL,
  total_kg DECIMAL DEFAULT 0,
  total_amount DECIMAL DEFAULT 0,           -- вкупна цена → ПРИХОД
  notes TEXT,
  status VARCHAR(20) DEFAULT 'completed'
    CHECK (status IN ('draft', 'completed', 'cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `sale_items` — Ставки на продажба
```sql
CREATE TABLE sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  product_type_id INTEGER REFERENCES product_types(id),
  storage_type VARCHAR(20) NOT NULL,
  quantity_kg DECIMAL NOT NULL,
  price_per_kg DECIMAL NOT NULL,
  total_price DECIMAL NOT NULL,             -- quantity * price
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `company_settings` — Податоци за фирмата (за испратница/фактура)
```sql
CREATE TABLE company_settings (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255),
  address TEXT,
  phone VARCHAR(50),
  edb VARCHAR(20),
  bank_account VARCHAR(50),
  bank_name VARCHAR(100),
  logo_url TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
```


## 3. Фази на имплементација

### Фаза 1: Database + Backend API
- Миграција 016: нови табели
- API routes: /api/production, /api/sales, /api/buyers, /api/products
- Автоматско ажурирање на pool_fish_inventory при припрема
- Автоматско ажурирање на product_inventory при преработка и продажба

### Фаза 2: Нова навигација + Dashboard
- Layout.jsx — нов sidebar со секции
- Dashboard — нов со: аларми, залиха производи, последни продажби, приход

### Фаза 3: Производство (UI)
- Припрема: форма за внес + листа на активни серии
- Преработка: форма поврзана со серија + ставки по тип
- Залиха производи: преглед свежо/замрзнато по тип

### Фаза 4: Продажба (UI)
- Купувачи: CRUD
- Нова продажба: избери купувач → додај ставки од залиха → цена
- Историја на продажби
- PDF генерирање (испратница/фактура)

### Фаза 5: Финансии (подоцна)
- Приход: автоматски од sales.total_amount
- Трошоци: нов модул за внес
- Извештај: приход − трошоци = профит


## 4. Flow дијаграм

```
Базен (pool_fish_inventory)
    │
    ▼ вади N риби
Припрема (slaughter_batches: status=preparing)
    │ после 1-2 дена
    ▼
Колење (status=slaughtered)
    │
    ▼ внеси input_weight_kg
Преработка (processing_records + processing_items)
    │ цела: X kg, филе: Y kg, без глава: Z kg
    ▼
Залиха производи (product_inventory)
    │ свежо / замрзнато
    ▼
Продажба (sales + sale_items)
    │ купувач, ставки, цена
    ▼
Испратница/Фактура (PDF)
    │
    ▼
Приход (SUM од sales.total_amount)
```
