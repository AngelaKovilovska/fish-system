const pool = require('../db/connection');
const path = require('path');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

// Modern Roboto font (supports Cyrillic)
const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Roboto-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Roboto-Bold.ttf');

// Memorandum assets
const LOGO_MAIN = path.join(__dirname, '..', 'assets', 'logo-famakom.jpg');
const LOGO_SMALL = path.join(__dirname, '..', 'assets', 'logo-famakom-small.jpg');

const PARAMETER_LABELS = {
  // Water control
  temperature: 'Температура',
  ph: 'pH',
  dissolved_oxygen: 'DO (кислород)',
  nitrates: 'Нитрати (NO3)',
  nitrites: 'Нитрити (NO2)',
  hardness: 'TH (тврдина)',
  tds: 'TDS',
  // Filtration
  bio_filter_level: 'Био филтер ниво',
  bio_filter_foam: 'Пена во Био филтер',
  mechanical_filter: 'Механички филтер',
  circulation_pump: 'Циркулациона пумпа',
  thermo_pump: 'Термо пумпа',
  aeration: 'Аерација',
  sieve_filter: 'Сито филтер',
  // Fish visual
  normal_swimming: 'Нормално пливање',
  no_injuries: 'Нема повреди',
  no_infection: 'Нема инфекција',
  normal_appetite: 'Нормален апетит',
  no_dead: 'Нема угинати',
};

