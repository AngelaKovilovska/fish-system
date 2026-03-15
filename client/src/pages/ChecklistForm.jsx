import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import WaterControlStep from '../components/checklist/WaterControlStep';
import FiltrationStep from '../components/checklist/FiltrationStep';
import FishControlStep from '../components/checklist/FishControlStep';
import FeedingStep from '../components/checklist/FeedingStep';
import ActivitiesStep from '../components/checklist/ActivitiesStep';
import { POOL_NUMBERS, FILTRATION_LABELS, FISH_VISUAL_LABELS } from '../lib/constants';
import { Check, ChevronRight, ChevronLeft, Save, AlertCircle, ClipboardList, Pencil, X } from 'lucide-react';

const STEPS = ['Вода', 'Филтри', 'Риба', 'Базени', 'Активности'];
const STEP_ICONS = ['💧', '⚙️', '🐟', '🐟', '📋'];
const REQUIRED_WATER_FIELDS = ['temperature', 'ph', 'nitrates', 'nitrites'];
const MK_MONTHS = ['Јануари','Февруари','Март','Април','Мај','Јуни','Јули','Август','Септември','Октомври','Ноември','Декември'];

export default function ChecklistForm() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = Boolean(editId);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [norms, setNorms] = useState([]);
  const [poolMeasurements, setPoolMeasurements] = useState([]);
  const [fishInventory, setFishInventory] = useState([]);
  const [stepErrors, setStepErrors] = useState({});
  const [duplicateRecord, setDuplicateRecord] = useState(null); // existing today's record
  const feedingRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    date: today,
    water_control: {},
    filtration_checks: {},
    fish_visual: {},
    pool_feeding: POOL_NUMBERS.map(n => ({ pool_number: n, sold_count: 0, dead_count: 0 })),
    activities: {},
  });

  useEffect(() => {
    api.getNorms().then(d => setNorms(d.norms)).catch(console.error);
    api.getPoolMeasurements().then(d => setPoolMeasurements(d.measurements)).catch(console.error);
    api.getPoolFishInventory().then(d => setFishInventory(d.inventory)).catch(console.error);
  }, []);

  // Check if today's record already exists (only for new records, not edits)
  useEffect(() => {
    if (isEdit) return;
    api.getRecords({ from: today, to: today, limit: 1 })
      .then(d => {
        if (d.records.length > 0) {
          setDuplicateRecord(d.records[0]);
        }
      })
      .catch(console.error);
  }, [isEdit, today]);

  useEffect(() => {
    if (!editId) return;
    setLoadingRecord(true);
    api.getRecord(editId)
      .then(data => {
        const { record, water_control, filtration_checks, fish_visual, pool_feeding, activities } = data;
        setFormData({
          date: record.date?.split('T')[0] || today,
          water_control: water_control || {},
          filtration_checks: filtration_checks || {},
          fish_visual: fish_visual || {},
          pool_feeding: pool_feeding.length > 0
            ? pool_feeding.map(pf => ({
                pool_number: pf.pool_number, fish_count: pf.fish_count ?? '',
                avg_weight_gr: pf.avg_weight_gr ?? '', sold_count: pf.sold_count ?? 0,
                dead_count: pf.dead_count ?? 0,
              }))
            : POOL_NUMBERS.map(n => ({ pool_number: n, sold_count: 0, dead_count: 0 })),
          activities: activities || {},
        });
      })
      .catch(err => setError('Грешка при вчитување: ' + err.message))
      .finally(() => setLoadingRecord(false));
  }, [editId]);

  const validateWater = () => {
    const errors = [];
    for (const field of REQUIRED_WATER_FIELDS) {
      const val = formData.water_control[field];
      if (val === undefined || val === null || val === '' || isNaN(parseFloat(val))) {
        const labels = { temperature: 'Температура', ph: 'pH', nitrates: 'Нитрати', nitrites: 'Нитрити' };
        errors.push(labels[field]);
      }
    }
    return errors;
  };

  const validateFiltration = () => {
    const errors = [];
    for (const key of Object.keys(FILTRATION_LABELS)) {
      const val = formData.filtration_checks[key];
      if (val == null || val === '') errors.push(FILTRATION_LABELS[key]);
    }
    return errors;
  };

  const validateFish = () => {
    const errors = [];
    for (const key of Object.keys(FISH_VISUAL_LABELS)) {
      const val = formData.fish_visual[key];
      if (val == null || val === '') errors.push(FISH_VISUAL_LABELS[key]);
    }
    return errors;
  };

  const validateStep = (stepIndex) => {
    switch (stepIndex) {
      case 0: return validateWater();
      case 1: return validateFiltration();
      case 2: return validateFish();
      default: return [];
    }
  };

  const handleNext = () => {
    const errors = validateStep(step);
    if (errors.length > 0) { setStepErrors({ ...stepErrors, [step]: errors }); return; }
    setStepErrors({ ...stepErrors, [step]: [] });
    // On feeding step, cycle through pools before advancing
    if (step === 3 && feedingRef.current?.tryAdvancePool()) {
      setTimeout(() => window.scrollTo(0, 0), 50);
      return;
    }
    setStep(step + 1);
    setTimeout(() => window.scrollTo(0, 0), 50);
  };

  const handleSubmit = async () => {
    const allErrors = {};
    for (let i = 0; i <= 2; i++) {
      const errors = validateStep(i);
      if (errors.length > 0) allErrors[i] = errors;
    }
    if (Object.keys(allErrors).length > 0) {
      setStepErrors(allErrors);
      setStep(Math.min(...Object.keys(allErrors).map(Number)));
      setError('Пополнете ги сите задолжителни полиња');
      setTimeout(() => window.scrollTo(0, 0), 50);
      return;
    }
    setError(''); setSaving(true);
    try {
      const feedingWithDefaults = formData.pool_feeding.map(pf => {
        const measurement = poolMeasurements.find(m => m.pool_number === pf.pool_number);
        return { ...pf, avg_weight_gr: (pf.avg_weight_gr !== '' && pf.avg_weight_gr != null) ? pf.avg_weight_gr : (measurement?.avg_weight_gr ?? null), sold_count: pf.sold_count || 0, dead_count: pf.dead_count || 0 };
      });
      const payload = { ...formData, pool_feeding: feedingWithDefaults };
      let result;
      if (isEdit) { result = await api.updateRecord(editId, payload); }
      else { result = await api.createRecord(payload); }
      setSuccess(isEdit ? 'Записот е ажуриран!' : 'Записот е зачуван!');
      if (result.alerts?.length > 0) setSuccess(prev => prev + ` ${result.alerts.length} аларм(и).`);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const currentStepErrors = stepErrors[step] || [];

  if (loadingRecord) return (
    <div className="space-y-4">
      <div className="skeleton h-10 w-48" />
      <div className="skeleton h-14 w-full" />
      <div className="skeleton h-64 w-full" />
    </div>
  );

  // Duplicate record popup
  if (duplicateRecord && !isEdit) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card animate-in text-center py-8 px-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))' }}>
            <ClipboardList size={28} className="text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2"
            style={{ fontFamily: 'Sora, sans-serif' }}>
            Чеклистата за денес е пополнета
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-1">
            Веќе постои запис за <strong>{(() => { const d = new Date(today + 'T12:00:00'); return `${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`; })()}</strong>
          </p>
          {duplicateRecord.checked_by_name && (
            <p className="text-xs text-[var(--text-muted)] mb-6">
              Пополнета од: {duplicateRecord.checked_by_name}
              {duplicateRecord.created_at && (
                <> во {new Date(duplicateRecord.created_at).toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' })}</>
              )}
            </p>
          )}
          <div className="flex flex-col gap-2.5 mt-4">
            <button
              onClick={() => navigate(`/checklist/${duplicateRecord.id}`)}
              className="btn-primary w-full py-3 text-sm">
              <Pencil size={16} />
              Едитирај го постоечкиот запис
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-secondary w-full py-2.5 text-sm">
              <X size={16} />
              Назад кон почетна
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStepState = (i) => {
    if (i === step) return 'active';
    if (stepErrors[i]?.length > 0) return 'error';
    if (i < step) return 'completed';
    return 'future';
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Title */}
      <h1 className="page-title mb-1 animate-in">
        {isEdit ? 'Едитирај запис' : 'Дневна Чек-Листа'}
      </h1>

      {isEdit && (
        <div className="info-box mb-4 animate-in flex items-center gap-2 text-xs">
          <AlertCircle size={14} />
          Едитирање на постоечки запис
        </div>
      )}

      {/* Date */}
      <div className="mb-4 animate-in-delay-1">
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1" style={{ fontFamily: 'Sora, sans-serif' }}>Датум</label>
        <input type="date" value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          className="input-base" />
      </div>

      {/* ── Stepper ── */}
      <div className="mb-5 animate-in-delay-1">
        <div className="flex items-center justify-between relative">
          {/* Progress line */}
          <div className="absolute top-[14px] left-[24px] right-[24px] h-[1.5px] bg-[var(--border)] rounded-full" />
          <div className="absolute top-[14px] left-[24px] h-[1.5px] rounded-full transition-all duration-500"
            style={{
              width: `calc(${(step / (STEPS.length - 1)) * 100}% - 48px)`,
              background: 'linear-gradient(90deg, var(--primary), var(--primary-deep))',
            }} />

          {STEPS.map((s, i) => {
            const state = getStepState(i);
            return (
              <button key={i} type="button"
                onClick={() => {
                  if (i <= step) { setStep(i); setTimeout(() => window.scrollTo(0, 0), 50); }
                  else {
                    const errors = validateStep(step);
                    if (errors.length > 0) setStepErrors({ ...stepErrors, [step]: errors });
                    else { setStepErrors({ ...stepErrors, [step]: [] }); setStep(i); setTimeout(() => window.scrollTo(0, 0), 50); }
                  }
                }}
                className="flex flex-col items-center relative z-10">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                  state === 'active' ? 'text-white' :
                  state === 'error' ? 'bg-red-50 text-[var(--danger)] border-[1.5px] border-[var(--danger)]' :
                  state === 'completed' ? 'text-white' :
                  'bg-white text-[var(--text-muted)] border-[1.5px] border-[var(--border)]'
                }`}
                  style={
                    state === 'active' ? { background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))', boxShadow: '0 0 0 4px rgba(37,99,235,0.15), 0 2px 8px rgba(37,99,235,0.25)' } :
                    state === 'completed' ? { background: 'linear-gradient(135deg, var(--success), #16a34a)' } : {}
                  }>
                  {state === 'completed' ? <Check size={12} strokeWidth={3} /> : i + 1}
                </div>
                <span className={`text-[8px] mt-1 font-medium whitespace-nowrap ${
                  state === 'active' ? 'text-[var(--primary)]' :
                  state === 'error' ? 'text-[var(--danger)]' :
                  state === 'completed' ? 'text-[var(--success)]' :
                  'text-[var(--text-muted)]'
                }`}>{s}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation errors */}
      {currentStepErrors.length > 0 && (
        <div className="alert-danger mb-3 animate-in text-xs">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertCircle size={13} />
            Непополнети полиња:
          </p>
          <ul className="list-disc list-inside text-xs mt-1 opacity-80">
            {currentStepErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* Step content */}
      <div className="card mb-4 animate-in-delay-2">
        {step === 0 && <WaterControlStep data={formData.water_control} onChange={(d) => setFormData({ ...formData, water_control: d })} norms={norms} requiredFields={REQUIRED_WATER_FIELDS} />}
        {step === 1 && <FiltrationStep data={formData.filtration_checks} onChange={(d) => setFormData({ ...formData, filtration_checks: d })} />}
        {step === 2 && <FishControlStep data={formData.fish_visual} onChange={(d) => setFormData({ ...formData, fish_visual: d })} />}
        {step === 3 && <FeedingStep ref={feedingRef} data={formData.pool_feeding} onChange={(d) => setFormData({ ...formData, pool_feeding: d })} poolMeasurements={poolMeasurements} fishInventory={fishInventory} />}
        {step === 4 && <ActivitiesStep data={formData.activities} onChange={(d) => setFormData({ ...formData, activities: d })} />}
      </div>

      {/* Messages */}
      {error && <div className="alert-danger mb-3 animate-in text-sm">{error}</div>}
      {success && <div className="alert-success mb-3 animate-in text-sm">{success}</div>}

      {/* Nav buttons */}
      <div className="flex gap-3 animate-in-delay-3">
        {step > 0 && (
          <button type="button" onClick={() => {
            if (step === 3 && feedingRef.current?.tryGoBackPool()) {
              setTimeout(() => window.scrollTo(0, 0), 50);
              return;
            }
            setStep(step - 1); setTimeout(() => window.scrollTo(0, 0), 50);
          }} className="btn-secondary flex-1 py-2.5">
            <ChevronLeft size={16} /> Назад
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={handleNext} className="btn-primary flex-1 py-2.5">
            Следно <ChevronRight size={16} />
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={saving} className="btn-primary flex-1 py-2.5">
            {saving ? (
              <span className="flex items-center gap-2">
                <div className="wave-loader"><span /><span /><span /><span /></div>
                Се зачувува...
              </span>
            ) : (
              <><Save size={16} /> {isEdit ? 'Ажурирај' : 'Зачувај'}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
