const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const { sendReportEmail, testConnection } = require('../services/emailService');
const {
  getDailyReportData, getFoodConsumptionData, getFoodPurchaseData,
  getMeasurementDates, getAvgWeightData, getAlertsReportData,
  getSortingReportData, generateExcel, generatePDF, PARAMETER_LABELS,
} = require('../services/reportService');

const router = express.Router();

// ── Продажби: агрегација по купувач / производ / месец ──
async function getSalesRows(from, to) {
  const r = await pool.query(
    `SELECT s.id, s.sale_date, s.total, s.payment_status, b.name AS buyer_name,
            COALESCE((SELECT json_agg(json_build_object('code', pt.code, 'name', pt.name, 'quantity_kg', si.quantity_kg, 'amount', si.amount))
                      FROM sale_items si JOIN product_types pt ON pt.id = si.product_type_id WHERE si.sale_id = s.id), '[]'::json) AS items
     FROM sales s LEFT JOIN buyers b ON b.id = s.buyer_id
     WHERE s.sale_date >= $1 AND s.sale_date <= $2
     ORDER BY s.sale_date`,
    [from, to]
  );
  return r.rows;
}

function aggregateSales(type, sales) {
  const map = new Map();
  const bump = (key, kg, amount, unpaid) => {
    if (!map.has(key)) map.set(key, { key, count: 0, kg: 0, amount: 0, unpaid: 0 });
    const m = map.get(key); m.count++; m.kg += kg; m.amount += amount; m.unpaid += unpaid;
  };
  for (const s of sales) {
    const items = Array.isArray(s.items) ? s.items : [];
    const kg = items.reduce((a, i) => a + parseFloat(i.quantity_kg || 0), 0);
    const amount = parseFloat(s.total || 0);
    const unpaid = s.payment_status === 'платено' ? 0 : amount;
    if (type === 'buyer') bump(s.buyer_name || 'Непознат', kg, amount, unpaid);
    else if (type === 'period') bump(String(s.sale_date).slice(0, 7), kg, amount, unpaid);
    else if (type === 'product') {
      for (const i of items) {
        const k = `${i.code} — ${i.name}`;
        if (!map.has(k)) map.set(k, { key: k, count: 0, kg: 0, amount: 0, unpaid: 0 });
        const m = map.get(k); m.count++; m.kg += parseFloat(i.quantity_kg || 0); m.amount += parseFloat(i.amount || 0);
      }
    }
  }
  const rows = [...map.values()].map(r => ({ ...r, avgPrice: r.kg > 0 ? r.amount / r.kg : 0 }));
  return type === 'period' ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows.sort((a, b) => b.amount - a.amount);
}

