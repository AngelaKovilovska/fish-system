const { RandomForestRegression } = require('ml-random-forest');

const PARAMETERS = [
  'temperature', 'ph', 'total_alkalinity', 'hardness',
  'nitrates', 'nitrites', 'total_chlorine', 'ammonium',
];

const PARAM_LABELS = {
  temperature: 'Температура',
  ph: 'pH',
  total_alkalinity: 'Вкупна алкалност',
  hardness: 'Тврдост',
  nitrates: 'Нитрати (NO₃⁻)',
  nitrites: 'Нитрити (NO₂⁻)',
  total_chlorine: 'Вкупен хлор',
  ammonium: 'Амониум (NH₄⁺)',
};

const PARAM_UNITS = {
  temperature: '°C', ph: '', total_alkalinity: 'mg/L', hardness: 'mg/L',
  nitrates: 'mg/L', nitrites: 'mg/L', total_chlorine: 'mg/L', ammonium: 'mg/L',
};

const RF_CONFIG = {
  nEstimators: 80,
  maxDepth: 8,
  treeOptions: { minNumSamples: 3 },
  seed: 42,
  useSampleBagging: true,
};

const LAG_DAYS = 7;
const PREDICT_DAYS = 7;
const MIN_TRAINING_DAYS = 14; // need at least 14 days to build features with 7-day lag

/**
 * Build feature vector for one day/parameter from historical data
 */
function buildFeatures(history, dayIndex, paramIndex) {
  const features = [];
  const param = PARAMETERS[paramIndex];

  // Lag features: value(t-1) to value(t-LAG_DAYS) for this parameter
  for (let lag = 1; lag <= LAG_DAYS; lag++) {
    const idx = dayIndex - lag;
    features.push(idx >= 0 ? (parseFloat(history[idx][param]) || 0) : 0);
  }

  // 3-day and 7-day moving averages
  let sum3 = 0, count3 = 0, sum7 = 0, count7 = 0;
  for (let lag = 1; lag <= 7; lag++) {
    const idx = dayIndex - lag;
    if (idx >= 0) {
      const val = parseFloat(history[idx][param]) || 0;
      if (lag <= 3) { sum3 += val; count3++; }
      sum7 += val; count7++;
    }
  }
  features.push(count3 > 0 ? sum3 / count3 : 0); // avg_3d
  features.push(count7 > 0 ? sum7 / count7 : 0); // avg_7d

  // 3-day trend (slope): difference between day t-1 and t-3
  const valT1 = dayIndex >= 1 ? (parseFloat(history[dayIndex - 1][param]) || 0) : 0;
  const valT3 = dayIndex >= 3 ? (parseFloat(history[dayIndex - 3][param]) || 0) : 0;
  features.push(valT1 - valT3); // trend_3d

  // Day of week (0-6)
  const date = new Date(history[dayIndex].date);
  features.push(date.getDay());

  // Cross-parameter features: yesterday's values for ALL parameters
  for (const p of PARAMETERS) {
    const idx = dayIndex - 1;
    features.push(idx >= 0 ? (parseFloat(history[idx][p]) || 0) : 0);
  }

  return features;
}

/**
 * Build feature vector for prediction (using the latest data + any previous predictions)
 */
function buildPredictionFeatures(history, predictions, dayOffset, paramIndex) {
  const features = [];
  const param = PARAMETERS[paramIndex];
  const histLen = history.length;

  // Helper: get value at dayOffset-lag (from predictions if in future, from history if in past)
  function getValue(p, lag) {
    const targetOffset = dayOffset - lag;
    if (targetOffset >= 0 && predictions[p] && predictions[p][targetOffset] !== undefined) {
      return predictions[p][targetOffset];
    }
    const histIdx = histLen - lag + dayOffset;
    if (histIdx >= 0 && histIdx < histLen) {
      return parseFloat(history[histIdx][p]) || 0;
    }
    return 0;
  }

  // Lag features
  for (let lag = 1; lag <= LAG_DAYS; lag++) {
    features.push(getValue(param, lag));
  }

  // 3-day and 7-day moving averages
  let sum3 = 0, count3 = 0, sum7 = 0, count7 = 0;
  for (let lag = 1; lag <= 7; lag++) {
    const val = getValue(param, lag);
    if (lag <= 3) { sum3 += val; count3++; }
    sum7 += val; count7++;
  }
  features.push(count3 > 0 ? sum3 / count3 : 0);
  features.push(count7 > 0 ? sum7 / count7 : 0);

  // Trend
  features.push(getValue(param, 1) - getValue(param, 3));

  // Day of week
  const lastDate = new Date(history[histLen - 1].date);
  lastDate.setDate(lastDate.getDate() + dayOffset + 1);
  features.push(lastDate.getDay());

  // Cross-parameter yesterday values
  for (const p of PARAMETERS) {
    features.push(getValue(p, 1));
  }

  return features;
}

