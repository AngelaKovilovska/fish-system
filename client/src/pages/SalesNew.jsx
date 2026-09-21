import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useBack } from '../lib/useBack';
import {
  ChevronLeft, Plus, Trash2, ShoppingCart, Save, X,
  Check, AlertCircle, User, Package, Truck, History,
} from 'lucide-react';

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  const MK = ['јан','фев','мар','апр','мај','јун','јул','авг','сеп','окт','ное','дек'];
  return `${d.getDate()} ${MK[d.getMonth()]} ${d.getFullYear()}`;
}

export default function SalesNew() {
  const navigate = useNavigate();
  const goBack = useBack('/production');
  const { id: editId } = useParams();
  const isEdit = Boolean(editId);
  const [editSale, setEditSale] = useState(null);
  const [originalItems, setOriginalItems] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* buyer */
  const [buyer, setBuyer] = useState({ name: '', edb: '', address: '', contact_person: '', phone: '', email: '' });
  const [buyerSuggestions, setBuyerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1); // тастатура: ↑ ↓ Enter во листата купувачи
  const [selectedBuyerId, setSelectedBuyerId] = useState(null);
  const suggestRef = useRef(null);

  /* sale */
  const [form, setForm] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    payment_method: 'фактура',
    lot_number: '',
    transport_vehicle: '',
    notes: '',
  });

  /* VAT rate */
  const [vatRate, setVatRate] = useState(5);

  /* items */
  const [items, setItems] = useState([{ product_type_id: '', lot_number: '', quantity_kg: '', price_per_kg: '' }]);
  // Ставка без LOT (стари продажби внесени дополнително) — не се одзема залиха
  const NO_LOT = '__none__';

  useEffect(() => { loadData(); }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClick(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadData() {
    try {
      const [t, b, inv, sale] = await Promise.all([
        api.getProductTypes(),
        api.getBuyers(),
        api.getProductInventory(),
        editId ? api.getSale(editId) : Promise.resolve(null),
      ]);
      setProductTypes(t.productTypes || []);
      setBuyers(b.buyers || []);
      setInventory(inv.inventory || []);
      if (sale) {
        setEditSale(sale);
        setSelectedBuyerId(sale.buyer_id);
        setBuyer({
          name: sale.buyer_name || '', edb: sale.buyer_edb || '', address: sale.buyer_address || '',
          contact_person: sale.buyer_contact || '', phone: sale.buyer_phone || '', email: sale.buyer_email || '',
        });
        setForm({
          sale_date: (sale.sale_date || '').slice(0, 10),
          payment_method: sale.payment_method || 'фактура',
          lot_number: sale.lot_number || '',
          transport_vehicle: sale.transport_vehicle || '',
          notes: sale.notes || '',
        });
        setVatRate(parseFloat(sale.vat_rate) || 5);
        const its = (sale.items || []).map(i => ({
          product_type_id: String(i.product_type_id), lot_number: i.lot_number || NO_LOT,
          quantity_kg: String(i.quantity_kg), price_per_kg: String(i.price_per_kg),
        }));
        setItems(its.length ? its : [{ product_type_id: '', lot_number: '', quantity_kg: '', price_per_kg: '' }]);
        setOriginalItems((sale.items || []).map(i => ({
          product_type_id: i.product_type_id, lot_number: i.lot_number || '', quantity_kg: parseFloat(i.quantity_kg) || 0,
        })));
      }
    } catch { setError('Грешка при вчитување'); }
    finally { setLoading(false); }
  }

  /* buyer autocomplete */
  function handleBuyerNameChange(value) {
    setBuyer({ ...buyer, name: value });
    setSelectedBuyerId(null);
    if (value.length >= 2) {
      const matches = buyers.filter(b => b.name.toLowerCase().includes(value.toLowerCase()));
      setBuyerSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setHighlightIdx(matches.length > 0 ? 0 : -1);
    } else {
      setShowSuggestions(false);
    }
  }

  // Тастатура во полето за купувач: ↓/↑ движење, Enter избор, Esc затвора
  function handleBuyerKeyDown(e) {
    if (!showSuggestions || buyerSuggestions.length === 0) {
      if (e.key === 'ArrowDown' && buyerSuggestions.length > 0) { setShowSuggestions(true); setHighlightIdx(0); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => (i + 1) % buyerSuggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => (i <= 0 ? buyerSuggestions.length - 1 : i - 1)); }
    else if (e.key === 'Enter') {
      if (highlightIdx >= 0) { e.preventDefault(); selectBuyer(buyerSuggestions[highlightIdx]); }
    }
    else if (e.key === 'Escape') { setShowSuggestions(false); setHighlightIdx(-1); }
  }

  function selectBuyer(b) {
    setBuyer({
      name: b.name, edb: b.edb || '', address: b.address || '',
      contact_person: b.contact_person || '', phone: b.phone || '', email: b.email || '',
    });
    setSelectedBuyerId(b.id);
    setShowSuggestions(false);
    setHighlightIdx(-1);
  }

  function clearBuyer() {
    setBuyer({ name: '', edb: '', address: '', contact_person: '', phone: '', email: '' });
    setSelectedBuyerId(null);
  }

  /* items */
  function addItem() { setItems([...items, { product_type_id: '', lot_number: '', quantity_kg: '', price_per_kg: '' }]); }
  function removeItem(idx) { if (items.length <= 1) return; setItems(items.filter((_, i) => i !== idx)); }
  function updateItem(idx, field, value) {
    const updated = [...items];
    updated[idx][field] = value;
    if (field === 'product_type_id') {
      const pt = productTypes.find(t => t.id === parseInt(value));
      if (pt && pt.price_per_unit > 0) updated[idx].price_per_kg = pt.price_per_unit;
      // FIFO: најстар LOT со залиха
      const lots = lotsFor(value);
      updated[idx].lot_number = lots[0]?.lot_number || NO_LOT;
    }
    setItems(updated);
  }

  /* LOT-ови со залиха за производ (FIFO редослед доаѓа од серверот) */
  function lotsFor(productTypeId) {
    const ptId = parseInt(productTypeId);
    const inv = inventory.find(i => i.product_type_id === ptId);
    const lots = (inv?.lots || []).map(l => ({ ...l, quantity_kg: parseFloat(l.quantity_kg) || 0 }));
    // При уредување: количините од оваа продажба се „вратени“ во нивните LOT-ови
    for (const o of originalItems) {
      if (o.product_type_id !== ptId || !o.lot_number) continue;
      const found = lots.find(l => l.lot_number === o.lot_number);
      if (found) found.quantity_kg += o.quantity_kg;
      else lots.push({ lot_number: o.lot_number, quantity_kg: o.quantity_kg, expiry_date: null });
    }
    return lots.filter(l => l.quantity_kg > 0);
  }
  function availableInv(productTypeId) {
    return lotsFor(productTypeId).reduce((s, l) => s + l.quantity_kg, 0);
  }
  function fmtShort(d) {
    if (!d) return '';
    const x = new Date(d);
    return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`;
  }

  /* totals */
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.quantity_kg) || 0) * (parseFloat(i.price_per_kg) || 0), 0);
  // Готово/гратис → без ДДВ
  const noVat = ['готово', 'гратис'].includes(form.payment_method);
  const effectiveVatRate = noVat ? 0 : vatRate;
  const vatAmount = Math.round(subtotal * effectiveVatRate) / 100;
  const total = subtotal + vatAmount;
  const dueDate = addDays(form.sale_date, 7);

  /* submit */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!buyer.name) return setError('Внесете име на купувач');
    const validItems = items.filter(i => i.product_type_id && parseFloat(i.quantity_kg) > 0);
    if (validItems.length === 0) return setError('Додадете барем една ставка');
    setSaving(true); setError('');
    try {
      let buyerId = selectedBuyerId;
      if (!buyerId) {
        const created = await api.createBuyer(buyer);
        buyerId = created.id;
      }
      const payload = {
        ...form,
        product_temp: '-18',
        due_date: dueDate,
        buyer_id: buyerId,
        vat_rate: vatRate,
        items: validItems.map(i => ({
          product_type_id: parseInt(i.product_type_id),
          lot_number: i.lot_number === NO_LOT ? null : (i.lot_number || null),
          no_lot: i.lot_number === NO_LOT,
          quantity_kg: parseFloat(i.quantity_kg),
          price_per_kg: parseFloat(i.price_per_kg) || 0,
        })),
      };
      if (isEdit) await api.updateSale(editId, payload);
      else await api.createSale(payload);
      setSuccess(isEdit ? 'Продажбата е ажурирана' : 'Продажбата е зачувана');
      setTimeout(() => navigate('/production/sales/history'), 1500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }


  if (loading) return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="skeleton h-10 w-48" /><div className="skeleton h-64 w-full" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">

      {/* header */}
      <div className="mb-5 animate-in">
        <button onClick={goBack}
          className="inline-flex items-center gap-1 text-xs text-(--primary) font-medium mb-3 hover:underline">
          <ChevronLeft size={14} /> Назад
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
              <ShoppingCart size={20} className="text-white" />
            </div>
            <div>
              <h1 className="page-title !mb-0">{isEdit ? 'Уреди продажба' : 'Нова продажба'}</h1>
              <p className="text-xs text-(--text-secondary) mt-0.5">{isEdit && editSale ? `Фактура ${editSale.invoice_number}` : 'Фактура-испратница'}</p>
            </div>
          </div>
          <button onClick={() => navigate('/production/sales/history')}
            className="flex items-center gap-1.5 text-xs font-medium text-(--primary) bg-(--surface-elevated) border border-(--border) rounded-(--r-sm) px-3 py-2 hover:bg-(--surface-hover) transition-colors">
            <History size={14} /> Историја
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-4 animate-in flex items-center gap-2"><AlertCircle size={16} className="flex-shrink-0" /> {error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in flex items-center gap-2"><Check size={16} className="flex-shrink-0" /> {success}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ═══ 1. КУПУВАЧ ═══ */}
        <div className="card animate-in">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: 'var(--primary)' }}>1</div>
            <User size={14} className="text-(--text-muted)" />
            <h3 className="text-sm font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>Купувач</h3>
            {selectedBuyerId && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 ml-auto flex items-center gap-1">
                <Check size={10} /> Зачуван
              </span>
            )}
          </div>

          {/* name + autocomplete */}
          <div className="relative mb-3" ref={suggestRef}>
            <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Име на фирма</label>
            <div className="flex gap-2">
              <input type="text" value={buyer.name}
                onChange={e => handleBuyerNameChange(e.target.value)}
                onFocus={() => { if (buyerSuggestions.length > 0) setShowSuggestions(true); }}
                onKeyDown={handleBuyerKeyDown}
                className="input-base text-sm flex-1" placeholder="Започнете да пишувате..." autoComplete="off" />
              {buyer.name && (
                <button type="button" onClick={clearBuyer} className="btn-ghost p-2 text-(--text-muted)"><X size={14} /></button>
              )}
            </div>
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-(--surface) border border-(--border) rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                {buyerSuggestions.map((b, i) => (
                  <button key={b.id} type="button" onClick={() => selectBuyer(b)} onMouseEnter={() => setHighlightIdx(i)}
                    ref={el => { if (el && i === highlightIdx) el.scrollIntoView({ block: 'nearest' }); }}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-(--border) last:border-0 ${i === highlightIdx ? 'bg-(--surface-elevated)' : 'hover:bg-(--surface-elevated)'}`}>
                    <span className="font-medium text-(--text-primary)">{b.name}</span>
                    {b.edb && <span className="text-[10px] text-(--text-muted) ml-2">ЕДБ: {b.edb}</span>}
                    {b.address && <p className="text-[10px] text-(--text-muted) mt-0.5">{b.address}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* buyer details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">ЕДБ</label>
              <input type="text" value={buyer.edb} onChange={e => setBuyer({ ...buyer, edb: e.target.value })}
                className="input-base text-sm" placeholder="1234567890123" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Контакт лице</label>
              <input type="text" value={buyer.contact_person} onChange={e => setBuyer({ ...buyer, contact_person: e.target.value })}
                className="input-base text-sm" placeholder="Име Презиме" />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Адреса</label>
              <input type="text" value={buyer.address} onChange={e => setBuyer({ ...buyer, address: e.target.value })}
                className="input-base text-sm" placeholder="ул. Улица бр. 1, Град" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Телефон</label>
              <input type="text" value={buyer.phone} onChange={e => setBuyer({ ...buyer, phone: e.target.value })}
                className="input-base text-sm" placeholder="+389 7X XXX XXX" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Email</label>
              <input type="email" value={buyer.email} onChange={e => setBuyer({ ...buyer, email: e.target.value })}
                className="input-base text-sm" placeholder="email@firma.mk" />
            </div>
          </div>
        </div>

        {/* ═══ 2. ПРОИЗВОДИ ═══ */}
        <div className="card animate-in">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: 'var(--primary)' }}>2</div>
            <Package size={14} className="text-(--text-muted)" />
            <h3 className="text-sm font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>Производи</h3>
            <button type="button" onClick={addItem} className="btn-ghost text-xs flex items-center gap-1 ml-auto text-(--primary)">
              <Plus size={14} /> Додади
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const lineTotal = (parseFloat(item.quantity_kg) || 0) * (parseFloat(item.price_per_kg) || 0);
              return (
                <div key={idx} className="bg-(--surface-elevated) rounded-(--r-sm) p-3 border border-(--border)">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-(--text-muted) bg-(--surface) w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                    <div className="flex-1">
                      <select value={item.product_type_id} onChange={e => updateItem(idx, 'product_type_id', e.target.value)}
                        className="input-base text-sm w-full">
                        <option value="">— Избери производ —</option>
                        {productTypes.map(pt => (
                          <option key={pt.id} value={pt.id}>{pt.code} — {pt.name}</option>
                        ))}
                      </select>
                    </div>
                    <button type="button" onClick={() => removeItem(idx)} disabled={items.length <= 1}
                      className="btn-ghost p-1.5 text-(--danger) flex-shrink-0"><Trash2 size={13} /></button>
                  </div>

                  {item.product_type_id && (() => {
                    const lots = lotsFor(item.product_type_id);
                    const sel = lots.find(l => l.lot_number === item.lot_number);
                    return (
                      <div className="mb-2 ml-7">
                        <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">
                          LOT / серија <span className="normal-case font-normal">— вкупно на залиха {availableInv(item.product_type_id).toFixed(2)} кг</span>
                        </label>
                        <select value={item.lot_number || NO_LOT} onChange={e => updateItem(idx, 'lot_number', e.target.value)}
                          className="input-base text-sm w-full">
                          {lots.map(l => (
                            <option key={l.lot_number} value={l.lot_number}>
                              {l.lot_number} · {parseFloat(l.quantity_kg).toFixed(2)} кг{l.expiry_date ? ` · рок ${fmtShort(l.expiry_date)}` : ''}
                            </option>
                          ))}
                          <option value={NO_LOT}>— без LOT (не се одзема залиха) —</option>
                        </select>
                        {item.lot_number === NO_LOT && (
                          <p className="text-[11px] text-(--text-muted) mt-1">Ставката не се одзема од залихата — за продажби внесени дополнително.</p>
                        )}
                        {lots.length === 0 && item.lot_number !== NO_LOT && (
                          <p className="text-[11px] text-(--danger) font-medium mt-1">Нема залиха за овој производ</p>
                        )}
                        {sel && parseFloat(item.quantity_kg) > parseFloat(sel.quantity_kg) && (
                          <p className="text-[11px] text-(--danger) font-medium mt-1">
                            Во LOT {sel.lot_number} има само {parseFloat(sel.quantity_kg).toFixed(2)} кг — поделете во две ставки
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-2 ml-7">
                    <div>
                      <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Количина (кг)</label>
                      <input type="number" step="any" min="0" value={item.quantity_kg}
                        onChange={e => updateItem(idx, 'quantity_kg', e.target.value)}
                        className="input-base text-sm" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Цена (ден/кг)</label>
                      <input type="number" step="0.01" min="0" value={item.price_per_kg}
                        onChange={e => updateItem(idx, 'price_per_kg', e.target.value)}
                        className="input-base text-sm" placeholder="0.00" />
                    </div>
                  </div>

                  {lineTotal > 0 && (
                    <p className="text-right text-[11px] font-semibold text-(--text-secondary) mt-2 mr-1">
                      = {lineTotal.toFixed(2)} ден
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* totals */}
          <div className="mt-4 pt-3 border-t border-(--border) space-y-1">
            <div className="flex justify-between text-xs text-(--text-secondary)">
              <span>Основица:</span><span>{subtotal.toFixed(2)} ден</span>
            </div>
            <div className="flex justify-between items-center text-xs text-(--text-secondary)">
              <span className="flex items-center gap-1.5">
                ДДВ:
                {noVat ? (
                  <span className="text-[11px] text-(--text-muted)">не се пресметува ({form.payment_method})</span>
                ) : (
                  <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))}
                    className="text-xs font-semibold bg-(--surface-elevated) border border-(--border) rounded-md px-1.5 py-0.5 text-(--primary) cursor-pointer">
                    <option value={5}>5%</option>
                    <option value={10}>10%</option>
                    <option value={18}>18%</option>
                  </select>
                )}
              </span>
              <span>{vatAmount.toFixed(2)} ден</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-(--text-primary) pt-1">
              <span>Вкупно:</span><span>{total.toFixed(2)} ден</span>
            </div>
          </div>
        </div>

        {/* ═══ 3. ИСПОРАКА ═══ */}
        <div className="card animate-in">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: 'var(--primary)' }}>3</div>
            <Truck size={14} className="text-(--text-muted)" />
            <h3 className="text-sm font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>Испорака</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Датум на продажба</label>
              <input type="date" value={form.sale_date}
                onChange={e => setForm({ ...form, sale_date: e.target.value })}
                className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Рок за плаќање</label>
              <div className="input-base text-sm bg-(--surface-elevated) !cursor-default opacity-75">
                {fmtDate(dueDate)}
              </div>
              <p className="text-[9px] text-(--text-muted) mt-0.5">Автоматски: +7 дена</p>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Начин на плаќање</label>
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
                className="input-base text-sm">
                <option value="фактура">Фактура</option>
                <option value="готово">Во готово</option>
                <option value="гратис">Гратис</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">LOT број</label>
              <div className="input-base text-sm bg-(--surface-elevated) text-(--text-secondary)">
                {[...new Set(items.map(i => i.lot_number).filter(l => l && l !== NO_LOT))].join(', ') || '— без LOT —'}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Рег. ознака на возило</label>
              <input type="text" value={form.transport_vehicle}
                onChange={e => setForm({ ...form, transport_vehicle: e.target.value })}
                className="input-base text-sm" placeholder="ВЕ-1234-АА" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Температура</label>
              <div className="input-base text-sm bg-(--surface-elevated) !cursor-default opacity-75">
                -18°C
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Забелешки (опционално)</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="input-base text-sm" rows="2" placeholder="Дополнителни информации..." />
          </div>
        </div>

        {/* submit */}
        <div className="flex gap-3 animate-in">
          <button type="button" onClick={() => navigate('/production')}
            className="btn-ghost flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm">
            <X size={15} /> Откажи
          </button>
          <button type="submit" disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm">
            <Save size={15} /> {saving ? 'Зачувување...' : isEdit ? 'Зачувај промени' : 'Зачувај продажба'}
          </button>
        </div>
      </form>
    </div>
  );
}
