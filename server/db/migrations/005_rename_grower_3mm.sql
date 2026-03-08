-- Rename "Grower (3mm)" to "Grower-13EF (3mm)" in food_inventory and related tables
UPDATE food_inventory SET food_type = 'Grower-13EF (3mm)' WHERE food_type = 'Grower (3mm)';
UPDATE food_purchases SET food_type = 'Grower-13EF (3mm)' WHERE food_type = 'Grower (3mm)';
