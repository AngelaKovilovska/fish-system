-- 036: Потрошувачката во дневникот на храна носи reference_id што е или ID на оброк или ID на чеклиста.
-- Без ознака за тип, бришење/уредување чеклиста #120 го бришеше и редот за оброк #120.
ALTER TABLE food_inventory_log ADD COLUMN IF NOT EXISTS reference_type VARCHAR(20);
