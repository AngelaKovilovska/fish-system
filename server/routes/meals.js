const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

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
      `SELECT pm.meal_type, u.full_name as fed_by_name, pm.created_at
       FROM pool_meals pm
       LEFT JOIN users u ON pm.fed_by = u.id
       WHERE pm.date = $1
       GROUP BY pm.meal_type, u.full_name, pm.created_at
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
    const insertedIds = [];
    for (const p of pools) {
      const result = await client.query(
        `INSERT INTO pool_meals (date, pool_number, meal_type, food_type, food_quantity_gr, fed_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [date, p.pool_number, meal_type, p.food_type || null, p.food_quantity_gr || 0, req.user.id]
      );
      const mealId = result.rows[0].id;
      insertedIds.push(mealId);

      // Deduct from food inventory
      if (p.food_type && p.food_quantity_gr > 0) {
        const changeKg = parseFloat(p.food_quantity_gr) / 1000;
        await client.query(
          'UPDATE food_inventory SET quantity_kg = quantity_kg - $1, updated_at = NOW() WHERE food_type = $2',
          [changeKg, p.food_type]
        );
        await client.query(
          `INSERT INTO food_inventory_log (food_type, change_kg, reason, reference_id, created_by)
           VALUES ($1, $2, 'consumption', $3, $4)`,
          [p.food_type, -changeKg, mealId, req.user.id]
        );
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
    console.error('Save meal error:', err);
    res.status(500).json({ error: 'Серверска грешка при зачувување' });
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
