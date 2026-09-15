// Пополнување на официјалните PDF урнеци (фактура, декларација, комерцијален документ)
// со податоци од продажба. Урнеците се во server/assets/documents и НЕ се менуваат —
// текстот се впишува на точни координати (pdf-lib), со Candara фонт.

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { addMonths, dateFromLot } = require('./inventory');

const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'documents');
const FONTS_DIR = path.join(__dirname, '..', 'fonts');

const NAVY = rgb(0.1137, 0.1765, 0.3922);
const BLACK = rgb(0.05, 0.05, 0.05);
const WHITE = rgb(1, 1, 1);

const cache = {};
function readCached(key, file) {
  if (!cache[key]) cache[key] = fs.readFileSync(file);
  return cache[key];
}

async function openTemplate(name) {
  const doc = await PDFDocument.load(readCached(`tpl:${name}`, path.join(TEMPLATES_DIR, `${name}.pdf`)));
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readCached('font:regular', path.join(FONTS_DIR, 'Candara.ttf')), { subset: true });
  const bold = await doc.embedFont(readCached('font:bold', path.join(FONTS_DIR, 'Candara-Bold.ttf')), { subset: true });
  const page = doc.getPages()[0];
  return { doc, page, font, bold, H: page.getHeight() };
}

// ── helpers ──
function fmtDate(d) {
  if (!d) return '';
  const x = typeof d === 'string' ? new Date(d.slice(0, 10) + 'T00:00:00') : new Date(d);
  if (isNaN(x.getTime())) return '';
  return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`;
}
function num(v, dec = 2) { return (parseFloat(v) || 0).toFixed(dec); }
function str(v) { return v == null ? '' : String(v); }

// Draw text using TOP-origin coordinates (како во pdfplumber): `top` е baseline од горе.
function draw(ctx, text, { x, top, size = 10, font, color = NAVY, align = 'left', maxWidth }) {
  text = str(text);
  if (!text) return;
  const f = font || ctx.font;
  let sz = size;
  if (maxWidth) {
    while (sz > 5 && f.widthOfTextAtSize(text, sz) > maxWidth) sz -= 0.5;
  }
  const w = f.widthOfTextAtSize(text, sz);
  let xx = x;
  if (align === 'right') xx = x - w;
  else if (align === 'center') xx = x - w / 2;
  ctx.page.drawText(text, { x: xx, y: ctx.H - top, size: sz, font: f, color });
}

function whiteBox(ctx, { x0, x1, top, bottom, pad = 0.6 }) {
  ctx.page.drawRectangle({
    x: x0 - pad, y: ctx.H - bottom - pad, width: x1 - x0 + 2 * pad, height: bottom - top + 2 * pad,
    color: WHITE, borderWidth: 0,
  });
}

// ── заеднички податоци од продажба ──
function saleFacts(sale) {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const totalKg = items.reduce((s, i) => s + (parseFloat(i.quantity_kg) || 0), 0);
  const lots = [...new Set(items.map(i => i.lot_number || sale.lot_number || '').filter(Boolean))];
  const firstLot = lots[0] || '';
  const lotDate = dateFromLot(firstLot);
  const expiry = lotDate ? addMonths(lotDate, 6) : null;
  return { items, totalKg, lots, firstLot, lotDate, expiry };
}

// ═══════════════ ФАКТУРА / ИСПРАТНИЦА ═══════════════
async function buildInvoice(sale) {
  const ctx = await openTemplate('invoice');
  const { items, lots } = saleFacts(sale);
  const B = ctx.bold;

  // Купувач блок (вредности десно од вертикалната линија x=100.3)
  const VX = 106;
  draw(ctx, sale.buyer_name, { x: VX, top: 173.5, size: 10.5, font: B, maxWidth: 295 });
  draw(ctx, sale.buyer_address, { x: VX, top: 198.3, size: 10, maxWidth: 295 });
  const contact = [sale.buyer_contact, sale.buyer_phone].filter(Boolean).join(' · ');
  draw(ctx, contact, { x: VX, top: 223, size: 10, maxWidth: 295 });
  draw(ctx, sale.buyer_edb, { x: VX, top: 247.6, size: 10, maxWidth: 295 });

  // Број и датум (центрирано над линиите)
  const CX = 519.5;
  draw(ctx, sale.invoice_number, { x: CX, top: 219, size: 10, font: B, align: 'center' });
  draw(ctx, fmtDate(sale.sale_date), { x: CX, top: 247.5, size: 10, font: B, align: 'center' });

  // Ставки — 9 реда, линии на овие „top“ позиции
  const ROWS = [328.5, 356.9, 385.2, 413.6, 441.9, 470.3, 498.6, 527.0, 555.3];
  items.slice(0, ROWS.length).forEach((it, i) => {
    const base = ROWS[i] - 8.5;
    const name = `${it.name ? it.name.charAt(0).toUpperCase() + it.name.slice(1) : 'Риба'} (Clarias gariepinus) - ${it.code || ''}`;
    draw(ctx, name, { x: 45, top: base, size: 10, maxWidth: 236 });
    draw(ctx, num(it.quantity_kg), { x: 369, top: base, size: 10, align: 'right' });
    draw(ctx, num(it.price_per_kg), { x: 467, top: base, size: 10, align: 'right' });
    draw(ctx, num(it.amount), { x: 567, top: base, size: 10, align: 'right' });
  });

  // Износ / ДДВ / Се вкупно
  const vatRate = parseFloat(sale.vat_rate) || 5;
  if (Math.abs(vatRate - 5) > 0.01) {
    whiteBox(ctx, { x0: 427, x1: 466, top: 591.5, bottom: 605.5 });
    draw(ctx, `ДДВ ${num(vatRate, 0)}%:`, { x: 464.5, top: 601.6, size: 10, align: 'right' });
  }
  draw(ctx, num(sale.subtotal), { x: 567, top: 575.8, size: 10, align: 'right' });
  draw(ctx, num(sale.vat_amount), { x: 567, top: 602.6, size: 10, align: 'right' });
  draw(ctx, num(sale.total), { x: 567, top: 629.8, size: 11, font: B, align: 'right' });

  // ЛОТ (бело на сина лента, по „ЛОТ:“)
  draw(ctx, lots.join(', '), { x: 114, top: 629.3, size: 10, font: B, color: WHITE, maxWidth: 78 });

  return ctx.doc.save();
}

// ═══════════════ ДЕКЛАРАЦИЈА ═══════════════
async function buildDeclaration(sale) {
  const ctx = await openTemplate('declaration');
  const { totalKg, firstLot, lotDate, expiry } = saleFacts(sale);
  const X = 161.5, SZ = 6.5, MAXW = 88;
  const rows = [
    [219.6, `${num(totalKg)} кг`],
    [231.2, fmtDate(lotDate)],
    [242.7, fmtDate(lotDate)],
    [254.3, fmtDate(expiry)],
    [265.8, firstLot],
  ];
  for (const [top, val] of rows) draw(ctx, val, { x: X, top, size: SZ, font: ctx.bold, color: BLACK, maxWidth: MAXW });
  return ctx.doc.save();
}

// ═══════════════ КОМЕРЦИЈАЛЕН ДОКУМЕНТ (Службен весник) ═══════════════
async function buildCommercial(sale) {
  const ctx = await openTemplate('commercial');
  const { totalKg, lots, expiry } = saleFacts(sale);
  const SZ = 10;

  // Секое поле = жолтиот правоаголник од урнекот: се бели и се впишува вредност
  const field = (x0, x1, top, bottom, value, opts = {}) => {
    whiteBox(ctx, { x0, x1, top, bottom });
    draw(ctx, value, { x: x0 + 2, top: bottom - 2.8, size: opts.size || SZ, font: opts.bold ? ctx.bold : ctx.font, color: BLACK, maxWidth: x1 - x0 - 4, ...opts });
  };
  const box = (x0, x1, top, bottom, checked) => {
    whiteBox(ctx, { x0, x1, top, bottom });
    // квадратче
    ctx.page.drawRectangle({ x: x0, y: ctx.H - bottom + 1.2, width: 6, height: 6, borderColor: BLACK, borderWidth: 0.7 });
    if (checked) draw(ctx, 'X', { x: x0 + 1.1, top: bottom - 1.6, size: 7, font: ctx.bold, color: BLACK });
  };

  field(303.8, 463.1, 109.3, 121.6, sale.dispatch_number, { bold: true });   // Сериски број на КД
  field(303.8, 463.0, 145.9, 158.2, sale.invoice_number, { bold: true });    // Архивски број (фактура)
  field(256.0, 335.7, 229.9, 242.1, num(totalKg), { bold: true });           // 1.2 количина
  // 1.3 „Вакуум пакување“ — веќе впишано, само се трга жолтото (текст + подвлекување се исцртуваат повторно)
  field(258.1, 346, 259.5, 271.6, 'Вакуум пакување', { bold: true });
  ctx.page.drawLine({ start: { x: 260.1, y: ctx.H - 270.2 }, end: { x: 260.1 + ctx.bold.widthOfTextAtSize('Вакуум пакување', 10), y: ctx.H - 270.2 }, thickness: 0.6, color: BLACK });
  field(100.8, 185.5, 301.1, 313.4, lots.join(', '), { bold: true });        // LOT
  field(199.7, 309.0, 330.6, 342.9, fmtDate(expiry));                        // 1.5 рок на траење
  field(479.4, 554.3, 330.6, 342.9, sale.dispatch_number);                   // 1.6 пропратен документ
  field(202.0, 311.3, 361.1, 373.4, fmtDate(sale.sale_date));                // датум на испраќање
  field(445.5, 555.2, 361.1, 373.4, '');                                     // датум на прием (рачно)
  field(266.0, 390.3, 504.3, 516.4, sale.transport_vehicle ? 'Товарно возило' : ''); // 3.3 вид
  field(266.8, 391.4, 522.5, 534.8, sale.transport_vehicle);                 // 3.4 рег. број
  field(414.1, 448.9, 540.9, 553.1, '-18', { bold: true });                  // 3.5 температура

  box(113.4, 118.8, 559.1, 570.2, false); field(199.0, 221.2, 559.1, 570.2, '', { size: 9 });      // амбиентална
  box(265.6, 271.0, 559.1, 570.2, false); field(349.0, 371.3, 559.1, 570.2, '', { size: 9 });      // разладена
  box(452.5, 457.9, 559.1, 570.2, true);  field(535.8, 562.8, 559.1, 570.2, '-18', { size: 9, bold: true }); // длабоко замрзната

  field(114.5, 333.6, 599.0, 611.2, sale.buyer_name, { bold: true });        // 4.1 примач
  field(496.7, 561.5, 599.0, 611.2, sale.buyer_edb);                         // ЕИБ
  field(114.1, 562.5, 617.3, 629.5, sale.buyer_address);                     // 4.2 адреса
  field(59.6, 169.1, 756.0, 768.2, fmtDate(sale.sale_date));                 // датум

  return ctx.doc.save();
}

const BUILDERS = { invoice: buildInvoice, declaration: buildDeclaration, commercial: buildCommercial };

async function buildDocument(type, sale) {
  const fn = BUILDERS[type];
  if (!fn) throw new Error('Непознат тип на документ');
  return Buffer.from(await fn(sale));
}

module.exports = { buildDocument, DOCUMENT_TYPES: Object.keys(BUILDERS) };
