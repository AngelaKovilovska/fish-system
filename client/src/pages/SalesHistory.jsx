import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Plus, FileText, Printer, Trash2, ShoppingCart, Users, Pencil, Save, X,
  ChevronDown, ChevronUp, ChevronLeft, Search, Calendar, Filter,
  TrendingUp, Package,
} from 'lucide-react';
import { formatDateShortMK } from '../lib/utils';

const MK_MONTHS = [
  'Сите месеци', 'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

export default function SalesHistory() {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState('sales');
  const [expandedSale, setExpandedSale] = useState(null);
  const printFrameRef = useRef(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all
  const [filterBuyer, setFilterBuyer] = useState(''); // '' = all
  const [showFilters, setShowFilters] = useState(false);

  // Buyer editing
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [buyerForm, setBuyerForm] = useState({ name: '', edb: '', address: '', contact_person: '', phone: '', email: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [salesRes, buyersRes] = await Promise.all([
        api.getSales({ limit: 200 }),
        api.getBuyers(),
      ]);
      setSales(salesRes.sales || []);
      setBuyers(buyersRes.buyers || []);
    } catch { setError('Грешка при вчитување'); }
    finally { setLoading(false); }
  }

  // Filtered & sorted sales
  const filteredSales = useMemo(() => {
    let result = [...sales];

    // Sort newest first
    result.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));

    // Filter by month
    if (filterMonth > 0) {
      result = result.filter(s => {
        const d = new Date(s.sale_date);
        return d.getMonth() + 1 === filterMonth;
      });
    }

    // Filter by buyer
    if (filterBuyer) {
      result = result.filter(s => s.buyer_name === filterBuyer);
    }

    // Search by invoice number or buyer name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        (s.invoice_number || '').toLowerCase().includes(q) ||
        (s.buyer_name || '').toLowerCase().includes(q) ||
        (s.dispatch_number || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [sales, filterMonth, filterBuyer, searchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    const totalAmount = filteredSales.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const totalKg = filteredSales.reduce((s, x) =>
      s + (x.items || []).reduce((ss, i) => ss + parseFloat(i.quantity_kg || 0), 0), 0);
    const uniqueBuyers = new Set(filteredSales.map(s => s.buyer_name)).size;
    return { count: filteredSales.length, totalAmount, totalKg, uniqueBuyers };
  }, [filteredSales]);

  // Unique buyer names for filter
  const buyerNames = useMemo(() => {
    const names = [...new Set(sales.map(s => s.buyer_name).filter(Boolean))];
    return names.sort();
  }, [sales]);

  async function handleDeleteSale(id) {
    if (!confirm('Избриши ја продажбата? Залихата ќе се врати.')) return;
    try {
      await api.deleteSale(id);
      await loadData();
    } catch (err) { setError(err.message); }
  }

  // Buyer CRUD
  function startEditBuyer(b) {
    setEditingBuyer(b.id);
    setBuyerForm({ name: b.name, edb: b.edb || '', address: b.address || '', contact_person: b.contact_person || '', phone: b.phone || '', email: b.email || '' });
  }

  async function saveBuyer() {
    if (!buyerForm.name) return setError('Потребно е име');
    try {
      await api.updateBuyer(editingBuyer, buyerForm);
      setEditingBuyer(null);
      setSuccess('Купувачот е ажуриран');
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  }

  async function deleteBuyer(id) {
    if (!confirm('Избриши го купувачот?')) return;
    try {
      await api.deleteBuyer(id);
      await loadData();
    } catch (err) { setError(err.message); }
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

  function clearFilters() {
    setSearchQuery('');
    setFilterMonth(0);
    setFilterBuyer('');
  }

  const hasActiveFilters = searchQuery || filterMonth > 0 || filterBuyer;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <iframe ref={printFrameRef} className="hidden" title="print" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-4 animate-in">
        <button onClick={() => navigate('/production')} className="btn-ghost text-sm flex-shrink-0 !px-2.5" aria-label="Назад">
          <ChevronLeft size={18} />
        </button>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
          <ShoppingCart size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="page-title !mb-0">Продажби</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Историја и документи</p>
        </div>
        <button onClick={() => navigate('/production/sales')} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={16} /> Нова
        </button>
      </div>

      {error && <div className="alert alert-error mb-4 animate-in">{error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in">{success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)]">
        <button onClick={() => setTab('sales')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${tab === 'sales' ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--text-secondary)]'}`}>
          Продажби ({sales.length})
        </button>
        <button onClick={() => setTab('buyers')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${tab === 'buyers' ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--text-secondary)]'}`}>
          <Users size={13} className="inline mr-1" />Купувачи ({buyers.length})
        </button>
      </div>

      {/* ═══ SALES TAB ═══ */}
      {tab === 'sales' && (
        <>
          {/* Summary stats */}
          {sales.length > 0 && (
            <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2 mb-4 animate-in">
              <div className="rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] p-2.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Продажби</div>
                <div className="text-base font-bold text-[var(--text-primary)]">{stats.count}</div>
              </div>
              <div className="rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] p-2.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Вкупно</div>
                <div className="text-base font-bold text-[var(--primary)]">{(stats.totalAmount / 1000).toFixed(1)}к ден</div>
              </div>
              <div className="rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] p-2.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Количина</div>
                <div className="text-base font-bold text-[var(--text-primary)]">{stats.totalKg.toFixed(1)} кг</div>
              </div>
              <div className="rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] p-2.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Купувачи</div>
                <div className="text-base font-bold text-[var(--text-primary)]">{stats.uniqueBuyers}</div>
              </div>
            </div>
          )}

          {/* Search + filter toggle */}
          {sales.length > 0 && (
            <div className="mb-4 animate-in space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="input-base text-sm !pl-8" placeholder="Пребарај по фактура или купувач..." />
                </div>
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`btn-ghost text-xs flex items-center gap-1 flex-shrink-0 ${hasActiveFilters ? '!text-[var(--primary)] !border-[var(--primary)]' : ''}`}>
                  <Filter size={14} />
                  {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />}
                </button>
              </div>

              {/* Filters panel */}
              {showFilters && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Месец</label>
                      <select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))}
                        className="input-base text-xs">
                        {MK_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Купувач</label>
                      <select value={filterBuyer} onChange={e => setFilterBuyer(e.target.value)}
                        className="input-base text-xs">
                        <option value="">Сите купувачи</option>
                        {buyerNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="btn-ghost text-[10px] flex items-center gap-1 text-[var(--danger)]">
                      <X size={12} /> Тргни филтри
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sales list */}
          {filteredSales.length === 0 ? (
            <div className="card text-center py-12 animate-in">
              <ShoppingCart size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                {hasActiveFilters ? 'Нема продажби со овие филтри' : 'Нема продажби'}
              </p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="btn-ghost text-xs mt-2 text-[var(--primary)]">
                  Тргни филтри
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSales.map((sale, idx) => {
                const isExpanded = expandedSale === sale.id;
                const totalKg = (sale.items || []).reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);
                return (
                  <div key={sale.id} className={`card animate-in-delay-${Math.min(idx, 5)}`}>
                    {/* Main row — always visible */}
                    <div className="flex items-start justify-between cursor-pointer"
                      onClick={() => setExpandedSale(isExpanded ? null : sale.id)}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                            {sale.invoice_number}
                          </h3>
                          <span className="pill pill-blue text-[9px]">{sale.payment_method}</span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {sale.buyer_name} • {formatDateShortMK(sale.sale_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <span className="text-sm font-bold text-[var(--primary)]">{parseFloat(sale.total).toFixed(0)} ден</span>
                          <p className="text-[10px] text-[var(--text-muted)]">{totalKg.toFixed(1)} кг</p>
                        </div>
                        {isExpanded ? <ChevronUp size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
                      </div>
                    </div>

                    {/* Items pills — always visible */}
                    {sale.items && sale.items.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {sale.items.map(item => (
                          <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
                            {item.code}: {parseFloat(item.quantity_kg).toFixed(1)}кг × {parseFloat(item.price_per_kg).toFixed(0)}ден
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Document buttons — always visible */}
                    <div className="flex gap-2 flex-wrap mt-3 pt-2 border-t border-[var(--border)]">
                      <button onClick={(e) => { e.stopPropagation(); handlePrint(sale.id, 'invoice'); }}
                        className="btn-ghost text-[11px] flex items-center gap-1 py-1.5">
                        <Printer size={12} /> Фактура
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handlePrint(sale.id, 'commercial'); }}
                        className="btn-ghost text-[11px] flex items-center gap-1 py-1.5">
                        <FileText size={12} /> Комерцијален
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handlePrint(sale.id, 'declaration'); }}
                        className="btn-ghost text-[11px] flex items-center gap-1 py-1.5">
                        <FileText size={12} /> Декларација
                      </button>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-[var(--text-muted)]">Испратница: </span>
                            <span className="font-medium">{sale.dispatch_number || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">ДДВ: </span>
                            <span className="font-medium">{sale.vat_rate}% ({parseFloat(sale.vat_amount).toFixed(0)} ден)</span>
                          </div>
                          {sale.lot_number && (
                            <div>
                              <span className="text-[var(--text-muted)]">LOT: </span>
                              <span className="font-medium">{sale.lot_number}</span>
                            </div>
                          )}
                          {sale.transport_vehicle && (
                            <div>
                              <span className="text-[var(--text-muted)]">Возило: </span>
                              <span className="font-medium">{sale.transport_vehicle}</span>
                            </div>
                          )}
                          {sale.due_date && (
                            <div>
                              <span className="text-[var(--text-muted)]">Рок: </span>
                              <span className="font-medium">{formatDateShortMK(sale.due_date)}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-[var(--text-muted)]">Основица: </span>
                            <span className="font-medium">{parseFloat(sale.subtotal).toFixed(2)} ден</span>
                          </div>
                        </div>
                        {sale.notes && (
                          <p className="text-[11px] text-[var(--text-muted)] italic">📝 {sale.notes}</p>
                        )}
                        <div className="flex justify-end">
                          <button onClick={() => handleDeleteSale(sale.id)}
                            className="btn-ghost text-[11px] text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] flex items-center gap-1">
                            <Trash2 size={12} /> Избриши
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ BUYERS TAB ═══ */}
      {tab === 'buyers' && (
        <>
          {buyers.length === 0 ? (
            <div className="card text-center py-12 animate-in">
              <Users size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-secondary)]">Нема зачувани купувачи</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Купувачите се додаваат при нова продажба</p>
            </div>
          ) : (
            <div className="space-y-3">
              {buyers.map((b, idx) => (
                <div key={b.id} className={`card animate-in-delay-${Math.min(idx, 5)}`}>
                  {editingBuyer === b.id ? (
                    // Edit form
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={buyerForm.name} onChange={e => setBuyerForm({ ...buyerForm, name: e.target.value })}
                          className="input-base text-sm" placeholder="Име *" />
                        <input type="text" value={buyerForm.edb} onChange={e => setBuyerForm({ ...buyerForm, edb: e.target.value })}
                          className="input-base text-sm" placeholder="ЕДБ" />
                        <input type="text" value={buyerForm.address} onChange={e => setBuyerForm({ ...buyerForm, address: e.target.value })}
                          className="input-base text-sm col-span-2" placeholder="Адреса" />
                        <input type="text" value={buyerForm.contact_person} onChange={e => setBuyerForm({ ...buyerForm, contact_person: e.target.value })}
                          className="input-base text-sm" placeholder="Контакт лице" />
                        <input type="text" value={buyerForm.phone} onChange={e => setBuyerForm({ ...buyerForm, phone: e.target.value })}
                          className="input-base text-sm" placeholder="Телефон" />
                        <input type="email" value={buyerForm.email} onChange={e => setBuyerForm({ ...buyerForm, email: e.target.value })}
                          className="input-base text-sm col-span-2" placeholder="Email" />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingBuyer(null)} className="btn-ghost text-xs flex items-center gap-1">
                          <X size={13} /> Откажи
                        </button>
                        <button onClick={saveBuyer} className="btn-primary text-xs flex items-center gap-1">
                          <Save size={13} /> Зачувај
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Display
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                        {b.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{b.name}</p>
                        {b.edb && <p className="text-[10px] text-[var(--text-muted)]">ЕДБ: {b.edb}</p>}
                        {b.address && <p className="text-[10px] text-[var(--text-muted)]">{b.address}</p>}
                        {b.phone && <p className="text-[10px] text-[var(--text-muted)]">{b.phone}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEditBuyer(b)} className="btn-ghost p-1.5 text-[var(--text-secondary)]">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteBuyer(b.id)} className="btn-ghost p-1.5 text-[var(--danger)]">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
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

  function productNameShort(item) {
    return `Риба (Clarias gariepinus) - ${item.code || ''}`;
  }

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
              <td>${productNameShort(item)}</td>
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
              <td>${productNameShort(item)}</td>
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
          <p><strong>${productNameShort(item)}</strong></p>
          <p>LOT: ${item.lot_number || sale.lot_number || '—'}</p>
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
