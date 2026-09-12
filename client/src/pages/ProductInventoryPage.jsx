import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronLeft, Fish, Package as PackageIcon, AlertTriangle, ClipboardList, Save, X, Check, AlertCircle } from 'lucide-react';

const PRODUCT_COLORS = [
  { bg: '#3b82f6', light: 'rgba(59,130,246,0.1)' },
  { bg: '#8b5cf6', light: 'rgba(139,92,246,0.1)' },
  { bg: '#ec4899', light: 'rgba(236,72,153,0.1)' },
  { bg: '#f59e0b', light: 'rgba(245,158,11,0.1)' },
  { bg: '#10b981', light: 'rgba(16,185,129,0.1)' },
  { bg: '#ef4444', light: 'rgba(239,68,68,0.1)' },
];
function ptColor(idx) { return PRODUCT_COLORS[idx % PRODUCT_COLORS.length]; }

export default function ProductInventoryPage() {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  /* попис */
  const [showPopis, setShowPopis] = useState(false);
  const [popisValues, setPopisValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadInventory() {
    try {
      const d = await api.getProductInventory();
      setInventory(d.inventory || []);
    } catch { setInventory([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadInventory(); }, []);

  function openPopis() {
    setShowPopis(true);
    const vals = {};
    inventory.forEach(i => { vals[i.product_type_id] = String(i.quantity_kg || 0); });
    setPopisValues(vals);
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
      await loadInventory();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) { setError(e.message || 'Грешка при зачувување'); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="skeleton h-10 w-48" /><div className="skeleton h-40 w-full" />
    </div>
  );

  const totalKg = inventory.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);
  const barMax = Math.max(10, ...inventory.map(i => parseFloat(i.quantity_kg) || 0));

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 animate-in">
        <button onClick={() => navigate('/production')} className="inline-flex items-center gap-1 text-xs text-[var(--primary)] font-medium mb-3 hover:underline">
          <ChevronLeft size={14} /> Назад
        </button>
        <div className="flex items-center justify-between">
          <h1 className="page-title">Залиха на производи</h1>
          <button onClick={openPopis}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[var(--r-sm)] px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors">
            <ClipboardList size={14} /> Попис
          </button>
        </div>
        <div className="flex items-center gap-1.5 -mt-1">
          <Fish size={13} className="text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-secondary)]">Преработена риба за продажба</p>
        </div>
      </div>

      {/* alerts */}
      {error && <div className="alert alert-error mb-4 animate-in flex items-center gap-2"><AlertCircle size={16} className="flex-shrink-0" /> {error}</div>}
      {success && <div className="alert alert-success mb-4 animate-in flex items-center gap-2"><Check size={16} className="flex-shrink-0" /> {success}</div>}

      {/* ═══ ПОПИС ФОРМА ═══ */}
      {showPopis && (
        <div className="card mb-4 animate-in">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              <ClipboardList size={14} className="inline -mt-0.5 mr-1.5" />Попис на залиха
            </h3>
            <button onClick={() => setShowPopis(false)} className="btn-ghost p-1.5"><X size={16} /></button>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-4">Внесете ја реалната количина за секој производ (во кг)</p>

          <div className="space-y-2.5 mb-4">
            {inventory.map((item, idx) => {
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

      {/* Summary */}
      <div className="card !p-4 mb-4 animate-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
              Вкупна залиха
            </p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-0.5" style={{ fontFamily: 'Sora, sans-serif' }}>
              {totalKg.toFixed(1)} <span className="text-sm font-normal text-[var(--text-muted)]">кг</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
            <PackageIcon size={22} />
          </div>
        </div>
      </div>

      {inventory.length === 0 ? (
        <div className="card text-center py-8 animate-in">
          <Fish size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Нема производи на залиха</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Залихата се зголемува при завршување на обработка</p>
        </div>
      ) : (
        <div className="card !p-4 space-y-3 animate-in">
          {inventory.map(item => {
            const qty = parseFloat(item.quantity_kg || 0);
            const pct = Math.min((qty / barMax) * 100, 100);
            const isEmpty = qty <= 0;
            const isLow = qty > 0 && qty <= 2;
            const barColor = isEmpty ? 'var(--text-muted)' : isLow ? 'var(--warning)' : 'var(--primary)';
            const barBg = isEmpty ? 'rgba(100,100,100,0.08)' : isLow ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)';

            return (
              <div key={item.product_type_id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded">
                      {item.code}
                    </span>
                    <span className="text-[12px] font-medium text-[var(--text-secondary)] truncate">
                      {item.name}
                    </span>
                  </div>
                  <span className={`text-[12px] font-bold flex-shrink-0 ml-2 ${
                    isEmpty ? 'text-[var(--text-muted)]' : isLow ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'
                  }`}>
                    {qty.toFixed(1)} кг
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: barBg }}>
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: barColor, minWidth: qty > 0 ? 4 : 0 }}
                  />
                </div>
                {item.price_per_unit && (
                  <p className="text-[10px] text-[var(--text-muted)] text-right mt-0.5">
                    {parseFloat(item.price_per_unit).toFixed(0)} ден/{item.unit || 'кг'}
                  </p>
                )}
              </div>
            );
          })}

          {inventory.some(i => parseFloat(i.quantity_kg) <= 0) && (
            <p className="text-[11px] text-[var(--warning)] font-medium mt-1 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Некои производи се без залиха
            </p>
          )}
        </div>
      )}
    </div>
  );
}
