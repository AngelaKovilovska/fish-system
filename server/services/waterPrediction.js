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
  if (ph !== null && ph < 6.5) {
    recommendations.push({
      urgency: 'critical',
      title: 'pH е критично низок',
      summary: 'Додајте сода бикарбона и намалете хранење',
      steps: [
        'Растворете сода бикарбона (NaHCO₃) во кофа системска вода — 17g на 1000 литри за подигање на алкалитетот за 10 mg/L.',
        'Додавајте полека низ системот во тек на 30-60 мин. Макс. 20-30 mg/L алкалитет дневно.',
        'Намалете хранење на половина додека pH не се стабилизира над 7.0.',
        'Проверете биофилтер — проток, зачепување. Под pH 6.0 нитрификацијата запира.',
      ],
      source: 'Loyless & Malone (1997); Timmons & Ebeling (2010)',
    });
  }

  // ── 2. pH паѓа — тренд ──
  if (trends.ph && trends.ph.slope < -0.05 && ph !== null && ph < 7.2 && ph >= 6.5) {
    recommendations.push({
      urgency: 'medium',
      title: 'pH полека паѓа',
      summary: 'Измерете алкалитет и додајте бикарбона ако треба',
      steps: [
        'Измерете алкалитет. Ако е под 100 mg/L — тоа е причината.',
        'Додавајте NaHCO₃: околу 150g на секој kg храна дневно.',
        'Целен алкалитет: 100-200 mg/L. Мерете секој ден во исто време.',
      ],
      source: 'Loyless & Malone (1997); Summerfelt et al. (2015)',
    });
  }

  // ── 3. Амонијак висок — ИТНО (>2.0 mg/L) ──
  if (nh4 !== null && nh4 > 2.0) {
    recommendations.push({
      urgency: 'critical',
      title: 'Амонијак е многу висок',
      summary: 'Стоп хранење, замена на вода 20-30%, максимална аерација',
      steps: [
        'Стопирајте хранење веднаш. Не продолжувајте додека не падне под 1.0 mg/L (~48ч без храна).',
        'Заменете 20-30% од водата постепено (4-6 часа). Не одеднаш — нагла промена е поопасна.',
        'Сите аератори на максимум — кислородот им помага на рибите да го толерираат.',
        'Проверете алкалитет — под 100 mg/L биофилтерот работи слабо.',
        'Мерете на секои 3-4 часа додека не падне под 1.0 mg/L.',
      ],
      source: 'Schram et al. (Wageningen); SRAC 463; Timmons & Ebeling (2010)',
    });
  } else if (nh4 !== null && nh4 > 1.0) {
    recommendations.push({
      urgency: 'high',
      title: 'Амонијак е зголемен',
      summary: 'Намалете хранење на половина, проверете биофилтер',
      steps: [
        'Намалете хранење на половина веднаш.',
        'Засилете аерација — биофилтерот троши 4.57g O₂ за секој 1g амонијак.',
        'Проверете биофилтер: проток, зачепување, алкалитет над 100 mg/L.',
        'Замена на 10-20% вода со деклорирана вода на слична температура.',
        'Мерете повторно за 4 часа. Ако расте — стоп хранење.',
      ],
      source: 'SRAC 463; Timmons & Ebeling (2010)',
    });
  }

  // ── 4. NH₃ токсичност ──
  if (nh3Result && nh3Result.nh3 > NH3_SAFE_LIMIT && ph !== null) {
    recommendations.push({
      urgency: 'critical',
      title: 'Токсичен амонијак (NH₃)',
      summary: 'Стоп хранење, додајте свежа вода, не менувајте pH',
      steps: [
        'Стопирајте хранење веднаш.',
        'Додајте свежа вода за разредување — најбрз начин за намалување.',
        'НЕ менувајте pH хемиски! Наглата промена е поопасна од самиот амонијак.',
        'Засилете аерација на максимум.',
      ],
      source: 'Emerson et al. (1975); Schram et al. (Wageningen)',
    });
  }

  // ── 5. Нитрити високи ──
  if (no2 !== null && no2 > 0.5) {
    const targetCl = no2 * 6;
    const saltGperL = (targetCl / 0.6 / 1000).toFixed(1);
    const saltKgPer1000L = (targetCl / 0.6).toFixed(0);
    recommendations.push({
      urgency: no2 > 1.0 ? 'critical' : 'high',
      title: `Нитрити високи (${no2} mg/L)`,
      summary: `Додајте ${saltKgPer1000L}g нејодирана сол на 1000L вода`,
      steps: [
        `Потребен хлорид: ${targetCl.toFixed(0)} mg/L (сооднос Cl⁻:NO₂⁻ = 6:1 по Boyd).`,
        `Растворете ${saltKgPer1000L}g нејодирана сол (NaCl) на 1000L вода во кофа. Додајте полека (30-60 мин).`,
        'Солта го блокира навлегувањето на нитрити преку школките, но НЕ ги отстранува.',
        'Проверете биофилтер — нитритите растат кога Nitrobacter заостанува.',
        'Мерете нитрити на секои 12ч. Додавајте сол повторно ако растат.',
      ],
      source: 'Boyd (1998); SRAC 462; Schram et al. (Wageningen)',
    });
  }

  // ── 6. Нитрати високи ──
  if (no3 !== null && no3 > 150) {
    recommendations.push({
      urgency: no3 > 400 ? 'high' : 'medium',
      title: `Нитрати високи (${no3} mg/L)`,
      summary: 'Зголемете замена на вода на 15-20% дневно',
      steps: [
        'Замена на вода 15-20% дневно додека нитратите не паднат под 100 mg/L.',
        'Намалете хранење за 20-30% привремено.',
        'Проверете дали чешмата самата содржи нитрати.',
        no3 > 300
          ? 'При вака високо ниво рибите јадат помалку. Потребна е замена од 30-40% во наредните 2-3 дена, постепено.'
          : 'Рутинска замена на 5-10% дневно спречува натрупување.',
      ],
      source: 'Schram et al. (2014); Timmons & Ebeling (2010)',
    });
  }

  // ── 7. Температура ниска ──
  if (temp !== null && temp < 24) {
    let summary, feedStep, detailStep;
    if (temp < 18) {
      summary = 'Проверете термо пумпа, стоп хранење';
      feedStep = 'Стопирајте хранење — под 18°C рибите не јадат.';
      detailStep = 'Под 12°C има ризик од угинување.';
    } else if (temp < 22) {
      summary = 'Проверете термо пумпа, намалете хранење на 0.5-1%';
      feedStep = 'Намалете хранење на 0.5-1.0% телесна тежина дневно.';
      detailStep = 'Конверзијата на храна е лоша — повеќе храна само ја загадува водата.';
    } else {
      summary = 'Проверете термо пумпа, намалете хранење';
      feedStep = 'Намалете хранење на 1.5-2.5% телесна тежина дневно.';
      detailStep = 'Оптимум е 28-30°C.';
    }
    recommendations.push({
      urgency: temp < 18 ? 'critical' : 'medium',
      title: `Водата е ладна (${temp}°C)`,
      summary,
      steps: [
        'Проверете термо пумпа — целна температура 28-30°C.',
        feedStep,
        detailStep,
      ],
      source: 'Britz & Hecht (1987); Prokešová et al. (2015)',
    });
  }

  // ── 8. Температура висока ──
  if (temp !== null && temp > 32) {
    recommendations.push({
      urgency: temp > 33 ? 'critical' : 'high',
      title: `Водата е претопла (${temp}°C)`,
      summary: 'Максимална аерација, намалете хранење',
      steps: [
        'Аерација на максимум — топлата вода има помалку кислород.',
        'Намалете хранење на 1-2% телесна тежина.',
        'Проверете термо пумпа — оптимум 28-30°C.',
      ],
      source: 'Prokešová et al. (2015); Britz & Hecht (1987)',
    });
  }

  // ── 9. Преголемо хранење ──
  if (feedingData && feedingData.feedVsRecommended > 1.2) {
    const overPct = Math.round((feedingData.feedVsRecommended - 1) * 100);
    recommendations.push({
      urgency: feedingData.feedVsRecommended > 1.5 ? 'high' : 'medium',
      title: `Хранење ${overPct}% повеќе од потребното`,
      summary: 'Вратете на препорачана количина, отстранете неизедена храна',
      steps: [
        'Вратете хранење на препорачана количина. Давајте колку ќе изедат за 2 часа.',
        'Отстранете неизедена храна (сифон или механички филтер).',
        'Хронологија: за 12-24ч може амонијак, за 3-7 дена нитрити.',
        'Мерете амонијак и нитрити наредните 5 дена.',
      ],
      source: 'Timmons & Ebeling (2010); Global Seafood Alliance',
    });
  }

  // ── 10. Алкалитет низок ──
  if (alk !== null && alk < 80 && !recommendations.some(r => r.summary?.includes('бикарбона'))) {
    const dose1000L = Math.round((100 - alk) * 1.68);
    recommendations.push({
      urgency: alk < 50 ? 'high' : 'medium',
      title: `Низок алкалитет (${alk} mg/L)`,
      summary: `Додајте ${dose1000L}g сода бикарбона на 1000L вода`,
      steps: [
        'Алкалитет под 100 mg/L — биофилтерот не може ефикасно да работи.',
        `Растворете ${dose1000L}g NaHCO₃ на 1000L вода. Додајте полека низ системот.`,
        'Макс. 20-30 mg/L подигање дневно за да нема pH шок.',
        'Целна вредност: 100-200 mg/L. Мерете мин. 3× неделно.',
        'Долгорочно: ~150g NaHCO₃ на секој kg храна дневно.',
      ],
      source: 'Loyless & Malone (1997); Timmons & Ebeling (2010)',
    });
  }

  // ── 11. Тврдост висока ──
  if (hardness !== null && hardness > 300) {
    recommendations.push({
      urgency: hardness > 450 ? 'high' : 'medium',
      title: `Тврдост превисока (${hardness} mg/L)`,
      summary: 'Зголемете замена на вода со помека вода',
      steps: [
        'Оптимален опсег: 75-150 mg/L. Над 300 поттикнува Columnaris болест.',
        'Замена на вода 15-20% дневно со помека вода (дождовница, RO).',
        'Ако баферирате со CaCO₃ — преминете на NaHCO₃ (не ја зголемува тврдоста).',
        'Постепено, макс. 15% замена дневно.',
      ],
      source: 'Boyd (Global Seafood Alliance); USDA ARS',
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
