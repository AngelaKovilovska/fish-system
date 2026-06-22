import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { POOL_NUMBERS } from '../lib/constants';
import { Mail, Eye, ChevronLeft, ChevronDown, BarChart3, AlertTriangle, Weight, ArrowLeftRight, ShoppingCart, Package, ArrowDown, ArrowUp, Clock, Printer, Calendar } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';

const REPORT_TYPES = [
  { key: 'daily', label: 'Дневни извештаи', desc: 'Календар со преглед на сите записи по ден', icon: Calendar, isLink: true, linkTo: '/history' },
  { key: 'food', label: 'Потрошена храна', desc: 'Преглед на потрошувачка по тип', icon: BarChart3, needsDates: true, needsPool: true },
  { key: 'weight', label: 'Просечна тежина', desc: 'Мерења по базен и датум', icon: Weight, needsDates: false, needsPool: true, needsMeasurementDate: true },
  { key: 'alerts', label: 'Аларми', desc: 'Историја на активирани аларми', icon: AlertTriangle, needsDates: true, needsPool: false },
  { key: 'sorting', label: 'Сортирање', desc: 'Евиденција на сортирања', icon: ArrowLeftRight, needsDates: true, needsPool: false },
  { key: 'purchases', label: 'Набавки на храна', desc: 'Кога и колку храна е купена', icon: ShoppingCart, needsDates: true, needsPool: false },
  { key: 'inventory', label: 'Залихи на храна', desc: 'Тековни залихи и последни промени', icon: Package },
];

// Chart colors — clean, consistent palette
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];

// Custom tooltip for charts
function ChartTooltipContent({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)', padding: '8px 12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px',
    }}>
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: 'Sora, sans-serif' }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color || 'var(--text-secondary)', margin: '2px 0' }}>
          {entry.name}: <strong>{typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}{suffix}</strong>
        </p>
      ))}
    </div>
  );
}

const PARAM_LABELS = {
  temperature: 'Температура', ph: 'pH', total_alkalinity: 'Total Alkalinity',
  hardness: 'Total Hardness', nitrates: 'Нитрати (NO₃⁻)', nitrites: 'Нитрити (NO₂⁻)',
  total_chlorine: 'Total Chlorine', ammonium: 'Амониум (NH₄⁺/NH₃)', bio_filter_foam: 'Пена во Био филтер',
  bio_filter_level: 'Био филтер ниво', mechanical_filter: 'Механички филтер',
  circulation_pump: 'Циркулациона пумпа', thermo_pump: 'Термо пумпа',
  aeration: 'Аерација', sieve_filter: 'Сито филтер',
  normal_swimming: 'Нормално пливање', no_injuries: 'Нема повреди',
  no_infection: 'Нема инфекција', normal_appetite: 'Нормален апетит',
  no_dead: 'Нема угинати',
};

