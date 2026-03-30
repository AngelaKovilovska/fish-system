-- Add supplier and document number to food purchase entries
ALTER TABLE food_inventory_log ADD COLUMN IF NOT EXISTS supplier VARCHAR(255);
ALTER TABLE food_inventory_log ADD COLUMN IF NOT EXISTS document_number VARCHAR(100);
