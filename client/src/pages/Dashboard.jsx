import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { PARAMETER_LABELS } from '../lib/constants';
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  Package, Sunrise, Sun, Moon, ClipboardList,
  Timer, Fish,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

/* ── Alert label helpers ── */
const CHECKLIST_ALARM_MESSAGES = {
  bio_filter_foam: { message: 'Пена во био филтерот', isDanger: true },
  bio_filter_level: { message: 'Ниво вода во БИО филтер' },
  mechanical_filter: { message: 'Механички филтер' },
  circulation_pump: { message: 'Циркулациона пумпа' },
  thermo_pump: { message: 'Термо пумпа' },
  aeration: { message: 'Аерација не е стабилна' },
  sieve_filter: { message: 'Сито филтер не е исчистен' },
  normal_swimming: { message: 'Абнормално пливање' },
  no_injuries: { message: 'Повреди кај рибите' },
  no_infection: { message: 'Црвенило / инфекција' },
  normal_appetite: { message: 'Абнормален апетит' },
  no_dead: { message: 'Угинати риби', isDanger: true },
};

function getAlertInfo(alert) {
  const checklist = CHECKLIST_ALARM_MESSAGES[alert.parameter_name];
  if (checklist) return { message: checklist.message, isDanger: checklist.isDanger || false };
  const paramInfo = PARAMETER_LABELS[alert.parameter_name];
  const label = paramInfo ? paramInfo.label : alert.parameter_name;
  const unit = paramInfo ? paramInfo.unit : '';
  return {
    message: `${label}: ${alert.value}${unit} (${alert.min_norm ?? '-'} – ${alert.max_norm ?? '-'}${unit})`,
    isDanger: false,
  };
}

/* ── Macedonian helpers ── */
const MK_MONTHS = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

