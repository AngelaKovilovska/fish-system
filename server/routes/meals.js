const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

// GET /api/meals/history?limit=30&offset=0 - list dates that have meals (for history page)
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;
    const from = req.query.from || '';
    const to = req.query.to || '';

    let dateFilter = '';
    const params = [];
    let paramIdx = 1;

    if (from) {
      dateFilter += ` AND pm.date >= $${paramIdx}`;
      params.push(from);
      paramIdx++;
    }
    if (to) {
      dateFilter += ` AND pm.date <= $${paramIdx}`;
      params.push(to);
      paramIdx++;
    }

    // Count total dates
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT pm.date) as total
       FROM pool_meals pm
       WHERE 1=1 ${dateFilter}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get dates with meal summary
    const result = await pool.query(
      `SELECT
         pm.date,
         array_agg(DISTINCT pm.meal_type) as meal_types,
         (SELECT u.full_name FROM pool_meals pm2 LEFT JOIN users u ON pm2.fed_by = u.id WHERE pm2.date = pm.date LIMIT 1) as fed_by_name,
         SUM(pm.food_quantity_gr) as total_food_gr
       FROM pool_meals pm
       WHERE 1=1 ${dateFilter}
       GROUP BY pm.date
       ORDER BY pm.date DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      dates: result.rows.map(r => ({
        date: r.date,
        meal_types: r.meal_types,
        meals_count: r.meal_types.length,
        fed_by_name: r.fed_by_name,
        total_food_gr: parseFloat(r.total_food_gr) || 0,
      })),
      total,
    });
  } catch (err) {
    console.error('Get meal history error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/meals/last-values - get last entered values per pool from the most recent meal (any type)
router.get('/last-values', authMiddleware, async (req, res) => {
  try {
    // Find the most recent meal entry (any type) with actual data
    const lastEntry = await pool.query(
      `SELECT date, meal_type FROM pool_meals
       WHERE food_type IS NOT NULL AND food_quantity_gr > 0
       ORDER BY date DESC, CASE meal_type WHEN 'dinner' THEN 3 WHEN 'lunch' THEN 2 WHEN 'breakfast' THEN 1 END DESC
       LIMIT 1`
    );

    if (lastEntry.rows.length === 0) {
      return res.json({ pools: [], lastDate: null });
    }

    const date = lastEntry.rows[0].date;
    const mealType = lastEntry.rows[0].meal_type;

    const result = await pool.query(
      `SELECT pool_number, food_type, food_quantity_gr
       FROM pool_meals
       WHERE date = $1 AND meal_type = $2
       ORDER BY pool_number, id`,
      [date, mealType]
    );

    // Group by pool_number → foods array (supports multi-food per pool)
    const poolMap = {};
    for (const row of result.rows) {
      if (!poolMap[row.pool_number]) {
        poolMap[row.pool_number] = { pool_number: row.pool_number, foods: [] };
      }
      poolMap[row.pool_number].foods.push({
        food_type: row.food_type,
        food_quantity_gr: row.food_quantity_gr,
      });
    }

    // Also include legacy flat fields for backward compatibility
    const pools = Object.values(poolMap).map(p => ({
      ...p,
      food_type: p.foods[0]?.food_type || null,
      food_quantity_gr: p.foods[0]?.food_quantity_gr || 0,
    }));

    res.json({ pools, lastDate: date });
  } catch (err) {
    console.error('Get last meal values error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/meals?date=YYYY-MM-DD - get all meals for a date
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Потребен е датум' });

    const result = await pool.query(
      `SELECT pm.*, u.full_name as fed_by_name
       FROM pool_meals pm
       LEFT JOIN users u ON pm.fed_by = u.id
       WHERE pm.date = $1
       ORDER BY pm.meal_type, pm.pool_number`,
      [date]
    );

    res.json({ meals: result.rows });
  } catch (err) {
    console.error('Get meals error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/meals/status?date=YYYY-MM-DD - quick status for dashboard
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Потребен е датум' });

    const result = await pool.query(
      `SELECT pm.meal_type,
              (SELECT u.full_name FROM users u WHERE u.id = (array_agg(pm.fed_by))[1]) as fed_by_name,
              MIN(pm.created_at) as created_at
       FROM pool_meals pm
       WHERE pm.date = $1
       GROUP BY pm.meal_type
       ORDER BY pm.meal_type`,
      [date]
    );

    const status = {};
    for (const type of VALID_MEAL_TYPES) {
      const row = result.rows.find(r => r.meal_type === type);
      status[type] = row
        ? { filled: true, fed_by_name: row.fed_by_name, created_at: row.created_at }
        : { filled: false };
    }

    res.json({ status });
  } catch (err) {
    console.error('Meals status error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/meals - save/update a meal (upsert)
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const { date, meal_type, pools } = req.body;

    if (!date || !meal_type || !pools || !Array.isArray(pools)) {
      return res.status(400).json({ error: 'Невалидни податоци' });
    }
    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({ error: 'Невалиден тип на оброк' });
    }

    await client.query('BEGIN');

    // Rollback old food from inventory if meal already exists
    const oldMeals = await client.query(
      'SELECT food_type, food_quantity_gr FROM pool_meals WHERE date = $1 AND meal_type = $2',
      [date, meal_type]
    );
    for (const old of oldMeals.rows) {
      if (old.food_type && parseFloat(old.food_quantity_gr) > 0) {
        const rollbackKg = parseFloat(old.food_quantity_gr) / 1000;
        await client.query(
          'UPDATE food_inventory SET quantity_kg = quantity_kg + $1, updated_at = NOW() WHERE food_type = $2',
          [rollbackKg, old.food_type]
        );
      }
    }

    // Delete old consumption logs for this meal
    await client.query(
      `DELETE FROM food_inventory_log WHERE reason = 'consumption' AND reference_id IN (
        SELECT id FROM pool_meals WHERE date = $1 AND meal_type = $2
      )`,
      [date, meal_type]
    );

    // Delete old meal entries
    await client.query(
      'DELETE FROM pool_meals WHERE date = $1 AND meal_type = $2',
      [date, meal_type]
    );

    // Insert new meal entries
    // Supports both formats:
    //   Legacy: pools = [{ pool_number, food_type, food_quantity_gr }]
    //   Multi-food: pools = [{ pool_number, foods: [{ food_type, food_quantity_gr }] }]
    const insertedIds = [];
    for (const p of pools) {
      // Normalize to foods array (backward compatible with single food_type)
      const foods = Array.isArray(p.foods) && p.foods.length > 0
        ? p.foods
        : [{ food_type: p.food_type, food_quantity_gr: p.food_quantity_gr }];

      for (const food of foods) {
        const foodType = food.food_type || null;
        const foodQty = parseFloat(food.food_quantity_gr) || 0;

        // Skip completely empty entries (no type and no quantity)
        if (!foodType && foodQty <= 0) continue;

        const result = await client.query(
          `INSERT INTO pool_meals (date, pool_number, meal_type, food_type, food_quantity_gr, fed_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [date, p.pool_number, meal_type, foodType, foodQty, req.user.id]
        );
        const mealId = result.rows[0].id;
        insertedIds.push(mealId);

        // Deduct from food inventory
        if (foodType && foodQty > 0) {
          const changeKg = foodQty / 1000;
          await client.query(
            'UPDATE food_inventory SET quantity_kg = GREATEST(0, quantity_kg - $1), updated_at = NOW() WHERE food_type = $2',
            [changeKg, foodType]
          );
          await client.query(
            `INSERT INTO food_inventory_log (food_type, change_kg, reason, reference_id, created_by)
             VALUES ($1, $2, 'consumption', $3, $4)`,
            [foodType, -changeKg, mealId, req.user.id]
          );
        }
      }
    }

    await client.query('COMMIT');

    // Check if all 3 meals + checklist are complete → auto-send report
    try {
      await checkAndAutoSendReport(date, req);
    } catch (e) {
      console.error('Auto-send report check failed:', e);
    }

    res.status(201).json({ message: 'Оброкот е зачуван', mealIds: insertedIds });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save meal error:', err.message, err.detail || '', err.constraint || '');
    // Provide more specific error for unique constraint violations
    if (err.code === '23505') {
      res.status(409).json({
        error: 'Дупликат запис — миграцијата 011 не е применета. Рестартирајте го серверот за да се примени.',
      });
    } else {
      res.status(500).json({ error: 'Серверска грешка при зачувување' });
    }
  } finally {
    client.release();
  }
});

