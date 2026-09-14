-- ═══════════════════════════════════════════════════════════
-- Migration 023: Праг за ниска залиха по производ
-- ═══════════════════════════════════════════════════════════

ALTER TABLE product_types
  ADD COLUMN IF NOT EXISTS min_stock_kg DECIMAL(10,2) DEFAULT 5;

UPDATE product_types SET min_stock_kg = 5 WHERE min_stock_kg IS NULL;
