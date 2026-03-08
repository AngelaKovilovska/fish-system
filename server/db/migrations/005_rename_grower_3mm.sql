DO $$
BEGIN
  -- Transfer quantity from old to new if old exists
  IF EXISTS (SELECT 1 FROM food_inventory WHERE food_type = 'Grower (3mm)') THEN
    UPDATE food_inventory
    SET quantity_kg = quantity_kg + (SELECT quantity_kg FROM food_inventory WHERE food_type = 'Grower (3mm)')
    WHERE food_type = 'Grower-13EF (3mm)';

    UPDATE food_purchases SET food_type = 'Grower-13EF (3mm)' WHERE food_type = 'Grower (3mm)';

    DELETE FROM food_inventory WHERE food_type = 'Grower (3mm)';
  END IF;
END $$;
