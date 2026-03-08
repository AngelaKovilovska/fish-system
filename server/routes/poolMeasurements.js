const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();

// GET /api/pool-measurements - get latest measurement per pool
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (pool_number)
        id, pool_number, fish_count, avg_weight_gr, measured_at
      FROM pool_measurements
      ORDER BY pool_number, measured_at DESC
    `);
    res.json({ measurements: result.rows });
  } catch (err) {
    console.error('Get pool measurements error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/pool-measurements/history/:poolNumber - measurement history for a pool
router.get('/history/:poolNumber', authMiddleware, async (req, res) => {
  try {
    const { poolNumber } = req.params;
    const result = await pool.query(
      'SELECT * FROM pool_measurements WHERE pool_number = $1 ORDER BY measured_at DESC LIMIT 20',
      [poolNumber]
    );
    res.json({ measurements: result.rows });
  } catch (err) {
    console.error('Get pool history error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/pool-measurements - add new measurement (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { pool_number, fish_count, avg_weight_gr } = req.body;

    if (!pool_number || pool_number < 1 || pool_number > 6) {
      return res.status(400).json({ error: 'Невалиден број на базен' });
    }

    const result = await pool.query(
      'INSERT INTO pool_measurements (pool_number, fish_count, avg_weight_gr, measured_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [pool_number, fish_count || 0, avg_weight_gr || 0, req.user.id]
    );

    res.status(201).json({ measurement: result.rows[0] });
  } catch (err) {
    console.error('Create pool measurement error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
