/**
 * ═══════════════════════════════════════════════════════════════
 * CLARIO — Random Forest Water Parameter Prediction
 * ML-базирана предикција на водни параметри (1-3 дена напред)
 * ═══════════════════════════════════════════════════════════════
 *
 * Користи ml-random-forest за регресија.
 * За секој параметар се тренира посебен модел.
 *
 * ВАЖНО: Моделот предвидува DELTA (дневна промена) наместо апсолутна вредност.
 * Ова решава проблем со tree-based модели кои не можат да екстраполираат
 * надвор од тренинг рангот (нпр. ако нитратите растат од 50→140).
 *
 * Features:
 *   - Delta lag features: последните 3 дневни промени на целниот параметар
 *   - Cross-parameter: последни вредности на останатите параметри
 *   - Temporal: ден во неделата (sin/cos кодирање за цикличност)
 *   - Feeding: вкупна храна за тој ден (ако е достапна)
 *
 * Валидација: Leave-last-20%-out R² и MAE
 * Кеширање: моделите се тренираат еднаш дневно
 */

const { RandomForestRegression } = require('ml-random-forest');

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

const LAG_DAYS = 3;               // колку дена назад гледаме (за delta)
const MIN_RECORDS = 30;           // минимум записи за тренирање
const MIN_R2 = 0.15;              // под ова — моделот не се користи (понизок праг за delta)
const FORECAST_DAYS = 3;          // предвиди 1, 2, 3 дена напред
const VALIDATION_SPLIT = 0.2;     // 20% за валидација
const RF_OPTIONS = {
  nEstimators: 100,
  maxFeatures: 0.7,
  replacement: true,
  seed: 42,
};

// ── Кеш ──
let modelCache = {
  models: {},       // { paramName: RandomForestRegression }
  metrics: {},      // { paramName: { r2, mae, nSamples } }
  trainedAt: null,  // Date ISO string
  trainedDate: null, // YYYY-MM-DD (за дневно ре-тренирање)
};

// ═══════════════════════════════════════════════════
// Feature Extraction — DELTA approach
// ═══════════════════════════════════════════════════

/**
 * Од хронолошки подредени записи, креирај feature матрица за еден параметар.
 *
 * Target: delta = row[param] - previousRow[param] (дневна промена)
 *
 * Features:
 *   [delta_lag1, delta_lag2, delta_lag3,       — последни 3 дневни промени
 *    current_value,                            — моментална вредност на целниот параметар
 *    temp, ph, alk, hard, no3, no2, cl, nh4,  — моментални вредности на сите параметри
 *    day_sin, day_cos,                         — ден во неделата
 *    total_food_gr]                            — количина на храна
 */
function extractFeatures(records, targetParam) {
  const X = [];
  const y = [];

  // Пресметај delta за сите записи
  const deltas = [];
  for (let i = 1; i < records.length; i++) {
    const curr = parseFloat(records[i][targetParam]);
    const prev = parseFloat(records[i - 1][targetParam]);
    deltas.push((!isNaN(curr) && !isNaN(prev)) ? curr - prev : null);
  }

  // За тренирање ни треба LAG_DAYS претходни делти + моментални вредности
  for (let i = LAG_DAYS; i < deltas.length; i++) {
    const targetDelta = deltas[i];
    if (targetDelta === null) continue;

    const features = [];
    let hasAllLags = true;

    // Delta lag features
    for (let lag = 1; lag <= LAG_DAYS; lag++) {
      const d = deltas[i - lag];
      if (d === null) { hasAllLags = false; break; }
      features.push(d);
    }
    if (!hasAllLags) continue;

    // Моментална вредност на целниот параметар (i+1 бидејќи deltas е shifted by 1)
    const recordIdx = i + 1;
    const row = records[recordIdx];
    const currentVal = parseFloat(row[targetParam]);
    if (isNaN(currentVal)) continue;
    features.push(currentVal);

    // Cross-parameter features (моменталниот ден)
    for (const param of PARAMETERS) {
      const val = parseFloat(row[param]);
      features.push(isNaN(val) ? 0 : val);
    }

    // Temporal: ден во неделата
    const date = new Date(row.date);
    const dayOfWeek = date.getDay();
    features.push(Math.sin(2 * Math.PI * dayOfWeek / 7));
    features.push(Math.cos(2 * Math.PI * dayOfWeek / 7));

    // Feeding data
    const food = parseFloat(row.total_food_gr);
    features.push(isNaN(food) ? 0 : food);

    X.push(features);
    y.push(targetDelta);
  }

  const featureNames = [
    ...Array.from({ length: LAG_DAYS }, (_, i) => `delta_lag${i + 1}`),
    `${targetParam}_current`,
    ...PARAMETERS.map(p => `${p}_value`),
    'day_sin', 'day_cos',
    'total_food_gr',
  ];

  return { X, y, featureNames };
}

