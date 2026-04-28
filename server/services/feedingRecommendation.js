/**
 * ═══════════════════════════════════════════════════════════════
 * CLARIO — AI Feeding Recommendation Module (Rule-Based Phase)
 * ═══════════════════════════════════════════════════════════════
 *
 * Based on Alltech Coppens 2025-2026 Catfish Feeding Tables
 * for African sharptooth catfish (Clarias gariepinus).
 *
 * Two tables:
 *   1. FRY protocol (day 1-57, weight 0.0025g - 10g)
 *   2. GROW-OUT protocol (weight 10g - 2000g+)
 *
 * Optimal conditions: water temperature 26-28°C, optimal water quality
 *
 * Inputs:  fish count, avg weight (g), water temperature (°C)
 * Outputs: recommended food type, pellet size, daily quantity (kg),
 *          per-meal breakdown, feeding frequency, feed rate %BW/day
 */

// ─── Coppens Grow-out Feeding Table ───
// Source: Alltech Coppens 2025-2026 Catfish Feeding Table
// Based on optimal water quality and water temperature of 26-28°C
// Feeding level for optimal FCR
const GROWOUT_TABLE = [
  { feedingDays: 0,   avgWeight: 10,   feedRate: 5.62, feedSizeMm: '1.5',     foodType: 'Advance' },
  { feedingDays: 1,   avgWeight: 11,   feedRate: 5.59, feedSizeMm: '1.5+2.0', foodType: 'Advance' },
  { feedingDays: 2,   avgWeight: 12,   feedRate: 5.57, feedSizeMm: '1.5+2.0', foodType: 'Advance' },
  { feedingDays: 3,   avgWeight: 13,   feedRate: 5.55, feedSizeMm: '2.0',     foodType: 'Pre Grower-15 EF' },
  { feedingDays: 4,   avgWeight: 15,   feedRate: 5.51, feedSizeMm: '2.0',     foodType: 'Pre Grower-15 EF' },
  { feedingDays: 5,   avgWeight: 16,   feedRate: 5.47, feedSizeMm: '2.0',     foodType: 'Pre Grower-15 EF' },
  { feedingDays: 6,   avgWeight: 18,   feedRate: 5.44, feedSizeMm: '2.0',     foodType: 'Pre Grower-15 EF' },
  { feedingDays: 7,   avgWeight: 19,   feedRate: 5.40, feedSizeMm: '2.0',     foodType: 'Pre Grower-15 EF' },
  { feedingDays: 14,  avgWeight: 35,   feedRate: 4.99, feedSizeMm: '2.0',     foodType: 'Pre Grower-15 EF' },
  { feedingDays: 21,  avgWeight: 58,   feedRate: 4.48, feedSizeMm: '3.0',     foodType: 'Special Pro' },
  { feedingDays: 28,  avgWeight: 90,   feedRate: 4.04, feedSizeMm: '3.0',     foodType: 'Special Pro' },
  { feedingDays: 35,  avgWeight: 132,  feedRate: 3.61, feedSizeMm: '3.0',     foodType: 'Special Pro' },
  { feedingDays: 42,  avgWeight: 184,  feedRate: 3.16, feedSizeMm: '4.5',     foodType: 'Grower-13 EF' },
  { feedingDays: 49,  avgWeight: 242,  feedRate: 2.74, feedSizeMm: '4.5',     foodType: 'Grower-13 EF' },
  { feedingDays: 56,  avgWeight: 305,  feedRate: 2.37, feedSizeMm: '4.5',     foodType: 'Grower-13 EF' },
  { feedingDays: 63,  avgWeight: 372,  feedRate: 2.08, feedSizeMm: '4.5',     foodType: 'Grower-13 EF' },
  { feedingDays: 70,  avgWeight: 441,  feedRate: 1.87, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 77,  avgWeight: 514,  feedRate: 1.70, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 84,  avgWeight: 589,  feedRate: 1.57, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 91,  avgWeight: 669,  feedRate: 1.50, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 98,  avgWeight: 754,  feedRate: 1.43, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 105, avgWeight: 845,  feedRate: 1.36, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 112, avgWeight: 940,  feedRate: 1.30, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 119, avgWeight: 1040, feedRate: 1.24, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 126, avgWeight: 1144, feedRate: 1.18, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 133, avgWeight: 1251, feedRate: 1.12, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 140, avgWeight: 1361, feedRate: 1.06, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 147, avgWeight: 1473, feedRate: 1.02, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 154, avgWeight: 1589, feedRate: 0.97, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 161, avgWeight: 1706, feedRate: 0.92, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 168, avgWeight: 1826, feedRate: 0.89, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 175, avgWeight: 1948, feedRate: 0.86, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
  { feedingDays: 178, avgWeight: 2000, feedRate: 0.84, feedSizeMm: '4.5/6.0', foodType: 'Grower-13 EF' },
];

// ─── Feed product specifications ───
const FEED_PRODUCTS = {
  'Advance': {
    sizes: ['0.2-0.3', '0.3-0.5', '0.5-0.8', '1.0', '1.5'],
    protein: { '0.2-0.3': 56, '0.3-0.5': 56, '0.5-0.8': 56, '1.0': 54, '1.5': 54 },
    fat: 15,
    type: 'sinking',
    description: 'Starter — за млади риби (грануле/микро пелет)',
  },
  'Pre Grower-15 EF': {
    sizes: ['2.0'],
    protein: { '2.0': 50 },
    fat: 15,
    type: 'floating',
    description: 'Пре-растење — висока перформанса, пловечка храна',
  },
  'Special Pro': {
    sizes: ['3.0', '4.5'],
    protein: { '3.0': 48, '4.5': 43 },
    fat: { '3.0': 13, '4.5': 14 },
    type: 'floating',
    description: 'Специјална про — брз и ефикасен раст',
  },
  'Grower-13 EF': {
    sizes: ['3.0', '4.5', '6.0'],
    protein: { '3.0': 42, '4.5': 42, '6.0': 42 },
    fat: 13,
    type: 'floating',
    description: 'Растење — полу-интензивен систем',
  },
  'Repro': {
    sizes: ['6.0', '9.0'],
    protein: { '6.0': 48, '9.0': 48 },
    fat: 15,
    type: 'sinking',
    description: 'Матично јато — за репродукција',
  },
};

// ─── Temperature adjustment factors ───
// Optimal range: 26-28°C per Coppens specification
const TEMP_ADJUSTMENTS = [
  { minTemp: 0,  maxTemp: 18, factor: 0.0,  note: 'Премногу ладно — не хранете' },
  { minTemp: 18, maxTemp: 20, factor: 0.40, note: 'Многу ладна вода — намалете 60%' },
  { minTemp: 20, maxTemp: 22, factor: 0.55, note: 'Ладна вода — намалете 45%' },
  { minTemp: 22, maxTemp: 24, factor: 0.70, note: 'Под оптимум — намалете 30%' },
  { minTemp: 24, maxTemp: 26, factor: 0.85, note: 'Малку под оптимум — намалете 15%' },
  { minTemp: 26, maxTemp: 29, factor: 1.00, note: 'Оптимална температура (26-28°C)' },
  { minTemp: 29, maxTemp: 31, factor: 0.85, note: 'Над оптимум — намалете 15%' },
  { minTemp: 31, maxTemp: 33, factor: 0.65, note: 'Претопло — намалете 35%' },
  { minTemp: 33, maxTemp: 36, factor: 0.40, note: 'Критично топло — намалете 60%' },
  { minTemp: 36, maxTemp: 50, factor: 0.0,  note: 'Екстремно топло — не хранете' },
];

// ─── Meals per day — FIXED at 3 for all pools ───
// Фамаком Аквакултура: сите базени се хранат 3× дневно (утро, пладне, вечер).
function getMealsPerDay() {
  return 3;
}

/**
 * Interpolate feed rate from the Coppens grow-out table.
 * Uses linear interpolation between the two nearest weight points.
 */
function interpolateFeedRate(weight) {
  // Below table minimum
  if (weight <= GROWOUT_TABLE[0].avgWeight) {
    return {
      feedRate: GROWOUT_TABLE[0].feedRate,
      feedSizeMm: GROWOUT_TABLE[0].feedSizeMm,
      foodType: GROWOUT_TABLE[0].foodType,
    };
  }

  // Above table maximum
  if (weight >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight) {
    return {
      feedRate: GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedRate,
      feedSizeMm: GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedSizeMm,
      foodType: GROWOUT_TABLE[GROWOUT_TABLE.length - 1].foodType,
    };
  }

  // Find the two bracketing entries
  let lower = GROWOUT_TABLE[0];
  let upper = GROWOUT_TABLE[1];

  for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
    if (weight >= GROWOUT_TABLE[i].avgWeight && weight < GROWOUT_TABLE[i + 1].avgWeight) {
      lower = GROWOUT_TABLE[i];
      upper = GROWOUT_TABLE[i + 1];
      break;
    }
  }

  // Linear interpolation of feed rate
  const ratio = (weight - lower.avgWeight) / (upper.avgWeight - lower.avgWeight);
  const feedRate = lower.feedRate + ratio * (upper.feedRate - lower.feedRate);

  // Use the food type/size of the lower bracket (conservative — don't jump early)
  // But if closer to upper, use upper's food type
  const useUpper = ratio > 0.7;
  return {
    feedRate: Math.round(feedRate * 100) / 100,
    feedSizeMm: useUpper ? upper.feedSizeMm : lower.feedSizeMm,
    foodType: useUpper ? upper.foodType : lower.foodType,
  };
}

