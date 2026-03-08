import { FILTRATION_LABELS } from '../../lib/constants';
import { Check, X, AlertTriangle, Filter } from 'lucide-react';

export default function FiltrationStep({ data, onChange }) {
  const handleToggle = (field, value) => {
    onChange({ ...data, [field]: data[field] === value ? null : value });
  };

  const handleFoam = (value) => {
    onChange({ ...data, bio_filter_foam: data.bio_filter_foam === value ? null : value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
          <Filter size={18} />
        </div>
        <div>
          <h2 className="section-title">2. Механичка и Био-филтрација</h2>
          <p className="section-subtitle">Сите полиња се задолжителни <span className="text-[var(--danger)]">*</span></p>
        </div>
      </div>

      <div className="space-y-3 lg:space-y-2.5">
        {Object.entries(FILTRATION_LABELS).map(([key, label]) => {
          if (key === 'bio_filter_foam') {
            const foamValue = data[key];
            const hasFoam = foamValue === 'yes';
            const noFoam = foamValue === 'no';

            return (
              <div key={key}
                className={`rounded-[var(--r-lg)] transition-all duration-300 border ${
                  hasFoam ? 'bg-[rgba(255,107,107,0.04)] border-[rgba(255,107,107,0.25)]'
                  : noFoam ? 'bg-[rgba(34,197,94,0.03)] border-[rgba(34,197,94,0.15)]'
                  : 'bg-[var(--surface)] border-[var(--border)]'
                }`}>
                <div className="p-3.5">
                  <p className="text-[13px] text-[var(--text-primary)] font-medium mb-2.5" style={{ fontFamily: 'Sora, sans-serif' }}>{label}</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleFoam('yes')}
                      className={`seg-btn flex-1 ${hasFoam ? 'seg-bad' : ''}`}>
                      <Check size={15} strokeWidth={2.5} />
                      Има
                    </button>
                    <button type="button" onClick={() => handleFoam('no')}
                      className={`seg-btn flex-1 ${noFoam ? 'seg-ok' : ''}`}>
                      <X size={15} strokeWidth={2.5} />
                      Нема
                    </button>
                  </div>
                </div>
                {hasFoam && (
                  <div className="mx-3.5 mb-3.5 p-2.5 bg-[rgba(255,107,107,0.06)] border border-[rgba(255,107,107,0.2)] rounded-[var(--r-sm)] flex items-center gap-2">
                    <AlertTriangle size={15} className="text-[var(--danger)] flex-shrink-0" />
                    <p className="text-xs text-[var(--danger)] font-bold">
                      ОПАСНОСТ: Детектирана пена!
                    </p>
                  </div>
                )}
              </div>
            );
          }

          const value = data[key];
          const isOk = value === true;
          const isNotOk = value === false;

          return (
            <div key={key}
              className={`p-3.5 rounded-[var(--r-lg)] transition-all duration-300 border ${
                isOk ? 'bg-[rgba(34,197,94,0.03)] border-[rgba(34,197,94,0.15)]'
                : isNotOk ? 'bg-[rgba(255,107,107,0.04)] border-[rgba(255,107,107,0.25)]'
                : 'bg-[var(--surface)] border-[var(--border)]'
              }`}>
              <p className="text-[13px] text-[var(--text-primary)] font-medium mb-2.5" style={{ fontFamily: 'Sora, sans-serif' }}>{label}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => handleToggle(key, true)}
                  className={`seg-btn flex-1 ${isOk ? 'seg-ok' : ''}`}>
                  <Check size={15} strokeWidth={2.5} />
                  ОК
                </button>
                <button type="button" onClick={() => handleToggle(key, false)}
                  className={`seg-btn flex-1 ${isNotOk ? 'seg-bad' : ''}`}>
                  <X size={15} strokeWidth={2.5} />
                  Не е ОК
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>
          Забелешка (опционално)
        </label>
        <textarea
          value={data.notes || ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          className="input-base"
          rows={3}
          placeholder="Додади забелешка ако има потреба..."
        />
      </div>
    </div>
  );
}
