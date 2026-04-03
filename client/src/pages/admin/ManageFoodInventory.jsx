import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { FOOD_TYPES } from '../../lib/constants';
import { Package, Plus, ArrowDown, ArrowUp, Clock, Calendar, Brain, AlertTriangle, Timer, Pencil, Trash2, Check, X, FileText, Search } from 'lucide-react';

const MK_MONTHS = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

function formatDateShortMK(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()].substring(0, 3)}`;
}

const emptyItem = () => ({ food_type: FOOD_TYPES[0], quantity_kg: '' });

// Simple case-insensitive partial match
function fuzzyMatch(haystack, needle) {
  if (!needle) return true;
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export default function ManageFoodInventory() {
  const [inventory, setInventory] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockProjection, setStockProjection] = useState(null);

  // Purchase form
  const [supplier, setSupplier] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseItems, setPurchaseItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEntryIds, setEditingEntryIds] = useState([]);

  // Single-entry edit state (from log)
  const [editId, setEditId] = useState(null);
  const [editFoodType, setEditFoodType] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editDocNumber, setEditDocNumber] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Browse log
  const [logDays, setLogDays] = useState(3);
  const [searchSupplier, setSearchSupplier] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const load = async () => {
    try {
      const [invData, logData, projData] = await Promise.all([
        api.getFoodInventory(),
        api.getFoodInventoryLog(logDays),
        api.getStockProjection().catch(() => null),
      ]);
      setInventory(invData.inventory);
      setLog(logData.log);
      setStockProjection(projData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const proj = stockProjection?.projections || {};

  useEffect(() => { load(); }, [logDays]);

  // Purchase item management
  const updateItem = (idx, field, value) => {
    setPurchaseItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addItem = () => setPurchaseItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => {
    if (purchaseItems.length <= 1) return;
    setPurchaseItems(prev => prev.filter((_, i) => i !== idx));
  };

  // Load existing purchases for a date into the form for editing
  const loadDatePurchases = (dateStr) => {
    const datePurchases = log.filter(e =>
      e.reason === 'purchase' &&
      new Date(e.date).toISOString().split('T')[0] === dateStr
    );

    if (datePurchases.length > 0) {
      setIsEditMode(true);
      setEditingEntryIds(datePurchases.map(e => e.id));
      setPurchaseItems(datePurchases.map(e => ({
        id: e.id,
        food_type: e.food_type,
        quantity_kg: Math.abs(parseFloat(e.change_kg)).toString(),
      })));
      // Take supplier/doc from first entry
      setSupplier(datePurchases[0].supplier || '');
      setDocumentNumber(datePurchases[0].document_number || '');
    } else {
      resetForm();
    }
  };

  const handleDateChange = (newDate) => {
    setPurchaseDate(newDate);
    loadDatePurchases(newDate);
  };

  const resetForm = () => {
    setIsEditMode(false);
    setEditingEntryIds([]);
    setPurchaseItems([emptyItem()]);
    setSupplier('');
    setDocumentNumber('');
    setMessage('');
  };

  const handlePurchase = async () => {
    const validItems = purchaseItems.filter(it => it.food_type && parseFloat(it.quantity_kg) > 0);
    if (validItems.length === 0) {
      setMessage('Внесете барем еден тип храна со количина');
      return;
    }
    setSaving(true); setMessage('');
    try {
      if (isEditMode) {
        // Delete old entries then insert new ones
        for (const oldId of editingEntryIds) {
          await api.deleteFoodPurchase(oldId);
        }
      }
      await api.addFoodPurchase({
        supplier: supplier.trim() || undefined,
        document_number: documentNumber.trim() || undefined,
        purchase_date: purchaseDate,
        items: validItems.map(it => ({ food_type: it.food_type, quantity_kg: parseFloat(it.quantity_kg) })),
      });
      setMessage(isEditMode ? 'Набавката е ажурирана!' : 'Набавката е додадена!');
      resetForm();
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      await load();
    } catch (err) { setMessage(err.message); }
    finally { setSaving(false); }
  };

  const startEdit = (entry) => {
    setEditId(entry.id);
    setEditFoodType(entry.food_type);
    setEditQuantity(Math.abs(parseFloat(entry.change_kg)).toString());
    setEditDate(new Date(entry.date).toISOString().split('T')[0]);
    setEditSupplier(entry.supplier || '');
    setEditDocNumber(entry.document_number || '');
    setDeleteConfirmId(null);
  };

  const cancelEdit = () => { setEditId(null); };

  const saveEdit = async () => {
    if (!editQuantity || parseFloat(editQuantity) <= 0) return;
    setEditSaving(true);
    try {
      await api.updateFoodPurchase(editId, {
        food_type: editFoodType,
        quantity_kg: parseFloat(editQuantity),
        purchase_date: editDate,
        supplier: editSupplier.trim() || null,
        document_number: editDocNumber.trim() || null,
      });
      cancelEdit();
      await load();
    } catch (err) { console.error(err); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteFoodPurchase(id);
      setDeleteConfirmId(null);
      await load();
    } catch (err) { console.error(err); }
  };

  // Load purchases for a date from log into the form
  const editDateFromLog = (dateStr) => {
    setPurchaseDate(dateStr);
    loadDatePurchases(dateStr);
    // Scroll to form
    document.getElementById('purchase-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return (
    <div className="max-w-[700px] mx-auto space-y-3">
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-52 w-full" />
    </div>
  );

  return (
    <div className="max-w-[700px] mx-auto">
      <div className="mb-5 animate-in">
        <h1 className="page-title mb-1">Залихи на храна</h1>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Следете ги залихите. При секоја чек-листа потрошената храна автоматски се одзема.
        </p>
      </div>

      {/* Current stock table */}
      <div className="card mb-4 animate-in">
        <h3 className="section-title text-sm mb-3 flex items-center gap-2">
          <Package size={15} className="text-[var(--primary)]" />
          Тековни залихи
        </h3>
        <div className="hidden lg:block">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Тип храна</th>
                <th className="text-right">Залиха (kg)</th>
                <th className="text-right">Залиха до</th>
                <th className="text-right">Ажурирано</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => {
                const stockKg = parseFloat(item.quantity_kg);
                const p = proj[item.food_type];
                const daysLeft = p?.daysLeft;
                const endDate = p?.endDate;
                return (
                  <tr key={item.id}>
                    <td className="font-medium">{item.food_type}</td>
                    <td className="text-right">
                      <span className={`font-bold ${stockKg <= 5 ? 'text-[var(--danger)]' : stockKg <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                        {stockKg.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-right">
                      {daysLeft != null && daysLeft >= 0 ? (
                        <span className={`inline-flex items-center gap-1 font-bold ${daysLeft <= 7 ? 'text-[var(--danger)]' : daysLeft <= 21 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                          <Timer size={12} />
                          {daysLeft <= 0 ? 'Завршена!' : endDate ? `до ${formatDateShortMK(endDate)}` : `${daysLeft}+ дена`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)] italic">Не се троши</span>
                      )}
                    </td>
                    <td className="text-right text-[var(--text-muted)]">
                      {new Date(item.updated_at).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile list */}
        <div className="lg:hidden space-y-2">
          {inventory.map(item => {
            const stockKg = parseFloat(item.quantity_kg);
            const p = proj[item.food_type];
            const daysLeft = p?.daysLeft;
            const endDate = p?.endDate;
            return (
              <div key={item.id} className="p-2.5 rounded-[var(--r-sm)] bg-[var(--bg)]">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-[var(--text-secondary)]">{item.food_type}</span>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${stockKg <= 5 ? 'text-[var(--danger)]' : stockKg <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                      {stockKg.toFixed(2)} kg
                    </span>
                    {daysLeft != null && daysLeft >= 0 ? (
                      <span className={`inline-flex items-center gap-1 font-bold text-[10px] ${daysLeft <= 7 ? 'text-[var(--danger)]' : daysLeft <= 21 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                        <Timer size={10} />
                        {daysLeft <= 0 ? 'Завршена!' : endDate ? `до ${formatDateShortMK(endDate)}` : `${daysLeft}+ дена`}
                      </span>
                    ) : (
                      <span className="text-[9px] text-[var(--text-muted)] italic">Не се троши</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Stock Duration Summary */}
      {stockProjection && Object.keys(proj).length > 0 && (() => {
        const stockItems = Object.entries(proj)
          .filter(([, p]) => p.daysLeft != null && p.dailyConsumptionStartKg > 0)
          .map(([foodType, p]) => ({ foodType, ...p }))
          .sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0));

        if (stockItems.length === 0) return null;

        const soonest = stockItems[0];
        const critical = stockItems.filter(s => s.daysLeft <= 7);
        const warning = stockItems.filter(s => s.daysLeft > 7 && s.daysLeft <= 21);

        return (
          <div className="card mb-4 animate-in-delay-1"
            style={{
              background: critical.length > 0
                ? 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))'
                : warning.length > 0
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))'
                  : 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))',
              border: critical.length > 0
                ? '1px solid rgba(239,68,68,0.2)'
                : warning.length > 0
                  ? '1px solid rgba(245,158,11,0.2)'
                  : '1px solid rgba(34,197,94,0.2)',
            }}>
            <div className="flex items-center gap-2 mb-2">
              <Brain size={15} style={{ color: '#7c3aed' }} />
              <h3 className="section-title text-sm !mb-0">AI проценка на залихи</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Динамичка проекција — ја зема предвид зголемената потрошувачка од раст на рибите
            </p>

            {critical.length > 0 && (
              <div className="flex items-start gap-2 text-xs p-2 rounded-[var(--r-sm)] bg-red-50 dark:bg-red-950/20 mb-2">
                <AlertTriangle size={14} className="text-[var(--danger)] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[var(--danger)]">Критично!</strong>
                  <span className="text-[var(--text-secondary)]"> {critical.map(s =>
                    `${s.foodType} (${s.daysLeft <= 0 ? 'завршена' : s.endDate ? `до ${formatDateShortMK(s.endDate)}` : `${s.daysLeft} дена`})`
                  ).join(', ')}</span>
                </div>
              </div>
            )}

            {warning.length > 0 && (
              <div className="flex items-start gap-2 text-xs p-2 rounded-[var(--r-sm)] bg-amber-50 dark:bg-amber-950/20 mb-2">
                <Timer size={14} className="text-[var(--warning)] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[var(--warning)]">Набавете наскоро:</strong>
                  <span className="text-[var(--text-secondary)]"> {warning.map(s =>
                    `${s.foodType} (до ${s.endDate ? formatDateShortMK(s.endDate) : `${s.daysLeft} дена`})`
                  ).join(', ')}</span>
                </div>
              </div>
            )}

            <div className="text-xs text-[var(--text-muted)] mt-1">
              Следна набавка: <strong className={soonest.daysLeft <= 7 ? 'text-[var(--danger)]' : soonest.daysLeft <= 21 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}>
                {soonest.daysLeft <= 0
                  ? 'ИТНО — залихата е завршена'
                  : soonest.endDate
                    ? `до ${formatDateShortMK(soonest.endDate)}`
                    : `за ${soonest.daysLeft}+ дена`
                }
              </strong> ({soonest.foodType})
            </div>
          </div>
        );
      })()}

      {/* ── Add/Edit purchase form ── */}
      <div id="purchase-form" className="card mb-4 animate-in-delay-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title text-sm !mb-0 flex items-center gap-2">
            {isEditMode ? <Pencil size={15} className="text-[var(--primary)]" /> : <Plus size={15} className="text-[var(--success)]" />}
            {isEditMode ? 'Измени набавка' : 'Додај набавка'}
          </h3>
          {isEditMode && (
            <button onClick={() => { resetForm(); setPurchaseDate(new Date().toISOString().split('T')[0]); }}
              className="btn-ghost text-xs text-[var(--text-muted)] flex items-center gap-1">
              <X size={12} /> Откажи
            </button>
          )}
        </div>

        {/* Document info */}
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Добавувач</label>
              <input type="text" value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="input-base" placeholder="нпр. Coppens" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Број на документ</label>
              <input type="text" value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="input-base" placeholder="нпр. ФА-00123" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Датум на набавка</label>
            <input type="date" value={purchaseDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="input-base" />
            {isEditMode && (
              <p className="text-[10px] text-[var(--primary)] mt-1 font-medium">
                Пронајдени {editingEntryIds.length} набавки за овој датум — можете да ги измените
              </p>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-[var(--border)] pt-3 mb-3">
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Ставки</label>
        </div>

        {/* Food items — each item is a row with select + input */}
        <div className="space-y-2.5 mb-3">
          {purchaseItems.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <select value={item.food_type}
                  onChange={(e) => updateItem(idx, 'food_type', e.target.value)}
                  className="input-base w-full">
                  {FOOD_TYPES.map(ft => (
                    <option key={ft} value={ft}>{ft}</option>
                  ))}
                </select>
              </div>
              <div className="w-20 flex-shrink-0">
                <input type="number" step="any" value={item.quantity_kg}
                  onChange={(e) => updateItem(idx, 'quantity_kg', e.target.value)}
                  className="input-base w-full text-center" placeholder="kg" />
              </div>
              {purchaseItems.length > 1 && (
                <button onClick={() => removeItem(idx)}
                  className="p-2 rounded hover:bg-red-50 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors flex-shrink-0 mt-0.5"
                  title="Тргни">
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button onClick={addItem}
            className="btn-ghost text-xs flex items-center gap-1 text-[var(--primary)]">
            <Plus size={13} /> Додај ставка
          </button>
          <button onClick={handlePurchase} disabled={saving}
            className="btn-primary !px-5 py-2.5">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="wave-loader"><span /><span /><span /><span /></div>
              </span>
            ) : isEditMode ? (
              <><Check size={15} /> Ажурирај</>
            ) : (
              <><Plus size={15} /> Зачувај</>
            )}
          </button>
        </div>

        {message && (
          <p className={`text-xs mt-3 font-medium ${message.includes('додадена') || message.includes('ажурирана') ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {message}
          </p>
        )}
      </div>

      {/* ── Recent log ── */}
      {log.length > 0 && (() => {
        // Apply filters
        const filteredLog = log.filter(entry => {
          if (searchSupplier) {
            if (!fuzzyMatch(entry.supplier, searchSupplier)) return false;
          }
          if (searchProduct) {
            if (!fuzzyMatch(entry.food_type, searchProduct)) return false;
          }
          if (searchDateFrom) {
            const entryDate = new Date(entry.date).toISOString().split('T')[0];
            if (entryDate < searchDateFrom) return false;
          }
          if (searchDateTo) {
            const entryDate = new Date(entry.date).toISOString().split('T')[0];
            if (entryDate > searchDateTo) return false;
          }
          return true;
        });

        const hasActiveFilters = searchSupplier || searchProduct || searchDateFrom || searchDateTo;

        return (
        <div className="card animate-in-delay-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title text-sm !mb-0 flex items-center gap-2">
              <Clock size={15} className="text-[var(--text-muted)]" />
              Историја
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters(!showFilters)}
                className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors flex items-center gap-1 ${
                  showFilters || hasActiveFilters
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg)] border border-[var(--border)]'
                }`}>
                <Search size={10} />
                Пребарај
                {hasActiveFilters && <span className="ml-0.5">•</span>}
              </button>
              <div className="flex items-center gap-1">
                {[3, 7, 30].map(d => (
                  <button key={d} onClick={() => setLogDays(d)}
                    className={`text-[10px] px-2 py-1 rounded-full font-medium transition-colors ${
                      logDays === d
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--text-muted)] hover:bg-[var(--bg)]'
                    }`}>
                    {d}д
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search filters */}
          {showFilters && (
            <div className="mb-3 p-3 rounded-[var(--r-sm)] bg-[var(--bg)] space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider">Добавувач</label>
                  <input type="text" value={searchSupplier}
                    onChange={(e) => setSearchSupplier(e.target.value)}
                    className="input-base text-xs !py-1.5" placeholder="Пребарај..." />
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider">Производ</label>
                  <input type="text" value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    className="input-base text-xs !py-1.5" placeholder="Пребарај..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider">Од датум</label>
                  <input type="date" value={searchDateFrom}
                    onChange={(e) => setSearchDateFrom(e.target.value)}
                    className="input-base text-xs !py-1.5" />
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider">До датум</label>
                  <input type="date" value={searchDateTo}
                    onChange={(e) => setSearchDateTo(e.target.value)}
                    className="input-base text-xs !py-1.5" />
                </div>
              </div>
              {hasActiveFilters && (
                <button onClick={() => { setSearchSupplier(''); setSearchProduct(''); setSearchDateFrom(''); setSearchDateTo(''); }}
                  className="text-[10px] text-[var(--danger)] font-medium flex items-center gap-1 hover:underline">
                  <X size={10} /> Тргни филтри
                </button>
              )}
            </div>
          )}

          {filteredLog.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">Нема резултати</p>
          ) : (
          <div className="space-y-1.5 max-h-[450px] overflow-y-auto">
            {filteredLog.map((entry, i) => {
              const dateStr = new Date(entry.date).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' });
              const prevDate = i > 0 ? new Date(filteredLog[i-1].date).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
              const showDateHeader = dateStr !== prevDate;
              const isPurchase = entry.reason === 'purchase';
              const isEditing = editId === entry.id;
              const isDeleting = deleteConfirmId === entry.id;
              const entryDateISO = new Date(entry.date).toISOString().split('T')[0];

              return (
                <div key={`${entry.reason}-${entry.food_type}-${entry.date}-${i}`}>
                  {showDateHeader && (
                    <div className={`flex items-center justify-between ${i > 0 ? 'mt-3 pt-3 border-t border-[var(--border)]' : ''} mb-1.5`}>
                      <div className="flex items-center gap-2">
                        <Calendar size={11} className="text-[var(--text-muted)]" />
                        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{dateStr}</span>
                      </div>
                      {/* Edit all purchases for this date */}
                      {log.some(e => e.reason === 'purchase' && new Date(e.date).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' }) === dateStr) && (
                        <button onClick={() => editDateFromLog(entryDateISO)}
                          className="text-[9px] px-2 py-0.5 rounded-full text-[var(--primary)] hover:bg-[var(--primary-muted)] transition-colors flex items-center gap-1 font-medium">
                          <Pencil size={9} /> Измени ден
                        </button>
                      )}
                    </div>
                  )}

                  {/* Inline edit mode */}
                  {isEditing ? (
                    <div className="p-2.5 rounded-[var(--r-sm)] bg-[var(--bg)] border border-[var(--primary)] space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <select value={editFoodType} onChange={(e) => setEditFoodType(e.target.value)}
                          className="input-base text-xs !py-1.5">
                          {FOOD_TYPES.map(ft => (
                            <option key={ft} value={ft}>{ft}</option>
                          ))}
                        </select>
                        <input type="number" step="any" value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="input-base text-xs !py-1.5" placeholder="kg" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="date" value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="input-base text-xs !py-1.5" />
                        <input type="text" value={editSupplier}
                          onChange={(e) => setEditSupplier(e.target.value)}
                          className="input-base text-xs !py-1.5" placeholder="Добавувач" />
                        <input type="text" value={editDocNumber}
                          onChange={(e) => setEditDocNumber(e.target.value)}
                          className="input-base text-xs !py-1.5" placeholder="Бр. документ" />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={cancelEdit}
                          className="btn-ghost text-xs px-2.5 py-1 flex items-center gap-1 text-[var(--text-muted)]">
                          <X size={12} /> Откажи
                        </button>
                        <button onClick={saveEdit} disabled={editSaving}
                          className="btn-primary text-xs !px-3 !py-1 flex items-center gap-1">
                          <Check size={12} /> Зачувај
                        </button>
                      </div>
                    </div>
                  ) : isDeleting ? (
                    <div className="p-2.5 rounded-[var(--r-sm)] bg-red-50 dark:bg-red-950/20 border border-[var(--danger)]">
                      <p className="text-xs text-[var(--danger)] font-medium mb-2">
                        Избриши: {entry.food_type} — {Math.abs(parseFloat(entry.change_kg)).toFixed(2)} kg?
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setDeleteConfirmId(null)}
                          className="btn-ghost text-xs px-2.5 py-1 text-[var(--text-muted)]">
                          Откажи
                        </button>
                        <button onClick={() => handleDelete(entry.id)}
                          className="text-xs px-3 py-1 rounded-[var(--r-sm)] bg-[var(--danger)] text-white font-semibold hover:opacity-90 transition-opacity">
                          Избриши
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal row */
                    <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-[var(--r-sm)] hover:bg-[var(--bg)] transition-colors duration-150 group">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isPurchase ? (
                          <ArrowUp size={13} className="text-[var(--success)] flex-shrink-0" />
                        ) : (
                          <ArrowDown size={13} className="text-[var(--danger)] flex-shrink-0" />
                        )}
                        <span className="text-[var(--text-secondary)] truncate">{entry.food_type}</span>
                        {isPurchase && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-[var(--success)] font-medium flex-shrink-0">набавка</span>
                        )}
                        {isPurchase && (entry.supplier || entry.document_number) && (
                          <span className="text-[9px] text-[var(--text-muted)] truncate hidden sm:inline-flex items-center gap-0.5" title={[entry.supplier, entry.document_number].filter(Boolean).join(' • ')}>
                            <FileText size={9} className="flex-shrink-0" />
                            {[entry.supplier, entry.document_number].filter(Boolean).join(' • ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`font-bold ${isPurchase ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {isPurchase ? '+' : '-'}{Math.abs(parseFloat(entry.change_kg)).toFixed(2)} kg
                        </span>
                        {isPurchase && entry.id && (
                          <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(entry)}
                              className="p-1 rounded hover:bg-[var(--primary-muted)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                              title="Измени">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => { setDeleteConfirmId(entry.id); setEditId(null); }}
                              className="p-1 rounded hover:bg-red-50 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                              title="Избриши">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
