-- Change bio_filter_foam from BOOLEAN to VARCHAR to store 'yes'/'no' string values
ALTER TABLE filtration_checks
  ALTER COLUMN bio_filter_foam DROP DEFAULT,
  ALTER COLUMN bio_filter_foam TYPE VARCHAR(3) USING CASE WHEN bio_filter_foam = true THEN 'yes' WHEN bio_filter_foam = false THEN 'no' ELSE NULL END,
  ALTER COLUMN bio_filter_foam SET DEFAULT NULL;
