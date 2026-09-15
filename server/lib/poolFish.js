// Број на живи риби по базен — единствена пресметка што се користи насекаде.
//
//   риби во базен = последно мерење
//                 − угинати (чеклисти од датумот на мерење наваму)
//                 − продадени (само стари чеклисти, полето веќе не се внесува)
//                 − риби земени за преработка (production_batches: изворен базен = базенот,
//                   датум на производство ≥ датум на мерење)
//
// Сите функции примаат `db` — pool или client од отворена трансакција.

const COUNT_SQL = `
  WITH latest_measurement AS (
    SELECT DISTINCT ON (pool_number)
      pool_number, fish_count, measured_at::date AS measured_date
    FROM pool_measurements
    ORDER BY pool_number, measured_at DESC
  ),
  removed AS (
    SELECT pf.pool_number,
           SUM(COALESCE(pf.dead_count, 0) + COALESCE(pf.sold_count, 0)) AS total_removed
    FROM pool_feeding pf
    JOIN daily_records dr ON pf.daily_record_id = dr.id
    JOIN latest_measurement lm ON pf.pool_number = lm.pool_number
    WHERE dr.date >= lm.measured_date
    GROUP BY pf.pool_number
  ),
  processed AS (
    SELECT pb.source_pool AS pool_number, SUM(COALESCE(pb.fish_count, 0)) AS total_processed
    FROM production_batches pb
    JOIN latest_measurement lm ON pb.source_pool = lm.pool_number
    WHERE COALESCE(pb.production_date, pb.created_at::date) >= lm.measured_date
    GROUP BY pb.source_pool
  )
  SELECT lm.pool_number,
         GREATEST(0, lm.fish_count - COALESCE(r.total_removed, 0) - COALESCE(p.total_processed, 0))::int AS current_count
  FROM latest_measurement lm
  LEFT JOIN removed r ON lm.pool_number = r.pool_number
  LEFT JOIN processed p ON lm.pool_number = p.pool_number
  ORDER BY lm.pool_number
`;

// [{ pool_number, current_count }]
async function getPoolCounts(db) {
  const r = await db.query(COUNT_SQL);
  return r.rows;
}

// Број за еден базен (0 ако нема мерење)
async function getPoolCount(db, poolNumber) {
  const rows = await getPoolCounts(db);
  const row = rows.find(r => r.pool_number === parseInt(poolNumber));
  return row ? row.current_count : 0;
}

// Риби земени за преработка на даден датум, по базен: { [pool_number]: count }
async function getProcessedByPool(db, date) {
  const r = await db.query(
    `SELECT source_pool AS pool_number, SUM(COALESCE(fish_count, 0))::int AS processed
     FROM production_batches
     WHERE source_pool IS NOT NULL AND COALESCE(production_date, created_at::date) = $1
     GROUP BY source_pool`,
    [date]
  );
  const map = {};
  for (const row of r.rows) map[row.pool_number] = row.processed;
  return map;
}

module.exports = { getPoolCounts, getPoolCount, getProcessedByPool };