const MEAL_LABELS = { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' };

// Generate daily report data
async function getDailyReportData(recordId) {
  const [record, water, filtration, fishVisual, feeding, activities, alerts] = await Promise.all([
    pool.query('SELECT dr.*, u.full_name as checked_by_name FROM daily_records dr JOIN users u ON dr.checked_by = u.id WHERE dr.id = $1', [recordId]),
    pool.query('SELECT * FROM water_control WHERE daily_record_id = $1', [recordId]),
    pool.query('SELECT * FROM filtration_checks WHERE daily_record_id = $1', [recordId]),
    pool.query('SELECT * FROM fish_visual WHERE daily_record_id = $1', [recordId]),
    pool.query('SELECT * FROM pool_feeding WHERE daily_record_id = $1 ORDER BY pool_number', [recordId]),
    pool.query('SELECT * FROM activities WHERE daily_record_id = $1', [recordId]),
    pool.query('SELECT * FROM alerts WHERE daily_record_id = $1', [recordId]),
  ]);

  const feedingRows = feeding.rows;
  const recordDate = record.rows[0]?.date;

  // Fetch pool_meals for this date (new per-meal feeding system)
  let mealsRows = [];
  let mealsInfo = {};
  if (recordDate) {
    const d = new Date(recordDate);
    const dateStr = typeof recordDate === 'string' && recordDate.length === 10
      ? recordDate
      : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const mealsResult = await pool.query(
      `SELECT pm.*, u.full_name as fed_by_name
       FROM pool_meals pm
       LEFT JOIN users u ON pm.fed_by = u.id
       WHERE pm.date = $1
       ORDER BY pm.meal_type, pm.pool_number`,
      [dateStr]
    );
    mealsRows = mealsResult.rows;

    // Build meals_info: who entered each meal
    for (const type of ['breakfast', 'lunch', 'dinner']) {
      const meal = mealsRows.find(m => m.meal_type === type);
      if (meal) {
        mealsInfo[type] = { fed_by_name: meal.fed_by_name, created_at: meal.created_at };
      }
    }
  }

  const hasMeals = mealsRows.length > 0;

  // Calculate food totals - use pool_meals if available, fallback to pool_feeding
  let total_food_gr, food_types;
  if (hasMeals) {
    total_food_gr = mealsRows.reduce((sum, m) => sum + parseFloat(m.food_quantity_gr || 0), 0);
    food_types = [...new Set(mealsRows.map(m => m.food_type).filter(Boolean))].join(', ');
  } else {
    total_food_gr = feedingRows.reduce((sum, f) => sum + parseFloat(f.food_quantity_gr || 0), 0);
    food_types = [...new Set(feedingRows.map(f => f.food_type).filter(Boolean))].join(', ');
  }

  // Food per pool (sum of all meals per pool)
  const food_per_pool = [];
  for (let p = 1; p <= 6; p++) {
    if (hasMeals) {
      const poolMeals = mealsRows.filter(m => m.pool_number === p);
      food_per_pool.push({
        pool_number: p,
        total_food_gr: poolMeals.reduce((sum, m) => sum + parseFloat(m.food_quantity_gr || 0), 0),
        meals: poolMeals.map(m => ({
          meal_type: m.meal_type,
          food_type: m.food_type,
          food_quantity_gr: parseFloat(m.food_quantity_gr || 0),
        })),
      });
    } else {
      const pf = feedingRows.find(f => f.pool_number === p);
      food_per_pool.push({
        pool_number: p,
        total_food_gr: parseFloat(pf?.food_quantity_gr || 0),
        meals: pf?.food_type ? [{ meal_type: null, food_type: pf.food_type, food_quantity_gr: parseFloat(pf.food_quantity_gr || 0) }] : [],
      });
    }
  }

  const totals = {
    total_food_gr,
    total_fish: feedingRows.reduce((sum, f) => {
      const start = parseInt(f.fish_count || 0);
      const dead = parseInt(f.dead_count || 0);
      const sold = parseInt(f.sold_count || 0);
      return sum + (start - dead - sold);
    }, 0),
    total_sold: feedingRows.reduce((sum, f) => sum + parseInt(f.sold_count || 0), 0),
    total_dead: feedingRows.reduce((sum, f) => sum + parseInt(f.dead_count || 0), 0),
    food_types,
  };

  return {
    record: record.rows[0],
    water_control: water.rows[0],
    filtration_checks: filtration.rows[0],
    fish_visual: fishVisual.rows[0],
    pool_feeding: feedingRows,
    pool_meals: mealsRows,
    meals_info: mealsInfo,
    food_per_pool,
    activities: activities.rows[0],
    alerts: alerts.rows,
    totals,
  };
}

// Generate food consumption report - aggregated by food type + remaining stock
async function getFoodConsumptionData(from, to, poolNumber) {
  const params = [from, to];
  let poolFilter = '';
  if (poolNumber) {
    params.push(parseInt(poolNumber));
    poolFilter = ` AND combined.pool_number = $${params.length}`;
  }

  // Period consumption from feeding tables
  const consumedQuery = `
    SELECT COALESCE(NULLIF(combined.food_type, ''), 'Непознат') as food_type,
           COALESCE(SUM(combined.total_gr), 0)::float as total_gr
    FROM (
      SELECT food_type, food_quantity_gr as total_gr, date, pool_number
      FROM pool_meals
      WHERE date >= $1 AND date <= $2
        AND food_quantity_gr IS NOT NULL AND food_quantity_gr > 0
      UNION ALL
      SELECT pf.food_type, pf.food_quantity_gr as total_gr, dr.date, pf.pool_number
      FROM pool_feeding pf
      JOIN daily_records dr ON pf.daily_record_id = dr.id
      WHERE dr.date >= $1 AND dr.date <= $2
        AND pf.food_quantity_gr IS NOT NULL AND pf.food_quantity_gr > 0
        AND NOT EXISTS (
          SELECT 1 FROM pool_meals pm
          WHERE pm.date = dr.date AND pm.pool_number = pf.pool_number
        )
    ) combined
    WHERE combined.food_type IS NOT NULL AND combined.food_type != ''
    ${poolFilter}
    GROUP BY COALESCE(NULLIF(combined.food_type, ''), 'Непознат')
    ORDER BY CASE COALESCE(NULLIF(combined.food_type, ''), 'Непознат')
        WHEN 'Advance (1.5mm)' THEN 1
        WHEN 'Pregrower-15 (2mm)' THEN 2
        WHEN 'SpecialPro EF (3mm)' THEN 3
        WHEN 'Grower-13EF (3mm)' THEN 4
        WHEN 'Grower-13EF (4.5mm)' THEN 5
        WHEN 'Grower-13EF (6mm)' THEN 6
        ELSE 7
      END`;

  const consumedResult = await pool.query(consumedQuery, params);

  // Total purchased and all-time consumed (for accurate remaining calculation)
  const inventoryQuery = `
    SELECT
      fi.food_type,
      COALESCE(p.purchased_kg, 0)::float as purchased_kg,
      COALESCE(ac.all_consumed_gr, 0)::float as all_consumed_gr
    FROM food_inventory fi
    LEFT JOIN (
      SELECT food_type, SUM(change_kg) as purchased_kg
      FROM food_inventory_log WHERE reason = 'purchase'
      GROUP BY food_type
    ) p ON p.food_type = fi.food_type
    LEFT JOIN (
      SELECT food_type, SUM(consumed_gr) as all_consumed_gr
      FROM (
        SELECT food_type, food_quantity_gr as consumed_gr
        FROM pool_meals WHERE food_quantity_gr > 0 AND food_type IS NOT NULL AND food_type != ''
        UNION ALL
        SELECT pf.food_type, pf.food_quantity_gr
        FROM pool_feeding pf
        WHERE pf.food_quantity_gr > 0 AND pf.food_type IS NOT NULL AND pf.food_type != ''
        AND NOT EXISTS (
          SELECT 1 FROM pool_meals pm
          JOIN daily_records dr ON pf.daily_record_id = dr.id
          WHERE pm.date = dr.date AND pm.pool_number = pf.pool_number
        )
      ) all_fed
      GROUP BY food_type
    ) ac ON ac.food_type = fi.food_type`;

  const inventoryResult = await pool.query(inventoryQuery);

  // Build inventory lookup: remaining = purchased - all_consumed
  const inventoryMap = {};
  for (const row of inventoryResult.rows) {
    const remaining = row.purchased_kg - (row.all_consumed_gr / 1000);
    inventoryMap[row.food_type] = {
      purchased_kg: row.purchased_kg,
      remaining_kg: Math.max(0, parseFloat(remaining.toFixed(2))),
    };
  }

  // Merge consumed with inventory data
  return consumedResult.rows.map(row => ({
    food_type: row.food_type,
    total_gr: row.total_gr,
    purchased_kg: inventoryMap[row.food_type]?.purchased_kg ?? null,
    remaining_kg: inventoryMap[row.food_type]?.remaining_kg ?? null,
  }));
}

// Get distinct measurement dates
async function getMeasurementDates(poolNumber) {
  let query = `SELECT DISTINCT measured_at::date as date FROM pool_measurements`;
  const params = [];
  if (poolNumber) {
    params.push(parseInt(poolNumber));
    query += ` WHERE pool_number = $${params.length}`;
  }
  query += ' ORDER BY date DESC';
  const result = await pool.query(query, params);
  return result.rows.map(r => r.date);
}

// Generate average weight report from pool_measurements (optional pool + date filter)
async function getAvgWeightData(poolNumber, measurementDate) {
  let query = `SELECT pool_number, fish_count, avg_weight_gr, measured_at
     FROM pool_measurements`;
  const params = [];
  const conditions = [];
  if (poolNumber) {
    params.push(parseInt(poolNumber));
    conditions.push(`pool_number = $${params.length}`);
  }
  if (measurementDate) {
    params.push(measurementDate);
    conditions.push(`measured_at::date = $${params.length}`);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY measured_at DESC, pool_number';
  const result = await pool.query(query, params);
  return result.rows;
}

// Generate alerts report
async function getAlertsReportData(from, to) {
  const result = await pool.query(
    `SELECT a.*, dr.date
     FROM alerts a
     JOIN daily_records dr ON a.daily_record_id = dr.id
     WHERE dr.date >= $1 AND dr.date <= $2
     ORDER BY dr.date, a.parameter_name`,
    [from, to]
  );
  return result.rows;
}

// Generate sorting report
async function getSortingReportData(from, to) {
  const result = await pool.query(
    `SELECT dr.date, act.sorting_date
     FROM activities act
     JOIN daily_records dr ON act.daily_record_id = dr.id
     WHERE dr.date >= $1 AND dr.date <= $2
       AND act.sorting_date IS NOT NULL
     ORDER BY act.sorting_date`,
    [from, to]
  );
  return result.rows;
}

// Generate food purchase history report
async function getFoodPurchaseData(from, to) {
  const result = await pool.query(
    `SELECT fil.food_type, fil.change_kg, fil.purchased_at, fil.created_at, u.full_name as created_by_name
     FROM food_inventory_log fil
     LEFT JOIN users u ON fil.created_by = u.id
     WHERE fil.reason = 'purchase'
       AND COALESCE(fil.purchased_at, fil.created_at::date) >= $1
       AND COALESCE(fil.purchased_at, fil.created_at::date) <= $2
     ORDER BY COALESCE(fil.purchased_at, fil.created_at::date) DESC, fil.food_type`,
    [from, to]
  );
  return result.rows;
}

// Generate Excel buffer from data
function generateExcel(sheetName, headers, rows) {
  const wb = XLSX.utils.book_new();
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws['!cols'] = headers.map(() => ({ wch: 18 }));

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── Color palette (matching Фамаком brand) ──
const COLORS = {
  primary: '#1a1a8a',
  accentGold: '#d4a017',
  sectionTitle: '#1a1a8a',
  tableHeader: '#1a1a8a',
  tableHeaderText: '#ffffff',
  tableRowAlt: '#f5f7fa',
  tableRowNormal: '#ffffff',
  tableBorder: '#e2e5ea',
  text: '#1f2937',
  textLight: '#6b7280',
  textMuted: '#9ca3af',
  success: '#16a34a',
  danger: '#dc2626',
  kvAltBg: '#f8f9fb',
  kvBorder: '#e5e7eb',
};

// ── Memorandum header/footer constants ──
const MARGIN = 50;
const PAGE_WIDTH = 595 - MARGIN * 2; // A4 usable width
const HEADER_HEIGHT = 90;   // space reserved for header
const FOOTER_Y = 765;       // where footer starts
const CONTENT_BOTTOM = 750; // max Y before page break

// Draw memorandum header on a page
function drawMemoHeader(doc) {
  try {
    doc.image(LOGO_MAIN, MARGIN, 25, { width: 150 });
  } catch (e) {
    doc.font('Roboto-Bold').fontSize(18).fillColor(COLORS.primary)
      .text('Фамаком Аквакултура', MARGIN, 30);
  }

  doc.save();
  doc.moveTo(220, 55).lineTo(595 - MARGIN, 55)
    .lineWidth(1).strokeColor('#333333').stroke();
  doc.restore();
}

// Draw memorandum footer on a page
function drawMemoFooter(doc, pageNum, totalPages) {
  const origBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0; // prevent auto-page during footer rendering
  doc.save();

  doc.moveTo(MARGIN, FOOTER_Y).lineTo(595 - MARGIN, FOOTER_Y)
    .lineWidth(0.8).strokeColor('#333333').stroke();

  doc.font('Roboto').fontSize(7).fillColor(COLORS.textLight);
  doc.text(
    'друштво за производство и трговија на риба  ФАМАКОМ АКВАКУЛТУРА  доо увоз-извоз',
    MARGIN, FOOTER_Y + 4, { width: PAGE_WIDTH - 70, align: 'center', lineBreak: false }
  );
  doc.text(
    'ул.11ти Октомври бр.2, 1400 Велес, Република Македонија, e-mail: famakom@t.mk',
    MARGIN, FOOTER_Y + 13, { width: PAGE_WIDTH - 70, align: 'center', lineBreak: false }
  );

  try {
    doc.image(LOGO_SMALL, 595 - MARGIN - 65, FOOTER_Y + 2, { width: 60 });
  } catch (e) { /* skip if missing */ }

  doc.font('Roboto').fontSize(7).fillColor(COLORS.textLight)
    .text(`Страна ${pageNum} од ${totalPages}`,
      MARGIN, FOOTER_Y + 23, { width: PAGE_WIDTH, align: 'center', lineBreak: false });

  doc.restore();
  doc.page.margins.bottom = origBottom;
}

// Generate PDF with Фамаком memorandum
function generatePDF(title, sections) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];

    doc.registerFont('Roboto', FONT_REGULAR);
    doc.registerFont('Roboto-Bold', FONT_BOLD);

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── Page 1 ──
    drawMemoHeader(doc);

    doc.y = HEADER_HEIGHT + 10;
    doc.font('Roboto-Bold').fontSize(13).fillColor(COLORS.sectionTitle)
      .text(title, MARGIN, doc.y, { align: 'center', width: PAGE_WIDTH });
    doc.moveDown(0.15);
    doc.font('Roboto').fontSize(7.5).fillColor(COLORS.textMuted)
      .text(`Генерирано: ${new Date().toLocaleString('mk-MK')}`, { align: 'center' });
    doc.moveDown(0.8);

    // Only create new page when content actually needs space
    function ensureSpace(needed) {
      if (doc.y > CONTENT_BOTTOM - needed) {
        doc.addPage();
        drawMemoHeader(doc);
        doc.y = HEADER_HEIGHT + 10;
      }
    }

    // ── Render sections ──
    for (const section of sections) {
      // Section heading
      if (section.heading) {
        ensureSpace(45);
        doc.font('Roboto-Bold').fontSize(10).fillColor(COLORS.sectionTitle)
          .text(section.heading, MARGIN, doc.y);
        const hy = doc.y + 2;
        doc.save();
        doc.moveTo(MARGIN, hy).lineTo(MARGIN + 60, hy)
          .lineWidth(2).strokeColor(COLORS.accentGold).stroke();
        doc.restore();
        doc.moveDown(0.35);
      }

      // Plain text lines
      if (section.lines) {
        doc.font('Roboto').fontSize(9).fillColor(COLORS.text);
        for (const line of section.lines) {
          ensureSpace(14);
          const isDanger = /АЛАРМ|ОПАСНОСТ|НЕ\s*$/i.test(line);
          doc.fillColor(isDanger ? COLORS.danger : COLORS.text).text(line, MARGIN);
        }
        doc.moveDown(0.5);
      }

      // Key-value pairs (clean two-column checklist layout)
      if (section.keyvalue) {
        const items = section.keyvalue;
        const labelW = Math.floor(PAGE_WIDTH * 0.62);
        const rowH = 17;

        for (let i = 0; i < items.length; i++) {
          ensureSpace(rowH);
          const item = items[i];
          const y = doc.y;
          const bg = i % 2 === 0 ? COLORS.tableRowNormal : COLORS.kvAltBg;

          doc.save();
          doc.rect(MARGIN, y, PAGE_WIDTH, rowH).fill(bg);

          // Subtle row separator
          if (i < items.length - 1) {
            doc.moveTo(MARGIN + 6, y + rowH).lineTo(MARGIN + PAGE_WIDTH - 6, y + rowH)
              .lineWidth(0.3).strokeColor(COLORS.kvBorder).stroke();
          }

          // Label
          doc.font('Roboto').fontSize(8.5).fillColor(COLORS.text);
          doc.text(String(item.label || ''), MARGIN + 10, y + 4,
            { width: labelW - 20, lineBreak: false });

          // Status indicator dot
          if (item.status === 'ok') {
            doc.circle(MARGIN + labelW - 4, y + rowH / 2, 2.5).fill(COLORS.success);
          } else if (item.status === 'danger') {
            doc.circle(MARGIN + labelW - 4, y + rowH / 2, 2.5).fill(COLORS.danger);
          }

          // Value (colored by status)
          const valColor = item.status === 'danger' ? COLORS.danger
            : item.status === 'ok' ? COLORS.success : COLORS.text;
          doc.font('Roboto-Bold').fontSize(8.5).fillColor(valColor);
          doc.text(String(item.value ?? '–'), MARGIN + labelW + 4, y + 4,
            { width: PAGE_WIDTH - labelW - 14, lineBreak: false });

          doc.restore();
          doc.y = y + rowH;
        }
        doc.moveDown(0.5);
      }

      // Data table
      if (section.table) {
        const { headers, rows } = section.table;
        const colCount = headers.length;
        const colWidth = PAGE_WIDTH / colCount;
        const rowH = 18;
        const headerH = 22;
        const fontSize = colCount > 5 ? 6.5 : colCount > 4 ? 7 : 8;

        function drawTblHeader(startY) {
          doc.save();
          doc.rect(MARGIN, startY, PAGE_WIDTH, headerH).fill(COLORS.tableHeader);
          doc.font('Roboto-Bold').fontSize(fontSize).fillColor(COLORS.tableHeaderText);
          for (let c = 0; c < colCount; c++) {
            doc.text(String(headers[c] ?? ''), MARGIN + c * colWidth + 4, startY + 5,
              { width: colWidth - 8, lineBreak: false });
          }
          doc.restore();
          return startY + headerH;
        }

        ensureSpace(headerH + rowH + 5);
        let y = drawTblHeader(doc.y);

        for (let r = 0; r < rows.length; r++) {
          if (y > CONTENT_BOTTOM - rowH) {
            doc.addPage();
            drawMemoHeader(doc);
            doc.y = HEADER_HEIGHT + 10;
            y = drawTblHeader(doc.y);
          }

          const bg = r % 2 === 0 ? COLORS.tableRowNormal : COLORS.tableRowAlt;
          doc.save();
          doc.rect(MARGIN, y, PAGE_WIDTH, rowH).fill(bg);
          doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + PAGE_WIDTH, y + rowH)
            .lineWidth(0.3).strokeColor(COLORS.tableBorder).stroke();

          doc.font('Roboto').fontSize(fontSize).fillColor(COLORS.text);
          const row = rows[r];
          for (let c = 0; c < colCount; c++) {
            const cellVal = String(row[c] ?? '');
            // Bold separator rows (meal headers like -- Појадок --)
            if (c === 0 && cellVal.startsWith('--')) {
              doc.font('Roboto-Bold').fillColor(COLORS.sectionTitle);
            }
            doc.text(cellVal, MARGIN + c * colWidth + 4, y + 4,
              { width: colWidth - 8, lineBreak: false });
            doc.font('Roboto').fillColor(COLORS.text);
          }
          doc.restore();
          y += rowH;
        }

        // Outer border
        const tableTop = y - rows.length * rowH - headerH;
        doc.save();
        doc.rect(MARGIN, tableTop, PAGE_WIDTH, headerH + rows.length * rowH)
          .lineWidth(0.5).strokeColor(COLORS.tableBorder).stroke();
        doc.restore();

        doc.y = y + 5;
        doc.moveDown(0.3);
      }
    }

    // ── Footer on all pages ──
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      drawMemoFooter(doc, i + 1, pageCount);
    }

    doc.end();
  });
}

module.exports = {
  getDailyReportData,
  getFoodConsumptionData,
  getFoodPurchaseData,
  getMeasurementDates,
  getAvgWeightData,
  getAlertsReportData,
  getSortingReportData,
  generateExcel,
  generatePDF,
  PARAMETER_LABELS,
};
