import { POOL_NUMBERS } from '../../lib/constants';
import { useState, useImperativeHandle, forwardRef } from 'react';
import { Info, Fish, ShoppingCart, Skull, Weight, Hash, ClipboardList } from 'lucide-react';

const FeedingStep = forwardRef(function FeedingStep({ data, onChange, poolMeasurements }, ref) {
  const [activePool, setActivePool] = useState(1);

  // Expose tryAdvancePool to parent so "Next" can cycle pools first
  useImperativeHandle(ref, () => ({
    tryAdvancePool() {
      const idx = POOL_NUMBERS.indexOf(activePool);
      if (idx < POOL_NUMBERS.length - 1) {
        setActivePool(POOL_NUMBERS[idx + 1]);
        return true; // consumed — stay on this step
      }
      return false; // last pool — let parent advance step
    },
    tryGoBackPool() {
      const idx = POOL_NUMBERS.indexOf(activePool);
      if (idx > 0) {
        setActivePool(POOL_NUMBERS[idx - 1]);
        return true;
      }
      return false;
    },
    activePool,
  }), [activePool]);

  const getMeasurement = (poolNum) => poolMeasurements?.find(m => m.pool_number === poolNum);

  const getPoolData = (poolNum) => {
    return data.find(p => p.pool_number === poolNum) || {
      pool_number: poolNum, fish_count: '', avg_weight_gr: '',
      sold_count: 0, dead_count: 0,
    };
  };

  const updatePool = (poolNum, field, value) => {
    const updated = [...data];
    const idx = updated.findIndex(p => p.pool_number === poolNum);
    if (idx >= 0) { updated[idx] = { ...updated[idx], [field]: value }; }
    else { updated.push({ pool_number: poolNum, [field]: value, sold_count: 0, dead_count: 0 }); }
    onChange(updated);
  };

  const poolData = getPoolData(activePool);
  const measurement = getMeasurement(activePool);
  const displayAvgWeight = poolData.avg_weight_gr !== '' && poolData.avg_weight_gr != null
    ? poolData.avg_weight_gr : (measurement?.avg_weight_gr ?? '');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
          <ClipboardList size={18} />
        </div>
        <div>
          <h2 className="section-title">4. Евиденција на базени</h2>
          <p className="section-subtitle">Внесете податоци за секој базен</p>
        </div>
      </div>

      {/* Pool tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {POOL_NUMBERS.map(num => (
          <button
            key={num}
            type="button"
            onClick={() => setActivePool(num)}
            className={activePool === num ? 'chip-active' : 'chip-inactive'}
          >
            Б{num}
          </button>
        ))}
      </div>

      {/* Pool form */}
      <div className="space-y-3.5">
        <div className="flex items-center gap-2">
          <Fish size={16} className="text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            Базен бр. {activePool}
          </h3>
        </div>

        {measurement && (
          <div className="info-box flex items-start gap-2 text-xs">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>Последно мерење: <strong>{measurement.fish_count}</strong> риби, <strong>{measurement.avg_weight_gr} gr</strong> просечна тежина</span>
          </div>
        )}

        {/* Fish count & weight */}
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              <Hash size={12} className="text-[var(--primary)]" />
              Број на риби
            </label>
            <input type="number" value={poolData.fish_count ?? ''}
              onChange={(e) => updatePool(activePool, 'fish_count', e.target.value)}
              className="input-base" placeholder={measurement ? `${measurement.fish_count}` : 'нпр. 500'} />
            {measurement && (
              <p className="text-[10px] text-[var(--primary)] mt-1 font-medium">
                Последно мерење: {measurement.fish_count}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              <Weight size={12} className="text-[var(--primary)]" />
              Тежина (gr)
              {measurement && <span className="pill pill-blue text-[9px] ml-1">мерење</span>}
            </label>
            <input type="number" step="any" value={displayAvgWeight}
              onChange={(e) => updatePool(activePool, 'avg_weight_gr', e.target.value)}
              className="input-base"
              placeholder={measurement ? `${measurement.avg_weight_gr}` : 'нпр. 150'} />
            {measurement && (
              <p className="text-[10px] text-[var(--primary)] mt-1 font-medium">
                Последно мерење: {measurement.avg_weight_gr} gr
              </p>
            )}
          </div>
        </div>

        {/* Sold & dead */}
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              <ShoppingCart size={12} className="text-[var(--primary)]" />
              Продадени
            </label>
            <input type="number" value={poolData.sold_count ?? 0}
              onChange={(e) => updatePool(activePool, 'sold_count', e.target.value)}
              className="input-base" placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              <Skull size={12} className="text-[var(--danger)]" />
              Угинати
            </label>
            <input type="number" value={poolData.dead_count ?? 0}
              onChange={(e) => updatePool(activePool, 'dead_count', e.target.value)}
              className="input-base" placeholder="0" />
          </div>
        </div>
      </div>
    </div>
  );
});

export default FeedingStep;