/**
 * Get temperature adjustment factor
 */
function getTempAdjustment(temperature) {
  if (temperature == null) return { factor: 1.0, note: 'Нема податок за температура — се користи оптимална вредност' };
  const adj = TEMP_ADJUSTMENTS.find(a => temperature >= a.minTemp && temperature < a.maxTemp);
  return adj || { factor: 1.0, note: 'Непозната температура' };
}

/**
 * Determine which feed product best matches the weight
 */
function getRecommendedFeedProduct(avgWeight) {
  if (avgWeight < 10) {
    return { name: 'Advance', sizeMm: avgWeight < 1 ? '0.2-0.3' : avgWeight < 3 ? '0.5-0.8' : '1.5' };
  }
  if (avgWeight < 13) return { name: 'Advance', sizeMm: '1.5' };
  if (avgWeight < 35) return { name: 'Pre Grower-15 EF', sizeMm: '2.0' };
  if (avgWeight < 132) return { name: 'Special Pro', sizeMm: '3.0' };
  if (avgWeight < 200) return { name: 'Grower-13 EF', sizeMm: '3.0' };
  if (avgWeight < 400) return { name: 'Grower-13 EF', sizeMm: '4.5' };
  return { name: 'Grower-13 EF', sizeMm: '6.0' };
}

