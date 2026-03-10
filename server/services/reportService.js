const pool = require('../db/connection');
const path = require('path');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

// Cyrillic-compatible fonts (DejaVu Sans supports full Cyrillic)
const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'DejaVuSans-Bold.ttf');

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
    total_fish: feedingRows.reduce((sum, f) => sum + parseInt(f.fish_count || 0), 0),
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
  let query = `SELECT COALESCE(NULLIF(pf.food_type, ''), 'Непознат') as food_type,
     COALESCE(SUM(pf.food_quantity_gr), 0)::float as total_gr,
     fi.quantity_kg::float as remaining_kg
     FROM pool_feeding pf
     JOIN daily_records dr ON pf.daily_record_id = dr.id
     LEFT JOIN food_inventory fi ON fi.food_type = pf.food_type
     WHERE dr.date >= $1 AND dr.date <= $2
       AND pf.food_quantity_gr IS NOT NULL AND pf.food_quantity_gr > 0`;
  const params = [from, to];
  if (poolNumber) {
    params.push(parseInt(poolNumber));
    query += ` AND pf.pool_number = $${params.length}`;
  }
  query += ` GROUP BY COALESCE(NULLIF(pf.food_type, ''), 'Непознат'), fi.quantity_kg ORDER BY food_type`;
  const result = await pool.query(query, params);
  return result.rows;
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
  primary: '#1a1a8a',      // Фамаком dark blue
  primaryLight: '#2563eb',
  accentGold: '#d4a017',   // Фамаком gold line
  sectionTitle: '#1a1a8a',
  tableHeader: '#1a1a8a',
  tableHeaderText: '#ffffff',
  tableRowAlt: '#f0f4fa',
  tableRowNormal: '#ffffff',
  tableBorder: '#d1d5db',
  text: '#1f2937',
  textLight: '#6b7280',
  danger: '#dc2626',
};

// ── Memorandum header/footer constants ──
const MARGIN = 50;
const PAGE_WIDTH = 595 - MARGIN * 2; // A4 usable width
const HEADER_HEIGHT = 90;   // space reserved for header
const FOOTER_Y = 765;       // where footer starts
const CONTENT_BOTTOM = 750; // max Y before page break

// Draw memorandum header on a page
function drawMemoHeader(doc) {
  // Logo top-left (scaled to ~150px wide)
  try {
    doc.image(LOGO_MAIN, MARGIN, 25, { width: 150 });
  } catch (e) {
    // Fallback text if logo missing
    doc.font('DejaVu-Bold').fontSize(18).fillColor(COLORS.primary)
      .text('Фамаком Аквакултура', MARGIN, 30);
  }

  // Horizontal line from after logo to right margin
  doc.save();
  doc.moveTo(220, 55).lineTo(595 - MARGIN, 55)
    .lineWidth(1).strokeColor('#333333').stroke();
  doc.restore();
}

// Draw memorandum footer on a page
function drawMemoFooter(doc, pageNum, totalPages) {
  doc.save();

  // Horizontal line
  doc.moveTo(MARGIN, FOOTER_Y).lineTo(595 - MARGIN, FOOTER_Y)
    .lineWidth(0.8).strokeColor('#333333').stroke();

  // Company info text
  doc.font('DejaVu').fontSize(7).fillColor(COLORS.textLight);
  doc.text(
    'друштво за производство и трговија на риба  ФАМАКОМ АКВАКУЛТУРА  доо увоз-извоз',
    MARGIN, FOOTER_Y + 6, { width: PAGE_WIDTH - 70, align: 'center' }
  );
  doc.text(
    'ул.11ти Октомври бр.2, 1400 Велес, Република Македонија, e-mail: famakom@t.mk',
    MARGIN, FOOTER_Y + 16, { width: PAGE_WIDTH - 70, align: 'center' }
  );

  // Small logo bottom-right
  try {
    doc.image(LOGO_SMALL, 595 - MARGIN - 65, FOOTER_Y + 4, { width: 60 });
  } catch (e) { /* skip if missing */ }

  // Page number
  doc.font('DejaVu').fontSize(7).fillColor(COLORS.textLight)
    .text(`Страна ${pageNum} од ${totalPages}`,
      MARGIN, FOOTER_Y + 30, { width: PAGE_WIDTH, align: 'center' });

  doc.restore();
}

