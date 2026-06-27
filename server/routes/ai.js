/**
 * AI Feeding Recommendation & Water Anomaly API
 *
 * GET  /api/ai/recommendations         — All pools recommendation (from DB data)
 * POST /api/ai/calculate                — Manual calculator (custom inputs)
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
const {
  projectCurrentWeight,
  calculateSGR,
  getExpectedWeightFromCurve,
  predictGrowth,
  PHASE_FCR,
} = require('../services/growthPrediction');
const { analyzeWaterPrediction, analyzeWaterPredictionEnhanced } = require('../services/waterPrediction');
const { generateWaterForecast } = require('../services/waterRandomForest');

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
    const result = await analyzeWaterPredictionEnhanced(pool);
    res.json(result);
  } catch (err) {
    console.error('Water prediction error:', err);
    res.status(500).json({ error: 'Серверска грешка при анализа' });
  }
});

/**
 * GET /api/ai/water-forecast
 * Random Forest ML prediction for water parameters (1-3 days ahead)
 */
router.get('/water-forecast', authMiddleware, async (req, res) => {
  try {
    const result = await generateWaterForecast(pool);
    res.json(result);
  } catch (err) {
    console.error('Water RF forecast error:', err);
    res.status(500).json({ error: 'Серверска грешка при ML предикција' });
  }
});

/**
 * GET /api/ai/growth-history/:poolNumber
 * Growth chart data: actual measurements, SGR projection, Coppens ideal curve.
 * Optional query: ?from=YYYY-MM-DD (filter from a specific measurement date)
 */
