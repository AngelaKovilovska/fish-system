/**
 * ═══════════════════════════════════════════════════════════════
 * CLARIO — Water Parameter Prediction & Anomaly Detection
 * Фаза 1: Rule-Based (Z-Score + Trend + Causal Chains + NH₃ Calc)
 * ═══════════════════════════════════════════════════════════════
 *
 * 5 компоненти:
 *   1. NH₃ Toxicity Calculator (Emerson et al., 1975)
 *   2. Z-Score Spike Detection
 *   3. Trend Predictor (линеарна регресија + денови до аларм)
 *   4. Causal Chain Engine (6 каузални ланци)
 *   5. Recommendation Engine (научно верифицирани препораки)
 *
 * Извори:
 *   - Emerson et al. (1975). J. Fish. Res. Board Can., 32(12), 2379-2383. DOI:10.1139/f75-274
 *   - Hagopian & Riley (1998). Aquacultural Engineering, 18(4), 223-244
 *   - Schram, Roques et al. (2010). Aquaculture, 306(1-4), 108-115
 *   - Schram, Roques et al. (2014). Aquaculture Research, 45(9), 1499-1511
 *   - Prokešová et al. (2015). J. Applied Ichthyology, 31, 18-29
 *   - Britz & Hecht (1987). Aquaculture, 63, 205-214
 *   - Durborow, Crosby & Brunson (1997). SRAC Publication No. 462
 *   - Loyless & Malone (1997). Progressive Fish-Culturist, 59(3), 198-205
 *   - Timmons & Ebeling (2013). Recirculating Aquaculture, 3rd Ed.
 *   - Ott et al. (2025). Journal of Fish Biology. DOI:10.1111/jfb.70065
 */

const PARAMETERS = [
  'temperature', 'ph', 'total_alkalinity', 'hardness',
  'nitrates', 'nitrites', 'total_chlorine', 'ammonium',
];

const PARAM_META = {
  temperature:      { label: 'Температура',           unit: '°C' },
  ph:               { label: 'pH',                    unit: '' },
  total_alkalinity: { label: 'Вкупна алкалност',      unit: 'mg/L' },
  hardness:         { label: 'Тврдост',               unit: 'mg/L' },
  nitrates:         { label: 'Нитрати (NO₃⁻)',        unit: 'mg/L' },
  nitrites:         { label: 'Нитрити (NO₂⁻)',        unit: 'mg/L' },
  total_chlorine:   { label: 'Вкупен хлор',           unit: 'mg/L' },
  ammonium:         { label: 'Амониум (NH₄⁺/NH₃)',    unit: 'mg/L' },
};

// ═══════════════════════════════════════════════════
// КОМПОНЕНТА 1: NH₃ Toxicity Calculator
// Emerson et al. (1975), DOI: 10.1139/f75-274
// ═══════════════════════════════════════════════════

/**
 * Пресметува концентрација на токсичен слободен амонијак (NH₃)
 * @param {number} tan - Total Ammonia Nitrogen (измерен амониум) mg/L
 * @param {number} ph - pH вредност
 * @param {number} tempC - температура во °C
 * @returns {{ nh3: number, fraction: number, pKa: number }}
 */
function calculateNH3(tan, ph, tempC) {
  if (!tan || !ph || !tempC || tan <= 0) return { nh3: 0, fraction: 0, pKa: 0 };
  const pKa = 0.09018 + (2729.92 / (tempC + 273.15));
  const fraction = 1 / (Math.pow(10, pKa - ph) + 1);
  const nh3 = tan * fraction;
  return {
    nh3: Math.round(nh3 * 10000) / 10000,
    fraction: Math.round(fraction * 10000) / 10000,
    pKa: Math.round(pKa * 1000) / 1000,
  };
}

// Безбедни граници за африкански сом:
// Schram et al. (2010): EC10 за апетит = 1.24 mg NH₃-N/L, безбеден = 0.34 mg NH₃-N/L
// Општо: 0.02-0.05 mg/L NH₃ (EPA, 2013)
const NH3_SAFE_LIMIT = 0.05;     // mg/L — конзервативен праг за управување
const NH3_WARNING_LIMIT = 0.02;  // mg/L — рано предупредување

// ═══════════════════════════════════════════════════
// КОМПОНЕНТА 2: Z-Score Spike Detection
// Hagopian & Riley (1998), DOI: 10.1016/S0144-8609(98)00032-6
// ═══════════════════════════════════════════════════

const Z_WARNING = 2.0;   // 95% доверба
const Z_CRITICAL = 3.0;  // 99.7% доверба
const MIN_READINGS_ZSCORE = 7;

