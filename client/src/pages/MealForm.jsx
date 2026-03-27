import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { POOL_NUMBERS, FOOD_TYPES } from '../lib/constants';
import { UtensilsCrossed, Fish, Weight, ChevronLeft, Save, Trash2, Sunrise, Sun, Moon, Info, Calendar, Brain, Zap } from 'lucide-react';

const MEAL_LABELS = {
  breakfast: 'Појадок',
  lunch: 'Ручек',
  dinner: 'Вечера',
};
const MEAL_ICONS = {
  breakfast: <Sunrise size={20} className="text-amber-500" />,
  lunch: <Sun size={20} className="text-yellow-500" />,
  dinner: <Moon size={20} className="text-indigo-400" />,
};

export default function MealForm() {
  const navigate = useNavigate();
  const { mealType } = useParams();
  const [activePool, setActivePool] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isEdit, setIsEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [poolMeasurements, setPoolMeasurements] = useState([]);
  const [aiRec, setAiRec] = useState(null);

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const [poolsData, setPoolsData] = useState(
    POOL_NUMBERS.map(n => ({ pool_number: n, food_type: '', food_quantity_gr: '' }))
  );

  const mealLabel = MEAL_LABELS[mealType] || mealType;
  const mealIcon = MEAL_ICONS[mealType] || '🍽️';

  // Load meal data for the selected date
  const loadMealData = useCallback(async (date) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setIsEdit(false);
    setPoolsData(POOL_NUMBERS.map(n => ({ pool_number: n, food_type: '', food_quantity_gr: '' })));

    try {
      const [mealsData, measurementsData, aiData] = await Promise.all([
        api.getMeals(date),
        api.getPoolMeasurements(),
        api.getAIRecommendations().catch(() => null),
      ]);

      setAiRec(aiData);

      const existing = mealsData.meals.filter(m => m.meal_type === mealType);
      if (existing.length > 0) {
        setIsEdit(true);
        setPoolsData(POOL_NUMBERS.map(n => {
          const meal = existing.find(m => m.pool_number === n);
          return {
            pool_number: n,
            food_type: meal?.food_type || '',
            food_quantity_gr: meal?.food_quantity_gr != null && meal.food_quantity_gr > 0
              ? meal.food_quantity_gr : '',
          };
        }));
      }
      setPoolMeasurements(measurementsData.measurements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [mealType]);

  // Initial load
  useEffect(() => {
    if (!MEAL_LABELS[mealType]) {
      navigate('/');
      return;
    }
    loadMealData(selectedDate);
  }, [mealType, navigate, selectedDate, loadMealData]);

  // Handle date change
  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setActivePool(1);
  };

  const updatePool = (poolNum, field, value) => {
    setPoolsData(prev => prev.map(p =>
      p.pool_number === poolNum ? { ...p, [field]: value } : p
    ));
  };

  // Validation: check which pools have incomplete data
  const getIncomplePools = () => {
    const incomplete = [];
    for (const p of poolsData) {
      const hasType = p.food_type && p.food_type.trim() !== '';
      const hasQty = p.food_quantity_gr !== '' && parseFloat(p.food_quantity_gr) > 0;
      if ((hasType && !hasQty) || (!hasType && hasQty)) {
        incomplete.push(p.pool_number);
      }
    }
    return incomplete;
  };

  const hasAnyData = () => {
    return poolsData.some(p =>
      (p.food_type && p.food_type.trim() !== '') ||
      (p.food_quantity_gr !== '' && parseFloat(p.food_quantity_gr) > 0)
    );
  };

  const handleSubmit = async () => {
    setError('');

    if (!hasAnyData()) {
      setError('Внесете храна барем за еден базен.');
      return;
    }

    const incomplete = getIncomplePools();
    if (incomplete.length > 0) {
      const poolNames = incomplete.map(n => `Базен ${n}`).join(', ');
      setError(`${poolNames} — внесете и тип на храна и количина.`);
      setActivePool(incomplete[0]);
      return;
    }

    setSaving(true);
    try {
      await api.saveMeal({
        date: selectedDate,
        meal_type: mealType,
        pools: poolsData,
      });
      setSuccess(isEdit ? 'Оброкот е ажуриран!' : 'Оброкот е зачуван!');
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Дали сте сигурни дека сакате да го избришете оброкот "${mealLabel}"?`)) return;
    setDeleting(true);
    setError('');
    try {
      await api.deleteMeal(selectedDate, mealType);
      setSuccess('Оброкот е избришан!');
      setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  const poolData = poolsData.find(p => p.pool_number === activePool) || {};
  const measurement = poolMeasurements.find(m => m.pool_number === activePool);

  const isPoolIncomplete = (num) => {
    const p = poolsData.find(pd => pd.pool_number === num);
    if (!p) return false;
    const hasType = p.food_type && p.food_type.trim() !== '';
    const hasQty = p.food_quantity_gr !== '' && parseFloat(p.food_quantity_gr) > 0;
    return (hasType && !hasQty) || (!hasType && hasQty);
  };

  const isPoolFilled = (num) => {
    const p = poolsData.find(pd => pd.pool_number === num);
    if (!p) return false;
    return (p.food_type && p.food_type.trim() !== '') && (p.food_quantity_gr !== '' && parseFloat(p.food_quantity_gr) > 0);
  };

  const currentHasType = poolData.food_type && poolData.food_type.trim() !== '';
  const currentHasQty = poolData.food_quantity_gr !== '' && parseFloat(poolData.food_quantity_gr) > 0;
  const currentIncomplete = (currentHasType && !currentHasQty) || (!currentHasType && currentHasQty);
  const isHistorical = selectedDate !== today;

  return (
    <div className="max-w-lg mx-auto">
      {/* Title */}
      <div className="flex items-center gap-3 mb-4 animate-in">
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
          <UtensilsCrossed size={18} />
        </div>
        <div>
          <h1 className="page-title flex items-center gap-2">{mealIcon} {mealLabel}</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            {isEdit ? 'Ажурирање на оброк' : 'Внесете храна по базен'}
          </p>
        </div>
      </div>

      {/* Date picker */}
      <div className="card mb-4 animate-in-delay-1 !py-3">
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-[var(--primary)] flex-shrink-0" />
          <label className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            Датум
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="input-base !py-1.5 !text-sm flex-1"
            max={today}
          />
          {isHistorical && (
            <button
              type="button"
              onClick={() => handleDateChange(today)}
              className="text-[11px] text-[var(--primary)] font-medium whitespace-nowrap hover:underline"
            >
              Денес
            </button>
          )}
        </div>
        {isHistorical && (
          <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1.5 ml-7">
            <Info size={12} />
            Уредувате оброк за минат датум
          </p>
        )}
      </div>

      {/* Pool tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-4 animate-in-delay-1">
        {POOL_NUMBERS.map(num => (
          <button
            key={num}
            type="button"
            onClick={() => setActivePool(num)}
            className={`${activePool === num ? 'chip-active' : 'chip-inactive'} ${
              isPoolIncomplete(num) ? '!border-[var(--danger)] !text-[var(--danger)]' : ''
            } ${isPoolFilled(num) && activePool !== num ? '!border-[var(--success)] !text-[var(--success)]' : ''}`}
          >
            Б{num}
          </button>
        ))}
      </div>

      {/* Pool form */}
      <div className={`card mb-4 animate-in-delay-2 ${currentIncomplete ? 'border-[var(--danger)]' : ''}`}>
        <div className="space-y-3.5">
          <div className="flex items-center gap-2">
            <Fish size={16} className="text-[var(--primary)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Базен бр. {activePool}
            </h3>
          </div>

          {/* Pool measurement info */}
          {measurement && (
            <div className="info-box flex items-start gap-2 text-xs">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <span>Последно мерење: <strong>{measurement.fish_count}</strong> риби, <strong>{measurement.avg_weight_gr} gr</strong></span>
            </div>
          )}

          {/* AI Recommendation Info Bar */}
          {(() => {
            const poolAi = aiRec?.pools?.[activePool];
            if (!poolAi?.hasData) return null;
            const rec = poolAi.recommendation;
            const mealsCount = rec.mealsPerDay;
            const perMealGr = rec.perMealGr;
            const dailyGr = rec.dailyFoodGr;

            return (
              <div className="rounded-[var(--r-sm)] p-3 flex flex-col gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(124,58,237,0.05))',
                  border: '1px solid rgba(139,92,246,0.15)',
                }}>
                <div className="flex items-center gap-1.5">
                  <Brain size={13} className="text-purple-500 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300"
                    style={{ fontFamily: 'Sora, sans-serif' }}>AI Препорака</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-secondary)]">
                      <strong className="text-purple-600 dark:text-purple-400">{perMealGr}g</strong> /оброк
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">×{mealsCount} = {dailyGr}g/ден</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium dark:bg-purple-900/30 dark:text-purple-300">
                    {rec.foodType} {rec.feedSizeMm}mm
                  </span>
                </div>
                {poolAi.warnings?.transitionNote && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Zap size={10} /> Транзиција
                  </p>
                )}
              </div>
            );
          })()}

          {/* Food type */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              <UtensilsCrossed size={12} className="text-[var(--primary)]" />
              Тип на храна <span className="text-[var(--danger)]">*</span>
            </label>
            <select
              value={poolData.food_type ?? ''}
              onChange={(e) => updatePool(activePool, 'food_type', e.target.value)}
              className={`input-base ${!currentHasType && currentHasQty ? 'border-[var(--danger)]' : ''}`}
            >
              <option value="">-- Избери тип на храна --</option>
              {FOOD_TYPES.map(ft => <option key={ft} value={ft}>{ft}</option>)}
            </select>
          </div>

          {/* Food quantity */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              <Weight size={12} className="text-[var(--primary)]" />
              Количина на храна (gr) <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="number"
              step="any"
              value={poolData.food_quantity_gr ?? ''}
              onChange={(e) => updatePool(activePool, 'food_quantity_gr', e.target.value)}
              className={`input-base ${currentHasType && !currentHasQty ? 'border-[var(--danger)]' : ''}`}
              placeholder="нпр. 200"
            />
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && <div className="alert-danger mb-3 animate-in text-sm">{error}</div>}
      {success && <div className="alert-success mb-3 animate-in text-sm">{success}</div>}

      {/* Buttons */}
      <div className="flex gap-3 animate-in-delay-3">
        <button type="button" onClick={() => navigate('/')} className="btn-secondary py-2.5 px-4">
          <ChevronLeft size={16} />
        </button>
        {isEdit && (
          <button type="button" onClick={handleDelete} disabled={deleting} className="btn-danger py-2.5 px-4">
            <Trash2 size={16} />
          </button>
        )}
        <button type="button" onClick={handleSubmit} disabled={saving} className="btn-primary flex-1 py-2.5">
          {saving ? (
            <span className="flex items-center gap-2">
              <div className="wave-loader"><span /><span /><span /><span /></div>
              Се зачувува...
            </span>
          ) : (
            <><Save size={16} /> {isEdit ? 'Ажурирај' : 'Зачувај'}</>
          )}
        </button>
      </div>
    </div>
  );
}
