const express = require('express');
const { todayLocal } = require('../lib/dates');
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
      ORDER BY pool_number, measured_at DESC, id DESC
    `);

    // 2. Total feed given per pool since their last measurement
    const feedResult = await pool.query(`
      WITH latest_meas AS (
        SELECT DISTINCT ON (pool_number)
          pool_number, DATE(measured_at) as measured_date
        FROM pool_measurements
        ORDER BY pool_number, measured_at DESC, id DESC
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
      'SELECT * FROM pool_measurements WHERE pool_number = $1 ORDER BY measured_at DESC, id DESC LIMIT 20',
      [poolNumber]
    );
    res.json({ measurements: result.rows });
  } catch (err) {
    console.error('Get pool history error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// Мерење = сортирање: рибите се мерат и се распределуваат по базени.
// Едно мерење по базен по датум — повторно зачувување за ист датум го заменува постоечкото.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value) {
  const d = value ? String(value).slice(0, 10) : todayLocal();
  return DATE_RE.test(d) ? d : null;
}

// Проверка на едно мерење; враќа { poolNum, fishCount, avgWeight } или { error }
function parseMeasurement(m) {
  const poolNum = parseInt(m.pool_number);
  if (!poolNum || poolNum < 1 || poolNum > 8) return { error: 'Невалиден број на базен' };
  const rawCount = m.fish_count === '' || m.fish_count == null ? 0 : Number(m.fish_count);
  const rawWeight = m.avg_weight_gr === '' || m.avg_weight_gr == null ? 0 : Number(m.avg_weight_gr);
  if (!Number.isFinite(rawCount) || !Number.isFinite(rawWeight) || rawCount < 0 || rawWeight < 0 || !Number.isInteger(rawCount)) {
    return { error: `Базен ${poolNum}: невалидни вредности` };
  }
  if (rawCount > 0 && rawWeight <= 0) return { error: `Базен ${poolNum}: внесена е бројка на риби, но не и тежина` };
  if (rawWeight > 0 && rawCount <= 0) return { error: `Базен ${poolNum}: внесена е тежина, но не и број на риби` };
  return { poolNum, fishCount: rawCount, avgWeight: rawWeight };
}

async function upsertMeasurement(client, { poolNum, fishCount, avgWeight }, date, userId) {
  const existing = await client.query(
    'SELECT id, fish_count FROM pool_measurements WHERE pool_number = $1 AND measured_at::date = $2::date ORDER BY id DESC',
    [poolNum, date]
  );
  let row;
  if (existing.rows.length > 0) {
    const keepId = existing.rows[0].id;
    // Часот на внес (created_at) се менува само ако се смени бројот на риби (ново броење). Поправка само на
    // тежината не смее да го помести — инаку серија внесена тој ден по мерењето повеќе не би се одземала.
    const countChanged = parseInt(existing.rows[0].fish_count) !== fishCount;
    const upd = await client.query(
      `UPDATE pool_measurements SET fish_count = $1, avg_weight_gr = $2, measured_by = $3,
         created_at = CASE WHEN $5 THEN NOW() ELSE created_at END
       WHERE id = $4 RETURNING *`,
      [fishCount, avgWeight, userId, keepId, countChanged]
    );
    row = upd.rows[0];
    if (existing.rows.length > 1) {
      await client.query('DELETE FROM pool_measurements WHERE pool_number = $1 AND measured_at::date = $2::date AND id <> $3', [poolNum, date, keepId]);
    }
  } else {
    const ins = await client.query(
      `INSERT INTO pool_measurements (pool_number, fish_count, avg_weight_gr, measured_by, measured_at, created_at)
       VALUES ($1, $2, $3, $4, $5::date, NOW()) RETURNING *`,
      [poolNum, fishCount, avgWeight, userId, date]
    );
    row = ins.rows[0];
  }
  await client.query(
    `INSERT INTO pool_fish_inventory (pool_number, current_count, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (pool_number) DO UPDATE SET current_count = $2, updated_at = NOW()`,
    [poolNum, fishCount]
  );
  return row;
}

async function saveMeasurements(req, res, list, measuredAt) {
  const date = normalizeDate(measuredAt);
  if (!date) return res.status(400).json({ error: 'Невалиден датум на мерење' });
  if (date > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Датумот на мерење не може да биде во иднина' });
  }
  const parsed = [];
  const seen = new Set();
  for (const m of list) {
    const p = parseMeasurement(m || {});
    if (p.error) return res.status(400).json({ error: p.error });
    if (seen.has(p.poolNum)) return res.status(400).json({ error: `Базен ${p.poolNum} е внесен двапати` });
    seen.add(p.poolNum);
    parsed.push(p);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const p of parsed) saved.push(await upsertMeasurement(client, p, date, req.user.id));
    await client.query('COMMIT');
    return saved;
  } catch (innerErr) {
    await client.query('ROLLBACK');
    throw innerErr;
  } finally {
    client.release();
  }
}

// GET /api/pool-measurements/by-date?date=YYYY-MM-DD — мерењата внесени за даден датум (за уредување)
router.get('/by-date', authMiddleware, async (req, res) => {
  try {
    const date = normalizeDate(req.query.date);
    if (!date) return res.status(400).json({ error: 'Невалиден датум' });
    const result = await pool.query(
      `SELECT DISTINCT ON (pool_number) id, pool_number, fish_count, avg_weight_gr, measured_at
       FROM pool_measurements WHERE measured_at::date = $1::date
       ORDER BY pool_number, id DESC`,
      [date]
    );
    res.json({ date, measurements: result.rows });
  } catch (err) {
    console.error('Get measurements by date error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/pool-measurements - едно мерење (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { pool_number, fish_count, avg_weight_gr, measured_at } = req.body;
    const saved = await saveMeasurements(req, res, [{ pool_number, fish_count, avg_weight_gr }], measured_at);
    if (Array.isArray(saved)) res.status(201).json({ measurement: saved[0] });
  } catch (err) {
    console.error('Create pool measurement error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/pool-measurements/batch - мерење/сортирање за повеќе базени одеднаш (admin only)
router.post('/batch', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { measurements, measured_at } = req.body;
    if (!measurements || !Array.isArray(measurements) || measurements.length === 0) {
      return res.status(400).json({ error: 'Нема мерења за зачувување' });
    }
    const saved = await saveMeasurements(req, res, measurements, measured_at);
    if (Array.isArray(saved)) res.status(201).json({ measurements: saved, count: saved.length });
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
