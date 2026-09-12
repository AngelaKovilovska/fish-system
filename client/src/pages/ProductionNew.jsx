import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Factory, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Calendar, Plus, Save, X, Settings, Package, Pencil, Trash2,
  Check, AlertCircle, Search, Filter, Fish, ClipboardList,
} from 'lucide-react';

/* ─── helpers ─── */
const todayStr = () => new Date().toISOString().split('T')[0];

const MK_MONTHS = ['јануари','февруари','март','април','мај','јуни','јули','август','септември','октомври','ноември','декември'];
const MK_MONTHS_SHORT = ['јан','фев','мар','апр','мај','јун','јул','авг','сеп','окт','ное','дек'];

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateShort(s) {
  if (!s) return '';
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  return `${d.getDate()} ${MK_MONTHS_SHORT[d.getMonth()]}`;
}

function dateGroup(dateStr) {
  if (!dateStr) return 'Останато';
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr.slice(0,10) + 'T00:00:00');
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return 'Денес';
  if (diff === 1) return 'Вчера';
  if (diff <= 7) return 'Оваа недела';
  if (diff <= 30) return 'Овој месец';
  return 'Постаро';
}

const PRODUCT_COLORS = [
  { bg: '#3b82f6', light: 'rgba(59,130,246,0.1)' },
  { bg: '#8b5cf6', light: 'rgba(139,92,246,0.1)' },
  { bg: '#ec4899', light: 'rgba(236,72,153,0.1)' },
  { bg: '#f59e0b', light: 'rgba(245,158,11,0.1)' },
  { bg: '#10b981', light: 'rgba(16,185,129,0.1)' },
  { bg: '#ef4444', light: 'rgba(239,68,68,0.1)' },
];

