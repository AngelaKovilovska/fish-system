import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { PARAMETER_LABELS } from '../lib/constants';
import { formatDateMK , productStockWarnings } from '../lib/utils';
import { AlertTriangle, CheckCircle, ClipboardList, ChevronDown, ChevronRight, UtensilsCrossed, Sunrise, Sun, Moon, Brain, Fish, Thermometer, ArrowRight, Timer, Archive, Package } from 'lucide-react';

/* ── Alert label helpers (reused from before) ── */
const CHECKLIST_ALARM_MESSAGES = {
  bio_filter_foam: { message: 'Детектирана пена во био филтерот', isDanger: true },
  bio_filter_level: { message: 'Ниво на вода во БИО филтер не е до обележаното ниво' },
  mechanical_filter: { message: 'Механички филтер не работи нормално' },
  circulation_pump: { message: 'Циркулациона пумпа не работи нормално' },
  thermo_pump: { message: 'Термо пумпа не работи нормално' },
  aeration: { message: 'Аерација не е стабилна' },
  sieve_filter: { message: 'Сито филтер не е исчистен' },
  normal_swimming: { message: 'Абнормално пливање на рибите' },
  no_infection: { message: 'Детектирано црвенило / инфекција' },
  normal_appetite: { message: 'Абнормален апетит кај рибите' },
};

function getAlertInfo(alert) {
  const checklist = CHECKLIST_ALARM_MESSAGES[alert.parameter_name];
  if (checklist) return { message: checklist.message, isDanger: checklist.isDanger || false };
  const paramInfo = PARAMETER_LABELS[alert.parameter_name];
  const label = paramInfo ? paramInfo.label : alert.parameter_name;
  const unit = paramInfo ? paramInfo.unit : '';
  return {
    message: `${label}: ${alert.value}${unit} (норма: ${alert.min_norm ?? '-'} – ${alert.max_norm ?? '-'}${unit})`,
    isDanger: false,
  };
}


