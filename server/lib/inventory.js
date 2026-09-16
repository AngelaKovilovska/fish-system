// Залиха на готови производи по LOT.
// Сите функции работат со `client` од отворена трансакција.

const SHELF_LIFE_MONTHS = 6;

function addMonths(dateStr, months) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  // Исто како Postgres INTERVAL: 31.08 + 6 месеци = 28.02 (последен ден во месецот)
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

// LOT формат YYMMDD-P → датум на производство
function dateFromLot(lotNumber) {
  const m = /^(\d{2})(\d{2})(\d{2})/.exec(lotNumber || '');
  if (!m) return null;
  return `20${m[1]}-${m[2]}-${m[3]}`;
}

function toDateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date && !isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

// Синхронизирај збирна залиха за производ од LOT-овите
async function syncInventory(client, productTypeId) {
  await client.query(
    `INSERT INTO product_inventory (product_type_id, quantity_kg, updated_at)
     VALUES ($1, (SELECT COALESCE(SUM(quantity_kg), 0) FROM product_lots WHERE product_type_id = $1), NOW())
     ON CONFLICT (product_type_id) DO UPDATE
       SET quantity_kg = EXCLUDED.quantity_kg, updated_at = NOW()`,
    [productTypeId]
  );
}

// Додај количина во LOT (го креира ако не постои)
async function addToLot(client, { productTypeId, lotNumber, batchId = null, productionDate = null, qty }) {
  const q = parseFloat(qty) || 0;
  if (q <= 0 || !lotNumber) return;
  const prodDate = toDateStr(productionDate) || dateFromLot(lotNumber);
  const expiry = addMonths(prodDate, SHELF_LIFE_MONTHS);
  await client.query(
    `INSERT INTO product_lots (product_type_id, lot_number, batch_id, production_date, expiry_date, initial_kg, quantity_kg)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (product_type_id, lot_number) DO UPDATE
       SET initial_kg = product_lots.initial_kg + EXCLUDED.initial_kg,
           quantity_kg = product_lots.quantity_kg + EXCLUDED.quantity_kg,
           batch_id = COALESCE(product_lots.batch_id, EXCLUDED.batch_id),
           production_date = COALESCE(product_lots.production_date, EXCLUDED.production_date),
           expiry_date = COALESCE(product_lots.expiry_date, EXCLUDED.expiry_date),
           updated_at = NOW()`,
    [productTypeId, lotNumber, batchId, prodDate, expiry, q]
  );
  await syncInventory(client, productTypeId);
}

// Врати продадена количина назад во LOT (без да се менува initial_kg)
async function returnToLot(client, { productTypeId, lotNumber, qty }) {
  const q = parseFloat(qty) || 0;
  if (q <= 0) return;
  const lot = lotNumber || 'НЕПОЗНАТ';
  const prodDate = dateFromLot(lot);
  await client.query(
    `INSERT INTO product_lots (product_type_id, lot_number, production_date, expiry_date, initial_kg, quantity_kg)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (product_type_id, lot_number) DO UPDATE
       SET quantity_kg = product_lots.quantity_kg + EXCLUDED.quantity_kg, updated_at = NOW()`,
    [productTypeId, lot, prodDate, addMonths(prodDate, SHELF_LIFE_MONTHS), q]
  );
  await syncInventory(client, productTypeId);
}

// Најстар LOT со доволна количина (FIFO)
async function pickLotFifo(client, productTypeId, qty) {
  const r = await client.query(
    `SELECT lot_number, quantity_kg FROM product_lots
     WHERE product_type_id = $1 AND quantity_kg >= $2
     ORDER BY production_date NULLS LAST, id
     LIMIT 1`,
    [productTypeId, qty]
  );
  return r.rows[0]?.lot_number || null;
}

// Одземи од конкретен LOT (со заклучување). Фрла Error со .status = 400 ако нема доволно.
async function takeFromLot(client, { productTypeId, lotNumber, qty }) {
  const q = parseFloat(qty) || 0;
  if (q <= 0) return;
  const r = await client.query(
    `SELECT pl.quantity_kg, pt.code, pt.name
     FROM product_lots pl JOIN product_types pt ON pt.id = pl.product_type_id
     WHERE pl.product_type_id = $1 AND pl.lot_number = $2
     FOR UPDATE OF pl`,
    [productTypeId, lotNumber]
  );
  if (r.rows.length === 0) {
    const pt = await client.query('SELECT code, name FROM product_types WHERE id = $1', [productTypeId]);
    const label = pt.rows[0]?.code || pt.rows[0]?.name || `#${productTypeId}`;
    const err = new Error(`Нема залиха за ${label} од LOT ${lotNumber}`);
    err.status = 400; throw err;
  }
  const available = parseFloat(r.rows[0].quantity_kg) || 0;
  if (available + 1e-9 < q) {
    const err = new Error(`Недоволна залиха за ${r.rows[0].code} (LOT ${lotNumber}): има ${available.toFixed(2)} кг, барате ${q.toFixed(2)} кг`);
    err.status = 400; throw err;
  }
  await client.query(
    `UPDATE product_lots SET quantity_kg = quantity_kg - $3, updated_at = NOW()
     WHERE product_type_id = $1 AND lot_number = $2`,
    [productTypeId, lotNumber, q]
  );
  await syncInventory(client, productTypeId);
}