function calcStats(values) {
  if (!values || values.length === 0) return { mean: 0, stdDev: 0, median: 0 };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return {
    mean: Math.round(mean * 1000) / 1000,
    stdDev: Math.round(Math.sqrt(variance) * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
  };
}

function detectSpike(currentValue, historicalValues) {
  if (historicalValues.length < MIN_READINGS_ZSCORE) return null;
  const { mean, stdDev } = calcStats(historicalValues);
  if (stdDev === 0) return null;
  const z = (currentValue - mean) / stdDev;
  const absZ = Math.abs(z);
  if (absZ < Z_WARNING) return null;
  return {
    zScore: Math.round(z * 100) / 100,
    severity: absZ >= Z_CRITICAL ? 'critical' : 'warning',
    direction: z > 0 ? 'high' : 'low',
    mean,
    stdDev,
  };
}

// ═══════════════════════════════════════════════════
// КОМПОНЕНТА 3: Trend Predictor
// Линеарна регресија на последните N денови
// ═══════════════════════════════════════════════════

const MIN_READINGS_TREND = 5;

/**
 * Линеарна регресија: y = slope * x + intercept
 * @param {number[]} values - вредности (хронолошки)
 * @returns {{ slope: number, intercept: number, r2: number }}
 */
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: values[0], r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  // R²
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssTot += Math.pow(values[i] - meanY, 2);
    ssRes += Math.pow(values[i] - predicted, 2);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return {
    slope: Math.round(slope * 10000) / 10000,
    intercept: Math.round(intercept * 1000) / 1000,
    r2: Math.round(Math.max(0, r2) * 100) / 100,
  };
}

/**
 * Предвиди за колку дена ќе ја пречекори нормата
 * @returns {{ daysUntil: number|null, direction: 'high'|'low'|null, boundaryValue: number|null }}
 */
function predictThresholdCrossing(currentValue, slope, norm) {
  if (!norm || slope === 0) return { daysUntil: null, direction: null, boundaryValue: null };
  let daysUntil = null;
  let direction = null;
  let boundaryValue = null;

  // Веќе надвор од нормата?
  const alreadyHigh = norm.max !== null && currentValue > norm.max;
  const alreadyLow = norm.min !== null && currentValue < norm.min;
  if (alreadyHigh || alreadyLow) {
    return {
      daysUntil: 0,
      direction: alreadyHigh ? 'high' : 'low',
      boundaryValue: alreadyHigh ? norm.max : norm.min,
      alreadyExceeded: true,
    };
  }

  // Растечки тренд → проверка на макс
  if (slope > 0 && norm.max !== null) {
    const days = (norm.max - currentValue) / slope;
    if (days > 0 && days <= 30) {
      daysUntil = Math.ceil(days);
      direction = 'high';
      boundaryValue = norm.max;
    }
  }
  // Опаѓачки тренд → проверка на мин
  if (slope < 0 && norm.min !== null) {
    const days = (norm.min - currentValue) / slope;
    if (days > 0 && days <= 30) {
      if (daysUntil === null || Math.ceil(days) < daysUntil) {
        daysUntil = Math.ceil(days);
        direction = 'low';
        boundaryValue = norm.min;
      }
    }
  }
  return { daysUntil, direction, boundaryValue, alreadyExceeded: false };
}

// ═══════════════════════════════════════════════════
// КОМПОНЕНТА 4: Causal Chain Engine
// Извори: Timmons & Ebeling (2013), Hagopian & Riley (1998),
//         Schram et al. (2010), SRAC 462
// ═══════════════════════════════════════════════════

