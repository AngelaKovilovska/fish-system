const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { validateId, validatePoolNumber } = require('../middleware/validate');
const { projectCurrentWeight } = require('../services/growthPrediction');

const router = express.Router();

// GET /api/pool-measurements - get latest measurement per pool + projected weight
router.get('/', authMiddleware, async (req, res) => {
  try {
    // 1. Latest measurement per pool
    const measResult = await pool.query(`
      SELECT DISTINCT ON (pool_number)
        id, pool_number, fish_count, avg_weight_gr, measured_at
      FROM pool_measurements
      ORDER BY pool_number, measured_at DESC
    `);

    // 2. Total feed given per pool since their last measurement
    const feedResult = await pool.query(`
      WITH latest_meas AS (
        SELECT DISTINCT ON (pool_number)
          pool_number, DATE(measured_at) as measured_date
        FROM pool_measurements
        ORDER BY pool_number, measured_at DESC
      )
      SELECT
        lm.pool_number,
        COALESCE(SUM(pm.food_quantity_gr), 0) as total_feed_gr
      FROM latest_meas lm
      LEFT JOIN pool_meals pm
        ON pm.pool_number = lm.pool_number
        AND pm.date > lm.measured_date
        AND pm.date < CURRENT_DATE
      GROUP BY lm.pool_number
    `);

    // 3. Average water temperature since earliest measurement
    const tempResult = await pool.query(`
      SELECT AVG(wc.temperature) as avg_temp
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      WHERE dr.date >= COALESCE(
        (SELECT DATE(MIN(measured_at)) FROM pool_measurements),
        CURRENT_DATE - INTERVAL '30 days'
      )
      AND dr.date < CURRENT_DATE
    `);
    const avgTemp = tempResult.rows[0]?.avg_temp != null
      ? parseFloat(tempResult.rows[0].avg_temp) : null;

    // Build feed lookup
    const feedMap = {};
    feedResult.rows.forEach(r => { feedMap[r.pool_number] = parseFloat(r.total_feed_gr) || 0; });

    // Project weight for each pool
    const today = new Date();
    const measurements = measResult.rows.map(m => {
      const daysElapsed = Math.max(0,
        Math.floor((today - new Date(m.measured_at)) / (1000 * 60 * 60 * 24))
      );
      const totalFeedKg = (feedMap[m.pool_number] || 0) / 1000;

      const proj = projectCurrentWeight({
        fishCountAtMeasurement: m.fish_count,
        W0: parseFloat(m.avg_weight_gr),
        daysElapsed,
        totalFeedKgSince: totalFeedKg,
        avgTemperature: avgTemp,
      });

      return {
        ...m,
        projected_weight_gr: proj.W_now != null
          ? Math.round(proj.W_now * 10) / 10 : m.avg_weight_gr,
        is_projected: proj.isProjected,
      };
    });

    res.json({ measurements });
  } catch (err) {
    console.error('Get pool measurements error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/pool-measurements/history/:poolNumber - measurement history for a pool
router.get('/history/:poolNumber', authMiddleware, validatePoolNumber, async (req, res) => {
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
router.delete('/:id', authMiddleware, adminOnly, validateId, async (req, res) => {
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
