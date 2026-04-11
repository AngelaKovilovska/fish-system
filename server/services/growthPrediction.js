/**
 * ═══════════════════════════════════════════════════════════════
 * CLARIO — Growth Prediction Module
 * ═══════════════════════════════════════════════════════════════
 *
 * Предвидува прираст на африкански сом (Clarias gariepinus) во RAS
 * систем, користејќи го актуелниот FCR, морталитетот, температурата и
 * крива на раст од Alltech Coppens 2025-2026 Catfish Feeding Table.
 *
 * Inputs:
 *   N            — број на риби (почеток)
 *   W0           — почетна просечна тежина (g)
 *   F            — вкупно дадена храна во периодот (kg)
 *   D            — број на денови
 *   temperature  — просечна температура на вода (°C), optional
 *   fcr          — корисникот може да внесе познат FCR, optional
 *   survival     — дневна стапка на преживување (0.9990 = 99.9%/ден), optional
 *
 * Outputs:
 *   W1              — нова просечна тежина по риба (g)
 *   biomass_end     — вкупна биомаса (kg)
 *   biomass_start   — почетна биомаса (kg)
 *   daily_growth    — просечен дневен раст (g/ден)
 *   SGR             — Specific Growth Rate (% / ден)
 *   FCR_used        — FCR користен во пресметката
 *   survival_used   — применета стапка на преживување
 *   expected_vs_actual_fcr — споредба на корисничкото FCR со очекуваното
 *   recommended_daily_feed_next — препорачана дневна храна за следниот период (kg)
 *   next_feed_rate  — препорачана стапка (% BW/ден) за следниот период
 *   warnings[]      — листа на предупредувања (температура, нелогични вредности)
 *
 * ЛОГИКА (што е поправено во однос на првобитната формула):
 *
 * 1. FCR зависи од фазата на раст:
 *    - <200g:  0.65 (Advance + Pre Grower, realised FCR)
 *    - 200-1500g: 0.85 (Special Pro / Grower-13 EF, pref. range)
 *    - >1500g: 1.00 (финишер)
 *    Ако корисникот даде FCR, тој се користи наместо default-от.
 *
 * 2. Се зема предвид морталитет:
 *    N_end = N_start × survival^D
 *    Просечен број риби во период = (N_start + N_end) / 2
 *
 * 3. Feed-per-fish се пресметува со ПРОСЕЧНИОТ број риби во периодот
 *    (математички точно, не со почетниот број).
 *
 * 4. Температурна корекција:
 *    Ако температурата е под 26-28°C, растот е побавен —
 *    реалниот FCR станува полош (поголем), бидејќи повеќе храна оди
 *    за одржување наместо за раст.
 *
 * 5. Се пресметува SGR — стандарден показател во аквакултура:
 *    SGR = 100 × (ln(W1) − ln(W0)) / D
 *
 * 6. Се верификуваат резултатите против Alltech кривата и се даваат
 *    предупредувања ако рeзултатот е надвор од реалистичен опсег.
 */

const {
  GROWOUT_TABLE,
  TEMP_ADJUSTMENTS,
} = require('./feedingRecommendation');

// ─────────────────────────────────────────────────────────────────
// КОНСТАНТИ
// ─────────────────────────────────────────────────────────────────

/**
 * Default FCR по фаза на раст (врз основа на Alltech Coppens spec sheets:
 * Advance/Pre Grower 0.50–0.80, Grower-13 EF/Special Pro 0.75–1.10)
 *
 * Користиме горен/среден дел од опсегот за реалистични RAS услови
 * (не best-case lab услови).
 */
const PHASE_FCR = [
  { maxWeight: 50,    fcr: 0.60, phase: 'fry' },        // 0-50g: старт
  { maxWeight: 200,   fcr: 0.75, phase: 'pre-grower' }, // 50-200g
  { maxWeight: 800,   fcr: 0.85, phase: 'grower-early'},// 200-800g
  { maxWeight: 1500,  fcr: 0.95, phase: 'grower-late' },// 800-1500g
  { maxWeight: Infinity, fcr: 1.05, phase: 'finisher' },// >1500g
];

/**
 * Default морталитет во RAS систем — 99.95% преживување дневно.
 * Математика:
 *   0.9995^30  = 98.5% (месечно)
 *   0.9995^90  = 95.6% (3 месеци)
 *   0.9995^150 = 92.8% (5 месеци, типичен grow-out)
 * Ова се совпаѓа со производната стапка од ~90–95% за добро управувани RAS
 * системи со сом. Рускиот план (95% за 30 дена) претпоставува почеток на
 * циклусот кога морталитетот е повисок (stocking shock).
 */
