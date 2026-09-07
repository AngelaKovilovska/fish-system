import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronLeft, Plus, Trash2, UserPlus, ShoppingCart } from 'lucide-react';

export default function SalesNew() {
  const navigate = useNavigate();
  const [productTypes, setProductTypes] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sale form
  const [form, setForm] = useState({
    buyer_id: '',
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

  // New buyer form
  const [showNewBuyer, setShowNewBuyer] = useState(false);
  const [newBuyer, setNewBuyer] = useState({ name: '', address: '', edb: '', contact_person: '', phone: '', email: '' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [typesRes, buyersRes, invRes] = await Promise.all([
        api.getProductTypes(),
        api.getBuyers(),
        api.getProductInventory(),
      ]);
      setProductTypes(typesRes.productTypes || []);
      setBuyers(buyersRes.buyers || []);
      setInventory(invRes.inventory || []);
    } catch {
      setError('Грешка при вчитување');
    } finally {
      setLoading(false);
    }
  }

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

    // Auto-fill price from product type
    if (field === 'product_type_id' && value) {
      const pt = productTypes.find(t => t.id === parseInt(value));
      if (pt && pt.price_per_unit > 0) {
        updated[idx].price_per_kg = pt.price_per_unit;
      }
    }

    setItems(updated);
  }

  function calculateSubtotal() {
    return items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity_kg) || 0) * (parseFloat(item.price_per_kg) || 0);
    }, 0);
  }

  async function handleCreateBuyer(e) {
    e.preventDefault();
    if (!newBuyer.name) return;
    try {
      const result = await api.createBuyer(newBuyer);
      setBuyers([...buyers, result]);
      setForm({ ...form, buyer_id: result.id });
      setShowNewBuyer(false);
      setNewBuyer({ name: '', address: '', edb: '', contact_person: '', phone: '', email: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.buyer_id) return setError('Изберете купувач');
    const validItems = items.filter(i => i.product_type_id && parseFloat(i.quantity_kg) > 0);
    if (validItems.length === 0) return setError('Додадете барем една ставка');

    setSaving(true);
    setError('');
    try {
      const saleData = {
        ...form,
        buyer_id: parseInt(form.buyer_id),
        items: validItems.map(i => ({
          product_type_id: parseInt(i.product_type_id),
          quantity_kg: parseFloat(i.quantity_kg),
          price_per_kg: parseFloat(i.price_per_kg) || 0,
        })),
      };
      const result = await api.createSale(saleData);
      setSuccess('Продажбата е креирана');
      // Navigate to sales history where they can print documents
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
        <button onClick={() => navigate(-1)} className="btn-ghost p-1.5 -ml-1.5"><ChevronLeft size={20} /></button>
        <div>
          <h1 className="page-title !mb-0">Нова продажба</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Фактура + испратница</p>
        </div>
      </div>

      {error && <div className="alert alert-error mb-4 animate-in">{error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in">{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Buyer selection */}
        <div className="card mb-4 animate-in-delay-1">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>Купувач</h3>
          <div className="flex gap-2">
            <select value={form.buyer_id} onChange={e => setForm({ ...form, buyer_id: e.target.value })} className="input flex-1">
              <option value="">— Избери купувач —</option>
              {buyers.map(b => (
                <option key={b.id} value={b.id}>{b.name}{b.edb ? ` (${b.edb})` : ''}</option>
              ))}
            </select>
            <button type="button" onClick={() => setShowNewBuyer(!showNewBuyer)} className="btn-ghost text-sm flex items-center gap-1">
              <UserPlus size={16} /> Нов
            </button>
          </div>

          {showNewBuyer && (
            <div className="mt-3 p-3 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Нов купувач</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input type="text" placeholder="Име *" value={newBuyer.name}
                  onChange={e => setNewBuyer({ ...newBuyer, name: e.target.value })} className="input text-sm" />
                <input type="text" placeholder="ЕДБ" value={newBuyer.edb}
                  onChange={e => setNewBuyer({ ...newBuyer, edb: e.target.value })} className="input text-sm" />
                <input type="text" placeholder="Адреса" value={newBuyer.address}
                  onChange={e => setNewBuyer({ ...newBuyer, address: e.target.value })} className="input text-sm col-span-2" />
                <input type="text" placeholder="Контакт лице" value={newBuyer.contact_person}
                  onChange={e => setNewBuyer({ ...newBuyer, contact_person: e.target.value })} className="input text-sm" />
                <input type="text" placeholder="Телефон" value={newBuyer.phone}
                  onChange={e => setNewBuyer({ ...newBuyer, phone: e.target.value })} className="input text-sm" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowNewBuyer(false)} className="btn-ghost text-xs">Откажи</button>
                <button type="button" onClick={handleCreateBuyer} className="btn-primary text-xs">Зачувај купувач</button>
              </div>
            </div>
          )}
        </div>

        {/* Sale details */}
        <div className="card mb-4 animate-in-delay-2">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>Детали</h3>
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
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="input">
                <option value="фактура">Фактура</option>
                <option value="готово">Во готово</option>
                <option value="гратис">Гратис</option>
              </select>
            </div>
            <div>
              <label className="label">LOT број</label>
              <input type="text" value={form.lot_number}
                onChange={e => setForm({ ...form, lot_number: e.target.value })} className="input" placeholder="LOT-..." />
            </div>
            <div>
              <label className="label">Возило (транспорт)</label>
              <input type="text" value={form.transport_vehicle}
                onChange={e => setForm({ ...form, transport_vehicle: e.target.value })} className="input" placeholder="Рег. табл." />
            </div>
            <div>
              <label className="label">Температура (°C)</label>
              <input type="number" step="0.1" value={form.product_temp}
                onChange={e => setForm({ ...form, product_temp: e.target.value })} className="input" placeholder="°C" />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card mb-4 animate-in-delay-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Ставки</h3>
            <button type="button" onClick={addItem} className="btn-ghost text-xs flex items-center gap-1">
              <Plus size={14} /> Додади
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const inv = inventory.find(i => i.product_type_id === parseInt(item.product_type_id));
              return (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    {idx === 0 && <label className="label">Производ</label>}
                    <select value={item.product_type_id} onChange={e => updateItem(idx, 'product_type_id', e.target.value)} className="input text-sm">
                      <option value="">— Тип —</option>
                      {productTypes.map(pt => (
                        <option key={pt.id} value={pt.id}>{pt.name} ({pt.code})</option>
                      ))}
                    </select>
                    {inv && <span className="text-[10px] text-[var(--text-muted)]">Залиха: {inv.quantity_kg} кг</span>}
                  </div>
                  <div className="w-24">
                    {idx === 0 && <label className="label">Кг</label>}
                    <input type="number" step="0.01" min="0" value={item.quantity_kg}
                      onChange={e => updateItem(idx, 'quantity_kg', e.target.value)} className="input text-sm" placeholder="кг" />
                  </div>
                  <div className="w-28">
                    {idx === 0 && <label className="label">Цена/кг</label>}
                    <input type="number" step="0.01" min="0" value={item.price_per_kg}
                      onChange={e => updateItem(idx, 'price_per_kg', e.target.value)} className="input text-sm" placeholder="ден" />
                  </div>
                  <div className="w-24 text-right">
                    {idx === 0 && <label className="label">Износ</label>}
                    <p className="text-sm font-medium text-[var(--text-primary)] py-2">
                      {((parseFloat(item.quantity_kg) || 0) * (parseFloat(item.price_per_kg) || 0)).toFixed(2)}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeItem(idx)}
                    className="btn-ghost p-1.5 text-[var(--danger)] mb-0.5" disabled={items.length <= 1}>
                    <Trash2 size={14} />
                  </button>
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

        {/* Notes */}
        <div className="card mb-4 animate-in-delay-4">
          <label className="label">Забелешки</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            className="input" rows="2" placeholder="Опционално" />
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end animate-in-delay-5">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost">Откажи</button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <ShoppingCart size={16} />
            {saving ? 'Се зачувува...' : 'Креирај продажба'}
          </button>
        </div>
      </form>
    </div>
  );
}
