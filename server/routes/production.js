const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const inv = require('../lib/inventory');

const router = express.Router();

// Generate LOT number: YYMMDD-P (date + pool number)
function generateLotNumber(productionDate, sourcePool) {
  const d = productionDate ? new Date(productionDate + 'T00:00:00') : new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}-${sourcePool || 0}`;
}

// GET /api/production - list all batches
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, limit, offset, from, to } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status) {
      where += ` AND pb.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (from) {
      where += ` AND pb.production_date >= $${idx}`;
      params.push(from);
      idx++;
    }
    if (to) {
      where += ` AND pb.production_date <= $${idx}`;
      params.push(to);
      idx++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM production_batches pb ${where}`,
      params
    );

    const lim = parseInt(limit) || 50;
    const off = parseInt(offset) || 0;

    const result = await pool.query(
      `SELECT pb.*, u.full_name as created_by_name,
        (SELECT json_agg(json_build_object(
          'id', pi.id,
          'product_type_id', pi.product_type_id,
          'quantity_kg', pi.quantity_kg,
          'code', pt.code,
          'name', pt.name
        ))
        FROM production_items pi
        JOIN product_types pt ON pt.id = pi.product_type_id
        WHERE pi.batch_id = pb.id) as items
       FROM production_batches pb
       LEFT JOIN users u ON u.id = pb.created_by
       ${where}
       ORDER BY pb.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, lim, off]
    );

    res.json({
      batches: result.rows,
      total: parseInt(countResult.rows[0].total)
    });
  } catch (err) {
    console.error('Get production batches error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/production/inventory - product inventory overview
// (must be before /:id to avoid matching "inventory" as an id)
router.get('/inventory', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pi.*, pt.code, pt.name, pt.price_per_unit, pt.unit, pt.min_stock_kg,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'lot_number', pl.lot_number, 'quantity_kg', pl.quantity_kg, 'initial_kg', pl.initial_kg,
                  'production_date', pl.production_date, 'expiry_date', pl.expiry_date, 'batch_id', pl.batch_id
                ) ORDER BY pl.production_date NULLS LAST, pl.id)
                FROM product_lots pl
                WHERE pl.product_type_id = pi.product_type_id AND pl.quantity_kg > 0
              ), '[]'::json) AS lots
       FROM product_inventory pi
       JOIN product_types pt ON pt.id = pi.product_type_id
       WHERE pt.is_active = true
       ORDER BY pt.sort_order`
    );
    res.json({ inventory: result.rows });
  } catch (err) {
    console.error('Get product inventory error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/production/inventory/reset - manual inventory count (попис)
router.put('/inventory/reset', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Потребни се ставки' });
    }

    await client.query('BEGIN');

    for (const item of items) {
      const qty = parseFloat(item.quantity_kg);
      if (isNaN(qty) || qty < 0) continue;
      await inv.adjustToTotal(client, item.product_type_id, qty);
    }

    await client.query('COMMIT');
    res.json({ message: 'Залихата е ажурирана' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset inventory error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// GET /api/production/:id - single batch with items
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const batch = await pool.query(
      `SELECT pb.*, u.full_name as created_by_name
       FROM production_batches pb
       LEFT JOIN users u ON u.id = pb.created_by
       WHERE pb.id = $1`,
      [req.params.id]
    );
    if (batch.rows.length === 0) return res.status(404).json({ error: 'Серијата не е пронајдена' });

    const items = await pool.query(
      `SELECT pi.*, pt.code, pt.name, pt.price_per_unit
       FROM production_items pi
       JOIN product_types pt ON pt.id = pi.product_type_id
       WHERE pi.batch_id = $1
       ORDER BY pt.sort_order`,
      [req.params.id]
    );

    res.json({ ...batch.rows[0], items: items.rows });
  } catch (err) {
    console.error('Get production batch error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/production - create new production batch
// Supports creating with items and completing in one step
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { source_pool, fish_count, total_weight_kg, notes, items, complete, production_date } = req.body;
    const lot_number = generateLotNumber(production_date, source_pool);

    await client.query('BEGIN');

    const status = complete ? 'завршено' : 'чиста_вода';

    const result = await client.query(
      `INSERT INTO production_batches (lot_number, source_pool, fish_count, total_weight_kg, notes, created_by, status, finished_at, production_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${complete ? 'NOW()' : 'NULL'}, $8) RETURNING *`,
      [lot_number, source_pool || null, parseInt(fish_count) || 0, parseFloat(total_weight_kg) || 0, notes || null, req.user.id, status, production_date || new Date().toISOString().slice(0, 10)]
    );

    const batchId = result.rows[0].id;

    // Subtract fish from pool inventory
    const fishCount = parseInt(fish_count) || 0;
    if (source_pool && fishCount > 0) {
      await client.query(
        `UPDATE pool_fish_inventory
         SET current_count = GREATEST(0, current_count - $1), updated_at = NOW()
         WHERE pool_number = $2`,
        [fishCount, source_pool]
      );
    }

    // Insert items if provided
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const qty = parseFloat(item.quantity_kg);
        if (qty > 0) {
          await client.query(
            'INSERT INTO production_items (batch_id, product_type_id, quantity_kg) VALUES ($1, $2, $3)',
            [batchId, item.product_type_id, qty]
          );

          // Add to LOT inventory if completing
          if (complete) {
            await inv.addToLot(client, {
              productTypeId: item.product_type_id, lotNumber: lot_number, batchId,
              productionDate: result.rows[0].production_date, qty,
            });
          }
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create production batch error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// PUT /api/production/:id - update batch info and items (with inventory adjustment)
router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { source_pool, fish_count, total_weight_kg, notes, items, production_date } = req.body;

    const batch = await client.query('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
    if (batch.rows.length === 0) return res.status(404).json({ error: 'Серијата не е пронајдена' });

    const isFinished = batch.rows[0].status === 'завршено';

    const oldPool = batch.rows[0].source_pool;
    const oldFishCount = parseInt(batch.rows[0].fish_count) || 0;
    const newPool = source_pool || oldPool;
    const newFishCount = parseInt(fish_count) || 0;

    await client.query('BEGIN');

    // Adjust pool fish inventory if pool or fish count changed
    if (oldPool && oldFishCount > 0) {
      // Return old fish to old pool
      await client.query(
        `UPDATE pool_fish_inventory
         SET current_count = current_count + $1, updated_at = NOW()
         WHERE pool_number = $2`,
        [oldFishCount, oldPool]
      );
    }
    if (newPool && newFishCount > 0) {
      // Subtract new fish from new pool
      await client.query(
        `UPDATE pool_fish_inventory
         SET current_count = GREATEST(0, current_count - $1), updated_at = NOW()
         WHERE pool_number = $2`,
        [newFishCount, newPool]
      );
    }

    // Regenerate LOT number when date or pool changes
    const newLot = generateLotNumber(production_date || batch.rows[0].production_date, source_pool || batch.rows[0].source_pool);

    // Update batch info
    await client.query(
      `UPDATE production_batches
       SET source_pool = $1, fish_count = $2, total_weight_kg = $3, notes = $4, production_date = $5, lot_number = $6, updated_at = NOW()
       WHERE id = $7`,
      [source_pool || null, newFishCount, parseFloat(total_weight_kg) || 0, notes || null, production_date || null, newLot, req.params.id]
    );

    // Update items if provided
    const newProdDate = production_date || batch.rows[0].production_date;
    if (items && Array.isArray(items)) {
      await client.query('DELETE FROM production_items WHERE batch_id = $1', [req.params.id]);
      for (const item of items) {
        const qty = parseFloat(item.quantity_kg);
        if (qty > 0) {
          await client.query(
            'INSERT INTO production_items (batch_id, product_type_id, quantity_kg) VALUES ($1, $2, $3)',
            [req.params.id, item.product_type_id, qty]
          );
        }
      }
    }

    // Keep LOT inventory in sync for finished batches (also renames LOT if date/pool changed)
    if (isFinished) {
      const currentItems = await client.query(
        'SELECT product_type_id, quantity_kg FROM production_items WHERE batch_id = $1', [req.params.id]
      );
      await inv.setBatchLots(client, {
        batchId: parseInt(req.params.id), lotNumber: newLot, productionDate: newProdDate, items: currentItems.rows,
      });
      if (newLot !== batch.rows[0].lot_number) {
        await client.query('UPDATE sale_items SET lot_number = $1 WHERE lot_number = $2', [newLot, batch.rows[0].lot_number]);
        await client.query('UPDATE sales SET lot_number = $1 WHERE lot_number = $2', [newLot, batch.rows[0].lot_number]);
      }
    }

    await client.query('COMMIT');

    // Return updated batch
    const updated = await pool.query(
      `SELECT pb.*, u.full_name as created_by_name
       FROM production_batches pb
       LEFT JOIN users u ON u.id = pb.created_by
       WHERE pb.id = $1`,
      [req.params.id]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Update production batch error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// PUT /api/production/:id/status - advance status
router.put('/:id/status', authMiddleware, async (req, res) => {
  const STATUS_ORDER = ['чиста_вода', 'колење', 'обработка', 'пакување', 'завршено'];
  const client = await pool.connect();
  try {
    const { status } = req.body;
    if (!STATUS_ORDER.includes(status)) {
      return res.status(400).json({ error: 'Невалиден статус' });
    }

    await client.query('BEGIN');

    const batch = await client.query('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
    if (batch.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Серијата не е пронајдена' });
    }

    const currentIdx = STATUS_ORDER.indexOf(batch.rows[0].status);
    const newIdx = STATUS_ORDER.indexOf(status);

    if (newIdx <= currentIdx) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Статусот може само да се унапреди' });
    }

    let finishedClause = '';

    // When finishing, add products to inventory
    if (status === 'завршено') {
      finishedClause = ', finished_at = NOW()';

      const items = await client.query(
        'SELECT product_type_id, quantity_kg FROM production_items WHERE batch_id = $1',
        [req.params.id]
      );

      for (const item of items.rows) {
        await inv.addToLot(client, {
          productTypeId: item.product_type_id, lotNumber: batch.rows[0].lot_number,
          batchId: batch.rows[0].id, productionDate: batch.rows[0].production_date, qty: item.quantity_kg,
        });
      }
    }

    const result = await client.query(
      `UPDATE production_batches SET status = $1, updated_at = NOW() ${finishedClause} WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update production status error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// POST /api/production/:id/items - add/update production items
