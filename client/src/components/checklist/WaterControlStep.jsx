import { useRef } from 'react';
import { PARAMETER_LABELS } from '../../lib/constants';
import { AlertTriangle, Droplets, Thermometer, Beaker, FlaskConical, ShieldAlert, Waves } from 'lucide-react';

// All field keys in order (parameters + water_exchange)
const ALL_FIELD_KEYS = [...Object.keys(PARAMETER_LABELS), 'water_exchange_m3'];

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
  const inputRefs = useRef({});

  const handleChange = (field, rawValue) => {
    // Allow digits, one dot or comma, and empty string
    const value = rawValue.replace(',', '.').replace(/[^0-9.]/g, '');
    // Prevent multiple dots
    const parts = value.split('.');
    const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
    onChange({ ...data, [field]: sanitized });
  };

  // Enter key → focus next input field
  const handleKeyDown = (e, fieldKey) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = ALL_FIELD_KEYS.indexOf(fieldKey);
      if (idx >= 0 && idx < ALL_FIELD_KEYS.length - 1) {
        const nextKey = ALL_FIELD_KEYS[idx + 1];
        inputRefs.current[nextKey]?.focus();
      } else {
        // Last field — blur
        e.target.blur();
      }
    }
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

      <div className="space-y-2">
        {Object.entries(PARAMETER_LABELS).map(([key, { label, unit }]) => {
          const outOfRange = isOutOfRange(key, data[key]);
          const required = isRequired(key);
          const isEmpty = required && (data[key] === undefined || data[key] === null || data[key] === '');
          const range = getNormRange(key);
          const filled = data[key] !== undefined && data[key] !== null && data[key] !== '';
          const Icon = FIELD_ICONS[key] || Droplets;

          return (
            <div key={key} className={`rounded-[var(--r-md)] p-2.5 transition-all duration-150 ${
              outOfRange ? 'bg-[rgba(255,107,107,0.04)] border border-[rgba(255,107,107,0.25)]' :
              'bg-[var(--surface)]'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
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
                ref={el => { inputRefs.current[key] = el; }}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={data[key] ?? ''}
                onChange={(e) => handleChange(key, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, key)}
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

        {/* Water exchange - optional, separate from monitored parameters */}
        <div className="rounded-[var(--r-md)] p-2.5 bg-[var(--surface)] mt-3 border border-dashed border-[var(--border)]">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2"
              style={{ fontFamily: 'Sora, sans-serif' }}>
              <Waves size={14} className="text-[var(--primary)]" />
              Замена на вода
              <span className="text-[var(--text-muted)] font-normal text-xs">(m³)</span>
            </label>
            <span className="pill pill-blue text-[10px]">опционално</span>
          </div>
          <input
            ref={el => { inputRefs.current['water_exchange_m3'] = el; }}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={data.water_exchange_m3 ?? ''}
            onChange={(e) => handleChange('water_exchange_m3', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'water_exchange_m3')}
            className="input-metric"
            placeholder="Внеси количина ако имало замена"
          />
        </div>
      </div>
    </div>
  );
}
