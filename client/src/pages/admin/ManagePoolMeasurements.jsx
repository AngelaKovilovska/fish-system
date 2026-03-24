import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { POOL_NUMBERS } from '../../lib/constants';
import { Save, Loader2, Info, Gauge, Fish, Weight, Calendar, Trash2, History, ChevronDown, ChevronUp } from 'lucide-react';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ManagePoolMeasurements() {
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePool, setActivePool] = useState(1);
  const [fishCount, setFishCount] = useState('');
  const [avgWeight, setAvgWeight] = useState('');
  const [measuredDate, setMeasuredDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [fishInventory, setFishInventory] = useState([]);

  const load = async () => {
    try {
      const [measData, invData] = await Promise.all([
        api.getPoolMeasurements(),
        api.getPoolFishInventory(),
      ]);
      setMeasurements(measData.measurements);
      setFishInventory(invData.inventory);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadHistory = async (poolNum) => {
    setLoadingHistory(true);
    try {
      const data = await api.getPoolMeasurementHistory(poolNum);
      setHistory(data.measurements);
    } catch (err) { console.error(err); }
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

  const handleSave = async () => {
    if (!fishCount && !avgWeight) { setMessage('Внесете барем една вредност'); return; }
    setSaving(true); setMessage('');
    try {
      await api.createPoolMeasurement({
        pool_number: activePool,
        fish_count: fishCount || 0,
        avg_weight_gr: avgWeight || 0,
        measured_at: measuredDate,
      });
      setMessage('Мерењето е зачувано!');
      setFishCount(''); setAvgWeight(''); setMeasuredDate(todayStr());
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
  const getInventory = (poolNum) => fishInventory.find(inv => inv.pool_number === poolNum);
  const currentInventory = getInventory(activePool);

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-5 animate-in">
        <h1 className="page-title mb-1">Мерења по базен</h1>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Внесете број на риби и просечна тежина. Се користи автоматски во чеклистата.
        </p>
      </div>

      {/* Pool tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 animate-in">
        {POOL_NUMBERS.map(num => {
          const m = getMeasurement(num);
          return (
            <button key={num} type="button"
              onClick={() => { setActivePool(num); setMessage(''); setShowHistory(false); setHistory([]); }}
              className={activePool === num ? 'chip-active' : m ? 'chip-inactive !border-[rgba(34,197,94,0.2)] !text-[var(--success)]' : 'chip-inactive'}>
              Б{num}
            </button>
          );
        })}
      </div>

      {/* Current measurement info */}
      <div className="card mb-3 animate-in-delay-1">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="icon-box w-8 h-8"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
            <Gauge size={15} />
          </div>
          <h3 className="section-title text-sm">Базен бр. {activePool}</h3>
        </div>

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
        {currentInventory && (
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

        <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2.5" style={{ fontFamily: 'Sora, sans-serif' }}>Ново мерење:</p>
        <div className="mb-3">
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Датум на мерење</label>
          <input type="date" value={measuredDate}
            onChange={(e) => setMeasuredDate(e.target.value)}
            className="input-base" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Број на риби</label>
            <input type="number" value={fishCount}
              onChange={(e) => setFishCount(e.target.value)}
              className="input-base" placeholder="нпр. 500" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider" style={{ fontFamily: 'Sora, sans-serif' }}>Тежина (gr)</label>
            <input type="number" step="any" value={avgWeight}
              onChange={(e) => setAvgWeight(e.target.value)}
              className="input-base" placeholder="нпр. 150" />
          </div>
        </div>

        {message && (
          <p className={`text-xs mt-3 font-medium ${message.includes('зачувано') ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {message}
          </p>
        )}

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5 mt-3">
          {saving ? (
            <span className="flex items-center gap-2">
              <div className="wave-loader"><span /><span /><span /><span /></div>
              Се зачувува...
            </span>
          ) : (
            <><Save size={15} /> Зачувај мерење</>
          )}
        </button>
      </div>

      {/* Measurement history */}
      <div className="card mb-3 animate-in-delay-1">
        <button type="button" onClick={toggleHistory}
          className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2.5">
            <div className="icon-box w-8 h-8"
              style={{ background: 'linear-gradient(135deg, var(--text-muted), var(--text-secondary))' }}>
              <History size={15} />
            </div>
            <h3 className="section-title text-sm">Историја на мерења — Б{activePool}</h3>
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
            return (
              <div key={num} className={`flex justify-between items-center text-xs p-2.5 rounded-[var(--r-sm)] transition-all ${
                activePool === num ? 'bg-[var(--primary-muted)] border border-[rgba(37,99,235,0.12)]' : 'border border-transparent hover:bg-[var(--bg)]'
              }`}>
                <span className={`font-semibold ${activePool === num ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}
                  style={{ fontFamily: 'Sora, sans-serif' }}>Базен {num}</span>
                <span className="text-[var(--text-muted)] font-medium">
                  {inv && inv.current_count > 0 ? (
                    <>
                      <span className="text-[var(--success)] font-bold">{inv.current_count}</span> риби
                      {m ? <> / <span className="text-[var(--text-primary)] font-bold">{m.avg_weight_gr}</span> gr</> : ''}
                    </>
                  ) : m ? (
                    <>
                      <span className="text-[var(--text-primary)] font-bold">{m.fish_count}</span> риби / <span className="text-[var(--text-primary)] font-bold">{m.avg_weight_gr}</span> gr
                    </>
                  ) : (
                    <span className="italic text-[10px]">Нема мерење</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
