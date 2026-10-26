// PDF извештај на меморандум (server/assets/documents/memo.pdf како позадина на секоја страница).
// Табела со автоматско прелистување на страници; фонт Candara.

const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'documents');
const FONTS_DIR = path.join(__dirname, '..', 'fonts');
const NAVY = rgb(0.1137, 0.1765, 0.3922);
const BLACK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.75, 0.78, 0.86);

const CONTENT_TOP = 140;      // под заглавјето на меморандумот (top-origin, pt)
const CONTENT_BOTTOM = 785;   // над футерот
const MARGIN_X = 40;

let cache = {};
function readCached(key, file) { if (!cache[key]) cache[key] = fs.readFileSync(file); return cache[key]; }

function fmtMoney(v) {
  const n = parseFloat(v) || 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

/**
 * build({ title, subtitle, filters: [string], columns: [{ label, width, align }], rows: [[...]], totals: [[...]], note })
 *  - width во pt; align 'left' | 'right'
 */
async function buildMemoTable({ title, subtitle, filters = [], columns, rows, totals = [], note }) {
  const tpl = await PDFDocument.load(readCached('tpl:memo', path.join(TEMPLATES_DIR, 'memo.pdf')));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.catalog.set(PDFName.of('ViewerPreferences'), doc.context.obj({ PrintScaling: PDFName.of('None'), Duplex: PDFName.of('Simplex') }));
  const font = await doc.embedFont(readCached('font:regular', path.join(FONTS_DIR, 'Candara.ttf')), { subset: true });
  const bold = await doc.embedFont(readCached('font:bold', path.join(FONTS_DIR, 'Candara-Bold.ttf')), { subset: true });
  const [tplPage] = tpl.getPages();
  const embedded = await doc.embedPage(tplPage);
  const W = tplPage.getWidth(), H = tplPage.getHeight();

  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const scale = Math.min(1, (W - 2 * MARGIN_X) / totalW);
  const cols = columns.map(c => ({ ...c, width: c.width * scale }));

  let page = null, y = 0, pageNo = 0;
  const text = (t, x, top, { size = 9, f = font, color = BLACK, align = 'left', maxWidth } = {}) => {
    t = t == null ? '' : String(t);
    if (!t) return;
    let sz = size;
    if (maxWidth) while (sz > 5 && f.widthOfTextAtSize(t, sz) > maxWidth) sz -= 0.5;
    const w = f.widthOfTextAtSize(t, sz);
    const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page.drawText(t, { x: xx, y: H - top, size: sz, font: f, color });
  };
  const hline = (top, color = LINE, thickness = 0.5) =>
    page.drawLine({ start: { x: MARGIN_X, y: H - top }, end: { x: W - MARGIN_X, y: H - top }, thickness, color });

  const drawHeaderRow = () => {
    let x = MARGIN_X;
    page.drawRectangle({ x: MARGIN_X, y: H - y - 16, width: W - 2 * MARGIN_X, height: 16, color: NAVY });
    for (const c of cols) {
      const cx = c.align === 'right' ? x + c.width - 4 : x + 4;
      text(c.label, cx, y + 11.5, { size: 8.5, f: bold, color: rgb(1, 1, 1), align: c.align || 'left', maxWidth: c.width - 8 });
      x += c.width;
    }
    y += 18;
  };

  const newPage = () => {
    pageNo++;
    page = doc.addPage([W, H]);
    page.drawPage(embedded, { x: 0, y: 0 });
    y = CONTENT_TOP;
    if (pageNo === 1) {
      text(title, MARGIN_X, y, { size: 15, f: bold, color: NAVY }); y += 16;
      if (subtitle) { text(subtitle, MARGIN_X, y, { size: 9.5, color: GREY }); y += 12; }
      for (const f of filters) { text(f, MARGIN_X, y, { size: 8.5, color: GREY }); y += 11; }
      y += 6;
    } else {
      text(`${title} (продолжение)`, MARGIN_X, y, { size: 10, f: bold, color: NAVY }); y += 14;
    }
    drawHeaderRow();
  };

  const drawRow = (cells, { f = font, size = 8.5, color = BLACK, bg } = {}) => {
    if (y + 14 > CONTENT_BOTTOM) newPage();
    if (bg) page.drawRectangle({ x: MARGIN_X, y: H - y - 13, width: W - 2 * MARGIN_X, height: 14, color: bg });
    let x = MARGIN_X;
    cells.forEach((cell, i) => {
      const c = cols[i];
      const cx = c.align === 'right' ? x + c.width - 4 : x + 4;
      text(cell, cx, y + 10, { size, f, color, align: c.align || 'left', maxWidth: c.width - 8 });
      x += c.width;
    });
    y += 14;
    hline(y - 0.5);
  };

  newPage();
  for (const r of rows) drawRow(r);
  if (totals.length) {
    y += 2;
    for (const t of totals) drawRow(t, { f: bold, size: 9, color: NAVY, bg: rgb(0.93, 0.95, 0.99) });
  }
  if (note) { y += 6; if (y + 12 > CONTENT_BOTTOM) newPage(); text(note, MARGIN_X, y, { size: 8, color: GREY }); }

  // Нумерација
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Страница ${i + 1} од ${pages.length}`;
    p.drawText(t, { x: W - MARGIN_X - font.widthOfTextAtSize(t, 7.5), y: H - (CONTENT_BOTTOM + 6), size: 7.5, font, color: GREY });
  });

  return Buffer.from(await doc.save());
}

module.exports = { buildMemoTable, fmtMoney };