const FEATURE_NAMES = [
  ...Array.from({ length: LAG_DAYS }, (_, i) => `lag_${i + 1}`),
  'avg_3d', 'avg_7d', 'trend_3d', 'day_of_week',
  ...PARAMETERS.map(p => `cross_${p}`),
];

/**
 * Train a Random Forest model for one parameter and predict next PREDICT_DAYS days
 */
function trainAndPredict(history, paramIndex, norms, allPredictions) {
  const param = PARAMETERS[paramIndex];
  const values = history.map(h => parseFloat(h[param]) || 0);

  // Filter out days with no data for this parameter
  const validDays = values.filter(v => v !== 0).length;
  if (validDays < MIN_TRAINING_DAYS) {
    return {
      parameter: param,
      label: PARAM_LABELS[param],
      unit: PARAM_UNITS[param],
      current: values[values.length - 1],
      predicted: [],
      dates: [],
      insufficient: true,
      message: `Потребни се барем ${MIN_TRAINING_DAYS} дена податоци (имате ${validDays})`,
    };
  }

  // Build training data
  const X = [];
  const y = [];
  for (let i = LAG_DAYS; i < history.length; i++) {
    const val = parseFloat(history[i][param]);
    if (val === null || val === undefined || isNaN(val)) continue;
    X.push(buildFeatures(history, i, paramIndex));
    y.push(val);
  }

  if (X.length < 10) {
    return {
      parameter: param,
      label: PARAM_LABELS[param],
      unit: PARAM_UNITS[param],
      current: values[values.length - 1],
      predicted: [],
      dates: [],
      insufficient: true,
      message: 'Недоволно валидни тренинг примероци',
    };
  }

  // Train/test split: last 5 days for testing accuracy
  const testSize = Math.min(5, Math.floor(X.length * 0.2));
  const trainX = X.slice(0, X.length - testSize);
  const trainY = y.slice(0, y.length - testSize);
  const testX = X.slice(X.length - testSize);
  const testY = y.slice(y.length - testSize);

  // Train Random Forest
  const rf = new RandomForestRegression(RF_CONFIG);
  rf.train(trainX, trainY);

  // Evaluate accuracy
  let mae = 0, ss_res = 0, ss_tot = 0;
  const meanY = testY.reduce((a, b) => a + b, 0) / testY.length;
  if (testX.length > 0) {
    const testPred = rf.predict(testX);
    for (let i = 0; i < testY.length; i++) {
      mae += Math.abs(testY[i] - testPred[i]);
      ss_res += (testY[i] - testPred[i]) ** 2;
      ss_tot += (testY[i] - meanY) ** 2;
    }
    mae /= testY.length;
  }
  const r2 = ss_tot > 0 ? Math.max(0, 1 - ss_res / ss_tot) : 0;

  // Retrain on full data for production predictions
  const rfFull = new RandomForestRegression(RF_CONFIG);
  rfFull.train(X, y);

  // Feature importance (from the RF model)
  const importance = {};
  // ml-random-forest doesn't expose feature importance directly,
  // so we compute it by permutation: measure prediction change when each feature is shuffled
  const basePred = rfFull.predict(X);
  const baseError = basePred.reduce((s, p, i) => s + (p - y[i]) ** 2, 0);
  for (let f = 0; f < FEATURE_NAMES.length; f++) {
    const shuffled = X.map(row => [...row]);
    // Shuffle feature f across all samples
    const vals = shuffled.map(row => row[f]);
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    shuffled.forEach((row, i) => { row[f] = vals[i]; });
    const shuffPred = rfFull.predict(shuffled);
    const shuffError = shuffPred.reduce((s, p, i) => s + (p - y[i]) ** 2, 0);
    importance[FEATURE_NAMES[f]] = Math.max(0, shuffError - baseError);
  }
  // Normalize to sum=1
  const totalImp = Object.values(importance).reduce((a, b) => a + b, 0);
  if (totalImp > 0) {
    for (const k of Object.keys(importance)) {
      importance[k] = Math.round((importance[k] / totalImp) * 1000) / 1000;
    }
  }

  // Predict next PREDICT_DAYS days (rolling)
  const predicted = [];
  const dates = [];
  const lastDate = new Date(history[history.length - 1].date);

  for (let d = 0; d < PREDICT_DAYS; d++) {
    const feats = buildPredictionFeatures(history, allPredictions, d, paramIndex);
    const pred = rfFull.predict([feats])[0];
    // Clamp to reasonable range (no negative values for most params)
    const clampedPred = param === 'temperature' ? pred : Math.max(0, pred);
    predicted.push(Math.round(clampedPred * 1000) / 1000);
    allPredictions[param] = allPredictions[param] || [];
    allPredictions[param][d] = clampedPred;

    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + d + 1);
    dates.push(nextDate.toISOString().split('T')[0]);
  }

  // Check norm threshold crossing
  const norm = norms.find(n => n.parameter_name === param);
  let willExceedNorm = false;
  let daysUntilExceeded = null;
  let exceedDirection = null;

  if (norm) {
    for (let i = 0; i < predicted.length; i++) {
      if (norm.max_value !== null && predicted[i] > parseFloat(norm.max_value)) {
        willExceedNorm = true;
        daysUntilExceeded = i + 1;
        exceedDirection = 'high';
        break;
      }
      if (norm.min_value !== null && predicted[i] < parseFloat(norm.min_value)) {
        willExceedNorm = true;
        daysUntilExceeded = i + 1;
        exceedDirection = 'low';
        break;
      }
    }
  }

  // Top 5 most important features
  const topFeatures = Object.entries(importance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, importance: value }));

  return {
    parameter: param,
    label: PARAM_LABELS[param],
    unit: PARAM_UNITS[param],
    current: values[values.length - 1],
    predicted,
    dates,
    willExceedNorm,
    daysUntilExceeded,
    exceedDirection,
    norm: norm ? {
      min: norm.min_value !== null ? parseFloat(norm.min_value) : null,
      max: norm.max_value !== null ? parseFloat(norm.max_value) : null,
    } : null,
    featureImportance: topFeatures,
    accuracy: { mae: Math.round(mae * 1000) / 1000, r2: Math.round(r2 * 100) / 100 },
    trainingSize: X.length,
    // Last 7 days of actual values for chart
    recent: values.slice(-7).map((v, i) => ({
      date: history[history.length - 7 + i]?.date || null,
      value: v,
    })).filter(r => r.date),
  };
}

