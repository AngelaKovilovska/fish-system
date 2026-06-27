import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PARAMETER_LABELS, FILTRATION_LABELS, FISH_VISUAL_LABELS, MK_MONTHS, MK_DAYS } from '../lib/constants';
import {
  AlertTriangle, Mail, Pencil, Trash2, Loader2, Check, X,
  ChevronLeft, Printer, Droplets, Filter, Fish, Warehouse,
  Utensils, Activity, Sunrise, Sun, Moon,
} from 'lucide-react';

const MEAL_LABELS = { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' };
const MEAL_ICONS = {
  breakfast: <Sunrise size={13} className="text-amber-500" />,
  lunch: <Sun size={13} className="text-yellow-500" />,
  dinner: <Moon size={13} className="text-indigo-400" />,
};

const ALERT_LABELS = {
  ...Object.fromEntries(Object.entries(PARAMETER_LABELS).map(([k, v]) => [k, v.label])),
  bio_filter_foam: 'Пена во био филтер',
  bio_filter_level: 'Ниво вода во БИО филтер',
  mechanical_filter: 'Механички филтер',
  circulation_pump: 'Циркулациона пумпа',
  thermo_pump: 'Термо пумпа',
  aeration: 'Аерација',
  sieve_filter: 'Сито филтер',
  normal_swimming: 'Нормално пливање',
  no_injuries: 'Повреди на риби',
  no_infection: 'Инфекција / црвенило',
  normal_appetite: 'Апетит на риби',
  no_dead: 'Угинати риби',
};

export default function RecordDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.getRecord(id).then(result => {
      setData(result);
      const d = new Date(result.record.date);
      const recordDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return api.getMeals(recordDate);
    }).then(mealsData => {
      setMeals(mealsData.meals || []);
    }).catch(() => setData(null)).finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Дали сте сигурни дека сакате да го избришете овој запис?')) return;
    try { await api.deleteRecord(id); navigate('/history'); }
    catch (err) { alert('Грешка при бришење: ' + err.message); }
  };

  const handleSendReport = async () => {
    setSending(true);
    try { await api.sendDailyReport(id); alert('Дневниот извештај е испратен!'); }
    catch (err) { alert('Грешка: ' + err.message); }
    finally { setSending(false); }
  };

  const handlePrintDaily = () => {
    if (!data) return;
    const { record, water_control: wc, filtration_checks: fc, fish_visual: fv, pool_feeding: pf, activities: act, alerts: al } = data;
    const _d = new Date(record.date);
    const date = `${MK_DAYS[_d.getDay()]}, ${_d.getDate()} ${MK_MONTHS[_d.getMonth()]} ${_d.getFullYear()}`;
    const now = new Date();
    const printDate = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const section = (title, content) => `<div class="section"><h3>${title}</h3>${content}</div>`;
    const row = (label, value, cls = '') => `<div class="row"><span class="lbl">${label}</span><span class="val ${cls}">${value}</span></div>`;
    const okIcon = (v) => v === true ? '✓ ОК' : v === false ? '✗ НЕ' : '–';
    const okCls = (v) => v === true ? 'ok' : v === false ? 'bad' : '';

    let html = '';
    if (al && al.length > 0) {
      const alertRows = al.map(a => {
        const label = ALERT_LABELS[a.parameter_name] || a.parameter_name;
        const unit = PARAMETER_LABELS[a.parameter_name]?.unit || '';
        return `<div class="alert-row"><strong>${label}:</strong> ${a.value}${unit ? ' ' + unit : ''}${a.min_norm != null || a.max_norm != null ? ` (норма: ${a.min_norm ?? '-'} – ${a.max_norm ?? '-'}${unit ? ' ' + unit : ''})` : ''}</div>`;
      }).join('');
      html += `<div class="alert-box"><h3>⚠ Аларми (${al.length})</h3>${alertRows}</div>`;
    }
    if (wc) {
      const rows = Object.entries(PARAMETER_LABELS).map(([key, { label, unit }]) =>
        row(`${label}${unit ? ` (${unit})` : ''}`, wc[key] ?? '–')
      ).join('');
      html += section('1. Контрола на вода', rows);
    }
    if (fc) {
      const rows = Object.entries(FILTRATION_LABELS).map(([key, label]) => {
        if (key === 'bio_filter_foam') {
          const v = fc[key];
          return row(label, v === 'yes' ? 'Има' : v === 'no' ? 'Нема' : '–', v === 'no' ? 'ok' : v === 'yes' ? 'bad' : '');
        }
        return row(label, okIcon(fc[key]), okCls(fc[key]));
      }).join('');
      html += section('2. Филтрација', rows + (fc.notes ? row('Забелешка', fc.notes) : ''));
    }
    if (fv) {
      const rows = Object.entries(FISH_VISUAL_LABELS).map(([key, label]) =>
        row(label, okIcon(fv[key]), okCls(fv[key]))
      ).join('');
      html += section('3. Визуелна контрола', rows + (fv.notes ? row('Забелешка', fv.notes) : ''));
    }
    if (pf && pf.length > 0) {
      const poolRows = pf.map(p => {
        const startCount = parseInt(p.fish_count) || 0;
        const dead = parseInt(p.dead_count) || 0;
        const sold = parseInt(p.sold_count) || 0;
        const actual = startCount - dead - sold;
        const avgW = parseFloat(p.avg_weight_gr) || 0;
        const totalKg = actual > 0 && avgW > 0 ? (actual * avgW / 1000).toFixed(1) : '–';
        return `<div class="pool-block"><strong>Базен ${p.pool_number}</strong>${row('Број риби', actual)}${row('Просечна тежина', p.avg_weight_gr != null ? p.avg_weight_gr + ' gr' : '–')}${row('Вкупна тежина', totalKg !== '–' ? totalKg + ' кг' : '–')}${row('Продадени', sold || '–')}${row('Угинати', dead || '–')}</div>`;
      }).join('');
      const totalFish = pf.reduce((s, p) => s + ((parseInt(p.fish_count)||0)-(parseInt(p.dead_count)||0)-(parseInt(p.sold_count)||0)), 0);
      const totalKg = pf.reduce((s, p) => { const a = (parseInt(p.fish_count)||0)-(parseInt(p.dead_count)||0)-(parseInt(p.sold_count)||0); return s + (a * (parseFloat(p.avg_weight_gr)||0) / 1000); }, 0).toFixed(1);
      const totalDead = pf.reduce((s, p) => s + (parseInt(p.dead_count)||0), 0);
      const totalSold = pf.reduce((s, p) => s + (parseInt(p.sold_count)||0), 0);
      html += section('4. Евиденција на базени', poolRows + `<div class="total">Риби: ${totalFish} | Вкупно: ${totalKg} кг | Продадени: ${totalSold} | Угинати: ${totalDead}</div>`);
    }
    if (act) {
      let rows = row('Сортирање', act.sorting_date ? new Date(act.sorting_date).toLocaleDateString('mk-MK') : '–');
      rows += row('Контрола тежина', act.weight_control_date ? new Date(act.weight_control_date).toLocaleDateString('mk-MK') : '–');
      if (act.misc_1) rows += row('Разно (1)', act.misc_1);
      if (act.misc_2) rows += row('Разно (2)', act.misc_2);
      html += section('5. Активности', rows);
    }
    if (meals.length > 0) {
      const mealTypes = ['breakfast', 'lunch', 'dinner'];
      const poolNumbers = [...new Set(meals.map(m => m.pool_number))].sort((a, b) => a - b);
      const poolMealData = poolNumbers.map(poolNum => {
        const poolMeals = meals.filter(m => m.pool_number === poolNum);
        const mealRows = mealTypes.map(type => {
          const mealEntries = poolMeals.filter(m => m.meal_type === type && parseFloat(m.food_quantity_gr) > 0);
          const totalQty = mealEntries.reduce((s, m) => s + parseFloat(m.food_quantity_gr || 0), 0);
          const foodDesc = mealEntries.map(m => `${m.food_type} — ${m.food_quantity_gr} gr`).join(', ');
          return { label: { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' }[type], foodDesc, qty: totalQty };
        });
        return { poolNum, mealRows, total: mealRows.reduce((s, m) => s + m.qty, 0) };
      }).filter(p => p.total > 0);
      const grandTotal = poolMealData.reduce((s, p) => s + p.total, 0);
      const mealHTML = poolMealData.map(({ poolNum, mealRows, total }) =>
        `<div class="pool-block"><strong>Базен ${poolNum}</strong>${mealRows.map(m => row(m.label, m.qty > 0 ? m.foodDesc : '–')).join('')}<div class="pool-total">Вкупно: ${total} gr</div></div>`
      ).join('');
      html += section('6. Храна', mealHTML + `<div class="total">Вкупно храна (сите оброци): ${grandTotal} gr</div>`);
    }

    const fullHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Дневен извештај — ${date}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;padding:24px;font-size:12px;max-width:700px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a8a;padding-bottom:12px;margin-bottom:16px}
.brand{font-size:18px;font-weight:800;color:#1a1a8a;letter-spacing:0.5px}
.brand-sub{font-size:10px;color:#666;margin-top:2px}
.print-date{font-size:10px;color:#888;text-align:right}
h2{font-size:15px;color:#1a1a2e;margin-bottom:2px}
.checked-by{font-size:11px;color:#666;margin-bottom:16px}
.section{border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:10px}
.section h3{font-size:12px;color:#1a1a8a;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:11px}
.row:last-child{border-bottom:none}
.lbl{color:#64748b}.val{font-weight:600}
.ok{color:#16a34a}.bad{color:#dc2626}
.pool-block{margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}
.pool-block:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
.pool-block strong{display:block;color:#1a1a8a;font-size:11px;margin-bottom:4px}
.pool-total{font-size:11px;font-weight:700;color:#1a1a8a;background:#f0f4ff;padding:4px 8px;border-radius:4px;margin-top:4px;text-align:right}
.total{background:#f0f4ff;padding:8px 12px;border-radius:4px;font-weight:700;color:#1a1a8a;margin-top:6px;font-size:11px}
.alert-box{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;margin-bottom:10px}
.alert-box h3{color:#dc2626;font-size:12px;margin-bottom:6px}
.alert-row{font-size:11px;color:#991b1b;padding:2px 0}
.footer{margin-top:24px;padding-top:8px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#aaa}
@media print{body{padding:12px}@page{margin:12mm 8mm;size:A4}}
</style></head><body>
<div class="header">
  <div><div class="brand">ФАМАКОМ АКВАКУЛТУРА</div><div class="brand-sub">Дневен извештај</div></div>
  <div class="print-date">Испечатено: ${printDate}</div>
</div>
<h2>${date}</h2>
<p class="checked-by">Проверил: ${record.checked_by_name || '–'}</p>
${html}
<div class="footer">ФАМАКОМ АКВАКУЛТУРА — Автоматски генериран извештај</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(fullHTML);
      printWindow.document.close();
    }
  };

  if (loading) return (
    <div className="space-y-3 animate-in">
      <div className="skeleton h-12 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-36 rounded-2xl" />
        <div className="skeleton h-36 rounded-2xl" />
      </div>
      <div className="skeleton h-28 w-full rounded-2xl" />
    </div>
  );

  if (!data) return (
    <div className="text-center py-12">
      <p className="text-[var(--danger)] font-medium">Записот не е пронајден</p>
      <Link to="/history" className="text-sm text-[var(--primary)] mt-2 inline-block">← Назад</Link>
    </div>
  );

  const { record, water_control, filtration_checks, fish_visual, pool_feeding, activities, alerts } = data;
  const _rd = new Date(record.date);
  const dateStr = `${MK_DAYS[_rd.getDay()]}, ${_rd.getDate()} ${MK_MONTHS[_rd.getMonth()]} ${_rd.getFullYear()}`;

  // Prepare pool/meal summary data
  const totalFish = pool_feeding.reduce((s, p) => s + ((parseInt(p.fish_count)||0)-(parseInt(p.dead_count)||0)-(parseInt(p.sold_count)||0)), 0);
  const totalKg = pool_feeding.reduce((s, p) => {
    const actual = (parseInt(p.fish_count)||0)-(parseInt(p.dead_count)||0)-(parseInt(p.sold_count)||0);
    return s + (actual * (parseFloat(p.avg_weight_gr)||0) / 1000);
  }, 0);
  const totalDead = pool_feeding.reduce((s, p) => s + (parseInt(p.dead_count)||0), 0);
  const totalSold = pool_feeding.reduce((s, p) => s + (parseInt(p.sold_count)||0), 0);

  // Prepare meals data
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  const poolNumbers = [...new Set(meals.map(m => m.pool_number))].sort((a, b) => a - b);
  const poolMealData = poolNumbers.map(poolNum => {
    const poolMeals = meals.filter(m => m.pool_number === poolNum);
    const mealRows = mealTypes.map(type => {
      const mealEntries = poolMeals.filter(m => m.meal_type === type && parseFloat(m.food_quantity_gr) > 0);
      const totalQty = mealEntries.reduce((s, m) => s + parseFloat(m.food_quantity_gr || 0), 0);
      const foodItems = mealEntries.map(m => ({ food_type: m.food_type, food_quantity_gr: parseFloat(m.food_quantity_gr || 0) }));
      return { type, label: MEAL_LABELS[type], foodItems, food_quantity_gr: totalQty, has_data: mealEntries.length > 0 };
    });
    return { poolNum, mealRows, total: mealRows.reduce((s, m) => s + m.food_quantity_gr, 0) };
  }).filter(p => p.total > 0);
  const grandTotalFood = poolMealData.reduce((s, p) => s + p.total, 0);

  // Check helpers
  const okBadge = (val) => {
    if (val === true) return <span className="inline-flex items-center gap-0.5 text-[var(--success)] font-semibold"><Check size={12} /> ОК</span>;
    if (val === false) return <span className="inline-flex items-center gap-0.5 text-[var(--danger)] font-semibold"><X size={12} /> НЕ</span>;
    return <span className="text-[var(--text-muted)]">–</span>;
  };

  return (
    <div className="space-y-3 pb-4">
      {/* Back + Header */}
      <div className="card !p-3 animate-in">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/history')}
            className="btn-ghost p-1.5 rounded-xl mt-0.5 flex-shrink-0">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[var(--text-primary)] leading-tight"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              {dateStr}
            </h1>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Проверил: {record.checked_by_name}</p>
          </div>
        </div>

        {/* Action buttons — compact row */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          <Link to={`/checklist/${id}`}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--primary)] text-white active:scale-95 transition-transform">
            <Pencil size={12} /> Едитирај
          </Link>
          <button onClick={handleDelete}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[var(--danger)] border border-[var(--border)] active:scale-95 transition-transform" style={{ background: 'rgba(239,68,68,0.08)' }}>
            <Trash2 size={12} /> Избриши
          </button>
          <button onClick={handleSendReport} disabled={sending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] active:scale-95 transition-transform">
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
            {sending ? 'Праќа...' : 'Испрати'}
          </button>
          <button onClick={handlePrintDaily}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] active:scale-95 transition-transform">
            <Printer size={12} /> Принтај
          </button>
        </div>
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 && (
        <div className="rounded-2xl p-3 animate-in-delay-1" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <h3 className="flex items-center gap-1.5 font-bold text-xs text-[var(--danger)] mb-2"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            <AlertTriangle size={14} /> {alerts.length} {alerts.length === 1 ? 'Аларм' : 'Аларми'}
          </h3>
          <div className="grid grid-cols-1 gap-1">
            {alerts.map(a => {
              const label = ALERT_LABELS[a.parameter_name] || a.parameter_name;
              const hasNorms = a.min_norm != null || a.max_norm != null;
              const unit = PARAMETER_LABELS[a.parameter_name]?.unit || '';
              return (
                <div key={a.id} className="flex items-center justify-between bg-[var(--surface)]/60 rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] text-[var(--danger)] font-medium">{label}</span>
                  <span className="text-[11px] font-bold text-[var(--danger)]">
                    {hasNorms ? (
                      <>{a.value}{unit ? ` ${unit}` : ''} <span className="font-normal opacity-70">(норма: {a.min_norm ?? '-'} – {a.max_norm ?? '-'})</span></>
                    ) : (
                      a.parameter_name === 'bio_filter_foam' ? 'Детектирана' : 'Не е ОК'
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Summary Cards — 2x2 grid */}
      <div className="grid grid-cols-2 gap-2 animate-in-delay-1">
        {/* Water summary */}
        {water_control && (
          <div className="card !p-3 !rounded-2xl">
            <div className="flex items-center gap-1.5 mb-2">
              <Droplets size={14} className="text-blue-500" />
              <span className="text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Вода</span>
            </div>
            <div className="space-y-1">
              {Object.entries(PARAMETER_LABELS).map(([key, { label, unit }]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-[10px] text-[var(--text-muted)] truncate mr-1">{label}</span>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] whitespace-nowrap">
                    {water_control[key] != null ? `${water_control[key]}${unit ? ` ${unit}` : ''}` : '–'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtration + Fish visual combined */}
        <div className="space-y-2">
          {filtration_checks && (
            <div className="card !p-3 !rounded-2xl">
              <div className="flex items-center gap-1.5 mb-2">
                <Filter size={14} className="text-purple-500" />
                <span className="text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Филтрација</span>
              </div>
              <div className="space-y-1">
                {Object.entries(FILTRATION_LABELS).map(([key, label]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-[10px] text-[var(--text-muted)] truncate mr-1">{label}</span>
                    <span className="text-[11px]">
                      {key === 'bio_filter_foam'
                        ? (filtration_checks[key] === 'yes'
                          ? <span className="text-[var(--danger)] font-semibold">Има</span>
                          : filtration_checks[key] === 'no'
                          ? <span className="text-[var(--success)] font-semibold">Нема</span>
                          : '–')
                        : okBadge(filtration_checks[key])
                      }
                    </span>
                  </div>
                ))}
                {filtration_checks.notes && (
                  <p className="text-[10px] text-[var(--text-muted)] italic mt-1 pt-1 border-t border-[var(--border)]">
                    {filtration_checks.notes}
                  </p>
                )}
              </div>
            </div>
          )}

          {fish_visual && (
            <div className="card !p-3 !rounded-2xl">
              <div className="flex items-center gap-1.5 mb-2">
                <Fish size={14} className="text-cyan-500" />
                <span className="text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Визуелна</span>
              </div>
              <div className="space-y-1">
                {Object.entries(FISH_VISUAL_LABELS).map(([key, label]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-[10px] text-[var(--text-muted)] truncate mr-1">{label}</span>
                    <span className="text-[11px]">{okBadge(fish_visual[key])}</span>
                  </div>
                ))}
                {fish_visual.notes && (
                  <p className="text-[10px] text-[var(--text-muted)] italic mt-1 pt-1 border-t border-[var(--border)]">
                    {fish_visual.notes}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pool Status — full width with compact horizontal layout */}
      {pool_feeding.length > 0 && (
        <div className="card !p-3 !rounded-2xl animate-in-delay-2">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Warehouse size={14} className="text-indigo-500" />
            <span className="text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Евиденција на базени
            </span>
          </div>

          {/* Compact table-like layout */}
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px]" style={{ minWidth: '100%' }}>
              <thead>
                <tr className="text-[10px] text-[var(--text-muted)]">
                  <th className="text-left font-semibold py-1 px-1.5">Базен</th>
                  <th className="text-right font-semibold py-1 px-1.5">Риби</th>
                  <th className="text-right font-semibold py-1 px-1.5">Тежина</th>
                  <th className="text-right font-semibold py-1 px-1.5">Вкупно кг</th>
                  <th className="text-right font-semibold py-1 px-1.5">Прод.</th>
                  <th className="text-right font-semibold py-1 px-1.5">Угин.</th>
                </tr>
              </thead>
              <tbody>
                {pool_feeding.map(pf => {
                  const startCount = parseInt(pf.fish_count) || 0;
                  const dead = parseInt(pf.dead_count) || 0;
                  const sold = parseInt(pf.sold_count) || 0;
                  const actualCount = startCount - dead - sold;
                  const avgW = parseFloat(pf.avg_weight_gr) || 0;
                  const totalKgPool = actualCount > 0 && avgW > 0 ? (actualCount * avgW / 1000) : null;
                  return (
                    <tr key={pf.pool_number} className="border-t border-[var(--border)]">
                      <td className="py-1.5 px-1.5 font-semibold text-[var(--primary)]">#{pf.pool_number}</td>
                      <td className="py-1.5 px-1.5 text-right font-medium">{actualCount}</td>
                      <td className="py-1.5 px-1.5 text-right">{avgW > 0 ? `${avgW} gr` : '–'}</td>
                      <td className="py-1.5 px-1.5 text-right font-medium">{totalKgPool != null ? `${totalKgPool.toFixed(1)}` : '–'}</td>
                      <td className="py-1.5 px-1.5 text-right">{sold || '–'}</td>
                      <td className="py-1.5 px-1.5 text-right">{dead || '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--primary)] text-[var(--primary)] font-bold">
                  <td className="py-1.5 px-1.5">Збир</td>
                  <td className="py-1.5 px-1.5 text-right">{totalFish}</td>
                  <td className="py-1.5 px-1.5"></td>
                  <td className="py-1.5 px-1.5 text-right">{totalKg.toFixed(1)}</td>
                  <td className="py-1.5 px-1.5 text-right">{totalSold || '–'}</td>
                  <td className="py-1.5 px-1.5 text-right">{totalDead || '–'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Meals — horizontal card per pool */}
      {poolMealData.length > 0 && (
        <div className="card !p-3 !rounded-2xl animate-in-delay-2">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Utensils size={14} className="text-orange-500" />
            <span className="text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Храна
            </span>
            <span className="ml-auto text-[11px] font-bold text-[var(--primary)]">{grandTotalFood} gr</span>
          </div>

          <div className="space-y-2">
            {poolMealData.map(({ poolNum, mealRows, total }) => (
              <div key={poolNum} className="bg-[var(--bg-secondary)] rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-[var(--primary)]">Базен {poolNum}</span>
                  <span className="text-[10px] font-semibold text-[var(--text-muted)]">{total} gr</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {mealRows.map(meal => (
                    <div key={meal.type}
                      className={`rounded-lg px-2 py-1.5 text-center ${
                        meal.has_data
                          ? 'bg-[var(--surface)] border border-[var(--border)]'
                          : 'bg-[var(--bg-secondary)] opacity-40'
                      }`}>
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        {MEAL_ICONS[meal.type]}
                        <span className="text-[9px] font-semibold text-[var(--text-muted)]">{meal.label}</span>
                      </div>
                      {meal.has_data ? (
                        <>
                          <p className="text-[11px] font-bold text-[var(--text-primary)]">{meal.food_quantity_gr}g</p>
                          {meal.foodItems.map((fi, idx) => (
                            <p key={idx} className="text-[9px] text-[var(--text-muted)]">{fi.food_type}{meal.foodItems.length > 1 ? ` ${fi.food_quantity_gr}g` : ''}</p>
                          ))}
                        </>
                      ) : (
                        <p className="text-[10px] text-[var(--text-muted)]">–</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meals — fallback for old records */}
      {meals.length === 0 && pool_feeding.some(pf => pf.food_type || parseFloat(pf.food_quantity_gr) > 0) && (
        <div className="card !p-3 !rounded-2xl animate-in-delay-2">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Utensils size={14} className="text-orange-500" />
            <span className="text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Храна</span>
          </div>
          {pool_feeding.filter(pf => pf.food_type || parseFloat(pf.food_quantity_gr) > 0).map(pf => (
            <div key={pf.pool_number} className="flex justify-between text-xs py-1.5 border-b border-[var(--border)] last:border-0">
              <span className="font-semibold text-[var(--primary)]">Базен {pf.pool_number}</span>
              <span className="font-medium">{pf.food_type} — {pf.food_quantity_gr} gr</span>
            </div>
          ))}
        </div>
      )}

      {/* Activities */}
      {activities && (
        <div className="card !p-3 !rounded-2xl animate-in-delay-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity size={14} className="text-emerald-500" />
            <span className="text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Активности</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
              <p className="text-[10px] text-[var(--text-muted)]">Сортирање</p>
              <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                {activities.sorting_date ? new Date(activities.sorting_date).toLocaleDateString('mk-MK') : '–'}
              </p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
              <p className="text-[10px] text-[var(--text-muted)]">Контрола тежина</p>
              <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                {activities.weight_control_date ? new Date(activities.weight_control_date).toLocaleDateString('mk-MK') : '–'}
              </p>
            </div>
            {activities.misc_1 && (
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2 col-span-2">
                <p className="text-[10px] text-[var(--text-muted)]">Разно (1)</p>
                <p className="text-[11px] font-medium text-[var(--text-primary)]">{activities.misc_1}</p>
              </div>
            )}
            {activities.misc_2 && (
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2 col-span-2">
                <p className="text-[10px] text-[var(--text-muted)]">Разно (2)</p>
                <p className="text-[11px] font-medium text-[var(--text-primary)]">{activities.misc_2}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