const DEFAULT_SURVIVAL_PER_DAY = 0.9995;

/**
 * Коефициент на казна за температура врз FCR.
 * Формула: FCR_adj = FCR × (1 + (1 − tempFactor) × COEF)
 *
 * Со COEF = 0.25:
 *   tempFactor 1.00 (27°C)  → FCR × 1.000 (0% казна)
 *   tempFactor 0.85 (25°C)  → FCR × 1.037 (+3.7%)
 *   tempFactor 0.70 (23°C)  → FCR × 1.075 (+7.5%)
 *   tempFactor 0.55 (21°C)  → FCR × 1.112 (+11.2%)
 *   tempFactor 0.40 (19°C)  → FCR × 1.150 (+15.0%)
 *
 * Научна основа: Britz & Hecht (1987), Haylor (1991) — FCR за Clarias
 * деградира линеарно до ~15% во опсегот 18–26°C.
 */
const TEMP_FCR_PENALTY_COEFFICIENT = 0.25;

/** Максимум денови за симулација (1 година) */
const MAX_SIMULATION_DAYS = 365;

// ─────────────────────────────────────────────────────────────────
// ПОМОШНИ ФУНКЦИИ
// ─────────────────────────────────────────────────────────────────

/**
 * Поврзува тежина со фазен FCR
 */
function getPhaseFCR(avgWeight) {
  for (const phase of PHASE_FCR) {
    if (avgWeight <= phase.maxWeight) {
      return phase;
    }
  }
  return PHASE_FCR[PHASE_FCR.length - 1];
}

/**
 * Интерполиран feed rate (% BW/ден) од Alltech табелата.
 * Линеарна интерполација меѓу соседните точки.
 */
function interpolateFeedRate(weight) {
  if (weight <= GROWOUT_TABLE[0].avgWeight) return GROWOUT_TABLE[0].feedRate;
  if (weight >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight) {
    return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedRate;
  }
  for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
    const lo = GROWOUT_TABLE[i];
    const hi = GROWOUT_TABLE[i + 1];
    if (weight >= lo.avgWeight && weight < hi.avgWeight) {
      const ratio = (weight - lo.avgWeight) / (hi.avgWeight - lo.avgWeight);
      return lo.feedRate + ratio * (hi.feedRate - lo.feedRate);
    }
  }
  return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedRate;
}

/**
 * Температурен фактор за раст.
 * Под оптимум (26-28°C), растот е побавен. Над 31°C — стрес.
 * Фиксиран бугот: ако температурата е надвор од сите опсези (на пр. >50°C),
 * враќаме factor=0 наместо 1.0 (екстремните услови НЕ се оптимални).
 */
function getTemperatureFactor(temperature) {
  if (temperature == null) return { factor: 1.0, note: 'Температура непозната — се користи оптимум' };
  const adj = TEMP_ADJUSTMENTS.find(a => temperature >= a.minTemp && temperature < a.maxTemp);
  if (adj) return { factor: adj.factor, note: adj.note };
  // Надвор од сите опсези — екстремни услови, не се хранат
  return { factor: 0, note: `Екстремна температура (${temperature}°C) — надвор од опсег` };
}

/**
 * Пресметува мултипликатор за FCR врз основа на температурниот фактор.
 * На оптимум (factor=1.0) → 1.0 (без казна).
 * Под оптимум → FCR се влошува за линеарен процент.
 * Види TEMP_FCR_PENALTY_COEFFICIENT за примери.
 */
function computeFcrTempMultiplier(tempFactor) {
  if (tempFactor == null || tempFactor <= 0) {
    // Кога рибите не јадат воопшто, FCR не е дефиниран — враќаме голема вредност
    // за да се спречат невозможни пресметки
    return 2.0;
  }
  const deficit = Math.max(0, 1 - tempFactor);
  return 1 + deficit * TEMP_FCR_PENALTY_COEFFICIENT;
}

