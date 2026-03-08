import { Calendar, FileText } from 'lucide-react';

export default function ActivitiesStep({ data, onChange }) {
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
          <Calendar size={18} />
        </div>
        <div>
          <h2 className="section-title">5. Активности</h2>
          <p className="section-subtitle">Забележете дополнителни активности</p>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            <Calendar size={12} className="text-[var(--primary)]" />
            Сортирање
          </label>
          <input type="date" value={data.sorting_date || ''}
            onChange={(e) => handleChange('sorting_date', e.target.value)} className="input-base" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            <Calendar size={12} className="text-[var(--primary)]" />
            Контрола тежина
          </label>
          <input type="date" value={data.weight_control_date || ''}
            onChange={(e) => handleChange('weight_control_date', e.target.value)} className="input-base" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
          style={{ fontFamily: 'Sora, sans-serif' }}>
          <FileText size={12} className="text-[var(--primary)]" />
          Разно (1)
        </label>
        <textarea value={data.misc_1 || ''} onChange={(e) => handleChange('misc_1', e.target.value)}
          className="input-base" rows={2} placeholder="Опционално..." />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5"
          style={{ fontFamily: 'Sora, sans-serif' }}>
          <FileText size={12} className="text-[var(--primary)]" />
          Разно (2)
        </label>
        <textarea value={data.misc_2 || ''} onChange={(e) => handleChange('misc_2', e.target.value)}
          className="input-base" rows={2} placeholder="Опционално..." />
      </div>
    </div>
  );
}
