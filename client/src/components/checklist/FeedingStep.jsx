import { POOL_NUMBERS } from '../../lib/constants';
import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Info, Fish, ShoppingCart, Skull, Weight, Hash, ClipboardList } from 'lucide-react';

const FeedingStep = forwardRef(function FeedingStep({ data, onChange, poolMeasurements, fishInventory }, ref) {
  const [activePool, setActivePool] = useState(1);

  // Helper: does a pool have fish?
  const poolHasFish = (poolNum) => {
    const inv = fishInventory?.find(fi => fi.pool_number === poolNum);
    return inv && inv.current_count > 0;
  };

  // On first render (when fishInventory loads), jump to the first pool with fish
  useEffect(() => {
    if (fishInventory?.length > 0) {
      const firstWithFish = POOL_NUMBERS.find(poolHasFish);
      if (firstWithFish && !poolHasFish(activePool)) {
        setActivePool(firstWithFish);
      }
    }
  }, [fishInventory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose tryAdvancePool to parent so "Next" can cycle pools first
  // Automatically skips pools with 0 fish
  useImperativeHandle(ref, () => ({
    tryAdvancePool() {
      const idx = POOL_NUMBERS.indexOf(activePool);
      // Find next pool that has fish
      for (let i = idx + 1; i < POOL_NUMBERS.length; i++) {
        if (poolHasFish(POOL_NUMBERS[i])) {
          setActivePool(POOL_NUMBERS[i]);
          return true; // consumed — stay on this step
        }
      }
      return false; // no more pools with fish — let parent advance step
    },
    tryGoBackPool() {
      const idx = POOL_NUMBERS.indexOf(activePool);
      // Find previous pool that has fish
      for (let i = idx - 1; i >= 0; i--) {
        if (poolHasFish(POOL_NUMBERS[i])) {
          setActivePool(POOL_NUMBERS[i]);
          return true;
        }
      }
      return false;
    },
    activePool,
  }), [activePool, fishInventory]);

  const getMeasurement = (poolNum) => poolMeasurements?.find(m => m.pool_number === poolNum);
  const getInventory = (poolNum) => fishInventory?.find(inv => inv.pool_number === poolNum);

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
  const inventory = getInventory(activePool);
  const displayAvgWeight = poolData.avg_weight_gr !== '' && poolData.avg_weight_gr != null
    ? poolData.avg_weight_gr : (measurement?.avg_weight_gr ?? '');

  // Current fish count comes from inventory
  const currentFishCount = inventory?.current_count ?? 0;

  // Calculate what the count will be after today's dead + sold
  const todayDead = parseInt(poolData.dead_count) || 0;
  const todaySold = parseInt(poolData.sold_count) || 0;
  const afterCount = currentFishCount - todayDead - todaySold;

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
        {POOL_NUMBERS.map(num => {
          const inv = getInventory(num);
          const isEmpty = !inv || inv.current_count === 0;
          return (
            <button
              key={num}
              type="button"
              onClick={() => setActivePool(num)}
              className={activePool === num ? 'chip-active' : 'chip-inactive'}
              style={isEmpty ? { opacity: 0.4, textDecoration: 'line-through' } : {}}
              title={isEmpty ? 'Празен базен (0 риби)' : `${inv.current_count} риби`}
            >
              Б{num}
              {inv && inv.current_count > 0 && (
                <span className="ml-1 text-[9px] opacity-70">({inv.current_count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pool form */}
      <div className="space-y-3.5">
        <div className="flex items-center gap-2">
          <Fish size={16} className="text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            Базен бр. {activePool}
          </h3>
        </div>

        {/* Fish count display - automatic from inventory */}
        <div className="rounded-xl p-3.5"
          style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(37,99,235,0.03))', border: '1px solid rgba(37,99,235,0.15)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash size={14} className="text-[var(--primary)]" />
              <span className="text-xs font-semibold text-[var(--text-secondary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                Број на риби
              </span>
            </div>
            <span className="text-lg font-bold text-[var(--primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
              {currentFishCount}
            </span>
          </div>
          {(todayDead > 0 || todaySold > 0) && (
            <div className="mt-2 pt-2 border-t border-[rgba(37,99,235,0.1)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)]">
                По денешен запис:
                {todayDead > 0 && <span className="text-[var(--danger)]"> -{todayDead} угинати</span>}
                {todayDead > 0 && todaySold > 0 && ','}
                {todaySold > 0 && <span className="text-amber-600"> -{todaySold} продадени</span>}
              </span>
              <span className={`text-sm font-bold ${afterCount < currentFishCount ? 'text-[var(--danger)]' : 'text-[var(--primary)]'}`}
                style={{ fontFamily: 'Sora, sans-serif' }}>
                → {afterCount}
              </span>
            </div>
          )}
        </div>

        {afterCount < 0 && (
          <div className="rounded-xl p-2.5 text-xs font-medium text-[var(--danger)]"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            Внимание: Угинати + продадени ({todayDead + todaySold}) е поголемо од бројот на риби ({currentFishCount})!
          </div>
        )}

        {measurement && (
          <div className="info-box flex items-start gap-2 text-xs">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>Последно мерење: <strong>{measurement.fish_count}</strong> риби, <strong>{measurement.avg_weight_gr} gr</strong> просечна тежина</span>
          </div>
        )}

        {/* Weight */}
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
