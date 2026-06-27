import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Brain, Fish, Thermometer, Calculator, ChevronLeft, ChevronDown, AlertTriangle, CheckCircle, Droplets, TrendingUp, TrendingDown, Minus, Info, Activity, Clock, BarChart3, Cpu, Sprout } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { MK_MONTHS } from '../lib/constants';

function formatDateMK(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function AICalculator() {
  const [tab, setTab] = useState('pools'); // 'pools' | 'calculator' | 'water'
  const [aiData, setAiData] = useState(null);
  const [waterPrediction, setWaterPrediction] = useState(null);
  const [waterForecast, setWaterForecast] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState(null);
  const [expandedRec, setExpandedRec] = useState(null);
  const [rfExpanded, setRfExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calcLoading, setCalcLoading] = useState(false);

  // Growth tab state
  const [growthPool, setGrowthPool] = useState(1);
  const [growthFrom, setGrowthFrom] = useState(''); // '' = all measurements
  const [growthData, setGrowthData] = useState(null);
  const [growthLoading, setGrowthLoading] = useState(false);

  // Calculator inputs
  const [calcInputs, setCalcInputs] = useState({
    fishCount: '',
    avgWeight: '',
    temperature: '',
  });
  const [calcResult, setCalcResult] = useState(null);

  useEffect(() => {
    api.getAIRecommendations().then(d => setAiData(d)).catch(() => setAiData(null)).finally(() => setLoading(false));
  }, []);

  // Load water prediction + ML forecast when water tab is opened
  useEffect(() => {
    if (tab === 'water' && !waterPrediction && !predictionLoading) {
      setPredictionLoading(true);
      setPredictionError(null);
      Promise.all([
        api.getWaterPrediction().then(d => setWaterPrediction(d)),
        api.getWaterForecast().then(d => setWaterForecast(d)).catch(() => setWaterForecast(null)),
      ])
        .catch(err => setPredictionError(err.message || 'Грешка при вчитување'))
        .finally(() => setPredictionLoading(false));
    }
  }, [tab]);

  // Load growth data when growth tab is opened or pool/date changes
  useEffect(() => {
    if (tab !== 'growth') return;
    setGrowthLoading(true);
    api.getGrowthHistory(growthPool, growthFrom || undefined)
      .then(d => setGrowthData(d))
      .catch(() => setGrowthData(null))
      .finally(() => setGrowthLoading(false));
  }, [tab, growthPool, growthFrom]);

  // Merge all 3 curves into one dataset for recharts
  const chartData = useMemo(() => {
    if (!growthData?.hasData) return [];
    const map = {};
    // SGR projection (daily)
    (growthData.sgrProjection || []).forEach(p => {
      if (!map[p.date]) map[p.date] = { date: p.date };
      map[p.date].sgr = p.weight;
    });
    // Coppens ideal (daily)
    (growthData.coppensIdeal || []).forEach(p => {
      if (!map[p.date]) map[p.date] = { date: p.date };
      map[p.date].coppens = p.weight;
    });
    // Actual measurements (sparse — only on measurement days)
    (growthData.measurements || []).forEach(p => {
      if (!map[p.date]) map[p.date] = { date: p.date };
      map[p.date].actual = p.weight;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [growthData]);

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
    } catch {
      setCalcResult(null);
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
          { key: 'growth', label: 'Раст', icon: Sprout },
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
                  className="input-base"
                  placeholder="нпр. 500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Просечна тежина (грами)</label>
                <input type="number" min="0.1" step="0.1"
                  value={calcInputs.avgWeight}
                  onChange={e => setCalcInputs(p => ({ ...p, avgWeight: e.target.value }))}
                  className="input-base"
                  placeholder="нпр. 250"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] mb-1 block">Температура на вода °C (опционално)</label>
                <input type="number" min="0" max="45" step="0.1"
                  value={calcInputs.temperature}
                  onChange={e => setCalcInputs(p => ({ ...p, temperature: e.target.value }))}
                  className="input-base"
                  placeholder="нпр. 27"
                />
              </div>

              <button onClick={handleCalculate}
                disabled={calcLoading || !calcInputs.fishCount || !calcInputs.avgWeight}
                className="btn-primary w-full !py-3"
                style={{ fontFamily: 'Sora, sans-serif' }}>
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

              {/* Warnings section removed — crossing/exceeded warnings are shown below the LR table */}

              {/* ── ПРИМАРНА ПРЕДИКЦИЈА (Линеарна регресија) ── */}
              {(() => {
                const predictions = [];
                const modelSel = waterPrediction.modelSelection || {};
                Object.values(waterPrediction.parameters || {}).forEach(param => {
                  if (param.noData || !param.trend) return;
                  const { trend, currentValue, label, unit, norm, parameter } = param;
                  // Температурата е контролирана со топлотна пумпа — не се предвидува
                  if (parameter === 'temperature') return;
                  if (!trend.isSignificant && Math.abs(trend.slope) < 0.005) return;

                  const pred3 = Math.round((currentValue + trend.slope * 3) * 100) / 100;
                  const pred7 = Math.round((currentValue + trend.slope * 7) * 100) / 100;

                  const isCurrentlyOut = norm && (
                    (norm.max !== null && currentValue > norm.max) ||
                    (norm.min !== null && currentValue < norm.min)
                  );
                  const willBeOut3 = norm && (
                    (norm.max !== null && pred3 > norm.max) ||
                    (norm.min !== null && pred3 < norm.min)
                  );
                  const willBeOut7 = norm && (
                    (norm.max !== null && pred7 > norm.max) ||
                    (norm.min !== null && pred7 < norm.min)
                  );

                  let severity = 'stable';
                  if (isCurrentlyOut) {
                    const gettingWorse = (norm.max !== null && currentValue > norm.max && trend.slope > 0)
                      || (norm.min !== null && currentValue < norm.min && trend.slope < 0);
                    severity = gettingWorse ? 'critical' : 'recovering';
                  } else if (willBeOut7) {
                    severity = willBeOut3 ? 'warning' : 'caution';
                  }

                  // Дали RF е подобар за овој параметар?
                  const sel = modelSel[parameter];
                  const rfIsPrimary = sel?.primary === 'rf';
                  const lrIsWeak = sel?.primary === 'lr_weak';

                  predictions.push({
                    parameter, label, unit, currentValue, pred3, pred7, norm,
                    slope: trend.slope, r2: trend.r2, direction: trend.direction,
                    daysAnalyzed: trend.daysAnalyzed,
                    isCurrentlyOut, willBeOut3, willBeOut7, severity,
                    crossing: trend.crossing,
                    linearFitValid: trend.linearFitValid,
                    fitDiagnostics: trend.fitDiagnostics,
                    rfIsPrimary,
                    lrIsWeak,
                  });
                });

                const sevOrder = { critical: 0, warning: 1, caution: 2, recovering: 3, stable: 4 };
                predictions.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));

                if (predictions.length === 0) return null;

                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={13} className="text-[var(--success)]" />
                      <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                        Примарна предикција — Линеарна регресија
                      </p>
                    </div>

                    {/* Prediction table */}
                    <div className="card !p-0 overflow-hidden">
                      <div className="grid grid-cols-4 gap-0 px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]"
                        style={{ fontFamily: 'Sora, sans-serif', background: 'var(--surface)' }}>
                        <span>Параметар</span>
                        <span className="text-right">Сега</span>
                        <span className="text-right">За 3 дена</span>
                        <span className="text-right">За 7 дена</span>
                      </div>

                      {predictions.map((p, i) => {
                        const TIcon = p.direction === 'rising' ? TrendingUp
                          : p.direction === 'falling' ? TrendingDown : Minus;
                        const trendColor = p.severity === 'critical' ? 'text-[var(--danger)]'
                          : p.severity === 'recovering' ? 'text-[var(--success)]'
                          : p.severity === 'warning' || p.severity === 'caution' ? 'text-[var(--warning)]'
                          : 'text-[var(--text-muted)]';

                        const valColor = (val) => {
                          if (!p.norm) return 'text-[var(--text-primary)]';
                          const out = (p.norm.max !== null && val > p.norm.max)
                            || (p.norm.min !== null && val < p.norm.min);
                          return out ? 'text-[var(--danger)] font-bold' : 'text-[var(--text-primary)]';
                        };

                        return (
                          <div key={p.parameter}
                            className={`grid grid-cols-4 gap-0 px-3 py-2.5 items-center ${
                              i < predictions.length - 1 ? 'border-b border-[var(--border)]' : ''
                            }`}
                            style={{
                              background: p.severity === 'critical' ? 'rgba(239,68,68,0.04)'
                                : p.severity === 'warning' ? 'rgba(245,158,11,0.04)'
                                : p.severity === 'recovering' ? 'rgba(34,197,94,0.04)'
                                : 'transparent',
                            }}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <TIcon size={12} className={trendColor} />
                              <span className="text-xs font-medium text-[var(--text-primary)] truncate">{p.label}</span>
                              {/* ⚠ badge removed — LR fit is valid for trend monitoring */}
                            </div>
                            <span className={`text-xs text-right font-semibold ${p.isCurrentlyOut ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                              {p.currentValue}{p.unit}
                            </span>
                            <span className={`text-xs text-right ${valColor(p.pred3)}`}>
                              {p.pred3}{p.unit}
                            </span>
                            <span className={`text-xs text-right ${valColor(p.pred7)}`}>
                              {p.pred7}{p.unit}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Crossing warnings */}
                    {predictions.filter(p => p.crossing && p.crossing.daysUntil > 0 && p.crossing.daysUntil <= 7 && !p.crossing.alreadyExceeded).map((p, i) => (
                      <div key={`cross-${i}`} className="card !p-3 flex items-start gap-2.5"
                        style={{
                          borderLeft: `3px solid ${p.crossing.daysUntil <= 2 ? 'var(--danger)' : 'var(--warning)'}`,
                          background: p.crossing.daysUntil <= 2 ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
                        }}>
                        <Clock size={13} className={`${p.crossing.daysUntil <= 2 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'} mt-0.5 flex-shrink-0`} />
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          <span className="font-semibold text-[var(--text-primary)]">{p.label}</span>
                          {' '}{p.crossing.direction === 'high' ? 'ќе ја надмине' : 'ќе падне под'} нормата ({p.crossing.boundaryValue}{p.unit}) за <span className="font-bold">{p.crossing.daysUntil} ден{p.crossing.daysUntil > 1 ? 'а' : ''}</span>
                        </p>
                      </div>
                    ))}

                    {/* Already exceeded */}
                    {predictions.filter(p => p.isCurrentlyOut && p.direction !== 'stable').map((p, i) => {
                      const isWorse = p.severity === 'critical';
                      return (
                        <div key={`exc-${i}`} className="card !p-3 flex items-start gap-2.5"
                          style={{
                            borderLeft: `3px solid ${isWorse ? 'var(--danger)' : 'var(--success)'}`,
                            background: isWorse ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)',
                          }}>
                          {isWorse
                            ? <TrendingUp size={13} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
                            : <TrendingDown size={13} className="text-[var(--success)] mt-0.5 flex-shrink-0" />}
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            <span className="font-semibold text-[var(--text-primary)]">{p.label}</span> е надвор од норма и {isWorse ? 'продолжува да се влошува' : 'покажува знаци на подобрување'}.
                            {' '}Моментално: <span className="font-semibold">{p.currentValue}{p.unit}</span> → за 3 дена: <span className={`font-semibold ${isWorse ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{p.pred3}{p.unit}</span>
                          </p>
                        </div>
                      );
                    })}

                    <p className="text-[9px] text-[var(--text-muted)] italic">
                      * Линеарна регресија · последни {predictions[0]?.daysAnalyzed || '?'} дена · R² = {predictions[0]?.r2 || '?'}
                    </p>
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

              {/* Recommendations — expandable action cards */}
              {waterPrediction.recommendations?.length > 0 && (() => {
                const urgencyConfig = {
                  critical: { border: 'var(--danger)', label: 'ИТНО', dot: '#ef4444' },
                  high: { border: 'var(--warning)', label: 'ВАЖНО', dot: '#f59e0b' },
                  medium: { border: 'var(--primary)', label: 'ПРЕПОРАКА', dot: '#3b82f6' },
                  info: { border: 'var(--border)', label: '', dot: '#94a3b8' },
                };

                return (
                  <div className="space-y-2">
                    <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold" style={{ fontFamily: 'Sora, sans-serif' }}>
                      Што да направите
                    </p>
                    {waterPrediction.recommendations.map((r, i) => {
                      const uc = urgencyConfig[r.urgency] || urgencyConfig.info;
                      const steps = r.steps || (r.action ? [r.action] : []);
                      const isExpanded = expandedRec === i;

                      return (
                        <div key={i}
                          className="card !p-0 overflow-hidden transition-all duration-200"
                          style={{ borderLeft: `3px solid ${uc.border}` }}>

                          {/* Collapsed: summary row — click to expand */}
                          <button
                            onClick={() => setExpandedRec(isExpanded ? null : i)}
                            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--surface-hover)] transition-colors"
                          >
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: uc.dot }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{r.summary || r.title}</p>
                            </div>
                            <ChevronDown size={16} className={`text-[var(--text-muted)] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Expanded: detailed steps */}
                          {isExpanded && (
                            <div className="border-t border-[var(--border)]">
                              {/* Title */}
                              <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                                {uc.label && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: uc.border, color: '#fff' }}>
                                    {uc.label}
                                  </span>
                                )}
                                <p className="text-[12px] font-bold text-[var(--text-primary)]">{r.title}</p>
                              </div>

                              {/* Steps */}
                              <div className="px-4 py-2 space-y-2.5">
                                {steps.map((step, si) => (
                                  <div key={si} className="flex gap-2.5 items-start">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                                      style={{ background: `${uc.dot}22`, color: uc.dot, border: `1.5px solid ${uc.dot}` }}>
                                      {si + 1}
                                    </span>
                                    <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{step}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Source */}
                              <div className="px-4 py-2 border-t border-[var(--border)]">
                                <p className="text-[9px] text-[var(--text-muted)] opacity-60">Извор: {r.source}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── АЛТЕРНАТИВНА ПРЕДИКЦИЈА (Random Forest) — Accordion ── */}
              {waterForecast && waterForecast.available && (() => {
                const forecasts = waterForecast.forecasts || {};
                const availableForecasts = Object.values(forecasts).filter(f => f.available && f.parameter !== 'temperature');
                if (availableForecasts.length === 0) return null;

                return (
                  <div className="space-y-0">
                    {/* Accordion header — затворен по default */}
                    <button
                      onClick={() => setRfExpanded(!rfExpanded)}
                      className="w-full card !p-3 flex items-center gap-2 cursor-pointer transition-all hover:bg-[var(--surface-hover)]"
                      style={{ borderColor: 'rgba(139,92,246,0.15)' }}
                    >
                      <Cpu size={14} className="text-purple-400 flex-shrink-0" />
                      <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold flex-1 text-left" style={{ fontFamily: 'Sora, sans-serif' }}>
                        Алтернативна предикција (Random Forest)
                      </span>
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}>
                        Моделот учи
                      </span>
                      <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform duration-200 flex-shrink-0 ${rfExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Accordion content */}
                    {rfExpanded && (
                      <div className="space-y-2 mt-2 animate-in">
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed px-1">
                          Random Forest моделот е во фаза на тренирање и собирање податоци. Овие предвидувања се алтернативни — за примарна анализа користете ја линеарната регресија погоре.
                        </p>

                        <div className="card !p-0 overflow-hidden" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
                          <div className="grid grid-cols-5 gap-0 px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]"
                            style={{ fontFamily: 'Sora, sans-serif', background: 'linear-gradient(135deg, rgba(139,92,246,0.04), transparent)' }}>
                            <span className="col-span-1">Параметар</span>
                            <span className="text-right">Сега</span>
                            <span className="text-right">Утре</span>
                            <span className="text-right">За 2д</span>
                            <span className="text-right">За 3д</span>
                          </div>

                          {availableForecasts.map((f, i) => {
                            const preds = f.predictions || [];
                            const norm = waterPrediction?.parameters?.[f.parameter]?.norm;
                            const valColor = (val) => {
                              if (!norm || val == null) return '';
                              const out = (norm.max !== null && val > norm.max) || (norm.min !== null && val < norm.min);
                              return out ? 'text-[var(--danger)] font-bold' : '';
                            };
                            const r2 = f.metrics?.r2 || 0;
                            const r2Color = r2 >= 0.7 ? 'text-[var(--success)]' : r2 >= 0.5 ? 'text-amber-500' : 'text-[var(--text-muted)]';

                            return (
                              <div key={f.parameter}
                                className={`grid grid-cols-5 gap-0 px-3 py-2 items-center ${
                                  i < availableForecasts.length - 1 ? 'border-b border-[var(--border)]' : ''
                                }`}>
                                <div className="flex items-center gap-1 min-w-0 col-span-1">
                                  <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{f.label}</span>
                                  <span className={`text-[8px] font-semibold ${r2Color}`} title={`R² = ${r2}`}>
                                    {r2 >= 0.7 ? '●' : r2 >= 0.5 ? '◐' : '○'}
                                  </span>
                                </div>
                                <span className="text-[11px] text-right font-semibold text-[var(--text-primary)]">
                                  {f.currentValue != null ? f.currentValue : '–'}
                                </span>
                                {[0, 1, 2].map(dayIdx => {
                                  const pred = preds[dayIdx];
                                  if (!pred || pred.error) return <span key={dayIdx} className="text-[11px] text-right text-[var(--text-muted)]">–</span>;
                                  return (
                                    <span key={dayIdx} className={`text-[11px] text-right font-medium ${valColor(pred.value)} ${pred.outOfNorm ? '' : 'text-[var(--text-primary)]'}`}>
                                      {pred.value}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>

                        <p className="text-[9px] text-[var(--text-muted)] italic">
                          * Моделот е во рана фаза — точноста се подобрува со повеќе податоци.
                          {' · '}{waterForecast.summary?.availableModels}/{waterForecast.summary?.totalParameters} модели · Просечен R² = {waterForecast.summary?.avgR2}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Not enough data for ML */}
              {waterForecast && !waterForecast.available && (
                <div className="card !p-3 flex items-center gap-2.5 opacity-60">
                  <Cpu size={14} className="text-[var(--text-muted)]" />
                  <div>
                    <p className="text-xs font-medium text-[var(--text-secondary)]">ML предикција недостапна</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{waterForecast.reason}</p>
                  </div>
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

      {/* ═══════ GROWTH TAB ═══════ */}
      {tab === 'growth' && (
        <div className="space-y-4 animate-in-delay-1">
          {/* Controls: Pool selector + Measurement date filter */}
          <div className="card !p-4">
            <div className="flex gap-3">
              {/* Pool selector */}
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block" style={{ fontFamily: 'Sora, sans-serif' }}>Базен</label>
                <select
                  value={growthPool}
                  onChange={e => { setGrowthPool(parseInt(e.target.value)); setGrowthFrom(''); }}
                  className="input-base"
                >
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <option key={n} value={n}>Базен {n}</option>
                  ))}
                </select>
              </div>

              {/* Measurement date filter */}
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block" style={{ fontFamily: 'Sora, sans-serif' }}>Од мерење</label>
                <select
                  value={growthFrom}
                  onChange={e => setGrowthFrom(e.target.value)}
                  className="input-base"
                >
                  <option value="">Сите мерења</option>
                  {(growthData?.measurementDates || []).map(md => (
                    <option key={md.date} value={md.date}>
                      {new Date(md.date).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' })} · {md.weight}g
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Loading */}
          {growthLoading && (
            <div className="card !p-5 text-center">
              <div className="wave-loader mx-auto mb-2"><span /><span /><span /><span /></div>
              <p className="text-xs text-[var(--text-muted)]">Вчитувам податоци за раст...</p>
            </div>
          )}

          {/* No data */}
          {!growthLoading && growthData && !growthData.hasData && (
            <div className="card !p-5 text-center">
              <Sprout size={32} className="mx-auto text-[var(--text-muted)] mb-2" />
              <p className="text-sm text-[var(--text-muted)]">{growthData.message || 'Нема мерења за овој базен'}</p>
            </div>
          )}

          {/* Sorting info banner */}
          {!growthLoading && growthData?.sortingInfo?.filtered && (
            <div className="card !p-3 flex items-center gap-2.5"
              style={{ borderLeft: '3px solid #f59e0b', background: 'rgba(245,158,11,0.05)' }}>
              <Info size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-[11px] text-[var(--text-secondary)]">
                Прикажан раст после последното сортирање
                <span className="font-semibold text-[var(--text-primary)] ml-1">
                  ({new Date(growthData.sortingInfo.lastSortingDate).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' })})
                </span>
              </p>
            </div>
          )}

          {/* Chart + Stats */}
          {!growthLoading && growthData?.hasData && (
            <>
              {/* Stats row */}
              <div className="card !p-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Моментална</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {growthData.stats.currentWeight}<span className="text-[9px] font-normal text-[var(--text-muted)]">g</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Coppens</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {growthData.stats.coppensExpected}<span className="text-[9px] font-normal text-[var(--text-muted)]">g</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Отстапува</p>
                    <p className={`text-sm font-bold ${growthData.stats.deviationPercent >= 0 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`} style={{ fontFamily: 'Sora, sans-serif' }}>
                      {growthData.stats.deviationPercent > 0 ? '+' : ''}{growthData.stats.deviationPercent}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">SGR</p>
                    <p className="text-sm font-bold text-purple-600 dark:text-purple-400" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {growthData.stats.avgSGR}<span className="text-[9px] font-normal text-[var(--text-muted)]">%/д</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="card !p-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Крива на раст — Базен {growthPool}
                  <span className="normal-case tracking-normal font-normal ml-1.5">
                    ({growthData.stats.daysTracked} дена · {growthData.stats.measurementCount} мерења)
                  </span>
                </p>

                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                      tickFormatter={d => {
                        const dt = new Date(d);
                        return `${dt.getDate()}/${dt.getMonth() + 1}`;
                      }}
                      interval="preserveStartEnd"
                      minTickGap={30}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                      tickFormatter={v => `${v}g`}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 11,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      labelFormatter={d => {
                        const dt = new Date(d);
                        return dt.toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' });
                      }}
                      formatter={(val, name) => {
                        const labels = { actual: 'Измерена', sgr: 'SGR проекција', coppens: 'Coppens идеална' };
                        return [`${val}g`, labels[name] || name];
                      }}
                    />

                    {/* Coppens ideal — dashed orange */}
                    <Line
                      type="monotone"
                      dataKey="coppens"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      dot={false}
                      name="coppens"
                      connectNulls
                    />

                    {/* SGR projection — blue */}
                    <Line
                      type="monotone"
                      dataKey="sgr"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      dot={false}
                      name="sgr"
                      connectNulls
                    />

                    {/* Actual measurements — green with dots */}
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="#22c55e"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
                      name="actual"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 rounded-full bg-[#22c55e] inline-block" style={{ height: 3 }} />
                    <span className="text-[var(--text-secondary)]">Измерена тежина</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 rounded-full bg-[#3b82f6] inline-block" style={{ height: 2 }} />
                    <span className="text-[var(--text-secondary)]">SGR проекција</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 inline-block border-t-2 border-dashed border-[#f59e0b]" />
                    <span className="text-[var(--text-secondary)]">Coppens идеална</span>
                  </span>
                </div>
              </div>

              {/* Info note */}
              <div className="text-[9px] text-[var(--text-muted)] italic px-1">
                SGR = Specific Growth Rate — дневна стапка на раст пресметана од мерењата и внесената храна.
                Coppens кривата е оптималниот раст при 26-28°C (Alltech 2025-2026).
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="text-center py-4">
        <p className="text-[10px] text-[var(--text-muted)]">
          * Храна: Coppens 2025-2026. Вода: Линеарна регресија (примарна) + Random Forest (алтернативна).
        </p>
      </div>
    </div>
  );
}