/**
 * Main entry point: predict all water parameters
 */
async function predictWaterParameters(dbPool) {
  // Fetch all historical water data
  const historyResult = await dbPool.query(`
    SELECT dr.date,
      wc.temperature, wc.ph, wc.total_alkalinity, wc.hardness,
      wc.nitrates, wc.nitrites, wc.total_chlorine, wc.ammonium
    FROM water_control wc
    JOIN daily_records dr ON wc.daily_record_id = dr.id
    WHERE wc.temperature IS NOT NULL
    ORDER BY dr.date ASC
  `);

  if (historyResult.rows.length < MIN_TRAINING_DAYS) {
    return {
      predictions: {},
      warnings: [],
      modelInfo: {
        trainingDays: historyResult.rows.length,
        error: `Потребни се барем ${MIN_TRAINING_DAYS} дена податоци`,
      },
    };
  }

  // Fetch norms
  const normsResult = await dbPool.query('SELECT * FROM parameter_norms');
  const norms = normsResult.rows;

  const history = historyResult.rows;
  const predictions = {};
  const allPredictions = {}; // shared across parameters for cross-correlation in rolling prediction
  const warnings = [];

  for (let i = 0; i < PARAMETERS.length; i++) {
    const result = trainAndPredict(history, i, norms, allPredictions);
    predictions[PARAMETERS[i]] = result;

    if (result.willExceedNorm) {
      const dir = result.exceedDirection === 'high' ? 'ќе ја надмине' : 'ќе падне под';
      const normVal = result.exceedDirection === 'high' ? result.norm.max : result.norm.min;
      warnings.push({
        parameter: result.parameter,
        label: result.label,
        severity: result.daysUntilExceeded <= 2 ? 'critical' : 'warning',
        daysUntil: result.daysUntilExceeded,
        message: `${result.label} ${dir} нормата (${normVal}${result.unit ? ' ' + result.unit : ''}) за ${result.daysUntilExceeded} ден${result.daysUntilExceeded > 1 ? 'а' : ''}`,
      });
    }
  }

  // Sort warnings by urgency
  warnings.sort((a, b) => a.daysUntil - b.daysUntil);

  return {
    predictions,
    warnings,
    modelInfo: {
      algorithm: 'Random Forest Regression',
      trainingDays: history.length,
      features: FEATURE_NAMES.length,
      trees: RF_CONFIG.nEstimators,
      maxDepth: RF_CONFIG.maxDepth,
      predictDays: PREDICT_DAYS,
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = { predictWaterParameters };