export default function Dashboard() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [todayRecord, setTodayRecord] = useState(null); // null=loading, false=none, object=exists
  const [mealsStatus, setMealsStatus] = useState(null);
  const [aiRec, setAiRec] = useState(null);
  const [productInv, setProductInv] = useState([]);
  const [foodInv, setFoodInv] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  useEffect(() => {
    // Compute today's date once at mount time — stable for the entire effect
    const today = new Date().toISOString().split('T')[0];

    Promise.all([
      api.getAlerts({ acknowledged: 'false' }).then(d => setAlerts(d.alerts)).catch(() => setAlerts([])),
      api.getRecords({ from: today, to: today, limit: 1 })
        .then(d => setTodayRecord(d.records.length > 0 ? d.records[0] : false))
        .catch(() => setTodayRecord(false)),
      api.getMealsStatus(today).then(d => setMealsStatus(d.status)).catch(() => setMealsStatus({})),
      api.getAIRecommendations().then(d => setAiRec(d)).catch(() => setAiRec(null)),
      api.getProductInventory().then(d => setProductInv(d.inventory || [])).catch(() => setProductInv([])),
      api.getFoodInventory().then(d => setFoodInv(d.inventory || [])).catch(() => setFoodInv([])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAcknowledge = async (alertId) => {
    try {
      await api.acknowledgeAlert(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch { /* alert stays visible — user can retry */ }
  };

  const handleAcknowledgeAll = async () => {
    try {
      await api.acknowledgeAllAlerts();
      setAlerts([]);
    } catch { /* alerts stay visible — user can retry */ }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 5);
  const todayFormatted = formatDateMK(new Date());

  return (
    <div className="space-y-6">

      {/* ── Greeting + Date ── */}
      <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between gap-1 animate-in">
        <div>
          <h1 className="page-title">Здраво, {user?.full_name?.split(' ')[0]}</h1>
          <p className="text-sm text-(--text-secondary) mt-0.5">Контролен панел</p>
        </div>
        <p className="text-sm text-(--text-secondary) min-[400px]:mt-1 min-[400px]:text-right flex-shrink-0"
          style={{ fontFamily: 'Sora, sans-serif' }}>
          {todayFormatted}
        </p>
      </div>

      {/* ── Today's Checklist Status ── */}
      <div className="animate-in-delay-1">
        {todayRecord === false ? (
          /* Not filled yet */
          <div className="card !p-0 overflow-hidden"
            style={{ borderLeft: '4px solid var(--warning)' }}>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <ClipboardList size={20} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-(--text-primary)"
                    style={{ fontFamily: 'Sora, sans-serif' }}>
                    Денешна чеклиста
                  </p>
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-0.5">
                    Чеклистата за денес не е пополнета
                  </p>
                </div>
              </div>
              <Link to="/checklist"
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-(--r-sm) text-sm font-semibold text-white transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))',
                  boxShadow: '0 2px 10px rgba(37,99,235,0.2)',
                  fontFamily: 'Sora, sans-serif',
                }}>
                Пополни ја
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        ) : todayRecord ? (
          /* Filled */
          <div className="card !p-0 overflow-hidden"
            style={{ borderLeft: '4px solid var(--success)' }}>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.1)' }}>
                  <CheckCircle size={20} className="text-(--success)" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-(--text-primary)"
                    style={{ fontFamily: 'Sora, sans-serif' }}>
                    Денешна чеклиста
                  </p>
                  <p className="text-[12px] text-green-600 dark:text-green-400 mt-0.5">
                    Пополнета
                    {todayRecord.checked_by_name && (
                      <span className="text-(--text-muted)">
                        {' '}— {todayRecord.checked_by_name}
                        {todayRecord.created_at && (
                          <>, {new Date(todayRecord.created_at).toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' })}</>
                        )}
                      </span>
                    )}
                  </p>
                </div>
                <Link to={`/checklist/${todayRecord.id}`}
                  className="btn-ghost text-(--primary) flex-shrink-0 text-xs">
                  Прегледај
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Meals (Breakfast, Lunch, Dinner) ── */}
      {mealsStatus && (
        <div className="animate-in-delay-1">
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <UtensilsCrossed size={15} className="text-(--primary)" />
              Оброци
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'breakfast', label: 'Појадок', icon: <Sunrise size={18} className="text-amber-500" /> },
              { key: 'lunch', label: 'Ручек', icon: <Sun size={18} className="text-yellow-500" /> },
              { key: 'dinner', label: 'Вечера', icon: <Moon size={18} className="text-indigo-400" /> },
            ].map(meal => {
              const status = mealsStatus[meal.key];
              const filled = status?.filled;
              return (
                <Link
                  key={meal.key}
                  to={`/meal/${meal.key}`}
                  className="card !p-0 overflow-hidden transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
                  style={{ borderLeft: `3px solid ${filled ? 'var(--success)' : 'var(--warning)'}` }}
                >
                  <div className="px-3 py-3 text-center">
                    <div className="flex justify-center mb-1">{meal.icon}</div>
                    <p className="text-[11px] font-semibold text-(--text-primary)"
                      style={{ fontFamily: 'Sora, sans-serif' }}>
                      {meal.label}
                    </p>
                    {filled ? (
                      <>
                        <p className="text-[10px] text-(--success) mt-0.5 font-medium truncate">
                          ✓ {status.fed_by_name?.split(' ')[0] || 'Готово'}
                        </p>
                        {status.created_at && (
                          <p className="text-[9px] text-(--text-muted) mt-0.5 flex items-center justify-center gap-0.5">
                            <Timer size={8} />
                            {new Date(status.created_at).toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[10px] text-amber-500 mt-0.5 font-medium">
                        Не е внесен
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Inventory Summary ── */}
      {(() => {
        const totalProductKg = productInv.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);
        const totalFoodKg = foodInv.reduce((s, i) => s + parseFloat(i.quantity_kg || 0), 0);
        const lowFoodItems = foodInv.filter(i => parseFloat(i.quantity_kg || 0) < 50);
        const productWarnings = productStockWarnings(productInv);
        const productDanger = productWarnings.some(w => w.level === 'danger');
        return (
          <div className="animate-in-delay-2">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="section-title flex items-center gap-2 text-sm">
                <Archive size={15} className="text-purple-500" />
                Залихи
              </h2>
              <Link to="/inventory/products" className="text-[11px] text-(--primary) font-medium hover:underline flex items-center gap-1">
                Детали <ArrowRight size={10} />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Product inventory */}
              <Link to="/inventory/products" className="card !p-3.5 transition-all hover:scale-[1.01] active:scale-[0.99]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: productWarnings.length > 0 ? (productDanger ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)') : 'rgba(139,92,246,0.1)' }}>
                    <Archive size={15} className={productWarnings.length > 0 ? (productDanger ? 'text-red-500' : 'text-amber-500') : 'text-purple-500'} />
                  </div>
                  <p className="text-[10px] text-(--text-muted) uppercase tracking-wider font-semibold"
                    style={{ fontFamily: 'Sora, sans-serif' }}>Производи</p>
                </div>
                <p className="text-lg font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {totalProductKg.toFixed(0)} <span className="text-xs font-normal text-(--text-muted)">кг</span>
                </p>
                {productWarnings.length > 0 ? (
                  <p className={`text-[10px] mt-0.5 font-medium ${productDanger ? 'text-red-500' : 'text-amber-500'}`}>
                    ⚠ {productWarnings.length} {productWarnings.length === 1 ? 'предупредување' : 'предупредувања'}
                  </p>
                ) : (
                  <p className="text-[10px] text-(--text-secondary) mt-0.5">
                    {productInv.length} {productInv.length === 1 ? 'производ' : 'производи'}
                  </p>
                )}
              </Link>

              {/* Food inventory */}
              <Link to="/admin/inventory" className="card !p-3.5 transition-all hover:scale-[1.01] active:scale-[0.99]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: lowFoodItems.length > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)' }}>
                    <Package size={15} className={lowFoodItems.length > 0 ? 'text-amber-500' : 'text-green-500'} />
                  </div>
                  <p className="text-[10px] text-(--text-muted) uppercase tracking-wider font-semibold"
                    style={{ fontFamily: 'Sora, sans-serif' }}>Храна</p>
                </div>
                <p className="text-lg font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {totalFoodKg.toFixed(0)} <span className="text-xs font-normal text-(--text-muted)">кг</span>
                </p>
                {lowFoodItems.length > 0 ? (
                  <p className="text-[10px] text-amber-500 mt-0.5 font-medium">
                    ⚠ {lowFoodItems.length} со ниска залиха
                  </p>
                ) : (
                  <p className="text-[10px] text-(--text-secondary) mt-0.5">
                    {foodInv.length} {foodInv.length === 1 ? 'тип' : 'типови'} храна
                  </p>
                )}
              </Link>
            </div>

          </div>
        );
      })()}

      {/* ── Active Alarms ── */}
      {alerts.length > 0 && (
        <div className="animate-in-delay-2 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h2 className="section-title flex items-center gap-2 text-sm">
                <AlertTriangle size={15} className="text-(--danger)" />
                Активни аларми
              </h2>
              <span className="pill pill-danger">{alerts.length}</span>
            </div>
            <button onClick={handleAcknowledgeAll}
              className="text-[11px] font-medium text-(--primary) hover:underline flex items-center gap-1">
              <CheckCircle size={12} />
              Обележи ги сите
            </button>
          </div>

          <div className="space-y-1.5">
            {visibleAlerts.map(alert => {
              const info = getAlertInfo(alert);
              return (
                <div key={alert.id}
                  className="bg-(--surface) rounded-(--r-sm) border border-(--border) px-4 py-3 flex items-center gap-3"
                  style={{
                    borderLeft: `3px solid ${info.isDanger ? 'var(--danger)' : 'var(--warning)'}`,
                  }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--text-primary) truncate">{info.message}</p>
                    <p className="text-[11px] text-(--text-muted) mt-0.5">
                      {new Date(alert.date).toLocaleDateString('mk-MK', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <button onClick={() => handleAcknowledge(alert.id)}
                    className="btn-ghost text-(--success) flex-shrink-0 text-xs"
                    title="Потврди" aria-label="Потврди">
                    <CheckCircle size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          {alerts.length > 5 && !showAllAlerts && (
            <button onClick={() => setShowAllAlerts(true)}
              className="btn-ghost text-xs w-full justify-center mt-1">
              <ChevronDown size={14} />
              Прикажи уште {alerts.length - 5}
            </button>
          )}
        </div>
      )}

      {/* ── AI Feeding Recommendations ── */}
      {aiRec && aiRec.summary && aiRec.summary.poolCount > 0 && (
        <div className={alerts.length > 0 ? 'animate-in-delay-3' : 'animate-in-delay-2'}>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <Brain size={15} className="text-purple-500" />
              Препорака за храна
            </h2>
            <Link to="/ai-calculator" className="text-[11px] text-(--primary) font-medium hover:underline flex items-center gap-1">
              Калкулатор <ArrowRight size={10} />
            </Link>
          </div>

          {/* Summary card */}
          <div className="card !p-4 mb-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[11px] text-(--text-muted) uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>Дневна потреба (сите базени)</p>
                <p className="text-xl font-bold text-(--text-primary) mt-0.5" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {aiRec.summary.totalDailyFoodKg.toFixed(2)} <span className="text-sm font-normal text-(--text-muted)">kg</span>
                </p>
              </div>
              {aiRec.summary.temperature != null && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--primary-muted)">
                  <Thermometer size={14} className="text-(--primary)" />
                  <span className="text-sm font-semibold text-(--primary)">{aiRec.summary.temperature}°C</span>
                </div>
              )}
            </div>

            {/* Per food type breakdown */}
            {aiRec.summary.foodTypeNeeds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aiRec.summary.foodTypeNeeds.map((ft, i) => (
                  <span key={i} className="text-[10px] px-2 py-1 rounded-full font-semibold"
                    style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--text-primary)' }}>
                    {ft.foodType}: {ft.dailyNeedKg} kg
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Per-pool cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.values(aiRec.pools).map(poolRec => {
              if (!poolRec.hasData) {
                return (
                  <div key={poolRec.poolNumber} className="card !p-3 opacity-50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Fish size={13} className="text-(--text-muted)" />
                      <span className="text-[11px] font-bold text-(--text-muted)" style={{ fontFamily: 'Sora, sans-serif' }}>
                        Базен {poolRec.poolNumber}
                      </span>
                    </div>
                    <p className="text-[10px] text-(--text-muted)">Нема податоци</p>
                  </div>
                );
              }

              const comp = poolRec.comparison;
              const statusColor = !comp ? 'var(--text-muted)'
                : comp.status === 'optimal' ? 'var(--success)'
                : comp.status.includes('over') ? 'var(--danger)'
                : 'var(--warning)';

              return (
                <div key={poolRec.poolNumber} className="card !p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Fish size={13} className="text-(--primary)" />
                      <span className="text-[11px] font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>
                        Базен {poolRec.poolNumber}
                      </span>
                    </div>
                    {comp && (
                      <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} title={comp.message} />
                    )}
                  </div>

                  <p className="text-lg font-bold text-(--text-primary)" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {poolRec.recommendation.dailyFoodGr}<span className="text-[10px] font-normal text-(--text-muted)"> g/ден</span>
                  </p>

                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-[10px] text-(--text-secondary)">
                      {poolRec.poolData.fishCount} риби × {poolRec.poolData.avgWeight}g
                    </p>
                    <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                      {poolRec.recommendation.foodType} ({poolRec.recommendation.feedSizeMm}mm)
                    </p>
                    <p className="text-[10px] text-(--text-muted)">
                      {poolRec.recommendation.feedRatePercent}% BW · {poolRec.recommendation.mealsPerDay}×{poolRec.recommendation.perMealGr}g
                    </p>
                  </div>

                  {/* Comparison with actual */}
                  {comp && (
                    <div className="mt-2 pt-1.5 border-t border-(--border)">
                      <p className="text-[10px] font-medium" style={{ color: statusColor }}>
                        {comp.status === 'optimal' ? '✓ Оптимално' :
                         comp.differencePercent > 0 ? `↑ +${comp.differencePercent}%` : `↓ ${comp.differencePercent}%`}
                        <span className="text-(--text-muted) font-normal"> (денес: {comp.actualGr}g)</span>
                      </p>
                    </div>
                  )}

                  {/* Warnings */}
                  {poolRec.warnings?.transitionNote && (
                    <p className="text-[9px] text-amber-600 mt-1">⚠ Транзиција</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
