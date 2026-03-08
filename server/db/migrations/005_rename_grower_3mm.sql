-- Merge "Grower (3mm)" into "Grower-13EF (3mm)" and delete the old entry
-- Transfer quantity from old to new
UPDATE food_inventory
SET quantity_kg = quantity_kg + COALESCE((SELECT quantity_kg FROM food_inventory WHERE food_type = 'Grower (3mm)'), 0)
WHERE food_type = 'Grower-13EF (3mm)';

-- Rename old purchases
UPDATE food_purchases SET food_type = 'Grower-13EF (3mm)' WHERE food_type = 'Grower (3mm)';

-- Delete old entry
DELETE FROM food_inventory WHERE food_type = 'Grower (3mm)';
