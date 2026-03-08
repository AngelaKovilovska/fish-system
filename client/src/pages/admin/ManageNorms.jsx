import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PARAMETER_LABELS } from '../../lib/constants';
import { Save, Loader2, Check } from 'lucide-react';

export default function ManageNorms() {
  const [norms, setNorms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savedAll, setSavedAll] = useState(false);

  useEffect(() => {
    api.getNorms().then(d => setNorms(d.norms)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSaveAll = async () => {
    setSavingAll(true);
    try {
      for (const norm of norms) {
        await api.updateNorm(norm.id, { min_value: norm.min_value, max_value: norm.max_value });
      }
      setSavedAll(true);
      setTimeout(() => setSavedAll(false), 2000);
    } catch (err) { alert('Грешка: ' + err.message); }
    finally { setSavingAll(false); }
  };

  const updateLocal = (id, field, value) => {
    setNorms(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));
  };

  if (loading) return (
    <div className="max-w-[700px] mx-auto space-y-3">
      {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12" />)}
    </div>
  );

  return (
    <div className="max-w-[700px] mx-auto">
      <div className="flex items-center justify-between mb-5 animate-in">
        <div>
          <h1 className="page-title mb-1">Управување со норми</h1>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Поставете мин/макс вредности. Надвор од норма = аларм.
          </p>
        </div>
        <button onClick={handleSaveAll} disabled={savingAll}
          className={`btn-primary py-2 px-4 text-sm flex-shrink-0 ${savedAll ? '!bg-[var(--success)] !shadow-none' : ''}`}>
          {savingAll ? (
            <><Loader2 size={14} className="animate-spin" /> Се зачувува...</>
          ) : savedAll ? (
            <><Check size={14} /> Зачувано</>
          ) : (
            <><Save size={14} /> Зачувај ги сите</>
          )}
        </button>
      </div>

      <div className="bg-white rounded-[var(--r-md)] overflow-hidden animate-in-delay-1" style={{ boxShadow: 'var(--sh-card)' }}>
        <table className="table-modern">
          <thead>
            <tr>
              <th>Параметар</th>
              <th className="text-right w-[140px]">Минимум</th>
              <th className="text-right w-[140px]">Максимум</th>
            </tr>
          </thead>
          <tbody>
            {norms.map((norm) => {
              const info = PARAMETER_LABELS[norm.parameter_name];
              return (
                <tr key={norm.id}>
                  <td>
                    <span className="font-semibold text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {info?.label || norm.parameter_name}
                    </span>
                    {info?.unit && (
                      <span className="text-[var(--text-muted)] text-xs ml-1">({info.unit})</span>
                    )}
                  </td>
                  <td>
                    <input type="number" step="any"
                      value={norm.min_value ?? ''}
                      onChange={(e) => updateLocal(norm.id, 'min_value', e.target.value || null)}
                      className="input-base !py-1.5 !text-sm text-right"
                      placeholder="--" />
                  </td>
                  <td>
                    <input type="number" step="any"
                      value={norm.max_value ?? ''}
                      onChange={(e) => updateLocal(norm.id, 'max_value', e.target.value || null)}
                      className="input-base !py-1.5 !text-sm text-right"
                      placeholder="--" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
