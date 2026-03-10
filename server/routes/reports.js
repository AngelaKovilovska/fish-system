const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const { sendReportEmail } = require('../services/emailService');
const {
  getDailyReportData, getFoodConsumptionData, getFoodPurchaseData,
  getMeasurementDates, getAvgWeightData, getAlertsReportData,
  getSortingReportData, generateExcel, generatePDF, PARAMETER_LABELS,
} = require('../services/reportService');

const router = express.Router();

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


// POST /api/reports/daily/:recordId - send daily report to all users
router.post('/daily/:recordId', authMiddleware, async (req, res) => {
  try {
    const data = await getDailyReportData(req.params.recordId);
    if (!data.record) {
      return res.status(404).json({ error: 'Записот не е пронајден' });
    }

    const dateStr = fmtDate(data.record.date);

    // ── Section-specific labels (matching preview) ──
    const WATER_PARAMS = [
      ['temperature', 'Температура', '°C'],
      ['ph', 'pH', ''],
      ['dissolved_oxygen', 'DO (кислород)', 'mg/L'],
      ['nitrates', 'Нитрати (NO3)', 'mg/L'],
      ['nitrites', 'Нитрити (NO2)', 'mg/L'],
      ['hardness', 'TH (тврдина)', 'mg/L'],
      ['tds', 'TDS', 'ppm'],
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
      ['no_injuries', 'Нема повреди'],
      ['no_infection', 'Нема црвенило / инфекција'],
      ['normal_appetite', 'Нормален апетит'],
      ['no_dead', 'Нема угинати'],
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
        const count = parseInt(pf.fish_count) || 0;
        const avgW = parseFloat(pf.avg_weight_gr) || 0;
        const poolKg = count > 0 && avgW > 0 ? (count * avgW / 1000) : 0;
        totalKgAll += poolKg;
        rows.push([`Базен ${pf.pool_number} - Број риби`, pf.fish_count ?? '–']);
        rows.push([`Базен ${pf.pool_number} - Просечна тежина`, pf.avg_weight_gr != null ? `${pf.avg_weight_gr} gr` : '–']);
        rows.push([`Базен ${pf.pool_number} - Вкупно кг`, poolKg > 0 ? `${poolKg.toFixed(1)} кг` : '–']);
        rows.push([`Базен ${pf.pool_number} - Продадени`, pf.sold_count ?? '–']);
        rows.push([`Базен ${pf.pool_number} - Угинати`, pf.dead_count ?? '–']);
      }
      rows.push(['', '']);
      rows.push(['Збир - Вкупно риби', data.totals.total_fish]);
      rows.push(['Збир - Вкупно кг', `${totalKgAll.toFixed(1)} кг`]);
      rows.push(['Збир - Вкупно продадени', data.totals.total_sold]);
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
        lines: data.alerts.map(a =>
          `${PARAMETER_LABELS[a.parameter_name] || a.parameter_name}: ${a.value} (норма: ${a.min_norm ?? '-'} – ${a.max_norm ?? '-'})`
        ),
      });
    }

    // 1. Water control
    if (data.water_control) {
      pdfSections.push({
        heading: '1. КОНТРОЛА НА ВОДА',
        lines: WATER_PARAMS.map(([key, label, unit]) =>
          `${label}${unit ? ' (' + unit + ')' : ''}: ${data.water_control[key] ?? '–'}`
        ),
      });
    }

    // 2. Filtration
    if (data.filtration_checks) {
      const filtLines = FILTRATION_FIELDS.map(([key, label]) =>
        `${label}: ${key === 'bio_filter_foam' ? fmtFoam(data.filtration_checks[key]) : fmtCheck(data.filtration_checks[key])}`
      );
      if (data.filtration_checks.notes) filtLines.push(`Забелешка: ${data.filtration_checks.notes}`);
      pdfSections.push({ heading: '2. ФИЛТРАЦИЈА', lines: filtLines });
    }

    // 3. Fish visual
    if (data.fish_visual) {
      const fishLines = FISH_FIELDS.map(([key, label]) => `${label}: ${fmtCheck(data.fish_visual[key])}`);
      if (data.fish_visual.notes) fishLines.push(`Забелешка: ${data.fish_visual.notes}`);
      pdfSections.push({ heading: '3. ВИЗУЕЛНА КОНТРОЛА', lines: fishLines });
    }

    // 4. Pool status + Feeding - table
    if (data.pool_feeding.length > 0) {
      const feedHeaders = ['Базен', 'Риби', 'Тежина (gr)', 'Вкупно кг', 'Продадени', 'Угинати'];
      let pdfTotalKg = 0;
      const feedRows = data.pool_feeding.map(pf => {
        const count = parseInt(pf.fish_count) || 0;
        const avgW = parseFloat(pf.avg_weight_gr) || 0;
        const poolKg = count > 0 && avgW > 0 ? (count * avgW / 1000) : 0;
        pdfTotalKg += poolKg;
        return [
          pf.pool_number, pf.fish_count ?? '–', pf.avg_weight_gr ?? '–',
          poolKg > 0 ? `${poolKg.toFixed(1)}` : '–',
          pf.sold_count ?? '–', pf.dead_count ?? '–',
        ];
      });
      pdfSections.push({ heading: '4. ЕВИДЕНЦИЈА НА БАЗЕНИ', table: { headers: feedHeaders, rows: feedRows } });
      pdfSections.push({
        lines: [`Збир → Риби: ${data.totals.total_fish} | Вкупно: ${pdfTotalKg.toFixed(1)} кг | Продадени: ${data.totals.total_sold} | Угинати: ${data.totals.total_dead}`],
      });

    }

    // 5. Activities
    if (data.activities) {
      const actLines = [
        `Сортирање: ${data.activities.sorting_date ? fmtDate(data.activities.sorting_date) : '–'}`,
        `Контрола тежина: ${data.activities.weight_control_date ? fmtDate(data.activities.weight_control_date) : '–'}`,
      ];
      if (data.activities.misc_1) actLines.push(`Разно (1): ${data.activities.misc_1}`);
      if (data.activities.misc_2) actLines.push(`Разно (2): ${data.activities.misc_2}`);
      pdfSections.push({ heading: '5. АКТИВНОСТИ', lines: actLines });
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
          allFoodRows.push([`── ${MEAL_LABELS_PDF[type]} ──`, '', '']);
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

    // Send to requesting user's email
    const recipientEmail = getRequesterEmail(req);
    if (!recipientEmail) {
      return res.json({ message: 'Вашиот профил нема email адреса', sent: false });
    }

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
        const c = parseInt(pf.fish_count) || 0;
        const w = parseFloat(pf.avg_weight_gr) || 0;
        return s + (c * w / 1000);
      }, 0);
      const feedingItems = [
        { label: 'Вкупно риби', value: data.totals.total_fish },
        { label: 'Вкупно кг', value: `${emailTotalKg.toFixed(1)} кг` },
        { label: 'Вкупно продадени', value: data.totals.total_sold },
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

    res.json({ message: 'Дневниот извештај е испратен', sent: emailResult.success });
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
      const headers = ['Тип храна', 'Потрошено (kg)', 'Преостанато (kg)'];
      const rows = data.map(d => [
        d.food_type || 'Непознат',
        (parseFloat(d.total_gr) / 1000).toFixed(2),
        d.remaining_kg != null ? parseFloat(d.remaining_kg).toFixed(1) : '–',
      ]);
      rows.push(['ВКУПНО', totalKg, '']);

      const excelBuffer = generateExcel('Потрошена храна', headers, rows);
      const pdfBuffer = await generatePDF(`Потрошена храна - ${poolLabel} (${fmtDate(from)} - ${fmtDate(to)})`, [
        { table: { headers, rows } },
        { lines: [`Вкупно потрошена храна: ${totalKg} kg`] },
      ]);

      const recipientEmail = getRequesterEmail(req);
      if (!recipientEmail) return res.status(400).json({ error: 'Вашиот профил нема email адреса' });
      await sendReportEmail({
        to: recipientEmail,
        subject: `Потрошена храна - ${poolLabel} (${fmtDate(from)} - ${fmtDate(to)})`,
        html: buildEmailHTML({
          title: 'Потрошена храна',
          subtitle: `${poolLabel} • Период: ${fmtDate(from)} — ${fmtDate(to)}`,
          sections: [
            { type: 'keyvalue', items: [
              ...data.map(d => ({
                label: d.food_type || 'Непознат',
                value: `${(parseFloat(d.total_gr) / 1000).toFixed(2)} kg потрошено • ${d.remaining_kg != null ? parseFloat(d.remaining_kg).toFixed(1) + ' kg преостанато' : '–'}`,
              })),
              { label: 'ВКУПНО', value: `${totalKg} kg` },
            ]},
          ],
          footerNote: 'Детален извештај е во прилог (Excel и PDF).',
        }),
        attachments: [
          { filename: `potrosena-hrana-${from}-${to}.xlsx`, content: excelBuffer },
          { filename: `potrosena-hrana-${from}-${to}.pdf`, content: pdfBuffer },
        ],
      });

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
      await sendReportEmail({
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
      await sendReportEmail({
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
      await sendReportEmail({
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
      await sendReportEmail({
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

      return res.json({ message: 'Извештајот е испратен на вашиот email', data, total: data.length, totalKg });
    }

    res.json({ data, total: data.length, totalKg });
  } catch (err) {
    console.error('Food purchases report error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
