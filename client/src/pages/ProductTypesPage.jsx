import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronLeft, Plus, Save, Trash2, Package, X } from 'lucide-react';

export default function ProductTypesPage() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState({ code: '', name: '', price_per_unit: '' });
  const [editPrices, setEditPrices] = useState({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [typesRes, invRes] = await Promise.all([
        api.getProductTypes(),
        api.getProductInventory(),
      ]);
      setTypes(typesRes.productTypes || []);
      setInventory(invRes.inventory || []);
      // Init edit prices
      const prices = {};
      (typesRes.productTypes || []).forEach(t => { prices[t.id] = t.price_per_unit; });
      setEditPrices(prices);
    } catch { setError('Грешка'); }
    finally { setLoading(false); }
  }

  async function handleAddType(e) {
    e.preventDefault();
    if (!newType.code || !newType.name) return setError('Потребни се код и име');
    try {
      await api.createProductType(newType);
      setShowNew(false);
      setNewType({ code: '', name: '', price_per_unit: '' });
      setSuccess('Типот е додаден');
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  }

  async function handleSavePrice(id) {
    try {
      await api.updateProductType(id, { price_per_unit: parseFloat(editPrices[id]) || 0 });
      setSuccess('Цената е зачувана');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Деактивирај го типот?')) return;
    try {
      await api.deleteProductType(id);
      await loadData();
    } catch (err) { setError(err.message); }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto"><div className="skeleton h-10 w-48 mb-4" /><div className="skeleton h-32 w-full" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5 animate-in">
        <button onClick={() => navigate('/production')} className="btn-ghost p-1.5 -ml-1.5"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="page-title !mb-0">Типови производи</h1>
          <p className="text-xs text-(--text-secondary) mt-0.5">Цени и залиха</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary text-sm flex items-center gap-1.5"><Plus size={16} /> Нов тип</button>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}
      {success && <div className="alert alert-success mb-4">{success}</div>}

      {showNew && (
        <form onSubmit={handleAddType} className="card mb-4 animate-in border-2" style={{ borderColor: 'var(--primary)' }}>
          <h3 className="text-sm font-bold text-(--text-primary) mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>Нов тип на производ</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">Код *</label>
              <input type="text" value={newType.code} onChange={e => setNewType({ ...newType, code: e.target.value })} className="input" placeholder="ДР" />
            </div>
            <div>
              <label className="label">Име *</label>
              <input type="text" value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} className="input" placeholder="Димена риба" />
            </div>
            <div>
              <label className="label">Цена/кг</label>
              <input type="number" step="0.01" value={newType.price_per_unit} onChange={e => setNewType({ ...newType, price_per_unit: e.target.value })} className="input" placeholder="0" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowNew(false)} className="btn-ghost text-sm"><X size={14} /></button>
            <button type="submit" className="btn-primary text-sm">Додади</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {types.map((t, idx) => {
          const inv = inventory.find(i => i.product_type_id === t.id);
          const stock = inv ? parseFloat(inv.quantity_kg) : 0;
          return (
            <div key={t.id} className={`card !py-3 animate-in-delay-${Math.min(idx, 5)}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                  {t.code}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-(--text-primary)">{t.name}</p>
                  <p className="text-[10px] text-(--text-muted)">
                    Залиха: <span className={stock > 0 ? 'text-green-500' : 'text-(--text-muted)'}>{stock.toFixed(1)} кг</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" step="0.01" min="0"
                    value={editPrices[t.id] ?? ''}
                    onChange={e => setEditPrices({ ...editPrices, [t.id]: e.target.value })}
                    className="input w-24 text-sm text-right"
                    placeholder="ден/кг"
                  />
                  <button onClick={() => handleSavePrice(t.id)} className="btn-ghost p-1.5 text-(--primary)"><Save size={14} /></button>
                  <button onClick={() => handleDelete(t.id)} className="btn-ghost p-1.5 text-(--danger)"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