function evaluateCausalChains(current, trends, nh3Result, feedingData) {
  const chains = [];

  const getSlope = (param) => trends[param]?.slope || 0;
  const getVal = (param) => current[param] != null ? parseFloat(current[param]) : null;

  const ph = getVal('ph');
  const temp = getVal('temperature');
  const alk = getVal('total_alkalinity');
  const nh4 = getVal('ammonium');
  const no2 = getVal('nitrites');
  const no3 = getVal('nitrates');
  const phSlope = getSlope('ph');
  const tempSlope = getSlope('temperature');
  const nh4Slope = getSlope('ammonium');
  const no2Slope = getSlope('nitrites');
  const no3Slope = getSlope('nitrates');

  // Ланец 1: pH паѓа → нитрити растат (2-3 дена lag)
  // Hagopian & Riley (1998): нитрификација забавува под pH 6.5
  if (phSlope < -0.03 && ph !== null && ph < 7.0) {
    chains.push({
      id: 'ph_drop_nitrite_rise',
      severity: ph < 6.5 ? 'critical' : 'warning',
      title: 'pH паѓа → ризик од пораст на нитрити',
      message: `pH паѓа со ${Math.abs(phSlope).toFixed(3)}/ден (моментално ${ph}). Под pH 6.5 биофилтерот забавува и нитритите може да пораснат за 2-3 дена.`,
      timeframe: '2-3 дена',
      source: 'Hagopian & Riley (1998)',
    });
  }

  // Ланец 2: Температура + pH растат → NH₃ токсичност
  // Emerson et al. (1975): NH₃ фракција расте експоненцијално со pH и температура
  if (nh3Result && nh3Result.nh3 > NH3_WARNING_LIMIT) {
    const severityNH3 = nh3Result.nh3 > NH3_SAFE_LIMIT ? 'critical' : 'warning';
    chains.push({
      id: 'nh3_toxicity',
      severity: severityNH3,
      title: 'Токсичен амонијак (NH₃) е зголемен',
      message: `При pH ${ph} и ${temp}°C, слободниот NH₃ = ${nh3Result.nh3} mg/L (${(nh3Result.fraction * 100).toFixed(2)}% од вкупниот). ${severityNH3 === 'critical' ? 'Над безбедната граница (0.05 mg/L)!' : 'Приближување кон безбедната граница.'}`,
      timeframe: 'моментално',
      source: 'Emerson et al. (1975), Schram et al. (2010)',
    });
  }

  // Предикција: ако и pH и температура растат → NH₃ ќе расте
  if (tempSlope > 0.1 && phSlope > 0.02 && nh4 !== null && nh4 > 0) {
    // Предвиди NH₃ за 3 дена
    const futureTemp = temp + tempSlope * 3;
    const futurePh = ph + phSlope * 3;
    const futureNH3 = calculateNH3(nh4, futurePh, futureTemp);
    if (futureNH3.nh3 > NH3_WARNING_LIMIT && (!nh3Result || futureNH3.nh3 > nh3Result.nh3 * 1.3)) {
      chains.push({
        id: 'nh3_rising_prediction',
        severity: futureNH3.nh3 > NH3_SAFE_LIMIT ? 'critical' : 'warning',
        title: 'NH₃ ќе расте — температура и pH растат',
        message: `Ако трендот продолжи (pH ${futurePh.toFixed(1)}, темп ${futureTemp.toFixed(1)}°C за 3 дена), NH₃ ќе достигне ${futureNH3.nh3} mg/L.`,
        timeframe: '3 дена',
        source: 'Emerson et al. (1975)',
      });
    }
  }

  // Ланец 3: Преголемо хранење → каскада (NH₄ → NO₂ → pH)
  // Ott et al. (2025): NH₄ пик на ~6ч, Timmons & Ebeling (2013): каскада
  if (feedingData && feedingData.feedVsRecommended > 1.2) {
    const overPct = Math.round((feedingData.feedVsRecommended - 1) * 100);
    chains.push({
      id: 'overfeeding_cascade',
      severity: feedingData.feedVsRecommended > 1.5 ? 'critical' : 'warning',
      title: `Хранење ${overPct}% над препорачано → каскаден ефект`,
      message: `Очекуван NH₄ пик за 4-6 часа, можен NO₂ пораст за 3-7 дена, pH пад за 2-5 дена.`,
      timeframe: '4ч - 7 дена',
      source: 'Ott et al. (2025), Timmons & Ebeling (2013)',
    });
  }

  // Ланец 4: Температура паѓа → раст забавува
  // Britz & Hecht (1987): оптимум 28-30°C, Q10 ефект
  if (temp !== null && temp < 24) {
    chains.push({
      id: 'temp_drop_growth',
      severity: temp < 18 ? 'critical' : 'warning',
      title: 'Ниска температура — раст забавен',
      message: `Температурата (${temp}°C) е под оптимумот (26-28°C). Рибите јадат помалку и растот забавува. Проверете ја термо пумпата.`,
      timeframe: 'моментално',
      source: 'Britz & Hecht (1987), Prokešová et al. (2015)',
    });
  }
  if (tempSlope < -0.3 && temp !== null && temp < 27) {
    chains.push({
      id: 'temp_dropping_trend',
      severity: 'warning',
      title: 'Температурата паѓа континуирано',
      message: `Температурата паѓа со ${Math.abs(tempSlope).toFixed(2)}°C/ден (моментално ${temp}°C). Намалете го хранењето пропорционално.`,
      timeframe: 'следни денови',
      source: 'Britz & Hecht (1987)',
    });
  }

  // Температура над 32°C = стрес
  // Prokešová et al. (2015): стрес зона 30.2-33.2°C
  if (temp !== null && temp > 32) {
    chains.push({
      id: 'temp_too_high',
      severity: temp > 33 ? 'critical' : 'warning',
      title: 'Висока температура — термален стрес',
      message: `Температурата (${temp}°C) е во стрес зоната (>32°C). Зголемете аерација, потопла вода држи помалку кислород.`,
      timeframe: 'моментално',
      source: 'Prokešová et al. (2015)',
    });
  }

  // Ланец 5: Нитрати растат → потребна замена на вода
  // Schram et al. (2014): раст намален на 140 mg/L NO₃-N
  if (no3 !== null && no3 > 100 && no3Slope > 0) {
    chains.push({
      id: 'nitrate_accumulation',
      severity: no3 > 150 ? 'critical' : 'warning',
      title: 'Нитрати се акумулираат',
      message: `Нитратите (${no3} mg/L) растат со ${no3Slope.toFixed(2)} mg/L/ден. Потребна е парцијална замена на вода.`,
      timeframe: 'следни денови',
      source: 'Schram et al. (2014)',
    });
  }

  // Ланец 6: pH паѓа + алкалитет низок → биофилтер проблем
  // Loyless & Malone (1997): алкалитет е клучен за pH стабилност
  if (alk !== null && alk < 80 && phSlope < 0) {
    chains.push({
      id: 'low_alkalinity_ph_drop',
      severity: alk < 50 ? 'critical' : 'warning',
      title: 'Низок алкалитет + pH паѓа',
      message: `Алкалитетот (${alk} mg/L) е под препорачаното (100-200 mg/L). pH паѓа бидејќи нема пуферски капацитет. Додајте натриум бикарбонат.`,
      timeframe: 'моментално',
      source: 'Loyless & Malone (1997), Timmons & Ebeling (2013)',
    });
  }

  return chains;
}

