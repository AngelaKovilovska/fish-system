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
      ORDER BY fi.food_type
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

// GET /api/food-inventory/log - get inventory change history
router.get('/log', authMiddleware, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const result = await pool.query(
      `SELECT fil.*, u.full_name as created_by_name
       FROM food_inventory_log fil
       LEFT JOIN users u ON fil.created_by = u.id
       ORDER BY fil.created_at DESC
       LIMIT $1`,
      [parseInt(limit)]
    );
    res.json({ log: result.rows });
  } catch (err) {
    console.error('Get food log error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
