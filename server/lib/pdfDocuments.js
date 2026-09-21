// Пополнување на официјалните PDF урнеци (фактура, декларација, комерцијален документ)
// со податоци од продажба. Урнеците се во server/assets/documents и НЕ се менуваат —
// текстот се впишува на точни координати (pdf-lib), со Candara фонт.

const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, rgb } = require('pdf-lib');
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
  // Печати во вистинска големина (без „fit to page“ смалување)
  doc.catalog.set(PDFName.of('ViewerPreferences'), doc.context.obj({ PrintScaling: PDFName.of('None') }));
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
function groupInt(int) { return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
// 12584.25 → „12.584,25 ден.“
function money(v) {
  const [int, dec] = num(v).split('.');
  const sign = int.startsWith('-') ? '-' : '';
  return `${sign}${groupInt(int.replace('-', ''))},${dec} ден.`;
}
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
// Координати од урнекот „ФАКТУРА - ИСПРАТНИЦА Clario НОВО.pdf“ (top-origin, pt)
async function buildInvoice(sale) {
  const ctx = await openTemplate('invoice');
  const { items, lots } = saleFacts(sale);
  const B = ctx.bold;

  // Купувач блок (вредности десно од вертикалната линија x=100.3); редови: 152.4 / 177.1 / 201.8 / 226.5 / 251.1
  // Вредностите се вертикално на средина на редот (baseline ≈ средина + 3.5)
  const VX = 106;
  draw(ctx, sale.buyer_name, { x: VX, top: 168.5, size: 11.5, font: B, maxWidth: 295 });
  draw(ctx, sale.buyer_address, { x: VX, top: 193, size: 10, maxWidth: 295 });
  draw(ctx, sale.buyer_edb, { x: VX, top: 217.6, size: 10, maxWidth: 295 });
  const contact = [sale.buyer_contact, sale.buyer_phone].filter(Boolean).join(' · ');
  draw(ctx, contact, { x: VX, top: 242.3, size: 10, maxWidth: 295 });

  // Начин на плаќање — само за готово/гратис, над „ИСПРАТНИЦА / ФАКТУРА“
  const CX = 515.5; // центар на линиите за број/датум (458.8–572.2)
  const PAY_LABELS = { 'готово': 'ПЛАТЕНО ВО ГОТОВО', 'гратис': 'ГРАТИС' };
  const payLabel = PAY_LABELS[String(sale.payment_method || '').toLowerCase()];
  if (payLabel) draw(ctx, payLabel, { x: CX, top: 141, size: 13, font: B, align: 'center', maxWidth: 118 });

  // Број (линија 222.8) и датум (линија 251.1)
  draw(ctx, sale.invoice_number, { x: CX, top: 219, size: 13, font: B, align: 'center' });
  draw(ctx, fmtDate(sale.sale_date), { x: CX, top: 247.5, size: 12, font: B, align: 'center' });

  // Ставки — линии на овие „top“ позиции; првиот ред се прескокнува (ставките почнуваат од вториот)
  // Колони: Производ 39.5–286.2 | Количина 286.2–374.8 | Ед.цена 374.8–472.3 | Вкупно 472.3–562.1
  const ROWS = [328.5, 356.9, 385.2, 413.6, 441.9, 470.3, 498.6, 527.0, 555.6];
  const FIRST_ROW = 1;
  const QTY_R = 369.5, PRICE_R = 467, AMT_R = 557;
  items.slice(0, ROWS.length - FIRST_ROW).forEach((it, i) => {
    const base = ROWS[i + FIRST_ROW] - 10.5; // вертикално на средина на редот (ред = 28.4)
    // Формат: Риба (Clarias gariepinus) - РСГ
    const name = `Риба (Clarias gariepinus) - ${it.code || ''}`;
    draw(ctx, name, { x: 45, top: base, size: 11, maxWidth: 236 });
    draw(ctx, num(it.quantity_kg), { x: QTY_R, top: base, size: 11, align: 'right' });
    draw(ctx, money(it.price_per_kg), { x: PRICE_R, top: base, size: 11, align: 'right' });
    draw(ctx, money(it.amount), { x: AMT_R, top: base, size: 11, align: 'right' });
  });

  // Износи (редови 572.6 / 589.6 / 606.6 / 623.6 / 640.6, натписи десно порамнети на x=469.7)
  const vatRate = Number.isFinite(parseFloat(sale.vat_rate)) ? parseFloat(sale.vat_rate) : 5; // 0 = без ДДВ (готово/гратис)
  const noVat = vatRate <= 0.001;
  if (!noVat && Math.abs(vatRate - 5) > 0.01) {
    whiteBox(ctx, { x0: 438, x1: 471, top: 576.5, bottom: 588.5 });
    draw(ctx, `ДДВ ${num(vatRate, 0)}%:`, { x: 469.7, top: 586.4, size: 9, align: 'right' });
  }
  const total = parseFloat(sale.total) || 0;
  const payable = Math.round(total);            // ЗА ПЛАЌАЊЕ — цел денар
  const rounding = payable - total;             // Порамнување на дени
  draw(ctx, money(sale.subtotal), { x: AMT_R, top: 569.5, size: 10, align: 'right' });
  // Без ДДВ (готово/гратис) → колоната останува празна
  if (!noVat) draw(ctx, money(sale.vat_amount), { x: AMT_R, top: 586.4, size: 10, align: 'right' });
  draw(ctx, money(total), { x: AMT_R, top: 603.3, size: 10, align: 'right' });
  draw(ctx, money(rounding), { x: AMT_R, top: 620.7, size: 10, align: 'right' });
  draw(ctx, money(payable), { x: AMT_R, top: 638.2, size: 10, font: B, align: 'right', maxWidth: 84 });

  // ЛОТ (бело на сина лента, по „ЛОТ:“ x=86.9–109.9, top 620.6–631.6)
  draw(ctx, lots.join(', '), { x: 114, top: 629.6, size: 10, font: B, color: WHITE, maxWidth: 78 });

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
