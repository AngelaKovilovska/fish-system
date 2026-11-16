const express = require('express');
const { todayLocal } = require('../lib/dates');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const inv = require('../lib/inventory');
const docNum = require('../lib/documentNumbers');

const PACKAGING = ['Кеси', 'Кутија', 'Вакуум'];
const packOf = (v, fallback = 'Кеси') => (PACKAGING.includes(v) ? v : fallback);

const router = express.Router();

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const bad = (msg) => { const e = new Error(msg); e.status = 400; return e; };

// Ги претвора ставките од формата во ставки по LOT, со износи:
//  - item.no_lot            → lot_number = null (не се одзема залиха)
//  - item.lot_number избран → тој LOT (целата количина)
//  - инаку (автоматски)     → FIFO низ LOT-ови: може да се подели во повеќе ставки со ист производ/цена
// Износ на ред = количина × цена, заокружен на 2 децимали. Кога ред се дели на повеќе LOT-ови, деловите се
// собираат точно на износот на редот (последниот дел ја носи разликата) — фактурата и основицата се исти.
// Враќа { resolved: [{ product_type_id, lot_number, quantity_kg, price_per_kg, amount }], subtotal }.
async function resolveItemLots(client, items) {
  const rows = [];
  for (const item of items) {
    const qty = round3(Number(item.quantity_kg));
    const price = Number(item.price_per_kg === '' || item.price_per_kg == null ? 0 : item.price_per_kg);
    const ptId = parseInt(item.product_type_id);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) throw bad('Невалидна количина или цена во ставките');
    if (qty < 0 || price < 0) throw bad('Количината и цената не може да бидат негативни');
    if (qty === 0) continue;
    if (!ptId) throw bad('Изберете производ за секоја ставка');
    const explicit = item.no_lot ? '' : String(item.lot_number || '').trim();
    rows.push({ ptId, qty, price, noLot: !!item.no_lot, explicit, amount: round2(qty * price), parts: null });
  }
  if (rows.length === 0) throw bad('Додадете барем една ставка со количина');

  // Прво ставките со избран LOT (ја резервираат количината), па автоматските — за два реда од ист производ
  // да не планираат од истата залиха.
  const reserved = new Map();
  const reserve = (ptId, lot, qty) => reserved.set(`${ptId}|${lot}`, (reserved.get(`${ptId}|${lot}`) || 0) + qty);
  for (const r of rows) {
    if (r.noLot) r.parts = [{ lot_number: null, qty: r.qty }];
    else if (r.explicit) { r.parts = [{ lot_number: r.explicit, qty: r.qty }]; reserve(r.ptId, r.explicit, r.qty); }
  }
  for (const r of rows) {
    if (r.parts) continue;
    r.parts = await inv.planFifo(client, r.ptId, r.qty, reserved);
    for (const part of r.parts) reserve(r.ptId, part.lot_number, part.qty);
  }

  const resolved = [];
  let subtotal = 0;
  for (const r of rows) {
    subtotal += r.amount;
    let used = 0;
    r.parts.forEach((part, i) => {
      const last = i === r.parts.length - 1;
      const amount = last ? round2(r.amount - used) : round2(part.qty * r.price);
      used += amount;
      resolved.push({ product_type_id: r.ptId, lot_number: part.lot_number, quantity_kg: part.qty, price_per_kg: r.price, amount });
    });
  }
  return { resolved, subtotal: round2(subtotal) };
}

