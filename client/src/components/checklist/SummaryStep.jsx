import { PARAMETER_LABELS, FILTRATION_LABELS, FISH_VISUAL_LABELS, POOL_NUMBERS } from '../../lib/constants';
import { CheckCircle, XCircle, AlertTriangle, Droplets, Filter, Eye, Fish, Calendar, ChevronRight } from 'lucide-react';

export default function SummaryStep({ formData, norms, fishInventory, onGoToStep }) {
  const { water_control, filtration_checks, fish_visual, pool_feeding, activities } = formData;

  // ── Water summary ──
  const waterEntries = Object.entries(PARAMETER_LABELS)
    .map(([key, { label, unit }]) => {
      const val = water_control[key];
      if (val === undefined || val === null || val === '') return null;
      const num = parseFloat(val);
      const norm = norms?.find(n => n.parameter_name === key);
      let outOfRange = false;
      if (norm) {
        if (norm.min_value != null && num < parseFloat(norm.min_value)) outOfRange = true;
        if (norm.max_value != null && num > parseFloat(norm.max_value)) outOfRange = true;
      }
      return { key, label, unit, value: num, outOfRange };
    })
    .filter(Boolean);

  const waterOutOfRange = waterEntries.filter(e => e.outOfRange).length;
  const waterExchange = water_control.water_exchange_m3;

  // ── Filtration summary ──
  const filtrationEntries = Object.entries(FILTRATION_LABELS).map(([key, label]) => {
    const val = filtration_checks[key];
    if (key === 'bio_filter_foam') {
      return { key, label, value: val, isFoam: true, isOk: val === 'no', isBad: val === 'yes' };
    }
    return { key, label, value: val, isFoam: false, isOk: val === true, isBad: val === false };
  });
  const filtrationIssues = filtrationEntries.filter(e => e.isBad).length;

  // ── Fish visual summary ──
  const fishEntries = Object.entries(FISH_VISUAL_LABELS).map(([key, label]) => {
    const val = fish_visual[key];
    return { key, label, isOk: val === true, isBad: val === false };
  });
  const fishIssues = fishEntries.filter(e => e.isBad).length;

  // ── Pool feeding summary ──
  const poolEntries = POOL_NUMBERS.map(num => {
    const pf = pool_feeding?.find(p => p.pool_number === num) || {};
    const inv = fishInventory?.find(fi => fi.pool_number === num);
    const hasFish = inv && inv.current_count > 0;
    const dead = parseInt(pf.dead_count) || 0;
    const sold = parseInt(pf.sold_count) || 0;
    const weight = pf.avg_weight_gr;
    return { num, hasFish, fishCount: inv?.current_count || 0, dead, sold, weight, hasChanges: dead > 0 || sold > 0 || (weight !== '' && weight != null) };
  }).filter(p => p.hasFish);

  const totalDead = poolEntries.reduce((s, p) => s + p.dead, 0);
  const totalSold = poolEntries.reduce((s, p) => s + p.sold, 0);

  // ── Activities summary ──
  const hasActivities = activities?.sorting_date || activities?.weight_control_date || activities?.misc_1 || activities?.misc_2;

  // Section header component
  const SectionHeader = ({ icon: Icon, title, badge, badgeColor, stepIndex }) => (
    <button type="button" onClick={() => onGoToStep(stepIndex)}
      className="w-full flex items-center justify-between py-2.5 px-3 rounded-[var(--r-md)] hover:bg-[var(--surface)] transition-colors group">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-[var(--primary)]" />
        <span className="text-[13px] font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
          {title}
        </span>
        {badge !== undefined && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            badgeColor === 'red' ? 'bg-[rgba(239,68,68,0.1)] text-[var(--danger)]' :
            badgeColor === 'green' ? 'bg-[rgba(34,197,94,0.1)] text-[var(--success)]' :
            'bg-[rgba(37,99,235,0.1)] text-[var(--primary)]'
          }`}>
            {badge}
          </span>
        )}
      </div>
      <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
          <CheckCircle size={18} />
        </div>
        <div>
          <h2 className="section-title">6. Резиме</h2>
          <p className="section-subtitle">Прегледајте пред зачувување. Кликнете на дел за корекција.</p>
        </div>
      </div>

      {/* ── 1. Water ── */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
        <SectionHeader
          icon={Droplets} title="Контрола на вода" stepIndex={0}
          badge={waterOutOfRange > 0 ? `${waterOutOfRange} надвор од норма` : 'Сè во норма'}
          badgeColor={waterOutOfRange > 0 ? 'red' : 'green'}
        />
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {waterEntries.map(e => (
              <div key={e.key} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)] truncate">{e.label}</span>
                <span className={`font-semibold tabular-nums ${e.outOfRange ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                  {e.value}{e.unit ? ` ${e.unit}` : ''}
                  {e.outOfRange && <AlertTriangle size={10} className="inline ml-1 mb-0.5" />}
                </span>
              </div>
            ))}
          </div>
          {waterExchange && (
            <div className="mt-2 pt-2 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              Замена на вода: <strong>{waterExchange} m³</strong>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Filtration ── */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
        <SectionHeader
          icon={Filter} title="Филтрација" stepIndex={1}
          badge={filtrationIssues > 0 ? `${filtrationIssues} проблем(и)` : 'Сè ОК'}
          badgeColor={filtrationIssues > 0 ? 'red' : 'green'}
        />
        <div className="px-3 pb-3 space-y-1">
          {filtrationEntries.map(e => (
            <div key={e.key} className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)] truncate pr-2" style={{ maxWidth: '75%' }}>
                {e.label}
              </span>
              {e.isFoam ? (
                <span className={`font-semibold ${e.isBad ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                  {e.isBad ? 'ИМА ПЕНА' : e.isOk ? 'Нема' : '—'}
                </span>
              ) : (
                <span className={`font-semibold flex items-center gap-1 ${
                  e.isOk ? 'text-[var(--success)]' : e.isBad ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
                }`}>
                  {e.isOk ? <><CheckCircle size={11} /> ОК</> :
                   e.isBad ? <><XCircle size={11} /> Не е ОК</> : '—'}
                </span>
              )}
            </div>
          ))}
          {filtration_checks.notes && (
            <div className="mt-2 pt-2 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              Забелешка: <em>{filtration_checks.notes}</em>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Fish visual ── */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
        <SectionHeader
          icon={Eye} title="Визуелна контрола" stepIndex={2}
          badge={fishIssues > 0 ? `${fishIssues} проблем(и)` : 'Сè ОК'}
          badgeColor={fishIssues > 0 ? 'red' : 'green'}
        />
        <div className="px-3 pb-3 space-y-1">
          {fishEntries.map(e => (
            <div key={e.key} className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">{e.label}</span>
              <span className={`font-semibold flex items-center gap-1 ${
                e.isOk ? 'text-[var(--success)]' : e.isBad ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
              }`}>
                {e.isOk ? <><CheckCircle size={11} /> ОК</> :
                 e.isBad ? <><XCircle size={11} /> Не е ОК</> : '—'}
              </span>
            </div>
          ))}
          {fish_visual.notes && (
            <div className="mt-2 pt-2 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              Забелешка: <em>{fish_visual.notes}</em>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Pools ── */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
        <SectionHeader
          icon={Fish} title="Базени" stepIndex={3}
          badge={totalDead > 0 ? `${totalDead} угинати` : totalSold > 0 ? `${totalSold} продадени` : `${poolEntries.length} активни`}
          badgeColor={totalDead > 0 ? 'red' : 'blue'}
        />
        <div className="px-3 pb-3">
          <div className="space-y-1.5">
            {poolEntries.map(p => (
              <div key={p.num} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)] font-medium">
                  Б{p.num} <span className="text-[var(--text-muted)]">({p.fishCount} риби)</span>
                </span>
                <div className="flex items-center gap-3">
                  {p.weight && (
                    <span className="text-[var(--text-primary)] tabular-nums">{p.weight}g</span>
                  )}
                  {p.sold > 0 && (
                    <span className="text-amber-600 tabular-nums">-{p.sold} прод.</span>
                  )}
                  {p.dead > 0 && (
                    <span className="text-[var(--danger)] tabular-nums">-{p.dead} угин.</span>
                  )}
                  {!p.hasChanges && (
                    <span className="text-[var(--text-muted)]">без промени</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5. Activities ── */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
        <SectionHeader
          icon={Calendar} title="Активности" stepIndex={4}
          badge={hasActivities ? 'Има записи' : 'Нема записи'}
          badgeColor={hasActivities ? 'blue' : 'blue'}
        />
        {hasActivities && (
          <div className="px-3 pb-3 space-y-1 text-xs text-[var(--text-secondary)]">
            {activities.sorting_date && (
              <div>Сортирање: <strong>{activities.sorting_date}</strong></div>
            )}
            {activities.weight_control_date && (
              <div>Контрола тежина: <strong>{activities.weight_control_date}</strong></div>
            )}
            {activities.misc_1 && (
              <div>Разно (1): <em>{activities.misc_1}</em></div>
            )}
            {activities.misc_2 && (
              <div>Разно (2): <em>{activities.misc_2}</em></div>
            )}
          </div>
        )}
      </div>

      {/* Overall status */}
      {(waterOutOfRange > 0 || filtrationIssues > 0 || fishIssues > 0 || totalDead > 0) && (
        <div className="rounded-[var(--r-lg)] p-3 text-xs font-medium flex items-start gap-2"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-amber-700">
            Внимание: Има забележани проблеми —
            {waterOutOfRange > 0 && ` ${waterOutOfRange} водни параметри надвор од норма`}
            {filtrationIssues > 0 && `${waterOutOfRange > 0 ? ',' : ''} ${filtrationIssues} проблеми со филтрација`}
            {fishIssues > 0 && `${(waterOutOfRange + filtrationIssues) > 0 ? ',' : ''} ${fishIssues} визуелни проблеми`}
            {totalDead > 0 && `${(waterOutOfRange + filtrationIssues + fishIssues) > 0 ? ',' : ''} ${totalDead} угинати риби`}
            . Проверете дали е точно пред зачувување.
          </div>
        </div>
      )}
    </div>
  );
}
