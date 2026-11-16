// Залиха на храна — единствена пресметка што се користи насекаде (екран, попис, извештаи):
//   залиха = Σ набавки (вклучително корекции од попис) − потрошено
//   потрошено = оброци (pool_meals) + стари чеклисти (pool_feeding) за денови без оброци
// asOf ('YYYY-MM-DD' или null) = состојба на крајот на тој ден.

async function getFoodStock(db, asOf = null) {
  const r = await db.query(
    `SELECT fi.food_type, fi.updated_at,
            COALESCE(p.purchased_kg, 0) AS purchased_kg,
            COALESCE(c.consumed_kg, 0) AS consumed_kg,
            COALESCE(p.purchased_kg, 0) - COALESCE(c.consumed_kg, 0) AS stock_kg
     FROM food_inventory fi
     LEFT JOIN (
       SELECT food_type, SUM(change_kg) AS purchased_kg FROM food_inventory_log
       WHERE reason = 'purchase' AND ($1::date IS NULL OR COALESCE(purchased_at, created_at::date) <= $1::date)
       GROUP BY food_type
     ) p ON p.food_type = fi.food_type
     LEFT JOIN (
       SELECT food_type, SUM(consumed_gr) / 1000.0 AS consumed_kg FROM (
         SELECT food_type, food_quantity_gr AS consumed_gr FROM pool_meals
         WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
           AND ($1::date IS NULL OR date <= $1::date)
         UNION ALL
         SELECT pf.food_type, pf.food_quantity_gr FROM pool_feeding pf JOIN daily_records dr ON pf.daily_record_id = dr.id
         WHERE pf.food_quantity_gr > 0 AND pf.food_type IS NOT NULL AND pf.food_type != ''
           AND ($1::date IS NULL OR dr.date <= $1::date)
           AND NOT EXISTS (SELECT 1 FROM pool_meals pm WHERE pm.date = dr.date AND pm.pool_number = pf.pool_number)
       ) x GROUP BY food_type
     ) c ON c.food_type = fi.food_type
     ORDER BY CASE fi.food_type
       WHEN 'Advance (1.5mm)' THEN 1 WHEN 'Pregrower-15 (2mm)' THEN 2
       WHEN 'SpecialPro EF (3mm)' THEN 3 WHEN 'SpecialPro EF (4.5mm)' THEN 4
       WHEN 'Grower-13EF (3mm)' THEN 5 WHEN 'Grower-13EF (4.5mm)' THEN 6 WHEN 'Grower-13EF (6mm)' THEN 7
       ELSE 8 END, fi.food_type`,
    [asOf]
  );
  return r.rows.map(row => ({
    food_type: row.food_type,
    updated_at: row.updated_at,
    purchased_kg: parseFloat(row.purchased_kg) || 0,
    consumed_kg: parseFloat(row.consumed_kg) || 0,
    stock_kg: parseFloat(row.stock_kg) || 0,
  }));
}

// Grower-13 EF не се користи во RAS: се прикажува само додека има залиха
const isHiddenLegacy = (row) => /^Grower-13EF/.test(row.food_type) && row.stock_kg <= 0;

module.exports = { getFoodStock, isHiddenLegacy };
