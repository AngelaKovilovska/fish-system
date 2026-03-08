import { FISH_VISUAL_LABELS } from '../../lib/constants';
import { Check, X, Eye } from 'lucide-react';

export default function FishControlStep({ data, onChange }) {
  const handleToggle = (field, value) => {
    onChange({ ...data, [field]: data[field] === value ? null : value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
          <Eye size={18} />
        </div>
        <div>
          <h2 className="section-title">3. Риба - Визуелна контрола</h2>
          <p className="section-subtitle">Сите полиња се задолжителни <span className="text-[var(--danger)]">*</span></p>
        </div>
      </div>

      <div className="space-y-3 lg:space-y-2.5">
        {Object.entries(FISH_VISUAL_LABELS).map(([key, label]) => {
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