/**
 * Ден-по-ден симулација на раст.
 * Ова е главниот математички мотор — го третира секој ден посебно,
 * ажурирајќи ги W (тежина) и N (број риби) согласно:
 *   • FCR според тековната фаза на раст (ако рибите преминат фаза, се менува)
 *   • Морталитет (експоненцијално опаѓање)
 *   • Температурна казна на FCR
 *
 * Оваа симулација е неопходна за долги периоди (>30 дена) кога рибите можат
 * да преминат фази на раст. За кратки периоди (<14 дена) резултатот е
 * практично идентичен со затворена формула, но симулацијата е пообщо точна.
 *
 * Храната се распределува рамномерно по денови (totalFeedKg / days). Ова е
 * апроксимација — во реалноста фармерот рампува нагоре како рибите растат —
 * но бидејќи влезниот податок е ВКУПНА храна (не дневна), рамномерната
 * распределба е математички најобјективен избор.
 */
function simulateGrowthDaily({
  initialWeight,
  fishCount,
  totalFeedKg,
  days,
  fcrOverride = null,
  dailySurvival,
  fcrTempMultiplier = 1.0,
}) {
  const dailyFeedKg = totalFeedKg / days;

  let W = initialWeight;
  let N = fishCount;

  const phasesTraversed = new Set();
  const fcrsUsed = [];
  const weightTrajectory = [W];
  const nTrajectory = [N];
  let totalFeedPerFishGr = 0;

  for (let day = 1; day <= days; day++) {
    // Одлучи кој FCR важи за денешниот раст
    const phase = getPhaseFCR(W);
    phasesTraversed.add(phase.phase);
    const fcrToday = fcrOverride != null && fcrOverride > 0
      ? fcrOverride
      : phase.fcr * fcrTempMultiplier;
    fcrsUsed.push(fcrToday);

    // Храна по риба денес (користи тековен N, пред морталитет за денот)
    const feedPerFishGr = (dailyFeedKg * 1000) / N;
    totalFeedPerFishGr += feedPerFishGr;

    // Раст денес
    const growthTodayGr = feedPerFishGr / fcrToday;
    W += growthTodayGr;

    // Примени морталитет на крајот од денот
    N = N * dailySurvival;

    weightTrajectory.push(W);
    nTrajectory.push(N);
  }

  // Просечен FCR низ периодот (аритметички просек на дневните вредности)
  const avgFcr = fcrsUsed.reduce((a, b) => a + b, 0) / fcrsUsed.length;

  return {
    finalWeight: W,
    finalFishCount: N,
    totalFeedPerFishGr,
    totalGrowthPerFishGr: W - initialWeight,
    avgFcr,
    phasesTraversed: Array.from(phasesTraversed),
    weightTrajectory,
    nTrajectory,
  };
}

/**
 * Specific Growth Rate (% / ден).
 * Стандарден показател во аквакултура.
 */
function calculateSGR(W0, W1, D) {
  if (W0 <= 0 || W1 <= 0 || D <= 0) return 0;
  return (100 * (Math.log(W1) - Math.log(W0))) / D;
}

/**
 * Expected weight after D days if the fish follow the Alltech growth curve perfectly.
 * Се користи за валидација на резултатот.
 */
function getExpectedWeightFromCurve(W0, D) {
  // Find current curve position
  let currentDay = 0;
  if (W0 <= GROWOUT_TABLE[0].avgWeight) {
    currentDay = 0;
  } else if (W0 >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight) {
    currentDay = GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedingDays;
  } else {
    for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
      const lo = GROWOUT_TABLE[i];
      const hi = GROWOUT_TABLE[i + 1];
      if (W0 >= lo.avgWeight && W0 < hi.avgWeight) {
        const ratio = (W0 - lo.avgWeight) / (hi.avgWeight - lo.avgWeight);
        currentDay = lo.feedingDays + ratio * (hi.feedingDays - lo.feedingDays);
        break;
      }
    }
  }

  const targetDay = currentDay + D;
  if (targetDay >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedingDays) {
    return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight;
  }
  for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
    const lo = GROWOUT_TABLE[i];
    const hi = GROWOUT_TABLE[i + 1];
    if (targetDay >= lo.feedingDays && targetDay < hi.feedingDays) {
      const ratio = (targetDay - lo.feedingDays) / (hi.feedingDays - lo.feedingDays);
      return lo.avgWeight + ratio * (hi.avgWeight - lo.avgWeight);
    }
  }
  return W0;
}

// ─────────────────────────────────────────────────────────────────
// ГЛАВНА ФУНКЦИЈА — предвидување на прираст
// ─────────────────────────────────────────────────────────────────

