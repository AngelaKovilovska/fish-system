import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

// Едно поле за датум: избор на еден ден (два пати ист ден) или период од–до, како на booking.
// value: { from: 'YYYY-MM-DD' | '', to: 'YYYY-MM-DD' | '' }, onChange({ from, to })
// allowEmpty: дозволува „сите датуми“ (празно)

const MK_MONTHS = ['Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни', 'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
const MK_DAYS = ['По', 'Вт', 'Ср', 'Че', 'Пе', 'Са', 'Не'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '');

export function dateRangeLabel({ from, to }, emptyLabel = 'Сите датуми') {
  if (!from && !to) return emptyLabel;
  if (from && (!to || to === from)) return fmt(from);
  if (!from) return `до ${fmt(to)}`;
  return `${fmt(from)} — ${fmt(to)}`;
}

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // понеделник = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default function DateRangePicker({ value, onChange, allowEmpty = true, className = '', emptyLabel = 'Сите датуми', presets = true }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null); // прв избран датум во тек
  const [hover, setHover] = useState(null);
  const today = new Date();
  const base = value?.from ? new Date(value.from) : today;
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPending(null); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const from = value?.from || '', to = value?.to || '';

  const pick = (d) => {
    const s = iso(d);
    if (!pending) { setPending(s); return; }
    const a = pending < s ? pending : s, b = pending < s ? s : pending;
    onChange({ from: a, to: b });
    setPending(null); setOpen(false);
  };

  const inRange = (s) => {
    if (pending) {
      const h = hover || pending;
      const a = pending < h ? pending : h, b = pending < h ? h : pending;
      return s >= a && s <= b;
    }
    return from && to && s >= from && s <= to;
  };
  const isEdge = (s) => (pending ? s === pending || s === hover : s === from || s === to);

  const applyPreset = (kind) => {
    const y = today.getFullYear(), m = today.getMonth();
    const r = {
      today: [iso(today), iso(today)],
      month: [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))],
      prevMonth: [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
      d30: [iso(new Date(today.getTime() - 29 * 86400000)), iso(today)],
      year: [`${y}-01-01`, `${y}-12-31`],
      all: ['', ''],
    }[kind];
    onChange({ from: r[0], to: r[1] }); setPending(null); setOpen(false);
  };

  const renderMonth = (y, m) => {
    const cells = monthGrid(y, m);
    return (
      <div className="w-[238px]">
        <div className="text-xs font-semibold text-center mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>{MK_MONTHS[m]} {y}</div>
        <div className="grid grid-cols-7 gap-0.5 text-[10px] text-(--text-muted) text-center mb-0.5">{MK_DAYS.map(d => <div key={d}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const s = iso(d);
            const edge = isEdge(s), range = inRange(s), isToday = s === iso(today);
            return (
              <button key={i} type="button" onClick={() => pick(d)} onMouseEnter={() => setHover(s)}
                className={`h-8 rounded-md text-xs transition-colors ${edge ? 'bg-(--primary) text-white font-bold' : range ? 'bg-(--primary-muted) text-(--primary)' : 'hover:bg-(--surface-elevated) text-(--text-primary)'} ${isToday && !edge ? 'ring-1 ring-(--primary)' : ''}`}>
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const next = { y: view.m === 11 ? view.y + 1 : view.y, m: (view.m + 1) % 12 };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" onClick={() => { setOpen(o => !o); setPending(null); }}
        className="input-base text-sm w-full flex items-center gap-2 text-left">
        <Calendar size={14} className="text-(--primary) flex-shrink-0" />
        <span className={`flex-1 truncate ${!from && !to ? 'text-(--text-muted)' : ''}`}>{dateRangeLabel({ from, to }, emptyLabel)}</span>
        {allowEmpty && (from || to) && (
          <span role="button" onClick={(e) => { e.stopPropagation(); onChange({ from: '', to: '' }); }} className="p-0.5 text-(--text-muted) hover:text-(--danger)"><X size={13} /></span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-(--surface) border border-(--border) rounded-xl shadow-2xl p-3" style={{ minWidth: 270 }}>
          {presets && (
            <div className="flex flex-wrap gap-1 mb-2">
              {[['today', 'Денес'], ['month', 'Овој месец'], ['prevMonth', 'Минат месец'], ['d30', '30 дена'], ['year', 'Година'], ...(allowEmpty ? [['all', 'Сите']] : [])].map(([k, l]) => (
                <button key={k} type="button" onClick={() => applyPreset(k)} className="text-[10px] px-2 py-1 rounded-full border border-(--border) text-(--text-secondary) hover:border-(--primary) hover:text-(--primary)">{l}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mb-1">
            <button type="button" onClick={() => setView(v => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))} className="btn-ghost p-1"><ChevronLeft size={14} /></button>
            <span className="text-[10px] text-(--text-muted)">{pending ? `Од ${fmt(pending)} — избери крај (или ист ден)` : 'Избери почеток'}</span>
            <button type="button" onClick={() => setView(next)} className="btn-ghost p-1"><ChevronRight size={14} /></button>
          </div>
          <div className="flex gap-4">
            {renderMonth(view.y, view.m)}
            <div className="hidden md:block">{renderMonth(next.y, next.m)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