/**
 * Calculate feeding recommendation for a single pool
 *
 * @param {number} fishCount - Number of fish in pool
 * @param {number} avgWeight - Average weight in grams
 * @param {number|null} temperature - Water temperature in °C
 * @param {Object} options - Additional options { currentFoodType }
 * @returns {Object} Feeding recommendation
 */
function calculatePoolRecommendation(fishCount, avgWeight, temperature = null, options = {}) {
  if (!fishCount || fishCount <= 0 || !avgWeight || avgWeight <= 0) {
    return {
      hasData: false,
      message: 'Нема доволно податоци за пресметка',
    };
  }

  const interpolated = interpolateFeedRate(avgWeight);
  const tempAdj = getTempAdjustment(temperature);
  const feedProduct = getRecommendedFeedProduct(avgWeight);
  const mealsPerDay = getMealsPerDay(avgWeight);

  // Biomass calculation
  const biomassKg = (fishCount * avgWeight) / 1000;

  // Base daily food (from Coppens feeding table)
  const baseDailyFoodKg = biomassKg * (interpolated.feedRate / 100);

  // Temperature-adjusted daily food
  const adjustedDailyFoodKg = baseDailyFoodKg * tempAdj.factor;

  // Per meal breakdown
  const perMealKg = mealsPerDay > 0 ? adjustedDailyFoodKg / mealsPerDay : 0;

  // Detect food type mismatch
  const currentFoodType = options.currentFoodType || null;
  let foodTypeWarning = null;
  if (currentFoodType) {
    const recName = feedProduct.name;
    // Normalize comparison (ignore size info in parentheses)
    const currentNorm = currentFoodType.replace(/\s*\(.*\)/, '').trim().toLowerCase();
    const recNorm = recName.toLowerCase();
    if (!currentNorm.includes(recNorm) && !recNorm.includes(currentNorm)) {
      foodTypeWarning = `Моментално користите "${currentFoodType}", но препорачано е "${recName} (${feedProduct.sizeMm}mm)" за риби од ${avgWeight}g`;
    }
  }

  // Transition zone detection
  let transitionNote = null;
  const productChanges = [
    { threshold: 10, from: 'Advance', to: 'Pre Grower-15 EF', toSize: '2.0mm' },
    { threshold: 50, from: 'Pre Grower-15 EF', to: 'Special Pro', toSize: '3.0mm' },
    { threshold: 120, from: 'Special Pro', to: 'Grower-13 EF', toSize: '3.0mm' },
    { threshold: 180, from: 'Grower-13 EF 3mm', to: 'Grower-13 EF', toSize: '4.5mm' },
    { threshold: 380, from: 'Grower-13 EF 4.5mm', to: 'Grower-13 EF', toSize: '6.0mm' },
  ];
  for (const change of productChanges) {
    if (avgWeight >= change.threshold * 0.85 && avgWeight < change.threshold * 1.05) {
      transitionNote = `Рибите (${avgWeight}g) се близу до преминот на ${change.to} ${change.toSize}. Почнете постепена транзиција.`;
      break;
    }
  }

  // Feed rate warning (if temperature causes 0 feeding)
  let criticalWarning = null;
  if (tempAdj.factor === 0) {
    criticalWarning = `⚠ Температурата (${temperature}°C) е надвор од безбеден опсег. НЕ хранете ги рибите!`;
  }

  return {
    hasData: true,
    poolData: {
      fishCount,
      avgWeight: Math.round(avgWeight * 10) / 10,
      biomassKg: Math.round(biomassKg * 100) / 100,
      temperature: temperature != null ? Math.round(temperature * 10) / 10 : null,
    },
    recommendation: {
      foodType: feedProduct.name,
      feedSizeMm: feedProduct.sizeMm,
      coppensTableSize: interpolated.feedSizeMm,
      feedRatePercent: Math.round(interpolated.feedRate * tempAdj.factor * 100) / 100,
      baseFeedRatePercent: interpolated.feedRate,
      dailyFoodKg: Math.round(adjustedDailyFoodKg * 100) / 100,
      dailyFoodGr: Math.round(adjustedDailyFoodKg * 1000),
      perMealKg: Math.round(perMealKg * 100) / 100,
      perMealGr: Math.round(perMealKg * 1000),
      mealsPerDay,
    },
    feedProductInfo: FEED_PRODUCTS[feedProduct.name] || null,
    temperatureAdjustment: {
      factor: tempAdj.factor,
      note: tempAdj.note,
      isOptimal: tempAdj.factor === 1.0 && temperature != null,
    },
    warnings: {
      foodTypeWarning,
      transitionNote,
      criticalWarning,
    },
  };
}

