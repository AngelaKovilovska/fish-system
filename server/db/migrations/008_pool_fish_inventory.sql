-- Pool fish inventory - tracks current live fish count per pool
-- This is the "source of truth" for how many fish are in each pool right now.
-- Updated when:
--   1. Admin creates a new pool measurement (resets to measured count)
--   2. Daily record is created (decremented by dead_count + sold_count)
--   3. Daily record is updated (old dead/sold rolled back, new applied)
--   4. Daily record is deleted (dead/sold added back)

CREATE TABLE IF NOT EXISTS pool_fish_inventory (
  id SERIAL PRIMARY KEY,
  pool_number INTEGER NOT NULL UNIQUE CHECK (pool_number BETWEEN 1 AND 6),
  current_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize with 6 pools (counts will be set from latest measurements)
INSERT INTO pool_fish_inventory (pool_number, current_count)
VALUES (1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0)
ON CONFLICT (pool_number) DO NOTHING;

-- Seed current counts from latest pool measurements
UPDATE pool_fish_inventory pfi
SET current_count = COALESCE(latest.fish_count, 0),
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (pool_number) pool_number, fish_count
  FROM pool_measurements
  ORDER BY pool_number, measured_at DESC
) latest
WHERE pfi.pool_number = latest.pool_number;

-- Now subtract all dead + sold from daily records that happened AFTER the latest measurement
-- for each pool
UPDATE pool_fish_inventory pfi
SET current_count = pfi.current_count - COALESCE(totals.total_removed, 0),
    updated_at = NOW()
FROM (
  SELECT pf.pool_number,
         SUM(COALESCE(pf.dead_count, 0) + COALESCE(pf.sold_count, 0)) as total_removed
  FROM pool_feeding pf
  JOIN daily_records dr ON pf.daily_record_id = dr.id
  WHERE dr.date > (
    SELECT COALESCE(MAX(pm.measured_at)::date, '1970-01-01')
    FROM pool_measurements pm
    WHERE pm.pool_number = pf.pool_number
  )
  GROUP BY pf.pool_number
) totals
WHERE pfi.pool_number = totals.pool_number;