// Generate PDF with Фамаком memorandum
function generatePDF(title, sections) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];

    // Register Cyrillic-compatible fonts
    doc.registerFont('DejaVu', FONT_REGULAR);
    doc.registerFont('DejaVu-Bold', FONT_BOLD);

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── Page 1 header ──
    drawMemoHeader(doc);

    // ── Title ──
    doc.y = HEADER_HEIGHT + 10;
    doc.font('DejaVu-Bold').fontSize(14).fillColor(COLORS.sectionTitle)
      .text(title, MARGIN, doc.y, { align: 'center', width: PAGE_WIDTH });
    doc.moveDown(0.3);
    doc.font('DejaVu').fontSize(8).fillColor(COLORS.textLight)
      .text(`Генерирано: ${new Date().toLocaleString('mk-MK')}`, { align: 'center' });
    doc.moveDown(1.2);

    // Helper: add new page with memo header
    function newPage() {
      doc.addPage();
      drawMemoHeader(doc);
      doc.y = HEADER_HEIGHT + 10;
    }

    // ── Sections ──
    for (const section of sections) {
      if (doc.y > CONTENT_BOTTOM - 60) newPage();

      if (section.heading) {
        doc.font('DejaVu-Bold').fontSize(11).fillColor(COLORS.sectionTitle)
          .text(section.heading, MARGIN);
        // Gold accent line under heading (Фамаком style)
        const headingY = doc.y + 2;
        doc.save();
        doc.moveTo(MARGIN, headingY).lineTo(MARGIN + 80, headingY)
          .lineWidth(2).strokeColor(COLORS.accentGold).stroke();
        doc.restore();
        doc.moveDown(0.5);
      }

      if (section.lines) {
        doc.font('DejaVu').fontSize(9.5).fillColor(COLORS.text);
        for (const line of section.lines) {
          if (doc.y > CONTENT_BOTTOM - 15) newPage();
          const isDanger = /АЛАРМ|ОПАСНОСТ|НЕ\s*$/i.test(line);
          doc.fillColor(isDanger ? COLORS.danger : COLORS.text).text(line, MARGIN);
        }
        doc.moveDown(0.7);
      }

      if (section.table) {
        const { headers, rows } = section.table;
        const colCount = headers.length;
        const colWidth = PAGE_WIDTH / colCount;
        const rowHeight = 20;
        const headerHeight = 24;
        const fontSize = colCount > 4 ? 7 : 8;

        function drawTableHeader(startY) {
          doc.save();
          doc.rect(MARGIN, startY, PAGE_WIDTH, headerHeight).fill(COLORS.tableHeader);
          doc.font('DejaVu-Bold').fontSize(fontSize).fillColor(COLORS.tableHeaderText);
          for (let i = 0; i < colCount; i++) {
            doc.text(String(headers[i] ?? ''), MARGIN + i * colWidth + 5, startY + 6,
              { width: colWidth - 10, lineBreak: false });
          }
          doc.restore();
          return startY + headerHeight;
        }

        if (doc.y > CONTENT_BOTTOM - 80) newPage();
        let y = drawTableHeader(doc.y);

        for (let r = 0; r < rows.length; r++) {
          if (y > CONTENT_BOTTOM - 15) {
            newPage();
            y = drawTableHeader(doc.y);
          }

          const bgColor = r % 2 === 0 ? COLORS.tableRowNormal : COLORS.tableRowAlt;
          doc.save();
          doc.rect(MARGIN, y, PAGE_WIDTH, rowHeight).fill(bgColor);
          doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + PAGE_WIDTH, y + rowHeight)
            .lineWidth(0.5).strokeColor(COLORS.tableBorder).stroke();

          doc.font('DejaVu').fontSize(fontSize).fillColor(COLORS.text);
          const row = rows[r];
          for (let i = 0; i < colCount; i++) {
            doc.text(String(row[i] ?? ''), MARGIN + i * colWidth + 5, y + 5,
              { width: colWidth - 10, lineBreak: false });
          }
          doc.restore();
          y += rowHeight;
        }

        // Table outer border
        const tableTop = y - rows.length * rowHeight - headerHeight;
        doc.save();
        doc.rect(MARGIN, tableTop, PAGE_WIDTH, headerHeight + rows.length * rowHeight)
          .lineWidth(0.8).strokeColor(COLORS.tableBorder).stroke();
        doc.restore();

        doc.y = y + 8;
        doc.moveDown(0.4);
      }
    }

    // ── Draw footer on all pages ──
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
