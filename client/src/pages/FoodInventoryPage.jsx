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

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    Promise.all([
      api.getFoodInventory().then(d => setInventory(d.inventory)).catch(() => setInventory([])),
      api.getFoodProjection(14).then(d => setStockProjection(d)).catch(() => setStockProjection(null)),
    ]).finally(() => setLoading(false));
  }, []);

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
        <Link to="/inventory" className="inline-flex items-center gap-1 text-xs text-[var(--primary)] font-medium mb-3 hover:underline">
          <ArrowLeft size={14} /> Залиха
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Залиха на храна</h1>
            <div className="flex items-center gap-1.5 -mt-1">
              <Package size={13} className="text-[var(--text-muted)]" />
              <p className="text-xs text-[var(--text-secondary)]">Тековни залихи и проекција</p>
            </div>
          </div>
          {isAdmin && (
            <Link to="/admin/inventory" className="btn-ghost text-xs flex items-center gap-1 text-[var(--primary)]">
              <Settings size={14} /> Управувај
            </Link>
          )}
        </div>
      </div>

      {inventory.length === 0 ? (
        <div className="card text-center py-8 animate-in">
          <Package size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Нема внесени залихи</p>
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
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    {item.food_type}
                  </span>
                  <span className={`text-[12px] font-bold ${
                    isLow ? 'text-[var(--danger)]' : isWarn ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'
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
                      daysLeft <= 0 ? 'text-[var(--danger)]'
                      : daysLeft <= 7 ? 'text-[var(--danger)]'
                      : daysLeft <= 21 ? 'text-[var(--warning)]'
                      : 'text-[var(--success)]'
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
                    <span className="text-[9px] text-[var(--text-muted)] italic">Не се троши</span>
                  )}
                </div>
              </div>
            );
          })}

          {inventory.some(i => parseFloat(i.quantity_kg) <= 5) && (
            <p className="text-[11px] text-[var(--danger)] font-medium mt-1 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Ниски залихи — потребна набавка
            </p>
          )}
        </div>
      )}
    </div>
  );
}