router.post('/:id/items', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Потребни се ставки' });
    }

    const batch = await client.query('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
    if (batch.rows.length === 0) return res.status(404).json({ error: 'Серијата не е пронајдена' });

    await client.query('BEGIN');

    // Remove old items
    await client.query('DELETE FROM production_items WHERE batch_id = $1', [req.params.id]);

    // Insert new items
    for (const item of items) {
      if (parseFloat(item.quantity_kg) > 0) {
        await client.query(
          'INSERT INTO production_items (batch_id, product_type_id, quantity_kg) VALUES ($1, $2, $3)',
          [req.params.id, item.product_type_id, parseFloat(item.quantity_kg)]
        );
      }
    }

    if (batch.rows[0].status === 'завршено') {
      await inv.setBatchLots(client, {
        batchId: batch.rows[0].id, lotNumber: batch.rows[0].lot_number,
        productionDate: batch.rows[0].production_date, items,
      });
    }

    await client.query('COMMIT');

    // Return updated items
    const updated = await pool.query(
      `SELECT pi.*, pt.code, pt.name
       FROM production_items pi
       JOIN product_types pt ON pt.id = pi.product_type_id
       WHERE pi.batch_id = $1
       ORDER BY pt.sort_order`,
      [req.params.id]
    );

    res.json({ items: updated.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Update production items error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// DELETE /api/production/:id - delete batch (rollback inventory if finished)
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const batch = await client.query('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
    if (batch.rows.length === 0) return res.status(404).json({ error: 'Серијата не е пронајдена' });

    await client.query('BEGIN');

    // Return fish to pool
    const delPool = batch.rows[0].source_pool;
    const delFishCount = parseInt(batch.rows[0].fish_count) || 0;
    if (delPool && delFishCount > 0) {
      await client.query(
        `UPDATE pool_fish_inventory
         SET current_count = current_count + $1, updated_at = NOW()
         WHERE pool_number = $2`,
        [delFishCount, delPool]
      );
    }

    // Rollback LOT inventory if batch was finished (blocked when part is already sold)
    if (batch.rows[0].status === 'завршено') {
      const sold = await inv.soldFromBatch(client, req.params.id);
      if (sold.length > 0) {
        await client.query('ROLLBACK');
        const totalSold = sold.reduce((s, r) => s + parseFloat(r.sold), 0);
        return res.status(400).json({
          error: `Серијата не може да се избрише: од LOT ${batch.rows[0].lot_number} веќе се продадени ${totalSold.toFixed(2)} кг`,
        });
      }
      const lots = await client.query('SELECT DISTINCT product_type_id FROM product_lots WHERE batch_id = $1', [req.params.id]);
      await client.query('DELETE FROM product_lots WHERE batch_id = $1', [req.params.id]);
      for (const r of lots.rows) await inv.syncInventory(client, r.product_type_id);
    }

    await client.query('DELETE FROM production_batches WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Серијата е избришана' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete production batch error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

module.exports = router;
