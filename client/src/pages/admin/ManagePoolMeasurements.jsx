import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { POOL_NUMBERS } from '../../lib/constants';
import { Save, Loader2, Info, Gauge, Fish, Weight, Calendar, Trash2, History, ChevronDown, ChevronUp, Check, ChevronLeft } from 'lucide-react';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ManagePoolMeasurements() {
  const navigate = useNavigate();
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePool, setActivePool] = useState(POOL_NUMBERS[0]);
  const [measuredDate, setMeasuredDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [fishInventory, setFishInventory] = useState([]);

  // Per-pool form data: { 1: { fishCount: '', avgWeight: '' }, 2: { ... }, ... }
  const [poolData, setPoolData] = useState(() => {
    const initial = {};
    POOL_NUMBERS.forEach(n => { initial[n] = { fishCount: '', avgWeight: '' }; });
    return initial;
  });

  const updatePoolField = (poolNum, field, value) => {
    setPoolData(prev => ({ ...prev, [poolNum]: { ...prev[poolNum], [field]: value } }));
  };

  const load = async () => {
    try {
      const [measData, invData] = await Promise.all([
        api.getPoolMeasurements(),
        api.getPoolFishInventory(),
      ]);
      setMeasurements(measData.measurements);
      setFishInventory(invData.inventory);
    } catch { setMeasurements([]); setFishInventory([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadHistory = async (poolNum) => {
    setLoadingHistory(true);
    try {
      const data = await api.getPoolMeasurementHistory(poolNum);
      setHistory(data.measurements);
    } catch { setHistory([]); }
    finally { setLoadingHistory(false); }
  };

  const toggleHistory = () => {
    if (!showHistory) loadHistory(activePool);
    setShowHistory(!showHistory);
  };

  const handleDelete = async (id) => {
    if (!confirm('Дали сте сигурни дека сакате да го избришете ова мерење?')) return;
    setDeleting(id);
    try {
      await api.deletePoolMeasurement(id);
      setHistory(h => h.filter(m => m.id !== id));
      await load();
    } catch (err) { setMessage(err.message); }
    finally { setDeleting(null); }
  };

  const getMeasurement = (poolNum) => measurements.find(m => m.pool_number === poolNum);
  const getInventory = (poolNum) => fishInventory.find(inv => inv.pool_number === poolNum);

  // Check if a pool has any data entered
  const poolHasData = (poolNum) => {
    const d = poolData[poolNum];
    return d && (d.fishCount !== '' || d.avgWeight !== '');
  };

  // Count how many pools have data
  const filledCount = POOL_NUMBERS.filter(n => poolHasData(n)).length;

  const handleSaveAll = async () => {
    // Send ALL pools — pools without entered data are saved as 0/0 (empty pool)
    const toSave = POOL_NUMBERS.map(n => ({
      pool_number: n,
      fish_count: poolData[n].fishCount !== '' ? poolData[n].fishCount : 0,
      avg_weight_gr: poolData[n].avgWeight !== '' ? poolData[n].avgWeight : 0,
    }));

    setSaving(true); setMessage('');
    try {
      const result = await api.createPoolMeasurementBatch({
        measurements: toSave,
        measured_at: measuredDate,
      });
      const withFish = POOL_NUMBERS.filter(n => poolHasData(n)).length;
      const empty = POOL_NUMBERS.length - withFish;
      setMessage(`Зачувано! ${withFish} базен${withFish !== 1 ? 'и' : ''} со риби, ${empty} празн${empty !== 1 ? 'и' : 'о'}`);
      // Reset form
      const reset = {};
      POOL_NUMBERS.forEach(n => { reset[n] = { fishCount: '', avgWeight: '' }; });
      setPoolData(reset);
      setMeasuredDate(todayStr());
      await load();
    } catch (err) { setMessage(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="max-w-lg mx-auto space-y-3">
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-52 w-full" />
      <div className="skeleton h-36 w-full" />
    </div>
  );

  const currentMeasurement = getMeasurement(activePool);
  const currentInventory = getInventory(activePool);
  const currentData = poolData[activePool];

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-5 animate-in">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/admin')} className="btn-ghost p-1.5 -ml-1.5" aria-label="Назад">
            <ChevronLeft size={20} />
          </button>
          <h1 className="page-title mb-1">Мерења по базен</h1>
        </div>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Внесете број на риби и просечна тежина. Зачувајте сè одеднаш на крајот.
        </p>
      </div>

      {/* Date picker — shared for all pools */}
      <div className="card mb-3 animate-in">
        <div className="flex items-center gap-2.5 mb-2">
          <Calendar size={15} className="text-[var(--primary)]" />
          <label className="text-xs font-semibold text-[var(--text-secondary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Датум на мерење</label>
        </div>
        <input type="date" value={measuredDate}
          onChange={(e) => setMeasuredDate(e.target.value)}
          className="input-base" />
      </div>

      {/* Pool tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1 animate-in">
        {POOL_NUMBERS.map(num => {
          const hasData = poolHasData(num);
          const isActive = activePool === num;
          return (
            <button key={num} type="button"
              onClick={() => { setActivePool(num); setMessage(''); setShowHistory(false); setHistory([]); }}
              className={`relative ${isActive ? 'chip-active' : hasData ? 'chip-inactive !border-[rgba(34,197,94,0.3)] !text-[var(--success)] !bg-[rgba(34,197,94,0.06)]' : 'chip-inactive'}`}>
              Б{num}
              {hasData && !isActive && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[var(--success)] rounded-full flex items-center justify-center">
                  <Check size={8} className="text-white" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active pool form */}
      <div className="card mb-3 animate-in-delay-1">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="icon-box w-8 h-8"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
            <Gauge size={15} />
          </div>
          <h3 className="section-title text-sm">Базен бр. {activePool}</h3>
        </div>

        {/* Current measurement info */}
        {currentMeasurement ? (
          <div className="info-box mb-4">
            <p className="font-semibold mb-2 flex items-center gap-1.5 text-xs">
              <Info size={13} /> Последно мерење:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--surface)]/60 rounded-[var(--r-sm)] p-2.5 text-center">
                <Fish size={14} className="mx-auto text-[var(--primary)] mb-1" />
                <p className="text-[10px] text-[var(--text-muted)] font-medium">Број на риби</p>
                <p className="text-lg font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>{currentMeasurement.fish_count}</p>
              </div>
              <div className="bg-[var(--surface)]/60 rounded-[var(--r-sm)] p-2.5 text-center">
                <Weight size={14} className="mx-auto text-[var(--primary)] mb-1" />
                <p className="text-[10px] text-[var(--text-muted)] font-medium">Просечна тежина</p>
                <p className="text-lg font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>{currentMeasurement.avg_weight_gr} gr</p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">
              {new Date(currentMeasurement.measured_at).toLocaleDateString('mk-MK', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>
        ) : (
          <div className="bg-[var(--bg)] border border-[var(--border)] p-4 rounded-[var(--r-md)] mb-4 text-xs text-[var(--text-muted)] text-center">
            Нема внесено мерење за овој базен
          </div>
        )}

        {/* Current live fish count */}
        {currentInventory && currentInventory.current_count > 0 && (
          <div className="mb-4 rounded-xl p-3"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fish size={14} className="text-[var(--success)]" />
                <span className="text-xs font-semibold text-[var(--text-secondary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Актуелен број на риби
                </span>
              </div>
              <span className="text-lg font-bold text-[var(--success)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                {currentInventory.current_count}
              </span>
            </div>
            {currentMeasurement && currentInventory.current_count !== currentMeasurement.fish_count && (
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Разлика од мерење: <span className="text-[var(--danger)] font-semibold">{currentInventory.current_count - currentMeasurement.fish_count}</span>
                {' '}(угинати + продадени)
              </p>
            )}
          </div>
        )}

        {/* Input fields for this pool */}
        <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2.5" style={{ fontFamily: 'Sora, sans-serif' }}>Ново мерење:</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Број на риби</label>
            <input type="number" value={currentData.fishCount}
              onChange={(e) => updatePoolField(activePool, 'fishCount', e.target.value)}
              className="input-base" placeholder="нпр. 500" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Тежина (gr)</label>
            <input type="number" step="any" value={currentData.avgWeight}
              onChange={(e) => updatePoolField(activePool, 'avgWeight', e.target.value)}
              className="input-base" placeholder="нпр. 150" />
          </div>
        </div>
      </div>

      {/* Save all button */}
      <div className="card mb-3 animate-in-delay-1">
        <p className="text-xs text-[var(--text-secondary)] mb-2 text-center" style={{ fontFamily: 'Sora, sans-serif' }}>
          <span className="font-bold text-[var(--primary)]">{filledCount}</span> базен{filledCount !== 1 ? 'и' : ''} со риби,{' '}
          <span className="font-bold text-[var(--text-muted)]">{POOL_NUMBERS.length - filledCount}</span> празн{(POOL_NUMBERS.length - filledCount) !== 1 ? 'и' : 'о'}
        </p>

        {message && (
          <p className={`text-xs mb-2 font-medium text-center ${message.includes('Зачувано') ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {message}
          </p>
        )}

        <button onClick={handleSaveAll} disabled={saving}
          className="btn-primary w-full py-3">
          {saving ? (
            <span className="flex items-center gap-2">
              <div className="wave-loader"><span /><span /><span /><span /></div>
              Се зачувува...
            </span>
          ) : (
            <><Save size={16} /> Зачувај сите мерења</>
          )}
        </button>
      </div>

      {/* Measurement history */}
      <div className="card mb-3 animate-in-delay-2">
        <button type="button" onClick={toggleHistory}
          className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2.5">
            <div className="icon-box w-8 h-8"
              style={{ background: 'linear-gradient(135deg, var(--text-muted), var(--text-secondary))' }}>
              <History size={15} />
            </div>
            <h3 className="section-title text-sm">Историја — Б{activePool}</h3>
          </div>
          {showHistory ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
        </button>

        {showHistory && (
          <div className="mt-3">
            {loadingHistory ? (
              <div className="text-center py-4"><Loader2 size={18} className="animate-spin mx-auto text-[var(--text-muted)]" /></div>
            ) : history.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-3">Нема мерења за овој базен</p>
            ) : (
              <div className="space-y-1.5">
                {history.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)]">
                    <div className="text-xs">
                      <p className="font-medium text-[var(--text-primary)]">
                        <span className="font-bold">{m.fish_count}</span> риби / <span className="font-bold">{m.avg_weight_gr}</span> gr
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {new Date(m.measured_at).toLocaleDateString('mk-MK', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button type="button" onClick={() => handleDelete(m.id)} disabled={deleting === m.id}
                      className="p-1.5 rounded-[var(--r-sm)] text-[var(--danger)] hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Избриши мерење">
                      {deleting === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary of all pools */}
      <div className="card animate-in-delay-2">
        <h3 className="section-title text-sm mb-3">Преглед на сите базени</h3>
        <div className="space-y-1.5">
          {POOL_NUMBERS.map(num => {
            const m = getMeasurement(num);
            const inv = getInventory(num);
            const hasNew = poolHasData(num);
            return (
              <button key={num} type="button"
                onClick={() => { setActivePool(num); setMessage(''); setShowHistory(false); setHistory([]); }}
                className={`w-full flex justify-between items-center text-xs p-2.5 rounded-[var(--r-sm)] transition-all text-left ${
                  activePool === num ? 'bg-[var(--primary-muted)] border border-[rgba(37,99,235,0.12)]' : 'border border-transparent hover:bg-[var(--bg)]'
                }`}>
                <span className={`font-semibold ${activePool === num ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}
                  style={{ fontFamily: 'Sora, sans-serif' }}>Базен {num}</span>
                <span className="text-[var(--text-muted)] font-medium">
                  {hasNew ? (
                    <span className="text-[var(--success)]">
                      {poolData[num].fishCount} риби / {poolData[num].avgWeight} gr
                      <span className="text-[10px] ml-1 font-semibold">(ново)</span>
                    </span>
                  ) : (() => {
                    const m = getMeasurement(num);
                    const inv = getInventory(num);
                    const count = inv?.current_count ?? m?.fish_count ?? 0;
                    return count > 0 ? (
                      <span className="text-[10px]">{count} риби / {m?.avg_weight_gr ?? '?'} gr</span>
                    ) : (
                      <span className="italic text-[10px]">Празен базен (0 риби)</span>
                    );
                  })()}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
