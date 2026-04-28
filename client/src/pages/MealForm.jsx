import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { POOL_NUMBERS, FOOD_TYPES } from '../lib/constants';
import { UtensilsCrossed, Fish, Weight, ChevronLeft, Save, Trash2, Sunrise, Sun, Moon, Info, Calendar, Brain, Zap, Copy, Plus, X } from 'lucide-react';

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
  const [fishInventory, setFishInventory] = useState([]);
  const [aiRec, setAiRec] = useState(null);

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const emptyFood = () => ({ food_type: '', food_quantity_gr: '' });
  const [poolsData, setPoolsData] = useState(
    POOL_NUMBERS.map(n => ({ pool_number: n, foods: [emptyFood()] }))
  );

  const mealLabel = MEAL_LABELS[mealType] || mealType;
  const mealIcon = MEAL_ICONS[mealType] || '🍽️';

  const [lastMealDate, setLastMealDate] = useState(null);
  const [lastMealPools, setLastMealPools] = useState([]);
  const [usingDefaults, setUsingDefaults] = useState(false);

  // Load meal data for the selected date
  const loadMealData = useCallback(async (date) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setIsEdit(false);
    setUsingDefaults(false);
    setLastMealDate(null);
    setLastMealPools([]);
    setPoolsData(POOL_NUMBERS.map(n => ({ pool_number: n, foods: [emptyFood()] })));

    try {
      const [mealsData, measurementsData, fishInvData, aiData, lastValues] = await Promise.all([
        api.getMeals(date),
        api.getPoolMeasurements(),
        api.getPoolFishInventory().catch(() => ({ inventory: [] })),
        api.getAIRecommendations().catch(() => null),
        api.getLastMealValues(mealType).catch(() => ({ pools: [], lastDate: null })),
      ]);

      setAiRec(aiData);

      // Save last values for optional fill button
      if (lastValues.pools && lastValues.pools.length > 0) {
        setLastMealDate(lastValues.lastDate);
        setLastMealPools(lastValues.pools);
      }

      const existing = mealsData.meals.filter(m => m.meal_type === mealType);
      if (existing.length > 0) {
        // Editing existing meal for this date — group rows by pool_number
        setIsEdit(true);
        setPoolsData(POOL_NUMBERS.map(n => {
          const poolRows = existing.filter(m => m.pool_number === n);
          const foods = poolRows
            .filter(m => m.food_type || (m.food_quantity_gr != null && m.food_quantity_gr > 0))
            .map(m => ({
              food_type: m.food_type || '',
              food_quantity_gr: m.food_quantity_gr != null && m.food_quantity_gr > 0
                ? m.food_quantity_gr : '',
            }));
          return {
            pool_number: n,
            foods: foods.length > 0 ? foods : [emptyFood()],
          };
        }));
      }
      // Fields stay empty for new meals — user can click button to load last values
      setPoolMeasurements(measurementsData.measurements || []);
      setFishInventory(fishInvData.inventory || []);
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

  const fillFromLast = () => {
    if (lastMealPools.length === 0) return;
    setUsingDefaults(true);
    setPoolsData(POOL_NUMBERS.map(n => {
      const last = lastMealPools.find(p => p.pool_number === n);
      // Server now returns foods[] array per pool
      const foods = last?.foods?.length > 0
        ? last.foods.map(f => ({
            food_type: f.food_type || '',
            food_quantity_gr: f.food_quantity_gr != null && parseFloat(f.food_quantity_gr) > 0
              ? parseFloat(f.food_quantity_gr) : '',
          }))
        : last?.food_type
          ? [{ food_type: last.food_type, food_quantity_gr: parseFloat(last.food_quantity_gr) || '' }]
          : [emptyFood()];
      return { pool_number: n, foods };
    }));
  };

  const updateFood = (poolNum, foodIndex, field, value) => {
    setPoolsData(prev => prev.map(p => {
      if (p.pool_number !== poolNum) return p;
      const foods = p.foods.map((f, i) => i === foodIndex ? { ...f, [field]: value } : f);
      return { ...p, foods };
    }));
  };

  const addFood = (poolNum) => {
    setPoolsData(prev => prev.map(p => {
      if (p.pool_number !== poolNum) return p;
      return { ...p, foods: [...p.foods, emptyFood()] };
    }));
  };

  const removeFood = (poolNum, foodIndex) => {
    setPoolsData(prev => prev.map(p => {
      if (p.pool_number !== poolNum) return p;
      if (p.foods.length <= 1) return { ...p, foods: [emptyFood()] }; // keep at least one
      return { ...p, foods: p.foods.filter((_, i) => i !== foodIndex) };
    }));
  };

  // Validation helpers for multi-food entries
  const isFoodComplete = (f) => {
    const hasType = f.food_type && f.food_type.trim() !== '';
    const hasQty = f.food_quantity_gr !== '' && parseFloat(f.food_quantity_gr) > 0;
    return hasType && hasQty;
  };
  const isFoodPartial = (f) => {
    const hasType = f.food_type && f.food_type.trim() !== '';
    const hasQty = f.food_quantity_gr !== '' && parseFloat(f.food_quantity_gr) > 0;
    return (hasType && !hasQty) || (!hasType && hasQty);
  };

  const getIncomplePools = () => {
    const incomplete = [];
    for (const p of poolsData) {
      if (p.foods.some(isFoodPartial)) {
        incomplete.push(p.pool_number);
      }
    }
    return incomplete;
  };

  const hasAnyData = () => {
    return poolsData.some(p => p.foods.some(f =>
      (f.food_type && f.food_type.trim() !== '') ||
      (f.food_quantity_gr !== '' && parseFloat(f.food_quantity_gr) > 0)
    ));
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
        pools: poolsData.map(p => ({
          pool_number: p.pool_number,
          foods: p.foods.filter(f => isFoodComplete(f)),
        })),
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

  const poolData = poolsData.find(p => p.pool_number === activePool) || { foods: [emptyFood()] };
  const measurement = poolMeasurements.find(m => m.pool_number === activePool);
  const poolInv = fishInventory.find(fi => fi.pool_number === activePool);

  const isPoolIncomplete = (num) => {
    const p = poolsData.find(pd => pd.pool_number === num);
    if (!p) return false;
    return p.foods.some(isFoodPartial);
  };

  const isPoolFilled = (num) => {
    const p = poolsData.find(pd => pd.pool_number === num);
    if (!p) return false;
    return p.foods.some(isFoodComplete);
  };

  const currentIncomplete = poolData.foods.some(isFoodPartial);
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fish size={16} className="text-[var(--primary)]" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                Базен бр. {activePool}
              </h3>
            </div>
            {!isEdit && lastMealPools.length > 0 && !usingDefaults && (
              <button
                type="button"
                onClick={fillFromLast}
                className="text-[11px] font-semibold text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                <Copy size={12} />
                Пополни
              </button>
            )}
          </div>

          {/* Pool fish count info */}
          {(poolInv || measurement) && (() => {
            const count = poolInv?.current_count ?? measurement?.fish_count ?? 0;
            const weight = parseFloat(measurement?.avg_weight_gr) || 0;
            return (
              <div className="info-box flex items-start gap-2 text-xs">
                <Fish size={14} className="flex-shrink-0 mt-0.5" />
                <span>Актуелен број на риби: <strong>{count}</strong>
                  {weight > 0 ? <> · <strong>{weight} gr</strong>/риба</> : ''}
                </span>
              </div>
            );
          })()}

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
                  background: 'linear-gradient(135deg, rgba(109,40,217,0.10), rgba(139,92,246,0.07))',
                  border: '1px solid rgba(109,40,217,0.22)',
                }}>
                <div className="flex items-center gap-1.5">
                  <Brain size={13} style={{ color: '#7c3aed' }} className="flex-shrink-0" />
                  <span className="text-[11px] font-semibold"
                    style={{ fontFamily: 'Sora, sans-serif', color: '#6d28d9' }}>AI Препорака</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-secondary)]">
                      <strong style={{ color: '#7c3aed' }}>{perMealGr}g</strong> /оброк
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">×{mealsCount} = {dailyGr}g/ден</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      background: 'rgba(139,92,246,0.18)',
                      color: '#6d28d9',
                    }}>
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

          {/* Food entries — multiple food types per pool */}
          {poolData.foods.map((food, fi) => {
            const hasType = food.food_type && food.food_type.trim() !== '';
            const hasQty = food.food_quantity_gr !== '' && parseFloat(food.food_quantity_gr) > 0;
            return (
              <div key={fi} className={`${fi > 0 ? 'pt-3 border-t border-dashed border-[var(--border)]' : ''}`}>
                {poolData.foods.length > 1 && (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-[var(--text-muted)]"
                      style={{ fontFamily: 'Sora, sans-serif' }}>
                      Храна {fi + 1}
                    </span>
                    <button type="button" onClick={() => removeFood(activePool, fi)}
                      className="text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded-full p-0.5 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
                      style={{ fontFamily: 'Sora, sans-serif' }}>
                      <UtensilsCrossed size={12} className="text-[var(--primary)]" />
                      Тип на храна <span className="text-[var(--danger)]">*</span>
                    </label>
                    <select
                      value={food.food_type ?? ''}
                      onChange={(e) => updateFood(activePool, fi, 'food_type', e.target.value)}
                      className={`input-base ${!hasType && hasQty ? 'border-[var(--danger)]' : ''}`}
                    >
                      <option value="">-- Избери тип на храна --</option>
                      {FOOD_TYPES.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
                      style={{ fontFamily: 'Sora, sans-serif' }}>
                      <Weight size={12} className="text-[var(--primary)]" />
                      Количина (gr) <span className="text-[var(--danger)]">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={food.food_quantity_gr ?? ''}
                      onChange={(e) => updateFood(activePool, fi, 'food_quantity_gr', e.target.value)}
                      className={`input-base ${hasType && !hasQty ? 'border-[var(--danger)]' : ''}`}
                      placeholder="нпр. 200"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add another food type */}
          <button type="button" onClick={() => addFood(activePool)}
            className="w-full py-2 rounded-lg border border-dashed border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors flex items-center justify-center gap-1.5"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            <Plus size={14} />
            Додади уште еден тип храна
          </button>
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
