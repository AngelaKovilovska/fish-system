import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
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
  const [productTypes, setProductTypes] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* buyer */
  const [buyer, setBuyer] = useState({ name: '', edb: '', address: '', contact_person: '', phone: '', email: '' });
  const [buyerSuggestions, setBuyerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
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
  const [items, setItems] = useState([{ product_type_id: '', quantity_kg: '', price_per_kg: '' }]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    function handleClick(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadData() {
    try {
      const [t, b, inv, bat] = await Promise.all([
        api.getProductTypes(),
        api.getBuyers(),
        api.getProductInventory(),
        api.getProductionBatches({ limit: 50 }),
      ]);
      setProductTypes(t.productTypes || []);
      setBuyers(b.buyers || []);
      setInventory(inv.inventory || []);
      setBatches(bat.batches || []);
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
    } else {
      setShowSuggestions(false);
    }
  }

  function selectBuyer(b) {
    setBuyer({
      name: b.name, edb: b.edb || '', address: b.address || '',
      contact_person: b.contact_person || '', phone: b.phone || '', email: b.email || '',
    });
    setSelectedBuyerId(b.id);
    setShowSuggestions(false);
  }

  function clearBuyer() {
    setBuyer({ name: '', edb: '', address: '', contact_person: '', phone: '', email: '' });
    setSelectedBuyerId(null);
  }

  /* items */
  function addItem() { setItems([...items, { product_type_id: '', quantity_kg: '', price_per_kg: '' }]); }
  function removeItem(idx) { if (items.length <= 1) return; setItems(items.filter((_, i) => i !== idx)); }
  function updateItem(idx, field, value) {
    const updated = [...items];
    updated[idx][field] = value;
    if (field === 'product_type_id' && value) {
      const pt = productTypes.find(t => t.id === parseInt(value));
      if (pt && pt.price_per_unit > 0) updated[idx].price_per_kg = pt.price_per_unit;
    }
    setItems(updated);
  }

  /* totals */
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.quantity_kg) || 0) * (parseFloat(i.price_per_kg) || 0), 0);
  const vatAmount = Math.round(subtotal * vatRate) / 100;
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
      await api.createSale({
        ...form,
        product_temp: '-18',
        due_date: dueDate,
        buyer_id: buyerId,
        vat_rate: vatRate,
        items: validItems.map(i => ({
          product_type_id: parseInt(i.product_type_id),
          quantity_kg: parseFloat(i.quantity_kg),
          price_per_kg: parseFloat(i.price_per_kg) || 0,
        })),
      });
      setSuccess('Продажбата е зачувана');
      setTimeout(() => navigate('/production/sales/history'), 1500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const lotNumbers = batches.filter(b => b.lot_number).map(b => b.lot_number);

  if (loading) return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="skeleton h-10 w-48" /><div className="skeleton h-64 w-full" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">

      {/* header */}
      <div className="mb-5 animate-in">
        <button onClick={() => navigate('/production')}
          className="inline-flex items-center gap-1 text-xs text-[var(--primary)] font-medium mb-3 hover:underline">
          <ChevronLeft size={14} /> Назад
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
              <ShoppingCart size={20} className="text-white" />
            </div>
            <div>
              <h1 className="page-title !mb-0">Нова продажба</h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Фактура-испратница</p>
            </div>
          </div>
          <button onClick={() => navigate('/production/sales/history')}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[var(--r-sm)] px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors">
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
            <User size={14} className="text-[var(--text-muted)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Купувач</h3>
            {selectedBuyerId && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 ml-auto flex items-center gap-1">
                <Check size={10} /> Зачуван
              </span>
            )}
          </div>

          {/* name + autocomplete */}
          <div className="relative mb-3" ref={suggestRef}>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Име на фирма</label>
            <div className="flex gap-2">
              <input type="text" value={buyer.name}
                onChange={e => handleBuyerNameChange(e.target.value)}
                onFocus={() => { if (buyerSuggestions.length > 0) setShowSuggestions(true); }}
                className="input-base text-sm flex-1" placeholder="Започнете да пишувате..." autoComplete="off" />
              {buyer.name && (
                <button type="button" onClick={clearBuyer} className="btn-ghost p-2 text-[var(--text-muted)]"><X size={14} /></button>
              )}
            </div>
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                {buyerSuggestions.map(b => (
                  <button key={b.id} type="button" onClick={() => selectBuyer(b)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--surface-elevated)] transition-colors border-b border-[var(--border)] last:border-0">
                    <span className="font-medium text-[var(--text-primary)]">{b.name}</span>
                    {b.edb && <span className="text-[10px] text-[var(--text-muted)] ml-2">ЕДБ: {b.edb}</span>}
                    {b.address && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{b.address}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* buyer details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">ЕДБ</label>
              <input type="text" value={buyer.edb} onChange={e => setBuyer({ ...buyer, edb: e.target.value })}
                className="input-base text-sm" placeholder="1234567890123" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Контакт лице</label>
              <input type="text" value={buyer.contact_person} onChange={e => setBuyer({ ...buyer, contact_person: e.target.value })}
                className="input-base text-sm" placeholder="Име Презиме" />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Адреса</label>
              <input type="text" value={buyer.address} onChange={e => setBuyer({ ...buyer, address: e.target.value })}
                className="input-base text-sm" placeholder="ул. Улица бр. 1, Град" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Телефон</label>
              <input type="text" value={buyer.phone} onChange={e => setBuyer({ ...buyer, phone: e.target.value })}
                className="input-base text-sm" placeholder="+389 7X XXX XXX" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Email</label>
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
            <Package size={14} className="text-[var(--text-muted)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Производи</h3>
            <button type="button" onClick={addItem} className="btn-ghost text-xs flex items-center gap-1 ml-auto text-[var(--primary)]">
              <Plus size={14} /> Додади
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const inv = inventory.find(i => i.product_type_id === parseInt(item.product_type_id));
              const lineTotal = (parseFloat(item.quantity_kg) || 0) * (parseFloat(item.price_per_kg) || 0);
              return (
                <div key={idx} className="bg-[var(--surface-elevated)] rounded-[var(--r-sm)] p-3 border border-[var(--border)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--surface)] w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{idx + 1}</span>
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
                      className="btn-ghost p-1.5 text-[var(--danger)] flex-shrink-0"><Trash2 size={13} /></button>
                  </div>

                  {inv && (
                    <p className="text-[10px] text-[var(--text-muted)] mb-2 ml-7">
                      На залиха: <span className="font-semibold">{parseFloat(inv.quantity_kg).toFixed(1)} кг</span>
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 ml-7">
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Количина (кг)</label>
                      <input type="number" step="0.01" min="0" value={item.quantity_kg}
                        onChange={e => updateItem(idx, 'quantity_kg', e.target.value)}
                        className="input-base text-sm" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Цена (ден/кг)</label>
                      <input type="number" step="0.01" min="0" value={item.price_per_kg}
                        onChange={e => updateItem(idx, 'price_per_kg', e.target.value)}
                        className="input-base text-sm" placeholder="0.00" />
                    </div>
                  </div>

                  {lineTotal > 0 && (
                    <p className="text-right text-[11px] font-semibold text-[var(--text-secondary)] mt-2 mr-1">
                      = {lineTotal.toFixed(2)} ден
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* totals */}
          <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-secondary)]">
              <span>Основица:</span><span>{subtotal.toFixed(2)} ден</span>
            </div>
            <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                ДДВ:
                <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))}
                  className="text-xs font-semibold bg-[var(--surface-elevated)] border border-[var(--border)] rounded-md px-1.5 py-0.5 text-[var(--primary)] cursor-pointer">
                  <option value={5}>5%</option>
                  <option value={10}>10%</option>
                  <option value={18}>18%</option>
                </select>
              </span>
              <span>{vatAmount.toFixed(2)} ден</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-[var(--text-primary)] pt-1">
              <span>Вкупно:</span><span>{total.toFixed(2)} ден</span>
            </div>
          </div>
        </div>

        {/* ═══ 3. ИСПОРАКА ═══ */}
        <div className="card animate-in">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: 'var(--primary)' }}>3</div>
            <Truck size={14} className="text-[var(--text-muted)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Испорака</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Датум на продажба</label>
              <input type="date" value={form.sale_date}
                onChange={e => setForm({ ...form, sale_date: e.target.value })}
                className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Рок за плаќање</label>
              <div className="input-base text-sm bg-[var(--surface-elevated)] !cursor-default opacity-75">
                {fmtDate(dueDate)}
              </div>
              <p className="text-[9px] text-[var(--text-muted)] mt-0.5">Автоматски: +7 дена</p>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Начин на плаќање</label>
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
                className="input-base text-sm">
                <option value="фактура">Фактура</option>
                <option value="готово">Во готово</option>
                <option value="гратис">Гратис</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">LOT број</label>
              <select value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })}
                className="input-base text-sm">
                <option value="">— Без LOT —</option>
                {lotNumbers.map(lot => <option key={lot} value={lot}>{lot}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Рег. ознака на возило</label>
              <input type="text" value={form.transport_vehicle}
                onChange={e => setForm({ ...form, transport_vehicle: e.target.value })}
                className="input-base text-sm" placeholder="ВЕ-1234-АА" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Температура</label>
              <div className="input-base text-sm bg-[var(--surface-elevated)] !cursor-default opacity-75">
                -18°C
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Забелешки (опционално)</label>
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
            <Save size={15} /> {saving ? 'Зачувување...' : 'Зачувај продажба'}
          </button>
        </div>
      </form>
    </div>
  );
}