/* ═══════════════════════════════════════════════════════════ */
export default function ProductionNew() {
  const navigate = useNavigate();

  /* data */
  const [productTypes, setProductTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [poolData, setPoolData] = useState([]);
  const [poolMeasurements, setPoolMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ui */
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  /* filters */
  const [searchQ, setSearchQ] = useState('');
  const [filterPool, setFilterPool] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  /* form (stepper) */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ production_date: todayStr(), source_pool: '', fish_count: '', total_weight_kg: '', notes: '' });
  const [items, setItems] = useState([]);

  /* settings */
  const [newType, setNewType] = useState({ code: '', name: '', price_per_unit: '' });
  const [editPrices, setEditPrices] = useState({});

  /* попис */
  const [showPopis, setShowPopis] = useState(false);
  const [popisValues, setPopisValues] = useState({});
  const [inventoryData, setInventoryData] = useState([]);

  const formTopRef = useRef(null);

  /* ═══ load ═══ */
  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [t, b, p, m] = await Promise.all([
        api.getProductTypes(),
        api.getProductionBatches({ limit: 200 }),
        api.getPoolFishInventory().catch(() => ({ inventory: [] })),
        api.getPoolMeasurements().catch(() => ({ measurements: [] })),
      ]);
      setProductTypes(t.productTypes || []);
      setBatches(b.batches || []);
      setPoolData(p.inventory || []);
      setPoolMeasurements(m.measurements || []);
      const pr = {}; (t.productTypes || []).forEach(x => { pr[x.id] = x.price_per_unit; }); setEditPrices(pr);
    } catch { setError('Грешка при вчитување'); }
    finally { setLoading(false); }
  }

  /* pool helper */
  function poolInfo(n) {
    const p = poolData.find(x => x.pool_number === parseInt(n));
    const m = poolMeasurements.find(x => x.pool_number === parseInt(n));
    const fc = p ? p.current_count : (m ? m.fish_count : 0);
    const aw = m ? parseFloat(m.projected_avg_weight || m.avg_weight_gr || 0) : 0;
    return { fishCount: fc, avgWeight: aw, totalMass: fc * aw / 1000 };
  }

  /* ═══ form actions ═══ */
  function startNew() {
    setEditingId(null);
    setForm({ production_date: todayStr(), source_pool: '', fish_count: '', total_weight_kg: '', notes: '' });
    setItems(productTypes.map(pt => ({ product_type_id: pt.id, quantity_kg: '' })));
    setStep(1); setShowForm(true); setShowSettings(false);
    setError(''); setSuccess('');
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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
    const bi = batch.items || [];
    setItems(productTypes.map(pt => {
      const e = bi.find(i => i.product_type_id === pt.id);
      return { product_type_id: pt.id, quantity_kg: e ? String(e.quantity_kg) : '' };
    }));
    setStep(1); setShowForm(true); setShowSettings(false);
    setError(''); setSuccess('');
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  function cancelForm() { setShowForm(false); setEditingId(null); setStep(1); setError(''); }

  function goNext() {
    if (step === 1 && !form.source_pool) { setError('Изберете базен'); return; }
    if (step === 2) {
      if (!form.fish_count || parseInt(form.fish_count) <= 0) { setError('Внесете број на риби'); return; }
      if (!form.total_weight_kg || parseFloat(form.total_weight_kg) <= 0) { setError('Внесете тежина'); return; }
    }
    if (step === 3 && !items.some(i => parseFloat(i.quantity_kg) > 0)) { setError('Внесете барем еден производ'); return; }
    setError(''); setStep(step + 1);
  }

  function goBack() { setError(''); setStep(Math.max(1, step - 1)); }

  async function handleSave() {
    const vi = items.filter(i => parseFloat(i.quantity_kg) > 0);
    if (!vi.length) { setError('Нема производи'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        source_pool: form.source_pool, fish_count: parseInt(form.fish_count),
        total_weight_kg: parseFloat(form.total_weight_kg), notes: form.notes || null,
        production_date: form.production_date,
        items: vi.map(i => ({ product_type_id: i.product_type_id, quantity_kg: parseFloat(i.quantity_kg) })),
      };
      if (editingId) {
        await api.updateProductionBatch(editingId, payload);
        setSuccess('Серијата е ажурирана');
      } else {
        payload.complete = true;
        const r = await api.createProductionBatch(payload);
        setSuccess(`Серијата е зачувана${r?.lot_number ? ` — ${r.lot_number}` : ''}`);
      }
      setShowForm(false); setEditingId(null); setStep(1);
      await loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch (e) { setError(e.message || 'Грешка'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Избриши серија? Залихата ќе се коригира.')) return;
    try { await api.deleteProductionBatch(id); setSuccess('Избришано'); await loadData(); setTimeout(() => setSuccess(''), 3000); }
    catch (e) { setError(e.message); }
  }

  /* ═══ product type settings ═══ */
  async function handleAddType(e) {
    e.preventDefault();
    if (!newType.code || !newType.name) { setError('Потребни се код и име'); return; }
    try { await api.createProductType(newType); setNewType({ code: '', name: '', price_per_unit: '' }); setSuccess('Додадено'); await loadData(); setTimeout(() => setSuccess(''), 3000); }
    catch (e) { setError(e.message); }
  }
  async function handleSavePrice(id) {
    try { await api.updateProductType(id, { price_per_unit: parseFloat(editPrices[id]) || 0 }); setSuccess('Зачувано'); setTimeout(() => setSuccess(''), 3000); }
    catch (e) { setError(e.message); }
  }
  async function handleDeleteType(id) {
    if (!confirm('Деактивирај?')) return;
    try { await api.deleteProductType(id); await loadData(); } catch (e) { setError(e.message); }
  }

  /* ═══ попис ═══ */
  async function openPopis() {
    setShowPopis(true);
    try {
      const d = await api.getProductInventory();
      const inv = d.inventory || [];
      setInventoryData(inv);
      const vals = {};
      inv.forEach(i => { vals[i.product_type_id] = String(i.quantity_kg || 0); });
      setPopisValues(vals);
    } catch { setError('Грешка при вчитување залиха'); }
  }

  async function handleSavePopis() {
    const items = Object.entries(popisValues)
      .filter(([, v]) => v !== '' && !isNaN(parseFloat(v)))
      .map(([id, v]) => ({ product_type_id: id, quantity_kg: parseFloat(v) }));
    if (!items.length) { setError('Внесете барем една вредност'); return; }
    setSaving(true); setError('');
    try {
      await api.resetProductInventory(items);
      setSuccess('Пописот е зачуван');
      setShowPopis(false);
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) { setError(e.message || 'Грешка при зачувување'); }
    finally { setSaving(false); }
  }

  /* ═══ computed ═══ */
  const totalProcessed = items.reduce((s, i) => s + (parseFloat(i.quantity_kg) || 0), 0);
  const rawWeight = parseFloat(form.total_weight_kg) || 0;
  const yieldPct = rawWeight > 0 ? ((totalProcessed / rawWeight) * 100).toFixed(1) : '0';
  const pi = form.source_pool ? poolInfo(form.source_pool) : null;

  function ptColor(idx) { return PRODUCT_COLORS[idx % PRODUCT_COLORS.length]; }

  /* ═══ filtered + grouped batches ═══ */
  const filtered = useMemo(() => {
    let list = [...batches];
    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter(b => (b.lot_number || '').toLowerCase().includes(q));
    }
    if (filterPool) list = list.filter(b => String(b.source_pool) === filterPool);
    if (filterProduct) {
      list = list.filter(b => (b.items || []).some(i => String(i.product_type_id) === filterProduct));
    }
    if (filterFrom) list = list.filter(b => (b.production_date || b.created_at || '').slice(0,10) >= filterFrom);
    if (filterTo) list = list.filter(b => (b.production_date || b.created_at || '').slice(0,10) <= filterTo);
    return list;
  }, [batches, searchQ, filterPool, filterProduct, filterFrom, filterTo]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(b => {
      const key = dateGroup(b.production_date || b.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });
    return groups;
  }, [filtered]);

  const GROUP_ORDER = ['Денес', 'Вчера', 'Оваа недела', 'Овој месец', 'Постаро', 'Останато'];
  const hasActiveFilters = searchQ || filterPool || filterProduct || filterFrom || filterTo;

  /* stats */
  const totalBatches = batches.length;
  const totalKgAll = batches.reduce((s, b) => s + (b.items || []).reduce((ss, i) => ss + parseFloat(i.quantity_kg || 0), 0), 0);

  const STEPS = [
    { n: 1, label: 'Базен' }, { n: 2, label: 'Извлекување' },
    { n: 3, label: 'Обработка' }, { n: 4, label: 'Преглед' },
  ];

  /* ═══════════════════ RENDER ═══════════════════ */

  if (loading) return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="skeleton h-10 w-48" /><div className="skeleton h-32 w-full" /><div className="skeleton h-20 w-full" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">

      {/* ─── HEADER ─── */}
      <div className="mb-5 animate-in" ref={formTopRef}>
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => navigate('/production')} className="btn-ghost p-1.5 -ml-1.5"><ChevronLeft size={20} /></button>
          <h1 className="page-title !mb-0">Производство</h1>
          <div className="flex-1" />
          <button onClick={() => { setShowSettings(!showSettings); setShowForm(false); }}
            className="btn-ghost p-2 text-[var(--text-secondary)]"><Settings size={18} /></button>
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

      {/* alerts */}
      {error && <div className="alert alert-error mb-4 animate-in flex items-center gap-2"><AlertCircle size={16} className="flex-shrink-0" /> {error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in flex items-center gap-2"><Check size={16} className="flex-shrink-0" /> {success}</div>}

      {/* ═══ SETTINGS ═══ */}
      {showSettings && !showForm && (
        <div className="card mb-5 animate-in">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Типови производи и цени</h3>
            <button onClick={() => setShowSettings(false)} className="btn-ghost p-1.5"><X size={16} /></button>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-4">Промени ја цената или додај нов тип на производ</p>

          {/* Existing product types */}
          <div className="space-y-2.5 mb-5">
            {productTypes.map((t, idx) => (
              <div key={t.id} className="bg-[var(--surface-elevated)] rounded-[var(--r-sm)] p-3 border border-[var(--border)]">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: ptColor(idx).light, color: ptColor(idx).bg }}>{t.code}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{t.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Код: {t.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Цена (ден/кг)</label>
                    <input type="number" step="0.01" min="0" value={editPrices[t.id] ?? ''}
                      onChange={e => setEditPrices({ ...editPrices, [t.id]: e.target.value })}
                      className="input-base w-full text-sm" placeholder="Внеси цена" />
                  </div>
                  <div className="flex gap-1 mt-4">
                    <button onClick={() => handleSavePrice(t.id)}
                      className="btn-ghost text-[10px] text-[var(--primary)] flex items-center gap-1 px-2 py-1.5">
                      <Save size={12} /> Зачувај
                    </button>
                    <button onClick={() => handleDeleteType(t.id)}
                      className="btn-ghost text-[10px] text-[var(--danger)] flex items-center gap-1 px-2 py-1.5">
                      <Trash2 size={12} /> Тргни
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add new product type */}
          <div className="pt-4 border-t border-[var(--border)]">
            <p className="text-[11px] font-semibold text-[var(--text-primary)] mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>
              <Plus size={12} className="inline -mt-0.5 mr-1" />Додај нов производ
            </p>
            <form onSubmit={handleAddType} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Код (кратенка)</label>
                  <input type="text" value={newType.code} onChange={e => setNewType({ ...newType, code: e.target.value })}
                    className="input-base w-full text-sm" placeholder="пр. ДР" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Цена (ден/кг)</label>
                  <input type="number" step="0.01" value={newType.price_per_unit} onChange={e => setNewType({ ...newType, price_per_unit: e.target.value })}
                    className="input-base w-full text-sm" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Целосно име</label>
                <input type="text" value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })}
                  className="input-base w-full text-sm" placeholder="пр. Димена риба" />
              </div>
              <button type="submit" className="btn-primary text-sm w-full py-2.5 flex items-center justify-center gap-2">
                <Plus size={14} /> Додај производ
              </button>
            </form>
          </div>

          {/* ═══ ПОПИС ═══ */}
          <div className="pt-4 border-t border-[var(--border)]">
            {!showPopis ? (
              <button onClick={openPopis}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[var(--primary)] bg-[var(--surface-elevated)] rounded-[var(--r-sm)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                <ClipboardList size={15} /> Попис на залиха
              </button>
            ) : (
              <div className="animate-in">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                    <ClipboardList size={12} className="inline -mt-0.5 mr-1" />Попис на залиха
                  </p>
                  <button onClick={() => setShowPopis(false)} className="btn-ghost p-1"><X size={14} /></button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mb-3">Внесете ја реалната количина за секој производ (во кг)</p>

                <div className="space-y-2.5 mb-4">
                  {inventoryData.map((item, idx) => {
                    const currentQty = parseFloat(item.quantity_kg || 0);
                    const newQty = parseFloat(popisValues[item.product_type_id] || 0);
                    const diff = newQty - currentQty;
                    return (
                      <div key={item.product_type_id} className="bg-[var(--surface-elevated)] rounded-[var(--r-sm)] p-3 border border-[var(--border)]">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ background: ptColor(idx).light, color: ptColor(idx).bg }}>{item.code}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">Моментална: {currentQty.toFixed(2)} кг</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <input type="number" step="0.01" min="0"
                              value={popisValues[item.product_type_id] ?? ''}
                              onChange={e => setPopisValues({ ...popisValues, [item.product_type_id]: e.target.value })}
                              className="input-base w-full text-sm" placeholder="Нова количина (кг)" />
                          </div>
                          {diff !== 0 && !isNaN(diff) && (
                            <span className={`text-[10px] font-semibold flex-shrink-0 ${diff > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button onClick={handleSavePopis} disabled={saving}
                  className="btn-primary text-sm w-full py-2.5 flex items-center justify-center gap-2">
                  <Save size={14} /> {saving ? 'Зачувување...' : 'Зачувај попис'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* FORM — GUIDED STEPS                        */}
      {/* ═══════════════════════════════════════════ */}
      {showForm && (
        <div className="space-y-4 mb-6 animate-in">

          {/* stepper */}
          <div className="flex items-center gap-1 mb-2">
            {STEPS.map((s, idx) => (
              <div key={s.n} className="flex items-center flex-1">
                <button onClick={() => { if (s.n < step || editingId) setStep(s.n); }} disabled={!editingId && s.n > step} className="flex items-center gap-1.5 w-full">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all ${
                    s.n < step || (editingId && s.n !== step) ? 'bg-[var(--primary)] text-white'
                    : s.n === step ? 'bg-[var(--primary)] text-white ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]'
                    : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)]'
                  }`}>{s.n < step || (editingId && s.n !== step) ? <Check size={14} /> : s.n}</div>
                  <span className={`text-[11px] font-medium hidden min-[400px]:inline ${s.n <= step || editingId ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && <div className={`h-px flex-1 mx-1 ${s.n < step || editingId ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`} />}
              </div>
            ))}
          </div>

          {/* date — always visible */}
          <div className="card !py-3">
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-[var(--primary)] flex-shrink-0" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">Датум:</span>
              <input type="date" value={form.production_date} onChange={e => setForm({ ...form, production_date: e.target.value })}
                className="input-base text-sm flex-1" style={{ maxWidth: 180 }} />
              <span className="text-xs text-[var(--text-muted)] hidden min-[400px]:inline">{fmtDate(form.production_date)}</span>
            </div>
          </div>

          {/* ── STEP 1: Pool ── */}
          {step === 1 && (
            <div className="animate-in">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>
                Од кој базен се вадат рибите?
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4,5,6,7,8].map(n => {
                  const inf = poolInfo(n);
                  const sel = form.source_pool === String(n);
                  return (
                    <button key={n} onClick={() => setForm({ ...form, source_pool: String(n) })}
                      className={`card !py-4 text-left transition-all ${sel ? 'ring-2 ring-[var(--primary)] bg-[var(--primary-muted)]' : 'card-hover'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${sel ? 'bg-[var(--primary)] text-white' : ''}`}
                          style={sel ? {} : { background: 'rgba(59,130,246,0.08)', color: 'var(--primary)' }}>{n}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Базен {n}</p>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                            {inf.fishCount > 0 ? `${inf.fishCount} риби · ${inf.totalMass.toFixed(0)} кг` : 'Нема податоци'}
                          </p>
                        </div>
                      </div>
                      {sel && <div className="mt-2 flex justify-end"><Check size={18} className="text-[var(--primary)]" /></div>}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between mt-5">
                <button onClick={cancelForm} className="btn-ghost text-sm flex items-center gap-1.5"><X size={16} /> Откажи</button>
                <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">Следно <ChevronRight size={16} /></button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Extraction ── */}
          {step === 2 && (
            <div className="animate-in">
              {pi && (
                <div className="rounded-2xl p-4 mb-4 flex gap-4" style={{ background: 'var(--primary-muted)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Базен</p>
                    <p className="text-lg font-bold text-[var(--primary)]">{form.source_pool}</p>
                  </div>
                  <div className="w-px bg-[var(--border)]" />
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Риби</p>
                    <p className="text-lg font-bold text-[var(--primary)]">{pi.fishCount}</p>
                  </div>
                  <div className="w-px bg-[var(--border)]" />
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Маса</p>
                    <p className="text-lg font-bold text-[var(--primary)]">{pi.totalMass.toFixed(0)} кг</p>
                  </div>
                </div>
              )}

              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
                Колку риби се извадени?
              </h3>

              <div className="space-y-5">
                {/* fish count */}
                <div className="card !py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                      <Fish size={16} style={{ color: '#3b82f6' }} />
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">Број на извадени риби</span>
                  </div>
                  <input type="number" min="0" value={form.fish_count}
                    onChange={e => setForm({ ...form, fish_count: e.target.value })}
                    className="input-base text-2xl font-bold text-center py-4 tracking-wide" placeholder="0" autoFocus
                    style={{ letterSpacing: '0.05em' }} />
                  {pi && pi.fishCount > 0 && form.fish_count && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-2 text-center">
                      Остануваат <strong>{pi.fishCount - parseInt(form.fish_count || 0)}</strong> во базенот
                    </p>
                  )}
                </div>

                {/* weight */}
                <div className="card !py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                      <Package size={16} style={{ color: '#8b5cf6' }} />
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">Вкупна жива тежина (кг)</span>
                  </div>
                  <input type="number" step="0.01" min="0" value={form.total_weight_kg}
                    onChange={e => setForm({ ...form, total_weight_kg: e.target.value })}
                    className="input-base text-2xl font-bold text-center py-4 tracking-wide" placeholder="0.00"
                    style={{ letterSpacing: '0.05em' }} />
                  {form.fish_count > 0 && form.total_weight_kg > 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-2 text-center">
                      Просек: <strong>{(parseFloat(form.total_weight_kg) / parseInt(form.fish_count)).toFixed(2)}</strong> кг/риба
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-between mt-5">
                <button onClick={goBack} className="btn-ghost text-sm flex items-center gap-1.5"><ChevronLeft size={16} /> Назад</button>
                <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">Следно <ChevronRight size={16} /></button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Products ── */}
          {step === 3 && (
            <div className="animate-in">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: 'Sora, sans-serif' }}>
                Производи од обработката
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">Внесете кг за секој тип</p>

              <div className="space-y-3">
                {items.map((item, idx) => {
                  const pt = productTypes.find(t => t.id === item.product_type_id);
                  if (!pt) return null;
                  const c = ptColor(idx);
                  const val = parseFloat(item.quantity_kg) || 0;
                  const pct = rawWeight > 0 ? Math.min((val / rawWeight) * 100, 100) : 0;
                  return (
                    <div key={pt.id} className="card !p-0 overflow-hidden">
                      {/* color accent bar */}
                      <div style={{ height: 3, background: val > 0 ? c.bg : 'var(--border)', transition: 'background 0.3s' }} />
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                          style={{ background: c.light, color: c.bg }}>{pt.code}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{pt.name}</p>
                          {val > 0 && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{pct.toFixed(0)}% од вкупно</p>}
                        </div>
                        <div className="w-24 flex-shrink-0">
                          <input type="number" step="0.01" min="0" value={item.quantity_kg}
                            onChange={e => { const u = [...items]; u[idx] = { ...u[idx], quantity_kg: e.target.value }; setItems(u); }}
                            className="input-base text-base font-semibold text-right py-2" placeholder="0" />
                        </div>
                        <span className="text-xs text-[var(--text-muted)] flex-shrink-0">кг</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalProcessed > 0 && (
                <div className="rounded-2xl p-4 mt-4 flex items-center justify-between" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Вкупно обработено</p>
                    <p className="text-lg font-bold text-[var(--text-primary)]">{totalProcessed.toFixed(2)} кг</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Рандман</p>
                    <p className={`text-lg font-bold ${totalProcessed > rawWeight ? 'text-[var(--danger)]' : 'text-[var(--primary)]'}`}>{yieldPct}%</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between mt-5">
                <button onClick={goBack} className="btn-ghost text-sm flex items-center gap-1.5"><ChevronLeft size={16} /> Назад</button>
                <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">Следно <ChevronRight size={16} /></button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Review ── */}
          {step === 4 && (
            <div className="animate-in">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
                Преглед пред зачувување
              </h3>

              <div className="card !py-5 mb-4" style={{ background: 'var(--surface-elevated)' }}>
                {/* header */}
                <div className="text-center mb-4 pb-4 border-b border-[var(--border)]">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Производствена серија</p>
                  <p className="text-base font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                    Базен {form.source_pool} · {fmtDate(form.production_date)}
                  </p>
                </div>

                {/* stats row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Риби</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{form.fish_count}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Жива тежина</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{parseFloat(form.total_weight_kg).toFixed(1)}<span className="text-sm"> кг</span></p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Рандман</p>
                    <p className={`text-xl font-bold ${totalProcessed > rawWeight ? 'text-[var(--danger)]' : 'text-[var(--primary)]'}`}>{yieldPct}%</p>
                  </div>
                </div>

                {/* products */}
                <div className="border-t border-[var(--border)] pt-3 space-y-2">
                  {items.filter(i => parseFloat(i.quantity_kg) > 0).map((item, idx) => {
                    const pt = productTypes.find(t => t.id === item.product_type_id);
                    const ci = productTypes.indexOf(pt);
                    const c = ptColor(ci >= 0 ? ci : idx);
                    return (
                      <div key={item.product_type_id} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.bg }} />
                        <span className="text-sm text-[var(--text-secondary)] flex-1">{pt?.code} — {pt?.name}</span>
                        <span className="text-sm font-bold text-[var(--text-primary)]">{parseFloat(item.quantity_kg).toFixed(2)} кг</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-2 border-t border-dashed border-[var(--border)]">
                    <span className="text-sm font-bold text-[var(--text-primary)] flex-1">Вкупно обработено</span>
                    <span className="text-sm font-bold text-[var(--primary)]">{totalProcessed.toFixed(2)} кг</span>
                  </div>
                </div>
              </div>

              {/* notes */}
              <div className="card !py-3 mb-4">
                <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Забелешки (опционално)</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input-base text-sm" rows="2" placeholder="Дополнителни информации..." />
              </div>

              <div className="flex justify-between">
                <button onClick={goBack} className="btn-ghost text-sm flex items-center gap-1.5"><ChevronLeft size={16} /> Назад</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5 px-5">
                  {saving
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Се зачувува...</>
                    : <><Save size={16} /> {editingId ? 'Ажурирај' : 'Зачувај серија'}</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* BATCHES LIST                               */}
      {/* ═══════════════════════════════════════════ */}
      {!showForm && !showSettings && (
        <>
          {batches.length === 0 ? (
            <div className="card text-center py-14 animate-in">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--primary-muted)' }}>
                <Factory size={28} className="text-[var(--primary)]" />
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">Нема зачувани серии</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">Кликнете „Нова серија" за да започнете</p>
              <button onClick={startNew} className="btn-primary text-sm mx-auto flex items-center gap-1.5"><Plus size={16} /> Нова серија</button>
            </div>
          ) : (
            <div className="space-y-3 animate-in">

              {/* stats bar */}
              <div className="rounded-2xl p-3 flex gap-4" style={{ background: 'var(--primary-muted)', border: '1px solid rgba(59,130,246,0.12)' }}>
                <div className="text-center flex-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase">Серии</p>
                  <p className="text-lg font-bold text-[var(--primary)]">{totalBatches}</p>
                </div>
                <div className="w-px bg-[var(--border)]" />
                <div className="text-center flex-1">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase">Вкупно обработено</p>
                  <p className="text-lg font-bold text-[var(--primary)]">{totalKgAll.toFixed(0)} кг</p>
                </div>
              </div>

              {/* search + filter toggle */}
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                  <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                    className="input-base text-sm w-full" style={{ paddingLeft: '2.25rem' }} placeholder="Пребарај LOT..." />
                </div>
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`btn-ghost px-3 flex items-center gap-1.5 text-sm ${hasActiveFilters ? 'text-[var(--primary)] bg-[var(--primary-muted)]' : ''}`}>
                  <Filter size={15} /> Филтер
                  {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                </button>
              </div>

              {/* filter panel */}
              {showFilters && (
                <div className="card !py-3 space-y-3 animate-in">
                  {/* pool chips */}
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Базен</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterPool('')}
                        className={`text-xs px-3 py-1 rounded-full transition-all ${!filterPool ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'}`}>Сите</button>
                      {[1,2,3,4,5,6,7,8].map(n => (
                        <button key={n} onClick={() => setFilterPool(filterPool === String(n) ? '' : String(n))}
                          className={`text-xs px-3 py-1 rounded-full transition-all ${filterPool === String(n) ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'}`}>{n}</button>
                      ))}
                    </div>
                  </div>

                  {/* product filter */}
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Производ</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterProduct('')}
                        className={`text-xs px-3 py-1 rounded-full transition-all ${!filterProduct ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'}`}>Сите</button>
                      {productTypes.map((pt, idx) => (
                        <button key={pt.id} onClick={() => setFilterProduct(filterProduct === String(pt.id) ? '' : String(pt.id))}
                          className={`text-xs px-3 py-1 rounded-full transition-all ${filterProduct === String(pt.id) ? 'text-white' : 'text-[var(--text-secondary)] border border-[var(--border)]'}`}
                          style={filterProduct === String(pt.id) ? { background: ptColor(idx).bg } : { background: 'var(--surface-elevated)' }}>{pt.code}</button>
                      ))}
                    </div>
                  </div>

                  {/* date range */}
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Период</p>
                    <div className="flex gap-2 items-center">
                      <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input-base text-xs flex-1 py-1.5" />
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                      <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input-base text-xs flex-1 py-1.5" />
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <button onClick={() => { setSearchQ(''); setFilterPool(''); setFilterProduct(''); setFilterFrom(''); setFilterTo(''); }}
                      className="btn-ghost text-xs text-[var(--danger)] flex items-center gap-1"><X size={13} /> Исчисти филтри</button>
                  )}
                </div>
              )}

              {/* results count */}
              {hasActiveFilters && (
                <p className="text-xs text-[var(--text-muted)]">{filtered.length} од {batches.length} серии</p>
              )}

              {/* grouped list */}
              {filtered.length === 0 ? (
                <div className="card text-center py-8">
                  <Search size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-secondary)]">Нема резултати</p>
                </div>
              ) : (
                GROUP_ORDER.filter(g => grouped[g]?.length > 0).map(group => (
                  <div key={group}>
                    {/* group header */}
                    <div className="flex items-center gap-3 my-3">
                      <div className="h-px flex-1 bg-[var(--border)]" />
                      <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>{group}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{grouped[group].length}</span>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>

                    <div className="space-y-2">
                      {grouped[group].map(batch => {
                        const isExp = expandedBatch === batch.id;
                        const bi = batch.items || [];
                        const tkg = bi.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);
                        const bDate = (batch.production_date || batch.created_at || '').slice(0, 10);

                        return (
                          <div key={batch.id} className="card">
                            <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpandedBatch(isExp ? null : batch.id)}>
                              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                                <Package size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>{batch.lot_number}</h3>
                                  <span className="text-[10px] text-[var(--text-muted)]">{fmtDateShort(bDate)}</span>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                  Базен {batch.source_pool} · {batch.fish_count} риби · {parseFloat(batch.total_weight_kg || 0).toFixed(0)} кг
                                </p>
                                {bi.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {bi.map((item, ii) => {
                                      const ci = productTypes.findIndex(t => t.id === item.product_type_id);
                                      const c = ptColor(ci >= 0 ? ci : ii);
                                      return (
                                        <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                          style={{ background: c.light, color: c.bg }}>
                                          {item.code} {parseFloat(item.quantity_kg).toFixed(1)}кг
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span className="text-sm font-bold text-[var(--primary)]">{tkg.toFixed(1)} кг</span>
                                {isExp ? <ChevronUp size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
                              </div>
                            </div>

                            {isExp && (
                              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  <div className="text-center">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Жива тежина</p>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">{parseFloat(batch.total_weight_kg || 0).toFixed(1)} кг</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Обработено</p>
                                    <p className="text-sm font-bold text-[var(--primary)]">{tkg.toFixed(1)} кг</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Рандман</p>
                                    <p className="text-sm font-bold">{parseFloat(batch.total_weight_kg) > 0 ? ((tkg / parseFloat(batch.total_weight_kg)) * 100).toFixed(1) : 0}%</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => startEdit(batch)} className="btn-ghost text-xs flex items-center gap-1"><Pencil size={13} /> Измени</button>
                                  <button onClick={() => handleDelete(batch.id)} className="btn-ghost text-xs text-[var(--danger)] ml-auto flex items-center gap-1"><Trash2 size={13} /> Избриши</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
