import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { FOOD_TYPES } from '../../lib/constants';
import { Package, Plus, ArrowDown, ArrowUp, Clock, Calendar, Brain, AlertTriangle, Timer } from 'lucide-react';

// Map AI recommendation food type names → inventory food type names
const AI_TO_STOCK_MAP = {
  'Advance (1.5mm)': 'Advance (1.5mm)',
  'Advance (1.0mm)': 'Advance (1.5mm)',
  'Pre Grower-15 EF (2.0mm)': 'Pregrower-15 (2mm)',
  'Special Pro (3.0mm)': 'SpecialPro EF (3mm)',
  'Special Pro (4.5mm)': 'SpecialPro EF (3mm)',
  'Grower-13 EF (3.0mm)': 'Grower-13EF (3mm)',
  'Grower-13 EF (4.5mm)': 'Grower-13EF (4.5mm)',
  'Grower-13 EF (6.0mm)': 'Grower-13EF (6mm)',
  'Grower-13 EF (4.5/6.0mm)': 'Grower-13EF (4.5mm)',
};

const MK_MONTHS = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

function mapAiFoodType(aiFoodType) {
  if (AI_TO_STOCK_MAP[aiFoodType]) return AI_TO_STOCK_MAP[aiFoodType];
  const lower = aiFoodType.toLowerCase();
  if (lower.includes('advance')) return 'Advance (1.5mm)';
  if (lower.includes('pre grower') || lower.includes('pregrower')) return 'Pregrower-15 (2mm)';
  if (lower.includes('special pro') || lower.includes('specialpro')) return 'SpecialPro EF (3mm)';
  if (lower.includes('grower') && lower.includes('6')) return 'Grower-13EF (6mm)';
  if (lower.includes('grower') && lower.includes('4.5')) return 'Grower-13EF (4.5mm)';
  if (lower.includes('grower') && lower.includes('3')) return 'Grower-13EF (3mm)';
  return null;
}

function getStockEndDate(stockKg, dailyKg) {
  if (!dailyKg || dailyKg <= 0) return null;
  const daysLeft = Math.floor(stockKg / dailyKg);
  if (daysLeft <= 0) return { date: null, daysLeft: 0, label: 'Завршена!' };
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysLeft);
  const label = `до ${endDate.getDate()} ${MK_MONTHS[endDate.getMonth()].substring(0, 3)}`;
  return { date: endDate, daysLeft, label };
}

