import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { PARAMETER_LABELS } from '../lib/constants';
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  Package, Sunrise, Sun, Moon, ClipboardList,
  Timer, Fish, TrendingUp, X,
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

/* ── SVG Pool illustration (top-down circular tank) ── */
function PoolSVG({ poolNumber, fishCount, avgWeight, hasAlarm, onClick }) {
  const size = 110;
  const cx = size / 2;
  const cy = size / 2;
  const r = 46;

  // Determine fish size category for silhouette scaling
  const fishScale = avgWeight > 500 ? 1.4 : avgWeight > 100 ? 1.0 : 0.65;
  const fishShown = Math.min(fishCount > 0 ? Math.max(3, Math.min(Math.ceil(fishCount / 80), 8)) : 0, 8);

  // Fish positions distributed in a circle inside the tank
  const fishPositions = [];
  for (let i = 0; i < fishShown; i++) {
    const angle = (i / fishShown) * Math.PI * 2 + (poolNumber * 0.5);
    const dist = 18 + (i % 3) * 8;
    fishPositions.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      rot: (angle * 180 / Math.PI) + 90 + (i % 2 === 0 ? 15 : -15),
    });
  }

  const borderColor = hasAlarm ? '#ef4444' : fishCount > 0 ? '#22c55e' : '#94a3b8';

  return (
    <button onClick={onClick} className="group focus:outline-none" style={{ WebkitTapHighlightColor: 'transparent' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        className="transition-transform duration-200 group-hover:scale-110 group-active:scale-95 drop-shadow-md">
        {/* Tank outer ring */}
        <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={borderColor} strokeWidth="3" opacity="0.6" />
        <circle cx={cx} cy={cy} r={r + 1} fill="none" stroke={borderColor} strokeWidth="1" opacity="0.3" />

        {/* Water */}
        <circle cx={cx} cy={cy} r={r} fill="url(#water-grad)" />

        {/* Water ripple rings */}
        <circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5">
          <animate attributeName="r" values={`${r * 0.3};${r * 0.8}`} dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={r * 0.4} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5">
          <animate attributeName="r" values={`${r * 0.15};${r * 0.65}`} dur="3.5s" repeatCount="indefinite" begin="1.5s" />
          <animate attributeName="opacity" values="0.25;0" dur="3.5s" repeatCount="indefinite" begin="1.5s" />
        </circle>

        {/* Fish silhouettes */}
        {fishPositions.map((fp, i) => (
          <g key={i} transform={`translate(${fp.x}, ${fp.y}) rotate(${fp.rot}) scale(${fishScale})`}>
            {/* Catfish body */}
            <path d="M0,-7 C3,-6 5,-3 6,0 C5,3 3,6 0,7 C-1,5 -2,3 -3,0 C-2,-3 -1,-5 0,-7Z"
              fill="rgba(30,30,30,0.35)" />
            {/* Tail */}
            <path d="M-3,0 C-5,-3 -7,-4 -8,-3 C-7,-1 -7,1 -8,3 C-7,4 -5,3 -3,0Z"
              fill="rgba(30,30,30,0.25)" />
            {/* Whiskers */}
            <line x1="5" y1="-1" x2="9" y2="-3" stroke="rgba(30,30,30,0.2)" strokeWidth="0.5" />
            <line x1="5" y1="1" x2="9" y2="3" stroke="rgba(30,30,30,0.2)" strokeWidth="0.5" />
            {/* Subtle swim animation */}
            <animateTransform attributeName="transform"
              type="translate" values="0,0;1,0.5;0,0;-1,-0.5;0,0"
              dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite"
              additive="sum" />
          </g>
        ))}

        {/* Tank rim highlight */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />

        {/* Pool number */}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
          fill="white" fontSize="20" fontWeight="800" fontFamily="Sora, sans-serif"
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
          {poolNumber}
        </text>

        {/* Gradient definitions */}
        <defs>
          <radialGradient id="water-grad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#0284c7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0c4a6e" stopOpacity="0.95" />
          </radialGradient>
        </defs>
      </svg>
      {/* Pool label below */}
      <p className="text-[11px] font-bold text-center mt-1 text-[var(--text-secondary)]"
        style={{ fontFamily: 'Sora, sans-serif' }}>
        Базен {poolNumber}
      </p>
    </button>
  );
}

/* ── African catfish SVG illustration ── */
function CatfishIllustration({ sizeCategory }) {
  // sizeCategory: 'small' | 'medium' | 'large'
  const colors = {
    small: { body: '#6b7280', belly: '#d1d5db', spots: '#4b5563' },
    medium: { body: '#4a4a4a', belly: '#9ca3af', spots: '#374151' },
    large: { body: '#292929', belly: '#6b7280', spots: '#1f2937' },
  };
  const c = colors[sizeCategory] || colors.medium;
  const scale = sizeCategory === 'small' ? 0.6 : sizeCategory === 'large' ? 1.0 : 0.8;

  return (
    <svg viewBox="0 0 300 140" style={{ width: '100%', maxWidth: 280, height: 'auto' }}>
      <g transform={`translate(150,70) scale(${scale})`}>
        {/* Body */}
        <ellipse cx="0" cy="0" rx="110" ry="35" fill={c.body} />
        {/* Belly - lighter underside */}
        <ellipse cx="0" cy="8" rx="95" ry="22" fill={c.belly} opacity="0.4" />
        {/* Head - wider flat catfish head */}
        <ellipse cx="85" cy="-2" rx="38" ry="28" fill={c.body} />
        {/* Eyes */}
        <circle cx="100" cy="-12" r="5" fill="#fbbf24" />
        <circle cx="100" cy="-12" r="2.5" fill="#1a1a1a" />
        <circle cx="100" cy="8" r="5" fill="#fbbf24" />
        <circle cx="100" cy="8" r="2.5" fill="#1a1a1a" />
        {/* Barbels/Whiskers (characteristic of catfish) */}
        <path d="M115,-8 Q140,-25 155,-20" fill="none" stroke={c.body} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M115,-4 Q145,-15 160,-8" fill="none" stroke={c.body} strokeWidth="2" strokeLinecap="round" />
        <path d="M115,4 Q145,18 160,12" fill="none" stroke={c.body} strokeWidth="2" strokeLinecap="round" />
        <path d="M115,8 Q140,28 155,24" fill="none" stroke={c.body} strokeWidth="2.5" strokeLinecap="round" />
        {/* Dorsal fin */}
        <path d="M-20,-32 Q0,-55 40,-35 L30,-32 Q10,-45 -10,-32Z" fill={c.spots} opacity="0.7" />
        {/* Tail fin */}
        <path d="M-105,-5 Q-130,-30 -145,-25 Q-135,-5 -135,5 Q-130,30 -145,25 Q-130,30 -105,5Z"
          fill={c.spots} opacity="0.8" />
        {/* Pectoral fin */}
        <path d="M60,20 Q70,40 55,45 Q50,35 60,20Z" fill={c.spots} opacity="0.5" />
        {/* Spots/texture */}
        <circle cx="-30" cy="-10" r="4" fill={c.spots} opacity="0.3" />
        <circle cx="10" cy="-15" r="3" fill={c.spots} opacity="0.25" />
        <circle cx="40" cy="-8" r="5" fill={c.spots} opacity="0.2" />
        <circle cx="-50" cy="5" r="3.5" fill={c.spots} opacity="0.2" />
        <circle cx="-70" cy="-5" r="3" fill={c.spots} opacity="0.15" />
        {/* Mouth line */}
        <path d="M118,-2 Q122,0 118,2" fill="none" stroke={c.spots} strokeWidth="1.5" />
        {/* Shine on body */}
        <ellipse cx="20" cy="-18" rx="40" ry="5" fill="white" opacity="0.08" />
      </g>
      {/* Size label */}
      <text x="150" y="135" textAnchor="middle" fontSize="11" fill="var(--text-muted)"
        fontFamily="Sora, sans-serif" fontWeight="600">
        {sizeCategory === 'small' ? 'Мала (< 100g)' : sizeCategory === 'large' ? 'Голема (> 500g)' : 'Средна (100–500g)'}
      </text>
    </svg>
  );
}

/* ── Pool detail modal (bottom sheet style) ── */
function PoolDetailModal({ pool, onClose }) {
  if (!pool) return null;

  const avgW = parseFloat(pool.avg_weight_gr) || 0;
  const count = parseInt(pool.fish_count) || 0;
  const biomassKg = count > 0 && avgW > 0 ? (count * avgW / 1000) : 0;
  const sizeCategory = avgW > 500 ? 'large' : avgW > 100 ? 'medium' : 'small';
  const measuredDate = pool.measured_at
    ? new Date(pool.measured_at).toLocaleDateString('mk-MK', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Bottom sheet */}
      <div
        className="relative w-full max-w-lg bg-[var(--surface)] rounded-t-[24px] shadow-2xl"
        style={{ maxHeight: '55vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
        </div>

        {/* Close button */}
        <button onClick={onClose}
          className="absolute top-3 right-4 btn-ghost p-1.5 rounded-full">
          <X size={18} />
        </button>

        <div className="px-6 pb-6">
          {/* Header */}
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            Базен {pool.pool_number}
          </h2>

          {/* Catfish illustration */}
          <div className="flex justify-center mb-5 py-3 rounded-2xl"
            style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(2,132,199,0.06))' }}>
            <CatfishIllustration sizeCategory={sizeCategory} />
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3"
              style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold tracking-wider"
                style={{ fontFamily: 'Sora, sans-serif' }}>Број на риби</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>
                {count > 0 ? count.toLocaleString() : '—'}
              </p>
            </div>
            <div className="rounded-xl p-3"
              style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold tracking-wider"
                style={{ fontFamily: 'Sora, sans-serif' }}>Просечна тежина</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>
                {avgW > 0 ? `${avgW}g` : '—'}
              </p>
            </div>
            <div className="rounded-xl p-3"
              style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold tracking-wider"
                style={{ fontFamily: 'Sora, sans-serif' }}>Биомаса</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>
                {biomassKg > 0 ? `${biomassKg.toFixed(1)} kg` : '—'}
              </p>
            </div>
            <div className="rounded-xl p-3"
              style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold tracking-wider"
                style={{ fontFamily: 'Sora, sans-serif' }}>Последно мерење</p>
              <p className="text-sm font-bold text-[var(--text-primary)] mt-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>
                {measuredDate}
              </p>
            </div>
          </div>
        </div>
      </div>
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
  const [selectedPool, setSelectedPool] = useState(null);

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

  // Status items for the progress bar
  const statusItems = [
    {
      key: 'checklist', label: 'Чеклиста',
      icon: <ClipboardList size={16} />,
      done: !!todayRecord,
      link: '/checklist',
    },
    {
      key: 'breakfast', label: 'Појадок',
      icon: <Sunrise size={16} />,
      done: mealsStatus?.breakfast?.filled,
      link: '/meal/breakfast',
    },
    {
      key: 'lunch', label: 'Ручек',
      icon: <Sun size={16} />,
      done: mealsStatus?.lunch?.filled,
      link: '/meal/lunch',
    },
    {
      key: 'dinner', label: 'Вечера',
      icon: <Moon size={16} />,
      done: mealsStatus?.dinner?.filled,
      link: '/meal/dinner',
    },
  ];

  const doneCount = statusItems.filter(s => s.done).length;

  // Inventory chart data
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
        <div className="w-full h-2 rounded-full bg-[var(--border)] mb-4 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${(doneCount / 4) * 100}%`,
              background: doneCount === 4
                ? 'var(--success)'
                : 'linear-gradient(90deg, var(--primary), var(--primary-hover))',
            }}
          />
        </div>

        {/* Status items */}
        <div className="grid grid-cols-4 gap-2">
          {statusItems.map(item => (
            <Link key={item.key} to={item.link}
              className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all hover:scale-[1.03] active:scale-[0.97] ${
                item.done
                  ? 'bg-green-50 dark:bg-green-500/10'
                  : 'bg-[var(--bg-secondary)] hover:bg-[var(--primary-muted)]'
              }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                item.done
                  ? 'bg-[var(--success)] text-white'
                  : 'bg-[var(--border)] text-[var(--text-muted)]'
              }`}>
                {item.done ? <CheckCircle size={16} /> : item.icon}
              </div>
              <span className={`text-[10px] font-semibold ${
                item.done ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'
              }`} style={{ fontFamily: 'Sora, sans-serif' }}>
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
              Уште {alerts.length - 5}
            </button>
          )}
        </div>
      )}

      {/* ── Pool Overview — SVG pool illustrations ── */}
      {poolMeasurements.length > 0 && (
        <div className={alerts.length > 0 ? 'animate-in-delay-3' : 'animate-in-delay-2'}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2 text-sm">
              <Fish size={15} className="text-[var(--primary)]" />
              Базени
            </h2>
            <Link to="/ai-calculator" className="text-[11px] text-[var(--primary)] font-medium hover:underline flex items-center gap-1">
              AI препорака <ChevronRight size={12} />
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-5">
            {poolMeasurements.map(pool => {
              const hasAlarm = alerts.some(a => a.pool_number === pool.pool_number);
              return (
                <PoolSVG
                  key={pool.pool_number}
                  poolNumber={pool.pool_number}
                  fishCount={parseInt(pool.fish_count) || 0}
                  avgWeight={parseFloat(pool.avg_weight_gr) || 0}
                  hasAlarm={hasAlarm}
                  onClick={() => setSelectedPool(pool)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Pool detail modal */}
      {selectedPool && (
        <PoolDetailModal pool={selectedPool} onClose={() => setSelectedPool(null)} />
      )}

      {/* ── Food Inventory — Chart + Bars ── */}
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

          {/* Bar chart */}
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

          {/* Stock projection list */}
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
