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

      <div className="space-y-1.5">
        {Object.entries(FILTRATION_LABELS).map(([key, label]) => {
          if (key === 'bio_filter_foam') {
            const foamValue = data[key];
            const hasFoam = foamValue === 'yes';
            const noFoam = foamValue === 'no';

            return (
              <div key={key}>
                <div className={`flex items-center justify-between p-2.5 rounded-[var(--r-md)] transition-all duration-200 border ${
                  hasFoam ? 'bg-[rgba(255,107,107,0.04)] border-[rgba(255,107,107,0.25)]'
                  : noFoam ? 'bg-[rgba(34,197,94,0.03)] border-[rgba(34,197,94,0.15)]'
                  : 'bg-[var(--surface)] border-[var(--border)]'
                }`}>
                  <p className="text-xs text-[var(--text-primary)] font-medium pr-2 leading-snug" style={{ fontFamily: 'Sora, sans-serif' }}>{label}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => handleFoam('no')}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                        noFoam ? 'bg-[var(--success)] text-white shadow-sm' : 'bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)]'
                      }`}>
                      <Check size={16} strokeWidth={2.5} />
                    </button>
                    <button type="button" onClick={() => handleFoam('yes')}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                        hasFoam ? 'bg-[var(--danger)] text-white shadow-sm' : 'bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)]'
                      }`}>
                      <AlertTriangle size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
                {hasFoam && (
                  <div className="mx-2.5 mt-1 mb-1 p-2 bg-[rgba(255,107,107,0.06)] border border-[rgba(255,107,107,0.2)] rounded-[var(--r-sm)] flex items-center gap-2">
                    <AlertTriangle size={13} className="text-[var(--danger)] flex-shrink-0" />
                    <p className="text-[11px] text-[var(--danger)] font-bold">
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
              className={`flex items-center justify-between p-2.5 rounded-[var(--r-md)] transition-all duration-200 border ${
                isOk ? 'bg-[rgba(34,197,94,0.03)] border-[rgba(34,197,94,0.15)]'
                : isNotOk ? 'bg-[rgba(255,107,107,0.04)] border-[rgba(255,107,107,0.25)]'
                : 'bg-[var(--surface)] border-[var(--border)]'
              }`}>
              <p className="text-xs text-[var(--text-primary)] font-medium pr-2 leading-snug" style={{ fontFamily: 'Sora, sans-serif' }}>{label}</p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={() => handleToggle(key, true)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    isOk ? 'bg-[var(--success)] text-white shadow-sm' : 'bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)]'
                  }`}>
                  <Check size={16} strokeWidth={2.5} />
                </button>
                <button type="button" onClick={() => handleToggle(key, false)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    isNotOk ? 'bg-[var(--danger)] text-white shadow-sm' : 'bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)]'
                  }`}>
                  <X size={16} strokeWidth={2.5} />
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
