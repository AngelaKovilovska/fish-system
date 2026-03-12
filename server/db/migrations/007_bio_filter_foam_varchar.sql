-- Change bio_filter_foam from BOOLEAN to VARCHAR to store 'yes'/'no' string values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'filtration_checks' AND column_name = 'bio_filter_foam' AND data_type = 'boolean'
  ) THEN
    ALTER TABLE filtration_checks
      ALTER COLUMN bio_filter_foam DROP DEFAULT,
      ALTER COLUMN bio_filter_foam TYPE VARCHAR(3) USING CASE WHEN bio_filter_foam = true THEN 'yes' WHEN bio_filter_foam = false THEN 'no' ELSE NULL END,
      ALTER COLUMN bio_filter_foam SET DEFAULT NULL;
  END IF;
END $$;
