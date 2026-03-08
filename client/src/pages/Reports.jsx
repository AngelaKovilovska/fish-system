import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { POOL_NUMBERS } from '../lib/constants';
import { Mail, Eye, ChevronLeft, BarChart3, AlertTriangle, Weight, ArrowLeftRight, ShoppingCart, Package, ArrowDown, ArrowUp, Clock } from 'lucide-react';

const REPORT_TYPES = [
  { key: 'food', label: 'Потрошена храна', desc: 'Преглед на потрошувачка по тип', icon: BarChart3, needsDates: true, needsPool: true },
  { key: 'weight', label: 'Просечна тежина', desc: 'Мерења по базен и датум', icon: Weight, needsDates: false, needsPool: true, needsMeasurementDate: true },
  { key: 'alerts', label: 'Аларми', desc: 'Историја на активирани аларми', icon: AlertTriangle, needsDates: true, needsPool: false },
  { key: 'sorting', label: 'Сортирање', desc: 'Евиденција на сортирања', icon: ArrowLeftRight, needsDates: true, needsPool: false },
  { key: 'purchases', label: 'Набавки на храна', desc: 'Кога и колку храна е купена', icon: ShoppingCart, needsDates: true, needsPool: false },
  { key: 'inventory', label: 'Залихи на храна', desc: 'Тековни залихи и последни промени', icon: Package },
];

const PARAM_LABELS = {
  temperature: 'Температура', ph: 'pH', dissolved_oxygen: 'DO (кислород)',
  nitrates: 'Нитрати (NO3)', nitrites: 'Нитрити (NO2)', hardness: 'TH (тврдина)',
  tds: 'TDS', bio_filter_foam: 'Пена во Био филтер',
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

export default function Reports() {
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
                <th className="text-right">Потрошено (kg)</th>
                <th className="text-right">Преостанато (kg)</th>
              </tr></thead>
              <tbody>
                {(previewData.data || []).map((d, i) => (
                  <tr key={i}>
                    <td>{d.food_type || 'Непознат'}</td>
                    <td className="text-right font-semibold">{(parseFloat(d.total_gr) / 1000).toFixed(2)}</td>
                    <td className="text-right">
                      {d.remaining_kg != null ? (
                        <span className={`font-bold ${parseFloat(d.remaining_kg) <= 5 ? 'text-[var(--danger)]' : parseFloat(d.remaining_kg) <= 15 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                          {parseFloat(d.remaining_kg).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">–</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(previewData.data || []).length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">Нема податоци.</td></tr>
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
      return (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border)]">
            <table className="table-modern">
              <thead><tr>
                <th>Датум</th><th>Параметар</th>
                <th className="text-right">Вредност</th>
                <th className="text-right">Мин</th><th className="text-right">Макс</th>
              </tr></thead>
              <tbody>
                {(previewData.data || []).map((d, i) => (
                  <tr key={i}>
                    <td>{fmtDate(d.date)}</td>
                    <td>{PARAM_LABELS[d.parameter_name] || d.parameter_name}</td>
                    <td className="text-right text-[var(--danger)] font-bold">{d.value}</td>
                    <td className="text-right">{d.min_norm ?? '–'}</td>
                    <td className="text-right">{d.max_norm ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="info-box font-semibold text-sm">
            Вкупно аларми: {previewData.total}
          </div>
        </div>
      );
    }

    if (activeReport === 'sorting') {
      return (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border)]">
            <table className="table-modern">
              <thead><tr>
                <th>Бр.</th><th>Датум на сортирање</th>
              </tr></thead>
              <tbody>
                {(previewData.dates || []).map((d, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{i + 1}</td><td>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="info-box font-semibold text-sm">
            Вкупно сортирања: {previewData.total}
          </div>
        </div>
      );
    }

    if (activeReport === 'purchases') {
      return (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Период: {from} — {to}
          </p>
          <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border)]">
            <table className="table-modern">
              <thead><tr>
                <th>Датум</th><th>Тип храна</th>
                <th className="text-right">Количина (kg)</th>
                <th>Внесено од</th>
              </tr></thead>
              <tbody>
                {(previewData.data || []).map((d, i) => (
                  <tr key={i}>
                    <td>{fmtDate(d.purchased_at || d.created_at)}</td>
                    <td>{d.food_type}</td>
                    <td className="text-right font-semibold text-[var(--success)]">{parseFloat(d.change_kg).toFixed(2)}</td>
                    <td className="text-[var(--text-muted)]">{d.created_by_name || '–'}</td>
                  </tr>
                ))}
                {(previewData.data || []).length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-[var(--text-muted)]">Нема набавки во овој период.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="info-box font-semibold text-sm">
            Вкупно набавки: {previewData.total} | Вкупно количина: {previewData.totalKg} kg
          </div>
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
                  <th className="text-right">Залиха (kg)</th>
                  <th className="text-right">Последно ажурирано</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map(item => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.food_type}</td>
                    <td className="text-right">
                      <span className={`font-bold ${parseFloat(item.quantity_kg) <= 5 ? 'text-[var(--danger)]' : parseFloat(item.quantity_kg) <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                        {parseFloat(item.quantity_kg).toFixed(1)}
                      </span>
                    </td>
                    <td className="text-right text-[var(--text-muted)]">
                      {fmtDate(item.updated_at)}
                    </td>
                  </tr>
                ))}
                {inventory.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">Нема залихи.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <div className="lg:hidden space-y-2">
            {inventory.map(item => (
              <div key={item.id} className="flex justify-between items-center text-xs p-2.5 rounded-[var(--r-sm)] bg-[var(--bg)]">
                <span className="font-medium text-[var(--text-secondary)]">{item.food_type}</span>
                <span className={`font-bold ${parseFloat(item.quantity_kg) <= 5 ? 'text-[var(--danger)]' : parseFloat(item.quantity_kg) <= 15 ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                  {parseFloat(item.quantity_kg).toFixed(1)} kg
                </span>
              </div>
            ))}
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
        {isInventory && renderInventory()}

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
          <div className="card animate-in space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title">{report.label}</h2>
              <button onClick={handleBackFromPreview} className="btn-ghost text-sm">
                <ChevronLeft size={16} /> Филтри
              </button>
            </div>

            {renderPreview()}

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

            {emailSent && <div className="alert-success text-xs">Извештајот е испратен на вашиот email.</div>}
            {error && <div className="alert-danger text-xs">{error}</div>}
          </div>
        )}
      </div>
    );
  }

  // ═══════ CARDS LIST VIEW (no report selected) ═══════
  return (
    <div className="max-w-[900px] mx-auto">
      <h1 className="page-title mb-4 animate-in">Извештаи</h1>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
        {REPORT_TYPES.map((r, i) => {
          const Icon = r.icon;
          return (
            <button key={r.key} onClick={() => handleSelectReport(r.key)}
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
