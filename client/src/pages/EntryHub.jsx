import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  ClipboardList, Sunrise, Sun, Moon,
  Check, ChevronRight, Calendar, Scale, Package,
} from 'lucide-react';

const MEALS = [
  { type: 'breakfast', label: 'Појадок', icon: Sunrise, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)' },
  { type: 'lunch', label: 'Ручек', icon: Sun, color: '#eab308', bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.18)' },
  { type: 'dinner', label: 'Вечера', icon: Moon, color: '#6366f1', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.18)' },
];

export default function EntryHub() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const today = new Date().toISOString().split('T')[0];
  const [checklistDone, setChecklistDone] = useState(false);
  const [mealStatus, setMealStatus] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStatus() {
      try {
        const [recordsRes, mealsRes] = await Promise.all([
          api.getRecords({ from: today, to: today, limit: 1 }).catch(() => null),
          api.getMealsStatus(today).catch(() => null),
        ]);

        // Check if checklist exists for today
        if (recordsRes?.records?.length > 0) {
          setChecklistDone(true);
        }

        // Meal status
        if (mealsRes?.status) {
          setMealStatus(mealsRes.status);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [today]);

  const todayFormatted = new Date().toLocaleDateString('mk-MK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-5 animate-in">
        <h1 className="page-title">Внес на податоци</h1>
        <div className="flex items-center gap-1.5 mt-1">
          <Calendar size={13} className="text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-secondary)] capitalize">{todayFormatted}</p>
        </div>
      </div>

      {/* Checklist card */}
      <Link to="/checklist"
        className="card card-hover mb-3 animate-in-delay-1 !py-4 flex items-center gap-4 group">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: checklistDone
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'linear-gradient(135deg, var(--primary), var(--primary-deep))',
          }}>
          {checklistDone
            ? <Check size={22} className="text-white" />
            : <ClipboardList size={22} className="text-white" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[var(--text-primary)]"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            Дневна чеклиста
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {checklistDone
              ? 'Завршена — клик за преглед или промена'
              : 'Вода, филтрација, визуелен преглед, активности'
            }
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {checklistDone && (
            <span className="pill pill-success text-[10px]">Готово</span>
          )}
          <ChevronRight size={18} className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" />
        </div>
      </Link>

      {/* Separator */}
      <div className="flex items-center gap-3 my-4 animate-in-delay-1">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider"
          style={{ fontFamily: 'Sora, sans-serif' }}>Оброци</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      {/* Meal cards */}
      <div className="space-y-3">
        {MEALS.map((meal, idx) => {
          const status = mealStatus[meal.type];
          const isDone = status?.filled;
          const MealIcon = meal.icon;

          return (
            <Link key={meal.type} to={`/meal/${meal.type}`}
              className={`card card-hover !py-4 flex items-center gap-4 group animate-in-delay-${idx + 2}`}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: isDone
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                    : meal.bg,
                  border: isDone ? 'none' : `1px solid ${meal.border}`,
                }}>
                {isDone
                  ? <Check size={22} className="text-white" />
                  : <MealIcon size={22} style={{ color: meal.color }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)]"
                  style={{ fontFamily: 'Sora, sans-serif' }}>
                  {meal.label}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {isDone
                    ? `Внесено од ${status.fed_by_name || '—'}`
                    : 'Тип на храна и количина по базен'
                  }
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isDone && (
                  <span className="pill pill-success text-[10px]">Готово</span>
                )}
                <ChevronRight size={18} className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Admin-only: Measurements & Inventory */}
      {isAdmin && (
        <>
          <div className="flex items-center gap-3 my-4 animate-in-delay-1">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider"
              style={{ fontFamily: 'Sora, sans-serif' }}>Админ</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="space-y-3">
            <Link to="/admin/measurements"
              className="card card-hover !py-4 flex items-center gap-4 group animate-in-delay-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
                <Scale size={22} style={{ color: '#6366f1' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)]"
                  style={{ fontFamily: 'Sora, sans-serif' }}>
                  Мерења на базени
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Број на риби и просечна тежина по базен
                </p>
              </div>
              <ChevronRight size={18} className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors flex-shrink-0" />
            </Link>

            <Link to="/admin/inventory"
              className="card card-hover !py-4 flex items-center gap-4 group animate-in-delay-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>
                <Package size={22} style={{ color: '#10b981' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)]"
                  style={{ fontFamily: 'Sora, sans-serif' }}>
                  Набавки на храна
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Залихи, нови набавки и историја
                </p>
              </div>
              <ChevronRight size={18} className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors flex-shrink-0" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