function formatDateShortMK(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()].substring(0, 3)}`;
}

/* ── Custom tooltip for chart ── */
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--sh-card)',
    }}>
      <p style={{ fontWeight: 700, fontFamily: 'Sora, sans-serif', color: 'var(--text-primary)' }}>
        {d.name}
      </p>
      <p style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
        {d.qty.toFixed(2)} kg
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [todayRecord, setTodayRecord] = useState(null);
  const [mealsStatus, setMealsStatus] = useState(null);
  const [stockProjection, setStockProjection] = useState(null);
  const [poolMeasurements, setPoolMeasurements] = useState([]);
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
      api.getStockProjection().then(d => setStockProjection(d)).catch(() => setStockProjection(null)),
      api.getPoolMeasurements().then(d => setPoolMeasurements(d.measurements || [])).catch(() => {}),
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

  const todayFormatted = new Date().toLocaleDateString('mk-MK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const statusItems = [
    { key: 'checklist', label: 'Чеклиста', icon: <ClipboardList size={14} />, done: !!todayRecord, link: '/checklist' },
    { key: 'breakfast', label: 'Појадок', icon: <Sunrise size={14} />, done: mealsStatus?.breakfast?.filled, link: '/meal/breakfast' },
    { key: 'lunch', label: 'Ручек', icon: <Sun size={14} />, done: mealsStatus?.lunch?.filled, link: '/meal/lunch' },
    { key: 'dinner', label: 'Вечера', icon: <Moon size={14} />, done: mealsStatus?.dinner?.filled, link: '/meal/dinner' },
  ];

  const doneCount = statusItems.filter(s => s.done).length;

  const chartData = inventory
    .filter(i => parseFloat(i.quantity_kg) > 0)
    .map(i => ({
      name: i.food_type.replace(/\s*\(.*\)/, ''),
      qty: parseFloat(i.quantity_kg),
      full: i.food_type,
      isLow: parseFloat(i.quantity_kg) <= 5,
      isWarn: parseFloat(i.quantity_kg) <= 15,
    }));

  const proj = stockProjection?.projections || {};

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* ── Greeting ── */}
      <div className="animate-in">
        <h1 className="page-title">Здраво, {user?.full_name?.split(' ')[0]}</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5 capitalize">{todayFormatted}</p>
      </div>

      {/* ── Daily Progress ── */}
      <div className="card !p-4 animate-in-delay-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[var(--text-secondary)]"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            Денешен прогрес
          </p>
          <span className={`text-xs font-bold ${doneCount === 4 ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}
            style={{ fontFamily: 'Sora, sans-serif' }}>
            {doneCount}/4
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-[var(--border)] mb-4 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${(doneCount / 4) * 100}%`,
              background: doneCount === 4
                ? 'var(--success)'
                : 'linear-gradient(90deg, var(--primary), var(--primary-hover))',
            }}
          />
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between">
          {statusItems.map(item => (
            <Link key={item.key} to={item.link} className="flex items-center gap-2 group">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all group-hover:scale-110 ${
                item.done
                  ? 'bg-[var(--success)] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border)]'
              }`}>
                {item.done ? <CheckCircle size={14} /> : item.icon}
              </div>
              <span className={`text-[11px] font-medium hidden min-[400px]:inline ${
                item.done ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'
              }`}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Active Alarms ── */}
      {alerts.length > 0 && (
        <div className="animate-in-delay-2 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <AlertTriangle size={15} className="text-[var(--danger)]" />
              Аларми
            </h2>
            <span className="pill pill-danger">{alerts.length}</span>
          </div>

          <div className="space-y-1.5">
            {visibleAlerts.map(alert => {
              const info = getAlertInfo(alert);
              return (
                <div key={alert.id}
                  className="bg-[var(--surface)] rounded-[var(--r-sm)] border border-[var(--border)] px-4 py-3 flex items-center gap-3"
                  style={{ borderLeft: `3px solid ${info.isDanger ? 'var(--danger)' : 'var(--warning)'}` }}>
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
              <ChevronDown size={14} /> Уште {alerts.length - 5}
            </button>
          )}
        </div>
      )}

      {/* ── Pool Overview ── */}
      {poolMeasurements.length > 0 && (
        <div className={alerts.length > 0 ? 'animate-in-delay-3' : 'animate-in-delay-2'}>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <Fish size={15} className="text-[var(--primary)]" />
              Базени
            </h2>
            <Link to="/ai-calculator" className="text-[11px] text-[var(--primary)] font-medium hover:underline flex items-center gap-1">
              AI препорака <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {poolMeasurements.map(pool => {
              const avgW = parseFloat(pool.avg_weight_gr) || 0;
              const count = parseInt(pool.fish_count) || 0;
              const biomassKg = count > 0 && avgW > 0 ? (count * avgW / 1000) : 0;
              return (
                <div key={pool.pool_number} className="card !p-3 text-center">
                  <p className="text-[10px] font-bold text-[var(--primary)] mb-1"
                    style={{ fontFamily: 'Sora, sans-serif' }}>
                    Б{pool.pool_number}
                  </p>
                  <p className="text-base font-bold text-[var(--text-primary)]"
                    style={{ fontFamily: 'Sora, sans-serif' }}>
                    {count}
                  </p>
                  <p className="text-[9px] text-[var(--text-muted)]">{avgW > 0 ? `${avgW}g` : '—'}</p>
                  {biomassKg > 0 && (
                    <p className="text-[9px] text-[var(--text-secondary)] font-medium mt-0.5">
                      {biomassKg.toFixed(0)} kg
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Food Inventory ── */}
      {inventory.length > 0 && (
        <div className={alerts.length > 0 ? 'animate-in-delay-4' : 'animate-in-delay-3'}>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <Package size={15} className="text-[var(--primary)]" />
              Залихи
            </h2>
            {isAdmin && (
              <Link to="/admin/inventory" className="text-[11px] text-[var(--primary)] font-medium hover:underline">
                Управувај
              </Link>
            )}
          </div>

          {chartData.length > 0 && (
            <div className="card !p-4 mb-3">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit=" kg" />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--primary-muted)', radius: 6 }} />
                  <Bar dataKey="qty" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.isLow ? '#ef4444' : entry.isWarn ? '#f59e0b' : '#2563eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card !p-4 space-y-3">
            {inventory.map(item => {
              const qty = parseFloat(item.quantity_kg);
              const p = proj[item.food_type];
              const daysLeft = p?.daysLeft;
              const endDate = p?.endDate;
              const isLow = qty <= 5;
              const isWarn = qty <= 15 && !isLow;

              return (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                        {item.food_type}
                      </span>
                      <span className={`text-xs font-bold ${
                        isLow ? 'text-[var(--danger)]' : isWarn ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'
                      }`}>
                        {qty.toFixed(1)} kg
                      </span>
                    </div>
                  </div>
                  {daysLeft != null && daysLeft >= 0 && (
                    <span className={`text-[10px] font-semibold whitespace-nowrap flex items-center gap-0.5 ${
                      daysLeft <= 7 ? 'text-[var(--danger)]'
                      : daysLeft <= 21 ? 'text-[var(--warning)]'
                      : 'text-[var(--success)]'
                    }`}>
                      <Timer size={9} />
                      {daysLeft <= 0
                        ? 'Завршена!'
                        : endDate
                          ? `${formatDateShortMK(endDate)}`
                          : `${daysLeft}+ д`
                      }
                    </span>
                  )}
                </div>
              );
            })}

            {inventory.some(i => parseFloat(i.quantity_kg) <= 5) && (
              <p className="text-[11px] text-[var(--danger)] font-medium flex items-center gap-1.5 pt-1 border-t border-[var(--border)]">
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