// DELETE /api/meals - delete a meal (rollback inventory)
router.delete('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    // Поддржи и query params и body (некои HTTP клиенти не праќаат body со DELETE)
    const date = req.query.date || req.body?.date;
    const meal_type = req.query.meal_type || req.body?.meal_type;

    if (!date || !meal_type) {
      return res.status(400).json({ error: 'Потребни се датум и тип на оброк' });
    }
    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({ error: 'Невалиден тип на оброк' });
    }

    await client.query('BEGIN');

    // Rollback food from inventory
    const oldMeals = await client.query(
      'SELECT id, food_type, food_quantity_gr FROM pool_meals WHERE date = $1 AND meal_type = $2',
      [date, meal_type]
    );

    if (oldMeals.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Оброкот не е пронајден' });
    }

    for (const old of oldMeals.rows) {
      if (old.food_type && parseFloat(old.food_quantity_gr) > 0) {
        const rollbackKg = parseFloat(old.food_quantity_gr) / 1000;
        await client.query(
          'UPDATE food_inventory SET quantity_kg = quantity_kg + $1, updated_at = NOW() WHERE food_type = $2',
          [rollbackKg, old.food_type]
        );
      }
    }

    // Delete consumption logs
    await client.query(
      `DELETE FROM food_inventory_log WHERE reason = 'consumption' AND reference_id IN (
        SELECT id FROM pool_meals WHERE date = $1 AND meal_type = $2
      )`,
      [date, meal_type]
    );

    // Delete meal entries
    await client.query(
      'DELETE FROM pool_meals WHERE date = $1 AND meal_type = $2',
      [date, meal_type]
    );

    await client.query('COMMIT');

    res.json({ message: 'Оброкот е избришан' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete meal error:', err);
    res.status(500).json({ error: 'Серверска грешка при бришење' });
  } finally {
    client.release();
  }
});

