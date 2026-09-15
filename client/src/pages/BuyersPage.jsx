import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useBack } from '../lib/useBack';
import { ChevronLeft, Plus, Pencil, Trash2, Users, Save, X } from 'lucide-react';

export default function BuyersPage() {
  const goBack = useBack('/production/sales');
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', edb: '', contact_person: '', phone: '', email: '' });
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { loadBuyers(); }, []);

  async function loadBuyers() {
    try {
      const res = await api.getBuyers();
      setBuyers(res.buyers || []);
    } catch { setError('Грешка'); }
    finally { setLoading(false); }
  }

  function startEdit(buyer) {
    setEditingId(buyer.id);
    setForm({ name: buyer.name, address: buyer.address || '', edb: buyer.edb || '', contact_person: buyer.contact_person || '', phone: buyer.phone || '', email: buyer.email || '' });
    setShowNew(false);
  }

  function startNew() {
    setShowNew(true);
    setEditingId(null);
    setForm({ name: '', address: '', edb: '', contact_person: '', phone: '', email: '' });
  }

  async function handleSave() {
    if (!form.name) return setError('Потребно е име');
    setError('');
    try {
      if (editingId) {
        await api.updateBuyer(editingId, form);
      } else {
        await api.createBuyer(form);
      }
      setEditingId(null);
      setShowNew(false);
      await loadBuyers();
    } catch (err) { setError(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Деактивирај го купувачот?')) return;
    try {
      await api.deleteBuyer(id);
      await loadBuyers();
    } catch (err) { setError(err.message); }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto"><div className="skeleton h-10 w-48 mb-4" /><div className="skeleton h-24 w-full" /></div>;
  }

  const isEditing = editingId || showNew;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5 animate-in">
        <button onClick={goBack} className="btn-ghost p-1.5 -ml-1.5"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="page-title !mb-0">Купувачи</h1>
          <p className="text-xs text-(--text-secondary) mt-0.5">{buyers.length} зачувани</p>
        </div>
        <button onClick={startNew} className="btn-primary text-sm flex items-center gap-1.5"><Plus size={16} /> Нов</button>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {/* Edit / New form */}
      {isEditing && (
        <div className="card mb-4 animate-in border-2" style={{ borderColor: 'var(--primary)' }}>
          <h3 className="text-sm font-bold text-(--text-primary) mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>
            {editingId ? 'Измени купувач' : 'Нов купувач'}
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="label">Име *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">ЕДБ</label>
              <input type="text" value={form.edb} onChange={e => setForm({ ...form, edb: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Контакт лице</label>
              <input type="text" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Адреса</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Телефон</label>
              <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Емаил</label>
              <input type="text" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditingId(null); setShowNew(false); }} className="btn-ghost text-sm flex items-center gap-1"><X size={14} /> Откажи</button>
            <button onClick={handleSave} className="btn-primary text-sm flex items-center gap-1"><Save size={14} /> Зачувај</button>
          </div>
        </div>
      )}

      {/* Buyers list */}
      {buyers.length === 0 ? (
        <div className="card text-center py-12 animate-in">
          <Users size={40} className="mx-auto mb-3 text-(--text-muted)" />
          <p className="text-sm text-(--text-secondary)">Нема купувачи</p>
        </div>
      ) : (
        <div className="space-y-2">
          {buyers.map((b, idx) => (
            <div key={b.id} className={`card !py-3 flex items-center gap-3 animate-in-delay-${Math.min(idx, 5)}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
                {b.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-(--text-primary) truncate">{b.name}</p>
                <p className="text-[10px] text-(--text-muted) truncate">
                  {[b.edb && `ЕДБ: ${b.edb}`, b.phone, b.address].filter(Boolean).join(' • ') || 'Без детали'}
                </p>
              </div>
              <button onClick={() => startEdit(b)} className="btn-ghost p-1.5"><Pencil size={14} /></button>
              <button onClick={() => handleDelete(b.id)} className="btn-ghost p-1.5 text-(--danger)"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
