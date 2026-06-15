const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/pool-fish-inventory - get current fish count per pool
// Calculated in real-time: latest measurement fish_count minus accumulated dead+sold since that measurement
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
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
      )
      SELECT lm.pool_number,
             GREATEST(0, lm.fish_count - COALESCE(r.total_removed, 0))::int AS current_count
      FROM latest_measurement lm
      LEFT JOIN removed r ON lm.pool_number = r.pool_number
      ORDER BY lm.pool_number
    `);
    res.json({ inventory: result.rows });
  } catch (err) {
    console.error('Get pool fish inventory error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