/**
 * Креирај feature вектор за предикција на утрешната delta.
 */
function extractPredictionFeatures(records, targetParam, recentDeltas, dayOffset, currentVal) {
  const features = [];
  const latest = records[records.length - 1];

  // Delta lag features — за dayOffset=0, користиме последните 3 реални делти
  // За dayOffset>0, шифтираме и можеби ги вклучуваме предвидените делти
  for (let lag = 1; lag <= LAG_DAYS; lag++) {
    const idx = recentDeltas.length - lag - dayOffset;
    if (idx >= 0 && idx < recentDeltas.length) {
      features.push(recentDeltas[idx]);
    } else {
      features.push(0);
    }
  }

  // Моментална вредност (за напредни денови, ова е проектирана вредност)
  features.push(currentVal);

  // Cross-parameter (последен познат запис)
  for (const param of PARAMETERS) {
    const val = parseFloat(latest[param]);
    features.push(isNaN(val) ? 0 : val);
  }

  // Temporal: предвиди го денот
  const latestDate = new Date(latest.date);
  const futureDate = new Date(latestDate);
  futureDate.setDate(futureDate.getDate() + dayOffset + 1);
  const dayOfWeek = futureDate.getDay();
  features.push(Math.sin(2 * Math.PI * dayOfWeek / 7));
  features.push(Math.cos(2 * Math.PI * dayOfWeek / 7));

  // Feeding — просек на последните 3 дена
  const foodValues = records.slice(-3).map(r => parseFloat(r.total_food_gr)).filter(v => !isNaN(v));
  const avgFood = foodValues.length > 0 ? foodValues.reduce((a, b) => a + b, 0) / foodValues.length : 0;
  features.push(avgFood);

  return features;
}


// ═══════════════════════════════════════════════════
// Тренирање и валидација
// ═══════════════════════════════════════════════════

function trainAndValidate(X, y) {
  if (X.length < 15) return null; // need reasonable amount after delta extraction

  const splitIdx = Math.floor(X.length * (1 - VALIDATION_SPLIT));
  const X_train = X.slice(0, splitIdx);
  const y_train = y.slice(0, splitIdx);
  const X_val = X.slice(splitIdx);
  const y_val = y.slice(splitIdx);

  if (X_train.length < 10 || X_val.length < 3) return null;

  try {
    const model = new RandomForestRegression(RF_OPTIONS);
    model.train(X_train, y_train);

    // Валидација
    const predictions = model.predict(X_val);
    const meanActual = y_val.reduce((a, b) => a + b, 0) / y_val.length;

    let ssTot = 0, ssRes = 0, sumAbsErr = 0;
    for (let i = 0; i < y_val.length; i++) {
      ssTot += Math.pow(y_val[i] - meanActual, 2);
      ssRes += Math.pow(y_val[i] - predictions[i], 2);
      sumAbsErr += Math.abs(y_val[i] - predictions[i]);
    }

    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    const mae = sumAbsErr / y_val.length;

    // Ре-тренирај на целиот сет ако метриките се добри
    if (r2 >= MIN_R2) {
      const fullModel = new RandomForestRegression(RF_OPTIONS);
      fullModel.train(X, y);
      return {
        model: fullModel,
        metrics: {
          r2: Math.round(r2 * 1000) / 1000,
          mae: Math.round(mae * 10000) / 10000,
          nSamples: X.length,
          nFeatures: X[0].length,
          valSize: X_val.length,
        },
      };
    }

    return {
      model: null,
      metrics: {
        r2: Math.round(r2 * 1000) / 1000,
        mae: Math.round(mae * 10000) / 10000,
        nSamples: X.length,
        nFeatures: X[0].length,
        valSize: X_val.length,
        rejected: true,
        reason: `R² = ${r2.toFixed(3)} < ${MIN_R2} (недоволно предиктивен)`,
      },
    };
  } catch (err) {
    console.error('RF training error:', err.message);
    return null;
  }
}


