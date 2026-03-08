import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PARAMETER_LABELS, FILTRATION_LABELS, FISH_VISUAL_LABELS } from '../lib/constants';
import { AlertTriangle, Mail, Pencil, Trash2, Loader2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function RecordDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    api.getRecord(id).then(setData).catch(console.error).finally(() => setLoading(false));
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
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="alert-danger animate-in-delay-1">
          <h3 className="flex items-center gap-1.5 font-bold text-sm mb-2">
            <AlertTriangle size={15} /> Аларми ({alerts.length})
          </h3>
          {alerts.map(a => (
            <div key={a.id} className="text-xs mt-1.5">
              <span className="font-semibold">{PARAMETER_LABELS[a.parameter_name]?.label || a.parameter_name}:</span>{' '}
              <span className="font-bold">{a.value}</span>
              {' '}(норма: {a.min_norm ?? '-'} – {a.max_norm ?? '-'})
            </div>
          ))}
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

      {/* Feeding */}
      {pool_feeding.length > 0 && (
        <CollapsibleSection title="4. Хранење" delay={5} collapsed={collapsed.feeding} onToggle={() => toggleSection('feeding')}>
          {pool_feeding.map(pf => (
            <div key={pf.pool_number} className="border-b border-[var(--border)] last:border-b-0 pb-3 mb-3 last:pb-0 last:mb-0">
              <p className="font-semibold text-[var(--primary)] text-xs mb-2" style={{ fontFamily: 'Sora, sans-serif' }}>Базен {pf.pool_number}</p>
              <div className="grid grid-cols-2 gap-x-4">
                <Row label="Број риби" value={pf.fish_count ?? '–'} />
                <Row label="Просечна тежина" value={pf.avg_weight_gr != null ? `${pf.avg_weight_gr} gr` : '–'} />
                <Row label="Продадени" value={pf.sold_count ?? '–'} />
                <Row label="Угинати" value={pf.dead_count ?? '–'} />
                <Row label="Тип храна" value={pf.food_type || '–'} />
                <Row label="Количина храна" value={pf.food_quantity_gr != null ? `${pf.food_quantity_gr} gr` : '–'} />
              </div>
            </div>
          ))}
          <div className="info-box mt-2 text-xs">
            <strong>Збир:</strong>{' '}
            Риби: {pool_feeding.reduce((s, p) => s + (parseInt(p.fish_count) || 0), 0)} |{' '}
            Храна: {pool_feeding.reduce((s, p) => s + (parseFloat(p.food_quantity_gr) || 0), 0)} gr |{' '}
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
