/**
 * ═══════════════════════════════════════════════════════════════
 * CLARIO — Water Parameter Anomaly Detection (Z-Score)
 * ═══════════════════════════════════════════════════════════════
 *
 * Uses Z-score analysis + moving average to detect anomalies
 * in water quality parameters (temperature, pH, total alkalinity,
 * hardness, nitrates, nitrites, total chlorine, ammonium).
 *
 * Thresholds based on African catfish optimal ranges.
 */

// ─── Optimal ranges for African catfish ───
const OPTIMAL_RANGES = {
  temperature:      { min: 26, max: 28, unit: '°C',    label: 'Температура' },
  ph:               { min: 6.5, max: 7.5, unit: '',    label: 'pH' },
  total_alkalinity: { min: 100, max: 200, unit: 'mg/L', label: 'Total Alkalinity' },
  hardness:         { min: 100, max: 300, unit: 'mg/L', label: 'Total Hardness' },
  nitrates:         { min: 0, max: 100, unit: 'mg/L',   label: 'Нитрати' },
  nitrites:         { min: 0, max: 0.5, unit: 'mg/L',   label: 'Нитрити' },
  total_chlorine:   { min: 0, max: 0.01, unit: 'mg/L',  label: 'Total Chlorine' },
  ammonium:         { min: 0, max: 0.05, unit: 'mg/L',  label: 'Амониум' },
};

// Z-score threshold for anomaly detection
const Z_THRESHOLD = 2.0;

/**
 * Calculate mean and standard deviation for an array of numbers
 */
function calcStats(values) {
  if (!values || values.length === 0) return { mean: 0, stdDev: 0 };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  return { mean: Math.round(mean * 100) / 100, stdDev: Math.round(stdDev * 100) / 100 };
}

/**
 * Calculate Z-score for a value
 */
function zScore(value, mean, stdDev) {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Analyze water parameters for anomalies
 *
 * @param {Object} currentValues - Current water readings { temperature, ph, total_alkalinity, ... }
 * @param {Array} historicalReadings - Array of past water_control records (last 7-30 days)
 * @returns {Object} Analysis results with anomalies and trend data
 */
function analyzeWaterParameters(currentValues, historicalReadings = []) {
  const anomalies = [];
  const parameterStatus = {};

  for (const [param, optRange] of Object.entries(OPTIMAL_RANGES)) {
    const currentVal = parseFloat(currentValues[param]);
    if (isNaN(currentVal) || currentVal === null || currentVal === undefined) continue;

    // Get historical values for this parameter
    const historicalVals = historicalReadings
      .map(r => parseFloat(r[param]))
      .filter(v => !isNaN(v) && v !== null);

    // Range check against optimal values
    let rangeStatus = 'normal';
    let rangeNote = null;

    if (currentVal < optRange.min) {
      rangeStatus = 'low';
      rangeNote = `${optRange.label}: ${currentVal}${optRange.unit} е под оптималното (${optRange.min}${optRange.unit})`;
    } else if (currentVal > optRange.max) {
      rangeStatus = 'high';
      rangeNote = `${optRange.label}: ${currentVal}${optRange.unit} е над оптималното (${optRange.max}${optRange.unit})`;
    }

    // Z-score analysis (needs at least 5 historical readings)
    let zScoreVal = null;
    let isStatisticalAnomaly = false;
    let stats = null;

    if (historicalVals.length >= 5) {
      stats = calcStats(historicalVals);
      zScoreVal = zScore(currentVal, stats.mean, stats.stdDev);
      isStatisticalAnomaly = Math.abs(zScoreVal) > Z_THRESHOLD;
    }

    // Moving average (last 3 readings)
    let trend = null;
    if (historicalVals.length >= 3) {
      const last3 = historicalVals.slice(-3);
      const ma3 = last3.reduce((a, b) => a + b, 0) / 3;
      const diff = currentVal - ma3;
      if (diff > 0) trend = 'rising';
      else if (diff < 0) trend = 'falling';
      else trend = 'stable';
    }

    // Build parameter status
    const status = {
      parameter: param,
      label: optRange.label,
      unit: optRange.unit,
      currentValue: currentVal,
      optimalRange: { min: optRange.min, max: optRange.max },
      rangeStatus,
      rangeNote,
      zScore: zScoreVal != null ? Math.round(zScoreVal * 100) / 100 : null,
      isStatisticalAnomaly,
      stats,
      trend,
      historicalCount: historicalVals.length,
    };

    parameterStatus[param] = status;

    // Add to anomalies if out of range or statistical anomaly
    if (rangeStatus !== 'normal' || isStatisticalAnomaly) {
      anomalies.push({
        parameter: param,
        label: optRange.label,
        severity: isStatisticalAnomaly && rangeStatus !== 'normal' ? 'critical' : 'warning',
        message: rangeNote || `${optRange.label}: Статистичка аномалија (Z=${Math.round(zScoreVal * 10) / 10})`,
        currentValue: currentVal,
        unit: optRange.unit,
        zScore: zScoreVal,
        rangeStatus,
      });
    }
  }

  return {
    anomalies,
    parameterStatus,
    hasAnomalies: anomalies.length > 0,
    criticalCount: anomalies.filter(a => a.severity === 'critical').length,
    warningCount: anomalies.filter(a => a.severity === 'warning').length,
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = {
  OPTIMAL_RANGES,
  analyzeWaterParameters,
};