// ═══════════════════════════════════════════════════
// Главна функција
// ═══════════════════════════════════════════════════

async function generateWaterForecast(dbPool) {
  const todayStr = new Date().toISOString().split('T')[0];

  // Провери кеш — ре-тренирај само еднаш дневно
  // Чисти стари кеш податоци (спречува неограничен раст на меморија)
  const needsTraining = !modelCache.trainedDate || modelCache.trainedDate !== todayStr;

  // 1. Земи историски податоци (сите записи) со хранење
  const historyResult = await dbPool.query(`
    SELECT
      dr.date,
      wc.temperature, wc.ph, wc.total_alkalinity, wc.hardness,
      wc.nitrates, wc.nitrites, wc.total_chlorine, wc.ammonium,
      COALESCE(meals.total_food, 0) as total_food_gr
    FROM water_control wc
    JOIN daily_records dr ON wc.daily_record_id = dr.id
    LEFT JOIN (
      SELECT date, SUM(food_quantity_gr) as total_food
      FROM pool_meals
      WHERE food_quantity_gr > 0
      GROUP BY date
    ) meals ON meals.date = dr.date
    ORDER BY dr.date ASC
  `);

  const records = historyResult.rows;

  if (records.length < MIN_RECORDS) {
    return {
      available: false,
      reason: `Потребни се минимум ${MIN_RECORDS} записи за ML предикција. Моментално: ${records.length}.`,
      recordCount: records.length,
      minRequired: MIN_RECORDS,
    };
  }

  // 2. Земи норми
  const normsResult = await dbPool.query('SELECT * FROM parameter_norms');
  const norms = {};
  for (const row of normsResult.rows) {
    norms[row.parameter_name] = {
      min: row.min_value !== null ? parseFloat(row.min_value) : null,
      max: row.max_value !== null ? parseFloat(row.max_value) : null,
    };
  }

  // 3. Тренирај модели (ако треба)
  if (needsTraining) {
    modelCache = { models: {}, metrics: {}, trainedAt: new Date().toISOString(), trainedDate: todayStr };

    for (const param of PARAMETERS) {
      const { X, y } = extractFeatures(records, param);
      const result = trainAndValidate(X, y);

      if (result) {
        modelCache.models[param] = result.model;
        modelCache.metrics[param] = result.metrics;
      } else {
        modelCache.metrics[param] = {
          r2: 0, mae: 0, nSamples: X.length,
          rejected: true, reason: 'Недоволно валидни податоци за тренирање',
        };
      }
    }
  }

  // 4. Генерирај предикции за 1-3 дена напред
  const latest = records[records.length - 1];
  const latestDate = new Date(latest.date);
  const forecasts = {};
  const warnings = [];

  for (const param of PARAMETERS) {
    const model = modelCache.models[param];
    const metrics = modelCache.metrics[param];
    const currentValue = parseFloat(latest[param]);

    if (!model || metrics?.rejected || isNaN(currentValue)) {
      forecasts[param] = {
        ...PARAM_META[param],
        parameter: param,
        currentValue: isNaN(currentValue) ? null : currentValue,
        available: false,
        reason: metrics?.reason || 'Моделот не е достапен',
        metrics: metrics || null,
      };
      continue;
    }

    // Пресметај последните делти за овој параметар
    const recentDeltas = [];
    for (let i = Math.max(1, records.length - LAG_DAYS - 2); i < records.length; i++) {
      const curr = parseFloat(records[i][param]);
      const prev = parseFloat(records[i - 1][param]);
      recentDeltas.push((!isNaN(curr) && !isNaN(prev)) ? curr - prev : 0);
    }

    const predictions = [];
    let projectedValue = currentValue;
    const projectedDeltas = [...recentDeltas];

    for (let day = 0; day < FORECAST_DAYS; day++) {
      try {
        const features = extractPredictionFeatures(records, param, projectedDeltas, day, projectedValue);
        const predictedDelta = model.predict([features])[0];

        // Проектирана вредност = моментална + акумулирана delta
        projectedValue += predictedDelta;
        // Clamp: физички вредностите не можат да бидат негативни
        // (температура, pH, концентрации — сите се ≥ 0)
        if (projectedValue < 0) projectedValue = 0;
        projectedDeltas.push(predictedDelta);
        const roundedPred = Math.round(projectedValue * 1000) / 1000;

        const forecastDate = new Date(latestDate);
        forecastDate.setDate(forecastDate.getDate() + day + 1);

        // Провери дали предикцијата е надвор од нормата
        const norm = norms[param];
        let outOfNorm = null;
        if (norm) {
          if (norm.max !== null && roundedPred > norm.max) {
            outOfNorm = { direction: 'high', boundary: norm.max };
          } else if (norm.min !== null && roundedPred < norm.min) {
            outOfNorm = { direction: 'low', boundary: norm.min };
          }
        }

        if (outOfNorm) {
          warnings.push({
            parameter: param,
            ...PARAM_META[param],
            day: day + 1,
            date: forecastDate.toISOString().split('T')[0],
            predicted: roundedPred,
            direction: outOfNorm.direction,
            boundary: outOfNorm.boundary,
            severity: day === 0 ? 'critical' : day === 1 ? 'warning' : 'info',
          });
        }

        predictions.push({
          day: day + 1,
          date: forecastDate.toISOString().split('T')[0],
          value: roundedPred,
          delta: Math.round(predictedDelta * 1000) / 1000,
          outOfNorm,
        });
      } catch (err) {
        predictions.push({ day: day + 1, error: err.message });
      }
    }

    forecasts[param] = {
      ...PARAM_META[param],
      parameter: param,
      currentValue,
      available: true,
      predictions,
      metrics: {
        r2: metrics.r2,
        mae: metrics.mae,
        nSamples: metrics.nSamples,
      },
    };
  }

  // Сортирај предупредувања
  const sevOrder = { critical: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => a.day - b.day || (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9));

  const availableModels = Object.values(forecasts).filter(f => f.available).length;
  const avgR2 = availableModels > 0
    ? Object.values(forecasts).filter(f => f.available).reduce((sum, f) => sum + f.metrics.r2, 0) / availableModels
    : 0;

  return {
    available: true,
    latestDate: latest.date,
    recordCount: records.length,
    forecasts,
    warnings,
    summary: {
      totalParameters: PARAMETERS.length,
      availableModels,
      rejectedModels: PARAMETERS.length - availableModels,
      avgR2: Math.round(avgR2 * 1000) / 1000,
      warningCount: warnings.length,
    },
    training: {
      trainedAt: modelCache.trainedAt,
      nEstimators: RF_OPTIONS.nEstimators,
      lagDays: LAG_DAYS,
      minR2Threshold: MIN_R2,
      approach: 'delta',
    },
  };
}

module.exports = { generateWaterForecast };
