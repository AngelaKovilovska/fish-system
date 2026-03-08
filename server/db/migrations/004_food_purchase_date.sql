-- Add purchased_at date to food_inventory_log for tracking actual purchase dates
ALTER TABLE food_inventory_log ADD COLUMN IF NOT EXISTS purchased_at DATE;

-- Set existing rows to their created_at date
UPDATE food_inventory_log SET purchased_at = created_at::date WHERE purchased_at IS NULL AND reason = 'purchase';