// Helper: check if checklist + all 3 meals are done, then auto-send daily report
async function checkAndAutoSendReport(date, req) {
  // Check if daily record exists for this date
  const recordResult = await pool.query(
    'SELECT id FROM daily_records WHERE date = $1',
    [date]
  );
  if (recordResult.rows.length === 0) return; // no checklist yet

  // Check if all 3 meals are filled
  const mealsResult = await pool.query(
    'SELECT DISTINCT meal_type FROM pool_meals WHERE date = $1',
    [date]
  );
  const filledMeals = mealsResult.rows.map(r => r.meal_type);
  const allMealsFilled = VALID_MEAL_TYPES.every(t => filledMeals.includes(t));
  if (!allMealsFilled) return; // not all meals yet

  // Check if report was already sent (avoid duplicate sends)
  const recordId = recordResult.rows[0].id;
  const logCheck = await pool.query(
    `SELECT id FROM food_inventory_log WHERE reason = 'report_sent' AND reference_id = $1 LIMIT 1`,
    [recordId]
  );
  if (logCheck.rows.length > 0) return; // already sent

  // Mark as sent
  await pool.query(
    `INSERT INTO food_inventory_log (food_type, change_kg, reason, reference_id, created_by)
     VALUES ('_report_sent', 0, 'report_sent', $1, $2)`,
    [recordId, req.user.id]
  );

  // Send report
  const { sendReportEmail } = require('../services/emailService');
  const reportService = require('../services/reportService');
  const reportsModule = require('./reports');

  // Use internal report sending - call the endpoint logic directly
  try {
    const { getDailyReportData, generateExcel, generatePDF, PARAMETER_LABELS } = reportService;
    const data = await getDailyReportData(recordId);
    if (!data.record) return;

    // Get user email
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const recipientEmail = userResult.rows[0]?.email;
    if (!recipientEmail) return;

    // We'll rely on the report endpoint being called manually or via the dashboard
    // For now, just log that the report is ready
    console.log(`Daily report ready for ${date} (record ${recordId}) - all meals complete`);
  } catch (e) {
    console.error('Auto-send report error:', e);
  }
}

module.exports = router;