// Постави вкупна залиха за производ (попис): вишокот оди во LOT „ПОПИС-YYMMDD“, кусокот се одзема FIFO
async function adjustToTotal(client, productTypeId, targetQty) {
  const target = parseFloat(targetQty) || 0;
  const cur = await client.query(
    'SELECT COALESCE(SUM(quantity_kg), 0) AS q FROM product_lots WHERE product_type_id = $1', [productTypeId]
  );
  let diff = target - parseFloat(cur.rows[0].q);
  if (Math.abs(diff) < 0.005) { await syncInventory(client, productTypeId); return; }

  if (diff > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const lot = `ПОПИС-${today.slice(2).replace(/-/g, '')}`;
    await addToLot(client, { productTypeId, lotNumber: lot, productionDate: today, qty: diff });
    return;
  }

  diff = -diff;
  const lots = await client.query(
    `SELECT id, quantity_kg FROM product_lots
     WHERE product_type_id = $1 AND quantity_kg > 0
     ORDER BY production_date NULLS LAST, id FOR UPDATE`,
    [productTypeId]
  );
  for (const lot of lots.rows) {
    if (diff <= 0) break;
    const take = Math.min(parseFloat(lot.quantity_kg), diff);
    await client.query('UPDATE product_lots SET quantity_kg = quantity_kg - $2, updated_at = NOW() WHERE id = $1', [lot.id, take]);
    diff -= take;
  }
  await syncInventory(client, productTypeId);
}

// Колку е продадено од LOT-от на една серија (од вистинските продажби)
async function soldFromBatch(client, batchId) {
  const r = await client.query(
    `SELECT si.product_type_id, si.lot_number, SUM(si.quantity_kg) AS sold
     FROM sale_items si
     JOIN production_batches pb ON pb.lot_number = si.lot_number
     WHERE pb.id = $1
     GROUP BY si.product_type_id, si.lot_number
     HAVING SUM(si.quantity_kg) > 0.005`,
    [batchId]
  );
  return r.rows;
}

// Постави производи на завршена серија (кога се уредува): LOT = ново - веќе продадено
async function setBatchLots(client, { batchId, lotNumber, productionDate, items }) {
  const existing = await client.query(
    'SELECT id, product_type_id, initial_kg, quantity_kg FROM product_lots WHERE batch_id = $1 FOR UPDATE', [batchId]
  );
  const wanted = new Map();
  for (const it of items || []) {
    const q = parseFloat(it.quantity_kg) || 0;
    if (q > 0) wanted.set(parseInt(it.product_type_id), (wanted.get(parseInt(it.product_type_id)) || 0) + q);
  }
  const prodDate = toDateStr(productionDate) || dateFromLot(lotNumber);
  const expiry = addMonths(prodDate, SHELF_LIFE_MONTHS);
  const touched = new Set();

  // Стар LOT број на серијата (ако се преименува, продажбите сè уште го носат стариот)
  const oldLotRow = await client.query('SELECT lot_number FROM production_batches WHERE id = $1', [batchId]);
  const oldLot = oldLotRow.rows[0]?.lot_number || lotNumber;

  // remove / update existing
  for (const row of existing.rows) {
    const oldInitial = parseFloat(row.initial_kg) || 0;
    const oldQty = parseFloat(row.quantity_kg) || 0;
    const newQty = wanted.get(row.product_type_id) || 0;

    // Вистински продадено од овој LOT за овој тип (од продажбите, не од разликата почетна−тековна,
    // бидејќи разликата може да дојде и од попис)
    const soldRow = await client.query(
      `SELECT COALESCE(SUM(si.quantity_kg), 0) AS sold,
              STRING_AGG(DISTINCT COALESCE(s.invoice_number, s.dispatch_number, '#' || s.id::text), ', ') AS refs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE si.product_type_id = $1 AND si.lot_number IN ($2, $3)`,
      [row.product_type_id, oldLot, lotNumber]
    );
    const sold = parseFloat(soldRow.rows[0].sold) || 0;
    if (newQty + 1e-9 < sold) {
      const pt = await client.query('SELECT code FROM product_types WHERE id = $1', [row.product_type_id]);
      const err = new Error(
        `Од LOT ${oldLot} има продажба од ${sold.toFixed(2)} кг ${pt.rows[0]?.code || ''}` +
        (soldRow.rows[0].refs ? ` (${soldRow.rows[0].refs})` : '') +
        ` — прво измени ја или избриши ја продажбата, па потоа серијата`
      );
      err.status = 400; throw err;
    }
    // Останати одземања (попис и сл.) што не се продажба — се пренесуваат
    const otherDeductions = Math.max(0, oldInitial - oldQty - sold);
    if (newQty <= 0) {
      await client.query('DELETE FROM product_lots WHERE id = $1', [row.id]);
    } else {
      const newAvail = Math.max(0, newQty - sold - otherDeductions);
      await client.query(
        `UPDATE product_lots SET lot_number = $2, production_date = $3, expiry_date = $4,
           initial_kg = $5, quantity_kg = $6, updated_at = NOW() WHERE id = $1`,
        [row.id, lotNumber, prodDate, expiry, newQty, newAvail]
      );
    }
    touched.add(row.product_type_id);
    wanted.delete(row.product_type_id);
  }
  // add new
  for (const [ptId, q] of wanted) {
    await addToLot(client, { productTypeId: ptId, lotNumber, batchId, productionDate: prodDate, qty: q });
    touched.add(ptId);
  }
  for (const ptId of touched) await syncInventory(client, ptId);
}

module.exports = {
  SHELF_LIFE_MONTHS, addMonths, dateFromLot,
  syncInventory, addToLot, returnToLot, takeFromLot, pickLotFifo, adjustToTotal, soldFromBatch, setBatchLots,
};
