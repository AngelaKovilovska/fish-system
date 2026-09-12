const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Generate invoice number: ФА-YYYYMMDD-NNN
async function generateInvoiceNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ФА-${dateStr}`;

  const result = await pool.query(
    `SELECT invoice_number FROM sales
     WHERE invoice_number LIKE $1
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${prefix}-%`]
  );

  let seq = 1;
  if (result.rows.length > 0) {
    const last = result.rows[0].invoice_number;
    const lastSeq = parseInt(last.split('-').pop());
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

// Generate dispatch number: ИС-YYYYMMDD-NNN
async function generateDispatchNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ИС-${dateStr}`;

  const result = await pool.query(
    `SELECT dispatch_number FROM sales
     WHERE dispatch_number LIKE $1
     ORDER BY dispatch_number DESC LIMIT 1`,
    [`${prefix}-%`]
  );

  let seq = 1;
  if (result.rows.length > 0) {
    const last = result.rows[0].dispatch_number;
    const lastSeq = parseInt(last.split('-').pop());
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

// GET /api/sales - list all sales
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { limit, offset, from, to } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (from) {
      where += ` AND s.sale_date >= $${idx}`;
      params.push(from);
      idx++;
    }
    if (to) {
      where += ` AND s.sale_date <= $${idx}`;
      params.push(to);
      idx++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM sales s ${where}`,
      params
    );

    const lim = parseInt(limit) || 50;
    const off = parseInt(offset) || 0;

    const result = await pool.query(
      `SELECT s.*, b.name as buyer_name, u.full_name as created_by_name,
        (SELECT json_agg(json_build_object(
          'id', si.id,
          'product_type_id', si.product_type_id,
          'lot_number', si.lot_number,
          'quantity_kg', si.quantity_kg,
          'price_per_kg', si.price_per_kg,
          'amount', si.amount,
          'code', pt.code,
          'name', pt.name
        ))
        FROM sale_items si
        JOIN product_types pt ON pt.id = si.product_type_id
        WHERE si.sale_id = s.id) as items
       FROM sales s
       LEFT JOIN buyers b ON b.id = s.buyer_id
       LEFT JOIN users u ON u.id = s.created_by
       ${where}
       ORDER BY s.sale_date DESC, s.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, lim, off]
    );

    res.json({
      sales: result.rows,
      total: parseInt(countResult.rows[0].total)
    });
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/sales/:id - single sale with items and buyer info
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const sale = await pool.query(
      `SELECT s.*, b.name as buyer_name, b.address as buyer_address,
              b.edb as buyer_edb, b.contact_person as buyer_contact,
              b.phone as buyer_phone, b.email as buyer_email,
              u.full_name as created_by_name
       FROM sales s
       LEFT JOIN buyers b ON b.id = s.buyer_id
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (sale.rows.length === 0) return res.status(404).json({ error: 'Продажбата не е пронајдена' });

    const items = await pool.query(
      `SELECT si.*, pt.code, pt.name, pt.latin_name, pt.unit
       FROM sale_items si
       JOIN product_types pt ON pt.id = si.product_type_id
       WHERE si.sale_id = $1
       ORDER BY pt.sort_order`,
      [req.params.id]
    );

    res.json({ ...sale.rows[0], items: items.rows });
  } catch (err) {
    console.error('Get sale error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/sales - create new sale (deducts from inventory)
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      buyer_id, sale_date, due_date, payment_method,
      lot_number, transport_vehicle, product_temp,
      items, notes, vat_rate: requestVatRate
    } = req.body;

    if (!buyer_id) return res.status(400).json({ error: 'Потребен е купувач' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Потребни се ставки' });
    }

    await client.query('BEGIN');

    const invoice_number = await generateInvoiceNumber();
    const dispatch_number = await generateDispatchNumber();

    // Calculate totals
    let subtotal = 0;
    for (const item of items) {
      const qty = parseFloat(item.quantity_kg) || 0;
      const price = parseFloat(item.price_per_kg) || 0;
      subtotal += qty * price;
    }

    const vat_rate = [5, 10, 18].includes(parseFloat(requestVatRate)) ? parseFloat(requestVatRate) : 5.00;
    const vat_amount = Math.round(subtotal * vat_rate) / 100;
    const total = subtotal + vat_amount;

    // Create sale
    const saleResult = await client.query(
      `INSERT INTO sales (invoice_number, dispatch_number, buyer_id, sale_date, due_date,
        payment_method, lot_number, transport_vehicle, product_temp,
        subtotal, vat_rate, vat_amount, total, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        invoice_number, dispatch_number, buyer_id,
        sale_date || new Date().toISOString().slice(0, 10),
        due_date || null, payment_method || 'фактура',
        lot_number || null, transport_vehicle || null,
        product_temp != null ? parseFloat(product_temp) : null,
        subtotal, vat_rate, vat_amount, total,
        notes || null, req.user.id
      ]
    );

    const saleId = saleResult.rows[0].id;

    // Insert items and deduct from inventory
    for (const item of items) {
      const qty = parseFloat(item.quantity_kg) || 0;
      const price = parseFloat(item.price_per_kg) || 0;
      const amount = qty * price;

      await client.query(
        `INSERT INTO sale_items (sale_id, product_type_id, lot_number, quantity_kg, price_per_kg, amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, item.product_type_id, item.lot_number || lot_number || null, qty, price, amount]
      );

      // Deduct from product inventory
      if (qty > 0) {
        await client.query(
          `UPDATE product_inventory
           SET quantity_kg = GREATEST(0, quantity_kg - $1), updated_at = NOW()
           WHERE product_type_id = $2`,
          [qty, item.product_type_id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(saleResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create sale error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// DELETE /api/sales/:id - delete sale (rollback inventory)
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Rollback inventory
    const items = await client.query(
      'SELECT product_type_id, quantity_kg FROM sale_items WHERE sale_id = $1',
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

    await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Продажбата е избришана' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete sale error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

module.exports = router;
