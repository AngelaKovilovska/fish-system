import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Brain, Fish, Thermometer, Calculator, ChevronLeft, AlertTriangle, CheckCircle, Droplets, TrendingUp, TrendingDown, Minus, Info, Activity, Clock, BarChart3 } from 'lucide-react';

/* ── Macedonian formatting ── */
const MK_MONTHS = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

function formatDateMK(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function AICalculator() {
  const [tab, setTab] = useState('pools'); // 'pools' | 'calculator' | 'water'
  const [aiData, setAiData] = useState(null);
  const [waterData, setWaterData] = useState(null);
  const [waterPrediction, setWaterPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calcLoading, setCalcLoading] = useState(false);

  // Calculator inputs
  const [calcInputs, setCalcInputs] = useState({
    fishCount: '',
    avgWeight: '',
    temperature: '',
  });
  const [calcResult, setCalcResult] = useState(null);

  useEffect(() => {
    Promise.all([
      api.getAIRecommendations().then(d => setAiData(d)).catch(() => {}),
      api.getWaterAnalysis().then(d => setWaterData(d)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Load water prediction when water tab is opened
  useEffect(() => {
    if (tab === 'water' && !waterPrediction && !predictionLoading) {
      setPredictionLoading(true);
      setPredictionError(null);
      api.getWaterPrediction()
        .then(d => setWaterPrediction(d))
        .catch(err => setPredictionError(err.message || 'Грешка при вчитување'))
        .finally(() => setPredictionLoading(false));
    }
  }, [tab]);

  const handleCalculate = async () => {
    const count = parseInt(calcInputs.fishCount);
    const weight = parseFloat(calcInputs.avgWeight);
    if (!count || count <= 0 || !weight || weight <= 0) return;

    setCalcLoading(true);
    try {
      const result = await api.calculateAI({
        fishCount: count,
        avgWeight: weight,
        temperature: calcInputs.temperature ? parseFloat(calcInputs.temperature) : null,
      });
      setCalcResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setCalcLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-full" />
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 animate-in">
        <Link to="/" className="btn-ghost !p-2"><ChevronLeft size={18} /></Link>
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BarChart3 size={20} className="text-purple-500" />
            Проекции
          </h1>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Препораки за хранење и предвидување на параметри
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-[var(--surface)] p-1 rounded-[var(--r-md)] border border-[var(--border)] animate-in-delay-1">
        {[
          { key: 'pools', label: 'Базени', icon: Fish },
          { key: 'calculator', label: 'Калкулатор', icon: Calculator },
          { key: 'water', label: 'Вода', icon: Droplets },
        ].map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[var(--r-sm)] text-xs font-semibold transition-all ${
              tab === t.key
                ? 'bg-[var(--primary)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--primary-muted)]'
            }`}
            style={{ fontFamily: 'Sora, sans-serif' }}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ POOLS TAB ═══════ */}
      {tab === 'pools' && aiData && (
        <div className="space-y-4 animate-in-delay-1">
          {/* Summary */}
          <div className="card !p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>Вкупна дневна потреба</p>
                <p className="text-2xl font-bold text-[var(--text-primary)] mt-1" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {aiData.summary?.totalDailyFoodKg?.toFixed(2)} <span className="text-sm font-normal text-[var(--text-muted)]">kg</span>
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Биомаса: {aiData.summary?.totalBiomassKg?.toFixed(2)} kg · {aiData.summary?.poolCount} базени
                </p>
              </div>
              {aiData.summary?.temperature != null && (
                <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-[var(--primary-muted)]">
                  <Thermometer size={18} className="text-[var(--primary)]" />
                  <span className="text-lg font-bold text-[var(--primary)]">{aiData.summary.temperature}°C</span>
                </div>
              )}
            </div>

            {/* Food type needs */}
            {aiData.summary?.foodTypeNeeds?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-2" style={{ fontFamily: 'Sora, sans-serif' }}>По тип на храна</p>
                <div className="space-y-1.5">
                  {aiData.summary.foodTypeNeeds.map((ft, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-[var(--text-secondary)]">{ft.foodType}</span>
                      <span className="text-xs font-bold text-[var(--text-primary)]">{ft.dailyNeedKg} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Per-pool details */}
          {Object.values(aiData.pools).map(poolRec => {
            if (!poolRec.hasData) {
              return (
                <div key={poolRec.poolNumber} className="card !p-4 opacity-60">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                      <Fish size={16} className="text-[var(--text-muted)]" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-muted)]" style={{ fontFamily: 'Sora, sans-serif' }}>Базен {poolRec.poolNumber}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">Нема доволно податоци</p>
                    </div>
                  </div>
                </div>
              );
            }

            const rec = poolRec.recommendation;
            const comp = poolRec.comparison;
            const warn = poolRec.warnings;
            const tempAdj = poolRec.temperatureAdjustment;

            return (
              <div key={poolRec.poolNumber} className="card !p-0 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))' }}>
                      <span className="text-xs font-bold text-white">{poolRec.poolNumber}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Базен {poolRec.poolNumber}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {poolRec.poolData.fishCount} риби · {poolRec.poolData.avgWeight}g просек · {poolRec.poolData.biomassKg}kg биомаса
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recommendation */}
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Дневно</p>
                      <p className="text-xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                        {rec.dailyFoodGr}<span className="text-[10px] font-normal text-[var(--text-muted)]"> g</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">По оброк ({rec.mealsPerDay}×)</p>
                      <p className="text-xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                        {rec.perMealGr}<span className="text-[10px] font-normal text-[var(--text-muted)]"> g</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="text-[10px] px-2 py-1 rounded-full font-semibold"
                      style={{ background: 'rgba(139,92,246,0.18)', color: '#6d28d9' }}>
                      {rec.foodType}
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full font-semibold"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#1d4ed8' }}>
                      {rec.feedSizeMm}mm пелет
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full font-semibold"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#15803d' }}>
                      {rec.feedRatePercent}% BW/ден
                    </span>
                    {!tempAdj.isOptimal && tempAdj.factor < 1 && (
                      <span className="text-[10px] px-2 py-1 rounded-full font-semibold"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#b45309' }}>
                        Темп. корекција: ×{tempAdj.factor}
                      </span>
                    )}
                  </div>

                  {/* Actual vs Recommended comparison */}
                  {comp && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        {comp.status === 'optimal' ? (
                          <CheckCircle size={14} className="text-[var(--success)]" />
                        ) : (
                          <AlertTriangle size={14} className={comp.status.includes('over') ? 'text-[var(--danger)]' : 'text-[var(--warning)]'} />
                        )}
                        <p className="text-xs font-medium text-[var(--text-primary)]">{comp.message}</p>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-[11px] text-[var(--text-muted)]">
                        <span>Препорака: {comp.recommendedGr}g</span>
                        <span>Реално денес: {comp.actualGr}g</span>
                        <span className={`font-medium ${comp.differencePercent > 0 ? 'text-[var(--danger)]' : comp.differencePercent < 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                          {comp.differencePercent > 0 ? '+' : ''}{comp.differencePercent}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {(warn?.foodTypeWarning || warn?.transitionNote || warn?.criticalWarning) && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
                      {warn.criticalWarning && (
                        <p className="text-[11px] text-[var(--danger)] font-medium flex items-center gap-1.5">
                          <AlertTriangle size={12} /> {warn.criticalWarning}
                        </p>
                      )}
                      {warn.foodTypeWarning && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <Info size={12} /> {warn.foodTypeWarning}
                        </p>
                      )}
                      {warn.transitionNote && (
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                          <Info size={12} /> {warn.transitionNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ CALCULATOR TAB ═══════ */}
      {tab === 'calculator' && (
        <div className="space-y-4 animate-in-delay-1">
          <div className="card !p-5">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
              Рачен калкулатор
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Број на риби</label>
                <input type="number" min="1"
                  value={calcInputs.fishCount}
                  onChange={e => setCalcInputs(p => ({ ...p, fishCount: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm"
                  placeholder="нпр. 500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Просечна тежина (грами)</label>
                <input type="number" min="0.1" step="0.1"
                  value={calcInputs.avgWeight}
                  onChange={e => setCalcInputs(p => ({ ...p, avgWeight: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm"
                  placeholder="нпр. 250"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Температура на вода °C (опционално)</label>
                <input type="number" min="0" max="45" step="0.1"
                  value={calcInputs.temperature}
                  onChange={e => setCalcInputs(p => ({ ...p, temperature: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm"
                  placeholder="нпр. 27"
                />
              </div>

              <button onClick={handleCalculate}
                disabled={calcLoading || !calcInputs.fishCount || !calcInputs.avgWeight}
                className="w-full py-3 rounded-[var(--r-sm)] text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  boxShadow: '0 2px 10px rgba(139,92,246,0.3)',
                  fontFamily: 'Sora, sans-serif',
                }}>
                <Calculator size={16} />
                {calcLoading ? 'Пресметува...' : 'Пресметај'}
              </button>
            </div>
          </div>

          {/* Calculator Result */}
          {calcResult && calcResult.hasData && (
            <div className="card !p-5 animate-in">
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2" style={{ fontFamily: 'Sora, sans-serif' }}>
                <Brain size={16} className="text-purple-500" />
                Резултат
              </p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 uppercase font-semibold mb-1">Дневно</p>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {calcResult.recommendation.dailyFoodGr}
                  </p>
                  <p className="text-[10px] text-purple-500">грами</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-semibold mb-1">По оброк ({calcResult.recommendation.mealsPerDay}×)</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {calcResult.recommendation.perMealGr}
                  </p>
                  <p className="text-[10px] text-blue-500">грами</p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Тип на храна</span>
                  <span className="font-semibold text-[var(--text-primary)]">{calcResult.recommendation.foodType}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Големина на пелет</span>
                  <span className="font-semibold text-[var(--text-primary)]">{calcResult.recommendation.feedSizeMm} mm</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Стапка на хранење</span>
                  <span className="font-semibold text-[var(--text-primary)]">{calcResult.recommendation.feedRatePercent}% BW/ден</span>
                </div>
                {calcResult.recommendation.baseFeedRatePercent !== calcResult.recommendation.feedRatePercent && (
                  <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Базна стапка (без корекција)</span>
                    <span className="font-semibold text-[var(--text-primary)]">{calcResult.recommendation.baseFeedRatePercent}% BW/ден</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Биомаса</span>
                  <span className="font-semibold text-[var(--text-primary)]">{calcResult.poolData.biomassKg} kg</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Оброци дневно</span>
                  <span className="font-semibold text-[var(--text-primary)]">{calcResult.recommendation.mealsPerDay}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[var(--text-muted)]">Температура</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {calcResult.temperatureAdjustment.note}
                    {calcResult.temperatureAdjustment.factor < 1 && ` (×${calcResult.temperatureAdjustment.factor})`}
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {(calcResult.warnings?.criticalWarning || calcResult.warnings?.transitionNote) && (
                <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-1.5">
                  {calcResult.warnings.criticalWarning && (
                    <p className="text-[11px] text-[var(--danger)] font-medium flex items-center gap-1.5">
                      <AlertTriangle size={12} /> {calcResult.warnings.criticalWarning}
                    </p>
                  )}
                  {calcResult.warnings.transitionNote && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Info size={12} /> {calcResult.warnings.transitionNote}
                    </p>
                  )}
                </div>
              )}

              {/* Feed product info */}
              {calcResult.feedProductInfo && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold mb-1.5">За храната</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{calcResult.feedProductInfo.description}</p>
                </div>
              )}
            </div>
          )}

          {calcResult && !calcResult.hasData && (
            <div className="card !p-5 text-center">
              <p className="text-sm text-[var(--text-muted)]">{calcResult.message || 'Нема доволно податоци'}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════ WATER TAB ═══════ */}
      {tab === 'water' && (
        <div className="space-y-4 animate-in-delay-1">
          {predictionLoading && (
            <div className="card !p-5 text-center">
              <div className="wave-loader mx-auto mb-2"><span /><span /><span /><span /></div>
              <p className="text-xs text-[var(--text-muted)]">Анализирам водни параметри...</p>
            </div>
          )}

          {predictionError && !predictionLoading && (
            <div className="card !p-5 text-center">
              <AlertTriangle size={32} className="mx-auto text-[var(--danger)] mb-2" />
              <p className="text-sm text-[var(--text-primary)] mb-1">Грешка при анализа</p>
              <p className="text-[11px] text-[var(--text-muted)] mb-3">{predictionError}</p>
              <button onClick={() => { setWaterPrediction(null); setPredictionError(null); }}
                className="text-xs font-semibold text-[var(--primary)] hover:underline">
                Обиди се повторно
              </button>
            </div>
          )}

          {waterPrediction && !predictionLoading && !waterPrediction.hasData && (
            <div className="card !p-5 text-center">
              <Droplets size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
              <p className="text-sm text-[var(--text-muted)]">{waterPrediction.message || 'Нема податоци'}</p>
            </div>
          )}

          {waterPrediction && waterPrediction.hasData && (
            <>
              {/* Status summary */}
              <div className="card !p-4">
                {waterPrediction.isStable ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-50 dark:bg-green-900/20">
                      <CheckCircle size={20} className="text-[var(--success)]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Сите параметри се стабилни</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {waterPrediction.summary.analyzedParameters} параметри · {waterPrediction.summary.daysOfData} дена податоци · {formatDateMK(waterPrediction.date)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 dark:bg-amber-900/20">
                      <AlertTriangle size={20} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>Детектирани проблеми</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {waterPrediction.summary.alreadyExceeded > 0 && <span className="text-[var(--danger)] font-medium">{waterPrediction.summary.alreadyExceeded} надвор од норма</span>}
                        {waterPrediction.summary.alreadyExceeded > 0 && waterPrediction.summary.trendWarnings > 0 && ' · '}
                        {waterPrediction.summary.trendWarnings > 0 && <span className="text-[var(--warning)] font-medium">{waterPrediction.summary.trendWarnings} тренд предупредувања</span>}
                        {waterPrediction.summary.causalChainCount > 0 && <span className="text-purple-500 font-medium"> · {waterPrediction.summary.causalChainCount} каузални ланци</span>}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* NH₃ Toxicity Calculator */}
              {waterPrediction.nh3 && (
                <div className="card !p-4" style={{
                  borderLeft: `3px solid ${waterPrediction.nh3.isSafe ? 'var(--success)' : 'var(--danger)'}`,
                  background: waterPrediction.nh3.isSafe ? undefined : 'linear-gradient(135deg, rgba(239,68,68,0.04), transparent)',
                }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity size={14} className="text-purple-500" />
                    <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                      NH₃ Калкулатор (Emerson et al., 1975)
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">Измерен NH₄⁺</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{waterPrediction.nh3.tan} mg/L</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">Токсичен NH₃</p>
                      <p className={`text-sm font-bold ${waterPrediction.nh3.isSafe ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {waterPrediction.nh3.nh3} mg/L
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">NH₃ фракција</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{(waterPrediction.nh3.fraction * 100).toFixed(2)}%</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">
                    При pH {waterPrediction.nh3.ph} и {waterPrediction.nh3.temperature}°C · Безбедна граница: {waterPrediction.nh3.safeLimit} mg/L
                  </p>
                </div>
              )}

              {/* Warnings */}
              {waterPrediction.warnings?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                    Предупредувања
                  </p>
                  {waterPrediction.warnings.map((w, i) => (
                    <div key={i} className="card !p-3 flex items-start gap-2.5"
                      style={{
                        borderLeft: `3px solid ${w.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}`,
                        background: w.severity === 'critical'
                          ? 'linear-gradient(135deg, rgba(239,68,68,0.05), transparent)'
                          : 'linear-gradient(135deg, rgba(245,158,11,0.05), transparent)',
                      }}>
                      <AlertTriangle size={14} className={`${w.severity === 'critical' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'} mt-0.5 flex-shrink-0`} />
                      <p className="text-xs font-medium text-[var(--text-primary)]">{w.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Predictions ── */}
              {(() => {
                const predictions = [];
                Object.values(waterPrediction.parameters || {}).forEach(param => {
                  if (param.noData || !param.trend) return;
                  const { trend, currentValue, label, unit, norm } = param;

                  // Will cross norm within 7 days
                  if (trend.crossing && trend.crossing.daysUntil > 0 && trend.crossing.daysUntil <= 7 && !trend.crossing.alreadyExceeded) {
                    const predictedVal = Math.round((currentValue + trend.slope * trend.crossing.daysUntil) * 100) / 100;
                    predictions.push({
                      type: 'crossing',
                      label, unit, currentValue, predictedVal,
                      daysUntil: trend.crossing.daysUntil,
                      direction: trend.crossing.direction,
                      boundaryValue: trend.crossing.boundaryValue,
                      slope: trend.slope,
                      severity: trend.crossing.daysUntil <= 2 ? 'critical' : 'warning',
                    });
                  }

                  // Already exceeded — getting better or worse?
                  if (trend.crossing?.alreadyExceeded && trend.isSignificant) {
                    const isWorse = (trend.crossing.direction === 'high' && trend.slope > 0)
                      || (trend.crossing.direction === 'low' && trend.slope < 0);
                    const pred3d = Math.round((currentValue + trend.slope * 3) * 100) / 100;
                    predictions.push({
                      type: 'exceeded',
                      label, unit, currentValue, predictedVal: pred3d,
                      boundaryValue: trend.crossing.boundaryValue,
                      slope: trend.slope,
                      isWorse,
                      severity: isWorse ? 'critical' : 'info',
                    });
                  }
                });

                // Sort: critical first, then by daysUntil
                predictions.sort((a, b) => {
                  const s = { critical: 0, warning: 1, info: 2 };
                  return (s[a.severity] ?? 9) - (s[b.severity] ?? 9);
                });

                if (predictions.length === 0) return null;

                return (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                      Предвидувања (следни 7 дена)
                    </p>
                    {predictions.map((p, i) => {
                      const isCrit = p.severity === 'critical';
                      const isInfo = p.severity === 'info';
                      const borderColor = isCrit ? 'var(--danger)' : isInfo ? 'var(--success)' : 'var(--warning)';
                      const bgColor = isCrit ? 'rgba(239,68,68,0.05)' : isInfo ? 'rgba(34,197,94,0.05)' : 'rgba(245,158,11,0.05)';

                      if (p.type === 'crossing') {
                        return (
                          <div key={i} className="card !p-3" style={{ borderLeft: `3px solid ${borderColor}`, background: bgColor }}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <Clock size={13} className={isCrit ? 'text-[var(--danger)]' : 'text-[var(--warning)]'} />
                              <span className="text-xs font-semibold text-[var(--text-primary)]">{p.label}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isCrit ? 'bg-red-100 dark:bg-red-900/30 text-[var(--danger)]' : 'bg-amber-100 dark:bg-amber-900/30 text-[var(--warning)]'}`}>
                                за {p.daysUntil} ден{p.daysUntil > 1 ? 'а' : ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                              {p.direction === 'high' ? 'Ќе ја надмине' : 'Ќе падне под'} нормата ({p.boundaryValue}{p.unit}).
                              {' '}Моментално: <span className="font-semibold">{p.currentValue}{p.unit}</span> → предвидено: <span className="font-semibold text-[var(--text-primary)]">{p.predictedVal}{p.unit}</span>
                            </p>
                            <p className="text-[9px] text-[var(--text-muted)] mt-1">
                              Тренд: {p.slope > 0 ? '+' : ''}{p.slope}{p.unit}/ден
                            </p>
                          </div>
                        );
                      }

                      // exceeded — getting better or worse
                      return (
                        <div key={i} className="card !p-3" style={{ borderLeft: `3px solid ${borderColor}`, background: bgColor }}>
                          <div className="flex items-center gap-2 mb-1.5">
                            {p.isWorse
                              ? <TrendingUp size={13} className="text-[var(--danger)]" />
                              : <TrendingDown size={13} className="text-[var(--success)]" />}
                            <span className="text-xs font-semibold text-[var(--text-primary)]">{p.label}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${p.isWorse ? 'bg-red-100 dark:bg-red-900/30 text-[var(--danger)]' : 'bg-green-100 dark:bg-green-900/30 text-[var(--success)]'}`}>
                              {p.isWorse ? 'се влошува' : 'се подобрува'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            Надвор од норма ({p.boundaryValue}{p.unit}).
                            {' '}Моментално: <span className="font-semibold text-[var(--danger)]">{p.currentValue}{p.unit}</span> → за 3 дена: <span className={`font-semibold ${p.isWorse ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{p.predictedVal}{p.unit}</span>
                          </p>
                          <p className="text-[9px] text-[var(--text-muted)] mt-1">
                            Тренд: {p.slope > 0 ? '+' : ''}{p.slope}{p.unit}/ден
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Causal Chains */}
              {waterPrediction.causalChains?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                    Каузални ланци
                  </p>
                  {waterPrediction.causalChains.map((c, i) => (
                    <div key={i} className="card !p-3"
                      style={{ borderLeft: `3px solid ${c.severity === 'critical' ? 'var(--danger)' : '#8b5cf6'}` }}>
                      <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">{c.title}</p>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{c.message}</p>
                      <div className="flex items-center justify-between mt-1.5 text-[9px] text-[var(--text-muted)]">
                        <span>Временски рамки: {c.timeframe}</span>
                        <span>{c.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {waterPrediction.recommendations?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                    Што да направите
                  </p>
                  {waterPrediction.recommendations.map((r, i) => {
                    const urgencyColors = {
                      critical: { bg: 'rgba(239,68,68,0.06)', border: 'var(--danger)' },
                      high: { bg: 'rgba(245,158,11,0.06)', border: 'var(--warning)' },
                      medium: { bg: 'rgba(59,130,246,0.04)', border: 'var(--primary)' },
                      info: { bg: 'transparent', border: 'var(--border)' },
                    };
                    const urgencyLabels = {
                      critical: 'ИТНО',
                      high: 'Важно',
                      medium: 'Препорака',
                    };
                    const uc = urgencyColors[r.urgency] || urgencyColors.info;
                    return (
                      <div key={i} className="card !p-3" style={{ borderLeft: `3px solid ${uc.border}`, background: uc.bg }}>
                        <div className="flex items-start gap-2 mb-1.5">
                          {r.title && <p className="text-xs font-semibold text-[var(--text-primary)] flex-1">{r.title}</p>}
                          {urgencyLabels[r.urgency] && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{
                              background: r.urgency === 'critical' ? 'rgba(239,68,68,0.15)' : r.urgency === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.1)',
                              color: uc.border,
                            }}>
                              {urgencyLabels[r.urgency]}
                            </span>
                          )}
                        </div>
                        {/* Step-by-step instructions */}
                        {r.steps && r.steps.length > 0 ? (
                          <div className="space-y-1.5 mt-1">
                            {r.steps.map((step, si) => (
                              <div key={si} className="flex gap-2">
                                <span className="text-[10px] font-bold text-[var(--text-muted)] mt-px flex-shrink-0 w-4 text-right">{si + 1}.</span>
                                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{step}</p>
                              </div>
                            ))}
                          </div>
                        ) : r.action ? (
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{r.action}</p>
                        ) : null}
                        <p className="text-[9px] text-[var(--text-muted)] mt-2 pt-1.5 border-t border-[var(--border)]" style={{ opacity: 0.7 }}>
                          📖 {r.source}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Parameter details */}
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Детална анализа
                </p>
                {Object.values(waterPrediction.parameters || {}).filter(p => !p.noData).map(param => {
                  const norm = param.norm;
                  const isOutOfRange = norm && ((norm.max !== null && param.currentValue > norm.max) || (norm.min !== null && param.currentValue < norm.min));
                  const statusColor = isOutOfRange ? 'var(--danger)' : 'var(--success)';
                  const trend = param.trend;

                  const TrendIcon = trend?.direction === 'rising' ? TrendingUp
                    : trend?.direction === 'falling' ? TrendingDown : Minus;

                  return (
                    <div key={param.parameter} className="card !p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{param.label}</span>
                          {param.spike && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${param.spike.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/20 text-[var(--danger)]' : 'bg-amber-50 dark:bg-amber-900/20 text-[var(--warning)]'}`}>
                              Z:{param.spike.zScore}
                            </span>
                          )}
                          {trend?.crossing?.daysUntil > 0 && !trend.crossing.alreadyExceeded && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-50 dark:bg-amber-900/20 text-[var(--warning)]">
                              надвор за {trend.crossing.daysUntil}д
                            </span>
                          )}
                          {trend?.crossing?.alreadyExceeded && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-red-50 dark:bg-red-900/20 text-[var(--danger)]">
                              надвор од норма
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {trend && (
                            <TrendIcon size={12} className={
                              trend.direction === 'rising' ? 'text-red-400'
                              : trend.direction === 'falling' ? 'text-blue-400'
                              : 'text-[var(--text-muted)]'
                            } />
                          )}
                          <span className={`text-sm font-bold ${isOutOfRange ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                            {param.currentValue}{param.unit}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-[var(--text-muted)]">
                        <span>{norm ? `Норма: ${norm.min ?? '–'} – ${norm.max ?? '–'}${param.unit}` : 'Нема норма'}</span>
                        {trend?.isSignificant && (
                          <span>{trend.slope > 0 ? '+' : ''}{trend.slope}/ден (R²={trend.r2})</span>
                        )}
                        {param.stats && (
                          <span>μ={param.stats.mean} σ={param.stats.stdDev}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="text-center py-4">
        <p className="text-[10px] text-[var(--text-muted)]">
          * Храна: Coppens 2025-2026. Вода: Rule-based анализа со научно верифицирани препораки.
        </p>
      </div>
    </div>
  );
}