export default function ManageFoodInventory() {
  const [inventory, setInventory] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [foodType, setFoodType] = useState(FOOD_TYPES[0]);
  const [quantity, setQuantity] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [aiRec, setAiRec] = useState(null);

  const load = async () => {
    try {
      const [invData, logData, aiData] = await Promise.all([
        api.getFoodInventory(),
        api.getFoodInventoryLog(3),
        api.getAIRecommendations().catch(() => null),
      ]);
      setInventory(invData.inventory);
      setLog(logData.log);
      setAiRec(aiData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Calculate daily consumption per stock food type from AI recommendations
  const getDailyNeedMap = () => {
    if (!aiRec?.summary?.foodTypeNeeds) return {};
    const map = {};
    for (const need of aiRec.summary.foodTypeNeeds) {
      const stockType = mapAiFoodType(need.foodType);
      if (stockType) {
        map[stockType] = (map[stockType] || 0) + need.dailyNeedKg;
      }
    }
    return map;
  };

  const dailyNeedMap = getDailyNeedMap();

  useEffect(() => { load(); }, []);

  const handlePurchase = async () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      setMessage('Внесете количина поголема од 0');
      return;
    }
    setSaving(true); setMessage('');
    try {
      await api.addFoodPurchase({ food_type: foodType, quantity_kg: parseFloat(quantity), purchase_date: purchaseDate });
      setMessage('Набавката е додадена!');
      setQuantity('');
      await load();
    } catch (err) { setMessage(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="max-w-[700px] mx-auto space-y-3">
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-52 w-full" />
    </div>
  );

  return (
    <div className="max-w-[700px] mx-auto">
      <div className="mb-5 animate-in">
        <h1 className="page-title mb-1">Залихи на храна</h1>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Следете ги залихите. При секоја чек-листа потрошената храна автоматски се одзема.
        </p>
      </div>

      {/* Current stock table */}
      <div className="card mb-4 animate-in">
        <h3 className="section-title text-sm mb-3 flex items-center gap-2">
          <Package size={15} className="text-[var(--primary)]" />
          Тековни залихи
        </h3>
        <div className="hidden lg:block">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Тип храна</th>
                <th className="text-right">Залиха (kg)</th>
                <th className="text-right">Дневна потрошувачка</th>
                <th className="text-right">Залиха до</th>
                <th className="text-right">Последно ажурирано</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => {
                const stockKg = parseFloat(item.quantity_kg);
                const dailyKg = dailyNeedMap[item.food_type] || 0;
                const stockEnd = getStockEndDate(stockKg, dailyKg);
                return (
                  <tr key={item.id}>
                    <td className="font-medium">{item.food_type}</td>
                    <td className="text-right">
                      <span className={`font-bold ${stockKg <= 5 ? 'text-[var(--danger)]' : stockKg <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                        {stockKg.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-right text-[var(--text-muted)]">
                      {dailyKg > 0
                        ? <span className="text-[var(--text-secondary)]">{dailyKg.toFixed(2)} kg/ден</span>
                        : <span className="text-[var(--text-muted)]">—</span>
                      }
                    </td>
                    <td className="text-right">
                      {stockEnd ? (
                        <span className={`inline-flex items-center gap-1 font-bold ${stockEnd.daysLeft <= 7 ? 'text-[var(--danger)]' : stockEnd.daysLeft <= 21 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                          <Timer size={12} />
                          {stockEnd.label}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="text-right text-[var(--text-muted)]">
                      {new Date(item.updated_at).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile list */}
        <div className="lg:hidden space-y-2">
          {inventory.map(item => {
            const stockKg = parseFloat(item.quantity_kg);
            const dailyKg = dailyNeedMap[item.food_type] || 0;
            const stockEnd = getStockEndDate(stockKg, dailyKg);
            return (
              <div key={item.id} className="p-2.5 rounded-[var(--r-sm)] bg-[var(--bg)]">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-[var(--text-secondary)]">{item.food_type}</span>
                  <span className={`font-bold ${stockKg <= 5 ? 'text-[var(--danger)]' : stockKg <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                    {stockKg.toFixed(2)} kg
                  </span>
                </div>
                {stockEnd && (
                  <div className="flex justify-between items-center mt-1.5 text-[10px]">
                    <span className="text-[var(--text-muted)]">{dailyKg.toFixed(2)} kg/ден</span>
                    <span className={`inline-flex items-center gap-1 font-bold ${stockEnd.daysLeft <= 7 ? 'text-[var(--danger)]' : stockEnd.daysLeft <= 21 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                      <Timer size={10} />
                      {stockEnd.label}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Stock Duration Summary */}
      {aiRec && Object.keys(dailyNeedMap).length > 0 && (() => {
        const stockItems = inventory
          .map(item => {
            const stockKg = parseFloat(item.quantity_kg);
            const dailyKg = dailyNeedMap[item.food_type] || 0;
            const stockEnd = getStockEndDate(stockKg, dailyKg);
            return { foodType: item.food_type, stockKg, dailyKg, stockEnd };
          })
          .filter(s => s.dailyKg > 0 && s.stockEnd)
          .sort((a, b) => (a.stockEnd.daysLeft || 0) - (b.stockEnd.daysLeft || 0));

        if (stockItems.length === 0) return null;

        const soonest = stockItems[0];
        const critical = stockItems.filter(s => s.stockEnd.daysLeft <= 7);
        const warning = stockItems.filter(s => s.stockEnd.daysLeft > 7 && s.stockEnd.daysLeft <= 21);

        return (
          <div className="card mb-4 animate-in-delay-1"
            style={{
              background: critical.length > 0
                ? 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))'
                : warning.length > 0
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))'
                  : 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))',
              border: critical.length > 0
                ? '1px solid rgba(239,68,68,0.2)'
                : warning.length > 0
                  ? '1px solid rgba(245,158,11,0.2)'
                  : '1px solid rgba(34,197,94,0.2)',
            }}>
            <div className="flex items-center gap-2 mb-2">
              <Brain size={15} style={{ color: '#7c3aed' }} />
              <h3 className="section-title text-sm !mb-0">AI проценка на залихи</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Базирано на AI препораките за хранење на сите базени
            </p>

            {critical.length > 0 && (
              <div className="flex items-start gap-2 text-xs p-2 rounded-[var(--r-sm)] bg-red-50 dark:bg-red-950/20 mb-2">
                <AlertTriangle size={14} className="text-[var(--danger)] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[var(--danger)]">Критично!</strong>
                  <span className="text-[var(--text-secondary)]"> {critical.map(s =>
                    `${s.foodType} (${s.stockEnd.label})`
                  ).join(', ')}</span>
                </div>
              </div>
            )}

            {warning.length > 0 && (
              <div className="flex items-start gap-2 text-xs p-2 rounded-[var(--r-sm)] bg-amber-50 dark:bg-amber-950/20 mb-2">
                <Timer size={14} className="text-[var(--warning)] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[var(--warning)]">Набавете наскоро:</strong>
                  <span className="text-[var(--text-secondary)]"> {warning.map(s =>
                    `${s.foodType} (${s.stockEnd.label})`
                  ).join(', ')}</span>
                </div>
              </div>
            )}

            <div className="text-xs text-[var(--text-muted)] mt-1">
              Следна набавка: <strong className={soonest.stockEnd.daysLeft <= 7 ? 'text-[var(--danger)]' : soonest.stockEnd.daysLeft <= 21 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}>
                {soonest.stockEnd.daysLeft <= 0 ? 'ИТНО — залихата е завршена' : soonest.stockEnd.label}
              </strong> ({soonest.foodType})
            </div>
          </div>
        );
      })()}

      {/* Add purchase form */}
      <div className="card mb-4 animate-in-delay-1">
        <h3 className="section-title text-sm mb-3 flex items-center gap-2">
          <Plus size={15} className="text-[var(--success)]" />
          Додај набавка
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Тип храна</label>
            <select value={foodType} onChange={(e) => setFoodType(e.target.value)}
              className="input-base">
              {FOOD_TYPES.map(ft => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Количина (kg)</label>
            <input type="number" step="any" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input-base" placeholder="нпр. 25" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Датум на набавка</label>
            <input type="date" value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="input-base" />
          </div>
          <div className="flex items-end">
            <button onClick={handlePurchase} disabled={saving} className="btn-primary w-full py-2.5">
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="wave-loader"><span /><span /><span /><span /></div>
                </span>
              ) : (
                <><Plus size={15} /> Додај</>
              )}
            </button>
          </div>
        </div>
        {message && (
          <p className={`text-xs mt-3 font-medium ${message.includes('додадена') ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Recent log */}
      {log.length > 0 && (
        <div className="card animate-in-delay-2">
          <h3 className="section-title text-sm mb-3 flex items-center gap-2">
            <Clock size={15} className="text-[var(--text-muted)]" />
            Последни 3 дена
          </h3>
          <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
            {log.map((entry, i) => {
              const dateStr = new Date(entry.date).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' });
              const prevDate = i > 0 ? new Date(log[i-1].date).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
              const showDateHeader = dateStr !== prevDate;
              const isPurchase = entry.reason === 'purchase';
              return (
                <div key={`${entry.reason}-${entry.food_type}-${entry.date}-${i}`}>
                  {showDateHeader && (
                    <div className={`flex items-center gap-2 ${i > 0 ? 'mt-3 pt-3 border-t border-[var(--border)]' : ''} mb-1.5`}>
                      <Calendar size={11} className="text-[var(--text-muted)]" />
                      <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{dateStr}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-[var(--r-sm)] hover:bg-[var(--bg)] transition-colors duration-150">
                    <div className="flex items-center gap-2 min-w-0">
                      {isPurchase ? (
                        <ArrowUp size={13} className="text-[var(--success)] flex-shrink-0" />
                      ) : (
                        <ArrowDown size={13} className="text-[var(--danger)] flex-shrink-0" />
                      )}
                      <span className="text-[var(--text-secondary)] truncate">{entry.food_type}</span>
                      {isPurchase && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-[var(--success)] font-medium">набавка</span>
                      )}
                    </div>
                    <span className={`font-bold flex-shrink-0 ${isPurchase ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {isPurchase ? '+' : '-'}{Math.abs(parseFloat(entry.change_kg)).toFixed(2)} kg
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
