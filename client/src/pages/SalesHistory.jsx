import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, documentUrl } from '../lib/api';
import {
  Plus, FileText, Printer, Trash2, ShoppingCart, Users, Pencil, Save, X,
  ChevronDown, ChevronUp, ChevronLeft, Search, Calendar, Filter,
  TrendingUp, Package, Download, Eye,
} from 'lucide-react';
import { formatDateShortMK } from '../lib/utils';

// Статус на плаќање → { label, cls }
function paymentBadge(sale) {
  if (sale.payment_status === 'платено') {
    return { label: sale.paid_at ? `Платено ${formatDateShortMK(sale.paid_at)}` : 'Платено', cls: 'pill-success' };
  }
  if (sale.due_date) {
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(sale.due_date.slice(0, 10) + 'T00:00:00')) / 86400000);
    if (days > 0) return { label: `Доцни ${days} ${days === 1 ? 'ден' : 'дена'}`, cls: 'pill-danger' };
  }
  return { label: 'Неплатено', cls: 'pill-warning' };
}

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

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all
  const [filterBuyer, setFilterBuyer] = useState(''); // '' = all
  const [filterUnpaid, setFilterUnpaid] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Document preview modal: { url (API), docType, fileName }
  const [previewDoc, setPreviewDoc] = useState(null);
  const previewFrameRef = useRef(null);

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

    // Only unpaid
    if (filterUnpaid) {
      result = result.filter(s => s.payment_status !== 'платено');
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
  }, [sales, filterMonth, filterBuyer, filterUnpaid, searchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    const totalAmount = filteredSales.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const totalKg = filteredSales.reduce((s, x) =>
      s + (x.items || []).reduce((ss, i) => ss + parseFloat(i.quantity_kg || 0), 0), 0);
    const uniqueBuyers = new Set(filteredSales.map(s => s.buyer_name)).size;
    const unpaid = filteredSales.filter(s => s.payment_status !== 'платено');
    const unpaidAmount = unpaid.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    return { count: filteredSales.length, totalAmount, totalKg, uniqueBuyers, unpaidCount: unpaid.length, unpaidAmount };
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

  const DOC_LABELS = { invoice: 'Фактура', commercial: 'Комерцијален', declaration: 'Декларација' };

  // Отвори официјален PDF (пополнет урнек) во preview — директно од API (иста домена)
  async function openPreview(saleId, docType) {
    try {
      const sale = await api.getSale(saleId);
      const invoiceNum = sale.invoice_number || sale.dispatch_number || saleId;
      const fileName = `${DOC_LABELS[docType]}_${invoiceNum}`.replace(/[\s/\\:*?"<>|]/g, '_');
      setPreviewDoc({ url: documentUrl(docType, saleId), docType, fileName });
    } catch (err) {
      setError('Грешка при отворање: ' + err.message);
    }
  }

  function closePreview() { setPreviewDoc(null); }

  // Печати го истиот PDF
  function handlePreviewPrint() {
    if (!previewDoc) return;
    try {
      previewFrameRef.current.contentWindow.focus();
      previewFrameRef.current.contentWindow.print();
    } catch {
      window.open(previewDoc.url, '_blank');
    }
  }

  // Симни го истиот PDF
  function handlePreviewDownload() {
    if (!previewDoc) return;
    const a = document.createElement('a');
    a.href = `${previewDoc.url}?download=1`;
    a.download = `${previewDoc.fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function clearFilters() {
    setSearchQuery('');
    setFilterMonth(0);
    setFilterBuyer('');
    setFilterUnpaid(false);
  }

  const hasActiveFilters = searchQuery || filterMonth > 0 || filterBuyer || filterUnpaid;

  async function togglePaid(sale) {
    const paid = sale.payment_status !== 'платено';
    try {
      await api.setSalePayment(sale.id, paid, paid ? new Date().toISOString().slice(0, 10) : null);
      setSales(prev => prev.map(s => s.id === sale.id
        ? { ...s, payment_status: paid ? 'платено' : 'неплатено', paid_at: paid ? new Date().toISOString().slice(0, 10) : null }
        : s));
    } catch (err) { setError(err.message); }
  }

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
      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-(--surface) rounded-xl shadow-2xl flex flex-col" style={{ width: '90vw', maxWidth: '900px', height: '85vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-(--border)">
              <h3 className="font-semibold text-sm">{DOC_LABELS[previewDoc.docType]}</h3>
              <div className="flex items-center gap-2">
                <button onClick={handlePreviewPrint} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                  <Printer size={14} /> Печати
                </button>
                <button onClick={handlePreviewDownload} className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5">
                  <Download size={14} /> Симни
                </button>
                <button onClick={closePreview} className="btn-ghost p-1.5 rounded-lg">
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Preview iframe */}
            <div className="flex-1 overflow-hidden p-3">
              <iframe
                ref={previewFrameRef}
                src={previewDoc.url}
                title="preview"
                className="w-full h-full rounded-lg border border-(--border)"
                style={{ background: '#fff' }}
              />
            </div>
          </div>
        </div>
      )}

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
          <p className="text-xs text-(--text-secondary) mt-0.5">Историја и документи</p>
        </div>
        <button onClick={() => navigate('/production/sales')} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={16} /> Нова
        </button>
      </div>

      {error && <div className="alert alert-error mb-4 animate-in">{error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in">{success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl bg-(--surface-elevated) border border-(--border)">
        <button onClick={() => setTab('sales')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${tab === 'sales' ? 'bg-(--primary) text-white shadow-sm' : 'text-(--text-secondary)'}`}>
          Продажби ({sales.length})
        </button>
        <button onClick={() => setTab('buyers')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${tab === 'buyers' ? 'bg-(--primary) text-white shadow-sm' : 'text-(--text-secondary)'}`}>
          <Users size={13} className="inline mr-1" />Купувачи ({buyers.length})
        </button>
      </div>

      {/* ═══ SALES TAB ═══ */}
      {tab === 'sales' && (
        <>
          {/* Summary stats */}
          {sales.length > 0 && (
            <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2 mb-4 animate-in">
              <div className="rounded-(--r-md) bg-(--surface) border border-(--border) p-2.5 text-center">
                <div className="text-[10px] text-(--text-muted) uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Продажби</div>
                <div className="text-base font-bold text-(--text-primary)">{stats.count}</div>
              </div>
              <div className="rounded-(--r-md) bg-(--surface) border border-(--border) p-2.5 text-center">
                <div className="text-[10px] text-(--text-muted) uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Вкупно</div>
                <div className="text-base font-bold text-(--primary)">{(stats.totalAmount / 1000).toFixed(1)}к ден</div>
              </div>
              <div className="rounded-(--r-md) bg-(--surface) border border-(--border) p-2.5 text-center">
                <div className="text-[10px] text-(--text-muted) uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Количина</div>
                <div className="text-base font-bold text-(--text-primary)">{stats.totalKg.toFixed(1)} кг</div>
              </div>
              <button type="button" onClick={() => setFilterUnpaid(v => !v)}
                className={`rounded-(--r-md) bg-(--surface) border p-2.5 text-center transition-colors ${filterUnpaid ? 'border-(--danger)' : 'border-(--border)'}`}>
                <div className="text-[10px] text-(--text-muted) uppercase tracking-wide mb-0.5"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Неплатено</div>
                <div className={`text-base font-bold ${stats.unpaidCount > 0 ? 'text-(--danger)' : 'text-(--text-primary)'}`}>
                  {(stats.unpaidAmount / 1000).toFixed(1)}к ден
                </div>
                <div className="text-[9px] text-(--text-muted)">{stats.unpaidCount} факт.</div>
              </button>
            </div>
          )}

          {/* Search + filter toggle */}
          {sales.length > 0 && (
            <div className="mb-4 animate-in space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="input-base text-sm !pl-8" placeholder="Пребарај по фактура или купувач..." />
                </div>
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`btn-ghost text-xs flex items-center gap-1 flex-shrink-0 ${hasActiveFilters ? '!text-(--primary) !border-(--primary)' : ''}`}>
                  <Filter size={14} />
                  {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-(--primary)" />}
                </button>
              </div>

              {/* Filters panel */}
              {showFilters && (
                <div className="bg-(--surface) border border-(--border) rounded-(--r-md) p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Месец</label>
                      <select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))}
                        className="input-base text-xs">
                        {MK_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Купувач</label>
                      <select value={filterBuyer} onChange={e => setFilterBuyer(e.target.value)}
                        className="input-base text-xs">
                        <option value="">Сите купувачи</option>
                        {buyerNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-(--text-secondary) cursor-pointer">
                    <input type="checkbox" checked={filterUnpaid} onChange={e => setFilterUnpaid(e.target.checked)} />
                    Само неплатени
                  </label>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="btn-ghost text-[10px] flex items-center gap-1 text-(--danger)">
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
              <ShoppingCart size={40} className="mx-auto mb-3 text-(--text-muted)" />
              <p className="text-sm text-(--text-secondary)">
                {hasActiveFilters ? 'Нема продажби со овие филтри' : 'Нема продажби'}
              </p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="btn-ghost text-xs mt-2 text-(--primary)">
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
                          <h3 className="text-sm font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>
                            {sale.invoice_number}
                          </h3>
                          <span className="pill pill-blue text-[9px]">{sale.payment_method}</span>
                          {(() => { const b = paymentBadge(sale); return <span className={`pill ${b.cls} text-[9px]`}>{b.label}</span>; })()}
                        </div>
                        <p className="text-xs text-(--text-secondary) mt-0.5">
                          {sale.buyer_name} • {formatDateShortMK(sale.sale_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <span className="text-sm font-bold text-(--primary)">{parseFloat(sale.total).toFixed(0)} ден</span>
                          <p className="text-[10px] text-(--text-muted)">{totalKg.toFixed(1)} кг</p>
                        </div>
                        {isExpanded ? <ChevronUp size={14} className="text-(--text-muted)" /> : <ChevronDown size={14} className="text-(--text-muted)" />}
                      </div>
                    </div>

                    {/* Items pills — always visible */}
                    {sale.items && sale.items.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {sale.items.map(item => (
                          <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-(--surface-elevated) text-(--text-secondary) border border-(--border)">
                            {item.code}: {parseFloat(item.quantity_kg).toFixed(1)}кг × {parseFloat(item.price_per_kg).toFixed(0)}ден
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Document buttons — always visible */}
                    <div className="flex gap-2 flex-wrap mt-3 pt-2 border-t border-(--border)">
                      <button onClick={(e) => { e.stopPropagation(); openPreview(sale.id, 'invoice'); }}
                        className="btn-ghost text-[11px] flex items-center gap-1 py-1.5">
                        <Eye size={12} /> Фактура
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openPreview(sale.id, 'commercial'); }}
                        className="btn-ghost text-[11px] flex items-center gap-1 py-1.5">
                        <Eye size={12} /> Комерцијален
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openPreview(sale.id, 'declaration'); }}
                        className="btn-ghost text-[11px] flex items-center gap-1 py-1.5">
                        <Eye size={12} /> Декларација
                      </button>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-(--border) space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-(--text-muted)">Испратница: </span>
                            <span className="font-medium">{sale.dispatch_number || '—'}</span>
                          </div>
                          <div>
                            <span className="text-(--text-muted)">ДДВ: </span>
                            <span className="font-medium">{sale.vat_rate}% ({parseFloat(sale.vat_amount).toFixed(0)} ден)</span>
                          </div>
                          {sale.lot_number && (
                            <div>
                              <span className="text-(--text-muted)">LOT: </span>
                              <span className="font-medium">{sale.lot_number}</span>
                            </div>
                          )}
                          {sale.transport_vehicle && (
                            <div>
                              <span className="text-(--text-muted)">Возило: </span>
                              <span className="font-medium">{sale.transport_vehicle}</span>
                            </div>
                          )}
                          {sale.due_date && (
                            <div>
                              <span className="text-(--text-muted)">Рок: </span>
                              <span className="font-medium">{formatDateShortMK(sale.due_date)}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-(--text-muted)">Основица: </span>
                            <span className="font-medium">{parseFloat(sale.subtotal).toFixed(2)} ден</span>
                          </div>
                        </div>
                        {sale.notes && (
                          <p className="text-[11px] text-(--text-muted) italic">📝 {sale.notes}</p>
                        )}
                        <div className="flex justify-end gap-1 flex-wrap">
                          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none mr-auto pl-1">
                            <input type="checkbox" checked={sale.payment_status === 'платено'} onChange={() => togglePaid(sale)}
                              className="w-3.5 h-3.5 accent-[#16a34a]" />
                            <span className={sale.payment_status === 'платено' ? 'text-[#16a34a] font-semibold' : 'text-(--text-secondary)'}>
                              {sale.payment_status === 'платено' ? `Платено${sale.paid_at ? ' ' + formatDateShortMK(sale.paid_at) : ''}` : 'Неплатено'}
                            </span>
                          </label>
                          <button onClick={() => navigate(`/production/sales/${sale.id}/edit`)}
                            className="btn-ghost text-[11px] text-(--primary) flex items-center gap-1">
                            <Pencil size={12} /> Уреди
                          </button>
                          <button onClick={() => handleDeleteSale(sale.id)}
                            className="btn-ghost text-[11px] text-(--danger) hover:bg-[rgba(239,68,68,0.08)] flex items-center gap-1">
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
              <Users size={40} className="mx-auto mb-3 text-(--text-muted)" />
              <p className="text-sm text-(--text-secondary)">Нема зачувани купувачи</p>
              <p className="text-xs text-(--text-muted) mt-1">Купувачите се додаваат при нова продажба</p>
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
                        <p className="text-sm font-bold text-(--text-primary)">{b.name}</p>
                        {b.edb && <p className="text-[10px] text-(--text-muted)">ЕДБ: {b.edb}</p>}
                        {b.address && <p className="text-[10px] text-(--text-muted)">{b.address}</p>}
                        {b.phone && <p className="text-[10px] text-(--text-muted)">{b.phone}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEditBuyer(b)} className="btn-ghost p-1.5 text-(--text-secondary)">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteBuyer(b.id)} className="btn-ghost p-1.5 text-(--danger)">
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
