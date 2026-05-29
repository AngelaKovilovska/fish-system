const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();

// GET /api/food-inventory - get current stock levels (purchased - consumed from meals)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        fi.id, fi.food_type, fi.updated_at,
        COALESCE(p.purchased_kg, 0)::numeric(10,2) as total_purchased_kg,
        COALESCE(c.consumed_kg, 0)::numeric(10,2) as total_consumed_kg,
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
        SELECT food_type, SUM(food_quantity_gr) / 1000.0 as consumed_kg
        FROM pool_meals
        WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
        GROUP BY food_type
      ) c ON c.food_type = fi.food_type
      ORDER BY CASE fi.food_type
        WHEN 'Advance (1.5mm)' THEN 1
        WHEN 'Pregrower-15 (2mm)' THEN 2
        WHEN 'SpecialPro EF (3mm)' THEN 3
        WHEN 'Grower-13EF (3mm)' THEN 4
        WHEN 'Grower-13EF (4.5mm)' THEN 5
        WHEN 'Grower-13EF (6mm)' THEN 6
        ELSE 7
      END
    `);
    res.json({ inventory: result.rows });
  } catch (err) {
    console.error('Get food inventory error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/food-inventory/purchase - add purchased food (admin only)
// Supports both single item { food_type, quantity_kg, purchase_date, supplier, document_number }
// and multi-item { items: [{ food_type, quantity_kg }], purchase_date, supplier, document_number }
router.post('/purchase', authMiddleware, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { supplier, document_number, purchase_date } = req.body;
    const date = purchase_date || new Date().toISOString().split('T')[0];

    // Normalize to items array
    let items;
    if (req.body.items && Array.isArray(req.body.items)) {
      items = req.body.items.filter(it => it.food_type && it.quantity_kg > 0);
    } else if (req.body.food_type && req.body.quantity_kg > 0) {
      items = [{ food_type: req.body.food_type, quantity_kg: req.body.quantity_kg }];
    } else {
      return res.status(400).json({ error: 'Внесете барем еден тип храна со количина > 0' });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'Внесете барем еден тип храна со количина > 0' });
    }

    await client.query('BEGIN');

    for (const item of items) {
      // Upsert inventory
      await client.query(
        `INSERT INTO food_inventory (food_type, quantity_kg, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (food_type) DO UPDATE SET
           quantity_kg = food_inventory.quantity_kg + $2,
           updated_at = NOW()`,
        [item.food_type, item.quantity_kg]
      );

      // Log the purchase with supplier/doc info
      await client.query(
        `INSERT INTO food_inventory_log (food_type, change_kg, reason, created_by, purchased_at, supplier, document_number)
         VALUES ($1, $2, 'purchase', $3, $4, $5, $6)`,
        [item.food_type, item.quantity_kg, req.user.id, date, supplier || null, document_number || null]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Набавката е додадена', count: items.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Purchase error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// PUT /api/food-inventory/purchase/:id - edit a purchase entry (admin only)
router.put('/purchase/:id', authMiddleware, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { food_type, quantity_kg, purchase_date, supplier, document_number } = req.body;

    if (!quantity_kg || quantity_kg <= 0) {
      return res.status(400).json({ error: 'Количината мора да е поголема од 0' });
    }

    // Get the old entry first
    const old = await client.query(
      'SELECT * FROM food_inventory_log WHERE id = $1 AND reason = $2',
      [id, 'purchase']
    );
    if (old.rows.length === 0) {
      return res.status(404).json({ error: 'Набавката не е пронајдена' });
    }
    const oldEntry = old.rows[0];

    await client.query('BEGIN');

    // Update the log entry
    await client.query(
      `UPDATE food_inventory_log
       SET food_type = COALESCE($1, food_type),
           change_kg = $2,
           purchased_at = COALESCE($3, purchased_at),
           supplier = COALESCE($4, supplier),
           document_number = COALESCE($5, document_number)
       WHERE id = $6 AND reason = 'purchase'`,
      [food_type || oldEntry.food_type, quantity_kg, purchase_date || oldEntry.purchased_at,
       supplier !== undefined ? supplier : oldEntry.supplier,
       document_number !== undefined ? document_number : oldEntry.document_number, id]
    );

    // Update inventory updated_at timestamps
    const newFoodType = food_type || oldEntry.food_type;
    await client.query(
      'UPDATE food_inventory SET updated_at = NOW() WHERE food_type = $1',
      [oldEntry.food_type]
    );
    if (newFoodType !== oldEntry.food_type) {
      await client.query(
        'UPDATE food_inventory SET updated_at = NOW() WHERE food_type = $1',
        [newFoodType]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Набавката е ажурирана' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update purchase error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// DELETE /api/food-inventory/purchase/:id - delete a purchase entry (admin only)
router.delete('/purchase/:id', authMiddleware, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const old = await client.query(
      'SELECT * FROM food_inventory_log WHERE id = $1 AND reason = $2',
      [id, 'purchase']
    );
    if (old.rows.length === 0) {
      return res.status(404).json({ error: 'Набавката не е пронајдена' });
    }

    await client.query('BEGIN');

    await client.query(
      "DELETE FROM food_inventory_log WHERE id = $1 AND reason = 'purchase'",
      [id]
    );

    // Update inventory updated_at
    await client.query(
      'UPDATE food_inventory SET updated_at = NOW() WHERE food_type = $1',
      [old.rows[0].food_type]
    );

    await client.query('COMMIT');
    res.json({ message: 'Набавката е избришана' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete purchase error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// GET /api/food-inventory/log - get inventory change history (aggregated by day)
router.get('/log', authMiddleware, async (req, res) => {
  try {
    const { days = 3 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    const sinceStr = since.toISOString().split('T')[0];

    // Purchases from log (individual entries)
    const purchases = await pool.query(
      `SELECT fil.id, fil.food_type, fil.change_kg, fil.reason,
              fil.purchased_at as date, u.full_name as created_by_name,
              fil.supplier, fil.document_number
       FROM food_inventory_log fil
       LEFT JOIN users u ON fil.created_by = u.id
       WHERE fil.reason = 'purchase' AND fil.purchased_at >= $1
       ORDER BY fil.purchased_at DESC, fil.created_at DESC`,
      [sinceStr]
    );
    // Consumption aggregated by day + food_type from pool_meals
    const consumption = await pool.query(
      `SELECT date, food_type,
              SUM(food_quantity_gr)::float / 1000.0 as change_kg,
              'consumption' as reason
       FROM pool_meals
       WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
         AND date >= $1
       GROUP BY date, food_type
       ORDER BY date DESC`,
      [sinceStr]
    );
    // Merge and sort by date descending
    const log = [
      ...purchases.rows.map(r => ({ ...r, change_kg: parseFloat(r.change_kg) })),
      ...consumption.rows.map(r => ({ ...r, change_kg: -parseFloat(r.change_kg) })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ log });
  } catch (err) {
    console.error('Get food log error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/food-inventory/projection - project when each food type runs out based on actual meal consumption
router.get('/projection', authMiddleware, async (req, res) => {
  try {
    const periodDays = parseInt(req.query.days) || 14;

    // 1. Current stock (same calculation as GET /)
    const stockResult = await pool.query(`
      SELECT
        fi.food_type,
        GREATEST(0,
          COALESCE(p.purchased_kg, 0) -
          COALESCE(c.consumed_kg, 0)
        )::numeric(10,2) as current_stock_kg
      FROM food_inventory fi
      LEFT JOIN (
        SELECT food_type, SUM(change_kg) as purchased_kg
        FROM food_inventory_log WHERE reason = 'purchase'
        GROUP BY food_type
      ) p ON p.food_type = fi.food_type
      LEFT JOIN (
        SELECT food_type, SUM(food_quantity_gr) / 1000.0 as consumed_kg
        FROM pool_meals
        WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
        GROUP BY food_type
      ) c ON c.food_type = fi.food_type
    `);

    // 2. Actual consumption from pool_meals over the last N days
    const consumptionResult = await pool.query(`
      SELECT
        food_type,
        SUM(food_quantity_gr) / 1000.0 as total_consumed_kg,
        COUNT(DISTINCT date) as active_days,
        MIN(date) as first_date,
        MAX(date) as last_date
      FROM pool_meals
      WHERE food_quantity_gr > 0
        AND food_type IS NOT NULL AND food_type != ''
        AND date >= CURRENT_DATE - $1::int
      GROUP BY food_type
    `, [periodDays]);

    // Build consumption lookup
    const consumptionMap = {};
    for (const row of consumptionResult.rows) {
      consumptionMap[row.food_type] = {
        totalConsumedKg: parseFloat(row.total_consumed_kg),
        activeDays: parseInt(row.active_days),
        firstDate: row.first_date,
        lastDate: row.last_date,
      };
    }

    // 3. Build projections
    const today = new Date();
    const projections = stockResult.rows.map(item => {
      const currentStockKg = parseFloat(item.current_stock_kg);
      const consumption = consumptionMap[item.food_type];

      if (!consumption || consumption.activeDays === 0) {
        return {
          food_type: item.food_type,
          currentStockKg,
          avgDailyConsumptionKg: 0,
          daysLeft: null,
          depletionDate: null,
          status: currentStockKg > 0 ? 'unused' : 'empty',
          activeDaysUsed: 0,
          periodDays,
        };
      }

      const avgDailyKg = consumption.totalConsumedKg / consumption.activeDays;
      const daysLeft = avgDailyKg > 0 ? Math.floor(currentStockKg / avgDailyKg) : null;

      let depletionDate = null;
      if (daysLeft !== null) {
        const d = new Date(today);
        d.setDate(d.getDate() + daysLeft);
        depletionDate = d.toISOString().split('T')[0];
      }

      let status = 'ok';
      if (daysLeft !== null) {
        if (daysLeft <= 0) status = 'depleted';
        else if (daysLeft <= 7) status = 'critical';
        else if (daysLeft <= 14) status = 'warning';
      }

      return {
        food_type: item.food_type,
        currentStockKg,
        avgDailyConsumptionKg: Math.round(avgDailyKg * 1000) / 1000,
        daysLeft,
        depletionDate,
        status,
        activeDaysUsed: consumption.activeDays,
        periodDays,
      };
    });

    // Sort: most urgent first (depleted, critical, warning, ok, unused)
    const statusOrder = { depleted: 0, critical: 1, warning: 2, ok: 3, unused: 4, empty: 5 };
    projections.sort((a, b) => {
      const oa = statusOrder[a.status] ?? 9;
      const ob = statusOrder[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
      return 0;
    });

    res.json({ projections, generatedAt: today.toISOString() });
  } catch (err) {
    console.error('Food projection error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