/**
 * Главна функција за пресметка на прираст.
 *
 * @param {Object} input
 * @param {number} input.fishCount    — N: број риби на почеток
 * @param {number} input.initialWeight — W0: почетна просечна тежина (g)
 * @param {number} input.totalFeedKg  — F: вкупна дадена храна (kg)
 * @param {number} input.days         — D: број денови
 * @param {number} [input.temperature] — просечна температура (°C)
 * @param {number} [input.fcr]         — познат FCR (ако се прескокне default)
 * @param {number} [input.dailySurvival] — стапка на преживување/ден (default 0.999)
 * @returns {Object} Пресметки + препораки + предупредувања
 */
function predictGrowth(input) {
  const {
    fishCount,
    initialWeight,
    totalFeedKg,
    days,
    temperature = null,
    fcr = null,
    dailySurvival = DEFAULT_SURVIVAL_PER_DAY,
  } = input;

  const warnings = [];

  // ─── 1. Валидација на влез ───
  if (!fishCount || fishCount <= 0) {
    return { error: 'Невалиден број риби' };
  }
  if (!initialWeight || initialWeight <= 0) {
    return { error: 'Невалидна почетна тежина' };
  }
  if (!totalFeedKg || totalFeedKg <= 0) {
    return { error: 'Невалидна количина храна' };
  }
  if (!days || days <= 0) {
    return { error: 'Невалиден број денови' };
  }
  if (dailySurvival < 0.9 || dailySurvival > 1) {
    warnings.push('Стапката на преживување е надвор од реалистичен опсег (0.9-1.0)');
  }
  if (days > MAX_SIMULATION_DAYS) {
    warnings.push(`Периодот (${days} дена) е предолг — точноста опаѓа по >180 дена`);
  }

  // ─── 2. Физиолошка проверка на храната ───
  // Провери дали внесената храна имплицира реална стапка на хранење.
  // На почеток рибите можат да јадат најмногу ~2× од Alltech препораката;
  // под ~0.3× значи сериозно недохранување.
  const impliedDailyFeedKg = totalFeedKg / days;
  const startBiomassKg = (fishCount * initialWeight) / 1000;
  const impliedInitialRatePct = (impliedDailyFeedKg / startBiomassKg) * 100;
  const expectedRatePctAtW0 = interpolateFeedRate(initialWeight);

  if (impliedInitialRatePct > expectedRatePctAtW0 * 2) {
    warnings.push(
      `Внесот имплицира почетна стапка на хранење ${impliedInitialRatePct.toFixed(1)}% BW/ден, ` +
      `што е физиолошки невозможно (Alltech максимум ~${(expectedRatePctAtW0 * 1.5).toFixed(1)}%). ` +
      `Проверете ги внесените податоци.`
    );
  }
  if (impliedInitialRatePct < expectedRatePctAtW0 * 0.3) {
    warnings.push(
      `Внесот имплицира почетна стапка ${impliedInitialRatePct.toFixed(1)}% BW/ден, ` +
      `што е премалку (Alltech препорачува ${expectedRatePctAtW0.toFixed(1)}%). ` +
      `Рибите се недохранувани.`
    );
  }

  // ─── 3. Температурна корекција на FCR (поблага формула) ───
  const tempAdj = getTemperatureFactor(temperature);
  const fcrTempMultiplier = computeFcrTempMultiplier(tempAdj.factor);

  // ─── 4. Симулација ден-по-ден ───
  // Ова автоматски ги третира сите овие работи:
  //   • FCR се менува кога рибите преминат фаза на раст
  //   • Морталитетот се применува секој ден
  //   • Храната се распределува рамномерно
  const sim = simulateGrowthDaily({
    initialWeight,
    fishCount,
    totalFeedKg,
    days,
    fcrOverride: fcr && fcr > 0 ? fcr : null,
    dailySurvival,
    fcrTempMultiplier,
  });

  const W1 = sim.finalWeight;
  const fishCountEnd = Math.round(sim.finalFishCount);
  const survivalTotal = Math.pow(dailySurvival, days);
  // Точна формула за просечен број (без ранени заокружувања):
  const avgFishCount = fishCount * (1 + survivalTotal) / 2;
  const deadFish = fishCount - fishCountEnd;

  // Ефективниот FCR е просекот низ сите денови од симулацијата
  const fcrUsed = fcr && fcr > 0 ? fcr : sim.avgFcr;
  const fcrSource = fcr && fcr > 0
    ? 'user-specified'
    : `phase-based (${sim.phasesTraversed.join(' → ')})`;

  if (fcrUsed > 2) {
    warnings.push(`FCR ${fcrUsed.toFixed(2)} е многу висок — проверете дали рибите се стресирани`);
  }
  if (fcrUsed < 0.4) {
    warnings.push(`FCR ${fcrUsed.toFixed(2)} е нереално низок за африкански сом`);
  }

  // ─── 5. Биомаса и раст ───
  const growthPerFishGr = W1 - initialWeight;
  const feedPerFishGr = (totalFeedKg * 1000) / avgFishCount;

  const biomassStartKg = (fishCount * initialWeight) / 1000;
  const biomassEndKg = (fishCountEnd * W1) / 1000;
  const biomassGainKg = biomassEndKg - biomassStartKg;

  const dailyGrowthGr = growthPerFishGr / days;
  const sgr = calculateSGR(initialWeight, W1, days);

  // ─── 6. Валидација против Alltech кривата ───
  const expectedW1 = getExpectedWeightFromCurve(initialWeight, days);
  const expectedSGR = calculateSGR(initialWeight, expectedW1, days);
  const growthDeviation = ((W1 - expectedW1) / expectedW1) * 100;

  if (growthDeviation > 30) {
    warnings.push(`Прирастот е ${growthDeviation.toFixed(0)}% повисок од очекуваната Alltech крива — проверете ги податоците`);
  }
  if (growthDeviation < -30) {
    warnings.push(`Прирастот е ${Math.abs(growthDeviation).toFixed(0)}% понизок од очекуваниот — проблем со храна, температура или здравство`);
  }

  // ─── 7. Температурни предупредувања ───
  if (temperature != null && temperature < 24) {
    warnings.push(`Ниска температура (${temperature}°C) — растот е забавен. Оптимум: 26-28°C`);
  }
  if (temperature != null && temperature > 30) {
    warnings.push(`Висока температура (${temperature}°C) — стрес за рибите`);
  }

  // ─── 8. Препорака за следниот период ───
  const nextFeedRate = interpolateFeedRate(W1) * tempAdj.factor;
  const nextDailyFeedKg = (biomassEndKg * nextFeedRate) / 100;

  // ─── 9. Resultat ───
  return {
    input: {
      fishCount,
      initialWeight,
      totalFeedKg,
      days,
      temperature,
      fcr: fcr || null,
      dailySurvival,
    },

    mortality: {
      fishCountStart: fishCount,
      fishCountEnd: fishCountEnd,
      deadFish,
      avgFishCount: Math.round(avgFishCount),
      survivalRate: Math.round(survivalTotal * 10000) / 100, // %
    },

    growth: {
      W0: initialWeight,
      W1: Math.round(W1 * 10) / 10,
      growthPerFishGr: Math.round(growthPerFishGr * 10) / 10,
      dailyGrowthGr: Math.round(dailyGrowthGr * 100) / 100,
      sgr: Math.round(sgr * 1000) / 1000,
      feedPerFishGr: Math.round(feedPerFishGr * 10) / 10,
    },

    biomass: {
      startKg: Math.round(biomassStartKg * 10) / 10,
      endKg: Math.round(biomassEndKg * 10) / 10,
      gainKg: Math.round(biomassGainKg * 10) / 10,
    },

    fcr: {
      used: Math.round(fcrUsed * 100) / 100,
      source: fcrSource,
      tempPenaltyMultiplier: Math.round(fcrTempMultiplier * 1000) / 1000,
      phasesTraversed: sim.phasesTraversed,
      simulationAvgFcr: Math.round(sim.avgFcr * 100) / 100,
    },

    temperature: {
      value: temperature,
      factor: tempAdj.factor,
      note: tempAdj.note,
    },

    validation: {
      expectedW1FromCurve: Math.round(expectedW1 * 10) / 10,
      expectedSGR: Math.round(expectedSGR * 1000) / 1000,
      growthDeviationPercent: Math.round(growthDeviation * 10) / 10,
      isRealistic: Math.abs(growthDeviation) <= 30,
    },

    nextPeriodRecommendation: {
      feedRatePercent: Math.round(nextFeedRate * 100) / 100,
      dailyFeedKg: Math.round(nextDailyFeedKg * 100) / 100,
      monthlyFeedKg: Math.round(nextDailyFeedKg * 30 * 10) / 10,
    },

    // Дијагностики за проверка на внесот
    feedCheck: {
      impliedDailyFeedKg: Math.round(impliedDailyFeedKg * 1000) / 1000,
      impliedInitialRatePct: Math.round(impliedInitialRatePct * 100) / 100,
      alltechRatePctAtW0: Math.round(expectedRatePctAtW0 * 100) / 100,
      isRealisticAmount: impliedInitialRatePct >= expectedRatePctAtW0 * 0.3
                      && impliedInitialRatePct <= expectedRatePctAtW0 * 2,
    },

    warnings,
  };
}

