/**
 * AI Feeding Recommendation & Water Anomaly API
 *
 * GET  /api/ai/recommendations         — All pools recommendation (from DB data)
 * POST /api/ai/calculate                — Manual calculator (custom inputs)
 * GET  /api/ai/water-analysis           — Water parameter anomaly detection
 * GET  /api/ai/pool/:poolNumber         — Single pool recommendation
 * GET  /api/ai/stock-projection         — Dynamic stock duration projection
 */

const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const {
  calculatePoolRecommendation,
  calculateAllRecommendations,
  compareWithActual,
  manualCalculate,
  projectStockDuration,
  GROWOUT_TABLE,
  FEED_PRODUCTS,
} = require('../services/feedingRecommendation');
const { analyzeWaterParameters } = require('../services/waterAnomalyDetection');

const router = express.Router();

/**
 * GET /api/ai/recommendations
 * Fetch current pool data + latest temperature, compute recommendations for all pools
 */
router.get('/recommendations', authMiddleware, async (req, res) => {
  try {
    // 1. Get current fish inventory (source of truth for fish count)
    const inventoryRes = await pool.query(
      'SELECT pool_number, current_count FROM pool_fish_inventory ORDER BY pool_number'
    );

    // 2. Get latest measurement per pool (for avg_weight_gr)
    const measurementsRes = await pool.query(`
      SELECT DISTINCT ON (pool_number)
        pool_number, fish_count, avg_weight_gr, measured_at
      FROM pool_measurements
      ORDER BY pool_number, measured_at DESC
    `);

    // 3. Get latest water temperature from today's or most recent record
    const waterRes = await pool.query(`
      SELECT wc.temperature
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      ORDER BY dr.date DESC
      LIMIT 1
    `);

    // 4. Get today's actual feeding (from pool_meals or pool_feeding)
    const today = new Date().toISOString().split('T')[0];
    const todayMealsRes = await pool.query(`
      SELECT pool_number, SUM(food_quantity_gr) as total_food_gr
      FROM pool_meals
      WHERE date = $1
      GROUP BY pool_number
    `, [today]);

    // Build pool data array
    const measurementMap = {};
    measurementsRes.rows.forEach(m => {
      measurementMap[m.pool_number] = m;
    });

    const todayFeedMap = {};
    todayMealsRes.rows.forEach(m => {
      todayFeedMap[m.pool_number] = parseFloat(m.total_food_gr) || 0;
    });

    const pools = inventoryRes.rows.map(inv => ({
      pool_number: inv.pool_number,
      current_count: inv.current_count,
      avg_weight_gr: measurementMap[inv.pool_number]?.avg_weight_gr || null,
      last_measured: measurementMap[inv.pool_number]?.measured_at || null,
    }));

    const temperature = waterRes.rows[0]?.temperature != null
      ? parseFloat(waterRes.rows[0].temperature)
      : null;

    // Calculate recommendations
    const result = calculateAllRecommendations(pools, temperature);

    // Add actual feeding comparison
    for (const [pn, rec] of Object.entries(result.pools)) {
      const actualGr = todayFeedMap[pn] || 0;
      if (actualGr > 0 && rec.hasData) {
        rec.comparison = compareWithActual(rec, actualGr);
      } else {
        rec.comparison = null;
      }
      rec.todayActualFoodGr = actualGr;
    }

    res.json(result);
  } catch (err) {
    console.error('AI recommendations error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

/**
 * GET /api/ai/pool/:poolNumber
 * Single pool recommendation
 */
router.get('/pool/:poolNumber', authMiddleware, async (req, res) => {
  try {
    const poolNumber = parseInt(req.params.poolNumber);
    if (isNaN(poolNumber) || poolNumber < 1 || poolNumber > 6) {
      return res.status(400).json({ error: 'Невалиден број на базен (1-6)' });
    }

    // Get inventory
    const invRes = await pool.query(
      'SELECT current_count FROM pool_fish_inventory WHERE pool_number = $1',
      [poolNumber]
    );

    // Get latest measurement
    const measRes = await pool.query(
      'SELECT avg_weight_gr, measured_at FROM pool_measurements WHERE pool_number = $1 ORDER BY measured_at DESC LIMIT 1',
      [poolNumber]
    );

    // Get latest temperature
    const waterRes = await pool.query(`
      SELECT wc.temperature FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      ORDER BY dr.date DESC LIMIT 1
    `);

    const fishCount = invRes.rows[0]?.current_count || 0;
    const avgWeight = measRes.rows[0]?.avg_weight_gr || 0;
    const temperature = waterRes.rows[0]?.temperature != null
      ? parseFloat(waterRes.rows[0].temperature)
      : null;

    const recommendation = calculatePoolRecommendation(fishCount, avgWeight, temperature);

    // Get today's actual feeding
    const today = new Date().toISOString().split('T')[0];
    const mealsRes = await pool.query(
      'SELECT SUM(food_quantity_gr) as total FROM pool_meals WHERE date = $1 AND pool_number = $2',
      [today, poolNumber]
    );
    const actualGr = parseFloat(mealsRes.rows[0]?.total) || 0;

    res.json({
      poolNumber,
      fishCount,
      avgWeight,
      lastMeasured: measRes.rows[0]?.measured_at || null,
      temperature,
      ...recommendation,
      comparison: actualGr > 0 && recommendation.hasData ? compareWithActual(recommendation, actualGr) : null,
      todayActualFoodGr: actualGr,
    });
  } catch (err) {
    console.error('AI pool recommendation error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

/**
 * POST /api/ai/calculate
 * Manual calculator — doesn't read DB, just calculates from inputs
 */
router.post('/calculate', authMiddleware, async (req, res) => {
  try {
    const { fishCount, avgWeight, temperature, currentFoodType } = req.body;

    if (!fishCount || !avgWeight) {
      return res.status(400).json({ error: 'fishCount и avgWeight се задолжителни' });
    }

    const result = manualCalculate({
      fishCount: parseInt(fishCount),
      avgWeight: parseFloat(avgWeight),
      temperature: temperature != null ? parseFloat(temperature) : null,
      currentFoodType: currentFoodType || null,
    });

    res.json(result);
  } catch (err) {
    console.error('AI calculate error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

/**
 * GET /api/ai/water-analysis
 * Analyze current water parameters for anomalies
 */
router.get('/water-analysis', authMiddleware, async (req, res) => {
  try {
    // Get latest water reading
    const latestRes = await pool.query(`
      SELECT wc.*, dr.date
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      ORDER BY dr.date DESC
      LIMIT 1
    `);

    if (latestRes.rows.length === 0) {
      return res.json({ hasData: false, message: 'Нема податоци за вода' });
    }

    const current = latestRes.rows[0];

    // Get historical readings (last 30 days)
    const historyRes = await pool.query(`
      SELECT wc.temperature, wc.ph, wc.dissolved_oxygen,
             wc.nitrates, wc.nitrites, wc.hardness, wc.tds
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      WHERE dr.date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY dr.date ASC
    `);

    const analysis = analyzeWaterParameters(current, historyRes.rows);

    res.json({
      hasData: true,
      date: current.date,
      ...analysis,
    });
  } catch (err) {
    console.error('Water analysis error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

/**
 * GET /api/ai/feeding-table
 * Return the Coppens feeding table data (for reference display)
 */
router.get('/feeding-table', authMiddleware, (req, res) => {
  res.json({
    table: GROWOUT_TABLE,
    products: FEED_PRODUCTS,
    note: 'Alltech Coppens 2025-2026 — African Catfish. Optimal: 26-28°C.',
  });
});

/**
 * GET /api/ai/stock-projection
 * Dynamic stock duration projection — simulates fish growth day-by-day
 * and calculates when each food type will run out
 */
router.get('/stock-projection', authMiddleware, async (req, res) => {
  try {
    // 1. Get current fish data per pool
    const inventoryRes = await pool.query(
      'SELECT pool_number, current_count FROM pool_fish_inventory ORDER BY pool_number'
    );

    const measurementsRes = await pool.query(`
      SELECT DISTINCT ON (pool_number)
        pool_number, avg_weight_gr
      FROM pool_measurements
      ORDER BY pool_number, measured_at DESC
    `);

    // 2. Get latest water temperature
    const waterRes = await pool.query(`
      SELECT wc.temperature
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      ORDER BY dr.date DESC
      LIMIT 1
    `);

    // 3. Get current food stock levels
    const stockRes = await pool.query(`
      SELECT
        fi.food_type,
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
          SELECT food_type, food_quantity_gr as consumed_gr
          FROM pool_feeding
          WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
        ) all_consumption
        GROUP BY food_type
      ) c ON c.food_type = fi.food_type
      ORDER BY fi.food_type
    `);

    // Build pool data
    const measurementMap = {};
    measurementsRes.rows.forEach(m => {
      measurementMap[m.pool_number] = parseFloat(m.avg_weight_gr) || 0;
    });

    const pools = inventoryRes.rows.map(inv => ({
      pool_number: inv.pool_number,
      fish_count: inv.current_count,
      avg_weight_gr: measurementMap[inv.pool_number] || 0,
    }));

    const temperature = waterRes.rows[0]?.temperature != null
      ? parseFloat(waterRes.rows[0].temperature)
      : null;

    // Build stock map
    const stockByType = {};
    stockRes.rows.forEach(s => {
      stockByType[s.food_type] = parseFloat(s.quantity_kg) || 0;
    });

    // Run projection
    const result = projectStockDuration(pools, temperature, stockByType);

    res.json(result);
  } catch (err) {
    console.error('Stock projection error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
