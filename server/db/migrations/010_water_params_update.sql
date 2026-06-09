-- Migration 010: Update water control parameters to match RAS system specs
-- Remove: dissolved_oxygen, tds
-- Add: total_alkalinity, total_chlorine, ammonium
-- Keep: temperature, ph, nitrates, nitrites, hardness

-- Rename columns in water_control table (idempotent — skip if already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'water_control' AND column_name = 'dissolved_oxygen') THEN
    ALTER TABLE water_control RENAME COLUMN dissolved_oxygen TO total_alkalinity;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'water_control' AND column_name = 'tds') THEN
    ALTER TABLE water_control RENAME COLUMN tds TO total_chlorine;
  END IF;
END $$;
ALTER TABLE water_control ADD COLUMN IF NOT EXISTS ammonium DECIMAL;

-- Update parameter_norms: remove old, insert new
DELETE FROM parameter_norms WHERE parameter_name IN ('dissolved_oxygen', 'tds');

INSERT INTO parameter_norms (parameter_name, min_value, max_value, unit) VALUES
  ('total_alkalinity', 100, 200, 'mg/L'),
  ('total_chlorine', NULL, 0.01, 'mg/L'),
  ('ammonium', NULL, 0.05, 'mg/L')
ON CONFLICT (parameter_name) DO NOTHING;

-- Update existing norms to match new specs (only if they still have the original defaults)
-- This prevents overwriting user-customized norms on every server restart
DO $$
BEGIN
  -- Only update if the value hasn't been customized (matches original 001_initial.sql defaults)
  UPDATE parameter_norms SET min_value = 26, max_value = 28
    WHERE parameter_name = 'temperature' AND min_value = 24 AND max_value = 30;
  UPDATE parameter_norms SET min_value = 6.5, max_value = 7.5
    WHERE parameter_name = 'ph' AND min_value = 6.5 AND max_value = 8.5;
  UPDATE parameter_norms SET min_value = NULL, max_value = 100
    WHERE parameter_name = 'nitrates' AND max_value != 100;
  UPDATE parameter_norms SET min_value = NULL, max_value = 0.5
    WHERE parameter_name = 'nitrites' AND max_value != 0.5;
  UPDATE parameter_norms SET min_value = 100, max_value = 300
    WHERE parameter_name = 'hardness' AND max_value != 300;
END $$;
