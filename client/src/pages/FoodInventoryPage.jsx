import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatDateShortMK } from '../lib/utils';
import { ArrowLeft, Package, AlertTriangle, Timer, Settings } from 'lucide-react';

export default function FoodInventoryPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [stockProjection, setStockProjection] = useState(null);
  const [loading, setLoading] = useState(true);
  // Попис: преброена залиха по тип → ја поставува тековната (набавките се додаваат на остатокот)
  const [showCensus, setShowCensus] = useState(false);
  const [censusDate, setCensusDate] = useState(new Date().toISOString().split('T')[0]);
  const [censusValues, setCensusValues] = useState({});
  const [censusSaving, setCensusSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => Promise.all([
    api.getFoodInventory().then(d => setInventory(d.inventory)).catch(() => setInventory([])),
    api.getFoodProjection(14).then(d => setStockProjection(d)).catch(() => setStockProjection(null)),
  ]);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="skeleton h-10 w-48" /><div className="skeleton h-40 w-full" />
    </div>
  );

  const barMax = Math.max(50, ...inventory.map(i => parseFloat(i.quantity_kg) || 0));
  const proj = {};
  const projArr = stockProjection?.projections || [];
  if (Array.isArray(projArr)) {
    projArr.forEach(p => { proj[p.food_type] = p; });
  } else {
    Object.assign(proj, projArr);
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 animate-in">
        <Link to="/inventory" className="inline-flex items-center gap-1 text-xs text-(--primary) font-medium mb-3 hover:underline">
          <ArrowLeft size={14} /> Залиха
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Залиха на храна</h1>
            <div className="flex items-center gap-1.5 -mt-1">
              <Package size={13} className="text-(--text-muted)" />
              <p className="text-xs text-(--text-secondary)">Тековни залихи и проекција</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { setShowCensus(v => !v); setCensusValues({}); setMessage(''); }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showCensus ? 'bg-(--primary) text-white border-(--primary)' : 'border-(--border) text-(--text-secondary) hover:border-(--primary)'}`}>
              Попис
            </button>
            {isAdmin && (
              <Link to="/admin/inventory" className="btn-ghost text-xs flex items-center gap-1 text-(--primary)">
                <Settings size={14} /> Набавки
              </Link>
            )}
          </div>
        </div>
      </div>

      {message && <div className="alert alert-success text-xs mb-3 animate-in">{message}</div>}

      {showCensus && (
        <div className="card !p-3 mb-4 space-y-2 animate-in" style={{ borderColor: 'var(--primary)' }}>
          <p className="text-[11px] text-(--text-secondary)">
            Внеси ја <strong>преброената</strong> количина по тип. Залихата се поставува точно на тие вредности (празно = без промена).
            Набавките и понатаму се додаваат на остатокот.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold text-(--text-muted) uppercase">Датум</label>
            <input type="date" value={censusDate} onChange={e => setCensusDate(e.target.value)} className="input-base text-xs !py-1 w-auto" />
          </div>
          <div className="space-y-1.5">
            {inventory.map(item => (
              <div key={item.food_type} className="flex items-center gap-2">
                <span className="text-xs text-(--text-secondary) flex-1 truncate">{item.food_type}
                  <span className="text-(--text-muted)"> · сега {parseFloat(item.quantity_kg).toFixed(2)} kg</span>
                </span>
                <input type="number" step="any" min="0" placeholder="кг" value={censusValues[item.food_type] ?? ''}
                  onChange={e => setCensusValues({ ...censusValues, [item.food_type]: e.target.value })}
                  className="input-base text-sm !py-1 w-24 text-right" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCensus(false)} className="btn-ghost text-xs">Откажи</button>
            <button type="button" disabled={censusSaving} className="btn-primary text-xs !px-4"
              onClick={async () => {
                const items = Object.entries(censusValues).filter(([, v]) => v !== '' && v != null).map(([food_type, v]) => ({ food_type, quantity_kg: parseFloat(v) }));
                if (items.length === 0) { setMessage('Внеси барем една преброена количина'); return; }
                if (!confirm(`Пописот ќе ја постави залихата на внесените вредности за ${items.length} тип(а). Продолжи?`)) return;
                setCensusSaving(true);
                try {
                  const r = await api.foodCensus({ census_date: censusDate, items });
                  setMessage(r.message || 'Пописот е зачуван');
                  setShowCensus(false); setCensusValues({});
                  await load();
                } catch (e) { setMessage(e.message); }
                finally { setCensusSaving(false); }
              }}>
              {censusSaving ? 'Се зачувува…' : 'Зачувај попис'}
            </button>
          </div>
        </div>
      )}

      {inventory.length === 0 ? (
        <div className="card text-center py-8 animate-in">
          <Package size={32} className="mx-auto text-(--text-muted) mb-2" />
          <p className="text-sm text-(--text-secondary)">Нема внесени залихи</p>
        </div>
      ) : (
        <div className="card !p-4 space-y-3 animate-in">
          {inventory.map(item => {
            const qty = parseFloat(item.quantity_kg);
            const pct = Math.min((qty / barMax) * 100, 100);
            const p = proj[item.food_type];
            const daysLeft = p?.daysLeft;
            const endDate = p?.depletionDate || p?.endDate;
            const isLow = qty <= 5;
            const isWarn = qty <= 15 && !isLow;
            const barColor = isLow ? 'var(--danger)' : isWarn ? 'var(--warning)' : 'var(--success)';
            const barBg = isLow ? 'rgba(239,68,68,0.08)' : isWarn ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)';

            return (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-(--text-secondary)">
                    {item.food_type}
                  </span>
                  <span className={`text-[12px] font-bold ${
                    isLow ? 'text-(--danger)' : isWarn ? 'text-(--warning)' : 'text-(--text-primary)'
                  }`}>
                    {qty.toFixed(2)} kg
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: barBg }}>
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: barColor, minWidth: qty > 0 ? 4 : 0 }}
                  />
                </div>
                <div className="flex items-center justify-end mt-0.5">
                  {daysLeft != null && daysLeft >= 0 ? (
                    <span className={`text-[10px] font-semibold inline-flex items-center gap-0.5 ${
                      daysLeft <= 0 ? 'text-(--danger)'
                      : daysLeft <= 7 ? 'text-(--danger)'
                      : daysLeft <= 21 ? 'text-(--warning)'
                      : 'text-(--success)'
                    }`}>
                      <Timer size={9} />
                      {daysLeft <= 0
                        ? 'Завршена!'
                        : endDate
                          ? `до ${formatDateShortMK(endDate)}`
                          : `${daysLeft}+ дена`
                      }
                    </span>
                  ) : (
                    <span className="text-[9px] text-(--text-muted) italic">Не се троши</span>
                  )}
                </div>
              </div>
            );
          })}

          {inventory.some(i => parseFloat(i.quantity_kg) <= 5) && (
            <p className="text-[11px] text-(--danger) font-medium mt-1 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Ниски залихи — потребна набавка
            </p>
          )}
        </div>
      )}
    </div>
  );
}