// POST /api/reports/sales — продажби (по купувач / производ / месец) со е-пошта
router.post('/sales', authMiddleware, async (req, res) => {
  try {
    const { from, to, view = 'buyer', sendEmail } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'Внесете период (од-до)' });
    if (!['buyer', 'product', 'period'].includes(view)) return res.status(400).json({ error: 'Невалиден преглед' });

    const sales = await getSalesRows(from, to);
    const rows = aggregateSales(view, sales);
    const labels = { buyer: 'Продажби по купувач', product: 'Продажби по производ', period: 'Продажби по месец' };
    const colLabel = { buyer: 'Купувач', product: 'Производ', period: 'Месец' }[view];
    const tot = rows.reduce((a, r) => ({ count: a.count + r.count, kg: a.kg + r.kg, amount: a.amount + r.amount, unpaid: a.unpaid + r.unpaid }), { count: 0, kg: 0, amount: 0, unpaid: 0 });

    if (sendEmail) {
      const isProduct = view === 'product';
      const headers = isProduct
        ? [colLabel, 'Ставки', 'Количина (кг)', 'Износ (ден)', 'Ден/кг']
        : [colLabel, 'Продажби', 'Количина (кг)', 'Износ (ден)', 'Ден/кг', 'Неплатено (ден)'];
      const tableRows = rows.map(r => isProduct
        ? [r.key, r.count, r.kg.toFixed(2), r.amount.toFixed(2), r.avgPrice.toFixed(2)]
        : [r.key, r.count, r.kg.toFixed(2), r.amount.toFixed(2), r.avgPrice.toFixed(2), r.unpaid.toFixed(2)]);
      tableRows.push(isProduct
        ? ['ВКУПНО', tot.count, tot.kg.toFixed(2), tot.amount.toFixed(2), tot.kg > 0 ? (tot.amount / tot.kg).toFixed(2) : '0.00']
        : ['ВКУПНО', tot.count, tot.kg.toFixed(2), tot.amount.toFixed(2), tot.kg > 0 ? (tot.amount / tot.kg).toFixed(2) : '0.00', tot.unpaid.toFixed(2)]);

      const excelBuffer = generateExcel(labels[view], headers, tableRows);
      const pdfBuffer = await generatePDF(`${labels[view]} (${fmtDate(from)} - ${fmtDate(to)})`, [
        { lines: [`Вкупно продажби: ${sales.length}`, `Вкупна количина: ${tot.kg.toFixed(2)} kg`, `Вкупен износ: ${tot.amount.toFixed(2)} ден`, `Неплатено: ${tot.unpaid.toFixed(2)} ден`] },
        { table: { headers, rows: tableRows } },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `${labels[view]} (${fmtDate(from)} - ${fmtDate(to)})`,
        html: buildEmailHTML({
          title: labels[view],
          subtitle: `Период: ${fmtDate(from)} — ${fmtDate(to)}`,
          sections: [
            { type: 'keyvalue', items: [
              { label: 'Вкупно продажби', value: `${sales.length}` },
              { label: 'Вкупна количина', value: `${tot.kg.toFixed(2)} kg` },
              { label: 'Вкупен износ', value: `${tot.amount.toFixed(2)} ден` },
              { label: 'Неплатено', value: `${tot.unpaid.toFixed(2)} ден` },
            ]},
            { type: 'keyvalue', heading: colLabel, items: rows.slice(0, 15).map(r => ({
              label: `${r.key} (${r.kg.toFixed(2)} kg)`, value: `${r.amount.toFixed(2)} ден`,
            }))},
          ],
          footerNote: rows.length > 15 ? `Прикажани 15 од ${rows.length} — целосен список во прилог.` : 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `prodazbi-${view}-${from}-${to}.xlsx`, content: excelBuffer },
          { filename: `prodazbi-${view}-${from}-${to}.pdf`, content: pdfBuffer },
        ],
      });
      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });
      return res.json({ message: 'Извештајот е испратен на вашиот email', rows, totals: tot });
    }

    res.json({ rows, totals: tot, totalSales: sales.length });
  } catch (err) {
    console.error('Sales report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/reports/production — преработка по серии (LOT) со е-пошта
router.post('/production', authMiddleware, async (req, res) => {
  try {
    const { from, to, pool: poolNumber, product_type, sendEmail } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'Внесете период (од-до)' });

    const params = [from, to];
    let where = `WHERE pb.status = 'завршено' AND pb.production_date >= $1 AND pb.production_date <= $2`;
    if (poolNumber) { params.push(parseInt(poolNumber)); where += ` AND pb.source_pool = $${params.length}`; }

    const r = await pool.query(
      `SELECT pb.id, pb.lot_number, pb.production_date, pb.source_pool, pb.fish_count, pb.total_weight_kg,
              COALESCE((SELECT json_agg(json_build_object('code', pt.code, 'name', pt.name, 'quantity_kg', pi.quantity_kg) ORDER BY pt.sort_order)
                        FROM production_items pi JOIN product_types pt ON pt.id = pi.product_type_id WHERE pi.batch_id = pb.id), '[]'::json) AS items
       FROM production_batches pb ${where}
       ORDER BY pb.production_date, pb.id`,
      params
    );
    let batches = r.rows;
    if (product_type) batches = batches.filter(b => (b.items || []).some(i => i.name === product_type || i.code === product_type));

    const productTotals = {};
    let totalFish = 0, totalRawKg = 0;
    for (const b of batches) {
      totalFish += parseInt(b.fish_count || 0);
      totalRawKg += parseFloat(b.total_weight_kg || 0);
      for (const it of (b.items || [])) {
        if (product_type && it.name !== product_type && it.code !== product_type) continue;
        productTotals[it.name] = (productTotals[it.name] || 0) + parseFloat(it.quantity_kg || 0);
      }
    }
    const totalProcessedKg = Object.values(productTotals).reduce((a, v) => a + v, 0);

    if (sendEmail) {
      const headers = ['LOT', 'Датум', 'Базен', 'Риби', 'Сурова маса (кг)', 'Производи'];
      const tableRows = batches.map(b => [
        b.lot_number, fmtDate(b.production_date), b.source_pool ? `Б${b.source_pool}` : '-', b.fish_count || 0,
        parseFloat(b.total_weight_kg || 0).toFixed(2),
        (b.items || []).map(i => `${i.code} ${parseFloat(i.quantity_kg).toFixed(2)} kg`).join(', '),
      ]);
      const totalsRows = Object.entries(productTotals).map(([name, kg]) => [name, kg.toFixed(2)]);

      const excelBuffer = generateExcel('Преработка', headers, tableRows);
      const pdfBuffer = await generatePDF(`Преработка (${fmtDate(from)} - ${fmtDate(to)})`, [
        { lines: [`Серии: ${batches.length}`, `Вкупно риби: ${totalFish}`, `Сурова маса: ${totalRawKg.toFixed(2)} kg`, `Преработено: ${totalProcessedKg.toFixed(2)} kg`, `Искористеност: ${totalRawKg > 0 ? ((totalProcessedKg / totalRawKg) * 100).toFixed(1) : 0}%`] },
        { table: { headers: ['Производ', 'Количина (кг)'], rows: totalsRows } },
        { table: { headers, rows: tableRows } },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `Преработка (${fmtDate(from)} - ${fmtDate(to)})`,
        html: buildEmailHTML({
          title: 'Преработка',
          subtitle: `Период: ${fmtDate(from)} — ${fmtDate(to)}${poolNumber ? ` | Базен ${poolNumber}` : ''}`,
          sections: [
            { type: 'keyvalue', items: [
              { label: 'Серии', value: `${batches.length}` },
              { label: 'Вкупно риби', value: `${totalFish}` },
              { label: 'Сурова маса', value: `${totalRawKg.toFixed(2)} kg` },
              { label: 'Преработено', value: `${totalProcessedKg.toFixed(2)} kg` },
            ]},
            { type: 'keyvalue', heading: 'По производ', items: Object.entries(productTotals).map(([name, kg]) => ({ label: name, value: `${kg.toFixed(2)} kg` })) },
          ],
          footerNote: 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `prerabotka-${from}-${to}.xlsx`, content: excelBuffer },
          { filename: `prerabotka-${from}-${to}.pdf`, content: pdfBuffer },
        ],
      });
      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });
      return res.json({ message: 'Извештајот е испратен на вашиот email', batches, productTotals });
    }

    res.json({ batches, productTotals, totalFish, totalRawKg, totalProcessedKg });
  } catch (err) {
    console.error('Production report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/reports/sales-export?type=buyer|product|period&from&to — Excel download
router.get('/sales-export', authMiddleware, async (req, res) => {
  try {
    const { type = 'buyer', from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Потребни се датуми' });
    if (!['buyer', 'product', 'period'].includes(type)) return res.status(400).json({ error: 'Невалиден тип' });

    const sales = await getSalesRows(from, to);
    const rows = aggregateSales(type, sales);
    const labels = { buyer: 'Купувач', product: 'Производ', period: 'Месец' };
    const isProduct = type === 'product';
    const headers = isProduct
      ? [labels[type], 'Ставки', 'Количина (кг)', 'Износ (ден)', 'Просечна цена (ден/кг)']
      : [labels[type], 'Продажби', 'Количина (кг)', 'Износ (ден)', 'Просечна цена (ден/кг)', 'Неплатено (ден)'];
    const data = rows.map(r => isProduct
      ? [r.key, r.count, +r.kg.toFixed(2), +r.amount.toFixed(2), +r.avgPrice.toFixed(2)]
      : [r.key, r.count, +r.kg.toFixed(2), +r.amount.toFixed(2), +r.avgPrice.toFixed(2), +r.unpaid.toFixed(2)]);
    const tot = rows.reduce((a, r) => ({ count: a.count + r.count, kg: a.kg + r.kg, amount: a.amount + r.amount, unpaid: a.unpaid + r.unpaid }), { count: 0, kg: 0, amount: 0, unpaid: 0 });
    data.push(isProduct
      ? ['ВКУПНО', tot.count, +tot.kg.toFixed(2), +tot.amount.toFixed(2), tot.kg > 0 ? +(tot.amount / tot.kg).toFixed(2) : 0]
      : ['ВКУПНО', tot.count, +tot.kg.toFixed(2), +tot.amount.toFixed(2), tot.kg > 0 ? +(tot.amount / tot.kg).toFixed(2) : 0, +tot.unpaid.toFixed(2)]);
    data.push([]);
    data.push([`Период: ${from} — ${to}`]);

    const buf = generateExcel(`Продажби по ${labels[type].toLowerCase()}`, headers, data);
    const fname = { buyer: 'prodazbi-po-kupuvac', product: 'prodazbi-po-proizvod', period: 'prodazbi-po-mesec' }[type];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}-${from}-${to}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('Sales export error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/reports/test-email — test SMTP connection (admin only)
router.get('/test-email', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Само админ може да тестира email' });
    }
    const result = await testConnection();
    res.json(result);
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Грешка при тестирање на email конекција' });
  }
});

// ── Helper: sanitize values before injecting into HTML ──
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Helper: format date as DD.MM.YYYY ──
function fmtDate(dateVal) {
  const d = new Date(dateVal);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// ── Helper: get requesting user's email from JWT ──
function getRequesterEmail(req) {
  return req.user?.email || null;
}

// ── Branded email HTML template ──
function buildEmailHTML({ title, subtitle, sections = [], footerNote }) {
  const sectionHTML = sections.map(s => {
    if (s.type === 'keyvalue') {
      const kvRows = s.items.map(item =>
        `<tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;font-weight:500;width:45%">${escapeHtml(item.label)}</td>
          <td style="padding:8px 12px;font-size:13px;color:#1f2937;border-bottom:1px solid #f3f4f6;${item.danger ? 'color:#dc2626;font-weight:700' : ''}">${escapeHtml(item.value)}</td>
        </tr>`
      ).join('');
      return `
        ${s.heading ? `<h3 style="margin:20px 0 8px;font-size:14px;color:#1a1a8a;font-family:'Segoe UI',Arial,sans-serif">${escapeHtml(s.heading)}</h3>` : ''}
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          ${kvRows}
        </table>`;
    }
    if (s.type === 'alert') {
      return `
        <div style="margin:16px 0;padding:12px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px">
          <p style="margin:0;font-size:13px;color:#dc2626;font-weight:600">${escapeHtml(s.text)}</p>
        </div>`;
    }
    if (s.type === 'info') {
      return `
        <div style="margin:16px 0;padding:12px 16px;background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px">
          <p style="margin:0;font-size:13px;color:#1e40af">${escapeHtml(s.text)}</p>
        </div>`;
    }
    return '';
  }).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;background:#ffffff">
      <!-- Header -->
      <div style="background:#1a1a8a;padding:20px 32px;text-align:center">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px">ФАМАКОМ АКВАКУЛТУРА</h1>
        <div style="width:80px;height:3px;background:#d4a017;margin:8px auto 0"></div>
      </div>

      <!-- Content -->
      <div style="padding:28px 32px">
        <h2 style="margin:0 0 4px;font-size:18px;color:#1a1a8a">${escapeHtml(title)}</h2>
        ${subtitle ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280">${escapeHtml(subtitle)}</p>` : '<div style="margin-bottom:20px"></div>'}

        ${sectionHTML}

        ${footerNote ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">${escapeHtml(footerNote)}</p>` : ''}
      </div>

      <!-- Footer -->
      <div style="background:#f9fafb;padding:16px 32px;border-top:2px solid #d4a017">
        <p style="margin:0 0 4px;font-size:10px;color:#6b7280;text-align:center">
          друштво за производство и трговија на риба <strong>ФАМАКОМ АКВАКУЛТУРА</strong> доо увоз-извоз
        </p>
        <p style="margin:0;font-size:10px;color:#9ca3af;text-align:center">
          ул.11ти Октомври бр.2, 1400 Велес, Република Македонија • famakom@t.mk
        </p>
      </div>
    </div>
  </body>
  </html>`;}


// ── Standalone: build and send daily report (used by route handler + auto-send from meals) ──
async function buildAndSendDailyReport(recordId, recipientEmail) {
  const data = await getDailyReportData(recordId);
  if (!data.record) return { success: false, notFound: true };

  try {
    const dateStr = fmtDate(data.record.date);

    // ── Section-specific labels (matching preview) ──
    const WATER_PARAMS = [
      ['temperature', 'Температура', '°C'],
      ['ph', 'pH', ''],
      ['total_alkalinity', 'Вкупна алкалност', 'mg/L'],
      ['hardness', 'Вкупна тврдост', 'mg/L'],
      ['nitrates', 'Нитрати (NO₃⁻)', 'mg/L'],
      ['nitrites', 'Нитрити (NO₂⁻)', 'mg/L'],
      ['total_chlorine', 'Вкупен хлор', 'mg/L'],
      ['ammonium', 'Амониум (NH₄⁺/NH₃)', 'mg/L'],
    ];
    const FILTRATION_FIELDS = [
      ['bio_filter_level', 'Ниво на вода во БИО филтер е до обележаното ниво'],
      ['bio_filter_foam', 'Пена во Био филтер'],
      ['mechanical_filter', 'Механички филтер работи нормално'],
      ['circulation_pump', 'Циркулациона пумпа работи нормално'],
      ['thermo_pump', 'Термо пумпа работи нормално'],
      ['aeration', 'Аерација стабилна'],
      ['sieve_filter', 'Сито филтер пред топлотна пумпа - исчистен'],
    ];
    const FISH_FIELDS = [
      ['normal_swimming', 'Нормално пливање'],
      ['no_infection', 'Нема црвенило / инфекција'],
      ['normal_appetite', 'Нормален апетит'],
    ];
    const fmtCheck = (v) => v === true ? 'ОК' : v === false ? 'НЕ' : '–';
    const fmtFoam = (v) => v === 'yes' ? 'Има' : v === 'no' ? 'Нема' : '–';

    // ── Build Excel ──
    const headers = ['Параметар', 'Вредност'];
    const rows = [];

    // 1. Water control
    if (data.water_control) {
      rows.push(['--- 1. КОНТРОЛА НА ВОДА ---', '']);
      for (const [key, label, unit] of WATER_PARAMS) {
        rows.push([`${label}${unit ? ' (' + unit + ')' : ''}`, data.water_control[key] ?? '–']);
      }
    }

    // 2. Filtration
    if (data.filtration_checks) {
      rows.push(['--- 2. ФИЛТРАЦИЈА ---', '']);
      for (const [key, label] of FILTRATION_FIELDS) {
        rows.push([label, key === 'bio_filter_foam' ? fmtFoam(data.filtration_checks[key]) : fmtCheck(data.filtration_checks[key])]);
      }
      if (data.filtration_checks.notes) rows.push(['Забелешка', data.filtration_checks.notes]);
    }

    // 3. Fish visual
    if (data.fish_visual) {
      rows.push(['--- 3. ВИЗУЕЛНА КОНТРОЛА ---', '']);
      for (const [key, label] of FISH_FIELDS) {
        rows.push([label, fmtCheck(data.fish_visual[key])]);
      }
      if (data.fish_visual.notes) rows.push(['Забелешка', data.fish_visual.notes]);
    }

    // 4. Pool status + Feeding
    if (data.pool_feeding.length > 0) {
      rows.push(['--- 4. ЕВИДЕНЦИЈА НА БАЗЕНИ ---', '']);
      let totalKgAll = 0;
      for (const pf of data.pool_feeding) {
        const startCount = parseInt(pf.fish_count) || 0;
        const dead = parseInt(pf.dead_count) || 0;
        const sold = parseInt(pf.sold_count) || 0;
        const processed = (parseInt(pf.processed_count) || 0) + sold;
        const actualCount = startCount - dead - sold;
        const avgW = parseFloat(pf.avg_weight_gr) || 0;
        const poolKg = actualCount > 0 && avgW > 0 ? (actualCount * avgW / 1000) : 0;
        totalKgAll += poolKg;
        rows.push([`Базен ${pf.pool_number} - Број риби`, actualCount]);
        rows.push([`Базен ${pf.pool_number} - Просечна тежина`, pf.avg_weight_gr != null ? `${pf.avg_weight_gr} gr` : '–']);
        rows.push([`Базен ${pf.pool_number} - Вкупна тежина`, poolKg > 0 ? `${poolKg.toFixed(1)} кг` : '–']);
        rows.push([`Базен ${pf.pool_number} - Преработени`, processed || '–']);
        rows.push([`Базен ${pf.pool_number} - Угинати`, dead || '–']);
      }
      rows.push(['', '']);
      rows.push(['Збир - Вкупно риби', data.totals.total_fish]);
      rows.push(['Збир - Вкупна тежина', `${totalKgAll.toFixed(1)} кг`]);
      rows.push(['Збир - Вкупно преработени', data.totals.total_processed]);
      rows.push(['Збир - Вкупно угинати', data.totals.total_dead]);
    }

    // 5. Activities
    if (data.activities) {
      rows.push(['--- 5. АКТИВНОСТИ ---', '']);
      rows.push(['Сортирање', data.activities.sorting_date ? fmtDate(data.activities.sorting_date) : '–']);
      rows.push(['Контрола тежина', data.activities.weight_control_date ? fmtDate(data.activities.weight_control_date) : '–']);
      if (data.activities.misc_1) rows.push(['Разно (1)', data.activities.misc_1]);
      if (data.activities.misc_2) rows.push(['Разно (2)', data.activities.misc_2]);
    }

    // 6. Храна (per-meal breakdown)
    {
      const MEAL_LABELS_XL = { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' };
      const mealTypes = ['breakfast', 'lunch', 'dinner'];
      const hasMealData = data.pool_meals && data.pool_meals.length > 0;

      rows.push(['--- 6. ХРАНА ---', '']);

      if (hasMealData) {
        for (const type of mealTypes) {
          const mealRows = data.pool_meals.filter(m => m.meal_type === type);
          if (mealRows.length === 0) continue;
          const fedBy = mealRows[0]?.fed_by_name || '–';
          const mealTotal = mealRows.reduce((s, m) => s + parseFloat(m.food_quantity_gr || 0), 0);

          rows.push([`${MEAL_LABELS_XL[type]}`, '']);
          for (const m of mealRows) {
            if (parseFloat(m.food_quantity_gr || 0) > 0) {
              rows.push([`  Базен ${m.pool_number}`, `${m.food_type || '–'} — ${m.food_quantity_gr} gr`]);
            }
          }
          rows.push([`  Вкупно ${MEAL_LABELS_XL[type]}`, `${mealTotal} gr`]);
          rows.push([`  Проверил`, fedBy]);
        }
        rows.push(['', '']);
        rows.push(['ВКУПНО ХРАНА (сите оброци)', `${data.totals.total_food_gr} gr`]);
      } else {
        // Fallback: old records without pool_meals
        rows.push(['Нема внесени оброци', '–']);
        if (data.totals.total_food_gr > 0) {
          rows.push(['Храна (од евиденција)', `${data.totals.total_food_gr} gr (${data.totals.food_types})`]);
        }
      }
    }

    // Alerts
    if (data.alerts.length > 0) {
      rows.push(['--- АЛАРМИ ---', '']);
      for (const alert of data.alerts) {
        rows.push([PARAMETER_LABELS[alert.parameter_name] || alert.parameter_name,
          `${alert.value} (норма: ${alert.min_norm ?? '-'} – ${alert.max_norm ?? '-'})`]);
      }
    }

    const excelBuffer = generateExcel(`Дневен ${dateStr}`, headers, rows);

    // ── Build PDF (matching preview sections) ──
    const pdfSections = [
      { heading: `Проверил: ${data.record.checked_by_name}`, lines: [`Датум: ${dateStr}`] },
    ];

    // Alerts first
    if (data.alerts.length > 0) {
      pdfSections.push({
        heading: 'АЛАРМИ',
        keyvalue: data.alerts.map(a => ({
          label: PARAMETER_LABELS[a.parameter_name] || a.parameter_name,
          value: `${a.value} (норма: ${a.min_norm ?? '-'} – ${a.max_norm ?? '-'})`,
          status: 'danger',
        })),
      });
    }

    // 1. Water control
    if (data.water_control) {
      pdfSections.push({
        heading: '1. КОНТРОЛА НА ВОДА',
        keyvalue: WATER_PARAMS.map(([key, label, unit]) => ({
          label: `${label}${unit ? ' (' + unit + ')' : ''}`,
          value: `${data.water_control[key] ?? '–'}`,
        })),
      });
    }

    // 2. Filtration
    if (data.filtration_checks) {
      const filtItems = FILTRATION_FIELDS.map(([key, label]) => {
        const raw = data.filtration_checks[key];
        if (key === 'bio_filter_foam') {
          return {
            label,
            value: raw === 'yes' ? 'Има пена' : raw === 'no' ? 'Нема пена' : '–',
            status: raw === 'yes' ? 'danger' : raw === 'no' ? 'ok' : null,
          };
        }
        return {
          label,
          value: raw === true ? 'ОК' : raw === false ? 'НЕ' : '–',
          status: raw === true ? 'ok' : raw === false ? 'danger' : null,
        };
      });
      if (data.filtration_checks.notes) {
        filtItems.push({ label: 'Забелешка', value: data.filtration_checks.notes });
      }
      pdfSections.push({ heading: '2. ФИЛТРАЦИЈА', keyvalue: filtItems });
    }

    // 3. Fish visual
    if (data.fish_visual) {
      const fishItems = FISH_FIELDS.map(([key, label]) => {
        const raw = data.fish_visual[key];
        return {
          label,
          value: raw === true ? 'ОК' : raw === false ? 'НЕ' : '–',
          status: raw === true ? 'ok' : raw === false ? 'danger' : null,
        };
      });
      if (data.fish_visual.notes) {
        fishItems.push({ label: 'Забелешка', value: data.fish_visual.notes });
      }
      pdfSections.push({ heading: '3. ВИЗУЕЛНА КОНТРОЛА', keyvalue: fishItems });
    }

    // 4. Pool status + Feeding - table
    if (data.pool_feeding.length > 0) {
      const feedHeaders = ['Базен', 'Риби', 'Тежина (gr)', 'Вкупна тежина', 'Преработени', 'Угинати'];
      let pdfTotalKg = 0;
      const feedRows = data.pool_feeding.map(pf => {
        const startCount = parseInt(pf.fish_count) || 0;
        const dead = parseInt(pf.dead_count) || 0;
        const sold = parseInt(pf.sold_count) || 0;
        const processed = (parseInt(pf.processed_count) || 0) + sold;
        const actualCount = startCount - dead - sold;
        const avgW = parseFloat(pf.avg_weight_gr) || 0;
        const poolKg = actualCount > 0 && avgW > 0 ? (actualCount * avgW / 1000) : 0;
        pdfTotalKg += poolKg;
        return [
          pf.pool_number, actualCount, pf.avg_weight_gr ?? '–',
          poolKg > 0 ? `${poolKg.toFixed(1)}` : '–',
          processed || '–', dead || '–',
        ];
      });
      pdfSections.push({ heading: '4. ЕВИДЕНЦИЈА НА БАЗЕНИ', table: { headers: feedHeaders, rows: feedRows } });
      pdfSections.push({
        keyvalue: [
          { label: 'Вкупно риби', value: `${data.totals.total_fish}` },
          { label: 'Вкупна тежина', value: `${pdfTotalKg.toFixed(1)} кг` },
          { label: 'Вкупно преработени', value: `${data.totals.total_processed}` },
          { label: 'Вкупно угинати', value: `${data.totals.total_dead}`, status: data.totals.total_dead > 0 ? 'danger' : null },
        ],
      });
    }

    // 5. Activities
    if (data.activities) {
      const actItems = [
        { label: 'Сортирање', value: data.activities.sorting_date ? fmtDate(data.activities.sorting_date) : '–' },
        { label: 'Контрола тежина', value: data.activities.weight_control_date ? fmtDate(data.activities.weight_control_date) : '–' },
      ];
      if (data.activities.misc_1) actItems.push({ label: 'Разно (1)', value: data.activities.misc_1 });
      if (data.activities.misc_2) actItems.push({ label: 'Разно (2)', value: data.activities.misc_2 });
      pdfSections.push({ heading: '5. АКТИВНОСТИ', keyvalue: actItems });
    }

    // 6. Храна (per-meal breakdown) - PDF
    {
      const MEAL_LABELS_PDF = { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' };
      const mealTypes = ['breakfast', 'lunch', 'dinner'];
      const hasMealData = data.pool_meals && data.pool_meals.length > 0;

      if (hasMealData) {
        const foodHeaders = ['Базен', 'Тип храна', 'Количина (gr)'];
        const allFoodRows = [];

        for (const type of mealTypes) {
          const mealRows = data.pool_meals.filter(m => m.meal_type === type && parseFloat(m.food_quantity_gr || 0) > 0);
          if (mealRows.length === 0) continue;
          const fedBy = mealRows[0]?.fed_by_name || '–';
          const mealTotal = mealRows.reduce((s, m) => s + parseFloat(m.food_quantity_gr || 0), 0);

          // Add meal type header row
          allFoodRows.push([`-- ${MEAL_LABELS_PDF[type]} --`, '', '']);
          for (const m of mealRows) {
            allFoodRows.push([m.pool_number, m.food_type || '–', m.food_quantity_gr]);
          }
          allFoodRows.push(['', `Вкупно: ${mealTotal} gr`, `Проверил: ${fedBy}`]);
        }

        pdfSections.push({
          heading: '6. ХРАНА',
          table: { headers: foodHeaders, rows: allFoodRows },
        });
        pdfSections.push({
          lines: [`ВКУПНО ХРАНА (сите оброци): ${data.totals.total_food_gr} gr`],
        });
      }
    }

    const pdfBuffer = await generatePDF(`Дневен извештај - ${dateStr}`, pdfSections);

    const emailSections = [];

    // Alerts
    if (data.alerts.length > 0) {
      emailSections.push({ type: 'alert', text: `⚠ ${data.alerts.length} аларми` });
      emailSections.push({ type: 'keyvalue', heading: 'Аларми', items: data.alerts.map(a => ({
        label: PARAMETER_LABELS[a.parameter_name] || a.parameter_name,
        value: `${a.value} (норма: ${a.min_norm ?? '-'} – ${a.max_norm ?? '-'})`,
        danger: true,
      }))});
    } else {
      emailSections.push({ type: 'info', text: '✓ Нема аларми — сите параметри се во норма' });
    }

    // 1. Water control
    if (data.water_control) {
      emailSections.push({ type: 'keyvalue', heading: '1. Контрола на вода', items: WATER_PARAMS.map(([key, label, unit]) => ({
        label: `${label}${unit ? ' (' + unit + ')' : ''}`,
        value: data.water_control[key] ?? '–',
      }))});
    }

    // 2. Filtration
    if (data.filtration_checks) {
      emailSections.push({ type: 'keyvalue', heading: '2. Филтрација', items: FILTRATION_FIELDS.map(([key, label]) => ({
        label,
        value: key === 'bio_filter_foam' ? fmtFoam(data.filtration_checks[key]) : fmtCheck(data.filtration_checks[key]),
        danger: key === 'bio_filter_foam' ? data.filtration_checks[key] === 'yes' : data.filtration_checks[key] === false,
      }))});
    }

    // 3. Fish visual
    if (data.fish_visual) {
      emailSections.push({ type: 'keyvalue', heading: '3. Визуелна контрола', items: FISH_FIELDS.map(([key, label]) => ({
        label,
        value: fmtCheck(data.fish_visual[key]),
        danger: data.fish_visual[key] === false,
      }))});
    }

    // 4. Евиденција на базени - Збир
    {
      const emailTotalKg = data.pool_feeding.reduce((s, pf) => {
        const actual = (parseInt(pf.fish_count) || 0) - (parseInt(pf.dead_count) || 0) - (parseInt(pf.sold_count) || 0);
        const w = parseFloat(pf.avg_weight_gr) || 0;
        return s + (actual * w / 1000);
      }, 0);
      const feedingItems = [
        { label: 'Вкупно риби', value: data.totals.total_fish },
        { label: 'Вкупна тежина', value: `${emailTotalKg.toFixed(1)} кг` },
        { label: 'Вкупно преработени', value: data.totals.total_processed },
        { label: 'Вкупно угинати', value: data.totals.total_dead, danger: data.totals.total_dead > 0 },
      ];
      emailSections.push({ type: 'keyvalue', heading: '4. Евиденција на базени - Збир', items: feedingItems });
    }

    // 5. Activities
    if (data.activities) {
      const actItems = [
        { label: 'Сортирање', value: data.activities.sorting_date ? fmtDate(data.activities.sorting_date) : '–' },
        { label: 'Контрола тежина', value: data.activities.weight_control_date ? fmtDate(data.activities.weight_control_date) : '–' },
      ];
      if (data.activities.misc_1) actItems.push({ label: 'Разно (1)', value: data.activities.misc_1 });
      if (data.activities.misc_2) actItems.push({ label: 'Разно (2)', value: data.activities.misc_2 });
      emailSections.push({ type: 'keyvalue', heading: '5. Активности', items: actItems });
    }

    // 6. Храна (per-meal breakdown) - Email
    {
      const MEAL_LABELS_EM = { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' };
      const mealTypes = ['breakfast', 'lunch', 'dinner'];
      const hasMealData = data.pool_meals && data.pool_meals.length > 0;

      if (hasMealData) {
        const foodItems = [];
        for (const type of mealTypes) {
          const mealRows = data.pool_meals.filter(m => m.meal_type === type && parseFloat(m.food_quantity_gr || 0) > 0);
          if (mealRows.length === 0) continue;
          const fedBy = mealRows[0]?.fed_by_name || '–';
          const mealTotal = mealRows.reduce((s, m) => s + parseFloat(m.food_quantity_gr || 0), 0);

          for (const m of mealRows) {
            foodItems.push({
              label: `${MEAL_LABELS_EM[type]} — Базен ${m.pool_number}`,
              value: `${m.food_type || '–'} — ${m.food_quantity_gr} gr`,
            });
          }
          foodItems.push({
            label: `${MEAL_LABELS_EM[type]} — Вкупно`,
            value: `${mealTotal} gr (Проверил: ${fedBy})`,
          });
        }
        foodItems.push({
          label: 'ВКУПНО ХРАНА (сите оброци)',
          value: `${data.totals.total_food_gr} gr`,
        });
        emailSections.push({ type: 'keyvalue', heading: '6. Храна', items: foodItems });
      }
    }

    const emailResult = await sendReportEmail({
      to: recipientEmail,
      subject: `Дневен извештај - Фамаком - ${dateStr}`,
      html: buildEmailHTML({
        title: 'Дневен извештај',
        subtitle: `${dateStr} • Проверил: ${data.record.checked_by_name}`,
        sections: emailSections,
        footerNote: 'Детален извештај е во прилог (Excel и PDF).',
      }),
      attachments: [
        { filename: `dneven-izvestaj-${dateStr}.xlsx`, content: excelBuffer },
        { filename: `dneven-izvestaj-${dateStr}.pdf`, content: pdfBuffer },
      ],
    });

    return { success: emailResult.success };
  } catch (err) {
    console.error('Daily report build/send error:', err);
    return { success: false, error: err.message };
  }
}

// POST /api/reports/daily/:recordId - send daily report
router.post('/daily/:recordId', authMiddleware, async (req, res) => {
  try {
    const recipientEmail = getRequesterEmail(req);
    if (!recipientEmail) {
      return res.json({ message: 'Вашиот профил нема email адреса', sent: false });
    }
    const result = await buildAndSendDailyReport(req.params.recordId, recipientEmail);
    if (result.notFound) {
      return res.status(404).json({ error: 'Записот не е пронајден' });
    }
    res.json({ message: 'Дневниот извештај е испратен', sent: result.success });
  } catch (err) {
    console.error('Daily report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/reports/food-consumption - food consumption report (aggregated by food type)
router.post('/food-consumption', authMiddleware, async (req, res) => {
  try {
    const { from, to, pool_number, sendEmail } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'Внесете период (од-до)' });

    const data = await getFoodConsumptionData(from, to, pool_number);
    const totalGr = data.reduce((sum, d) => sum + parseFloat(d.total_gr || 0), 0);
    const totalKg = (totalGr / 1000).toFixed(2);

    if (sendEmail) {
      const poolLabel = pool_number ? `Базен ${pool_number}` : 'Сите базени';
      const headers = ['Тип храна', 'Набавено (kg)', 'Потрошено (kg)', 'Преостанато (kg)'];
      const rows = data.map(d => [
        d.food_type || 'Непознат',
        d.purchased_kg != null ? parseFloat(d.purchased_kg).toFixed(2) : '–',
        (parseFloat(d.total_gr) / 1000).toFixed(2),
        d.remaining_kg != null ? parseFloat(d.remaining_kg).toFixed(2) : '–',
      ]);
      rows.push(['ВКУПНО', '', totalKg, '']);

      const excelBuffer = generateExcel('Потрошена храна', headers, rows);
      const pdfBuffer = await generatePDF(`Потрошена храна - ${poolLabel} (${fmtDate(from)} - ${fmtDate(to)})`, [
        { table: { headers, rows } },
        { lines: [`Вкупно потрошена храна: ${totalKg} kg`] },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `Потрошена храна - ${poolLabel} (${fmtDate(from)} - ${fmtDate(to)})`,
        html: buildEmailHTML({
          title: 'Потрошена храна',
          subtitle: `${poolLabel} • Период: ${fmtDate(from)} — ${fmtDate(to)}`,
          sections: [
            { type: 'keyvalue', items: [
              ...data.map(d => ({
                label: d.food_type || 'Непознат',
                value: `Набавено: ${d.purchased_kg != null ? parseFloat(d.purchased_kg).toFixed(2) : '–'} kg • Потрошено: ${(parseFloat(d.total_gr) / 1000).toFixed(2)} kg • Преостанато: ${d.remaining_kg != null ? parseFloat(d.remaining_kg).toFixed(2) : '–'} kg`,
              })),
              { label: 'ВКУПНО', value: `${totalKg} kg потрошено` },
            ]},
          ],
          footerNote: 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `potrosena-hrana-${from}-${to}.xlsx`, content: excelBuffer },
          { filename: `potrosena-hrana-${from}-${to}.pdf`, content: pdfBuffer },
        ],
      });
      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });

      return res.json({ message: 'Извештајот е испратен на вашиот email', data, totalKg });
    }

    res.json({ data, totalKg });
  } catch (err) {
    console.error('Food report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/reports/measurement-dates - get available measurement dates
router.get('/measurement-dates', authMiddleware, async (req, res) => {
  try {
    const { pool_number } = req.query;
    const dates = await getMeasurementDates(pool_number);
    res.json({ dates });
  } catch (err) {
    console.error('Measurement dates error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/reports/avg-weight - average weight report from measurements
router.post('/avg-weight', authMiddleware, async (req, res) => {
  try {
    const { pool_number, measurement_date, sendEmail } = req.body;
    const data = await getAvgWeightData(pool_number, measurement_date);

    if (sendEmail) {
      const poolLabel = pool_number ? `Базен ${pool_number}` : 'Сите базени';
      const dateLabel = measurement_date ? fmtDate(measurement_date) : 'Сите мерења';
      const headers = ['Датум', 'Базен', 'Број риби', 'Просечна тежина (gr)'];
      const rows = data.map(d => [
        fmtDate(d.measured_at),
        `Базен ${d.pool_number}`,
        d.fish_count, d.avg_weight_gr,
      ]);

      const excelBuffer = generateExcel('Просечна тежина', headers, rows);
      const pdfBuffer = await generatePDF(`Просечна тежина - ${poolLabel} (${dateLabel})`, [
        { table: { headers, rows } },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `Просечна тежина - ${poolLabel} (${dateLabel})`,
        html: buildEmailHTML({
          title: 'Просечна тежина',
          subtitle: `${poolLabel} • ${dateLabel}`,
          sections: [
            { type: 'keyvalue', items: data.map(d => ({
              label: `Базен ${d.pool_number}`,
              value: `${d.fish_count} риби • ${d.avg_weight_gr} gr просек`,
            }))},
          ],
          footerNote: 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: 'prosecna-tezina.xlsx', content: excelBuffer },
          { filename: 'prosecna-tezina.pdf', content: pdfBuffer },
        ],
      });
      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });

      return res.json({ message: 'Извештајот е испратен на вашиот email', data });
    }

    res.json({ data });
  } catch (err) {
    console.error('Avg weight report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/reports/alerts - alerts report
router.post('/alerts', authMiddleware, async (req, res) => {
  try {
    const { from, to, sendEmail } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'Внесете период (од-до)' });

    const data = await getAlertsReportData(from, to);

    if (sendEmail) {
      const headers = ['Датум', 'Параметар', 'Вредност', 'Мін норма', 'Макс норма'];
      const rows = data.map(d => [
        fmtDate(d.date),
        PARAMETER_LABELS[d.parameter_name] || d.parameter_name,
        d.value, d.min_norm ?? '-', d.max_norm ?? '-',
      ]);

      const excelBuffer = generateExcel('Аларми', headers, rows);
      const pdfBuffer = await generatePDF(`Извештај за аларми (${fmtDate(from)} - ${fmtDate(to)})`, [
        { lines: [`Вкупно аларми: ${rows.length}`] },
        { table: { headers, rows } },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `Извештај за аларми (${fmtDate(from)} - ${fmtDate(to)})`,
        html: buildEmailHTML({
          title: 'Извештај за аларми',
          subtitle: `Период: ${fmtDate(from)} — ${fmtDate(to)}`,
          sections: [
            rows.length > 0
              ? { type: 'alert', text: `⚠ Вкупно ${rows.length} аларми во овој период` }
              : { type: 'info', text: '✓ Нема аларми во овој период' },
            { type: 'keyvalue', items: data.slice(0, 10).map(d => ({
              label: PARAMETER_LABELS[d.parameter_name] || d.parameter_name,
              value: `${d.value} (норма: ${d.min_norm ?? '-'} – ${d.max_norm ?? '-'})`,
              danger: true,
            }))},
          ],
          footerNote: rows.length > 10 ? `Прикажани 10 од ${rows.length} — целосен список во прилог.` : 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `alarmi-${from}-${to}.xlsx`, content: excelBuffer },
          { filename: `alarmi-${from}-${to}.pdf`, content: pdfBuffer },
        ],
      });
      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });

      return res.json({ message: 'Извештајот е испратен на вашиот email', data, total: data.length });
    }

    res.json({ data, total: data.length });
  } catch (err) {
    console.error('Alerts report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/reports/sorting - sorting report
router.post('/sorting', authMiddleware, async (req, res) => {
  try {
    const { from, to, sendEmail } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'Внесете период (од-до)' });

    const data = await getSortingReportData(from, to);
    const sortingDates = data.map(d => fmtDate(d.sorting_date));

    if (sendEmail) {
      const headers = ['Бр.', 'Датум на сортирање'];
      const rows = sortingDates.map((d, i) => [i + 1, d]);

      const excelBuffer = generateExcel('Сортирање', headers, rows);
      const pdfBuffer = await generatePDF(`Извештај за сортирање (${fmtDate(from)} - ${fmtDate(to)})`, [
        { lines: [`Вкупно сортирања: ${rows.length}`] },
        { heading: 'Датуми на сортирање:', lines: sortingDates },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `Извештај за сортирање (${fmtDate(from)} - ${fmtDate(to)})`,
        html: buildEmailHTML({
          title: 'Сортирање на риби',
          subtitle: `Период: ${fmtDate(from)} — ${fmtDate(to)}`,
          sections: [
            { type: 'info', text: `Вкупно ${rows.length} сортирања во овој период` },
            { type: 'keyvalue', items: sortingDates.map((d, i) => ({
              label: `Сортирање #${i + 1}`,
              value: d,
            }))},
          ],
          footerNote: 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `sortiranje-${from}-${to}.xlsx`, content: excelBuffer },
          { filename: `sortiranje-${from}-${to}.pdf`, content: pdfBuffer },
        ],
      });
      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });

      return res.json({ message: 'Извештајот е испратен на вашиот email', dates: sortingDates, total: sortingDates.length });
    }

    res.json({ dates: sortingDates, total: sortingDates.length });
  } catch (err) {
    console.error('Sorting report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/reports/food-purchases - food purchase history report
router.post('/food-purchases', authMiddleware, async (req, res) => {
  try {
    const { from, to, sendEmail } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'Внесете период (од-до)' });

    const data = await getFoodPurchaseData(from, to);
    const totalKg = data.reduce((sum, d) => sum + parseFloat(d.change_kg || 0), 0).toFixed(2);

    if (sendEmail) {
      const headers = ['Датум', 'Тип храна', 'Количина (kg)', 'Внесено од'];
      const rows = data.map(d => [
        fmtDate(d.purchased_at || d.created_at),
        d.food_type,
        parseFloat(d.change_kg).toFixed(2),
        d.created_by_name || '-',
      ]);

      const excelBuffer = generateExcel('Набавки на храна', headers, rows);
      const pdfBuffer = await generatePDF(`Набавки на храна (${fmtDate(from)} - ${fmtDate(to)})`, [
        { lines: [`Вкупно набавки: ${data.length}`, `Вкупно количина: ${totalKg} kg`] },
        { table: { headers, rows } },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `Набавки на храна (${fmtDate(from)} - ${fmtDate(to)})`,
        html: buildEmailHTML({
          title: 'Набавки на храна',
          subtitle: `Период: ${fmtDate(from)} — ${fmtDate(to)}`,
          sections: [
            { type: 'keyvalue', items: [
              { label: 'Вкупно набавки', value: `${data.length}` },
              { label: 'Вкупна количина', value: `${totalKg} kg` },
            ]},
            { type: 'keyvalue', heading: 'Детали', items: data.slice(0, 15).map(d => ({
              label: `${d.food_type} — ${fmtDate(d.purchased_at || d.created_at)}`,
              value: `${parseFloat(d.change_kg).toFixed(2)} kg`,
            }))},
          ],
          footerNote: data.length > 15 ? `Прикажани 15 од ${data.length} — целосен список во прилог.` : 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `nabavki-${from}-${to}.xlsx`, content: excelBuffer },
          { filename: `nabavki-${from}-${to}.pdf`, content: pdfBuffer },
        ],
      });
      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });

      return res.json({ message: 'Извештајот е испратен на вашиот email', data, total: data.length, totalKg });
    }

    res.json({ data, total: data.length, totalKg });
  } catch (err) {
    console.error('Food purchases report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/reports/inventory - food inventory report (current stock + recent changes)
router.post('/inventory', authMiddleware, async (req, res) => {
  try {
    const { sendEmail } = req.body;

    // Get current inventory
    const invResult = await pool.query(
      'SELECT * FROM food_inventory ORDER BY food_type'
    );
    const inventory = invResult.rows;

    // Get recent log entries (last 30)
    const logResult = await pool.query(
      `SELECT fil.*, u.full_name as created_by_name
       FROM food_inventory_log fil
       LEFT JOIN users u ON fil.created_by = u.id
       WHERE fil.reason IN ('purchase', 'consumption')
       ORDER BY fil.created_at DESC
       LIMIT 30`
    );
    const log = logResult.rows;

    if (sendEmail) {
      const now = new Date();
      const dateStr = fmtDate(now);

      // Excel
      const headers = ['Тип храна', 'Залиха (kg)', 'Последно ажурирано'];
      const rows = inventory.map(item => [
        item.food_type,
        parseFloat(item.quantity_kg).toFixed(2),
        fmtDate(item.updated_at),
      ]);

      const excelBuffer = generateExcel('Залихи на храна', headers, rows);

      // PDF
      const pdfSections = [
        { table: { headers, rows } },
      ];
      if (log.length > 0) {
        const logHeaders = ['Тип храна', 'Промена (kg)', 'Тип', 'Датум'];
        const logRows = log.slice(0, 20).map(entry => [
          entry.food_type,
          `${entry.reason === 'purchase' ? '+' : ''}${parseFloat(entry.change_kg).toFixed(2)}`,
          entry.reason === 'purchase' ? 'Набавка' : 'Потрошувачка',
          fmtDate(entry.created_at),
        ]);
        pdfSections.push({ heading: 'Последни промени', table: { headers: logHeaders, rows: logRows } });
      }

      const pdfBuffer = await generatePDF(`Залихи на храна - ${dateStr}`, pdfSections);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });

      // Email sections
      const emailSections = [
        { type: 'keyvalue', heading: 'Тековни залихи', items: inventory.map(item => {
          const qty = parseFloat(item.quantity_kg);
          return {
            label: item.food_type,
            value: `${qty.toFixed(2)} kg`,
            danger: qty <= 5,
          };
        })},
      ];

      // Low stock warning
      const lowStock = inventory.filter(item => parseFloat(item.quantity_kg) <= 5);
      if (lowStock.length > 0) {
        emailSections.unshift({
          type: 'alert',
          text: `⚠ ${lowStock.length} тип/а храна со ниски залихи (≤ 5 kg)`,
        });
      }

      const emailResult = await sendReportEmail({
        to: recipientEmail,
        subject: `Залихи на храна - Фамаком - ${dateStr}`,
        html: buildEmailHTML({
          title: 'Залихи на храна',
          subtitle: `Генерирано: ${dateStr}`,
          sections: emailSections,
          footerNote: 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `zalihi-hrana-${dateStr}.xlsx`, content: excelBuffer },
          { filename: `zalihi-hrana-${dateStr}.pdf`, content: pdfBuffer },
        ],
      });

      if (!emailResult.success) return res.status(500).json({ error: `Грешка при испраќање: ${emailResult.error}` });

      return res.json({ message: 'Извештајот е испратен на вашиот email', sent: true });
    }

    res.json({ inventory, log });
  } catch (err) {
    console.error('Inventory report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
module.exports.buildAndSendDailyReport = buildAndSendDailyReport;
