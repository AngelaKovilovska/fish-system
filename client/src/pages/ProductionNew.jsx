import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronLeft, Plus, Trash2, ArrowRight, Factory, Package } from 'lucide-react';

const STATUS_LABELS = {
  'чиста_вода': 'Чиста вода (24ч)',
  'колење': 'Колење',
  'обработка': 'Обработка',
  'пакување': 'Пакување',
  'завршено': 'Завршено',
};

const STATUS_ORDER = ['чиста_вода', 'колење', 'обработка', 'пакување', 'завршено'];

export default function ProductionNew() {
  const navigate = useNavigate();
  const [productTypes, setProductTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New batch form
  const [form, setForm] = useState({ source_pool: '', fish_count: '', total_weight_kg: '', notes: '' });
  const [showForm, setShowForm] = useState(false);

  // Items editor for a batch
  const [editingBatch, setEditingBatch] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [typesRes, batchesRes] = await Promise.all([
        api.getProductTypes(),
        api.getProductionBatches({ limit: 20 }),
      ]);
      setProductTypes(typesRes.productTypes || []);
      setBatches(batchesRes.batches || []);
    } catch {
      setError('Грешка при вчитување');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBatch(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createProductionBatch(form);
      setSuccess('Серијата е креирана');
      setForm({ source_pool: '', fish_count: '', total_weight_kg: '', notes: '' });
      setShowForm(false);
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvanceStatus(batchId, currentStatus) {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
    if (currentIdx >= STATUS_ORDER.length - 1) return;
    const nextStatus = STATUS_ORDER[currentIdx + 1];

    if (nextStatus === 'завршено') {
      if (!confirm('Дали сте сигурни? Ова ќе ги додаде производите на залиха.')) return;
    }

    try {
      await api.updateProductionStatus(batchId, nextStatus);
      setSuccess(`Статус → ${STATUS_LABELS[nextStatus]}`);
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteBatch(id) {
    if (!confirm('Избриши ја серијата?')) return;
    try {
      await api.deleteProductionBatch(id);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditItems(batch) {
    setEditingBatch(batch);
    const existing = (batch.items || []).map(i => ({
      product_type_id: i.product_type_id,
      quantity_kg: i.quantity_kg,
    }));
    // If no items yet, start with empty rows for each product type
    if (existing.length === 0) {
      setItems(productTypes.map(pt => ({ product_type_id: pt.id, quantity_kg: '' })));
    } else {
      setItems(existing);
    }
  }

  async function handleSaveItems() {
    setSaving(true);
    try {
      await api.updateProductionItems(editingBatch.id, items.filter(i => parseFloat(i.quantity_kg) > 0));
      setSuccess('Ставките се зачувани');
      setEditingBatch(null);
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'чиста_вода': return '#3b82f6';
      case 'колење': return '#ef4444';
      case 'обработка': return '#f59e0b';
      case 'пакување': return '#8b5cf6';
      case 'завршено': return '#22c55e';
      default: return '#64748b';
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5 animate-in">
        <button onClick={() => navigate(-1)} className="btn-ghost p-1.5 -ml-1.5"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="page-title !mb-0">Производство</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">LOT серии и обработка</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={16} /> Нова серија
        </button>
      </div>

      {error && <div className="alert alert-error mb-4 animate-in">{error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in">{success}</div>}

      {/* New batch form */}
      {showForm && (
        <form onSubmit={handleCreateBatch} className="card mb-5 animate-in">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
            Нова производствена серија
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Базен (извор)</label>
              <select value={form.source_pool} onChange={e => setForm({ ...form, source_pool: e.target.value })} className="input">
                <option value="">— Избери —</option>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>Базен {n}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Број на риби</label>
              <input type="number" value={form.fish_count} onChange={e => setForm({ ...form, fish_count: e.target.value })}
                className="input" placeholder="0" min="0" />
            </div>
            <div>
              <label className="label">Вкупна тежина (кг)</label>
              <input type="number" step="0.01" value={form.total_weight_kg}
                onChange={e => setForm({ ...form, total_weight_kg: e.target.value })}
                className="input" placeholder="0.00" min="0" />
            </div>
            <div>
              <label className="label">Забелешки</label>
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="input" placeholder="Опционално" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-sm">Откажи</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Се креира...' : 'Креирај серија'}
            </button>
          </div>
        </form>
      )}

      {/* Items editor modal */}
      {editingBatch && (
        <div className="card mb-5 animate-in border-2 border-[var(--primary)]" style={{ borderColor: 'var(--primary)' }}>
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: 'Sora, sans-serif' }}>
            Ставки за {editingBatch.lot_number}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-4">Внесете количина за секој произведен тип</p>

          <div className="space-y-2 mb-4">
            {items.map((item, idx) => {
              const pt = productTypes.find(t => t.id === item.product_type_id);
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-[var(--text-primary)] w-32 truncate">{pt?.name || '—'}</span>
                  <span className="text-[10px] text-[var(--text-muted)] w-10">{pt?.code}</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={item.quantity_kg}
                    onChange={e => {
                      const updated = [...items];
                      updated[idx].quantity_kg = e.target.value;
                      setItems(updated);
                    }}
                    className="input flex-1" placeholder="кг"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingBatch(null)} className="btn-ghost text-sm">Откажи</button>
            <button onClick={handleSaveItems} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Зачувување...' : 'Зачувај ставки'}
            </button>
          </div>
        </div>
      )}

      {/* Batches list */}
      {batches.length === 0 ? (
        <div className="card text-center py-12 animate-in">
          <Factory size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">Нема производствени серии</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch, idx) => {
            const statusColor = getStatusColor(batch.status);
            const isFinished = batch.status === 'завршено';
            const currentIdx = STATUS_ORDER.indexOf(batch.status);
            const nextStatus = currentIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIdx + 1] : null;

            return (
              <div key={batch.id} className={`card animate-in-delay-${Math.min(idx, 5)}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {batch.lot_number}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {batch.source_pool ? `Базен ${batch.source_pool}` : ''}
                      {batch.fish_count ? ` • ${batch.fish_count} риби` : ''}
                      {batch.total_weight_kg ? ` • ${batch.total_weight_kg} кг` : ''}
                    </p>
                  </div>
                  <span className="pill text-[10px]" style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                    {STATUS_LABELS[batch.status]}
                  </span>
                </div>

                {/* Items summary */}
                {batch.items && batch.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {batch.items.map(item => (
                      <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
                        {item.code}: {item.quantity_kg} кг
                      </span>
                    ))}
                  </div>
                )}

                {/* Status progress bar */}
                <div className="flex gap-1 mb-3">
                  {STATUS_ORDER.map((s, i) => (
                    <div key={s} className="h-1.5 flex-1 rounded-full transition-all"
                      style={{ background: i <= currentIdx ? statusColor : 'var(--border)' }} />
                  ))}
                </div>

                {/* Actions */}
                {!isFinished && (
                  <div className="flex gap-2">
                    <button onClick={() => startEditItems(batch)}
                      className="btn-ghost text-xs flex items-center gap-1">
                      <Package size={14} /> Ставки
                    </button>
                    {nextStatus && (
                      <button onClick={() => handleAdvanceStatus(batch.id, batch.status)}
                        className="btn-primary text-xs flex items-center gap-1 ml-auto">
                        <ArrowRight size={14} /> {STATUS_LABELS[nextStatus]}
                      </button>
                    )}
                    <button onClick={() => handleDeleteBatch(batch.id)}
                      className="btn-ghost text-xs text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)]">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