// ═══════════════════════════════════════════════════
// КОМПОНЕНТА 5: Recommendation Engine
// Научно верифицирани препораки базирани на литература
// за Clarias gariepinus во RAS системи
// ═══════════════════════════════════════════════════

function generateRecommendations(current, trends, nh3Result, spikes, thresholdCrossings, chains, norms, feedingData) {
  const recommendations = [];
  const getVal = (p) => current[p] != null ? parseFloat(current[p]) : null;

  const ph = getVal('ph');
  const temp = getVal('temperature');
  const alk = getVal('total_alkalinity');
  const nh4 = getVal('ammonium');
  const no2 = getVal('nitrites');
  const no3 = getVal('nitrates');
  const hardness = getVal('hardness');

  // ── 1. pH падна под 6.5 — ИТНО ──
  // Под pH 6.0 нитрификацијата практично запира (Hagopian & Riley, 1998).
  // Секој 1g NH₄-N оксидиран троши 7.14g алкалитет — затоа pH паѓа во RAS.
  if (ph !== null && ph < 6.5) {
    const alkInfo = alk !== null ? ` Моментален алкалитет: ${alk} mg/L.` : '';
    recommendations.push({
      urgency: 'critical',
      title: 'pH е критично низок — биофилтерот е загрозен',
      steps: [
        'Растворете сода бикарбона (NaHCO₃) во кофа системска вода — за секои 1000 литри ставете 17g за да го подигнете алкалитетот за 10 mg/L.',
        'Додавајте го растворот полека низ системот во тек на 30-60 минути. Не подигајте повеќе од 20-30 mg/L алкалитет дневно за да избегнете pH шок.',
        'Намалете го хранењето на половина додека pH не се стабилизира над 7.0.',
        'Проверете го биофилтерот — проток, зачепување, и мирис. Под pH 6.0 бактериите за нитрификација престануваат да работат.',
      ],
      source: 'Loyless & Malone (1997); Timmons & Ebeling (2010); Hagopian & Riley (1998)',
      note: alkInfo,
    });
  }

  // ── 2. pH паѓа — тренд ──
  // Во RAS, pH природно паѓа поради нитрификацијата. Раното дејствување спречува криза.
  if (trends.ph && trends.ph.slope < -0.05 && ph !== null && ph < 7.2 && ph >= 6.5) {
    recommendations.push({
      urgency: 'medium',
      title: 'pH полека паѓа — потребно е баферирање',
      steps: [
        'Измерете го алкалитетот. Ако е под 100 mg/L, тоа е причината за паѓањето на pH — нитрификацијата го троши алкалитетот.',
        'Додавајте сода бикарбона (NaHCO₃): околу 150g на секој килограм храна дневно е потребно за да се надомести она што го троши биофилтерот.',
        'Целен алкалитет: 100-200 mg/L. Мерете pH и алкалитет секој ден во исто време за да го следите трендот.',
      ],
      source: 'Loyless & Malone (1997); Summerfelt et al. (2015)',
    });
  }

  // ── 3. Амонијак висок — ИТНО (>2.0 mg/L) ──
  // За C. gariepinus, EC10 за внес на храна е 1.25 mg/L NH₃-N (Schram et al., Wageningen).
  // Африканскиот сом има поголема толеранција на амонијак од повеќето видови
  // бидејќи го детоксифицира до глутамин во мозокот, но над 2.0 е опасно.
  if (nh4 !== null && nh4 > 2.0) {
    recommendations.push({
      urgency: 'critical',
      title: 'Амонијак е многу висок — итен протокол',
      steps: [
        'Стопирајте го хранењето веднаш. Не продолжувајте додека амонијакот не падне под 1.0 mg/L (вообичаено потребни 48+ часа без храна).',
        'Заменете 20-30% од водата постепено во тек на 4-6 часа. Не менувајте одеднаш — нагла промена на температура или pH е уште поопасна.',
        'Вклучете ги сите достапни аератори на максимум. Кислородот е прва линија на одбрана — им помага на рибите да го толерираат амонијакот.',
        'Проверете го алкалитетот — ако е под 100 mg/L, биофилтерот работи со намален капацитет.',
        'Мерете амонијак на секои 3-4 часа додека не падне под 1.0 mg/L.',
      ],
      source: 'Schram et al. (Wageningen University); SRAC Publication 463; Timmons & Ebeling (2010)',
    });
  } else if (nh4 !== null && nh4 > 1.0) {
    recommendations.push({
      urgency: 'high',
      title: 'Амонијак е зголемен — превентивно дејствување',
      steps: [
        'Намалете го хранењето на половина веднаш.',
        'Засилете ја аерацијата — бактериите за нитрификација трошат 4.57g кислород за секој 1g амонијак што го преработуваат.',
        'Проверете го биофилтерот: проток на вода, зачепување, алкалитет над 100 mg/L.',
        'Направете замена на 10-20% од водата со деклорирана вода на слична температура.',
        'Измерете повторно за 4 часа. Ако расте, преминете на итен протокол (стоп хранење).',
      ],
      source: 'SRAC Publication 463; Timmons & Ebeling (2010)',
    });
  }

  // ── 4. NH₃ токсичност ──
  // Токсичната форма (NH₃) зависи од pH и температура.
  // При pH 7.0 и 25°C, само 0.57% од амонијакот е токсичен.
  // При pH 8.0 и 25°C — 5%, т.е. 10x поголема токсичност (Emerson et al., 1975).
  if (nh3Result && nh3Result.nh3 > NH3_SAFE_LIMIT && ph !== null) {
    recommendations.push({
      urgency: 'critical',
      title: 'Токсичен амонијак (NH₃) — директна опасност',
      steps: [
        'Стопирајте го хранењето веднаш.',
        'Додајте свежа вода за разредување — ова е најбрзиот начин да се намали концентрацијата.',
        `Не обидувајте се хемиски да го менувате pH! При сегашен pH од ${ph}, ${(nh3Result.nh3 * 100 / (nh4 || 1)).toFixed(1)}% од амонијакот е во токсична форма. Наглата промена на pH е поопасна од самиот амонијак.`,
        'Засилете ја аерацијата на максимум.',
      ],
      source: 'Emerson et al. (1975); Schram et al. (Wageningen University)',
    });
  }

  // ── 5. Нитрити високи ──
  // Нитритите се апсорбираат преку хлоридните клетки на школките.
  // Хлоридните јони (Cl⁻) компетитивно го блокираат преземањето на нитрити.
  // За C. gariepinus: EC10 за раст = 0.60 mg/L NO₂-N (Schram et al.)
  if (no2 !== null && no2 > 0.5) {
    // Boyd-ова формула за пресметка на потребна сол
    const targetCl = no2 * 6; // Cl⁻:NO₂⁻ = 6:1
    const saltPerLiter = (targetCl / 0.6 / 1000).toFixed(1); // NaCl е 60% хлорид
    recommendations.push({
      urgency: no2 > 1.0 ? 'critical' : 'high',
      title: `Нитрити се високи (${no2} mg/L) — заштитете ги рибите со сол`,
      steps: [
        `Пресметка: за нитрити од ${no2} mg/L, потребен хлорид е ${targetCl.toFixed(1)} mg/L (сооднос Cl⁻:NO₂⁻ = 6:1).`,
        `Растворете ${saltPerLiter}g нејодирана сол (NaCl) на секој литар вода од системот во кофа, па додајте го растворот полека низ системот во тек на 30-60 минути.`,
        'Солта НЕ ги отстранува нитритите — само го блокира нивното навлегување преку школките. Мора да се реши и основната причина.',
        'Проверете го биофилтерот — нитритите растат кога втората фаза на нитрификација (Nitrobacter/Nitrospira) заостанува зад првата (Nitrosomonas).',
        'Не зголемувајте го хранењето. Мерете нитрити и хлорид на секои 12 часа и додавајте сол повторно ако нитритите растат.',
      ],
      source: 'Boyd (1998); SRAC Publication 462; Schram et al. (Wageningen University)',
    });
  }

  // ── 6. Нитрати високи ──
  // Schram et al. (2014): внесот на храна и растот се намалуваат при 379 mg/L NO₃-N.
  // Безбеден лимит: под 140 mg/L NO₃-N (≈620 mg/L NO₃⁻).
  if (no3 !== null && no3 > 150) {
    const urgency = no3 > 400 ? 'high' : 'medium';
    recommendations.push({
      urgency,
      title: `Нитрати се натрупуваат (${no3} mg/L)`,
      steps: [
        'Зголемете ја дневната замена на вода на 15-20% додека нитратите не паднат под 100 mg/L.',
        'Привремено намалете го хранењето за 20-30% — помалку храна = помалку нитрати.',
        'Проверете дали изворната вода (чешма) самата содржи нитрати — ако да, замената нема да помогне доволно.',
        no3 > 300 ? 'При вака високи нивоа, рибите ќе јадат помалку и ќе растат побавно. Потребна е посериозна замена на вода (30-40%) во наредните 2-3 дена, постепено.' : 'Рутинска замена на 5-10% дневно спречува натрупување на нитрати долгорочно.',
      ],
      source: 'Schram et al. (2014), Aquaculture Research; Timmons & Ebeling (2010)',
    });
  }

  // ── 7. Температура ниска ──
  // Britz & Hecht (1987): оптимум за раст 28-30°C.
  // Под 18°C хранењето практично запира, имунитетот слабее.
  if (temp !== null && temp < 24) {
    let feedAdvice, details;
    if (temp < 18) {
      feedAdvice = 'Стопирајте го хранењето целосно — под 18°C рибите се практично неактивни и не јадат.';
      details = 'Под 12°C постои ризик од угинување. Итно проверете ја термо пумпата.';
    } else if (temp < 22) {
      feedAdvice = 'Намалете го хранењето на 0.5-1.0% од телесната тежина дневно (наместо вообичаените 3-5%).';
      details = 'Конверзијата на храна (FCR) е лоша на оваа температура — повеќе храна само ќе ја загади водата.';
    } else {
      feedAdvice = 'Намалете го хранењето на 1.5-2.5% од телесната тежина дневно.';
      details = 'Растот е под-оптимален но прифатлив. Оптимум е 28-30°C.';
    }
    recommendations.push({
      urgency: temp < 18 ? 'critical' : 'medium',
      title: `Водата е ладна (${temp}°C)`,
      steps: [
        'Проверете ја термо пумпата — дали работи, дали е на правилна температура (целна: 28-30°C).',
        feedAdvice,
        details,
      ],
      source: 'Britz & Hecht (1987), Aquaculture; Prokešová et al. (2015)',
    });
  }

  // ── 8. Температура висока ──
  // Над 33°C: топлотен стрес, намален кислород во водата, зголемена токсичност на амонијак.
  if (temp !== null && temp > 32) {
    recommendations.push({
      urgency: temp > 33 ? 'critical' : 'high',
      title: `Водата е претопла (${temp}°C)`,
      steps: [
        'Засилете ја аерацијата на максимум — топлата вода содржи значително помалку растворен кислород.',
        'Намалете го хранењето на 1-2% од телесната тежина. При топлотен стрес, повеќе храна = повеќе проблеми.',
        'Проверете ја термо пумпата — оптималната температура за африкански сом е 28-30°C.',
        temp > 33 ? 'Внимавајте на амонијакот — при висока температура и висок pH, поголем процент од амонијакот е во токсична форма (NH₃).' : '',
      ].filter(Boolean),
      source: 'Prokešová et al. (2015); Britz & Hecht (1987); Molnár et al. (2021)',
    });
  }

  // ── 9. Преголемо хранење ──
  // Рибите излачуваат ~25-35g амонијак на kg храна. 75% од азотот завршува како отпад.
  // Хронологија: 12-24ч амонијак, 24-72ч нитрити почнуваат, 3-7 дена нитритен пик.
  if (feedingData && feedingData.feedVsRecommended > 1.2) {
    const overPct = Math.round((feedingData.feedVsRecommended - 1) * 100);
    recommendations.push({
      urgency: feedingData.feedVsRecommended > 1.5 ? 'high' : 'medium',
      title: `Хранење ${overPct}% повеќе од препорачаното`,
      steps: [
        'Веднаш вратете го хранењето на препорачана количина. Давајте храна само онолку колку рибите ќе изедат за 2 часа.',
        'Отстранете видлива неизедена храна (со сифон или зголемена механичка филтрација).',
        'Внимавајте на следната хронологија: за 12-24 часа може да порасне амонијак, за 3-7 дена може да порастат нитритите.',
        'Ако хранењето било значително повеќе од нормала, мерете амонијак и нитрити наредните 5 дена.',
      ],
      source: 'Timmons & Ebeling (2010); Global Seafood Alliance',
    });
  }

  // ── 10. Алкалитет низок ──
  // За секој 1g NH₄-N оксидиран, се трошат 7.14g алкалитет (CaCO₃).
  // Под 50 mg/L нитрификацијата значително се забавува.
  if (alk !== null && alk < 80 && !recommendations.some(r => r.steps?.some(s => s.includes('бикарбона')))) {
    const dose1000L = Math.round((100 - alk) * 1.68); // g NaHCO₃ за 1000L до 100 mg/L
    recommendations.push({
      urgency: alk < 50 ? 'high' : 'medium',
      title: `Низок алкалитет (${alk} mg/L) — биофилтерот е загрозен`,
      steps: [
        `Алкалитетот е под минимумот за стабилна нитрификација (100 mg/L). Биофилтерот не може ефикасно да го преработува амонијакот.`,
        `Растворете ${dose1000L}g сода бикарбона (NaHCO₃) на секои 1000 литри вода за да го подигнете алкалитетот до 100 mg/L.`,
        'Додавајте го растворот полека, рамномерно низ системот. Не подигајте повеќе од 20-30 mg/L дневно за да избегнете нагол скок на pH.',
        'Целна вредност: 100-200 mg/L. Мерете алкалитет минимум 3 пати неделно (секој ден ако базените се полни).',
        'Долгорочно: потребни се околу 150g NaHCO₃ на секој kg храна дневно за да се надомести она што биофилтерот го троши.',
      ],
      source: 'Loyless & Malone (1997); Timmons & Ebeling (2010); Summerfelt et al. (2015)',
    });
  }

  // ── 11. Тврдост висока ──
  // Над 300 mg/L може да предизвика проблеми. Висок калциум поттикнува Columnaris болест.
  // Оптимално за слатководни риби: 75-150 mg/L.
  if (hardness !== null && hardness > 300) {
    recommendations.push({
      urgency: hardness > 450 ? 'high' : 'medium',
      title: `Тврдост на водата е превисока (${hardness} mg/L)`,
      steps: [
        'Оптималниот опсег за тврдост е 75-150 mg/L. Над 300 mg/L може да предизвика здравствени проблеми кај рибите и поттикнува Columnaris болест.',
        'Зголемете ја замената на вода со помека вода (15-20% дневно). Ако водата од чешма е тврда, потребен е друг извор (дождовница, RO вода).',
        'Ако користите калциум карбонат (CaCO₃) или калциум хидроксид за баферирање на pH, преминете на сода бикарбона (NaHCO₃) — таа дава алкалитет без да ја зголемува тврдоста.',
        'Не правете нагла замена на повеќе од 20% одеднаш — постепено, по 10-15% дневно.',
      ],
      source: 'Boyd, C.E. (Global Seafood Alliance); USDA ARS',
    });
  }

  // Сортирај по итност
  const urgencyOrder = { critical: 0, high: 1, medium: 2, info: 3 };
  recommendations.sort((a, b) => (urgencyOrder[a.urgency] || 9) - (urgencyOrder[b.urgency] || 9));

  return recommendations;
}


