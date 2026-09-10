import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Factory, ShoppingCart, ChevronRight, ChevronLeft, Package, Archive,
} from 'lucide-react';

export default function ProductionHub() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ batches: 0, totalKg: 0, salesCount: 0, salesTotal: 0, inventoryKg: 0, inventoryCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [bRes, sRes, invRes] = await Promise.all([
          api.getProductionBatches({ limit: 200 }).catch(() => ({ batches: [] })),
          api.getSales({ limit: 200 }).catch(() => ({ sales: [] })),
          api.getProductInventory().catch(() => ({ inventory: [] })),
        ]);
        const batches = bRes.batches || [];
        const sales = sRes.sales || [];
        const inv = invRes.inventory || [];
        const totalKg = batches.reduce((s, b) =>
          s + (b.items || []).reduce((ss, i) => ss + parseFloat(i.quantity_kg || 0), 0), 0);
        const salesTotal = sales.reduce((s, x) => s + parseFloat(x.total_amount || 0), 0);
        const inventoryKg = inv.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);
        setStats({ batches: batches.length, totalKg, salesCount: sales.length, salesTotal, inventoryKg, inventoryCount: inv.length });
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="skeleton h-10 w-48" /><div className="skeleton h-32 w-full" /><div className="skeleton h-32 w-full" />
    </div>
  );

  const cards = [
    {
      path: '/production/processing',
      icon: Factory,
      title: 'Обработка',
      desc: 'Серии, извлекување и преработка на риба',
      gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      lightBg: 'rgba(59,130,246,0.08)',
      stats: [
        { label: 'Серии', value: stats.batches },
        { label: 'Обработено', value: `${stats.totalKg.toFixed(0)} кг` },
      ],
    },
    {
      path: '/production/sales',
      icon: ShoppingCart,
      title: 'Продажба',
      desc: 'Фактури, купувачи и историја на продажба',
      gradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
      lightBg: 'rgba(34,197,94,0.08)',
      stats: [
        { label: 'Продажби', value: stats.salesCount },
        { label: 'Вкупно', value: `${(stats.salesTotal / 1000).toFixed(0)}к ден` },
      ],
    },
    {
      path: '/inventory/products',
      icon: Archive,
      title: 'Залиха на производи',
      desc: 'Преработена риба готова за продажба',
      gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
      lightBg: 'rgba(139,92,246,0.08)',
      stats: [
        { label: 'Производи', value: stats.inventoryCount },
        { label: 'На залиха', value: `${stats.inventoryKg.toFixed(0)} кг` },
      ],
    },
  ];

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 animate-in">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => navigate('/')} className="btn-ghost p-1.5 -ml-1.5" aria-label="Назад">
            <ChevronLeft size={20} />
          </button>
          <h1 className="page-title !mb-0">Производство</h1>
        </div>
        <div className="flex items-center gap-1.5 mt-1 ml-8">
          <Package size={13} className="text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-secondary)]">Обработка на риба и продажба</p>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {cards.map(card => (
          <Link key={card.path} to={card.path} className="block animate-in">
            <div className="card card-hover !p-0 overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
                  style={{ background: card.gradient }}>
                  <card.icon size={26} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {card.title}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{card.desc}</p>
                </div>
                <ChevronRight size={20} className="text-[var(--text-muted)] flex-shrink-0" />
              </div>

              {/* Stats row */}
              <div className="flex border-t border-[var(--border)]">
                {card.stats.map((st, i) => (
                  <div key={i} className={`flex-1 text-center py-3 ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">{st.label}</p>
                    <p className="text-base font-bold text-[var(--text-primary)] mt-0.5">{st.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
