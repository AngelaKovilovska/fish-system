import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { POOL_NUMBERS, FOOD_TYPES } from '../lib/constants';
import { UtensilsCrossed, Fish, Weight, ChevronLeft, Save, AlertCircle, Sunrise, Sun, Moon } from 'lucide-react';

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

  const today = new Date().toISOString().split('T')[0];

  const [poolsData, setPoolsData] = useState(
    POOL_NUMBERS.map(n => ({ pool_number: n, food_type: '', food_quantity_gr: '' }))
  );

  const mealLabel = MEAL_LABELS[mealType] || mealType;
  const mealIcon = MEAL_ICONS[mealType] || '🍽️';

  // Load existing meal data if already filled
  useEffect(() => {
    if (!MEAL_LABELS[mealType]) {
      navigate('/');
      return;
    }

    api.getMeals(today)
      .then(data => {
        const existing = data.meals.filter(m => m.meal_type === mealType);
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
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mealType, today, navigate]);

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
      // If one is filled but not the other → incomplete
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

    // Must have at least one pool with food data
    if (!hasAnyData()) {
      setError('Внесете храна барем за еден базен.');
      return;
    }

    // Check incomplete pools (one field filled, other missing)
    const incomplete = getIncomplePools();
    if (incomplete.length > 0) {
      const poolNames = incomplete.map(n => `Базен ${n}`).join(', ');
      setError(`${poolNames} — внесете и тип на храна и количина.`);
      setActivePool(incomplete[0]); // Navigate to first incomplete pool
      return;
    }

    setSaving(true);
    try {
      await api.saveMeal({
        date: today,
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

  // Check if current pool has incomplete data (for red border highlight)
  const isPoolIncomplete = (num) => {
    const p = poolsData.find(pd => pd.pool_number === num);
    if (!p) return false;
    const hasType = p.food_type && p.food_type.trim() !== '';
    const hasQty = p.food_quantity_gr !== '' && parseFloat(p.food_quantity_gr) > 0;
    return (hasType && !hasQty) || (!hasType && hasQty);
  };

  // Check if a pool has been filled (both fields)
  const isPoolFilled = (num) => {
    const p = poolsData.find(pd => pd.pool_number === num);
    if (!p) return false;
    return (p.food_type && p.food_type.trim() !== '') && (p.food_quantity_gr !== '' && parseFloat(p.food_quantity_gr) > 0);
  };

  // Current pool missing fields
  const currentHasType = poolData.food_type && poolData.food_type.trim() !== '';
  const currentHasQty = poolData.food_quantity_gr !== '' && parseFloat(poolData.food_quantity_gr) > 0;
  const currentIncomplete = (currentHasType && !currentHasQty) || (!currentHasType && currentHasQty);

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
        <button type="button" onClick={() => navigate('/')} className="btn-secondary flex-1 py-2.5">
          <ChevronLeft size={16} /> Назад
        </button>
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
