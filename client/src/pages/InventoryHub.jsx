import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Package, Fish, ChevronRight, Archive, AlertTriangle,
} from 'lucide-react';

export default function InventoryHub() {
  const [foodCount, setFoodCount] = useState(0);
  const [foodLow, setFoodLow] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [productTotalKg, setProductTotalKg] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [foodRes, prodRes] = await Promise.all([
          api.getFoodInventory().catch(() => ({ inventory: [] })),
          api.getProductInventory().catch(() => ({ inventory: [] })),
        ]);
        const food = foodRes.inventory || [];
        const prod = prodRes.inventory || [];
        setFoodCount(food.length);
        setFoodLow(food.filter(i => parseFloat(i.quantity_kg) <= 5).length);
        setProductCount(prod.length);
        setProductTotalKg(prod.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0));
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
      path: '/inventory/food',
      icon: Package,
      title: 'Залиха на храна',
      desc: 'Тековни залихи и проекција на потрошувачка',
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
      stats: [
        { label: 'Типови', value: foodCount },
        { label: 'Ниски', value: foodLow, danger: foodLow > 0 },
      ],
    },
    {
      path: '/inventory/products',
      icon: Fish,
      title: 'Залиха на производи',
      desc: 'Преработена риба за продажба',
      gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      stats: [
        { label: 'Производи', value: productCount },
        { label: 'Вкупно', value: `${productTotalKg.toFixed(1)} кг` },
      ],
    },
  ];

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 animate-in">
        <h1 className="page-title">Залиха</h1>
        <div className="flex items-center gap-1.5 -mt-1">
          <Archive size={13} className="text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-secondary)]">Храна и производи на залиха</p>
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
                    <p className={`text-base font-bold mt-0.5 ${st.danger ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                      {st.danger && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                      {st.value}
                    </p>
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