router.get('/growth-history/:poolNumber', authMiddleware, async (req, res) => {
  try {
    const poolNumber = parseInt(req.params.poolNumber);
    if (isNaN(poolNumber) || poolNumber < 1 || poolNumber > 8) {
      return res.status(400).json({ error: 'Невалиден број на базен (1-8)' });
    }

    const fromDate = req.query.from || null;

    // ─── CHECK LAST SORTING DATE ───
    // After sorting, fish move between pools — measurements before sorting
    // belong to a different cohort of fish. Use sorting_date as a floor.
    const sortingRes = await pool.query(`
      SELECT MAX(act.sorting_date) as last_sorting
      FROM activities act
      WHERE act.sorting_date IS NOT NULL
    `);
    const lastSortingDate = sortingRes.rows[0]?.last_sorting
      ? sortingRes.rows[0].last_sorting.toISOString().split('T')[0]
      : null;

    // Effective start date: later of fromDate and lastSortingDate
    let effectiveFrom = fromDate;
    let filteredBySorting = false;
    if (lastSortingDate) {
      if (!effectiveFrom || lastSortingDate > effectiveFrom) {
        effectiveFrom = lastSortingDate;
        filteredBySorting = !fromDate; // only flag if user didn't manually pick a date
      }
    }

    // 1. Get measurements for this pool (after sorting if applicable)
    const measRes = await pool.query(`
      SELECT id, fish_count, avg_weight_gr, DATE(measured_at) as date,
             measured_at
      FROM pool_measurements
      WHERE pool_number = $1
        ${effectiveFrom ? 'AND DATE(measured_at) >= $2' : ''}
      ORDER BY measured_at ASC
    `, effectiveFrom ? [poolNumber, effectiveFrom] : [poolNumber]);

    if (measRes.rows.length === 0) {
      return res.json({
        poolNumber,
        hasData: false,
        message: lastSortingDate
          ? `Нема мерења после последното сортирање (${lastSortingDate})`
          : 'Нема мерења за овој базен',
        measurementDates: [],
        sortingInfo: lastSortingDate ? { lastSortingDate, filtered: true } : null,
      });
    }

    // Get measurement dates (post-sorting) for the dropdown filter
    const allDatesRes = await pool.query(`
      SELECT DISTINCT ON (DATE(measured_at))
        DATE(measured_at) as date, avg_weight_gr
      FROM pool_measurements
      WHERE pool_number = $1
        ${lastSortingDate ? 'AND DATE(measured_at) >= $2' : ''}
      ORDER BY DATE(measured_at) DESC, measured_at DESC
    `, lastSortingDate ? [poolNumber, lastSortingDate] : [poolNumber]);

    const measurements = measRes.rows.map(m => ({
      date: m.date.toISOString().split('T')[0],
      weight: parseFloat(m.avg_weight_gr),
      fishCount: m.fish_count,
    }));

    // 2. Get daily feed data between first measurement and today
    const firstDate = measurements[0].date;
    const today = new Date().toISOString().split('T')[0];

    const feedRes = await pool.query(`
      SELECT date, SUM(food_quantity_gr) as total_food_gr
      FROM pool_meals
      WHERE pool_number = $1
        AND date >= $2::date
        AND date <= $3::date
      GROUP BY date
      ORDER BY date
    `, [poolNumber, firstDate, today]);

    const feedByDate = {};
    feedRes.rows.forEach(r => {
      feedByDate[r.date.toISOString().split('T')[0]] = parseFloat(r.total_food_gr) || 0;
    });

    // 3. Get average temperature for the period
    const tempRes = await pool.query(`
      SELECT AVG(wc.temperature) as avg_temp
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      WHERE dr.date >= $1::date AND wc.temperature IS NOT NULL
    `, [firstDate]);

    const avgTemp = tempRes.rows[0]?.avg_temp
      ? parseFloat(tempRes.rows[0].avg_temp)
      : null;

    // ─── BUILD SGR PROJECTION ───
    // Between consecutive measurements, calculate daily SGR and interpolate.
    // After the last measurement, project forward using feed data.
    const sgrProjection = [];

    for (let mi = 0; mi < measurements.length; mi++) {
      const curr = measurements[mi];
      const next = measurements[mi + 1];

      if (next) {
        // Interpolate between two known measurements using SGR
        const d1 = new Date(curr.date);
        const d2 = new Date(next.date);
        const daysBetween = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (daysBetween <= 0) continue;

        const sgr = calculateSGR(curr.weight, next.weight, daysBetween);

        for (let d = 0; d < daysBetween; d++) {
          const dt = new Date(d1);
          dt.setDate(dt.getDate() + d);
          const dateStr = dt.toISOString().split('T')[0];
          // W(t) = W0 × e^(SGR/100 × t)
          const projWeight = curr.weight * Math.exp((sgr / 100) * d);
          sgrProjection.push({ date: dateStr, weight: Math.round(projWeight * 10) / 10 });
        }
      } else {
        // Last measurement — project forward to today using feed data
        const d1 = new Date(curr.date);
        const dToday = new Date(today);
        const daysToToday = Math.round((dToday - d1) / (1000 * 60 * 60 * 24));

        if (daysToToday <= 0) {
          sgrProjection.push({ date: curr.date, weight: curr.weight });
          break;
        }

        // Accumulate daily feed and project weight day-by-day
        let W = curr.weight;
        let N = curr.fishCount || 100; // fallback

        for (let d = 0; d <= daysToToday; d++) {
          const dt = new Date(d1);
          dt.setDate(dt.getDate() + d);
          const dateStr = dt.toISOString().split('T')[0];
          sgrProjection.push({ date: dateStr, weight: Math.round(W * 10) / 10 });

          if (d < daysToToday) {
            const dailyFeedGr = feedByDate[dateStr] || 0;
            if (dailyFeedGr > 0) {
              // Use phase FCR to estimate growth
              let fcr = 0.85; // default
              for (const phase of PHASE_FCR) {
                if (W <= phase.maxWeight) { fcr = phase.fcr; break; }
              }
              const feedPerFish = dailyFeedGr / N;
              const growth = feedPerFish / fcr;
              W += growth;
            }
          }
        }
      }
    }

    // Add the last measurement point if only 1 measurement
    if (measurements.length === 1 && sgrProjection.length === 0) {
      sgrProjection.push({ date: measurements[0].date, weight: measurements[0].weight });
    }

    // ─── BUILD COPPENS IDEAL CURVE ───
    // Find the feeding day on the Coppens curve that matches W0,
    // then trace the ideal growth from there.
    const coppensIdeal = [];
    const startWeight = measurements[0].weight;

    // Find the corresponding feedingDay on the Coppens curve for startWeight
    let startFeedingDay = 0;
    for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
      const lo = GROWOUT_TABLE[i];
      const hi = GROWOUT_TABLE[i + 1];
      if (startWeight >= lo.avgWeight && startWeight < hi.avgWeight) {
        const ratio = (startWeight - lo.avgWeight) / (hi.avgWeight - lo.avgWeight);
        startFeedingDay = lo.feedingDays + ratio * (hi.feedingDays - lo.feedingDays);
        break;
      }
      if (startWeight < GROWOUT_TABLE[0].avgWeight) {
        startFeedingDay = 0;
        break;
      }
    }
    if (startWeight >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight) {
      startFeedingDay = GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedingDays;
    }

    // Generate daily points on the Coppens curve
    const firstDateObj = new Date(firstDate);
    const todayObj = new Date(today);
    const totalDays = Math.round((todayObj - firstDateObj) / (1000 * 60 * 60 * 24));

    for (let d = 0; d <= totalDays; d++) {
      const dt = new Date(firstDateObj);
      dt.setDate(dt.getDate() + d);
      const dateStr = dt.toISOString().split('T')[0];

      const targetFeedingDay = startFeedingDay + d;
      const idealWeight = getWeightFromFeedingDay(targetFeedingDay);
      coppensIdeal.push({ date: dateStr, weight: Math.round(idealWeight * 10) / 10 });
    }

    // ─── STATS ───
    const lastMeasurement = measurements[measurements.length - 1];
    const lastSgrPoint = sgrProjection[sgrProjection.length - 1];
    const lastCoppensPoint = coppensIdeal[coppensIdeal.length - 1];

    const currentWeight = lastSgrPoint?.weight || lastMeasurement.weight;
    const coppensExpected = lastCoppensPoint?.weight || currentWeight;
    const deviationPercent = coppensExpected > 0
      ? Math.round(((currentWeight - coppensExpected) / coppensExpected) * 1000) / 10
      : 0;

    // Calculate overall SGR across all measurements
    const overallSGR = measurements.length >= 2
      ? calculateSGR(
          measurements[0].weight,
          measurements[measurements.length - 1].weight,
          Math.round((new Date(measurements[measurements.length - 1].date) - new Date(measurements[0].date)) / (1000 * 60 * 60 * 24))
        )
      : 0;

    res.json({
      poolNumber,
      hasData: true,
      measurements,
      sgrProjection,
      coppensIdeal,
      measurementDates: allDatesRes.rows.map(r => ({
        date: r.date.toISOString().split('T')[0],
        weight: parseFloat(r.avg_weight_gr),
      })),
      stats: {
        currentWeight: Math.round(currentWeight * 10) / 10,
        coppensExpected: Math.round(coppensExpected * 10) / 10,
        deviationPercent,
        avgSGR: Math.round(overallSGR * 1000) / 1000,
        daysTracked: totalDays,
        measurementCount: measurements.length,
        lastMeasured: lastMeasurement.date,
      },
      sortingInfo: lastSortingDate ? {
        lastSortingDate,
        filtered: filteredBySorting,
      } : null,
    });
  } catch (err) {
    console.error('Growth history error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

/**
 * Helper: interpolate weight from Coppens GROWOUT_TABLE feeding day
 */
function getWeightFromFeedingDay(feedingDay) {
  if (feedingDay <= GROWOUT_TABLE[0].feedingDays) return GROWOUT_TABLE[0].avgWeight;
  if (feedingDay >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedingDays) {
    return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight;
  }
  for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
    const lo = GROWOUT_TABLE[i];
    const hi = GROWOUT_TABLE[i + 1];
    if (feedingDay >= lo.feedingDays && feedingDay < hi.feedingDays) {
      const ratio = (feedingDay - lo.feedingDays) / (hi.feedingDays - lo.feedingDays);
      return lo.avgWeight + ratio * (hi.avgWeight - lo.avgWeight);
    }
  }
  return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight;
}

module.exports = router;
