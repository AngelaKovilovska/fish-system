const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Status workflow order
const STATUS_ORDER = ['чиста_вода', 'колење', 'обработка', 'пакување', 'завршено'];

// Generate LOT number: LOT-YYYYMMDD-NNN
async function generateLotNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `LOT-${dateStr}`;

  const result = await pool.query(
    `SELECT lot_number FROM production_batches
     WHERE lot_number LIKE $1
     ORDER BY lot_number DESC LIMIT 1`,
    [`${prefix}-%`]
  );

  let seq = 1;
  if (result.rows.length > 0) {
    const last = result.rows[0].lot_number;
    const lastSeq = parseInt(last.split('-').pop());
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

// GET /api/production - list all batches
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status) {
      where += ` AND pb.status = $${idx}`;
      params.push(status);
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
      `SELECT pi.*, pt.code, pt.name, pt.price_per_unit, pt.unit
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
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { source_pool, fish_count, total_weight_kg, notes } = req.body;
    const lot_number = await generateLotNumber();

    const result = await pool.query(
      `INSERT INTO production_batches (lot_number, source_pool, fish_count, total_weight_kg, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [lot_number, source_pool || null, parseInt(fish_count) || 0, parseFloat(total_weight_kg) || 0, notes || null, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create production batch error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/production/:id/status - advance status
router.put('/:id/status', authMiddleware, async (req, res) => {
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

    const updates = { status, updated_at: 'NOW()' };
    let finishedClause = '';

    // When finishing, add products to inventory
    if (status === 'завршено') {
      finishedClause = ', finished_at = NOW()';

      const items = await client.query(
        'SELECT product_type_id, quantity_kg FROM production_items WHERE batch_id = $1',
        [req.params.id]
      );

      for (const item of items.rows) {
        await client.query(
          `UPDATE product_inventory
           SET quantity_kg = quantity_kg + $1, updated_at = NOW()
           WHERE product_type_id = $2`,
          [parseFloat(item.quantity_kg), item.product_type_id]
        );
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
    const { items } = req.body; // [{ product_type_id, quantity_kg }]
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Потребни се ставки' });
    }

    const batch = await client.query('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
    if (batch.rows.length === 0) return res.status(404).json({ error: 'Серијата не е пронајдена' });

    if (batch.rows[0].status === 'завршено') {
      return res.status(400).json({ error: 'Не може да се менуваат ставки на завршена серија' });
    }

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
    console.error('Update production items error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// PUT /api/production/:id - update batch info
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { source_pool, fish_count, total_weight_kg, notes } = req.body;

    const batch = await pool.query('SELECT status FROM production_batches WHERE id = $1', [req.params.id]);
    if (batch.rows.length === 0) return res.status(404).json({ error: 'Серијата не е пронајдена' });
    if (batch.rows[0].status === 'завршено') return res.status(400).json({ error: 'Не може да се менува завршена серија' });

    const result = await pool.query(
      `UPDATE production_batches
       SET source_pool = $1, fish_count = $2, total_weight_kg = $3, notes = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [source_pool || null, parseInt(fish_count) || 0, parseFloat(total_weight_kg) || 0, notes || null, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update production batch error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// DELETE /api/production/:id - delete batch (only if not finished)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const batch = await pool.query('SELECT status FROM production_batches WHERE id = $1', [req.params.id]);
    if (batch.rows.length === 0) return res.status(404).json({ error: 'Серијата не е пронајдена' });
    if (batch.rows[0].status === 'завршено') return res.status(400).json({ error: 'Не може да се избрише завршена серија' });

    await pool.query('DELETE FROM production_batches WHERE id = $1', [req.params.id]);
    res.json({ message: 'Серијата е избришана' });
  } catch (err) {
    console.error('Delete production batch error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
