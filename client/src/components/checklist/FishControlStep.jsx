import { FISH_VISUAL_LABELS } from '../../lib/constants';
import { Check, X, Eye, CheckCheck } from 'lucide-react';

export default function FishControlStep({ data, onChange }) {
  const handleToggle = (field, value) => {
    onChange({ ...data, [field]: data[field] === value ? null : value });
  };

  const handleAllOk = () => {
    const updated = { ...data };
    for (const key of Object.keys(FISH_VISUAL_LABELS)) {
      updated[key] = true;
    }
    onChange(updated);
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
          <p className="section-subtitle">Сите полиња се задолжителни <span className="text-(--danger)">*</span></p>
        </div>
      </div>

      <button type="button" onClick={handleAllOk}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-(--r-md) font-semibold text-xs transition-all border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)] text-(--success) hover:bg-[rgba(34,197,94,0.12)] active:scale-[0.98]"
        style={{ fontFamily: 'Sora, sans-serif' }}>
        <CheckCheck size={16} />
        Сè е во ред
      </button>

      <div className="space-y-1.5">
        {Object.entries(FISH_VISUAL_LABELS).map(([key, label]) => {
          const value = data[key];
          const isOk = value === true;
          const isNotOk = value === false;

          return (
            <div key={key}
              className={`flex items-center justify-between p-2.5 rounded-(--r-md) transition-all duration-200 border ${
                isOk ? 'bg-[rgba(34,197,94,0.03)] border-[rgba(34,197,94,0.15)]'
                : isNotOk ? 'bg-[rgba(255,107,107,0.04)] border-[rgba(255,107,107,0.25)]'
                : 'bg-(--surface) border-(--border)'
              }`}>
              <p className="text-xs text-(--text-primary) font-medium pr-2 leading-snug" style={{ fontFamily: 'Sora, sans-serif' }}>{label}</p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={() => handleToggle(key, true)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    isOk ? 'bg-(--success) text-white shadow-sm' : 'bg-(--bg) text-(--text-muted) border border-(--border)'
                  }`}>
                  <Check size={16} strokeWidth={2.5} />
                </button>
                <button type="button" onClick={() => handleToggle(key, false)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    isNotOk ? 'bg-(--danger) text-white shadow-sm' : 'bg-(--bg) text-(--text-muted) border border-(--border)'
                  }`}>
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5" style={{ fontFamily: 'Sora, sans-serif' }}>
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
