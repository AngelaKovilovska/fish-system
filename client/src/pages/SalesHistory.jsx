import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronLeft, Plus, FileText, Printer, Trash2, ShoppingCart } from 'lucide-react';
import { formatDateShortMK } from '../lib/utils';

export default function SalesHistory() {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const printFrameRef = useRef(null);

  useEffect(() => {
    loadSales();
  }, []);

  async function loadSales() {
    try {
      const res = await api.getSales({ limit: 50 });
      setSales(res.sales || []);
    } catch {
      setError('Грешка при вчитување');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Избриши ја продажбата? Залихата ќе се врати.')) return;
    try {
      await api.deleteSale(id);
      await loadSales();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePrint(saleId, docType) {
    try {
      const sale = await api.getSale(saleId);
      const html = generatePrintHTML(sale, docType);
      const frame = printFrameRef.current;
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => frame.contentWindow.print(), 300);
    } catch (err) {
      setError('Грешка при печатење: ' + err.message);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <iframe ref={printFrameRef} className="hidden" title="print" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-5 animate-in">
        <button onClick={() => navigate(-1)} className="btn-ghost p-1.5 -ml-1.5"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="page-title !mb-0">Продажби</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Историја и документи</p>
        </div>
        <button onClick={() => navigate('/sales/new')} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={16} /> Нова
        </button>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {sales.length === 0 ? (
        <div className="card text-center py-12 animate-in">
          <ShoppingCart size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">Нема продажби</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale, idx) => (
            <div key={sale.id} className={`card animate-in-delay-${Math.min(idx, 5)}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {sale.invoice_number}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {sale.buyer_name} • {formatDateShortMK(sale.sale_date)}
                  </p>
                </div>
                <span className="text-sm font-bold text-[var(--primary)]">{parseFloat(sale.total).toFixed(2)} ден</span>
              </div>

              {/* Items */}
              {sale.items && sale.items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {sale.items.map(item => (
                    <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
                      {item.code}: {item.quantity_kg}кг × {item.price_per_kg}ден
                    </span>
                  ))}
                </div>
              )}

              {/* Payment method & LOT */}
              <div className="flex items-center gap-3 mb-3">
                <span className="pill pill-blue text-[10px]">{sale.payment_method}</span>
                {sale.lot_number && <span className="text-[10px] text-[var(--text-muted)]">LOT: {sale.lot_number}</span>}
              </div>

              {/* Print buttons */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => handlePrint(sale.id, 'invoice')}
                  className="btn-ghost text-xs flex items-center gap-1">
                  <Printer size={13} /> Фактура
                </button>
                <button onClick={() => handlePrint(sale.id, 'commercial')}
                  className="btn-ghost text-xs flex items-center gap-1">
                  <FileText size={13} /> Комерцијален
                </button>
                <button onClick={() => handlePrint(sale.id, 'declaration')}
                  className="btn-ghost text-xs flex items-center gap-1">
                  <FileText size={13} /> Декларација
                </button>
                <button onClick={() => handleDelete(sale.id)}
                  className="btn-ghost text-xs text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] ml-auto">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// Print HTML generators
// ══════════════════════════════════════

function generatePrintHTML(sale, docType) {
  const COMPANY = {
    name: 'ФАМАКОМ АКВАКУЛТУРА доо Велес',
    address: 'м.в. Речани, Велес',
    edb: '4004024524310',
    emb: '7810733',
    bankNLB: '210-078107330153',
    bankRBO: '171507953',
  };

  const styles = `
    <style>
      @page { size: A4; margin: 15mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.5; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #0ea5e9; }
      .logo-area h1 { font-size: 18px; font-weight: 700; color: #0ea5e9; }
      .logo-area p { font-size: 9px; color: #64748b; }
      .doc-title { font-size: 16px; font-weight: 700; text-align: center; margin: 15px 0; color: #0f172a; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
      .info-box { padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; }
      .info-box h4 { font-size: 9px; text-transform: uppercase; color: #64748b; margin-bottom: 5px; letter-spacing: 0.5px; }
      .info-box p { font-size: 10px; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
      td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
      .text-right { text-align: right; }
      .totals { margin-top: 10px; }
      .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
      .totals .total { font-weight: 700; font-size: 13px; border-top: 2px solid #0ea5e9; padding-top: 6px; margin-top: 4px; }
      .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
      .footer .sign-line { width: 180px; border-top: 1px solid #94a3b8; margin-top: 50px; text-align: center; font-size: 9px; color: #64748b; padding-top: 4px; }
      .nutrition-table td, .nutrition-table th { padding: 4px 8px; font-size: 9px; }
    </style>
  `;

  const itemsArray = sale.items || [];

  if (docType === 'invoice') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
      <div class="header">
        <div class="logo-area">
          <h1>CLARIO</h1>
          <p>${COMPANY.name}</p>
          <p>${COMPANY.address}</p>
          <p>ЕДБ: ${COMPANY.edb} | ЕМБ: ${COMPANY.emb}</p>
        </div>
        <div style="text-align:right;font-size:10px;">
          <p><strong>Фактура бр:</strong> ${sale.invoice_number}</p>
          <p><strong>Испратница бр:</strong> ${sale.dispatch_number || '—'}</p>
          <p><strong>Датум:</strong> ${sale.sale_date}</p>
          ${sale.due_date ? `<p><strong>Рок:</strong> ${sale.due_date}</p>` : ''}
        </div>
      </div>

      <div class="doc-title">ФАКТУРА - ИСПРАТНИЦА</div>

      <div class="info-grid">
        <div class="info-box">
          <h4>Испраќач</h4>
          <p><strong>${COMPANY.name}</strong></p>
          <p>${COMPANY.address}</p>
          <p>ЕДБ: ${COMPANY.edb}</p>
          <p>Сметка НЛБ: ${COMPANY.bankNLB}</p>
        </div>
        <div class="info-box">
          <h4>Примач</h4>
          <p><strong>${sale.buyer_name || '—'}</strong></p>
          <p>${sale.buyer_address || ''}</p>
          ${sale.buyer_edb ? `<p>ЕДБ: ${sale.buyer_edb}</p>` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Производ</th>
            <th>LOT</th>
            <th class="text-right">Количина (кг)</th>
            <th class="text-right">Цена/кг</th>
            <th class="text-right">Износ (ден)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsArray.map((item, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>Риба (Clarias gariepinus) - ${item.code || ''} ${item.name || ''}</td>
              <td>${item.lot_number || sale.lot_number || '—'}</td>
              <td class="text-right">${parseFloat(item.quantity_kg).toFixed(2)}</td>
              <td class="text-right">${parseFloat(item.price_per_kg).toFixed(2)}</td>
              <td class="text-right">${parseFloat(item.amount).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;">
        <div class="totals" style="width:250px;">
          <div class="row"><span>Основица:</span><span>${parseFloat(sale.subtotal).toFixed(2)} ден</span></div>
          <div class="row"><span>ДДВ (${sale.vat_rate}%):</span><span>${parseFloat(sale.vat_amount).toFixed(2)} ден</span></div>
          <div class="row total"><span>Вкупно:</span><span>${parseFloat(sale.total).toFixed(2)} ден</span></div>
        </div>
      </div>

      <div style="margin-top:15px;font-size:10px;">
        <p><strong>Начин на плаќање:</strong> ${sale.payment_method}</p>
        ${sale.transport_vehicle ? `<p><strong>Возило:</strong> ${sale.transport_vehicle}</p>` : ''}
        ${sale.notes ? `<p><strong>Забелешка:</strong> ${sale.notes}</p>` : ''}
      </div>

      <div class="footer">
        <div><div class="sign-line">Испраќач</div></div>
        <div><div class="sign-line">Примач</div></div>
      </div>
    </body></html>`;
  }

  if (docType === 'commercial') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
      <div class="header">
        <div class="logo-area">
          <h1>CLARIO</h1>
          <p>${COMPANY.name}</p>
        </div>
        <div style="text-align:right;font-size:10px;">
          <p><strong>Датум:</strong> ${sale.sale_date}</p>
          <p><strong>Реф:</strong> ${sale.invoice_number}</p>
        </div>
      </div>

      <div class="doc-title">КОМЕРЦИЈАЛЕН ДОКУМЕНТ</div>

      <div class="info-grid">
        <div class="info-box">
          <h4>Испраќач</h4>
          <p><strong>${COMPANY.name}</strong></p>
          <p>${COMPANY.address}</p>
          <p>ЕДБ: ${COMPANY.edb} | ЕМБ: ${COMPANY.emb}</p>
        </div>
        <div class="info-box">
          <h4>Примач</h4>
          <p><strong>${sale.buyer_name || '—'}</strong></p>
          <p>${sale.buyer_address || ''}</p>
          ${sale.buyer_edb ? `<p>ЕДБ: ${sale.buyer_edb}</p>` : ''}
        </div>
      </div>

      <table>
        <thead><tr><th>#</th><th>Опис</th><th>LOT</th><th class="text-right">Нето (кг)</th></tr></thead>
        <tbody>
          ${itemsArray.map((item, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>Риба (Clarias gariepinus) - ${item.code || ''} ${item.name || ''}</td>
              <td>${item.lot_number || sale.lot_number || '—'}</td>
              <td class="text-right">${parseFloat(item.quantity_kg).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="info-grid" style="margin-top:15px;">
        <div class="info-box">
          <h4>Транспорт</h4>
          <p>Возило: ${sale.transport_vehicle || '—'}</p>
          <p>Температура: ${sale.product_temp != null ? sale.product_temp + '°C' : '—'}</p>
        </div>
        <div class="info-box">
          <h4>Потекло</h4>
          <p>Земја: Република Северна Македонија</p>
          <p>Фарма: ${COMPANY.name}</p>
          <p>Адреса: ${COMPANY.address}</p>
        </div>
      </div>

      <div class="footer">
        <div><div class="sign-line">Испраќач</div></div>
        <div><div class="sign-line">Примач</div></div>
      </div>
    </body></html>`;
  }

  if (docType === 'declaration') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
      <div class="header">
        <div class="logo-area">
          <h1>CLARIO</h1>
          <p>${COMPANY.name}</p>
        </div>
      </div>

      <div class="doc-title">ДЕКЛАРАЦИЈА ЗА ПРОИЗВОД</div>

      <div class="info-box" style="margin-bottom:15px;">
        <h4>Производител</h4>
        <p><strong>${COMPANY.name}</strong></p>
        <p>${COMPANY.address}</p>
        <p>ЕДБ: ${COMPANY.edb} | ЕМБ: ${COMPANY.emb}</p>
      </div>

      ${itemsArray.map((item, i) => `
        <div class="info-box" style="margin-bottom:10px;">
          <h4>Производ ${itemsArray.length > 1 ? i + 1 : ''}</h4>
          <p><strong>Риба (${item.latin_name || 'Clarias gariepinus'}) - ${item.name || ''}</strong></p>
          <p>Шифра: ${item.code || ''} | LOT: ${item.lot_number || sale.lot_number || '—'}</p>
          <p>Нето: ${parseFloat(item.quantity_kg).toFixed(2)} ${item.unit || 'кг'}</p>
        </div>
      `).join('')}

      <div style="margin-top:15px;">
        <h4 style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Нутритивни вредности на 100г</h4>
        <table class="nutrition-table">
          <tr><th>Параметар</th><th class="text-right">Вредност</th></tr>
          <tr><td>Енергетска вредност</td><td class="text-right">632 kJ / 151 kcal</td></tr>
          <tr><td>Протеини</td><td class="text-right">19.0 г</td></tr>
          <tr><td>Масти</td><td class="text-right">8.1 г</td></tr>
          <tr><td style="padding-left:20px;">- од кои заситени</td><td class="text-right">2.1 г</td></tr>
          <tr><td>Јаглехидрати</td><td class="text-right">0 г</td></tr>
          <tr><td>Сол</td><td class="text-right">0.1 г</td></tr>
        </table>
      </div>

      <div class="info-box" style="margin-top:15px;background:#fef3c7;border-color:#fbbf24;">
        <h4 style="color:#92400e;">Алергени</h4>
        <p><strong>Содржи: РИБА</strong></p>
      </div>

      <div style="margin-top:15px;font-size:9px;color:#64748b;">
        <p>Услови на чување: Од 0°C до +4°C</p>
        <p>Датум на производство: ${sale.sale_date}</p>
        <p>Рок на употреба: Видете на амбалажата</p>
      </div>

      <div class="footer">
        <div><div class="sign-line">Одговорно лице</div></div>
      </div>
    </body></html>`;
  }

  return '<html><body>Непознат документ</body></html>';
}