const { isValidDateStr } = require('../lib/dates');
const METHODS = ['фактура', 'готово', 'гратис'];


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
              b.edb as buyer_edb, b.is_individual as buyer_is_individual, b.contact_person as buyer_contact,
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
      lot_number, transport_vehicle, product_temp, packaging,
      items, notes, vat_rate: requestVatRate
    } = req.body;

    if (!buyer_id) return res.status(400).json({ error: 'Потребен е купувач' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Потребни се ставки' });
    }

    await client.query('BEGIN');

    // Ставки по LOT: избран LOT → тој; без LOT → не се одзема; автоматски → FIFO низ LOT-ови (најстар прв,
    // кога ќе се испразни продолжува со следниот). Залихата се заклучува и проверува.
    const { resolved, subtotal } = await resolveItemLots(client, items);

    if (sale_date && !isValidDateStr(String(sale_date).slice(0, 10))) throw bad('Невалиден датум на продажба');
    if (payment_method && !METHODS.includes(payment_method)) throw bad('Невалиден начин на плаќање');

    // Броеви на документи: серија според начин на плаќање + испратница, датум = датум на продажба
    const saleDateForNum = sale_date || todayLocal();
    const invoice_number = await docNum.nextNumber(client, docNum.seriesForPayment(payment_method), saleDateForNum);
    const dispatch_number = await docNum.nextNumber(client, 'dispatch', saleDateForNum);

    // Готово/гратис = платено на денот и БЕЗ ДДВ
    const method = payment_method || 'фактура';
    const isPaidNow = ['готово', 'гратис'].includes(method);
    const vat_rate = isPaidNow ? 0 : ([5, 10, 18].includes(parseFloat(requestVatRate)) ? parseFloat(requestVatRate) : 5.00);
    const vat_amount = round2(subtotal * vat_rate / 100);
    const total = round2(subtotal + vat_amount);
    const saleDateVal = sale_date || todayLocal();
    const saleResult = await client.query(
      `INSERT INTO sales (invoice_number, dispatch_number, buyer_id, sale_date, due_date,
        payment_method, lot_number, transport_vehicle, product_temp,
        subtotal, vat_rate, vat_amount, total, notes, created_by, payment_status, paid_at, packaging)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
      [
        invoice_number, dispatch_number, buyer_id,
        saleDateVal,
        due_date || null, method,
        resolved.find(i => i.lot_number)?.lot_number || null, transport_vehicle || null,
        product_temp != null ? parseFloat(product_temp) : null,
        subtotal, vat_rate, vat_amount, total,
        notes || null, req.user.id,
        isPaidNow ? 'платено' : 'неплатено', isPaidNow ? saleDateVal : null,
        packOf(packaging)
      ]
    );

    const saleId = saleResult.rows[0].id;

    // Insert items and deduct from inventory
    for (const item of resolved) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_type_id, lot_number, quantity_kg, price_per_kg, amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, item.product_type_id, item.lot_number || null, item.quantity_kg, item.price_per_kg, item.amount]
      );
      // Deduct from LOT inventory (verifies availability, row-locked); без LOT → не се одзема
      if (item.lot_number) {
        await inv.takeFromLot(client, { productTypeId: item.product_type_id, lotNumber: item.lot_number, qty: item.quantity_kg });
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
      lot_number, transport_vehicle, product_temp, packaging,
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

    // 2. Ставки по LOT (избран / без LOT / автоматски FIFO низ повеќе LOT-ови) со износи
    const { resolved, subtotal } = await resolveItemLots(client, items);
    if (sale_date && !isValidDateStr(String(sale_date).slice(0, 10))) throw bad('Невалиден датум на продажба');
    if (payment_method && !METHODS.includes(payment_method)) throw bad('Невалиден начин на плаќање');

    // 3. Totals — готово/гратис = без ДДВ
    const methodForVat = payment_method || existing.rows[0].payment_method;
    const noVat = ['готово', 'гратис'].includes(methodForVat);
    const vat_rate = noVat ? 0 : ([5, 10, 18].includes(parseFloat(requestVatRate)) ? parseFloat(requestVatRate) : parseFloat(existing.rows[0].vat_rate) || 5);
    const vat_amount = round2(subtotal * vat_rate / 100);
    const total = round2(subtotal + vat_amount);

    // 4. Insert new items and deduct from LOTs
    for (const item of resolved) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_type_id, lot_number, quantity_kg, price_per_kg, amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, item.product_type_id, item.lot_number || null, item.quantity_kg, item.price_per_kg, item.amount]
      );
      if (item.lot_number) await inv.takeFromLot(client, { productTypeId: item.product_type_id, lotNumber: item.lot_number, qty: item.quantity_kg });
    }

    // 5. Update sale header
    const oldMethod = existing.rows[0].payment_method;
    const newMethod = payment_method || oldMethod;
    const newSaleDate = sale_date || existing.rows[0].sale_date;
    let paymentStatus = existing.rows[0].payment_status || 'неплатено';
    let paidAt = existing.rows[0].paid_at;
    const cashNow = ['готово', 'гратис'].includes(newMethod);
    const cashBefore = ['готово', 'гратис'].includes(oldMethod);
    if (cashNow && paymentStatus !== 'платено') {
      // готово/гратис → автоматски платено на денот
      paymentStatus = 'платено'; paidAt = newSaleDate;
    } else if (!cashNow && cashBefore) {
      // погрешно внесено „готово“ поправено во „фактура“ → повторно неплатено (плаќањето се означува рачно)
      paymentStatus = 'неплатено'; paidAt = null;
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
         payment_status = $14, paid_at = $15, invoice_number = $16, packaging = $17, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        buyer_id, newSaleDate, due_date || existing.rows[0].due_date,
        newMethod,
        resolved.find(i => i.lot_number)?.lot_number || null,
        transport_vehicle || null, product_temp != null ? parseFloat(product_temp) : existing.rows[0].product_temp,
        subtotal, vat_rate, vat_amount, total, notes || null, req.params.id,
        paymentStatus, paidAt, invoiceNumber, packOf(packaging, existing.rows[0].packaging)
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
    const paidDate = isPaid ? (paid_at || todayLocal()) : null;
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

    // Заклучи ја продажбата — две истовремени бришења не смеат двапати да ја вратат залихата
    const locked = await client.query('SELECT id FROM sales WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (locked.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Продажбата не е пронајдена' });
    }

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
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Delete sale error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  } finally {
    client.release();
  }
});

module.exports = router;
