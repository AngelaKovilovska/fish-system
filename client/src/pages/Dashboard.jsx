import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { PARAMETER_LABELS } from '../lib/constants';
import { AlertTriangle, CheckCircle, ClipboardList, ChevronDown, ChevronRight, Package, UtensilsCrossed, Sunrise, Sun, Moon } from 'lucide-react';

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
  no_injuries: { message: 'Детектирани повреди кај рибите' },
  no_infection: { message: 'Детектирано црвенило / инфекција' },
  normal_appetite: { message: 'Абнормален апетит кај рибите' },
  no_dead: { message: 'Детектирани угинати риби', isDanger: true },
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

/* ── Macedonian month names ── */
const MK_MONTHS = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

function formatDateMK(date) {
  return `${date.getDate()} ${MK_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [todayRecord, setTodayRecord] = useState(null); // null=loading, false=none, object=exists
  const [mealsStatus, setMealsStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    Promise.all([
      api.getAlerts({ acknowledged: 'false' }).then(d => setAlerts(d.alerts)),
      api.getFoodInventory().then(d => setInventory(d.inventory)).catch(() => {}),
      api.getRecords({ from: today, to: today, limit: 1 })
        .then(d => setTodayRecord(d.records.length > 0 ? d.records[0] : false))
        .catch(() => setTodayRecord(false)),
      api.getMealsStatus(today).then(d => setMealsStatus(d.status)).catch(() => setMealsStatus({})),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAcknowledge = async (alertId) => {
    try {
      await api.acknowledgeAlert(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) { console.error(err); }
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

  const isAdmin = user?.role === 'admin';
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 5);
  const todayFormatted = formatDateMK(new Date());

  // Dynamic bar max — use the largest inventory value (minimum 50 kg for scale)
  const barMax = Math.max(50, ...inventory.map(i => parseFloat(i.quantity_kg) || 0));

  return (
    <div className="space-y-6">

      {/* ── Greeting + Date ── */}
      <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between gap-1 animate-in">
        <div>
          <h1 className="page-title">Здраво, {user?.full_name?.split(' ')[0]}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Контролен панел</p>
        </div>
        <p className="text-sm text-[var(--text-secondary)] min-[400px]:mt-1 min-[400px]:text-right flex-shrink-0"
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
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 flex-shrink-0">
                  <ClipboardList size={20} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--text-primary)]"
                    style={{ fontFamily: 'Sora, sans-serif' }}>
                    Денешна чеклиста
                  </p>
                  <p className="text-[12px] text-amber-600 mt-0.5">
                    Чеклистата за денес не е пополнета
                  </p>
                </div>
              </div>
              <Link to="/checklist"
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--r-sm)] text-sm font-semibold text-white transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
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
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-50 flex-shrink-0">
                  <CheckCircle size={20} className="text-[var(--success)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--text-primary)]"
                    style={{ fontFamily: 'Sora, sans-serif' }}>
                    Денешна чеклиста
                  </p>
                  <p className="text-[12px] text-green-600 mt-0.5">
                    Пополнета
                    {todayRecord.checked_by_name && (
                      <span className="text-[var(--text-muted)]">
                        {' '}— {todayRecord.checked_by_name}
                        {todayRecord.created_at && (
                          <>, {new Date(todayRecord.created_at).toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' })}</>
                        )}
                      </span>
                    )}
                  </p>
                </div>
                <Link to={`/checklist/${todayRecord.id}`}
                  className="btn-ghost text-[var(--primary)] flex-shrink-0 text-xs">
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
              <UtensilsCrossed size={15} className="text-[var(--primary)]" />
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
                    <p className="text-[11px] font-semibold text-[var(--text-primary)]"
                      style={{ fontFamily: 'Sora, sans-serif' }}>
                      {meal.label}
                    </p>
                    {filled ? (
                      <p className="text-[10px] text-[var(--success)] mt-0.5 font-medium truncate">
                        ✓ {status.fed_by_name?.split(' ')[0] || 'Готово'}
                      </p>
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

      {/* ── Active Alarms ── */}
      {alerts.length > 0 && (
        <div className="animate-in-delay-2 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <AlertTriangle size={15} className="text-[var(--danger)]" />
              Активни аларми
            </h2>
            <span className="pill pill-danger">{alerts.length}</span>
          </div>

          <div className="space-y-1.5">
            {visibleAlerts.map(alert => {
              const info = getAlertInfo(alert);
              return (
                <div key={alert.id}
                  className="bg-white rounded-[var(--r-sm)] border border-[var(--border)] px-4 py-3 flex items-center gap-3"
                  style={{
                    borderLeft: `3px solid ${info.isDanger ? 'var(--danger)' : 'var(--warning)'}`,
                  }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{info.message}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {new Date(alert.date).toLocaleDateString('mk-MK', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <button onClick={() => handleAcknowledge(alert.id)}
                    className="btn-ghost text-[var(--success)] hover:bg-green-50 flex-shrink-0 text-xs"
                    title="Потврди">
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

      {/* ── Food Inventory — Visual Bars ── */}
      {inventory.length > 0 && (
        <div className={alerts.length > 0 ? 'animate-in-delay-3' : 'animate-in-delay-2'}>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <Package size={15} className="text-[var(--primary)]" />
              Залихи на храна
            </h2>
            {isAdmin && (
              <Link to="/admin/inventory" className="text-[11px] text-[var(--primary)] font-medium hover:underline">
                Управувај
              </Link>
            )}
          </div>

          <div className="card !p-4 space-y-3">
            {inventory.map(item => {
              const qty = parseFloat(item.quantity_kg);
              const pct = Math.min((qty / barMax) * 100, 100);
              const isLow = qty <= 5;
              const isWarn = qty <= 15 && !isLow;
              const barColor = isLow
                ? 'var(--danger)'
                : isWarn
                  ? 'var(--warning)'
                  : 'var(--success)';
              const barBg = isLow
                ? 'rgba(239,68,68,0.08)'
                : isWarn
                  ? 'rgba(245,158,11,0.08)'
                  : 'rgba(34,197,94,0.08)';

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
                      style={{
                        width: `${pct}%`,
                        background: barColor,
                        minWidth: qty > 0 ? 4 : 0,
                      }}
                    />
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
        </div>
      )}
    </div>
  );
}
