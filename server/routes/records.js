const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { checkAndCreateAlerts } = require('../services/alertService');
const { validateRecordBody } = require('../middleware/validate');

const router = express.Router();

// GET /api/records - list daily records with pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { from, to, limit = 10, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (from) {
      params.push(from);
      conditions.push(`dr.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`dr.date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM daily_records dr${whereClause}`,
      params.slice()
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results (with alert count)
    let query = `
      SELECT dr.*, u.full_name as checked_by_name,
        COALESCE((SELECT COUNT(*) FROM alerts a WHERE a.daily_record_id = dr.id), 0)::int as alert_count
      FROM daily_records dr
      JOIN users u ON dr.checked_by = u.id
      ${whereClause}
      ORDER BY dr.date DESC
    `;
    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    res.json({ records: result.rows, total });
  } catch (err) {
    console.error('List records error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/records/:id - get full record with all sections
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const record = await pool.query(
      'SELECT dr.*, u.full_name as checked_by_name FROM daily_records dr JOIN users u ON dr.checked_by = u.id WHERE dr.id = $1',
      [id]
    );
    if (record.rows.length === 0) {
      return res.status(404).json({ error: 'Записот не е пронајден' });
    }

    const [water, filtration, fishVisual, feeding, activities, alerts] = await Promise.all([
      pool.query('SELECT * FROM water_control WHERE daily_record_id = $1', [id]),
      pool.query('SELECT * FROM filtration_checks WHERE daily_record_id = $1', [id]),
      pool.query('SELECT * FROM fish_visual WHERE daily_record_id = $1', [id]),
      pool.query('SELECT * FROM pool_feeding WHERE daily_record_id = $1 ORDER BY pool_number', [id]),
      pool.query('SELECT * FROM activities WHERE daily_record_id = $1', [id]),
      pool.query('SELECT * FROM alerts WHERE daily_record_id = $1 ORDER BY created_at', [id]),
    ]);

    res.json({
      record: record.rows[0],
      water_control: water.rows[0] || null,
      filtration_checks: filtration.rows[0] || null,
      fish_visual: fishVisual.rows[0] || null,
      pool_feeding: feeding.rows,
      activities: activities.rows[0] || null,
      alerts: alerts.rows,
    });
  } catch (err) {
    console.error('Get record error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/records - create full daily record (all sections in one transaction)
router.post('/', authMiddleware, validateRecordBody, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { date, water_control, filtration_checks, fish_visual, pool_feeding, activities } = req.body;

    // 1. Create daily record
    const recordResult = await client.query(
      'INSERT INTO daily_records (date, checked_by) VALUES ($1, $2) RETURNING *',
      [date, req.user.id]
    );
    const recordId = recordResult.rows[0].id;

    // 2. Water control
    if (water_control) {
      await client.query(
        `INSERT INTO water_control (daily_record_id, temperature, ph, dissolved_oxygen, nitrates, nitrites, hardness, tds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [recordId, water_control.temperature, water_control.ph, water_control.dissolved_oxygen,
         water_control.nitrates, water_control.nitrites, water_control.hardness, water_control.tds]
      );
    }

    // 3. Filtration checks
    if (filtration_checks) {
      await client.query(
        `INSERT INTO filtration_checks (daily_record_id, bio_filter_level, bio_filter_foam, mechanical_filter, circulation_pump, thermo_pump, aeration, sieve_filter, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [recordId, filtration_checks.bio_filter_level, filtration_checks.bio_filter_foam,
         filtration_checks.mechanical_filter, filtration_checks.circulation_pump,
         filtration_checks.thermo_pump, filtration_checks.aeration,
         filtration_checks.sieve_filter, filtration_checks.notes]
      );
    }

    // 4. Fish visual control
    if (fish_visual) {
      await client.query(
        `INSERT INTO fish_visual (daily_record_id, normal_swimming, no_injuries, no_infection, normal_appetite, no_dead, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [recordId, fish_visual.normal_swimming, fish_visual.no_injuries,
         fish_visual.no_infection, fish_visual.normal_appetite,
         fish_visual.no_dead, fish_visual.notes]
      );
    }

    // 5. Pool feeding (6 pools)
    if (pool_feeding && Array.isArray(pool_feeding)) {
      for (const pf of pool_feeding) {
        // Get current fish count from inventory for this pool
        const invResult = await client.query(
          'SELECT current_count FROM pool_fish_inventory WHERE pool_number = $1',
          [pf.pool_number]
        );
        const currentCount = invResult.rows.length > 0 ? invResult.rows[0].current_count : 0;

        await client.query(
          `INSERT INTO pool_feeding (daily_record_id, pool_number, fish_count, avg_weight_gr, sold_count, dead_count, food_type, food_quantity_gr)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [recordId, pf.pool_number, currentCount, pf.avg_weight_gr,
           pf.sold_count, pf.dead_count, pf.food_type, pf.food_quantity_gr]
        );

        // Deduct dead + sold from fish inventory
        const dead = parseInt(pf.dead_count) || 0;
        const sold = parseInt(pf.sold_count) || 0;
        const totalRemoved = dead + sold;
        if (totalRemoved > 0) {
          await client.query(
            `UPDATE pool_fish_inventory SET current_count = current_count - $1, updated_at = NOW() WHERE pool_number = $2`,
            [totalRemoved, pf.pool_number]
          );
        }

        // Deduct from food inventory
        if (pf.food_type && pf.food_quantity_gr > 0) {
          const changeKg = parseFloat(pf.food_quantity_gr) / 1000;
          await client.query(
            `UPDATE food_inventory SET quantity_kg = quantity_kg - $1, updated_at = NOW() WHERE food_type = $2`,
            [changeKg, pf.food_type]
          );
          await client.query(
            `INSERT INTO food_inventory_log (food_type, change_kg, reason, reference_id, created_by) VALUES ($1, $2, 'consumption', $3, $4)`,
            [pf.food_type, -changeKg, recordId, req.user.id]
          );
        }
      }
    }

    // 6. Activities
    if (activities) {
      await client.query(
        `INSERT INTO activities (daily_record_id, sorting_date, weight_control_date, misc_1, misc_2)
         VALUES ($1, $2, $3, $4, $5)`,
        [recordId, activities.sorting_date || null, activities.weight_control_date || null,
         activities.misc_1, activities.misc_2]
      );
    }

    await client.query('COMMIT');

    // Check norms and create alerts (outside transaction - non-critical)
    let alerts = [];
    try {
      alerts = await checkAndCreateAlerts(recordId, water_control || {}, filtration_checks, fish_visual);
    } catch (alertErr) {
      console.error('Alert check failed:', alertErr);
    }

    res.status(201).json({
      record: recordResult.rows[0],
      alerts,
      message: 'Записот е успешно зачуван',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create record error:', err);
    res.status(500).json({ error: 'Серверска грешка при зачувување' });
  } finally {
    client.release();
  }
});

// PUT /api/records/:id - update full daily record
router.put('/:id', authMiddleware, validateRecordBody, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { date, water_control, filtration_checks, fish_visual, pool_feeding, activities } = req.body;

    // Check record exists
    const existing = await client.query('SELECT * FROM daily_records WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Записот не е пронајден' });
    }

    // Update daily record
    await client.query('UPDATE daily_records SET date = $1, updated_at = NOW() WHERE id = $2', [date, id]);

    // Save original fish counts and compute inventory delta
    const oldFeedingFull = await client.query(
      'SELECT pool_number, fish_count, dead_count, sold_count, food_type, food_quantity_gr FROM pool_feeding WHERE daily_record_id = $1', [id]
    );
    // Build map of original fish_count and old dead+sold per pool
    const oldFeedingMap = {};
    for (const of_ of oldFeedingFull.rows) {
      const oldDead = parseInt(of_.dead_count) || 0;
      const oldSold = parseInt(of_.sold_count) || 0;
      oldFeedingMap[of_.pool_number] = {
        fish_count: of_.fish_count,
        oldRemoved: oldDead + oldSold,
      };
      // Rollback food consumption
      if (of_.food_type && parseFloat(of_.food_quantity_gr) > 0) {
        const rollbackKg = parseFloat(of_.food_quantity_gr) / 1000;
        await client.query(
          `UPDATE food_inventory SET quantity_kg = quantity_kg + $1, updated_at = NOW() WHERE food_type = $2`,
          [rollbackKg, of_.food_type]
        );
      }
    }
    // Remove old consumption logs for this record
    await client.query(
      `DELETE FROM food_inventory_log WHERE reason = 'consumption' AND reference_id = $1`, [id]
    );

    // Delete old sections and re-insert
    await client.query('DELETE FROM water_control WHERE daily_record_id = $1', [id]);
    await client.query('DELETE FROM filtration_checks WHERE daily_record_id = $1', [id]);
    await client.query('DELETE FROM fish_visual WHERE daily_record_id = $1', [id]);
    await client.query('DELETE FROM pool_feeding WHERE daily_record_id = $1', [id]);
    await client.query('DELETE FROM activities WHERE daily_record_id = $1', [id]);
    await client.query('DELETE FROM alerts WHERE daily_record_id = $1', [id]);

    // Re-insert water control
    if (water_control) {
      await client.query(
        `INSERT INTO water_control (daily_record_id, temperature, ph, dissolved_oxygen, nitrates, nitrites, hardness, tds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, water_control.temperature, water_control.ph, water_control.dissolved_oxygen,
         water_control.nitrates, water_control.nitrites, water_control.hardness, water_control.tds]
      );
    }

    // Re-insert filtration checks
    if (filtration_checks) {
      await client.query(
        `INSERT INTO filtration_checks (daily_record_id, bio_filter_level, bio_filter_foam, mechanical_filter, circulation_pump, thermo_pump, aeration, sieve_filter, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, filtration_checks.bio_filter_level, filtration_checks.bio_filter_foam,
         filtration_checks.mechanical_filter, filtration_checks.circulation_pump,
         filtration_checks.thermo_pump, filtration_checks.aeration,
         filtration_checks.sieve_filter, filtration_checks.notes]
      );
    }

    // Re-insert fish visual
    if (fish_visual) {
      await client.query(
        `INSERT INTO fish_visual (daily_record_id, normal_swimming, no_injuries, no_infection, normal_appetite, no_dead, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, fish_visual.normal_swimming, fish_visual.no_injuries,
         fish_visual.no_infection, fish_visual.normal_appetite,
         fish_visual.no_dead, fish_visual.notes]
      );
    }

    // Re-insert pool feeding
    if (pool_feeding && Array.isArray(pool_feeding)) {
      for (const pf of pool_feeding) {
        const toNum = (v) => (v === '' || v == null) ? null : v;
        const qty = toNum(pf.food_quantity_gr);

        // Preserve the original fish_count from when record was first created
        const oldData = oldFeedingMap[pf.pool_number];
        const preservedFishCount = oldData ? oldData.fish_count : 0;

        const newDead = parseInt(pf.dead_count) || 0;
        const newSold = parseInt(pf.sold_count) || 0;
        const newRemoved = newDead + newSold;
        const oldRemoved = oldData ? oldData.oldRemoved : 0;

        await client.query(
          `INSERT INTO pool_feeding (daily_record_id, pool_number, fish_count, avg_weight_gr, sold_count, dead_count, food_type, food_quantity_gr)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, pf.pool_number, preservedFishCount, toNum(pf.avg_weight_gr),
           newSold, newDead, pf.food_type || null, qty]
        );

        // Apply inventory delta: only the difference between old and new dead+sold
        const delta = newRemoved - oldRemoved;
        if (delta !== 0) {
          await client.query(
            `UPDATE pool_fish_inventory SET current_count = current_count - $1, updated_at = NOW() WHERE pool_number = $2`,
            [delta, pf.pool_number]
          );
        }

        // Deduct from food inventory
        if (pf.food_type && qty > 0) {
          const changeKg = parseFloat(qty) / 1000;
          await client.query(
            `UPDATE food_inventory SET quantity_kg = quantity_kg - $1, updated_at = NOW() WHERE food_type = $2`,
            [changeKg, pf.food_type]
          );
          await client.query(
            `INSERT INTO food_inventory_log (food_type, change_kg, reason, reference_id, created_by) VALUES ($1, $2, 'consumption', $3, $4)`,
            [pf.food_type, -changeKg, parseInt(id), req.user.id]
          );
        }
      }
    }

    // Re-insert activities
    if (activities) {
      await client.query(
        `INSERT INTO activities (daily_record_id, sorting_date, weight_control_date, misc_1, misc_2)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, activities.sorting_date || null, activities.weight_control_date || null,
         activities.misc_1, activities.misc_2]
      );
    }

    await client.query('COMMIT');

    // Re-check norms and create alerts
    let alerts = [];
    try {
      alerts = await checkAndCreateAlerts(id, water_control || {}, filtration_checks, fish_visual);
    } catch (alertErr) {
      console.error('Alert check failed:', alertErr);
    }

    res.json({
      record: existing.rows[0],
      alerts,
      message: 'Записот е успешно ажуриран',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update record error:', err);
    res.status(500).json({ error: 'Серверска грешка при ажурирање' });
  } finally {
    client.release();
  }
});

// DELETE /api/records/:id - delete daily record (cascades to all sections)
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    // Rollback fish inventory before deleting (add back dead + sold)
    const feeding = await client.query(
      'SELECT pool_number, dead_count, sold_count FROM pool_feeding WHERE daily_record_id = $1', [id]
    );
    for (const pf of feeding.rows) {
      const totalRemoved = (parseInt(pf.dead_count) || 0) + (parseInt(pf.sold_count) || 0);
      if (totalRemoved > 0) {
        await client.query(
          `UPDATE pool_fish_inventory SET current_count = current_count + $1, updated_at = NOW() WHERE pool_number = $2`,
          [totalRemoved, pf.pool_number]
        );
      }
    }

    const result = await client.query('DELETE FROM daily_records WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Записот не е пронајден' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Записот е успешно избришан' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete record error:', err);
    res.status(500).json({ error: 'Серверска грешка при бришење' });
  } finally {
    client.release();
  }
});

module.exports = router;
