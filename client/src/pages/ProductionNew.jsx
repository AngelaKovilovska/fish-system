import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Plus, Factory, Pencil, Trash2, ChevronDown, ChevronUp, Save, X, Settings, Package } from 'lucide-react';

function formatProductName(code, name) {
  return `Риба (Clarias gariepinus) - ${code} - ${name}`;
}

export default function ProductionNew() {
  const [productTypes, setProductTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [poolData, setPoolData] = useState([]);
  const [poolMeasurements, setPoolMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ source_pool: '', fish_count: '', total_weight_kg: '', notes: '' });
  const [items, setItems] = useState([]);

  // Expanded batch in list
  const [expandedBatch, setExpandedBatch] = useState(null);

  // Settings panel (product types)
  const [showSettings, setShowSettings] = useState(false);
  const [newType, setNewType] = useState({ code: '', name: '', price_per_unit: '' });
  const [editPrices, setEditPrices] = useState({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [typesRes, batchesRes, poolRes, measRes] = await Promise.all([
        api.getProductTypes(),
        api.getProductionBatches({ limit: 50 }),
        api.getPoolFishInventory().catch(() => ({ inventory: [] })),
        api.getPoolMeasurements().catch(() => ({ measurements: [] })),
      ]);
      setProductTypes(typesRes.productTypes || []);
      setBatches(batchesRes.batches || []);
      setPoolData(poolRes.inventory || []);
      setPoolMeasurements(measRes.measurements || []);

      const prices = {};
      (typesRes.productTypes || []).forEach(t => { prices[t.id] = t.price_per_unit; });
      setEditPrices(prices);
    } catch { setError('Грешка при вчитување'); }
    finally { setLoading(false); }
  }

  function startNew() {
    setEditingId(null);
    setForm({ source_pool: '', fish_count: '', total_weight_kg: '', notes: '' });
    setItems(productTypes.map(pt => ({ product_type_id: pt.id, quantity_kg: '' })));
    setShowForm(true);
    setShowSettings(false);
    setError('');
  }

  function startEdit(batch) {
    setEditingId(batch.id);
    setForm({
      source_pool: batch.source_pool || '',
      fish_count: batch.fish_count || '',
      total_weight_kg: batch.total_weight_kg || '',
      notes: batch.notes || '',
    });
    const batchItems = batch.items || [];
    setItems(productTypes.map(pt => {
      const existing = batchItems.find(i => i.product_type_id === pt.id);
      return { product_type_id: pt.id, quantity_kg: existing ? existing.quantity_kg : '' };
    }));
    setShowForm(true);
    setShowSettings(false);
    setError('');
  }

  async function handleSave() {
    if (!form.source_pool) return setError('Изберете базен');
    if (!form.fish_count || parseInt(form.fish_count) <= 0) return setError('Внесете број на риби');
    if (!form.total_weight_kg || parseFloat(form.total_weight_kg) <= 0) return setError('Внесете вкупна тежина');

    const validItems = items.filter(i => parseFloat(i.quantity_kg) > 0);
    if (validItems.length === 0) return setError('Внесете количини за барем еден тип производ');

    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.updateProductionBatch(editingId, {
          ...form,
          items: validItems.map(i => ({
            product_type_id: i.product_type_id,
            quantity_kg: parseFloat(i.quantity_kg),
          })),
        });
        setSuccess('Серијата е ажурирана');
      } else {
        await api.createProductionBatch({
          ...form,
          complete: true,
          items: validItems.map(i => ({
            product_type_id: i.product_type_id,
            quantity_kg: parseFloat(i.quantity_kg),
          })),
        });
        setSuccess('Серијата е зачувана');
      }
      setShowForm(false);
      setEditingId(null);
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Избриши ја серијата? Залихата ќе се коригира.')) return;
    try {
      await api.deleteProductionBatch(id);
      await loadData();
    } catch (err) { setError(err.message); }
  }

  // Product type settings
  async function handleAddType(e) {
    e.preventDefault();
    if (!newType.code || !newType.name) return setError('Потребни се код и име');
    try {
      await api.createProductType(newType);
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

  async function handleDeleteType(id) {
    if (!confirm('Деактивирај го типот?')) return;
    try {
      await api.deleteProductType(id);
      await loadData();
    } catch (err) { setError(err.message); }
  }

  // Pool info
  function getPoolInfo(poolNum) {
    const p = poolData.find(x => x.pool_number === parseInt(poolNum));
    const m = poolMeasurements.find(x => x.pool_number === parseInt(poolNum));
    const fishCount = p ? p.current_count : (m ? m.fish_count : 0);
    const avgWeight = m ? parseFloat(m.projected_avg_weight || m.avg_weight_gr || 0) : 0;
    const totalMass = fishCount * avgWeight / 1000;
    return { fishCount, avgWeight, totalMass };
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5 animate-in">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
          <Factory size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="page-title !mb-0">Производство</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Серии и обработка</p>
        </div>
        <button onClick={() => setShowSettings(!showSettings)}
          className="btn-ghost p-2 text-[var(--text-secondary)]" title="Типови производи">
          <Settings size={18} />
        </button>
        {!showForm && (
          <button onClick={startNew} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={16} /> Нова серија
          </button>
        )}
      </div>

      {error && <div className="alert alert-error mb-4 animate-in">{error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in">{success}</div>}

      {/* ═══ Settings panel (product types & prices) ═══ */}
      {showSettings && !showForm && (
        <div className="card mb-5 animate-in">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
            Типови производи и цени
          </h3>

          <div className="space-y-2 mb-4">
            {productTypes.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                  {t.code}
                </div>
                <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate">{t.name}</span>
                <input type="number" step="0.01" min="0"
                  value={editPrices[t.id] ?? ''}
                  onChange={e => setEditPrices({ ...editPrices, [t.id]: e.target.value })}
                  className="input w-24 text-sm text-right" placeholder="ден/кг" />
                <button onClick={() => handleSavePrice(t.id)} className="btn-ghost p-1.5 text-[var(--primary)]"><Save size={14} /></button>
                <button onClick={() => handleDeleteType(t.id)} className="btn-ghost p-1.5 text-[var(--danger)]"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddType} className="flex gap-2 items-end pt-3 border-t border-[var(--border)]">
            <div className="flex-shrink-0">
              <label className="label">Код</label>
              <input type="text" value={newType.code} onChange={e => setNewType({ ...newType, code: e.target.value })}
                className="input w-16 text-sm" placeholder="ДР" />
            </div>
            <div className="flex-1">
              <label className="label">Име</label>
              <input type="text" value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })}
                className="input text-sm" placeholder="димена риба" />
            </div>
            <div className="flex-shrink-0">
              <label className="label">Цена</label>
              <input type="number" step="0.01" value={newType.price_per_unit}
                onChange={e => setNewType({ ...newType, price_per_unit: e.target.value })}
                className="input w-20 text-sm" placeholder="0" />
            </div>
            <button type="submit" className="btn-primary text-sm px-3 py-2">
              <Plus size={14} />
            </button>
          </form>
        </div>
      )}

      {/* ═══ NEW / EDIT BATCH FORM ═══ */}
      {showForm && (
        <div className="space-y-4 mb-6 animate-in">

          {/* Step 1: Pool & extraction */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: 'var(--primary)' }}>1</span>
              <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                Извлекување од базен
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <label className="label">Базен</label>
                <select value={form.source_pool} onChange={e => setForm({ ...form, source_pool: e.target.value })} className="input">
                  <option value="">— Избери базен —</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Базен {n}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Извадени риби (број)</label>
                <input type="number" min="0" value={form.fish_count}
                  onChange={e => setForm({ ...form, fish_count: e.target.value })}
                  className="input" placeholder="0" />
              </div>
              <div>
                <label className="label">Вкупна тежина (кг)</label>
                <input type="number" step="0.01" min="0" value={form.total_weight_kg}
                  onChange={e => setForm({ ...form, total_weight_kg: e.target.value })}
                  className="input" placeholder="0.00" />
              </div>
            </div>

            {/* Pool info bar */}
            {form.source_pool && (() => {
              const info = getPoolInfo(form.source_pool);
              return (
                <div className="rounded-xl p-3 flex gap-4"
                  style={{ background: 'var(--primary-muted)', border: '1px solid var(--primary)20' }}>
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Риби</p>
                    <p className="text-sm font-bold text-[var(--primary)]">{info.fishCount}</p>
                  </div>
                  <div className="w-px bg-[var(--border)]" />
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Вкупна маса</p>
                    <p className="text-sm font-bold text-[var(--primary)]">{info.totalMass.toFixed(1)} кг</p>
                  </div>
                  <div className="w-px bg-[var(--border)]" />
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Просечна тежина</p>
                    <p className="text-sm font-bold text-[var(--primary)]">{info.avgWeight.toFixed(0)} гр</p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Step 2: Processing - product quantities */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: 'var(--primary)' }}>2</span>
              <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                Обработка — количини по тип
              </h3>
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => {
                const pt = productTypes.find(t => t.id === item.product_type_id);
                if (!pt) return null;
                return (
                  <div key={pt.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                      {pt.code}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">{pt.name}</p>
                    </div>
                    <div className="w-28 flex-shrink-0">
                      <input type="number" step="0.01" min="0"
                        value={item.quantity_kg}
                        onChange={e => {
                          const updated = [...items];
                          updated[idx].quantity_kg = e.target.value;
                          setItems(updated);
                        }}
                        className="input text-sm text-right" placeholder="кг" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total processed */}
            {(() => {
              const totalProcessed = items.reduce((sum, i) => sum + (parseFloat(i.quantity_kg) || 0), 0);
              const rawWeight = parseFloat(form.total_weight_kg) || 0;
              const diff = rawWeight - totalProcessed;
              return totalProcessed > 0 ? (
                <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Вкупно обработено:</span>
                  <span className="font-bold text-[var(--text-primary)]">{totalProcessed.toFixed(2)} кг</span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Notes */}
          <div className="card">
            <label className="label">Забелешки (опционално)</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="input" rows="2" placeholder="Дополнителни информации..." />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button onClick={() => { setShowForm(false); setEditingId(null); setError(''); }}
              className="btn-ghost flex items-center gap-1.5">
              <X size={16} /> Откажи
            </button>
            <button onClick={handleSave} disabled={saving}
              className="btn-primary flex items-center gap-1.5">
              <Save size={16} />
              {saving ? 'Се зачувува...' : (editingId ? 'Ажурирај серија' : 'Зачувај серија')}
            </button>
          </div>
        </div>
      )}

      {/* ═══ BATCHES LIST ═══ */}
      {!showForm && (
        <>
          {batches.length === 0 ? (
            <div className="card text-center py-12 animate-in">
              <Factory size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-secondary)]">Нема зачувани серии</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Кликнете „Нова серија" за да започнете</p>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch, idx) => {
                const isExpanded = expandedBatch === batch.id;
                const batchItems = batch.items || [];
                const totalKg = batchItems.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);

                return (
                  <div key={batch.id} className={`card animate-in-delay-${Math.min(idx, 5)}`}>
                    <div className="flex items-start gap-3 cursor-pointer"
                      onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}>
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                        <Package size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                          {batch.lot_number}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {batch.source_pool ? `Базен ${batch.source_pool}` : ''}
                          {batch.fish_count ? ` • ${batch.fish_count} риби` : ''}
                          {batch.total_weight_kg ? ` • ${batch.total_weight_kg} кг` : ''}
                        </p>
                        {batchItems.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {batchItems.map(item => (
                              <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
                                {item.code}: {parseFloat(item.quantity_kg).toFixed(1)} кг
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-sm font-bold text-[var(--primary)]">{totalKg.toFixed(1)} кг</span>
                        {isExpanded ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] flex gap-2">
                        <button onClick={() => startEdit(batch)}
                          className="btn-ghost text-xs flex items-center gap-1">
                          <Pencil size={13} /> Измени
                        </button>
                        <button onClick={() => handleDelete(batch.id)}
                          className="btn-ghost text-xs text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] ml-auto flex items-center gap-1">
                          <Trash2 size={13} /> Избриши
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
