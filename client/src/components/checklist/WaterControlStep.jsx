import { PARAMETER_LABELS } from '../../lib/constants';
import { AlertTriangle, Droplets, Thermometer, Beaker, FlaskConical, ShieldAlert } from 'lucide-react';

const FIELD_ICONS = {
  temperature: Thermometer,
  ph: Beaker,
  total_alkalinity: FlaskConical,
  hardness: Droplets,
  nitrates: Droplets,
  nitrites: Droplets,
  total_chlorine: ShieldAlert,
  ammonium: AlertTriangle,
};

export default function WaterControlStep({ data, onChange, norms, requiredFields = [] }) {
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const isOutOfRange = (field, value) => {
    if (!value || !norms) return false;
    const norm = norms.find(n => n.parameter_name === field);
    if (!norm) return false;
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (norm.min_value != null && num < parseFloat(norm.min_value)) return true;
    if (norm.max_value != null && num > parseFloat(norm.max_value)) return true;
    return false;
  };

  const getNormRange = (field) => {
    const norm = norms?.find(n => n.parameter_name === field);
    if (!norm) return null;
    return { min: norm.min_value, max: norm.max_value };
  };

  const getNormText = (field) => {
    const range = getNormRange(field);
    if (!range) return '';
    const parts = [];
    if (range.min != null) parts.push(range.min);
    if (range.max != null) parts.push(range.max);
    return parts.join(' – ');
  };

  const isRequired = (field) => requiredFields.includes(field);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="icon-box"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}>
          <Droplets size={18} />
        </div>
        <div>
          <h2 className="section-title">1. Контрола на вода</h2>
          <p className="section-subtitle">Внесете ги измерените вредности</p>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(PARAMETER_LABELS).map(([key, { label, unit }]) => {
          const outOfRange = isOutOfRange(key, data[key]);
          const required = isRequired(key);
          const isEmpty = required && (data[key] === undefined || data[key] === null || data[key] === '');
          const range = getNormRange(key);
          const filled = data[key] !== undefined && data[key] !== null && data[key] !== '';
          const Icon = FIELD_ICONS[key] || Droplets;

          return (
            <div key={key} className={`rounded-[var(--r-lg)] p-3.5 transition-all duration-150 ${
              outOfRange ? 'bg-[rgba(255,107,107,0.04)] border border-[rgba(255,107,107,0.25)]' :
              'bg-[var(--surface)]'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2"
                  style={{ fontFamily: 'Sora, sans-serif' }}>
                  <Icon size={14} className={outOfRange ? 'text-[var(--danger)]' : 'text-[var(--primary)]'} />
                  {label}
                  {unit && <span className="text-[var(--text-muted)] font-normal text-xs">({unit})</span>}
                  {required && <span className="text-[var(--danger)]">*</span>}
                </label>
                {range && (
                  <span className="pill pill-blue text-[10px]">
                    {getNormText(key)}
                  </span>
                )}
              </div>
              <input
                type="number"
                step="any"
                value={data[key] ?? ''}
                onChange={(e) => handleChange(key, e.target.value)}
                className={`input-metric ${
                  outOfRange ? 'input-error' : isEmpty ? 'input-warning' : ''
                }`}
                placeholder={`Внеси ${label.toLowerCase()}`}
              />
              {outOfRange && (
                <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-[var(--danger)]">
                  <AlertTriangle size={13} />
                  Надвор од норма! ({getNormText(key)})
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
