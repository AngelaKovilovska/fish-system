import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { POOL_NUMBERS } from '../../lib/constants';
import { Save, Loader2, Info, Gauge, Fish, Weight, Calendar } from 'lucide-react';

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

  const load = async () => {
    try {
      const data = await api.getPoolMeasurements();
      setMeasurements(data.measurements);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

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
              onClick={() => { setActivePool(num); setMessage(''); }}
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
              <div className="bg-white/60 rounded-[var(--r-sm)] p-2.5 text-center">
                <Fish size={14} className="mx-auto text-[var(--primary)] mb-1" />
                <p className="text-[10px] text-[var(--text-muted)] font-medium">Број на риби</p>
                <p className="text-lg font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>{currentMeasurement.fish_count}</p>
              </div>
              <div className="bg-white/60 rounded-[var(--r-sm)] p-2.5 text-center">
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

      {/* Summary of all pools */}
      <div className="card animate-in-delay-2">
        <h3 className="section-title text-sm mb-3">Преглед на сите базени</h3>
        <div className="space-y-1.5">
          {POOL_NUMBERS.map(num => {
            const m = getMeasurement(num);
            return (
              <div key={num} className={`flex justify-between items-center text-xs p-2.5 rounded-[var(--r-sm)] transition-all ${
                activePool === num ? 'bg-[var(--primary-muted)] border border-[rgba(37,99,235,0.12)]' : 'border border-transparent hover:bg-[var(--bg)]'
              }`}>
                <span className={`font-semibold ${activePool === num ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}`}
                  style={{ fontFamily: 'Sora, sans-serif' }}>Базен {num}</span>
                {m ? (
                  <span className="text-[var(--text-muted)] font-medium">
                    <span className="text-[var(--text-primary)] font-bold">{m.fish_count}</span> риби / <span className="text-[var(--text-primary)] font-bold">{m.avg_weight_gr}</span> gr
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] italic text-[10px]">Нема мерење</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