// ═══════════════════════════════════════════════════
// ГЛАВНА ФУНКЦИЈА
// ═══════════════════════════════════════════════════

async function analyzeWaterPrediction(dbPool) {
  // 1. Земи историски податоци (последни 30 дена)
  const historyResult = await dbPool.query(`
    SELECT dr.date,
      wc.temperature, wc.ph, wc.total_alkalinity, wc.hardness,
      wc.nitrates, wc.nitrites, wc.total_chlorine, wc.ammonium
    FROM water_control wc
    JOIN daily_records dr ON wc.daily_record_id = dr.id
    ORDER BY dr.date DESC
    LIMIT 30
  `);

  if (historyResult.rows.length === 0) {
    return { hasData: false, message: 'Нема внесени чеклисти' };
  }

  // Хронолошки ред (најстар прв)
  const history = historyResult.rows.reverse();
  const latest = history[history.length - 1];
  const latestDate = latest.date;

  // 2. Земи норми
  const normsResult = await dbPool.query('SELECT * FROM parameter_norms');
  const norms = {};
  for (const row of normsResult.rows) {
    norms[row.parameter_name] = {
      min: row.min_value !== null ? parseFloat(row.min_value) : null,
      max: row.max_value !== null ? parseFloat(row.max_value) : null,
    };
  }

  // 3. Земи податоци за хранење (денешниот ден) за каузални ланци
  let feedingData = null;
  try {
    const dateStr = typeof latestDate === 'string' ? latestDate.split('T')[0] : new Date(latestDate).toISOString().split('T')[0];
    const feedResult = await dbPool.query(
      `SELECT SUM(food_quantity_gr) as total_gr FROM pool_meals WHERE date = $1 AND food_quantity_gr > 0`,
      [dateStr]
    );
    const totalFedGr = parseFloat(feedResult.rows[0]?.total_gr) || 0;

    // Земи AI препорака за споредба
    const recResult = await dbPool.query(`
      SELECT SUM(pfi.current_count) as total_fish
      FROM pool_fish_inventory pfi
      WHERE pfi.current_count > 0
    `);
    const totalFish = parseInt(recResult.rows[0]?.total_fish) || 0;
    // Груба проценка: 2-4% BW/ден, просечно 3%
    // Ова е приближна проценка — точната вредност доаѓа од AI модулот
    if (totalFedGr > 0 && totalFish > 0) {
      feedingData = {
        totalFedKg: Math.round(totalFedGr / 10) / 100,
        feedVsRecommended: null, // Ќе се пополни подоцна ако имаме AI препорака
      };
    }
  } catch (e) {
    // Не е критично — продолжи без податоци за хранење
  }

  // 4. Анализа по параметар
  const parameterAnalysis = {};
  const allSpikes = [];
  const allCrossings = [];
  const trends = {};

  for (const param of PARAMETERS) {
    const currentValue = latest[param] != null ? parseFloat(latest[param]) : null;
    if (currentValue === null || isNaN(currentValue)) {
      parameterAnalysis[param] = { parameter: param, ...PARAM_META[param], noData: true };
      continue;
    }

    // Историски вредности (без последната)
    const historicalValues = history.slice(0, -1)
      .map(h => parseFloat(h[param]))
      .filter(v => !isNaN(v) && v !== null);

    // Z-Score
    const spike = detectSpike(currentValue, historicalValues);
    if (spike) {
      allSpikes.push({ parameter: param, ...PARAM_META[param], ...spike, currentValue });
    }

    // Тренд (последните 7-14 дена)
    const allValues = history.map(h => parseFloat(h[param])).filter(v => !isNaN(v));
    const trendValues = allValues.slice(-Math.min(14, allValues.length));
    let trendResult = null;
    if (trendValues.length >= MIN_READINGS_TREND) {
      const regression = linearRegression(trendValues);
      // Тренд е значаен само ако R² > 0.3
      const isSignificant = regression.r2 > 0.3 && Math.abs(regression.slope) > 0.001;

      // Предикција за пречекорување на нормата
      const norm = norms[param];
      const crossing = norm ? predictThresholdCrossing(currentValue, regression.slope, norm) : null;
      if (crossing && crossing.daysUntil !== null) {
        allCrossings.push({ parameter: param, ...PARAM_META[param], ...crossing, slope: regression.slope, currentValue });
      }

      trendResult = {
        slope: regression.slope,
        r2: regression.r2,
        direction: regression.slope > 0.001 ? 'rising' : regression.slope < -0.001 ? 'falling' : 'stable',
        isSignificant,
        crossing,
        daysAnalyzed: trendValues.length,
      };
      trends[param] = trendResult;
    }

    // Последните 7 вредности за визуализација
    const recent = allValues.slice(-7);

    parameterAnalysis[param] = {
      parameter: param,
      ...PARAM_META[param],
      currentValue,
      norm: norms[param] || null,
      spike,
      trend: trendResult,
      recent,
      stats: historicalValues.length >= MIN_READINGS_ZSCORE ? calcStats(historicalValues) : null,
    };
  }

  // 5. NH₃ Calculator
  const temp = latest.temperature != null ? parseFloat(latest.temperature) : null;
  const ph = latest.ph != null ? parseFloat(latest.ph) : null;
  const nh4 = latest.ammonium != null ? parseFloat(latest.ammonium) : null;
  const nh3Result = (temp && ph && nh4) ? calculateNH3(nh4, ph, temp) : null;

  // 6. Каузални ланци
  const causalChains = evaluateCausalChains(latest, trends, nh3Result, feedingData);

  // 7. Препораки
  const recommendations = generateRecommendations(
    latest, trends, nh3Result, allSpikes, allCrossings, causalChains, norms, feedingData
  );

  // 8. Сортирај предупредувања по итност
  const warnings = [
    ...allCrossings
      .filter(c => c.daysUntil !== null && c.daysUntil <= 7 && !c.alreadyExceeded)
      .map(c => ({
        type: 'trend',
        severity: c.daysUntil <= 2 ? 'critical' : 'warning',
        parameter: c.parameter,
        label: c.label,
        message: `${c.label} ${c.direction === 'high' ? 'ќе ја надмине' : 'ќе падне под'} нормата (${c.boundaryValue}${c.unit}) за ${c.daysUntil} ден${c.daysUntil > 1 ? 'а' : ''}`,
        daysUntil: c.daysUntil,
      })),
    ...allCrossings
      .filter(c => c.alreadyExceeded)
      .map(c => ({
        type: 'exceeded',
        severity: 'critical',
        parameter: c.parameter,
        label: c.label,
        message: `${c.label} е ВЕЌЕ надвор од нормата (${c.currentValue}${c.unit}, норма: ${c.boundaryValue}${c.unit})`,
        daysUntil: 0,
      })),
    ...allSpikes.map(s => ({
      type: 'spike',
      severity: s.severity,
      parameter: s.parameter,
      label: s.label,
      message: `${s.label}: нагла промена (Z-score: ${s.zScore}). ${s.direction === 'high' ? 'Значително над' : 'Значително под'} просекот.`,
      daysUntil: 0,
    })),
  ];
  warnings.sort((a, b) => {
    const sev = { critical: 0, warning: 1 };
    return (sev[a.severity] || 9) - (sev[b.severity] || 9) || a.daysUntil - b.daysUntil;
  });

  // Дали сè е стабилно?
  const isStable = warnings.length === 0 && causalChains.length === 0 && recommendations.length === 0;

  return {
    hasData: true,
    date: latestDate,
    isStable,
    nh3: nh3Result ? {
      ...nh3Result,
      tan: nh4,
      ph,
      temperature: temp,
      isSafe: nh3Result.nh3 <= NH3_SAFE_LIMIT,
      safeLimit: NH3_SAFE_LIMIT,
    } : null,
    warnings,
    causalChains,
    recommendations,
    parameters: parameterAnalysis,
    summary: {
      totalParameters: PARAMETERS.length,
      analyzedParameters: Object.values(parameterAnalysis).filter(p => !p.noData).length,
      spikeCount: allSpikes.length,
      trendWarnings: allCrossings.filter(c => !c.alreadyExceeded && c.daysUntil <= 7).length,
      alreadyExceeded: allCrossings.filter(c => c.alreadyExceeded).length,
      causalChainCount: causalChains.length,
      recommendationCount: recommendations.length,
      daysOfData: history.length,
    },
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = { analyzeWaterPrediction, calculateNH3 };