/**
 * Обратна пресметка: ако знаеме W0, W1 (вистинско мерење), N, F, D —
 * пресметуваме реален FCR и SGR. Корисно за калибрација.
 */
function calculateActualFCR({ fishCount, W0, W1, totalFeedKg, days, temperature = null, dailySurvival = DEFAULT_SURVIVAL_PER_DAY }) {
  if (!fishCount || !W0 || !W1 || !totalFeedKg || !days) {
    return { error: 'Потребни се сите влезни податоци (fishCount, W0, W1, totalFeedKg, days)' };
  }
  if (W1 < W0) {
    return { error: 'W1 мора да биде поголема или еднаква на W0 — рибите не губат тежина нормално' };
  }

  const survivalTotal = Math.pow(dailySurvival, days);
  const avgFishCount = fishCount * (1 + survivalTotal) / 2;
  const fishCountEnd = Math.round(fishCount * survivalTotal);

  // Биомасата се пресметува со РЕАЛНИ крајни бројки
  const biomassStartKg = (fishCount * W0) / 1000;
  const biomassEndKg = (fishCountEnd * W1) / 1000;
  const biomassGainKg = biomassEndKg - biomassStartKg;
  const actualFCR = biomassGainKg > 0 ? (totalFeedKg / biomassGainKg) : null;
  const sgr = calculateSGR(W0, W1, days);

  // Теоретски FCR по фаза — користи ТРУ midWeight зашто имаме двете крајни точки
  const midWeight = (W0 + W1) / 2;
  const phase = getPhaseFCR(midWeight);

  // Ако имаме температура, очекуваниот FCR е корегиран за неа
  const tempAdj = getTemperatureFactor(temperature);
  const tempAdjustedExpectedFCR = phase.fcr * computeFcrTempMultiplier(tempAdj.factor);

  // Rating se смета наспроти температурно-корегираниот очекуван FCR,
  // зашто не е фер да се казнува фармерот за лоша температура
  const comparisonBaseline = temperature != null ? tempAdjustedExpectedFCR : phase.fcr;
  const rating = actualFCR
    ? actualFCR < comparisonBaseline * 0.9 ? 'excellent'
      : actualFCR <= comparisonBaseline * 1.1 ? 'good'
      : actualFCR <= comparisonBaseline * 1.3 ? 'acceptable'
      : 'poor'
    : null;

  return {
    actualFCR: actualFCR ? Math.round(actualFCR * 100) / 100 : null,
    expectedFCR: phase.fcr,
    expectedFCRTempAdjusted: Math.round(tempAdjustedExpectedFCR * 100) / 100,
    phase: phase.phase,
    sgr: Math.round(sgr * 1000) / 1000,
    biomassStartKg: Math.round(biomassStartKg * 10) / 10,
    biomassEndKg: Math.round(biomassEndKg * 10) / 10,
    biomassGainKg: Math.round(biomassGainKg * 10) / 10,
    deviation: actualFCR ? Math.round(((actualFCR - comparisonBaseline) / comparisonBaseline) * 100 * 10) / 10 : null,
    rating,
    temperature: temperature != null ? {
      value: temperature,
      factor: tempAdj.factor,
      fcrPenalty: Math.round((computeFcrTempMultiplier(tempAdj.factor) - 1) * 100 * 10) / 10,
      note: tempAdj.note,
    } : null,
    mortality: {
      fishStart: fishCount,
      fishEnd: fishCountEnd,
      avgFishCount: Math.round(avgFishCount),
      survivalRate: Math.round(survivalTotal * 10000) / 100,
    },
  };
}

module.exports = {
  predictGrowth,
  calculateActualFCR,
  calculateSGR,
  getPhaseFCR,
  getExpectedWeightFromCurve,
  simulateGrowthDaily,
  computeFcrTempMultiplier,
  PHASE_FCR,
  DEFAULT_SURVIVAL_PER_DAY,
  TEMP_FCR_PENALTY_COEFFICIENT,
};
