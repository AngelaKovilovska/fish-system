import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, renderDocumentPdf } from '../lib/api';
import {
  Plus, FileText, Printer, Trash2, ShoppingCart, Users, Pencil, Save, X,
  ChevronDown, ChevronUp, ChevronLeft, Search, Calendar, Filter,
  TrendingUp, Package, Download, Eye,
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

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all
  const [filterBuyer, setFilterBuyer] = useState(''); // '' = all
  const [showFilters, setShowFilters] = useState(false);

  // Document preview modal: { html, docType, fileName }
  const [previewDoc, setPreviewDoc] = useState(null);
  const previewFrameRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

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

  const DOC_LABELS = { invoice: 'Фактура', commercial: 'Комерцијален', declaration: 'Декларација' };

  async function openPreview(saleId, docType) {
    try {
      const sale = await api.getSale(saleId);
      const html = generatePrintHTML(sale, docType);
      const invoiceNum = sale.invoice_number || sale.dispatch_number || saleId;
      const fileName = `${DOC_LABELS[docType]}_${invoiceNum}`.replace(/[\s/\\:*?"<>|]/g, '_');
      setPreviewDoc({ html, docType, fileName });
    } catch (err) {
      setError('Грешка при отворање: ' + err.message);
    }
  }

  function handlePreviewPrint() {
    const frame = previewFrameRef.current;
    if (frame) frame.contentWindow.print();
  }

  async function handlePreviewDownload() {
    if (!previewDoc || downloading) return;
    setDownloading(true);
    try {
      const blob = await renderDocumentPdf(previewDoc.html);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${previewDoc.fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
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
      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-[var(--surface)] rounded-xl shadow-2xl flex flex-col" style={{ width: '90vw', maxWidth: '900px', height: '85vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm">{DOC_LABELS[previewDoc.docType]}</h3>
              <div className="flex items-center gap-2">
                <button onClick={handlePreviewPrint} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                  <Printer size={14} /> Печати
                </button>
                <button onClick={handlePreviewDownload} disabled={downloading} className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-60">
                  <Download size={14} /> {downloading ? 'Генерирам…' : 'Симни'}
                </button>
                <button onClick={() => setPreviewDoc(null)} className="btn-ghost p-1.5 rounded-lg">
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Preview iframe */}
            <div className="flex-1 overflow-hidden p-3">
              <iframe
                ref={previewFrameRef}
                srcDoc={previewDoc.html}
                title="preview"
                className="w-full h-full rounded-lg border border-[var(--border)]"
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

function parseLotDate(lotNumber) {
  // LOT format: YYMMDD-P (e.g. 260902-P)
  if (!lotNumber) return null;
  const match = lotNumber.match(/^(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const year = 2000 + parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const day = parseInt(match[3]);
  return new Date(year, month, day);
}

function formatDateDMY(d) {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatISODate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return formatDateDMY(d);
}

function addMonths(date, months) {
  if (!date) return null;
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function generatePrintHTML(sale, docType) {
  const COMPANY = {
    name: 'ФАМАКОМ АКВАКУЛТУРА доо Велес',
    fullName: 'ФАМАКОМ АКВАКУЛТУРА',
    desc: 'друштво за производство и трговија на риба',
    address: 'ул.11 Октомври бр.2, 1400 Велес, Р. Македонија',
    farmAddress: 'м.в. Речани, Велес',
    edb: '4004024524310',
    emb: '7810733',
    bankNLB: '210-078107330153',
    bankRBO: '171507953',
  };

  const FONT_FACE = `
      @font-face { font-family: 'Candara'; src: url('/fonts/Candara.ttf?v=2') format('truetype'); font-weight: 400; font-style: normal; }
      @font-face { font-family: 'Candara'; src: url('/fonts/Candara-Bold.ttf?v=2') format('truetype'); font-weight: 700; font-style: normal; }
      @font-face { font-family: 'Candara'; src: url('/fonts/Candara-Italic.ttf?v=2') format('truetype'); font-weight: 400; font-style: italic; }
      @font-face { font-family: 'Candara'; src: url('/fonts/Candara-BoldItalic.ttf?v=2') format('truetype'); font-weight: 700; font-style: italic; }`;

  const itemsArray = sale.items || [];
  const totalKg = itemsArray.reduce((s, it) => s + parseFloat(it.quantity_kg || 0), 0);
  const firstLot = itemsArray[0]?.lot_number || sale.lot_number || '';
  const lotDate = parseLotDate(firstLot);
  const expiryDate = addMonths(lotDate, 6);

  // ─── ФАКТУРА / ИСПРАТНИЦА (A4, navy blue design) ───
  if (docType === 'invoice') {
    const lotNumbers = [...new Set(itemsArray.map(it => it.lot_number || sale.lot_number || '').filter(Boolean))].join(', ');
    const rows = [...itemsArray];
    while (rows.length < 5) rows.push(null);
    const rowHTML = rows.map(item => item ? `
      <tr>
        <td>Риба (Clarias gariepinus) - ${item.code || ''}</td>
        <td class="num">${parseFloat(item.quantity_kg).toFixed(2)}</td>
        <td class="num">${parseFloat(item.price_per_kg).toFixed(2)}</td>
        <td class="num">${parseFloat(item.amount).toFixed(2)}</td>
      </tr>` : `
      <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      ${FONT_FACE}
      @page { size: A4; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Candara', 'Trebuchet MS', Calibri, sans-serif; font-size: 13px; color: #1b2a5a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .inv-page { display: flex; width: 794px; min-height: 297mm; overflow: hidden; }
      @media print {
        html, body { height: 100vh; overflow: hidden; }
        .inv-page { min-height: 0; height: 100vh; overflow: hidden; }
      }

      /* ── Sidebar ── */
      .inv-sidebar { width: 210px; flex: 0 0 210px; overflow: hidden; background: #1b2a5a; color: #fff; padding: 30px 12px 40px 18px; display: flex; flex-direction: column; justify-content: space-between; text-align: center; position: relative; }
      .inv-sidebar::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; border-left: 1px dashed rgba(255,255,255,0.6); }
      .inv-sidebar img { width: 168px; display: block; margin: 0 auto; }
      .inv-co { font-weight: 700; }
      .inv-co .inv-desc { font-size: 7.6px; margin-bottom: 2px; white-space: nowrap; }
      .inv-co .inv-company { font-size: 14px; letter-spacing: 0.2px; margin-bottom: 3px; white-space: nowrap; }
      .inv-co .inv-addr { font-size: 7.6px; line-height: 1.5; white-space: nowrap; }
      .inv-co .inv-ids { font-size: 7.6px; letter-spacing: 0.9px; line-height: 1.7; white-space: nowrap; }
      .inv-co .inv-bank { font-size: 8.4px; letter-spacing: 1.4px; margin-top: 2px; white-space: nowrap; }
      
      .inv-rbo { background: rgba(255,255,255,0.12); border-radius: 14px; padding: 16px 8px; font-size: 12px; font-weight: 700; line-height: 1.5; }
      .inv-fish { font-size: 12px; font-weight: 700; line-height: 1.6; }

      /* ── Main ── */
      .inv-main { width: 584px; flex: 0 0 584px; overflow: hidden; padding: 18px 26px 28px 0; display: flex; flex-direction: column; }
      .inv-top { display: flex; justify-content: space-between; align-items: flex-start; padding-left: 26px; }
      .inv-buyer { flex: 1; padding-right: 50px; position: relative; padding-top: 4px; }
      .inv-buyer::before { content: ''; position: absolute; left: 135px; top: 0; bottom: -10px; border-left: 1.5px solid #1b2a5a; }
      .inv-buyer-row { display: flex; align-items: flex-end; height: 36px; }
      .inv-buyer-row .inv-lbl { width: 135px; font-size: 13.5px; font-weight: 700; padding-bottom: 4px; }
      .inv-buyer-row .inv-val { flex: 1; border-bottom: 1.5px solid #1b2a5a; padding: 0 6px 4px; min-height: 22px; font-size: 13.5px; }
      .inv-titles { width: 220px; flex: 0 0 220px; text-align: right; }
      .inv-titles .inv-sub { font-size: 21px; font-weight: 700; letter-spacing: 0.3px; line-height: 1.1; padding-right: 8px; }
      .inv-titles .inv-sub-line { width: 160px; height: 0; border-top: 1.5px solid #1b2a5a; margin: 1px 0 0 auto; }
      .inv-titles .inv-title { font-size: 32px; font-weight: 700; line-height: 0.95; margin-top: 2px; padding-right: 8px; }
      .inv-numbox { margin-top: 10px; }
      .inv-numbox .inv-field { font-size: 13.5px; text-align: center; height: 48px; }
      .inv-numbox .inv-field strong { display: block; font-size: 13.5px; border-bottom: 1.5px solid #1b2a5a; padding-bottom: 2px; min-height: 20px; margin-bottom: 2px; }

      /* ── Table box: header + rows + confirm bar, joined to sidebar ── */
      .inv-box { margin-top: 22px; border-right: 1.5px solid #1b2a5a; }
      .inv-thead { background: #1b2a5a; color: #fff; display: flex; font-size: 13px; font-weight: 700; padding: 7px 26px 7px 0; }
      .inv-thead span { padding-left: 8px; }
      .inv-tbody { padding: 10px 26px 12px 26px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      col.c1 { width: auto; } col.c2 { width: 88px; } col.c3 { width: 92px; } col.c4 { width: 112px; }
      .inv-thead .h1 { flex: 1; padding-left: 26px; } .inv-thead .h2 { width: 88px; } .inv-thead .h3 { width: 92px; } .inv-thead .h4 { width: 112px; }
      tbody td { height: 34px; padding: 3px 6px; border-bottom: 1.5px solid #1b2a5a; border-right: 1.5px solid #1b2a5a; font-size: 12.5px; vertical-align: bottom; white-space: nowrap; overflow: hidden; }
      tbody td:first-child { padding-left: 0; }
      tbody td:last-child { border-right: none; }
      tbody td.num { text-align: right; }
      tbody tr.inv-sum td { border-bottom: none; }
      tbody tr.inv-sum td:first-child { border-right: 1.5px solid #1b2a5a; }
      tbody tr.inv-vat td:nth-child(3), tbody tr.inv-vat td:nth-child(4) { border-bottom: 1.5px solid #1b2a5a; }
      tbody tr.inv-vat td:nth-child(2) { border-bottom: 1.5px solid #1b2a5a; }
      tbody tr.inv-vat td:first-child { border-bottom: 1.5px solid #1b2a5a; }
      tbody td.inv-sum-lbl { text-align: right; }
      tbody td.inv-sum-val { text-align: right; font-weight: 700; }
      .inv-confirm { background: #1b2a5a; color: #fff; font-weight: 700; font-size: 10.2px; text-align: center; padding: 7px 6px 7px 26px; letter-spacing: -0.15px; line-height: 1.35; }

      .inv-lot { margin-top: 16px; padding-left: 26px; font-size: 12px; }
      .inv-lot strong { font-weight: 700; }

      /* ── Bottom (Примил / Печат и потпис) ── */
      .inv-bottom { margin-top: 36px; }
      .inv-recv-lbl { background: #1b2a5a; color: #fff; font-weight: 700; font-size: 15px; line-height: 20px; padding: 3px 16px 3px 26px; width: 150px; height: 26px; }
      .inv-row { display: flex; align-items: flex-end; height: 30px; padding-left: 26px; }
      .inv-row .inv-t { font-size: 13.5px; padding-bottom: 2px; white-space: nowrap; }
      .inv-row .inv-l { border-bottom: 1.5px solid #1b2a5a; margin-left: 4px; }
      .inv-row.r1 .inv-l { width: 300px; }
      .inv-row.r2 .inv-l { width: 240px; }
      .inv-row.r2 .inv-stamp { margin-left: 24px; width: 208px; text-align: center; margin-bottom: -21px; }
      .inv-row.r2 .inv-stamp .inv-sl { border-bottom: 1.5px solid #1b2a5a; }
      .inv-row.r2 .inv-stamp .inv-t { display: block; padding-top: 3px; }
    </style></head><body>
    <div class="inv-page">
      <div class="inv-sidebar">
        <img src="/images/clario-logo-white.png" alt="CLARIO" />
        <div class="inv-co">
          <div class="inv-desc">${COMPANY.desc}</div>
          <div class="inv-company">${COMPANY.fullName}</div>
          <div class="inv-addr">${COMPANY.address}</div>
          <div class="inv-ids">едб.:${COMPANY.edb}, емб.:${COMPANY.emb}</div>
          <div class="inv-bank">${COMPANY.bankNLB} НЛБ Банка АД</div>
        </div>
        <div class="inv-rbo">
          карта за идентификација<br/>на одгледувалиште<br/>(РБО ${COMPANY.bankRBO})<br/>${COMPANY.farmAddress}
        </div>
        <div class="inv-fish">
          Риба,<br/>Домашно одгледана<br/>во контролирани услови<br/>во RAS систем<br/>без антибиотици и хормони
        </div>
      </div>

      <div class="inv-main">
        <div class="inv-top">
          <div class="inv-buyer">
            <div class="inv-buyer-row"><span class="inv-lbl">Купувач:</span><span class="inv-val">${sale.buyer_name || ''}</span></div>
            <div class="inv-buyer-row"><span class="inv-lbl">адреса:</span><span class="inv-val">${sale.buyer_address || ''}</span></div>
            <div class="inv-buyer-row"><span class="inv-lbl">даночен број:</span><span class="inv-val">${sale.buyer_edb || ''}</span></div>
          </div>
          <div class="inv-titles">
            <div class="inv-sub">ИСПРАТНИЦА</div><div class="inv-sub-line"></div>
            <div class="inv-title">ФАКТУРА</div>
            <div class="inv-numbox">
              <div class="inv-field"><strong>${sale.invoice_number || ''}</strong>број</div>
              <div class="inv-field"><strong>${formatISODate(sale.sale_date)}</strong>датум</div>
            </div>
          </div>
        </div>

        <div class="inv-box">
          <div class="inv-thead">
            <span class="h1">Производ</span><span class="h2">Количина (кг)</span><span class="h3">Ед.цена</span><span class="h4">Износ</span>
          </div>
          <div class="inv-tbody">
            <table>
              <colgroup><col class="c1"/><col class="c2"/><col class="c3"/><col class="c4"/></colgroup>
              <tbody>
                ${rowHTML}
                <tr class="inv-sum inv-vat">
                  <td></td><td></td>
                  <td class="inv-sum-lbl">ДДВ ${sale.vat_rate || 5}% :</td>
                  <td class="inv-sum-val">${parseFloat(sale.vat_amount).toFixed(2)}</td>
                </tr>
                <tr class="inv-sum">
                  <td></td><td></td>
                  <td class="inv-sum-lbl">СЕ ВКУПНО :</td>
                  <td class="inv-sum-val">${parseFloat(sale.total).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="inv-confirm">
            Со потписот, примачот потврдува дека производите се примени во наведената количина и во добра состојба !
          </div>
        </div>

        <div class="inv-lot"><strong>LOT / серија:</strong> ${lotNumbers || '—'}</div>

        <div class="inv-bottom">
          <div class="inv-recv-lbl">Примил:</div>
          <div class="inv-row r1"><span class="inv-t">име и презиме:</span><span class="inv-l"></span></div>
          <div class="inv-row r2">
            <span class="inv-t">потпис:</span><span class="inv-l"></span>
            <div class="inv-stamp"><div class="inv-sl"></div><span class="inv-t">Печат и потпис</span></div>
          </div>
        </div>
      </div>
    </div>
    </body></html>`;
  }

  // ─── КОМЕРЦИЈАЛЕН ДОКУМЕНТ (Службен весник, официјален формулар) ───
  if (docType === 'commercial') {
    const totalQuantity = totalKg.toFixed(2);
    const lotNumbers = [...new Set(itemsArray.map(it => it.lot_number || sale.lot_number || ''))].join(', ');
    const expiryStr = expiryDate ? formatDateDMY(expiryDate) : '______________________';
    const saleDateTime = sale.sale_date ? formatISODate(sale.sale_date) : '______________________';

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @page { size: A4; margin: 20mm 18mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; line-height: 1.6; }
      .header-note { font-size: 9px; color: #555; margin-bottom: 10px; }
      .doc-title { font-size: 14px; font-weight: 900; text-align: center; margin-bottom: 15px; letter-spacing: 0.5px; }
      .operator-line { font-size: 10px; margin-bottom: 3px; }
      .operator-line strong { font-size: 11px; }
      .serial-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 10px; }
      .serial-row .field { display: flex; align-items: center; gap: 5px; }
      .serial-row .field .val { background: #ffff00; min-width: 180px; border-bottom: 1px solid #000; padding: 2px 6px; display: inline-block; min-height: 16px; }
      .section-title { font-size: 11px; font-weight: 900; margin: 12px 0 6px 0; }
      .form-row { font-size: 10px; margin-bottom: 4px; line-height: 1.7; }
      .form-row .val { background: #ffff00; border-bottom: 1px solid #000; padding: 1px 6px; display: inline-block; min-width: 120px; min-height: 15px; }
      .form-row .val-long { background: #ffff00; border-bottom: 1px solid #000; padding: 1px 6px; display: inline-block; min-width: 250px; min-height: 15px; }
      .form-row .val-short { background: #ffff00; border-bottom: 1px solid #000; padding: 1px 6px; display: inline-block; min-width: 80px; min-height: 15px; }
      .inline-pair { display: flex; gap: 20px; margin-bottom: 4px; }
      .inline-pair .form-row { margin-bottom: 0; }
      .temp-row { margin: 8px 0; font-size: 10px; }
      .temp-row .checkbox { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; margin-right: 3px; vertical-align: middle; }
      .temp-row .checkbox.checked { background: #000; }
      .statement { margin-top: 15px; font-size: 10px; line-height: 1.7; }
      .sign-footer { display: flex; justify-content: space-between; margin-top: 25px; align-items: flex-end; }
      .sign-col { font-size: 10px; }
      .sign-col .val { background: #ffff00; border-bottom: 1px solid #000; display: inline-block; min-width: 160px; min-height: 15px; padding: 1px 6px; }
      .mp { text-align: center; font-size: 10px; }
      hr { border: none; border-top: 1px solid #ccc; margin: 8px 0; }
    </style></head><body>

    <div class="header-note">Службен весник на РМ, бр. 38 од 21.3.2012 година</div>

    <div class="doc-title">КОМЕРЦИЈАЛЕН ДОКУМЕНТ ЗА ХРАНА ОД ЖИВОТИНСКО ПОТЕКЛО ЗА ВНАТРЕШЕН ПРОМЕТ</div>

    <div class="operator-line">Назив и седиште на операторот со храна кој ја испорачува храната:</div>
    <div class="operator-line"><strong>${COMPANY.name}</strong></div>

    <div style="margin:10px 0;">
      <div class="form-row">Сериски број на Комерцијалниот Документ <span class="val">${sale.dispatch_number || ''}</span></div>
      <div class="form-row">Архивски број од Евиденцијата на Операторот Испраќач <span class="val">${sale.invoice_number || ''}</span></div>
    </div>

    <div class="section-title">1. ПОДАТОЦИ ЗА ПРАТКАТА</div>
    <div class="form-row">1.1 Опис на храната</div>
    <div class="form-row" style="margin-left:20px;"><strong><u>Риба (Clarias gariepinus)</u></strong></div>
    <div class="form-row">1.2 Волумен односно количина на храната, <span class="val">${totalQuantity}</span> кг.</div>
    <div class="form-row">1.3 Начин на пакување на храната, <strong><u>Вакуум пакување</u></strong></div>
    <div class="form-row">1.4. Соодветна идентификација за обезбедување на следливост на пратката - лот, партија или како што е соодветно</div>
    <div class="form-row" style="margin-left:20px;">LOT: <span class="val">${lotNumbers}</span></div>
    <div class="inline-pair">
      <div class="form-row">1.5 Рок на траење на храната <span class="val">${expiryStr}</span></div>
      <div class="form-row">1.6 Број на пропратен документ <span class="val-short">${sale.dispatch_number || ''}</span><br/><span style="font-size:9px;margin-left:20px;">(испратница):</span></div>
    </div>
    <div class="inline-pair">
      <div class="form-row">Датум и Време на Испраќање <span class="val">${saleDateTime}</span></div>
      <div class="form-row">Датум и Време на Прием <span class="val"></span></div>
    </div>

    <div class="section-title">2. ПОДАТОЦИ ЗА ИСПРАЌАЧОТ</div>
    <div class="form-row">2.1 Испраќач: <strong>${COMPANY.name}</strong> <span style="margin-left:30px;">Единствен Идентификационен Број емб:<strong>${COMPANY.emb}</strong></span></div>
    <div class="form-row">2.2 Адреса <strong>${COMPANY.farmAddress}, 1400 Велес, Македонија</strong></div>

    <div class="section-title">3. ПОДАТОЦИ ЗА ТРАНСПОРТЕРОТ</div>
    <div class="form-row">3.1 Транспортер: <strong>${COMPANY.name}</strong> <span style="margin-left:30px;">Единствен Идентификационен Број емб:<strong>${COMPANY.emb}</strong></span></div>
    <div class="form-row">3.2 Адреса: <strong>${COMPANY.farmAddress}, 1400 Велес, Македонија</strong></div>
    <div class="form-row">3.3 Вид на транспортно средство: <span class="val">${sale.transport_vehicle || ''}</span></div>
    <div class="form-row">3.4 Регистарски број на транспортното средство <span class="val">${sale.transport_vehicle || ''}</span></div>
    <div class="form-row">3.5 Потребна температура за транспорт и понатамошна манипулација со храната: <span class="val-short">-18</span> °C</div>
    <div class="temp-row">
      Амбиентална <span class="checkbox"></span> на температура од _____
      Разладена <span class="checkbox"></span> на температура од _____
      Длабоко замрзната <span class="checkbox checked"></span> на температура од <span class="val-short">-18</span>
    </div>

    <div class="section-title">4. ПОДАТОЦИ ЗА ПРИМАЧОТ</div>
    <div class="form-row">4.1 Примач <span class="val-long">${sale.buyer_name || ''}</span> Единствен Идентификационен Број <span class="val-short">${sale.buyer_edb || ''}</span></div>
    <div class="form-row">4.2 Адреса <span class="val-long">${sale.buyer_address || ''}</span></div>

    <div class="section-title">5. ИЗЈАВА НА ИСПОРАЧАТЕЛОТ</div>
    <div class="statement">
      Погоре опишаната храна во пратката е произведена и/или со храната е манипулирано согласно соодветните законски одредби.<br/>
      Храната се испраќа со превозно средство кое ги исполнува законските барања за транспорт на соодветната храна.
    </div>

    <div class="sign-footer">
      <div class="sign-col">
        Датум<br/>
        <span class="val">${formatISODate(sale.sale_date)}</span>
      </div>
      <div class="mp">МП</div>
      <div class="sign-col" style="text-align:right;">
        Потпис на Одговорното Лице<br/>
        <span class="val"></span>
      </div>
    </div>

    </body></html>`;
  }

  // ─── ДЕКЛАРАЦИЈА (етикета за производ) ───
  if (docType === 'declaration') {
    const netKg = totalKg.toFixed(2);
    const harvestDateStr = lotDate ? formatDateDMY(lotDate) : '—';
    const packDateStr = harvestDateStr;
    const expiryStr = expiryDate ? formatDateDMY(expiryDate) : '—';
    const lotStr = firstLot || '—';

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      ${FONT_FACE}
      @page { size: A4; margin: 30mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Candara', 'Trebuchet MS', Calibri, sans-serif; font-size: 11px; color: #1a2744; display: flex; justify-content: center; padding-top: 20px; }
      .label-card { width: 360px; border: 1px solid #dce3ed; }
      .label-header { text-align: center; padding: 12px 15px; border-bottom: 1px solid #dce3ed; }
      .label-header .logo { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 8px; }
      .label-header .logo-text { font-size: 20px; font-weight: 900; color: #1a2744; letter-spacing: 2px; }
      .label-header .title { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
      .label-header .badge { font-size: 8px; color: #555; margin-top: 2px; }
      .product-section { text-align: center; padding: 10px 15px; border-bottom: 1px solid #dce3ed; }
      .product-section .brand { font-size: 13px; font-weight: 900; letter-spacing: 1px; }
      .product-section .product-name { font-size: 14px; font-weight: 900; text-transform: uppercase; margin: 3px 0; }
      .product-section .latin { font-size: 10px; font-style: italic; color: #555; }
      .info-banner { background: #f0f4f8; padding: 8px 15px; font-size: 9px; text-align: center; line-height: 1.5; color: #444; border-bottom: 1px solid #dce3ed; }
      .info-banner .allergen { font-weight: 900; font-size: 10px; color: #000; margin-top: 3px; }
      .trace-title { text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 8px 15px 4px; color: #1a2744; }
      .trace-table { width: 100%; border-collapse: collapse; }
      .trace-table td { padding: 6px 15px; font-size: 10px; border-bottom: 1px solid #eee; }
      .trace-table td:first-child { font-weight: 600; color: #1a2744; width: 55%; }
      .trace-table td:last-child { text-align: right; }
      .storage-bar { background: #e8f0f8; padding: 6px 15px; font-size: 9px; text-align: center; color: #333; border-top: 1px solid #dce3ed; }
      .storage-bar .icon { margin-right: 4px; }
      .producer { text-align: center; padding: 8px 15px; font-size: 8px; color: #666; line-height: 1.5; border-top: 1px solid #dce3ed; }
      .producer strong { font-size: 9px; color: #1a2744; }
    </style></head><body>
    <div class="label-card">

      <div class="label-header">
        <div class="logo">
          <span class="logo-text">CLARIO</span>
        </div>
        <div class="title">ДЕКЛАРАЦИЈА</div>
        <div class="badge">100% ДОМАШНО • RAS • ВЕЛЕС</div>
      </div>

      <div class="product-section">
        <div class="brand">CLARIO</div>
        <div class="product-name">ЗАМРЗНАТ АФРИКАНСКИ СОМ</div>
        <div class="latin">Clarias gariepinus</div>
      </div>

      <div class="info-banner">
        Одгледано во аквакултура – контролиран RAS-систем<br/>
        Потекло: Северна Македонија &bull; Состојки: 100% сом<br/>
        <div class="allergen">АЛЕРГЕН: РИБА</div>
      </div>

      <div class="trace-title">ПОДАТОЦИ ЗА СЛЕДЛИВОСТ</div>
      <table class="trace-table">
        <tr><td>НЕТО-КОЛИЧИНА</td><td>${netKg} кг</td></tr>
        <tr><td>ДАТУМ НА ИЗЛОВ</td><td>${harvestDateStr}</td></tr>
        <tr><td>ДАТУМ НА ПАКУВАЊЕ</td><td>${packDateStr}</td></tr>
        <tr><td>УПОТРЕБЛИВО ДО</td><td>${expiryStr}</td></tr>
        <tr><td>ЛОТ / СЕРИЈА</td><td>${lotStr}</td></tr>
      </table>

      <div class="storage-bar">
        ❄ ЧУВАЊЕ: под -18°C &bull; По отворање веднаш да се употреби.
      </div>

      <div class="producer">
        ПРОИЗВОДИТЕЛ:<br/>
        <strong>ФАМАКОМ АКВАКУЛТУРА ДОО Велес</strong><br/>
        11 Октомври бр.2, 1400 Велес<br/>
        РБО: ${COMPANY.bankRBO}
      </div>

    </div>
    </body></html>`;
  }

  return '<html><body>Непознат документ</body></html>';
}
