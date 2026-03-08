DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM food_inventory WHERE food_type = 'Grower (3mm)') THEN
    -- Transfer quantity
    UPDATE food_inventory
    SET quantity_kg = quantity_kg + (SELECT quantity_kg FROM food_inventory WHERE food_type = 'Grower (3mm)')
    WHERE food_type = 'Grower-13EF (3mm)';

    -- Rename in log table
    UPDATE food_inventory_log SET food_type = 'Grower-13EF (3mm)' WHERE food_type = 'Grower (3mm)';

    -- Rename in purchases if exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'food_purchases') THEN
      UPDATE food_purchases SET food_type = 'Grower-13EF (3mm)' WHERE food_type = 'Grower (3mm)';
    END IF;

    -- Now safe to delete
    DELETE FROM food_inventory WHERE food_type = 'Grower (3mm)';
  END IF;
END $$;
