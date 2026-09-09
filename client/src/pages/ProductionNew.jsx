import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Factory, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Calendar, Plus, Save, X, Settings, Package, Pencil, Trash2,
  Check, AlertCircle,
} from 'lucide-react';

// ─── Helpers ───
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDateMK(dateStr) {
  if (!dateStr) return '';
  const MK_MONTHS = ['јануари','февруари','март','април','мај','јуни','јули','август','септември','октомври','ноември','декември'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════════
// ProductionNew — guided production batch entry
// ═══════════════════════════════════════════════════════════
export default function ProductionNew() {
  const navigate = useNavigate();

  // Data
  const [productTypes, setProductTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [poolData, setPoolData] = useState([]);
  const [poolMeasurements, setPoolMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // ─── Form state (step-by-step) ───
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1); // 1=pool, 2=extraction, 3=products, 4=review
  const [form, setForm] = useState({
    production_date: todayStr(),
    source_pool: '',
    fish_count: '',
    total_weight_kg: '',
    notes: '',
  });
  const [items, setItems] = useState([]);

  // ─── Settings state (product types) ───
  const [newType, setNewType] = useState({ code: '', name: '', price_per_unit: '' });
  const [editPrices, setEditPrices] = useState({});

  // Refs for auto-scroll
  const formTopRef = useRef(null);

  // ═══ Load data ═══
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
    } catch { setError('Грешка при вчитување на податоци'); }
    finally { setLoading(false); }
  }

  // ═══ Pool info helper ═══
  function getPoolInfo(poolNum) {
    const p = poolData.find(x => x.pool_number === parseInt(poolNum));
    const m = poolMeasurements.find(x => x.pool_number === parseInt(poolNum));
    const fishCount = p ? p.current_count : (m ? m.fish_count : 0);
    const avgWeight = m ? parseFloat(m.projected_avg_weight || m.avg_weight_gr || 0) : 0;
    const totalMass = fishCount * avgWeight / 1000;
    return { fishCount, avgWeight, totalMass };
  }

  // ═══ Form actions ═══
  function startNew() {
    setEditingId(null);
    setForm({ production_date: todayStr(), source_pool: '', fish_count: '', total_weight_kg: '', notes: '' });
    setItems(productTypes.map(pt => ({ product_type_id: pt.id, quantity_kg: '' })));
    setStep(1);
    setShowForm(true);
    setShowSettings(false);
    setError('');
    setSuccess('');
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  function startEdit(batch) {
    setEditingId(batch.id);
    setForm({
      production_date: batch.production_date ? batch.production_date.slice(0, 10) : todayStr(),
      source_pool: String(batch.source_pool || ''),
      fish_count: String(batch.fish_count || ''),
      total_weight_kg: String(batch.total_weight_kg || ''),
      notes: batch.notes || '',
    });
    const batchItems = batch.items || [];
    setItems(productTypes.map(pt => {
      const existing = batchItems.find(i => i.product_type_id === pt.id);
      return { product_type_id: pt.id, quantity_kg: existing ? String(existing.quantity_kg) : '' };
    }));
    setStep(1);
    setShowForm(true);
    setShowSettings(false);
    setError('');
    setSuccess('');
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setStep(1);
    setError('');
  }

  // Step navigation
  function goNext() {
    if (step === 1) {
      if (!form.source_pool) { setError('Изберете базен'); return; }
      setError('');
      setStep(2);
    } else if (step === 2) {
      if (!form.fish_count || parseInt(form.fish_count) <= 0) { setError('Внесете број на извадени риби'); return; }
      if (!form.total_weight_kg || parseFloat(form.total_weight_kg) <= 0) { setError('Внесете вкупна тежина'); return; }
      setError('');
      setStep(3);
    } else if (step === 3) {
      const validItems = items.filter(i => parseFloat(i.quantity_kg) > 0);
      if (validItems.length === 0) { setError('Внесете количина за барем еден производ'); return; }
      setError('');
      setStep(4);
    }
  }

  function goBack() {
    setError('');
    setStep(Math.max(1, step - 1));
  }

  // ═══ Save ═══
  async function handleSave() {
    const validItems = items.filter(i => parseFloat(i.quantity_kg) > 0);
    if (validItems.length === 0) { setError('Нема производи за зачувување'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        source_pool: form.source_pool,
        fish_count: parseInt(form.fish_count),
        total_weight_kg: parseFloat(form.total_weight_kg),
        notes: form.notes || null,
        production_date: form.production_date,
        items: validItems.map(i => ({
          product_type_id: i.product_type_id,
          quantity_kg: parseFloat(i.quantity_kg),
        })),
      };

      if (editingId) {
        await api.updateProductionBatch(editingId, payload);
        setSuccess('Серијата е успешно ажурирана');
      } else {
        payload.complete = true;
        const result = await api.createProductionBatch(payload);
        const lotNum = result?.lot_number || '';
        setSuccess(`Серијата е зачувана${lotNum ? ` — ${lotNum}` : ''}`);
      }

      setShowForm(false);
      setEditingId(null);
      setStep(1);
      await loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message || 'Грешка при зачувување');
    } finally {
      setSaving(false);
    }
  }

  // ═══ Delete ═══
  async function handleDelete(id) {
    if (!confirm('Избриши ја серијата? Залихата ќе се коригира.')) return;
    try {
      await api.deleteProductionBatch(id);
      setSuccess('Серијата е избришана');
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
  }

  // ═══ Product type settings ═══
  async function handleAddType(e) {
    e.preventDefault();
    if (!newType.code || !newType.name) { setError('Потребни се код и име'); return; }
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
    try { await api.deleteProductType(id); await loadData(); }
    catch (err) { setError(err.message); }
  }

  // ═══ Computed ═══
  const totalProcessed = items.reduce((sum, i) => sum + (parseFloat(i.quantity_kg) || 0), 0);
  const rawWeight = parseFloat(form.total_weight_kg) || 0;
  const yieldPercent = rawWeight > 0 ? ((totalProcessed / rawWeight) * 100).toFixed(1) : 0;
  const poolInfo = form.source_pool ? getPoolInfo(form.source_pool) : null;

  // ═══ Step indicator ═══
  const STEPS = [
    { num: 1, label: 'Базен' },
    { num: 2, label: 'Извлекување' },
    { num: 3, label: 'Обработка' },
    { num: 4, label: 'Преглед' },
  ];

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* ─── Header ─── */}
      <div className="mb-5 animate-in" ref={formTopRef}>
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => navigate(-1)} className="btn-ghost p-1.5 -ml-1.5" aria-label="Назад">
            <ChevronLeft size={20} />
          </button>
          <h1 className="page-title !mb-0">Производство</h1>
          <div className="flex-1" />
          <button onClick={() => { setShowSettings(!showSettings); setShowForm(false); }}
            className="btn-ghost p-2 text-[var(--text-secondary)]" title="Типови производи">
            <Settings size={18} />
          </button>
          {!showForm && !showSettings && (
            <button onClick={startNew} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus size={16} /> Нова серија
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1 ml-8">
          <Factory size={13} className="text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-secondary)]">Серии и обработка на риба</p>
        </div>
      </div>

      {/* ─── Alerts ─── */}
      {error && (
        <div className="alert alert-error mb-4 animate-in flex items-center gap-2">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success mb-4 animate-in flex items-center gap-2">
          <Check size={16} className="flex-shrink-0" /> {success}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SETTINGS PANEL                         */}
      {/* ═══════════════════════════════════════ */}
      {showSettings && !showForm && (
        <div className="card mb-5 animate-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Типови производи и цени
            </h3>
            <button onClick={() => setShowSettings(false)} className="btn-ghost p-1.5 text-[var(--text-muted)]">
              <X size={16} />
            </button>
          </div>

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

      {/* ═══════════════════════════════════════ */}
      {/* FORM — GUIDED STEPS                    */}
      {/* ═══════════════════════════════════════ */}
      {showForm && (
        <div className="space-y-4 mb-6 animate-in">

          {/* Step indicator bar */}
          <div className="flex items-center gap-1 mb-2">
            {STEPS.map((s, idx) => (
              <div key={s.num} className="flex items-center flex-1">
                <button
                  onClick={() => { if (s.num < step) setStep(s.num); }}
                  disabled={s.num > step}
                  className="flex items-center gap-1.5 w-full"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all ${
                    s.num < step
                      ? 'bg-[var(--primary)] text-white'
                      : s.num === step
                        ? 'bg-[var(--primary)] text-white ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]'
                        : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)]'
                  }`}>
                    {s.num < step ? <Check size={14} /> : s.num}
                  </div>
                  <span className={`text-[11px] font-medium hidden min-[400px]:inline ${
                    s.num <= step ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                  }`}>{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`h-px flex-1 mx-1 ${s.num < step ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Date field — always visible */}
          <div className="card !py-3">
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-[var(--primary)] flex-shrink-0" />
              <label className="text-xs font-medium text-[var(--text-secondary)] flex-shrink-0">Датум:</label>
              <input
                type="date"
                value={form.production_date}
                onChange={e => setForm({ ...form, production_date: e.target.value })}
                className="input text-sm flex-1"
                style={{ maxWidth: 180 }}
              />
              <span className="text-xs text-[var(--text-muted)] hidden min-[400px]:inline">
                {formatDateMK(form.production_date)}
              </span>
            </div>
          </div>

          {/* ══════ STEP 1: Select pool ══════ */}
          {step === 1 && (
            <div className="animate-in">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>
                Од кој базен се вадат рибите?
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => {
                  const info = getPoolInfo(n);
                  const selected = form.source_pool === String(n);
                  return (
                    <button
                      key={n}
                      onClick={() => setForm({ ...form, source_pool: String(n) })}
                      className={`card !py-4 text-left transition-all ${
                        selected
                          ? 'ring-2 ring-[var(--primary)] bg-[var(--primary-muted)]'
                          : 'card-hover'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          selected ? 'bg-[var(--primary)] text-white' : ''
                        }`}
                          style={selected ? {} : { background: 'rgba(59,130,246,0.08)', color: 'var(--primary)' }}>
                          {n}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                            Базен {n}
                          </p>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                            {info.fishCount > 0
                              ? `${info.fishCount} риби · ${info.totalMass.toFixed(0)} кг`
                              : 'Нема податоци'
                            }
                          </p>
                        </div>
                      </div>
                      {selected && (
                        <div className="mt-2 flex justify-end">
                          <Check size={18} className="text-[var(--primary)]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Next */}
              <div className="flex justify-between mt-5">
                <button onClick={cancelForm} className="btn-ghost text-sm flex items-center gap-1.5">
                  <X size={16} /> Откажи
                </button>
                <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">
                  Следно <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 2: Extraction details ══════ */}
          {step === 2 && (
            <div className="animate-in">
              {/* Pool info bar */}
              {poolInfo && (
                <div className="rounded-2xl p-4 mb-4 flex gap-4"
                  style={{ background: 'var(--primary-muted)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Базен</p>
                    <p className="text-lg font-bold text-[var(--primary)]">{form.source_pool}</p>
                  </div>
                  <div className="w-px bg-[var(--border)]" />
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Риби</p>
                    <p className="text-lg font-bold text-[var(--primary)]">{poolInfo.fishCount}</p>
                  </div>
                  <div className="w-px bg-[var(--border)]" />
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Маса</p>
                    <p className="text-lg font-bold text-[var(--primary)]">{poolInfo.totalMass.toFixed(0)} кг</p>
                  </div>
                </div>
              )}

              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
                Колку риби се извадени?
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="label text-sm">Број на извадени риби</label>
                  <input
                    type="number"
                    min="0"
                    value={form.fish_count}
                    onChange={e => setForm({ ...form, fish_count: e.target.value })}
                    className="input text-lg py-3"
                    placeholder="Пр. 150"
                    autoFocus
                  />
                  {poolInfo && poolInfo.fishCount > 0 && form.fish_count && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Остануваат {poolInfo.fishCount - parseInt(form.fish_count || 0)} во базенот
                    </p>
                  )}
                </div>

                <div>
                  <label className="label text-sm">Вкупна жива тежина (кг)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.total_weight_kg}
                    onChange={e => setForm({ ...form, total_weight_kg: e.target.value })}
                    className="input text-lg py-3"
                    placeholder="Пр. 180.50"
                  />
                  {form.fish_count > 0 && form.total_weight_kg > 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Просек: {(parseFloat(form.total_weight_kg) / parseInt(form.fish_count) * 1000).toFixed(0)} гр/риба
                    </p>
                  )}
                </div>
              </div>

              {/* Nav */}
              <div className="flex justify-between mt-5">
                <button onClick={goBack} className="btn-ghost text-sm flex items-center gap-1.5">
                  <ChevronLeft size={16} /> Назад
                </button>
                <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">
                  Следно <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 3: Product quantities ══════ */}
          {step === 3 && (
            <div className="animate-in">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: 'Sora, sans-serif' }}>
                Производи од обработката
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Внесете килограми за секој тип производ
              </p>

              <div className="space-y-3">
                {items.map((item, idx) => {
                  const pt = productTypes.find(t => t.id === item.product_type_id);
                  if (!pt) return null;
                  return (
                    <div key={pt.id} className="card !py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                        {pt.code}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{pt.name}</p>
                      </div>
                      <div className="w-28 flex-shrink-0">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.quantity_kg}
                          onChange={e => {
                            const updated = [...items];
                            updated[idx] = { ...updated[idx], quantity_kg: e.target.value };
                            setItems(updated);
                          }}
                          className="input text-sm text-right py-2.5"
                          placeholder="0 кг"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totals bar */}
              {totalProcessed > 0 && (
                <div className="rounded-2xl p-3 mt-4 flex items-center justify-between"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Вкупно обработено</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{totalProcessed.toFixed(2)} кг</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Рандман</p>
                    <p className={`text-sm font-bold ${totalProcessed > rawWeight ? 'text-[var(--danger)]' : 'text-[var(--primary)]'}`}>
                      {yieldPercent}%
                    </p>
                  </div>
                </div>
              )}

              {/* Nav */}
              <div className="flex justify-between mt-5">
                <button onClick={goBack} className="btn-ghost text-sm flex items-center gap-1.5">
                  <ChevronLeft size={16} /> Назад
                </button>
                <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">
                  Следно <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 4: Review & Save ══════ */}
          {step === 4 && (
            <div className="animate-in">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
                Преглед пред зачувување
              </h3>

              {/* Summary card */}
              <div className="card !py-4 space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Датум</span>
                  <span className="font-medium text-[var(--text-primary)]">{formatDateMK(form.production_date)}</span>
                </div>
                <div className="h-px bg-[var(--border)]" />
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Базен</span>
                  <span className="font-medium text-[var(--text-primary)]">Базен {form.source_pool}</span>
                </div>
                <div className="h-px bg-[var(--border)]" />
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Извадени риби</span>
                  <span className="font-medium text-[var(--text-primary)]">{form.fish_count} бр.</span>
                </div>
                <div className="h-px bg-[var(--border)]" />
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Жива тежина</span>
                  <span className="font-medium text-[var(--text-primary)]">{parseFloat(form.total_weight_kg).toFixed(2)} кг</span>
                </div>

                {/* Products */}
                <div className="h-px bg-[var(--border)]" />
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-semibold">Производи</p>
                {items.filter(i => parseFloat(i.quantity_kg) > 0).map(item => {
                  const pt = productTypes.find(t => t.id === item.product_type_id);
                  return (
                    <div key={item.product_type_id} className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">{pt?.code} — {pt?.name}</span>
                      <span className="font-medium text-[var(--text-primary)]">{parseFloat(item.quantity_kg).toFixed(2)} кг</span>
                    </div>
                  );
                })}

                <div className="h-px bg-[var(--border)]" />
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-[var(--text-primary)]">Вкупно обработено</span>
                  <span className="font-bold text-[var(--primary)]">{totalProcessed.toFixed(2)} кг</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Рандман</span>
                  <span className={`font-bold ${totalProcessed > rawWeight ? 'text-[var(--danger)]' : 'text-[var(--primary)]'}`}>
                    {yieldPercent}%
                  </span>
                </div>

                {form.notes && (
                  <>
                    <div className="h-px bg-[var(--border)]" />
                    <div className="text-sm">
                      <span className="text-[var(--text-secondary)]">Забелешки: </span>
                      <span className="text-[var(--text-primary)]">{form.notes}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Notes (editable here too) */}
              <div className="card !py-3 mb-4">
                <label className="label text-xs mb-1">Забелешки (опционално)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input text-sm"
                  rows="2"
                  placeholder="Дополнителни информации..."
                />
              </div>

              {/* Nav */}
              <div className="flex justify-between">
                <button onClick={goBack} className="btn-ghost text-sm flex items-center gap-1.5">
                  <ChevronLeft size={16} /> Назад
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-sm flex items-center gap-1.5 px-5"
                >
                  {saving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Се зачувува...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {editingId ? 'Ажурирај серија' : 'Зачувај серија'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* BATCHES LIST                           */}
      {/* ═══════════════════════════════════════ */}
      {!showForm && !showSettings && (
        <>
          {batches.length === 0 ? (
            <div className="card text-center py-14 animate-in">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--primary-muted)' }}>
                <Factory size={28} className="text-[var(--primary)]" />
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">Нема зачувани серии</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">Кликнете „Нова серија" за да започнете</p>
              <button onClick={startNew} className="btn-primary text-sm mx-auto flex items-center gap-1.5">
                <Plus size={16} /> Нова серија
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Separator */}
              <div className="flex items-center gap-3 animate-in">
                <div className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider"
                  style={{ fontFamily: 'Sora, sans-serif' }}>Зачувани серии</span>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              {batches.map((batch, idx) => {
                const isExpanded = expandedBatch === batch.id;
                const batchItems = batch.items || [];
                const totalKg = batchItems.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);
                const batchDate = batch.production_date
                  ? batch.production_date.slice(0, 10)
                  : (batch.created_at ? batch.created_at.slice(0, 10) : '');

                return (
                  <div key={batch.id} className={`card animate-in-delay-${Math.min(idx, 5)}`}>
                    <div className="flex items-start gap-3 cursor-pointer"
                      onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                        <Package size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                          {batch.lot_number}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {batchDate && formatDateMK(batchDate)}
                          {batch.source_pool ? ` · Базен ${batch.source_pool}` : ''}
                          {batch.fish_count ? ` · ${batch.fish_count} риби` : ''}
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
                        {isExpanded
                          ? <ChevronUp size={16} className="text-[var(--text-muted)]" />
                          : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)]">
                        {/* Detailed info */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="text-center">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase">Жива тежина</p>
                            <p className="text-sm font-bold text-[var(--text-primary)]">{parseFloat(batch.total_weight_kg || 0).toFixed(1)} кг</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase">Обработено</p>
                            <p className="text-sm font-bold text-[var(--primary)]">{totalKg.toFixed(1)} кг</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase">Рандман</p>
                            <p className="text-sm font-bold text-[var(--text-primary)]">
                              {parseFloat(batch.total_weight_kg) > 0
                                ? ((totalKg / parseFloat(batch.total_weight_kg)) * 100).toFixed(1)
                                : 0}%
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => startEdit(batch)}
                            className="btn-ghost text-xs flex items-center gap-1">
                            <Pencil size={13} /> Измени
                          </button>
                          <button onClick={() => handleDelete(batch.id)}
                            className="btn-ghost text-xs text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] ml-auto flex items-center gap-1">
                            <Trash2 size={13} /> Избриши
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
    </div>
  );
}
