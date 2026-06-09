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
const { projectCurrentWeight } = require('../services/growthPrediction');
const { analyzeWaterParameters } = require('../services/waterAnomalyDetection');
const { analyzeWaterPrediction } = require('../services/waterPrediction');

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

    // 2. Get latest measurement per pool (W0, fish_count at measurement, measured date)
    const measurementsRes = await pool.query(`
      SELECT DISTINCT ON (pool_number)
        pool_number,
        fish_count,
        avg_weight_gr,
        measured_at,
        DATE(measured_at) as measured_date
      FROM pool_measurements
      ORDER BY pool_number, measured_at DESC
    `);

    // 3. Get temperature: 3-day moving average for stable recommendations,
    //    plus latest reading for display purposes
    const waterRes = await pool.query(`
      SELECT wc.temperature
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      ORDER BY dr.date DESC
      LIMIT 1
    `);

    const tempAvg3Res = await pool.query(`
      SELECT AVG(wc.temperature) as avg_temp, COUNT(*) as readings
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      WHERE dr.date >= CURRENT_DATE - INTERVAL '3 days'
        AND wc.temperature IS NOT NULL
    `);

    // 4. Get today's actual feeding (partial if early in the day)
    const today = new Date().toISOString().split('T')[0];
    const todayMealsRes = await pool.query(`
      SELECT pool_number, SUM(food_quantity_gr) as total_food_gr
      FROM pool_meals
      WHERE date = $1
      GROUP BY pool_number
    `, [today]);

    // 5. NEW: Get total feed given AFTER each pool's last measurement
    //    Only counts complete days (date > measured_date AND date < today)
    //    so partial "today" doesn't contaminate the projection.
    const feedSinceRes = await pool.query(`
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

    // 6. NEW: Average water temperature across each pool's projection period.
    //    For simplicity we compute one global average from the earliest measurement
    //    onwards — RAS temperature is stable so per-pool breakdown is unnecessary.
    const avgTempRes = await pool.query(`
      SELECT AVG(wc.temperature) as avg_temp
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      WHERE dr.date >= COALESCE(
        (SELECT DATE(MIN(measured_at)) FROM pool_measurements),
        CURRENT_DATE - INTERVAL '30 days'
      )
      AND dr.date < CURRENT_DATE
    `);

    // ─── Build lookup maps ───
    const measurementMap = {};
    measurementsRes.rows.forEach(m => {
      measurementMap[m.pool_number] = m;
    });

    const todayFeedMap = {};
    todayMealsRes.rows.forEach(m => {
      todayFeedMap[m.pool_number] = parseFloat(m.total_food_gr) || 0;
    });

    const feedSinceMap = {};
    feedSinceRes.rows.forEach(m => {
      feedSinceMap[m.pool_number] = parseFloat(m.total_feed_gr) || 0;
    });

    const latestTemperature = waterRes.rows[0]?.temperature != null
      ? parseFloat(waterRes.rows[0].temperature)
      : null;

    // 3-day moving average for feeding recommendations (smooth, no daily jumps)
    const temp3DayAvg = tempAvg3Res.rows[0]?.avg_temp != null
      ? parseFloat(tempAvg3Res.rows[0].avg_temp)
      : latestTemperature;

    // For growth projection, use the longer historical average
    const avgTemperature = avgTempRes.rows[0]?.avg_temp != null
      ? parseFloat(avgTempRes.rows[0].avg_temp)
      : latestTemperature;

    // ─── NEW: Project current weight for each pool using growth prediction ───
    const projectionByPool = {};
    const todayDate = new Date(today);

    for (const inv of inventoryRes.rows) {
      const meas = measurementMap[inv.pool_number];
      if (!meas || !meas.avg_weight_gr) {
        projectionByPool[inv.pool_number] = {
          W_now: null,
          isProjected: false,
          basis: 'no-measurement',
          warnings: ['Нема мерење за овој базен'],
        };
        continue;
      }

      const measuredDate = new Date(meas.measured_date);
      const daysElapsed = Math.max(
        0,
        Math.floor((todayDate - measuredDate) / (1000 * 60 * 60 * 24))
      );

      const feedSinceGr = feedSinceMap[inv.pool_number] || 0;
      const feedSinceKg = feedSinceGr / 1000;

      const projection = projectCurrentWeight({
        fishCountAtMeasurement: meas.fish_count,
        W0: parseFloat(meas.avg_weight_gr),
        daysElapsed,
        totalFeedKgSince: feedSinceKg,
        avgTemperature,
      });

      projectionByPool[inv.pool_number] = projection;
    }

    // ─── Build pool data using PROJECTED weight (not measured) ───
    const pools = inventoryRes.rows.map(inv => {
      const meas = measurementMap[inv.pool_number];
      const proj = projectionByPool[inv.pool_number];
      // Prefer projected weight; fall back to raw measurement; finally null
      const effectiveWeight = proj?.W_now ?? meas?.avg_weight_gr ?? null;

      return {
        pool_number: inv.pool_number,
        current_count: inv.current_count,
        avg_weight_gr: effectiveWeight,
        last_measured: meas?.measured_at || null,
      };
    });

    // Use 3-day average temperature for stable daily recommendations
    // (latest reading shown on UI, but calculation uses moving average to avoid daily jumps)
    const result = calculateAllRecommendations(pools, temp3DayAvg);

    // ─── Enrich each pool's response with projection metadata + comparison ───
    for (const [pn, rec] of Object.entries(result.pools)) {
      const actualGr = todayFeedMap[pn] || 0;
      if (actualGr > 0 && rec.hasData) {
        rec.comparison = compareWithActual(rec, actualGr);
      } else {
        rec.comparison = null;
      }
      rec.todayActualFoodGr = actualGr;

      // Attach projection info so the UI can show "проектирана тежина"
      const proj = projectionByPool[pn];
      if (proj) {
        rec.weightProjection = {
          isProjected: proj.isProjected,
          W0: measurementMap[pn]?.avg_weight_gr
            ? parseFloat(measurementMap[pn].avg_weight_gr)
            : null,
          W_now: proj.W_now,
          daysElapsed: proj.daysElapsed,
          basis: proj.basis,
          lastMeasured: measurementMap[pn]?.measured_at || null,
          metadata: proj.metadata || null,
          warnings: proj.warnings || [],
        };
      }
    }

    // Add overall projection info to summary
    result.summary.projectionInfo = {
      avgTemperatureUsed: avgTemperature != null ? Math.round(avgTemperature * 10) / 10 : null,
      latestTemperatureUsed: latestTemperature,
      feedingTemperatureUsed: temp3DayAvg != null ? Math.round(temp3DayAvg * 10) / 10 : null,
      projectedPoolCount: Object.values(projectionByPool).filter(p => p.isProjected).length,
    };

    // Keep latest temperature in summary for UI display (thermometer icon)
    result.summary.temperature = latestTemperature != null ? Math.round(latestTemperature * 10) / 10 : null;

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
    if (isNaN(poolNumber) || poolNumber < 1 || poolNumber > 8) {
      return res.status(400).json({ error: 'Невалиден број на базен (1-8)' });
    }

    // Get inventory
    const invRes = await pool.query(
      'SELECT current_count FROM pool_fish_inventory WHERE pool_number = $1',
      [poolNumber]
    );

    // Get latest measurement (W0, fish count at measurement, measured date)
    const measRes = await pool.query(
      `SELECT fish_count, avg_weight_gr, measured_at, DATE(measured_at) as measured_date
       FROM pool_measurements
       WHERE pool_number = $1
       ORDER BY measured_at DESC LIMIT 1`,
      [poolNumber]
    );

    // Get latest temperature + 3-day average for stable recommendations
    const waterRes = await pool.query(`
      SELECT wc.temperature FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      ORDER BY dr.date DESC LIMIT 1
    `);

    const tempAvg3Res = await pool.query(`
      SELECT AVG(wc.temperature) as avg_temp
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      WHERE dr.date >= CURRENT_DATE - INTERVAL '3 days'
        AND wc.temperature IS NOT NULL
    `);

    // NEW: Total feed given after last measurement (complete days only)
    const feedSinceRes = await pool.query(`
      SELECT COALESCE(SUM(food_quantity_gr), 0) as total_feed_gr
      FROM pool_meals
      WHERE pool_number = $1
        AND date > $2::date
        AND date < CURRENT_DATE
    `, [poolNumber, measRes.rows[0]?.measured_date || '1970-01-01']);

    // NEW: Average temperature since measurement
    const avgTempRes = await pool.query(`
      SELECT AVG(wc.temperature) as avg_temp
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      WHERE dr.date >= $1::date
        AND dr.date < CURRENT_DATE
    `, [measRes.rows[0]?.measured_date || '1970-01-01']);

    const fishCount = invRes.rows[0]?.current_count || 0;
    const W0 = measRes.rows[0]?.avg_weight_gr
      ? parseFloat(measRes.rows[0].avg_weight_gr)
      : 0;
    const fishCountAtMeasurement = measRes.rows[0]?.fish_count || 0;
    const latestTemperature = waterRes.rows[0]?.temperature != null
      ? parseFloat(waterRes.rows[0].temperature)
      : null;
    // 3-day moving average for stable feeding recommendation
    const temp3DayAvg = tempAvg3Res.rows[0]?.avg_temp != null
      ? parseFloat(tempAvg3Res.rows[0].avg_temp)
      : latestTemperature;
    const avgTemperature = avgTempRes.rows[0]?.avg_temp != null
      ? parseFloat(avgTempRes.rows[0].avg_temp)
      : latestTemperature;

    // NEW: Project current weight
    const today = new Date().toISOString().split('T')[0];
    const measuredDate = measRes.rows[0]?.measured_date
      ? new Date(measRes.rows[0].measured_date)
      : null;
    const daysElapsed = measuredDate
      ? Math.max(0, Math.floor((new Date(today) - measuredDate) / (1000 * 60 * 60 * 24)))
      : 0;
    const feedSinceGr = parseFloat(feedSinceRes.rows[0]?.total_feed_gr) || 0;

    const projection = projectCurrentWeight({
      fishCountAtMeasurement,
      W0,
      daysElapsed,
      totalFeedKgSince: feedSinceGr / 1000,
      avgTemperature,
    });

    // Use projected weight if available, otherwise fall back to raw W0
    const effectiveWeight = projection.W_now ?? W0;

    const recommendation = calculatePoolRecommendation(fishCount, effectiveWeight, temp3DayAvg);

    // Get today's actual feeding
    const mealsRes = await pool.query(
      'SELECT SUM(food_quantity_gr) as total FROM pool_meals WHERE date = $1 AND pool_number = $2',
      [today, poolNumber]
    );
    const actualGr = parseFloat(mealsRes.rows[0]?.total) || 0;

    res.json({
      poolNumber,
      fishCount,
      avgWeight: effectiveWeight,
      lastMeasured: measRes.rows[0]?.measured_at || null,
      temperature: latestTemperature,
      weightProjection: {
        isProjected: projection.isProjected,
        W0,
        W_now: projection.W_now,
        daysElapsed: projection.daysElapsed,
        basis: projection.basis,
        metadata: projection.metadata || null,
        warnings: projection.warnings || [],
      },
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
      SELECT wc.temperature, wc.ph, wc.total_alkalinity,
             wc.nitrates, wc.nitrites, wc.hardness, wc.total_chlorine, wc.ammonium
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

/**
 * GET /api/ai/water-prediction
 * Rule-based water analysis: Z-score + trends + causal chains + NH₃ calc + recommendations
 */
router.get('/water-prediction', authMiddleware, async (req, res) => {
  try {
    const result = await analyzeWaterPrediction(pool);
    res.json(result);
  } catch (err) {
    console.error('Water prediction error:', err);
    res.status(500).json({ error: 'Серверска грешка при анализа' });
  }
});

module.exports = router;