/**
 * Calculate recommendations for all pools
 *
 * @param {Array} pools - Array of { pool_number, current_count, avg_weight_gr, food_type }
 * @param {number|null} temperature - Current water temperature
 * @returns {Object} All pool recommendations + summary
 */
function calculateAllRecommendations(pools, temperature = null) {
  const recommendations = {};
  let totalDailyFoodKg = 0;
  let totalBiomassKg = 0;
  const foodTypeNeeds = {};

  for (const pool of pools) {
    const count = pool.current_count || pool.fish_count || 0;
    const weight = pool.avg_weight_gr || 0;

    const rec = calculatePoolRecommendation(
      count,
      weight,
      temperature,
      { currentFoodType: pool.food_type }
    );

    recommendations[pool.pool_number] = {
      poolNumber: pool.pool_number,
      ...rec,
    };

    if (rec.hasData) {
      totalDailyFoodKg += rec.recommendation.dailyFoodKg;
      totalBiomassKg += rec.poolData.biomassKg;

      // Aggregate food type needs
      const ft = `${rec.recommendation.foodType} (${rec.recommendation.feedSizeMm}mm)`;
      if (!foodTypeNeeds[ft]) foodTypeNeeds[ft] = 0;
      foodTypeNeeds[ft] += rec.recommendation.dailyFoodKg;
    }
  }

  return {
    pools: recommendations,
    summary: {
      totalBiomassKg: Math.round(totalBiomassKg * 100) / 100,
      totalDailyFoodKg: Math.round(totalDailyFoodKg * 100) / 100,
      totalDailyFoodGr: Math.round(totalDailyFoodKg * 1000),
      temperature: temperature != null ? Math.round(temperature * 10) / 10 : null,
      foodTypeNeeds: Object.entries(foodTypeNeeds).map(([type, kg]) => ({
        foodType: type,
        dailyNeedKg: Math.round(kg * 100) / 100,
      })),
      poolCount: Object.values(recommendations).filter(r => r.hasData).length,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Compare recommendation vs actual feeding for a pool
 */
function compareWithActual(recommendation, actualFoodGr) {
  if (!recommendation.hasData || !actualFoodGr) return null;

  const recommendedGr = recommendation.recommendation.dailyFoodGr;
  const diff = actualFoodGr - recommendedGr;
  const diffPercent = recommendedGr > 0 ? Math.round((diff / recommendedGr) * 100) : 0;

  let status, message;
  if (Math.abs(diffPercent) <= 10) {
    status = 'optimal';
    message = 'Хранењето е во оптимален опсег (±10%)';
  } else if (diffPercent > 10 && diffPercent <= 25) {
    status = 'slightly_overfed';
    message = `Малку прекумерно хранење (+${diffPercent}%). Намалете за ${Math.abs(diff)}g.`;
  } else if (diffPercent > 25) {
    status = 'overfed';
    message = `Прекумерно хранење (+${diffPercent}%). Намалете за ${Math.abs(diff)}g.`;
  } else if (diffPercent < -10 && diffPercent >= -25) {
    status = 'slightly_underfed';
    message = `Малку недоволно хранење (${diffPercent}%). Зголемете за ${Math.abs(diff)}g.`;
  } else {
    status = 'underfed';
    message = `Недоволно хранење (${diffPercent}%). Зголемете за ${Math.abs(diff)}g.`;
  }

  return {
    status,
    message,
    recommendedGr,
    actualGr: actualFoodGr,
    differenceGr: diff,
    differencePercent: diffPercent,
  };
}

/**
 * Simple calculator — for the standalone calculator page
 * Takes manual inputs (not from database)
 */
function manualCalculate({ fishCount, avgWeight, temperature, currentFoodType }) {
  return calculatePoolRecommendation(fishCount, avgWeight, temperature || null, { currentFoodType });
}

// ─── FCR values per product (from Coppens ecological figures) ───
const FCR_BY_PRODUCT = {
  'Advance': 0.65,            // range 0.50-0.80, use midpoint
  'Pre Grower-15 EF': 0.65,   // range 0.50-0.80
  'Special Pro': 0.925,        // range 0.75-1.10
  'Grower-13 EF': 0.925,      // range 0.75-1.10
  'Repro': 0.925,              // range 0.75-1.10
};

// ─── Map AI food type name → stock inventory food type name ───
const AI_TO_STOCK_MAP = {
  'Advance':            'Advance (1.5mm)',
  'Pre Grower-15 EF':  'Pregrower-15 (2mm)',
  'Special Pro':        'SpecialPro EF (3mm)',
};

function mapToStockFoodType(aiProductName, feedSizeMm) {
  if (AI_TO_STOCK_MAP[aiProductName]) return AI_TO_STOCK_MAP[aiProductName];
  // Grower-13 EF has multiple sizes in stock
  if (aiProductName === 'Grower-13 EF') {
    if (feedSizeMm && feedSizeMm.includes('6')) return 'Grower-13EF (6mm)';
    if (feedSizeMm && feedSizeMm.includes('4.5')) return 'Grower-13EF (4.5mm)';
    return 'Grower-13EF (3mm)';
  }
  return aiProductName;
}

/**
 * Find the current "feeding day" position on the Coppens curve for a given weight.
 * Returns fractional day for precise interpolation.
 */
function findCurvePosition(weight) {
  if (weight <= GROWOUT_TABLE[0].avgWeight) return 0;
  if (weight >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight) {
    return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedingDays;
  }
  for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
    if (weight >= GROWOUT_TABLE[i].avgWeight && weight < GROWOUT_TABLE[i + 1].avgWeight) {
      const ratio = (weight - GROWOUT_TABLE[i].avgWeight) /
                    (GROWOUT_TABLE[i + 1].avgWeight - GROWOUT_TABLE[i].avgWeight);
      return GROWOUT_TABLE[i].feedingDays + ratio * (GROWOUT_TABLE[i + 1].feedingDays - GROWOUT_TABLE[i].feedingDays);
    }
  }
  return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedingDays;
}

/**
 * Get expected weight at a given feeding day from the Coppens curve.
 * Interpolates between table points.
 */
function getWeightAtDay(feedingDay) {
  if (feedingDay <= 0) return GROWOUT_TABLE[0].avgWeight;
  if (feedingDay >= GROWOUT_TABLE[GROWOUT_TABLE.length - 1].feedingDays) {
    return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight;
  }
  for (let i = 0; i < GROWOUT_TABLE.length - 1; i++) {
    if (feedingDay >= GROWOUT_TABLE[i].feedingDays && feedingDay < GROWOUT_TABLE[i + 1].feedingDays) {
      const ratio = (feedingDay - GROWOUT_TABLE[i].feedingDays) /
                    (GROWOUT_TABLE[i + 1].feedingDays - GROWOUT_TABLE[i].feedingDays);
      return GROWOUT_TABLE[i].avgWeight + ratio * (GROWOUT_TABLE[i + 1].avgWeight - GROWOUT_TABLE[i].avgWeight);
    }
  }
  return GROWOUT_TABLE[GROWOUT_TABLE.length - 1].avgWeight;
}

/**
 * Project stock duration dynamically, simulating fish growth day-by-day.
 *
 * As fish grow, they eat more AND may transition to different food types.
 * This function simulates up to maxDays (default 365) into the future.
 *
 * @param {Array} pools - [{ pool_number, fish_count, avg_weight_gr }]
 * @param {number|null} temperature - Water temperature °C
 * @param {Object} stockByType - { 'Advance (1.5mm)': 25.5, 'Grower-13EF (4.5mm)': 100, ... } in kg
 * @param {number} maxDays - Maximum days to simulate (default 365)
 * @returns {Object} Projection results per food type
 */
function projectStockDuration(pools, temperature, stockByType, maxDays = 365) {
  const tempAdj = getTempAdjustment(temperature);

  // Initialize simulation state for each pool
  const poolStates = pools
    .filter(p => (p.fish_count || p.current_count) > 0 && p.avg_weight_gr > 0)
    .map(p => {
      const count = p.fish_count || p.current_count;
      const weight = p.avg_weight_gr;
      const curveDay = findCurvePosition(weight);
      return {
        poolNumber: p.pool_number,
        fishCount: count,
        currentWeight: weight,
        curveDay: curveDay,
      };
    });

  if (poolStates.length === 0) {
    return { projections: {}, pools: [], message: 'Нема податоци за базени' };
  }

  // Clone stock so we don't mutate input
  const remainingStock = {};
  for (const [type, kg] of Object.entries(stockByType)) {
    remainingStock[type] = parseFloat(kg) || 0;
  }

  // Track when each food type runs out
  const depletionDay = {};    // stockType -> day number when it hit 0
  const dailyConsumption = {}; // stockType -> array of { day, kgConsumed } for first/last day info

  // Day-by-day simulation
  for (let day = 0; day < maxDays; day++) {
    // Calculate today's total consumption per stock food type
    const todayConsumption = {}; // stockType -> kg

    for (const ps of poolStates) {
      // Get current feeding parameters based on projected weight
      const projectedWeight = getWeightAtDay(ps.curveDay + day);
      const interpolated = interpolateFeedRate(projectedWeight);
      const feedProduct = getRecommendedFeedProduct(projectedWeight);

      // Biomass and daily food
      const biomassKg = (ps.fishCount * projectedWeight) / 1000;
      const dailyFoodKg = biomassKg * (interpolated.feedRate / 100) * tempAdj.factor;

      // Map to stock food type
      const stockType = mapToStockFoodType(feedProduct.name, feedProduct.sizeMm);

      if (!todayConsumption[stockType]) todayConsumption[stockType] = 0;
      todayConsumption[stockType] += dailyFoodKg;
    }

    // Deduct from stock
    for (const [stockType, kgNeeded] of Object.entries(todayConsumption)) {
      if (depletionDay[stockType] !== undefined) continue; // already depleted

      if (!dailyConsumption[stockType]) {
        dailyConsumption[stockType] = { firstDayKg: kgNeeded, lastDayKg: kgNeeded };
      }
      dailyConsumption[stockType].lastDayKg = kgNeeded;

      if (remainingStock[stockType] !== undefined) {
        remainingStock[stockType] -= kgNeeded;
        if (remainingStock[stockType] <= 0) {
          depletionDay[stockType] = day;
          remainingStock[stockType] = 0;
        }
      }
      // If this stock type doesn't exist in inventory, mark as 0
      else if (kgNeeded > 0) {
        depletionDay[stockType] = 0;
      }
    }
  }

  // Build result per stock food type
  const projections = {};
  const today = new Date();

  for (const [stockType, stockKg] of Object.entries(stockByType)) {
    const deplDay = depletionDay[stockType];
    const consumption = dailyConsumption[stockType];

    if (deplDay !== undefined) {
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + deplDay);
      projections[stockType] = {
        stockKg: parseFloat(stockKg),
        daysLeft: deplDay,
        endDate: endDate.toISOString().split('T')[0],
        dailyConsumptionStartKg: consumption ? Math.round(consumption.firstDayKg * 1000) / 1000 : 0,
        dailyConsumptionEndKg: consumption ? Math.round(consumption.lastDayKg * 1000) / 1000 : 0,
        isDynamic: true,
      };
    } else if (consumption) {
      // Stock lasts beyond maxDays
      projections[stockType] = {
        stockKg: parseFloat(stockKg),
        daysLeft: maxDays,
        endDate: null,
        dailyConsumptionStartKg: Math.round(consumption.firstDayKg * 1000) / 1000,
        dailyConsumptionEndKg: Math.round(consumption.lastDayKg * 1000) / 1000,
        isDynamic: true,
        note: `Залиха трае повеќе од ${maxDays} дена`,
      };
    } else {
      // No consumption for this type (no pools need it currently)
      projections[stockType] = {
        stockKg: parseFloat(stockKg),
        daysLeft: null,
        endDate: null,
        dailyConsumptionStartKg: 0,
        dailyConsumptionEndKg: 0,
        isDynamic: false,
        note: 'Моментално не се користи',
      };
    }
  }

  return {
    projections,
    temperature: temperature != null ? Math.round(temperature * 10) / 10 : null,
    tempFactor: tempAdj.factor,
    simulatedDays: maxDays,
    poolCount: poolStates.length,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  GROWOUT_TABLE,
  FEED_PRODUCTS,
  TEMP_ADJUSTMENTS,
  calculatePoolRecommendation,
  calculateAllRecommendations,
  compareWithActual,
  manualCalculate,
  projectStockDuration,
};
