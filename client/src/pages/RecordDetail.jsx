import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PARAMETER_LABELS, FILTRATION_LABELS, FISH_VISUAL_LABELS } from '../lib/constants';
import { AlertTriangle, Mail, Pencil, Trash2, Loader2, Check, X, ChevronDown, ChevronUp, Printer } from 'lucide-react';

const MEAL_LABELS = { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' };

// Build a complete alert label map from all constants
const ALERT_LABELS = {
  // Water parameters
  ...Object.fromEntries(Object.entries(PARAMETER_LABELS).map(([k, v]) => [k, v.label])),
  // Filtration
  bio_filter_foam: 'Пена во био филтер',
  bio_filter_level: 'Ниво вода во БИО филтер',
  mechanical_filter: 'Механички филтер',
  circulation_pump: 'Циркулациона пумпа',
  thermo_pump: 'Термо пумпа',
  aeration: 'Аерација',
  sieve_filter: 'Сито филтер',
  // Fish visual
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
  const [collapsed, setCollapsed] = useState({});

  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    api.getRecord(id).then(result => {
      setData(result);
      // Fetch meals for this record's date
      const d = new Date(result.record.date);
      const recordDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return api.getMeals(recordDate);
    }).then(mealsData => {
      setMeals(mealsData.meals || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Дали сте сигурни дека сакате да го избришете овој запис?')) return;
    try { await api.deleteRecord(id); navigate('/'); }
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
    const date = new Date(record.date).toLocaleDateString('mk-MK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const now = new Date();
    const printDate = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const section = (title, content) => `<div class="section"><h3>${title}</h3>${content}</div>`;
    const row = (label, value, cls = '') => `<div class="row"><span class="lbl">${label}</span><span class="val ${cls}">${value}</span></div>`;
    const okIcon = (v) => v === true ? '✓ ОК' : v === false ? '✗ НЕ' : '–';
    const okCls = (v) => v === true ? 'ok' : v === false ? 'bad' : '';

    let html = '';

    // Alerts
    if (al && al.length > 0) {
      const alertRows = al.map(a => {
        const label = ALERT_LABELS[a.parameter_name] || a.parameter_name;
        const unit = PARAMETER_LABELS[a.parameter_name]?.unit || '';
        return `<div class="alert-row"><strong>${label}:</strong> ${a.value}${unit ? ' ' + unit : ''}${a.min_norm != null || a.max_norm != null ? ` (норма: ${a.min_norm ?? '-'} – ${a.max_norm ?? '-'}${unit ? ' ' + unit : ''})` : ''}</div>`;
      }).join('');
      html += `<div class="alert-box"><h3>⚠ Аларми (${al.length})</h3>${alertRows}</div>`;
    }

    // Water control
    if (wc) {
      const rows = Object.entries(PARAMETER_LABELS).map(([key, { label, unit }]) =>
        row(`${label}${unit ? ` (${unit})` : ''}`, wc[key] ?? '–')
      ).join('');
      html += section('1. Контрола на вода', rows);
    }

    // Filtration
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

    // Fish visual
    if (fv) {
      const rows = Object.entries(FISH_VISUAL_LABELS).map(([key, label]) =>
        row(label, okIcon(fv[key]), okCls(fv[key]))
      ).join('');
      html += section('3. Визуелна контрола', rows + (fv.notes ? row('Забелешка', fv.notes) : ''));
    }

    // Pool status
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

    // Activities
    if (act) {
      let rows = row('Сортирање', act.sorting_date ? new Date(act.sorting_date).toLocaleDateString('mk-MK') : '–');
      rows += row('Контрола тежина', act.weight_control_date ? new Date(act.weight_control_date).toLocaleDateString('mk-MK') : '–');
      if (act.misc_1) rows += row('Разно (1)', act.misc_1);
      if (act.misc_2) rows += row('Разно (2)', act.misc_2);
      html += section('5. Активности', rows);
    }

    // Meals
    if (meals.length > 0) {
      const MEAL_LABELS_LOCAL = { breakfast: 'Појадок', lunch: 'Ручек', dinner: 'Вечера' };
      const mealTypes = ['breakfast', 'lunch', 'dinner'];
      const poolNumbers = [...new Set(meals.map(m => m.pool_number))].sort((a, b) => a - b);
      const poolMealData = poolNumbers.map(poolNum => {
        const poolMeals = meals.filter(m => m.pool_number === poolNum);
        const mealRows = mealTypes.map(type => {
          const meal = poolMeals.find(m => m.meal_type === type);
          return { label: MEAL_LABELS_LOCAL[type], food_type: meal?.food_type || null, qty: parseFloat(meal?.food_quantity_gr) || 0 };
        });
        return { poolNum, mealRows, total: mealRows.reduce((s, m) => s + m.qty, 0) };
      }).filter(p => p.total > 0);
      const grandTotal = poolMealData.reduce((s, p) => s + p.total, 0);

      const mealHTML = poolMealData.map(({ poolNum, mealRows, total }) =>
        `<div class="pool-block"><strong>Базен ${poolNum}</strong>${mealRows.map(m => row(m.label, m.qty > 0 ? `${m.food_type} — ${m.qty} gr` : '–')).join('')}<div class="pool-total">Вкупно: ${total} gr</div></div>`
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
    <div className="max-w-lg mx-auto space-y-4">
      <div className="skeleton h-16 w-full" />
      <div className="skeleton h-48 w-full" />
      <div className="skeleton h-48 w-full" />
    </div>
  );
  if (!data) return (
    <div className="text-center py-12">
      <p className="text-[var(--danger)] font-medium">Записот не е пронајден</p>
    </div>
  );

  const { record, water_control, filtration_checks, fish_visual, pool_feeding, activities, alerts } = data;
  const dateStr = new Date(record.date).toLocaleDateString('mk-MK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="max-w-lg mx-auto space-y-3">
      {/* Header */}
      <div className="card animate-in">
        <h1 className="page-title text-lg">{dateStr}</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Проверил: {record.checked_by_name}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link to={`/checklist/${id}`} className="btn-primary py-2 px-3 text-sm">
            <Pencil size={14} /> Едитирај
          </Link>
          <button onClick={handleDelete} className="btn-danger py-2 px-3 text-sm">
            <Trash2 size={14} /> Избриши
          </button>
          <button onClick={handleSendReport} disabled={sending} className="btn-secondary py-2 px-3 text-sm">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {sending ? 'Се праќа...' : 'Испрати'}
          </button>
          <button onClick={handlePrintDaily} className="btn-secondary py-2 px-3 text-sm">
            <Printer size={14} /> Принтај
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="alert-danger animate-in-delay-1">
          <h3 className="flex items-center gap-1.5 font-bold text-sm mb-2">
            <AlertTriangle size={15} /> Аларми ({alerts.length})
          </h3>
          {alerts.map(a => {
            const label = ALERT_LABELS[a.parameter_name] || a.parameter_name;
            const hasNorms = a.min_norm != null || a.max_norm != null;
            const unit = PARAMETER_LABELS[a.parameter_name]?.unit || '';
            return (
              <div key={a.id} className="text-xs mt-1.5">
                <span className="font-semibold">{label}:</span>{' '}
                {hasNorms ? (
                  <>
                    <span className="font-bold">{a.value}{unit ? ` ${unit}` : ''}</span>
                    {' '}(норма: {a.min_norm ?? '-'} – {a.max_norm ?? '-'}{unit ? ` ${unit}` : ''})
                  </>
                ) : (
                  <span className="font-bold">
                    {a.parameter_name === 'bio_filter_foam' ? 'Детектирана' : 'Не е ОК'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Water */}
      {water_control && (
        <CollapsibleSection title="1. Контрола на вода" delay={2} collapsed={collapsed.water} onToggle={() => toggleSection('water')}>
          {Object.entries(PARAMETER_LABELS).map(([key, { label, unit }]) => (
            <Row key={key} label={`${label}${unit ? ` (${unit})` : ''}`} value={water_control[key] ?? '–'} />
          ))}
        </CollapsibleSection>
      )}

      {/* Filtration */}
      {filtration_checks && (
        <CollapsibleSection title="2. Филтрација" delay={3} collapsed={collapsed.filtration} onToggle={() => toggleSection('filtration')}>
          {Object.entries(FILTRATION_LABELS).map(([key, label]) => {
            if (key === 'bio_filter_foam') {
              const val = filtration_checks[key];
              return <Row key={key} label={label} value={val === 'yes' ? 'Има' : val === 'no' ? 'Нема' : '–'} ok={val === 'no'} />;
            }
            return <Row key={key} label={label} value={filtration_checks[key] === true ? 'ОК' : filtration_checks[key] === false ? 'НЕ' : '–'} ok={filtration_checks[key]} />;
          })}
          {filtration_checks.notes && <Row label="Забелешка" value={filtration_checks.notes} />}
        </CollapsibleSection>
      )}

      {/* Fish visual */}
      {fish_visual && (
        <CollapsibleSection title="3. Визуелна контрола" delay={4} collapsed={collapsed.fish} onToggle={() => toggleSection('fish')}>
          {Object.entries(FISH_VISUAL_LABELS).map(([key, label]) => (
            <Row key={key} label={label} value={fish_visual[key] === true ? 'ОК' : fish_visual[key] === false ? 'НЕ' : '–'} ok={fish_visual[key]} />
          ))}
          {fish_visual.notes && <Row label="Забелешка" value={fish_visual.notes} />}
        </CollapsibleSection>
      )}

      {/* Pool status (Евиденција на базени) */}
      {pool_feeding.length > 0 && (
        <CollapsibleSection title="4. Евиденција на базени" delay={5} collapsed={collapsed.feeding} onToggle={() => toggleSection('feeding')}>
          {pool_feeding.map(pf => {
            const startCount = parseInt(pf.fish_count) || 0;
            const dead = parseInt(pf.dead_count) || 0;
            const sold = parseInt(pf.sold_count) || 0;
            const actualCount = startCount - dead - sold;
            const avgW = parseFloat(pf.avg_weight_gr) || 0;
            const totalKg = actualCount > 0 && avgW > 0 ? (actualCount * avgW / 1000) : null;
            return (
              <div key={pf.pool_number} className="border-b border-[var(--border)] last:border-b-0 pb-3 mb-3 last:pb-0 last:mb-0">
                <p className="font-semibold text-[var(--primary)] text-xs mb-2" style={{ fontFamily: 'Sora, sans-serif' }}>Базен {pf.pool_number}</p>
                <Row label="Број риби" value={actualCount} />
                <Row label="Просечна тежина" value={pf.avg_weight_gr != null ? `${pf.avg_weight_gr} gr` : '–'} />
                <Row label="Вкупна тежина" value={totalKg != null ? `${totalKg.toFixed(1)} кг` : '–'} />
                <Row label="Продадени" value={sold || '–'} />
                <Row label="Угинати" value={dead || '–'} />
              </div>
            );
          })}
          <div className="info-box mt-2 text-xs">
            <strong>Збир:</strong>{' '}
            Риби: {pool_feeding.reduce((s, p) => s + ((parseInt(p.fish_count) || 0) - (parseInt(p.dead_count) || 0) - (parseInt(p.sold_count) || 0)), 0)} |{' '}
            Вкупно: {(pool_feeding.reduce((s, p) => {
              const actual = (parseInt(p.fish_count) || 0) - (parseInt(p.dead_count) || 0) - (parseInt(p.sold_count) || 0);
              const w = parseFloat(p.avg_weight_gr) || 0;
              return s + (actual * w / 1000);
            }, 0)).toFixed(1)} кг |{' '}
            Продадени: {pool_feeding.reduce((s, p) => s + (parseInt(p.sold_count) || 0), 0)} |{' '}
            Угинати: {pool_feeding.reduce((s, p) => s + (parseInt(p.dead_count) || 0), 0)}
          </div>
        </CollapsibleSection>
      )}

      {/* Activities */}
      {activities && (
        <CollapsibleSection title="5. Активности" delay={6} collapsed={collapsed.activities} onToggle={() => toggleSection('activities')}>
          <Row label="Сортирање" value={activities.sorting_date ? new Date(activities.sorting_date).toLocaleDateString('mk-MK') : '–'} />
          <Row label="Контрола тежина" value={activities.weight_control_date ? new Date(activities.weight_control_date).toLocaleDateString('mk-MK') : '–'} />
          {activities.misc_1 && <Row label="Разно (1)" value={activities.misc_1} />}
          {activities.misc_2 && <Row label="Разно (2)" value={activities.misc_2} />}
        </CollapsibleSection>
      )}

      {/* Храна — new meal system (per-pool, per-meal breakdown) */}
      {meals.length > 0 && (() => {
        const mealTypes = ['breakfast', 'lunch', 'dinner'];
        const poolNumbers = [...new Set(meals.map(m => m.pool_number))].sort((a, b) => a - b);

        // Build per-pool data (only pools that have at least one meal with food)
        const poolMealData = poolNumbers.map(poolNum => {
          const poolMeals = meals.filter(m => m.pool_number === poolNum);
          const mealRows = mealTypes.map(type => {
            const meal = poolMeals.find(m => m.meal_type === type);
            return {
              type,
              label: MEAL_LABELS[type],
              food_type: meal?.food_type || null,
              food_quantity_gr: parseFloat(meal?.food_quantity_gr) || 0,
              has_data: meal && parseFloat(meal.food_quantity_gr) > 0,
            };
          });
          const total = mealRows.reduce((s, m) => s + m.food_quantity_gr, 0);
          return { poolNum, mealRows, total };
        }).filter(p => p.total > 0);

        const grandTotal = poolMealData.reduce((s, p) => s + p.total, 0);

        // Meal authors
        const mealAuthors = {};
        meals.forEach(m => { if (m.fed_by_name && !mealAuthors[m.meal_type]) mealAuthors[m.meal_type] = m.fed_by_name; });

        return (
          <CollapsibleSection title="6. Храна" delay={7} collapsed={collapsed.food} onToggle={() => toggleSection('food')}>
            {poolMealData.map(({ poolNum, mealRows, total }) => (
              <div key={poolNum} className="border-b border-[var(--border)] last:border-b-0 pb-3 mb-3 last:pb-0 last:mb-0">
                <p className="font-semibold text-[var(--primary)] text-xs mb-2" style={{ fontFamily: 'Sora, sans-serif' }}>Базен {poolNum}</p>
                {mealRows.map(meal => (
                  <div key={meal.type} className="flex justify-between text-xs py-1.5 border-b border-[#F1F5F9] last:border-0">
                    <span className="text-[var(--text-secondary)]">{meal.label}</span>
                    <span className="font-semibold text-[var(--text-primary)] text-right">
                      {meal.has_data ? `${meal.food_type} — ${meal.food_quantity_gr} gr` : '–'}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs py-1.5 bg-[var(--bg-secondary)] rounded px-2 mt-1">
                  <span className="font-semibold text-[var(--text-secondary)]">Вкупно</span>
                  <span className="font-bold text-[var(--primary)]">{total > 0 ? `${total} gr` : '–'}</span>
                </div>
              </div>
            ))}

            <div className="info-box mt-2 text-xs">
              <strong>Вкупно храна (сите оброци):</strong> {grandTotal} gr
            </div>

            {Object.keys(mealAuthors).length > 0 && (
              <div className="info-box mt-2 text-xs">
                <strong>Проверил:</strong>{' '}
                {mealTypes.filter(t => mealAuthors[t]).map(t => (
                  <span key={t} className="inline-block mr-3">{MEAL_LABELS[t]}: {mealAuthors[t]}</span>
                ))}
              </div>
            )}
          </CollapsibleSection>
        );
      })()}

      {/* Храна — fallback for old records (food stored in pool_feeding) */}
      {meals.length === 0 && pool_feeding.some(pf => pf.food_type || parseFloat(pf.food_quantity_gr) > 0) && (
        <CollapsibleSection title="6. Храна" delay={7} collapsed={collapsed.food} onToggle={() => toggleSection('food')}>
          {pool_feeding.filter(pf => pf.food_type || parseFloat(pf.food_quantity_gr) > 0).map(pf => (
            <div key={pf.pool_number} className="border-b border-[var(--border)] last:border-b-0 pb-3 mb-3 last:pb-0 last:mb-0">
              <p className="font-semibold text-[var(--primary)] text-xs mb-2" style={{ fontFamily: 'Sora, sans-serif' }}>Базен {pf.pool_number}</p>
              <Row label="Тип храна" value={pf.food_type || '–'} />
              <Row label="Количина" value={pf.food_quantity_gr != null ? `${pf.food_quantity_gr} gr` : '–'} />
            </div>
          ))}
          <div className="info-box mt-2 text-xs">
            <strong>Вкупно храна:</strong>{' '}
            {pool_feeding.reduce((s, p) => s + (parseFloat(p.food_quantity_gr) || 0), 0)} gr
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function CollapsibleSection({ title, children, delay = 1, collapsed, onToggle }) {
  return (
    <div className={`card animate-in-delay-${delay}`}>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between">
        <h3 className="section-title text-sm">{title}</h3>
        {collapsed ? <ChevronDown size={16} className="text-[var(--text-muted)]" /> : <ChevronUp size={16} className="text-[var(--text-muted)]" />}
      </button>
      {!collapsed && <div className="space-y-0.5 mt-3">{children}</div>}
    </div>
  );
}

function Row({ label, value, ok }) {
  return (
    <div className="flex justify-between text-xs py-1.5 border-b border-[#F1F5F9] last:border-0">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={`font-semibold ${
        ok === true ? 'text-[var(--success)]' :
        ok === false ? 'text-[var(--danger)]' :
        'text-[var(--text-primary)]'
      }`}>
        {ok === true && <Check size={13} className="inline mr-0.5" />}
        {ok === false && <X size={13} className="inline mr-0.5" />}
        {value}
      </span>
    </div>
  );
}
