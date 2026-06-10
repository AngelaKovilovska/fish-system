import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  ChevronLeft, ChevronRight, Clock, AlertTriangle, CheckCircle,
  ClipboardList, Sunrise, Sun, Moon, X,
} from 'lucide-react';

const MK_MONTHS = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];
const MK_DAYS_SHORT = ['Пон', 'Вто', 'Сре', 'Чет', 'Пет', 'Саб', 'Нед'];

function getMonthStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

export default function ChecklistHistory() {
  const navigate = useNavigate();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calendarData, setCalendarData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthStr = getMonthStr(currentMonth);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = getFirstDayOfWeek(year, month);
  const todayStr = today.toISOString().split('T')[0];

  const loadCalendar = async (m) => {
    setLoading(true);
    try {
      const data = await api.getCalendar(m);
      setCalendarData(data.days || {});
    } catch (err) {
      console.error(err);
      setCalendarData({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedDay(null);
    loadCalendar(monthStr);
  }, [monthStr]);

  const goMonth = (delta) => {
    setCurrentMonth(new Date(year, month + delta, 1));
  };

  const goToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const isFuture = (day) => {
    const d = new Date(year, month, day);
    return d > today;
  };

  const getDayKey = (day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getDayStatus = (day) => {
    const key = getDayKey(day);
    const data = calendarData[key];
    if (!data) return 'empty';
    const hasChecklist = data.checklist;
    const mealsCount = data.meals?.length || 0;
    const hasAlerts = data.alert_count > 0;
    if (hasAlerts) return 'alerts';
    if (hasChecklist && mealsCount === 3) return 'complete';
    if (hasChecklist || mealsCount > 0) return 'partial';
    return 'empty';
  };

  const STATUS_COLORS = {
    complete: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.4)', dot: '#22C55E' },
    partial: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', dot: '#F59E0B' },
    alerts: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.4)', dot: '#EF4444' },
    empty: { bg: 'transparent', border: 'transparent', dot: null },
  };

  const selectedDayData = selectedDay ? calendarData[getDayKey(selectedDay)] : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 animate-in">
        <button onClick={() => navigate('/')} className="btn-ghost p-1.5 -ml-1.5">
          <ChevronLeft size={20} />
        </button>
        <h1 className="page-title">Историја на записи</h1>
      </div>

      {/* Month navigation */}
      <div className="card !p-3 mb-4 animate-in-delay-1">
        <div className="flex items-center justify-between">
          <button onClick={() => goMonth(-1)}
            className="btn-ghost p-2 rounded-xl">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <h2 className="text-base font-bold text-[var(--text-primary)]"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              {MK_MONTHS[month]} {year}
            </h2>
            {!isCurrentMonth && (
              <button onClick={goToday}
                className="text-[11px] text-[var(--primary)] font-medium hover:underline mt-0.5">
                Оди на денес
              </button>
            )}
          </div>
          <button onClick={() => goMonth(1)}
            className="btn-ghost p-2 rounded-xl"
            disabled={year === today.getFullYear() && month >= today.getMonth()}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card !p-3 mb-4 animate-in-delay-2">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {MK_DAYS_SHORT.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-[var(--text-muted)] uppercase"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {[...Array(35)].map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for offset */}
            {[...Array(firstDayOffset)].map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Day cells */}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const dayKey = getDayKey(day);
              const status = getDayStatus(day);
              const colors = STATUS_COLORS[status];
              const isToday = dayKey === todayStr;
              const future = isFuture(day);
              const isSelected = selectedDay === day;
              const data = calendarData[dayKey];

              return (
                <button
                  key={day}
                  type="button"
                  disabled={future}
                  onClick={() => {
                    // If this day has a record, navigate directly to it
                    if (data?.record_id) {
                      navigate(`/history/${data.record_id}`);
                      return;
                    }
                    // Otherwise toggle the detail panel (for days with only meals or empty)
                    setSelectedDay(isSelected ? null : day);
                  }}
                  className={`
                    aspect-square rounded-xl flex flex-col items-center justify-center
                    transition-all duration-150 relative
                    ${future ? 'opacity-30 cursor-default' : 'cursor-pointer hover:scale-105 active:scale-95'}
                    ${isSelected ? 'ring-2 ring-[var(--primary)] ring-offset-1' : ''}
                    ${isToday ? 'ring-1 ring-[var(--primary)]' : ''}
                  `}
                  style={{
                    background: colors.bg || 'var(--surface)',
                    border: `1.5px solid ${colors.border || 'var(--border)'}`,
                  }}
                >
                  <span className={`text-[13px] font-semibold leading-none ${
                    isToday ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'
                  }`} style={{ fontFamily: 'Sora, sans-serif' }}>
                    {day}
                  </span>

                  {/* Status indicators */}
                  {data && !future && (
                    <div className="flex items-center gap-[2px] mt-1">
                      {data.checklist && (
                        <div className="w-[5px] h-[5px] rounded-full bg-[var(--primary)]" title="Чеклиста" />
                      )}
                      {data.meals?.includes('breakfast') && (
                        <div className="w-[5px] h-[5px] rounded-full bg-amber-400" title="Појадок" />
                      )}
                      {data.meals?.includes('lunch') && (
                        <div className="w-[5px] h-[5px] rounded-full bg-yellow-400" title="Ручек" />
                      )}
                      {data.meals?.includes('dinner') && (
                        <div className="w-[5px] h-[5px] rounded-full bg-indigo-400" title="Вечера" />
                      )}
                      {data.alert_count > 0 && (
                        <div className="w-[5px] h-[5px] rounded-full bg-[var(--danger)]" title="Аларми" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] rounded-full bg-[var(--primary)]" />
            <span className="text-[10px] text-[var(--text-muted)]">Чеклиста</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] rounded-full bg-amber-400" />
            <span className="text-[10px] text-[var(--text-muted)]">Појадок</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] rounded-full bg-yellow-400" />
            <span className="text-[10px] text-[var(--text-muted)]">Ручек</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] rounded-full bg-indigo-400" />
            <span className="text-[10px] text-[var(--text-muted)]">Вечера</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] rounded-full bg-[var(--danger)]" />
            <span className="text-[10px] text-[var(--text-muted)]">Аларм</span>
          </div>
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDay && (
        <div className="card !p-0 overflow-hidden animate-in mb-4"
          style={{ borderLeft: `4px solid ${STATUS_COLORS[getDayStatus(selectedDay)].dot || 'var(--border)'}` }}>
          <div className="px-4 py-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]"
                style={{ fontFamily: 'Sora, sans-serif' }}>
                {selectedDay} {MK_MONTHS[month]} {year}
                <span className="text-[var(--text-muted)] font-normal text-xs ml-2">
                  {new Date(year, month, selectedDay).toLocaleDateString('mk-MK', { weekday: 'long' })}
                </span>
              </h3>
              <button onClick={() => setSelectedDay(null)} className="btn-ghost p-1 rounded-lg">
                <X size={16} />
              </button>
            </div>

            {selectedDayData ? (
              <div className="space-y-2.5">
                {/* Checklist status */}
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    selectedDayData.checklist ? 'bg-green-50' : 'bg-gray-100'
                  }`}>
                    {selectedDayData.checklist
                      ? <CheckCircle size={16} className="text-[var(--success)]" />
                      : <ClipboardList size={16} className="text-[var(--text-muted)]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Чеклиста</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {selectedDayData.checklist
                        ? `Пополнета — ${selectedDayData.checked_by}`
                        : 'Не е пополнета'
                      }
                    </p>
                  </div>
                  {selectedDayData.record_id && (
                    <Link to={`/history/${selectedDayData.record_id}`}
                      className="btn-ghost text-xs text-[var(--primary)]">
                      Детали <ChevronRight size={14} />
                    </Link>
                  )}
                </div>

                {/* Alerts */}
                {selectedDayData.alert_count > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                    <AlertTriangle size={14} className="text-[var(--danger)]" />
                    <span className="text-xs font-semibold text-[var(--danger)]">
                      {selectedDayData.alert_count} {selectedDayData.alert_count === 1 ? 'аларм' : 'аларми'}
                    </span>
                  </div>
                )}

                {/* Meals */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'breakfast', label: 'Појадок', icon: <Sunrise size={14} className="text-amber-500" /> },
                    { key: 'lunch', label: 'Ручек', icon: <Sun size={14} className="text-yellow-500" /> },
                    { key: 'dinner', label: 'Вечера', icon: <Moon size={14} className="text-indigo-400" /> },
                  ].map(meal => {
                    const filled = selectedDayData.meals?.includes(meal.key);
                    const dateStr = getDayKey(selectedDay);
                    return (
                      <Link
                        key={meal.key}
                        to={`/meal/${meal.key}?date=${dateStr}`}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all active:scale-95 ${
                          filled
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        {meal.icon}
                        <span className={`text-[10px] font-semibold ${filled ? 'text-green-700' : 'text-gray-400'}`}>
                          {meal.label}
                        </span>
                        <span className={`text-[9px] ${filled ? 'text-green-600' : 'text-gray-300'}`}>
                          {filled ? '✓ Измени' : '+ Додај'}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <Clock size={24} className="mx-auto text-[var(--text-muted)] mb-1.5" />
                <p className="text-xs text-[var(--text-muted)]">Нема записи за овој ден</p>
                <Link to="/checklist"
                  className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-[var(--primary)] hover:underline">
                  <ClipboardList size={12} /> Пополни чеклиста
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
