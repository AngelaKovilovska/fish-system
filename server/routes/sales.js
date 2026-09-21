const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const inv = require('../lib/inventory');
const docNum = require('../lib/documentNumbers');

const router = express.Router();


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

    // Resolve LOT for every item (explicit or FIFO) — stock is verified & locked in takeFromLot
    for (const item of items) {
      const qty = parseFloat(item.quantity_kg) || 0;
      if (qty <= 0) continue;
      // Ставка без LOT (стара продажба внесена дополнително) — не се одзема залиха
      if (item.no_lot) { item.lot_number = null; continue; }
      let lot = (item.lot_number || lot_number || '').trim();
      if (!lot) lot = await inv.pickLotFifo(client, item.product_type_id, qty);
      if (!lot) {
        await client.query('ROLLBACK');
        const pt = await pool.query('SELECT code FROM product_types WHERE id = $1', [item.product_type_id]);
        return res.status(400).json({ error: `Нема LOT со доволна залиха за ${pt.rows[0]?.code || 'производот'} (${qty.toFixed(2)} кг)` });
      }
      item.lot_number = lot;
    }

    // Броеви на документи: серија според начин на плаќање + испратница, датум = датум на продажба
    const saleDateForNum = sale_date || new Date().toISOString().slice(0, 10);
    const invoice_number = await docNum.nextNumber(client, docNum.seriesForPayment(payment_method), saleDateForNum);
    const dispatch_number = await docNum.nextNumber(client, 'dispatch', saleDateForNum);

    // Calculate totals
    let subtotal = 0;
    for (const item of items) {
      const qty = parseFloat(item.quantity_kg) || 0;
      const price = parseFloat(item.price_per_kg) || 0;
      subtotal += qty * price;
    }

    // Готово/гратис = платено на денот и БЕЗ ДДВ
    const method = payment_method || 'фактура';
    const isPaidNow = ['готово', 'гратис'].includes(method);
    const vat_rate = isPaidNow ? 0 : ([5, 10, 18].includes(parseFloat(requestVatRate)) ? parseFloat(requestVatRate) : 5.00);
    const vat_amount = Math.round(subtotal * vat_rate) / 100;
    const total = subtotal + vat_amount;
    const saleDateVal = sale_date || new Date().toISOString().slice(0, 10);
    const saleResult = await client.query(
      `INSERT INTO sales (invoice_number, dispatch_number, buyer_id, sale_date, due_date,
        payment_method, lot_number, transport_vehicle, product_temp,
        subtotal, vat_rate, vat_amount, total, notes, created_by, payment_status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        invoice_number, dispatch_number, buyer_id,
        saleDateVal,
        due_date || null, method,
        lot_number || items.find(i => i.lot_number)?.lot_number || null, transport_vehicle || null,
        product_temp != null ? parseFloat(product_temp) : null,
        subtotal, vat_rate, vat_amount, total,
        notes || null, req.user.id,
        isPaidNow ? 'платено' : 'неплатено', isPaidNow ? saleDateVal : null
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
        [saleId, item.product_type_id, item.lot_number || null, qty, price, amount]
      );

      // Deduct from LOT inventory (verifies availability, row-locked); без LOT → не се одзема
      if (qty > 0 && item.lot_number) {
        await inv.takeFromLot(client, { productTypeId: item.product_type_id, lotNumber: item.lot_number, qty });
      }
    }

    await client.query('COMMIT');
    res.status(201).json(saleResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Create sale error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// PUT /api/sales/:id - edit sale (invoice number stays; LOT inventory corrected by difference)
router.put('/:id', authMiddleware, async (req, res) => {
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

    const existing = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Продажбата не е пронајдена' });
    }

    // 1. Return old items to their LOTs
    const oldItems = await client.query(
      'SELECT product_type_id, lot_number, quantity_kg FROM sale_items WHERE sale_id = $1', [req.params.id]
    );
    for (const it of oldItems.rows) {
      if (!it.lot_number) continue; // ставка без LOT — залихата не била одземена
      await inv.returnToLot(client, { productTypeId: it.product_type_id, lotNumber: it.lot_number, qty: it.quantity_kg });
    }
    await client.query('DELETE FROM sale_items WHERE sale_id = $1', [req.params.id]);

    // 2. Resolve LOTs for new items (explicit or FIFO)
    for (const item of items) {
      const qty = parseFloat(item.quantity_kg) || 0;
      if (qty <= 0) continue;
      // Ставка без LOT (стара продажба внесена дополнително) — не се одзема залиха
      if (item.no_lot) { item.lot_number = null; continue; }
      let lot = (item.lot_number || lot_number || '').trim();
      if (!lot) lot = await inv.pickLotFifo(client, item.product_type_id, qty);
      if (!lot) {
        await client.query('ROLLBACK');
        const pt = await pool.query('SELECT code FROM product_types WHERE id = $1', [item.product_type_id]);
        return res.status(400).json({ error: `Нема LOT со доволна залиха за ${pt.rows[0]?.code || 'производот'} (${qty.toFixed(2)} кг)` });
      }
      item.lot_number = lot;
    }

    // 3. Totals
    let subtotal = 0;
    for (const item of items) {
      subtotal += (parseFloat(item.quantity_kg) || 0) * (parseFloat(item.price_per_kg) || 0);
    }
    // Готово/гратис = без ДДВ
    const methodForVat = payment_method || existing.rows[0].payment_method;
    const noVat = ['готово', 'гратис'].includes(methodForVat);
    const vat_rate = noVat ? 0 : ([5, 10, 18].includes(parseFloat(requestVatRate)) ? parseFloat(requestVatRate) : parseFloat(existing.rows[0].vat_rate) || 5);
    const vat_amount = Math.round(subtotal * vat_rate) / 100;
    const total = subtotal + vat_amount;

    // 4. Insert new items and deduct from LOTs
    for (const item of items) {
      const qty = parseFloat(item.quantity_kg) || 0;
      const price = parseFloat(item.price_per_kg) || 0;
      if (qty <= 0) continue;
      await client.query(
        `INSERT INTO sale_items (sale_id, product_type_id, lot_number, quantity_kg, price_per_kg, amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, item.product_type_id, item.lot_number || null, qty, price, qty * price]
      );
      if (item.lot_number) await inv.takeFromLot(client, { productTypeId: item.product_type_id, lotNumber: item.lot_number, qty });
    }

    // 5. Update sale header (готово/гратис → автоматски платено)
    const newMethod = payment_method || existing.rows[0].payment_method;
    const newSaleDate = sale_date || existing.rows[0].sale_date;
    let paymentStatus = existing.rows[0].payment_status || 'неплатено';
    let paidAt = existing.rows[0].paid_at;
    if (['готово', 'гратис'].includes(newMethod) && paymentStatus !== 'платено') {
      paymentStatus = 'платено'; paidAt = newSaleDate;
    }
    // Ако се смени серијата (фактура ↔ готово ↔ гратис), продажбата добива нов број од новата серија
    let invoiceNumber = existing.rows[0].invoice_number;
    const oldSeries = docNum.seriesForPayment(existing.rows[0].payment_method);
    const newSeries = docNum.seriesForPayment(newMethod);
    if (oldSeries !== newSeries) {
      invoiceNumber = await docNum.nextNumber(client, newSeries, newSaleDate);
    }
    const result = await client.query(
      `UPDATE sales SET buyer_id = $1, sale_date = $2, due_date = $3, payment_method = $4,
         lot_number = $5, transport_vehicle = $6, product_temp = $7,
         subtotal = $8, vat_rate = $9, vat_amount = $10, total = $11, notes = $12,
         payment_status = $14, paid_at = $15, invoice_number = $16, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        buyer_id, newSaleDate, due_date || existing.rows[0].due_date,
        newMethod,
        lot_number || items.find(i => i.lot_number)?.lot_number || null,
        transport_vehicle || null, product_temp != null ? parseFloat(product_temp) : existing.rows[0].product_temp,
        subtotal, vat_rate, vat_amount, total, notes || null, req.params.id,
        paymentStatus, paidAt, invoiceNumber
      ]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Update sale error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

// PUT /api/sales/:id/payment - mark as paid / unpaid
router.put('/:id/payment', authMiddleware, async (req, res) => {
  try {
    const { paid, paid_at } = req.body || {};
    const isPaid = Boolean(paid);
    const paidDate = isPaid ? (paid_at || new Date().toISOString().slice(0, 10)) : null;
    const result = await pool.query(
      `UPDATE sales SET payment_status = $1, paid_at = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [isPaid ? 'платено' : 'неплатено', paidDate, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Продажбата не е пронајдена' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update payment error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// DELETE /api/sales/:id - delete sale (rollback inventory)
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Rollback inventory
    const items = await client.query(
      'SELECT product_type_id, lot_number, quantity_kg FROM sale_items WHERE sale_id = $1',
      [req.params.id]
    );

    for (const item of items.rows) {
      if (!item.lot_number) continue; // ставка без LOT — залихата не била одземена
      await inv.returnToLot(client, { productTypeId: item.product_type_id, lotNumber: item.lot_number, qty: item.quantity_kg });
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
