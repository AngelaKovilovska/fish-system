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
    const { pool_number, fish_count, avg_weight_gr, measured_at } = req.body;

    if (!pool_number || pool_number < 1 || pool_number > 8) {
      return res.status(400).json({ error: 'Невалиден број на базен' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO pool_measurements (pool_number, fish_count, avg_weight_gr, measured_by, measured_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [pool_number, fish_count || 0, avg_weight_gr || 0, req.user.id, measured_at || new Date()]
      );

      // Update fish inventory to the new measured count
      await client.query(
        `INSERT INTO pool_fish_inventory (pool_number, current_count, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (pool_number) DO UPDATE SET current_count = $2, updated_at = NOW()`,
        [pool_number, fish_count || 0]
      );

      await client.query('COMMIT');
      res.status(201).json({ measurement: result.rows[0] });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create pool measurement error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/pool-measurements/batch - save measurements for multiple pools at once (admin only)
router.post('/batch', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { measurements, measured_at } = req.body;
    if (!measurements || !Array.isArray(measurements) || measurements.length === 0) {
      return res.status(400).json({ error: 'Нема мерења за зачувување' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const saved = [];

      for (const m of measurements) {
        const poolNum = parseInt(m.pool_number);
        if (!poolNum || poolNum < 1 || poolNum > 8) continue;
        const fishCount = parseInt(m.fish_count) || 0;
        const avgWeight = parseFloat(m.avg_weight_gr) || 0;
        // Save even 0/0 — records that the pool is empty after sorting

        const result = await client.query(
          'INSERT INTO pool_measurements (pool_number, fish_count, avg_weight_gr, measured_by, measured_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [poolNum, fishCount, avgWeight, req.user.id, measured_at || new Date()]
        );

        await client.query(
          `INSERT INTO pool_fish_inventory (pool_number, current_count, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (pool_number) DO UPDATE SET current_count = $2, updated_at = NOW()`,
          [poolNum, fishCount]
        );

        saved.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json({ measurements: saved, count: saved.length });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Batch pool measurement error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// DELETE /api/pool-measurements/:id - delete a measurement (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM pool_measurements WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Мерењето не е пронајдено' });
    }

    res.json({ message: 'Мерењето е избришано' });
  } catch (err) {
    console.error('Delete pool measurement error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