// Format date as DD.MM.YYYY
function fmtDate(dateVal) {
  const d = new Date(dateVal);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// Parse DD.MM.YYYY string back to Date (inverse of fmtDate)
function parseDDMMYYYY(str) {
  if (!str || typeof str !== 'string') return new Date(str);
  const parts = str.split('.');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return new Date(str);
}

export default function Reports() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const defaultFrom = `${currentYear}-01-01`;
  const defaultTo = `${currentYear}-12-31`;

  const [activeReport, setActiveReport] = useState(null);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [poolNumber, setPoolNumber] = useState('');
  const [measurementDate, setMeasurementDate] = useState('');
  const [measurementDates, setMeasurementDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  // Accordion state for alert groups
  const [expandedAlertGroups, setExpandedAlertGroups] = useState(new Set());
  // Sorting table "show all" toggle
  const [showAllSortings, setShowAllSortings] = useState(false);
  // Accordion state for purchase groups
  const [expandedPurchaseGroups, setExpandedPurchaseGroups] = useState(new Set());

  // Food inventory state (lazy loaded)
  const [inventory, setInventory] = useState([]);
  const [inventoryLog, setInventoryLog] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  useEffect(() => {
    if (activeReport === 'weight') {
      api.getMeasurementDates(poolNumber || null)
        .then(res => setMeasurementDates(res.dates || []))
        .catch(() => setMeasurementDates([]));
    }
  }, [activeReport, poolNumber]);

  // Load food inventory lazily when inventory report is selected
  useEffect(() => {
    if (activeReport !== 'inventory') return;
    setInventoryLoading(true);
    Promise.all([
      api.getFoodInventory(),
      api.getFoodInventoryLog(20),
    ])
      .then(([invData, logData]) => {
        setInventory(invData.inventory);
        setInventoryLog(logData.log);
      })
      .catch(console.error)
      .finally(() => setInventoryLoading(false));
  }, [activeReport]);

  const handleGenerate = async () => {
    setError(''); setPreviewData(null); setEmailSent(false); setLoading(true);
    try {
      let result; const pool = poolNumber || null;
      switch (activeReport) {
        case 'food': result = await api.previewFoodReport(from, to, pool); break;
        case 'weight': result = await api.previewAvgWeightReport(pool, measurementDate || null); break;
        case 'alerts': result = await api.previewAlertsReport(from, to); break;
        case 'sorting': result = await api.previewSortingReport(from, to); break;
        case 'purchases': result = await api.previewPurchasesReport(from, to); break;
      }
      setPreviewData(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleSendEmail = async () => {
    setError(''); setSending(true); setEmailSent(false);
    try {
      const pool = poolNumber || null;
      switch (activeReport) {
        case 'food': await api.sendFoodReport(from, to, pool); break;
        case 'weight': await api.sendAvgWeightReport(pool, measurementDate || null); break;
        case 'alerts': await api.sendAlertsReport(from, to); break;
        case 'sorting': await api.sendSortingReport(from, to); break;
        case 'purchases': await api.sendPurchasesReport(from, to); break;
      }
      setEmailSent(true);
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  };

  const handleBackFromPreview = () => { setPreviewData(null); setEmailSent(false); setError(''); };
  const handleBackToList = () => {
    setActiveReport(null); setPreviewData(null); setError('');
    setPoolNumber(''); setMeasurementDate(''); setEmailSent(false);
    setFrom(defaultFrom); setTo(defaultTo);
    setTimeout(() => window.scrollTo(0, 0), 50);
  };
  const handleSelectReport = (key) => {
    setActiveReport(key); setPreviewData(null); setError('');
    setPoolNumber(''); setMeasurementDate(''); setEmailSent(false);
    setFrom(defaultFrom); setTo(defaultTo);
    setTimeout(() => window.scrollTo(0, 0), 50);
  };

  const report = REPORT_TYPES.find(r => r.key === activeReport);

  const handlePrint = () => {
    if (!previewData && activeReport !== 'inventory') return;
    const title = report?.label || 'Извештај';
    let subtitle = '';
    if (report?.needsDates) subtitle = `Период: ${fmtDate(from)} — ${fmtDate(to)}`;
    if (poolNumber) subtitle += ` | Базен ${poolNumber}`;
    if (activeReport === 'weight' && measurementDate) subtitle = `Датум на мерење: ${fmtDate(measurementDate)}${poolNumber ? ` | Базен ${poolNumber}` : ''}`;

    let tableHTML = '';

    if (activeReport === 'food') {
      const rows = (previewData.data || []).map(d =>
        `<tr><td>${d.food_type || 'Непознат'}</td><td class="r">${d.purchased_kg != null ? parseFloat(d.purchased_kg).toFixed(2) : '–'}</td><td class="r">${(parseFloat(d.total_gr) / 1000).toFixed(2)}</td><td class="r">${d.remaining_kg != null ? parseFloat(d.remaining_kg).toFixed(2) : '–'}</td></tr>`
      ).join('');
      tableHTML = `<table><thead><tr><th>Тип храна</th><th class="r">Набавено (kg)</th><th class="r">Потрошено (kg)</th><th class="r">Преостанато (kg)</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="total">Вкупно потрошена храна: ${previewData.totalKg} kg</p>`;
    }

    if (activeReport === 'weight') {
      const rows = (previewData.data || []).map(d =>
        `<tr><td>${fmtDate(d.measured_at)}</td><td>Базен ${d.pool_number}</td><td class="r">${d.fish_count}</td><td class="r">${d.avg_weight_gr}</td></tr>`
      ).join('');
      tableHTML = `<table><thead><tr><th>Датум</th><th>Базен</th><th class="r">Број риби</th><th class="r">Тежина (gr)</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    if (activeReport === 'alerts') {
      const rows = (previewData.data || []).map(d =>
        `<tr><td>${fmtDate(d.date)}</td><td>${PARAM_LABELS[d.parameter_name] || d.parameter_name}</td><td class="r danger">${d.value}</td><td class="r">${d.min_norm ?? '–'}</td><td class="r">${d.max_norm ?? '–'}</td></tr>`
      ).join('');
      tableHTML = `<table><thead><tr><th>Датум</th><th>Параметар</th><th class="r">Вредност</th><th class="r">Мин</th><th class="r">Макс</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="total">Вкупно аларми: ${previewData.total}</p>`;
    }

    if (activeReport === 'sorting') {
      const rows = (previewData.dates || []).map((d, i) =>
        `<tr><td class="r">${i + 1}</td><td>${d}</td></tr>`
      ).join('');
      tableHTML = `<table><thead><tr><th>Бр.</th><th>Датум на сортирање</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="total">Вкупно сортирања: ${previewData.total}</p>`;
    }

    if (activeReport === 'purchases') {
      const rows = (previewData.data || []).map(d =>
        `<tr><td>${fmtDate(d.purchased_at || d.created_at)}</td><td>${d.food_type}</td><td class="r">${parseFloat(d.change_kg).toFixed(2)}</td><td>${d.created_by_name || '–'}</td></tr>`
      ).join('');
      tableHTML = `<table><thead><tr><th>Датум</th><th>Тип храна</th><th class="r">Количина (kg)</th><th>Внесено од</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="total">Вкупно набавки: ${previewData.total} | Вкупно количина: ${previewData.totalKg} kg</p>`;
    }

    if (activeReport === 'inventory') {
      const invRows = inventory.map(item =>
        `<tr><td>${item.food_type}</td><td class="r" style="font-weight:700;${parseFloat(item.quantity_kg) <= 5 ? 'color:#dc2626' : parseFloat(item.quantity_kg) <= 15 ? 'color:#d97706' : ''}">${parseFloat(item.quantity_kg).toFixed(2)}</td><td class="r">${fmtDate(item.updated_at)}</td></tr>`
      ).join('');
      const logRows = inventoryLog.slice(0, 30).map(entry =>
        `<tr><td>${entry.food_type}</td><td class="r" style="font-weight:700;${entry.reason === 'purchase' ? 'color:#16a34a' : 'color:#dc2626'}">${entry.reason === 'purchase' ? '+' : ''}${parseFloat(entry.change_kg).toFixed(2)} kg</td><td>${entry.reason === 'purchase' ? 'Набавка' : 'Потрошувачка'}</td><td class="r">${fmtDate(entry.purchased_at || entry.created_at)}</td></tr>`
      ).join('');
      tableHTML = `<h3>Тековни залихи</h3>
        <table><thead><tr><th>Тип храна</th><th class="r">Залиха (kg)</th><th class="r">Ажурирано</th></tr></thead><tbody>${invRows}</tbody></table>
        ${inventoryLog.length > 0 ? `<h3 style="margin-top:24px">Последни промени</h3>
        <table><thead><tr><th>Тип храна</th><th class="r">Промена</th><th>Тип</th><th class="r">Датум</th></tr></thead><tbody>${logRows}</tbody></table>` : ''}`;
      subtitle = `Генерирано: ${fmtDate(new Date())}`;
    }

    const now = new Date();
    const printDate = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — ФАМАКОМ</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;padding:24px;font-size:12px;max-width:900px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a8a;padding-bottom:12px;margin-bottom:20px}
.brand{font-size:18px;font-weight:800;color:#1a1a8a;letter-spacing:0.5px}
.brand-sub{font-size:10px;color:#666;margin-top:2px}
.print-date{font-size:10px;color:#888;text-align:right}
h2{font-size:16px;color:#1a1a2e;margin-bottom:4px}
h3{font-size:13px;color:#1a1a8a;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
.subtitle{font-size:11px;color:#666;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11px}
th{background:#f0f4ff;color:#1a1a8a;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:0.3px;padding:8px 10px;border-bottom:2px solid #c7d2fe;text-align:left}
td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
tr:nth-child(even){background:#fafbff}
.r{text-align:right}
.danger{color:#dc2626;font-weight:700}
.total{background:#f0f4ff;padding:10px 14px;border-radius:6px;font-weight:700;color:#1a1a8a;margin-top:8px;font-size:12px}
.footer{margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#aaa}
@media print{body{padding:12px}@page{margin:15mm 10mm;size:A4}}
</style></head><body>
<div class="header">
  <div><div class="brand">ФАМАКОМ АКВАКУЛТУРА</div><div class="brand-sub">Систем за управување со рибник</div></div>
  <div class="print-date">Испечатено: ${printDate}</div>
</div>
<h2>${title}</h2>
${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
${tableHTML}
<div class="footer">ФАМАКОМ АКВАКУЛТУРА — Автоматски генериран извештај</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  /* ── Chart visualizations for each report type ── */
  const renderChart = () => {
    if (!previewData) return null;

    const gridStyle = { stroke: 'var(--border)', strokeOpacity: 0.5 };
    const axisStyle = { fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'Sora, sans-serif' };
    const axisSmall = { ...axisStyle, fontSize: 11 };

    // ── Food consumption bar chart ──
    if (activeReport === 'food' && (previewData.data || []).length > 0) {
      const chartData = previewData.data.map(d => ({
        name: d.food_type || 'Непознат',
        Набавено: d.purchased_kg != null ? parseFloat(parseFloat(d.purchased_kg).toFixed(2)) : 0,
        Потрошено: parseFloat((parseFloat(d.total_gr) / 1000).toFixed(2)),
        Преостанато: d.remaining_kg != null ? parseFloat(parseFloat(d.remaining_kg).toFixed(2)) : 0,
      }));

      return (
        <div className="card mb-4 animate-in">
          <h3 className="section-title text-sm mb-4">Потрошувачка по тип храна (kg)</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 55 + 50)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 15, left: 5, bottom: 0 }} barGap={2} barCategoryGap="25%">
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.3} />
              <XAxis type="number" tick={axisSmall} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={90} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltipContent suffix=" kg" />} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Sora, sans-serif', paddingTop: 8 }} />
              <Bar dataKey="Набавено" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Потрошено" fill="#ef4444" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Преостанато" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // ── Weight line/bar chart ──
    if (activeReport === 'weight' && (previewData.data || []).length > 0) {
      const data = previewData.data;
      const uniqueDates = [...new Set(data.map(d => d.measured_at))];
      const uniquePools = [...new Set(data.map(d => d.pool_number))].sort((a, b) => a - b);

      if (uniqueDates.length > 1) {
        const chartData = uniqueDates.map(date => {
          const point = { date: fmtDate(date) };
          for (const pool of uniquePools) {
            const match = data.find(d => d.measured_at === date && d.pool_number === pool);
            if (match) point[`Б${pool}`] = parseFloat(match.avg_weight_gr);
          }
          return point;
        });

        return (
          <div className="card mb-4 animate-in">
            <h3 className="section-title text-sm mb-4">Крива на раст (gr)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                <CartesianGrid {...gridStyle} strokeDasharray="4 4" />
                <XAxis dataKey="date" tick={axisSmall} axisLine={false} tickLine={false} />
                <YAxis tick={axisSmall} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent suffix=" gr" />} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Sora, sans-serif', paddingTop: 8 }} />
                {uniquePools.map((pool, i) => (
                  <Line key={pool} type="monotone" dataKey={`Б${pool}`}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }}
                    connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      } else {
        const chartData = data.map(d => ({
          name: `Б${d.pool_number}`,
          Тежина: parseFloat(d.avg_weight_gr),
          Риби: parseInt(d.fish_count),
        }));

        return (
          <div className="card mb-4 animate-in">
            <h3 className="section-title text-sm mb-4">Тежина по базен (gr) — {fmtDate(data[0].measured_at)}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} {...gridStyle} />
                <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisSmall} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent suffix=" gr" />} />
                <Bar dataKey="Тежина" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      }
    }

    // ── Alerts bar chart ──
    if (activeReport === 'alerts' && (previewData.data || []).length > 0) {
      const dateMap = {};
      for (const d of previewData.data) {
        const dateStr = fmtDate(d.date);
        if (!dateMap[dateStr]) dateMap[dateStr] = 0;
        dateMap[dateStr]++;
      }
      const chartData = Object.entries(dateMap).map(([date, count]) => ({ date, Аларми: count }));

      const paramMap = {};
      for (const d of previewData.data) {
        const name = PARAM_LABELS[d.parameter_name] || d.parameter_name;
        if (!paramMap[name]) paramMap[name] = 0;
        paramMap[name]++;
      }
      const paramData = Object.entries(paramMap)
        .map(([name, count]) => ({ name, Број: count }))
        .sort((a, b) => b.Број - a.Број);

      return (
        <div className="card mb-4 animate-in space-y-5">
          <div>
            <h3 className="section-title text-sm mb-4">Аларми по ден</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }} barCategoryGap="25%">
                <CartesianGrid vertical={false} {...gridStyle} />
                <XAxis dataKey="date" tick={axisSmall} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisSmall} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent />} />
                <Bar dataKey="Аларми" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {paramData.length > 1 && (
            <div>
              <h3 className="section-title text-sm mb-4">Најчести параметри со аларм</h3>
              <ResponsiveContainer width="100%" height={Math.max(140, paramData.length * 32 + 30)}>
                <BarChart data={paramData} layout="vertical" margin={{ top: 0, right: 15, left: 5, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.3} />
                  <XAxis type="number" allowDecimals={false} tick={axisSmall} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={axisSmall} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="Број" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      );
    }

    // ── Purchases: summary cards + conditional chart ──
    if (activeReport === 'purchases' && (previewData.data || []).length > 0) {
      const data = previewData.data;
      const totalKg = parseFloat(previewData.totalKg || data.reduce((s, d) => s + parseFloat(d.change_kg), 0)).toFixed(1);
      const totalCount = previewData.total || data.length;
      const lastDate = fmtDate(data[data.length - 1]?.purchased_at || data[data.length - 1]?.created_at);

      const typeMap = {};
      for (const d of data) {
        if (!typeMap[d.food_type]) typeMap[d.food_type] = 0;
        typeMap[d.food_type] += parseFloat(d.change_kg);
      }
      const chartData = Object.entries(typeMap)
        .map(([name, total]) => ({ name, Количина: parseFloat(total.toFixed(2)) }))
        .sort((a, b) => b.Количина - a.Количина);

      return (
        <div className="card mb-4 animate-in space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Преглед на набавки на храна во избраниот период по тип и количина.
          </p>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[var(--r-md)] bg-[var(--surface)] p-2.5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>Вкупно</div>
              <div className="text-sm font-bold text-[var(--success)]">{totalKg} kg</div>
            </div>
            <div className="rounded-[var(--r-md)] bg-[var(--surface)] p-2.5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>Набавки</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">{totalCount}</div>
            </div>
            <div className="rounded-[var(--r-md)] bg-[var(--surface)] p-2.5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>Последна</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">{lastDate}</div>
            </div>
          </div>

          {/* Bar chart — only when 2+ food types */}
          {chartData.length >= 2 && (
            <div>
              <h3 className="section-title text-sm mb-3">Набавки по тип храна (kg)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} {...gridStyle} />
                  <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisSmall} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltipContent suffix=" kg" />} />
                  <Bar dataKey="Количина" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      );
    }

    // ── Sorting: summary cards + conditional chart ──
    if (activeReport === 'sorting' && (previewData.dates || []).length > 0) {
      const dates = previewData.dates;
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        const curr = parseDDMMYYYY(dates[i]);
        const prev = parseDDMMYYYY(dates[i - 1]);
        if (!isNaN(curr) && !isNaN(prev)) {
          intervals.push(Math.round((curr - prev) / (1000 * 60 * 60 * 24)));
        }
      }
      const avgInterval = intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : null;
      const lastDate = dates[dates.length - 1];

      // Chart data for line chart (only used when 5+ sortings)
      const chartData = dates.slice(1).map((d, i) => ({
        date: d,
        Денови: intervals[i] ?? 0,
      }));

      return (
        <div className="card mb-4 animate-in space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Преглед на сите сортирања во избраниот период со просечен интервал помеѓу нив.
          </p>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[var(--r-md)] bg-[var(--surface)] p-2.5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>Последно</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">{lastDate}</div>
            </div>
            <div className="rounded-[var(--r-md)] bg-[var(--surface)] p-2.5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>Просечно</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {avgInterval != null ? `${avgInterval} дена` : '–'}
              </div>
            </div>
            <div className="rounded-[var(--r-md)] bg-[var(--surface)] p-2.5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1"
                style={{ fontFamily: 'Sora, sans-serif' }}>Вкупно</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">{dates.length}</div>
            </div>
          </div>

          {/* Line chart — only when 5+ sortings */}
          {chartData.length >= 4 && (
            <div>
              <h3 className="section-title text-sm mb-3">Тренд на интервали</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                  <CartesianGrid vertical={false} {...gridStyle} />
                  <XAxis dataKey="date" tick={axisSmall} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={axisSmall} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltipContent suffix=" дена" />} />
                  <Line type="monotone" dataKey="Денови" stroke="#8b5cf6" strokeWidth={2}
                    dot={{ fill: '#8b5cf6', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const renderPreview = () => {
    if (!previewData) return null;

    if (activeReport === 'food') {
      return (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Период: {from} — {to} {poolNumber ? ` | Базен ${poolNumber}` : ' | Сите базени'}
          </p>
          <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border)]">
            <table className="table-modern">
              <thead><tr>
                <th>Тип храна</th>
                <th className="text-right">Набавено (kg)</th>
                <th className="text-right">Потрошено (kg)</th>
                <th className="text-right">Преостанато (kg)</th>
              </tr></thead>
              <tbody>
                {(previewData.data || []).map((d, i) => (
                  <tr key={i}>
                    <td>{d.food_type || 'Непознат'}</td>
                    <td className="text-right">
                      {d.purchased_kg != null ? (
                        <span className="font-semibold">{parseFloat(d.purchased_kg).toFixed(2)}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">–</span>
                      )}
                    </td>
                    <td className="text-right font-semibold">{(parseFloat(d.total_gr) / 1000).toFixed(2)}</td>
                    <td className="text-right">
                      {d.remaining_kg != null ? (
                        <span className={`font-bold ${parseFloat(d.remaining_kg) <= 5 ? 'text-[var(--danger)]' : parseFloat(d.remaining_kg) <= 15 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                          {parseFloat(d.remaining_kg).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">–</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(previewData.data || []).length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-[var(--text-muted)]">Нема податоци.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="info-box font-semibold text-sm">
            Вкупно потрошена храна: {previewData.totalKg} kg
          </div>
        </div>
      );
    }

    if (activeReport === 'weight') {
      return (
        <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border)]">
          <table className="table-modern">
            <thead><tr>
              <th>Датум</th><th>Базен</th>
              <th className="text-right">Број риби</th><th className="text-right">Тежина (gr)</th>
            </tr></thead>
            <tbody>
              {(previewData.data || []).map((d, i) => (
                <tr key={i}>
                  <td>{fmtDate(d.measured_at)}</td>
                  <td>Базен {d.pool_number}</td>
                  <td className="text-right font-semibold">{d.fish_count}</td>
                  <td className="text-right font-semibold">{d.avg_weight_gr}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(previewData.data || []).length === 0 && <p className="text-[var(--text-muted)] text-center py-4 text-sm">Нема податоци.</p>}
        </div>
      );
    }

    if (activeReport === 'alerts') {
      // Group alerts by parameter
      const grouped = {};
      for (const d of (previewData.data || [])) {
        const key = d.parameter_name;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(d);
      }
      // Sort groups by count descending
      const sortedGroups = Object.entries(grouped)
        .sort((a, b) => b[1].length - a[1].length);

      const toggleGroup = (key) => {
        setExpandedAlertGroups(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      };

      return (
        <div className="space-y-3">
          <div className="space-y-2">
            {sortedGroups.map(([paramKey, alerts]) => {
              const isOpen = expandedAlertGroups.has(paramKey);
              const label = PARAM_LABELS[paramKey] || paramKey;
              return (
                <div key={paramKey} className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                  {/* Accordion header */}
                  <button
                    onClick={() => toggleGroup(paramKey)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle size={14} className="text-[var(--danger)] flex-shrink-0" />
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate"
                        style={{ fontFamily: 'Sora, sans-serif' }}>
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="pill pill-danger text-[10px]">{alerts.length}</span>
                      <ChevronDown
                        size={16}
                        className={`text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>
                  {/* Accordion body */}
                  {isOpen && (
                    <div className="border-t border-[var(--border)]">
                      <table className="table-modern">
                        <thead><tr>
                          <th>Датум</th>
                          <th className="text-right">Вредност</th>
                          <th className="text-right">Мин</th>
                          <th className="text-right">Макс</th>
                        </tr></thead>
                        <tbody>
                          {alerts.map((d, i) => (
                            <tr key={i}>
                              <td>{fmtDate(d.date)}</td>
                              <td className="text-right text-[var(--danger)] font-bold">{d.value}</td>
                              <td className="text-right">{d.min_norm ?? '–'}</td>
                              <td className="text-right">{d.max_norm ?? '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="info-box font-semibold text-sm">
            Вкупно аларми: {previewData.total} ({sortedGroups.length} параметри)
          </div>
        </div>
      );
    }

    if (activeReport === 'sorting') {
      const dates = previewData.dates || [];
      // Build rows with day gaps, newest first
      const rows = dates.map((d, i) => {
        let gap = null;
        if (i > 0) {
          const curr = parseDDMMYYYY(d);
          const prev = parseDDMMYYYY(dates[i - 1]);
          if (!isNaN(curr) && !isNaN(prev)) {
            gap = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
          }
        }
        return { date: d, index: i + 1, gap };
      }).reverse();

      const VISIBLE_COUNT = 10;
      const displayRows = rows.length > VISIBLE_COUNT && !showAllSortings
        ? rows.slice(0, VISIBLE_COUNT)
        : rows;
      const hasMore = rows.length > VISIBLE_COUNT && !showAllSortings;

      return (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border)]">
            <table className="table-modern">
              <thead><tr>
                <th>Бр.</th>
                <th>Датум на сортирање</th>
                <th className="text-right">Денови од претходно</th>
              </tr></thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={r.index}>
                    <td className="font-semibold">{r.index}</td>
                    <td>{r.date}</td>
                    <td className="text-right">
                      {r.gap != null ? (
                        <span className={`font-semibold ${r.gap <= 3 ? 'text-[var(--success)]' : r.gap >= 30 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                          {r.gap}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <button
              onClick={() => setShowAllSortings(true)}
              className="btn-ghost w-full text-sm py-2"
            >
              Прикажи ги сите ({rows.length - VISIBLE_COUNT} повеќе)
            </button>
          )}
        </div>
      );
    }

    if (activeReport === 'purchases') {
      const data = previewData.data || [];
      // Group by food type
      const grouped = {};
      for (const d of data) {
        const key = d.food_type;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(d);
      }
      const sortedGroups = Object.entries(grouped)
        .map(([type, items]) => ({
          type,
          items,
          totalKg: items.reduce((s, d) => s + parseFloat(d.change_kg), 0),
        }))
        .sort((a, b) => b.totalKg - a.totalKg);

      const togglePurchaseGroup = (key) => {
        setExpandedPurchaseGroups(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      };

      if (data.length === 0) {
        return (
          <div className="info-box text-sm text-[var(--text-muted)]">
            Нема набавки во овој период.
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {sortedGroups.map(({ type, items, totalKg }) => {
            const isOpen = expandedPurchaseGroups.has(type);
            return (
              <div key={type} className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                {/* Accordion header */}
                <button
                  onClick={() => togglePurchaseGroup(type)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Package size={14} className="text-[var(--success)] flex-shrink-0" />
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate"
                      style={{ fontFamily: 'Sora, sans-serif' }}>
                      {type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold text-[var(--success)]">
                      {totalKg.toFixed(1)} kg
                    </span>
                    <span className="pill pill-blue text-[10px]">{items.length}</span>
                    <ChevronDown
                      size={16}
                      className={`text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>
                {/* Accordion body */}
                {isOpen && (
                  <div className="border-t border-[var(--border)]">
                    <table className="table-modern">
                      <thead><tr>
                        <th>Датум</th>
                        <th className="text-right">Количина (kg)</th>
                        <th>Внесено од</th>
                      </tr></thead>
                      <tbody>
                        {items.map((d, i) => (
                          <tr key={i}>
                            <td>{fmtDate(d.purchased_at || d.created_at)}</td>
                            <td className="text-right font-semibold text-[var(--success)]">
                              {parseFloat(d.change_kg).toFixed(2)}
                            </td>
                            <td className="text-[var(--text-muted)]">{d.created_by_name || '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  /* ── Inventory detail view ── */
  const renderInventory = () => {
    if (inventoryLoading) {
      return (
        <div className="space-y-3">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-52 w-full" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Inventory stacked bar chart — purchased vs consumed vs remaining */}
        {inventory.length > 0 && (
          <div className="card animate-in">
            <h3 className="section-title text-sm mb-1">Залихи по тип храна</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">Преглед на набавено, потрошено и остаток за секој тип храна.</p>
            <ResponsiveContainer width="100%" height={Math.max(150, inventory.length * 45 + 30)}>
              <BarChart
                data={inventory.map(item => ({
                  name: item.food_type,
                  Потрошено: parseFloat(parseFloat(item.total_consumed_kg || 0).toFixed(2)),
                  Остаток: parseFloat(parseFloat(item.quantity_kg).toFixed(2)),
                }))}
                layout="vertical"
                margin={{ top: 0, right: 15, left: 5, bottom: 0 }}
                barCategoryGap="25%"
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'Sora, sans-serif' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'Sora, sans-serif' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent suffix=" kg" />} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Sora, sans-serif' }} />
                <Bar dataKey="Потрошено" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Остаток" stackId="a" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Current stock */}
        <div className="card animate-in">
          <h3 className="section-title text-sm mb-3 flex items-center gap-2">
            <Package size={15} className="text-[var(--primary)]" />
            Тековни залихи
          </h3>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Тип храна</th>
                  <th className="text-right">Набавено (kg)</th>
                  <th className="text-right">Потрошено (kg)</th>
                  <th className="text-right">Остаток (kg)</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map(item => {
                  const purchased = parseFloat(item.total_purchased_kg || 0);
                  const consumed = parseFloat(item.total_consumed_kg || 0);
                  const stock = parseFloat(item.quantity_kg);
                  return (
                    <tr key={item.id}>
                      <td className="font-medium">{item.food_type}</td>
                      <td className="text-right text-[var(--success)] font-medium">{purchased.toFixed(2)}</td>
                      <td className="text-right text-[var(--danger)] font-medium">{consumed.toFixed(2)}</td>
                      <td className="text-right">
                        <span className={`font-bold ${stock <= 5 ? 'text-[var(--danger)]' : stock <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                          {stock.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {inventory.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-[var(--text-muted)]">Нема залихи.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <div className="lg:hidden space-y-2">
            {inventory.map(item => {
              const purchased = parseFloat(item.total_purchased_kg || 0);
              const consumed = parseFloat(item.total_consumed_kg || 0);
              const stock = parseFloat(item.quantity_kg);
              return (
                <div key={item.id} className="p-2.5 rounded-[var(--r-sm)] bg-[var(--bg)]">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-medium text-[var(--text-secondary)]">{item.food_type}</span>
                    <span className={`font-bold ${stock <= 5 ? 'text-[var(--danger)]' : stock <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                      {stock.toFixed(2)} kg
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span><span className="text-[var(--success)]">+{purchased.toFixed(1)}</span>{' / '}<span className="text-[var(--danger)]">-{consumed.toFixed(1)}</span> kg</span>
                  </div>
                </div>
              );
            })}
            {inventory.length === 0 && (
              <p className="text-center text-xs text-[var(--text-muted)] py-4">Нема залихи.</p>
            )}
          </div>
        </div>

        {/* Recent changes log */}
        {inventoryLog.length > 0 && (
          <div className="card animate-in-delay-1">
            <h3 className="section-title text-sm mb-3 flex items-center gap-2">
              <Clock size={15} className="text-[var(--text-muted)]" />
              Последни промени
            </h3>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {inventoryLog.map(entry => (
                <div key={entry.id} className="flex items-center justify-between text-xs p-2 rounded-[var(--r-sm)] hover:bg-[var(--bg)] transition-colors duration-150">
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.reason === 'purchase' ? (
                      <ArrowUp size={13} className="text-[var(--success)] flex-shrink-0" />
                    ) : (
                      <ArrowDown size={13} className="text-[var(--danger)] flex-shrink-0" />
                    )}
                    <span className="text-[var(--text-secondary)] truncate">{entry.food_type}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`font-bold ${entry.reason === 'purchase' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {entry.reason === 'purchase' ? '+' : ''}{parseFloat(entry.change_kg).toFixed(2)} kg
                    </span>
                    <span className="text-[var(--text-muted)] text-[10px] w-16 text-right">
                      {fmtDate(entry.purchased_at || entry.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══════ DETAIL VIEW (any report selected) ═══════
  if (activeReport) {
    const isInventory = activeReport === 'inventory';
    const Icon = report?.icon;

    return (
      <div className="max-w-[900px] mx-auto">
        {/* Header with back button */}
        <div className="flex items-center gap-3 mb-5 animate-in">
          <button onClick={handleBackToList}
            className="btn-ghost text-sm flex-shrink-0 !px-2.5">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="icon-box"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))', color: 'white' }}>
                <Icon size={18} />
              </div>
            )}
            <h1 className="page-title !mb-0">{report?.label}</h1>
          </div>
        </div>

        {/* Inventory — show content directly */}
        {isInventory && (
          <>
            {renderInventory()}
            {!inventoryLoading && inventory.length > 0 && (
              <div className="mt-4">
                <button onClick={handlePrint} className="btn-secondary w-full py-3">
                  <Printer size={18} /> Принтај извештај
                </button>
              </div>
            )}
          </>
        )}

        {/* Standard reports — form or preview */}
        {!isInventory && !previewData && (
          <div className="card animate-in space-y-4">
            {report.needsDates && (
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Од</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-base" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>До</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-base" />
                </div>
              </div>
            )}

            {report.needsPool && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Базен</label>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => { setPoolNumber(''); setMeasurementDate(''); }}
                    className={poolNumber === '' ? 'chip-active' : 'chip-inactive'}>
                    Сите
                  </button>
                  {POOL_NUMBERS.map(num => (
                    <button key={num} type="button" onClick={() => { setPoolNumber(num); setMeasurementDate(''); }}
                      className={poolNumber === num ? 'chip-active' : 'chip-inactive'}>
                      Б{num}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {report.needsMeasurementDate && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>Датум на мерење</label>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => setMeasurementDate('')}
                    className={measurementDate === '' ? 'chip-active' : 'chip-inactive'}>
                    Сите
                  </button>
                  {measurementDates.map(date => {
                    const dateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];
                    const displayDate = fmtDate(dateStr);
                    return (
                      <button key={dateStr} type="button" onClick={() => setMeasurementDate(dateStr)}
                        className={measurementDate === dateStr ? 'chip-active' : 'chip-inactive'}>
                        {displayDate}
                      </button>
                    );
                  })}
                </div>
                {measurementDates.length === 0 && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5">Нема мерења{poolNumber ? ` за Базен ${poolNumber}` : ''}.</p>
                )}
              </div>
            )}

            <button onClick={handleGenerate} disabled={loading || (report.needsDates && (!from || !to))}
              className="btn-primary w-full py-3">
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="wave-loader"><span /><span /><span /><span /></div>
                  Се генерира...
                </span>
              ) : (
                <><Eye size={18} /> Генерирај извештај</>
              )}
            </button>

            {error && <div className="alert-danger text-xs">{error}</div>}
          </div>
        )}

        {/* Preview data */}
        {!isInventory && previewData && (
          <div className="animate-in space-y-0">
            {/* Chart visualization ABOVE the table */}
            {renderChart()}

            <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title">{report.label}</h2>
              <button onClick={handleBackFromPreview} className="btn-ghost text-sm">
                <ChevronLeft size={16} /> Филтри
              </button>
            </div>

            {renderPreview()}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={handlePrint} className="btn-secondary w-full py-3">
                <Printer size={18} /> Принтај
              </button>
              <button onClick={handleSendEmail} disabled={sending} className="btn-primary w-full py-3">
                {sending ? (
                  <span className="flex items-center gap-2">
                    <div className="wave-loader"><span /><span /><span /><span /></div>
                    Се испраќа...
                  </span>
                ) : (
                  <><Mail size={18} /> Испрати на email</>
                )}
              </button>
            </div>

            {emailSent && <div className="alert-success text-xs">Извештајот е испратен на вашиот email.</div>}
            {error && <div className="alert-danger text-xs">{error}</div>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════ CARDS LIST VIEW (no report selected) ═══════
  return (
    <div className="max-w-[900px] mx-auto">
      <div className="flex items-center gap-2 mb-4 animate-in">
        <button onClick={() => navigate('/')} className="btn-ghost p-1.5 -ml-1.5">
          <ChevronLeft size={20} />
        </button>
        <h1 className="page-title !mb-0">Извештаи</h1>
      </div>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
        {REPORT_TYPES.map((r, i) => {
          const Icon = r.icon;
          return (
            <button key={r.key} onClick={() => r.isLink ? navigate(r.linkTo) : handleSelectReport(r.key)}
              className={`card-hover text-left animate-in-delay-${Math.min(i + 1, 5)} !p-6`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="icon-box"
                  style={{
                    background: 'rgba(37,99,235,0.06)',
                    color: 'var(--primary)',
                  }}>
                  <Icon size={18} />
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: 'Sora, sans-serif' }}>
                  {r.label}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] ml-[calc(2.5rem+0.625rem)]">{r.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
