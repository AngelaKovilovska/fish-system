const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();

// GET /api/food-inventory - get current stock levels (calculated from purchased - consumed)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        fi.id, fi.food_type, fi.updated_at,
        GREATEST(0,
          COALESCE(p.purchased_kg, 0) -
          COALESCE(c.consumed_kg, 0)
        )::numeric(10,2) as quantity_kg
      FROM food_inventory fi
      LEFT JOIN (
        SELECT food_type, SUM(change_kg) as purchased_kg
        FROM food_inventory_log WHERE reason = 'purchase'
        GROUP BY food_type
      ) p ON p.food_type = fi.food_type
      LEFT JOIN (
        SELECT food_type, SUM(consumed_gr) / 1000.0 as consumed_kg
        FROM (
          SELECT food_type, food_quantity_gr as consumed_gr
          FROM pool_meals
          WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
          UNION ALL
          SELECT pf.food_type, pf.food_quantity_gr
          FROM pool_feeding pf
          WHERE pf.food_quantity_gr > 0 AND pf.food_type IS NOT NULL AND pf.food_type != ''
            AND NOT EXISTS (
              SELECT 1 FROM pool_meals pm
              JOIN daily_records dr ON pf.daily_record_id = dr.id
              WHERE pm.date = dr.date AND pm.pool_number = pf.pool_number
            )
        ) all_fed
        GROUP BY food_type
      ) c ON c.food_type = fi.food_type
      ORDER BY CASE fi.food_type
        WHEN 'Advance (1.5mm)' THEN 1
        WHEN 'Pregrower-15 (2mm)' THEN 2
        WHEN 'SpecialPro EF (3mm)' THEN 3
        WHEN 'Grower-13EF (3mm)' THEN 4
        WHEN 'Grower-13EF (4.5mm)' THEN 5
        WHEN 'Grower-13EF (6mm)' THEN 6
        ELSE 7
      END
    `);
    res.json({ inventory: result.rows });
  } catch (err) {
    console.error('Get food inventory error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/food-inventory/purchase - add purchased food (admin only)
router.post('/purchase', authMiddleware, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { food_type, quantity_kg, purchase_date } = req.body;
    if (!food_type || !quantity_kg || quantity_kg <= 0) {
      return res.status(400).json({ error: 'Внесете тип и количина (> 0)' });
    }

    await client.query('BEGIN');

    // Upsert inventory
    await client.query(
      `INSERT INTO food_inventory (food_type, quantity_kg, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (food_type) DO UPDATE SET
         quantity_kg = food_inventory.quantity_kg + $2,
         updated_at = NOW()`,
      [food_type, quantity_kg]
    );

    // Log the purchase
    await client.query(
      `INSERT INTO food_inventory_log (food_type, change_kg, reason, created_by, purchased_at)
       VALUES ($1, $2, 'purchase', $3, $4)`,
      [food_type, quantity_kg, req.user.id, purchase_date || new Date().toISOString().split('T')[0]]
    );

    await client.query('COMMIT');

    // Return updated inventory
    const result = await pool.query(
      'SELECT * FROM food_inventory WHERE food_type = $1', [food_type]
    );

    res.json({ message: 'Набавката е додадена', item: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Purchase error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// PUT /api/food-inventory/purchase/:id - edit a purchase entry (admin only)
router.put('/purchase/:id', authMiddleware, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { food_type, quantity_kg, purchase_date } = req.body;

    if (!quantity_kg || quantity_kg <= 0) {
      return res.status(400).json({ error: 'Количината мора да е поголема од 0' });
    }

    // Get the old entry first
    const old = await client.query(
      'SELECT * FROM food_inventory_log WHERE id = $1 AND reason = $2',
      [id, 'purchase']
    );
    if (old.rows.length === 0) {
      return res.status(404).json({ error: 'Набавката не е пронајдена' });
    }
    const oldEntry = old.rows[0];

    await client.query('BEGIN');

    // Update the log entry
    await client.query(
      `UPDATE food_inventory_log
       SET food_type = COALESCE($1, food_type),
           change_kg = $2,
           purchased_at = COALESCE($3, purchased_at)
       WHERE id = $4 AND reason = 'purchase'`,
      [food_type || oldEntry.food_type, quantity_kg, purchase_date || oldEntry.purchased_at, id]
    );

    // Update inventory updated_at timestamps
    const newFoodType = food_type || oldEntry.food_type;
    await client.query(
      'UPDATE food_inventory SET updated_at = NOW() WHERE food_type = $1',
      [oldEntry.food_type]
    );
    if (newFoodType !== oldEntry.food_type) {
      await client.query(
        'UPDATE food_inventory SET updated_at = NOW() WHERE food_type = $1',
        [newFoodType]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Набавката е ажурирана' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update purchase error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// DELETE /api/food-inventory/purchase/:id - delete a purchase entry (admin only)
router.delete('/purchase/:id', authMiddleware, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const old = await client.query(
      'SELECT * FROM food_inventory_log WHERE id = $1 AND reason = $2',
      [id, 'purchase']
    );
    if (old.rows.length === 0) {
      return res.status(404).json({ error: 'Набавката не е пронајдена' });
    }

    await client.query('BEGIN');

    await client.query(
      "DELETE FROM food_inventory_log WHERE id = $1 AND reason = 'purchase'",
      [id]
    );

    // Update inventory updated_at
    await client.query(
      'UPDATE food_inventory SET updated_at = NOW() WHERE food_type = $1',
      [old.rows[0].food_type]
    );

    await client.query('COMMIT');
    res.json({ message: 'Набавката е избришана' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete purchase error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// GET /api/food-inventory/log - get inventory change history (aggregated by day)
router.get('/log', authMiddleware, async (req, res) => {
  try {
    const { days = 3 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    const sinceStr = since.toISOString().split('T')[0];

    // Purchases from log (individual entries)
    const purchases = await pool.query(
      `SELECT fil.id, fil.food_type, fil.change_kg, fil.reason,
              fil.purchased_at as date, u.full_name as created_by_name
       FROM food_inventory_log fil
       LEFT JOIN users u ON fil.created_by = u.id
       WHERE fil.reason = 'purchase' AND fil.purchased_at >= $1
       ORDER BY fil.purchased_at DESC, fil.created_at DESC`,
      [sinceStr]
    );
    // Consumption aggregated by day + food_type from pool_meals
    const consumption = await pool.query(
      `SELECT date, food_type,
              SUM(food_quantity_gr)::float / 1000.0 as change_kg,
              'consumption' as reason
       FROM pool_meals
       WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
         AND date >= $1
       GROUP BY date, food_type
       ORDER BY date DESC`,
      [sinceStr]
    );
    // Merge and sort by date descending
    const log = [
      ...purchases.rows.map(r => ({ ...r, change_kg: parseFloat(r.change_kg) })),
      ...consumption.rows.map(r => ({ ...r, change_kg: -parseFloat(r.change_kg) })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ log });
  } catch (err) {
    console.error('Get food log error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
