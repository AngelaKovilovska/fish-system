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
      api.getWaterPrediction()
        .then(d => setWaterPrediction(d))
        .catch(() => {})
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
          {!waterData || !waterData.hasData ? (
            <div className="card !p-5 text-center">
              <Droplets size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
              <p className="text-sm text-[var(--text-muted)]">Нема податоци за анализа на вода</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Потребни се внесени чеклисти за анализа</p>
            </div>
          ) : (
            <>
              {/* Anomaly summary */}
              <div className="card !p-4">
                {waterData.hasAnomalies ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 dark:bg-amber-900/20">
                      <AlertTriangle size={20} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                        Детектирани аномалии
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {waterData.criticalCount > 0 && <span className="text-[var(--danger)] font-medium">{waterData.criticalCount} критични</span>}
                        {waterData.criticalCount > 0 && waterData.warningCount > 0 && ' · '}
                        {waterData.warningCount > 0 && <span className="text-[var(--warning)] font-medium">{waterData.warningCount} предупредувања</span>}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-50 dark:bg-green-900/20">
                      <CheckCircle size={20} className="text-[var(--success)]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                        Сите параметри се во норма
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Последна анализа: {formatDateMK(waterData.date)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Anomaly list */}
              {waterData.anomalies?.length > 0 && (
                <div className="space-y-2">
                  {waterData.anomalies.map((a, i) => (
                    <div key={i} className="card !p-3 flex items-center gap-3"
                      style={{ borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}` }}>
                      <AlertTriangle size={14}
                        className={a.severity === 'critical' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'} />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-[var(--text-primary)]">{a.message}</p>
                        {a.zScore != null && (
                          <p className="text-[10px] text-[var(--text-muted)]">Z-score: {a.zScore}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Parameter status grid */}
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Детална анализа
                </p>
                {Object.values(waterData.parameterStatus || {}).map(param => {
                  const statusColor = param.rangeStatus === 'normal' ? 'var(--success)'
                    : param.rangeStatus === 'high' ? 'var(--danger)'
                    : 'var(--warning)';

                  const TrendIcon = param.trend === 'rising' ? TrendingUp
                    : param.trend === 'falling' ? TrendingDown
                    : Minus;

                  return (
                    <div key={param.parameter} className="card !p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{param.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {param.trend && (
                            <TrendIcon size={12} className={
                              param.trend === 'rising' ? 'text-red-400'
                              : param.trend === 'falling' ? 'text-blue-400'
                              : 'text-[var(--text-muted)]'
                            } />
                          )}
                          <span className="text-sm font-bold text-[var(--text-primary)]">
                            {param.currentValue}{param.unit}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-[var(--text-muted)]">
                        <span>Опсег: {param.optimalRange.min} – {param.optimalRange.max}{param.unit}</span>
                        {param.zScore != null && (
                          <span className={Math.abs(param.zScore) > 2 ? 'text-[var(--danger)] font-medium' : ''}>
                            Z: {param.zScore}
                          </span>
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

          {/* ── Water Prediction (Random Forest) ── */}
          {predictionLoading && (
            <div className="card !p-5 text-center">
              <div className="wave-loader mx-auto mb-2"><span /><span /><span /><span /></div>
              <p className="text-xs text-[var(--text-muted)]">Моделот тренира од историските податоци...</p>
            </div>
          )}

          {waterPrediction && !predictionLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mt-2">
                <Activity size={14} className="text-purple-500" />
                <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Предвидување (Random Forest · {waterPrediction.modelInfo?.trainingDays || '?'} дена)
                </p>
              </div>

              {/* Prediction warnings */}
              {waterPrediction.warnings?.length > 0 && (
                <div className="space-y-1.5">
                  {waterPrediction.warnings.map((w, i) => (
                    <div key={i} className="card !p-3 flex items-start gap-2.5"
                      style={{
                        borderLeft: `3px solid ${w.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}`,
                        background: w.severity === 'critical'
                          ? 'linear-gradient(135deg, rgba(239,68,68,0.05), transparent)'
                          : 'linear-gradient(135deg, rgba(245,158,11,0.05), transparent)',
                      }}>
                      <Clock size={14} className={w.severity === 'critical' ? 'text-[var(--danger)] mt-0.5' : 'text-[var(--warning)] mt-0.5'} />
                      <div>
                        <p className="text-xs font-medium text-[var(--text-primary)]">{w.message}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                          Предвидено за {w.daysUntil} ден{w.daysUntil > 1 ? 'а' : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {waterPrediction.warnings?.length === 0 && (
                <div className="card !p-3 flex items-center gap-2.5"
                  style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.05), transparent)', borderLeft: '3px solid var(--success)' }}>
                  <CheckCircle size={14} className="text-[var(--success)]" />
                  <p className="text-xs text-[var(--text-primary)]">Сите параметри ќе останат во норма следните 7 дена</p>
                </div>
              )}

              {/* Per-parameter predictions */}
              {Object.values(waterPrediction.predictions || {}).map(pred => {
                if (pred.insufficient) {
                  return (
                    <div key={pred.parameter} className="card !p-3 opacity-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-muted)]">{pred.label}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{pred.message}</span>
                      </div>
                    </div>
                  );
                }

                // Build sparkline points from recent + predicted
                const allValues = [
                  ...(pred.recent || []).map(r => r.value),
                  ...pred.predicted,
                ];
                const minV = Math.min(...allValues.filter(v => v > 0));
                const maxV = Math.max(...allValues);
                const range = maxV - minV || 1;
                const sparkH = 32;
                const sparkW = 140;
                const recentLen = pred.recent?.length || 0;
                const totalPts = allValues.length;
                const step = sparkW / Math.max(1, totalPts - 1);

                const recentPath = pred.recent?.map((r, i) => {
                  const x = i * step;
                  const y = sparkH - ((r.value - minV) / range) * (sparkH - 4) - 2;
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ') || '';

                const predPath = pred.predicted.map((v, i) => {
                  const x = (recentLen - 1 + i) * step;
                  const y = sparkH - ((v - minV) / range) * (sparkH - 4) - 2;
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');

                // Norm band
                let normY1 = null, normY2 = null;
                if (pred.norm) {
                  if (pred.norm.max !== null) normY1 = sparkH - ((pred.norm.max - minV) / range) * (sparkH - 4) - 2;
                  if (pred.norm.min !== null) normY2 = sparkH - ((pred.norm.min - minV) / range) * (sparkH - 4) - 2;
                }

                const lastPredicted = pred.predicted[pred.predicted.length - 1];
                const trendUp = lastPredicted > pred.current;
                const trendDown = lastPredicted < pred.current;
                const PredTrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus;

                return (
                  <div key={pred.parameter} className="card !p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{pred.label}</span>
                        {pred.willExceedNorm && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-red-50 dark:bg-red-900/20 text-[var(--danger)]">
                            ↑ надвор за {pred.daysUntilExceeded}д
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <PredTrendIcon size={11} className={
                          trendUp ? 'text-red-400' : trendDown ? 'text-blue-400' : 'text-[var(--text-muted)]'
                        } />
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                          {pred.current}{pred.unit}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">→</span>
                        <span className={`text-xs font-bold ${pred.willExceedNorm ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>
                          {lastPredicted}{pred.unit}
                        </span>
                      </div>
                    </div>

                    {/* Sparkline */}
                    <div className="flex items-center gap-3">
                      <svg width={sparkW} height={sparkH} className="flex-shrink-0">
                        {/* Norm band */}
                        {normY1 !== null && normY2 !== null && (
                          <rect x="0" y={Math.min(normY1, normY2)} width={sparkW}
                            height={Math.abs(normY2 - normY1)}
                            fill="rgba(34,197,94,0.1)" rx="2" />
                        )}
                        {/* Recent (solid) */}
                        {recentPath && (
                          <path d={recentPath} fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" />
                        )}
                        {/* Predicted (dashed) */}
                        <path d={predPath} fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="3,2" strokeLinecap="round" />
                        {/* Divider line */}
                        {recentLen > 0 && (
                          <line x1={(recentLen - 1) * step} y1="0" x2={(recentLen - 1) * step} y2={sparkH}
                            stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.4" />
                        )}
                      </svg>
                      <div className="text-[9px] text-[var(--text-muted)] leading-tight flex-1">
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-3 h-0.5 bg-[var(--primary)] rounded" /> историски
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-3 h-0.5 rounded" style={{ background: '#8b5cf6', opacity: 0.7 }} /> предвидени
                        </div>
                        {pred.norm && (
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'rgba(34,197,94,0.2)' }} /> норма
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Accuracy + top feature */}
                    <div className="flex items-center justify-between mt-1.5 text-[9px] text-[var(--text-muted)]">
                      <span>
                        Точност: R²={pred.accuracy?.r2} · MAE={pred.accuracy?.mae}{pred.unit}
                      </span>
                      {pred.featureImportance?.[0] && (
                        <span>
                          Главен фактор: {pred.featureImportance[0].name} ({Math.round(pred.featureImportance[0].importance * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Model info */}
              {waterPrediction.modelInfo && (
                <div className="text-center text-[9px] text-[var(--text-muted)] py-1">
                  {waterPrediction.modelInfo.algorithm} · {waterPrediction.modelInfo.trees} дрвја ·
                  {waterPrediction.modelInfo.features} features · {waterPrediction.modelInfo.trainingDays} дена тренинг
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="text-center py-4">
        <p className="text-[10px] text-[var(--text-muted)]">
          * Храна: Coppens 2025-2026. Вода: Random Forest тренирано на ваши историски податоци.
        </p>
      </div>
    </div>
  );
}
