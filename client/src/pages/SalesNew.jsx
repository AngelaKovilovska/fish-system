import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Plus, Trash2, ShoppingCart, Save, X } from 'lucide-react';

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

  // Buyer fields (not a dropdown)
  const [buyer, setBuyer] = useState({ name: '', edb: '', address: '', contact_person: '', phone: '', email: '' });
  const [buyerSuggestions, setBuyerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState(null);
  const suggestRef = useRef(null);

  // Sale details
  const [form, setForm] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    due_date: '',
    payment_method: 'фактура',
    lot_number: '',
    transport_vehicle: '',
    product_temp: '',
    notes: '',
  });

  // Sale items
  const [items, setItems] = useState([{ product_type_id: '', quantity_kg: '', price_per_kg: '' }]);

  useEffect(() => { loadData(); }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadData() {
    try {
      const [typesRes, buyersRes, invRes, batchesRes] = await Promise.all([
        api.getProductTypes(),
        api.getBuyers(),
        api.getProductInventory(),
        api.getProductionBatches({ limit: 20 }),
      ]);
      setProductTypes(typesRes.productTypes || []);
      setBuyers(buyersRes.buyers || []);
      setInventory(invRes.inventory || []);
      setBatches(batchesRes.batches || []);
    } catch { setError('Грешка при вчитување'); }
    finally { setLoading(false); }
  }

  // Buyer name autocomplete
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
      name: b.name,
      edb: b.edb || '',
      address: b.address || '',
      contact_person: b.contact_person || '',
      phone: b.phone || '',
      email: b.email || '',
    });
    setSelectedBuyerId(b.id);
    setShowSuggestions(false);
  }

  // Items
  function addItem() {
    setItems([...items, { product_type_id: '', quantity_kg: '', price_per_kg: '' }]);
  }
  function removeItem(idx) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }
  function updateItem(idx, field, value) {
    const updated = [...items];
    updated[idx][field] = value;
    if (field === 'product_type_id' && value) {
      const pt = productTypes.find(t => t.id === parseInt(value));
      if (pt && pt.price_per_unit > 0) updated[idx].price_per_kg = pt.price_per_unit;
    }
    setItems(updated);
  }

  function calculateSubtotal() {
    return items.reduce((sum, item) =>
      sum + (parseFloat(item.quantity_kg) || 0) * (parseFloat(item.price_per_kg) || 0), 0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!buyer.name) return setError('Внесете име на купувач');
    const validItems = items.filter(i => i.product_type_id && parseFloat(i.quantity_kg) > 0);
    if (validItems.length === 0) return setError('Додадете барем една ставка');

    setSaving(true);
    setError('');
    try {
      // Create or reuse buyer
      let buyerId = selectedBuyerId;
      if (!buyerId) {
        const created = await api.createBuyer(buyer);
        buyerId = created.id;
      }

      const saleData = {
        ...form,
        buyer_id: buyerId,
        items: validItems.map(i => ({
          product_type_id: parseInt(i.product_type_id),
          quantity_kg: parseFloat(i.quantity_kg),
          price_per_kg: parseFloat(i.price_per_kg) || 0,
        })),
      };
      await api.createSale(saleData);
      setSuccess('Продажбата е зачувана');
      setTimeout(() => navigate('/sales/history'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const subtotal = calculateSubtotal();
  const vatAmount = Math.round(subtotal * 5) / 100;
  const total = subtotal + vatAmount;

  // Available LOT numbers from batches
  const lotNumbers = batches.filter(b => b.lot_number).map(b => b.lot_number);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5 animate-in">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
          <ShoppingCart size={20} className="text-white" />
        </div>
        <div>
          <h1 className="page-title !mb-0">Продажба</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Нова фактура-испратница</p>
        </div>
      </div>

      {error && <div className="alert alert-error mb-4 animate-in">{error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ═══ 1. Buyer ═══ */}
        <div className="card animate-in-delay-1">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: 'var(--primary)' }}>1</span>
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Купувач
            </h3>
            {selectedBuyerId && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 ml-auto">
                Зачуван
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 relative" ref={suggestRef}>
              <label className="label">Име на фирма</label>
              <input type="text" value={buyer.name}
                onChange={e => handleBuyerNameChange(e.target.value)}
                onFocus={() => { if (buyerSuggestions.length > 0) setShowSuggestions(true); }}
                className="input" placeholder="ФИРМА ДООЕЛ" autoComplete="off" />
              {showSuggestions && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg z-20 max-h-40 overflow-y-auto">
                  {buyerSuggestions.map(b => (
                    <button key={b.id} type="button"
                      onClick={() => selectBuyer(b)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--primary-muted)] transition-colors">
                      <span className="font-medium">{b.name}</span>
                      {b.edb && <span className="text-[var(--text-muted)] ml-2">({b.edb})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="label">ЕДБ</label>
              <input type="text" value={buyer.edb}
                onChange={e => setBuyer({ ...buyer, edb: e.target.value })}
                className="input" placeholder="1234567890123" />
            </div>
            <div>
              <label className="label">Контакт лице</label>
              <input type="text" value={buyer.contact_person}
                onChange={e => setBuyer({ ...buyer, contact_person: e.target.value })}
                className="input" placeholder="Име Презиме" />
            </div>
            <div className="col-span-2">
              <label className="label">Адреса</label>
              <input type="text" value={buyer.address}
                onChange={e => setBuyer({ ...buyer, address: e.target.value })}
                className="input" placeholder="ул. Улица бр. 1, Град" />
            </div>
            <div>
              <label className="label">Телефон</label>
              <input type="text" value={buyer.phone}
                onChange={e => setBuyer({ ...buyer, phone: e.target.value })}
                className="input" placeholder="+389 7X XXX XXX" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={buyer.email}
                onChange={e => setBuyer({ ...buyer, email: e.target.value })}
                className="input" placeholder="email@firma.mk" />
            </div>
          </div>
        </div>

        {/* ═══ 2. Products ═══ */}
        <div className="card animate-in-delay-2">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: 'var(--primary)' }}>2</span>
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Производи
            </h3>
            <button type="button" onClick={addItem} className="btn-ghost text-xs flex items-center gap-1 ml-auto">
              <Plus size={14} /> Додади
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const inv = inventory.find(i => i.product_type_id === parseInt(item.product_type_id));
              return (
                <div key={idx} className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)]">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 min-w-0">
                      <label className="label">Тип</label>
                      <select value={item.product_type_id}
                        onChange={e => updateItem(idx, 'product_type_id', e.target.value)}
                        className="input text-sm">
                        <option value="">— Избери —</option>
                        {productTypes.map(pt => (
                          <option key={pt.id} value={pt.id}>
                            {pt.code} - {pt.name}
                          </option>
                        ))}
                      </select>
                      {inv && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          На залиха: {parseFloat(inv.quantity_kg).toFixed(1)} кг
                        </span>
                      )}
                    </div>
                    <div className="w-20">
                      <label className="label">Кг</label>
                      <input type="number" step="0.01" min="0" value={item.quantity_kg}
                        onChange={e => updateItem(idx, 'quantity_kg', e.target.value)}
                        className="input text-sm text-right" placeholder="0" />
                    </div>
                    <div className="w-24">
                      <label className="label">Цена/кг</label>
                      <input type="number" step="0.01" min="0" value={item.price_per_kg}
                        onChange={e => updateItem(idx, 'price_per_kg', e.target.value)}
                        className="input text-sm text-right" placeholder="ден" />
                    </div>
                    <button type="button" onClick={() => removeItem(idx)}
                      className="btn-ghost p-1.5 text-[var(--danger)] mb-0.5" disabled={items.length <= 1}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* Line total */}
                  {(parseFloat(item.quantity_kg) > 0 && parseFloat(item.price_per_kg) > 0) && (
                    <div className="text-right text-[11px] text-[var(--text-secondary)] mt-1">
                      = {((parseFloat(item.quantity_kg) || 0) * (parseFloat(item.price_per_kg) || 0)).toFixed(2)} ден
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>Основица:</span>
              <span>{subtotal.toFixed(2)} ден</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>ДДВ (5%):</span>
              <span>{vatAmount.toFixed(2)} ден</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-[var(--text-primary)]">
              <span>Вкупно:</span>
              <span>{total.toFixed(2)} ден</span>
            </div>
          </div>
        </div>

        {/* ═══ 3. Details ═══ */}
        <div className="card animate-in-delay-3">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: 'var(--primary)' }}>3</span>
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Детали за испорака
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Датум</label>
              <input type="date" value={form.sale_date}
                onChange={e => setForm({ ...form, sale_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Рок за плаќање</label>
              <input type="date" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Начин на плаќање</label>
              <select value={form.payment_method}
                onChange={e => setForm({ ...form, payment_method: e.target.value })} className="input">
                <option value="фактура">Фактура</option>
                <option value="готово">Во готово</option>
                <option value="гратис">Гратис</option>
              </select>
            </div>
            <div>
              <label className="label">LOT број</label>
              <select value={form.lot_number}
                onChange={e => setForm({ ...form, lot_number: e.target.value })} className="input">
                <option value="">— Без LOT —</option>
                {lotNumbers.map(lot => <option key={lot} value={lot}>{lot}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Рег. ознака на возило</label>
              <input type="text" value={form.transport_vehicle}
                onChange={e => setForm({ ...form, transport_vehicle: e.target.value })}
                className="input" placeholder="ВЕ-1234-АА" />
            </div>
            <div>
              <label className="label">Температура (°C)</label>
              <input type="number" step="0.1" value={form.product_temp}
                onChange={e => setForm({ ...form, product_temp: e.target.value })}
                className="input" placeholder="°C" />
            </div>
          </div>

          <div className="mt-3">
            <label className="label">Забелешки</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="input" rows="2" placeholder="Опционално" />
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end animate-in-delay-4">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost flex items-center gap-1.5">
            <X size={16} /> Откажи
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
            <Save size={16} />
            {saving ? 'Се зачувува...' : 'Зачувај продажба'}
          </button>
        </div>
      </form>
    </div>
  );
}
