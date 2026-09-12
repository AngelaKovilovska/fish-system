import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronLeft, Fish, Package as PackageIcon, AlertTriangle } from 'lucide-react';

export default function ProductInventoryPage() {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProductInventory()
      .then(d => setInventory(d.inventory || []))
      .catch(() => setInventory([]))
      .finally(() => setLoading(false));
  }, []);

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
        <h1 className="page-title">Залиха на производи</h1>
        <div className="flex items-center gap-1.5 -mt-1">
          <Fish size={13} className="text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-secondary)]">Преработена риба за продажба</p>
        </div>
      </div>

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
