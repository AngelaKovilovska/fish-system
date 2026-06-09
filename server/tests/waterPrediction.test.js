/**
 * ═══════════════════════════════════════════════════════════════
 * CLARIO — Water Prediction Model Verification Tests
 * ═══════════════════════════════════════════════════════════════
 *
 * Верификација на сите 5 компоненти од моделот за предвидување
 * на квалитетот на водата, со познати вредности од научна литература.
 */

// ── Extract functions for testing ──
// We need to access internal functions, so we'll re-implement the test
// against the actual module. Since the module only exports analyzeWaterPrediction
// and calculateNH3, we'll test calculateNH3 directly and test the rest
// by extracting them.

const fs = require('fs');
const path = require('path');

// Load the source and extract internal functions via eval
const source = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'waterPrediction.js'),
  'utf-8'
);

// Extract functions by wrapping in a module-like scope
const extractedModule = {};
const wrappedSource = `
  (function(exports) {
    ${source.replace('module.exports = { analyzeWaterPrediction, calculateNH3 };', `
      exports.calculateNH3 = calculateNH3;
      exports.calcStats = calcStats;
      exports.detectSpike = detectSpike;
      exports.linearRegression = linearRegression;
      exports.predictThresholdCrossing = predictThresholdCrossing;
      exports.evaluateCausalChains = evaluateCausalChains;
      exports.generateRecommendations = generateRecommendations;
      exports.NH3_SAFE_LIMIT = NH3_SAFE_LIMIT;
      exports.NH3_WARNING_LIMIT = NH3_WARNING_LIMIT;
    `)}
  })(extractedModule);
`;
eval(wrappedSource);

const {
  calculateNH3,
  calcStats,
  detectSpike,
  linearRegression,
  predictThresholdCrossing,
  evaluateCausalChains,
  generateRecommendations,
  NH3_SAFE_LIMIT,
  NH3_WARNING_LIMIT,
} = extractedModule;

// ── Test helpers ──
let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, detail = '') {
  totalTests++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    const msg = `  ❌ ${testName}${detail ? ' — ' + detail : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

function assertApprox(actual, expected, tolerance, testName) {
  const diff = Math.abs(actual - expected);
  assert(
    diff <= tolerance,
    testName,
    diff > tolerance ? `очекувано ${expected}, добиено ${actual} (разлика: ${diff.toFixed(6)})` : ''
  );
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ══════════════════════════════════════════════════════════════
// ТЕСТ 1: NH₃ Калкулатор (Emerson et al., 1975)
// ══════════════════════════════════════════════════════════════
section('КОМПОНЕНТА 1: NH₃ Калкулатор');

console.log('\n  --- Верификација на pKa формула ---');
// pKa = 0.09018 + 2729.92 / (T + 273.15)
// При 25°C: pKa = 0.09018 + 2729.92/298.15 = 0.09018 + 9.1563 = 9.2465
{
  const r = calculateNH3(1.0, 7.0, 25);
  assertApprox(r.pKa, 9.246, 0.001, 'pKa при 25°C ≈ 9.246');
}
{
  const r = calculateNH3(1.0, 7.0, 20);
  // pKa при 20°C = 0.09018 + 2729.92/293.15 = 9.403
  assertApprox(r.pKa, 9.403, 0.001, 'pKa при 20°C ≈ 9.403');
}
{
  const r = calculateNH3(1.0, 7.0, 30);
  // pKa при 30°C = 0.09018 + 2729.92/303.15 = 9.095
  assertApprox(r.pKa, 9.095, 0.002, 'pKa при 30°C ≈ 9.095');
}

console.log('\n  --- Верификација на NH₃ фракција ---');
// Fraction = 1 / (10^(pKa - pH) + 1)
// Познати вредности од Emerson et al. (1975) табела:
// pH 7.0, 25°C → ~0.56% NH₃
{
  const r = calculateNH3(1.0, 7.0, 25);
  assertApprox(r.fraction * 100, 0.56, 0.05, 'pH 7.0, 25°C → ~0.56% NH₃');
}
// pH 8.0, 25°C → ~5.38% NH₃
{
  const r = calculateNH3(1.0, 8.0, 25);
  assertApprox(r.fraction * 100, 5.38, 0.3, 'pH 8.0, 25°C → ~5.38% NH₃');
}
// pH 7.0, 20°C → ~0.40% NH₃
{
  const r = calculateNH3(1.0, 7.0, 20);
  assertApprox(r.fraction * 100, 0.40, 0.05, 'pH 7.0, 20°C → ~0.40% NH₃');
}
// pH 9.0, 25°C → ~36% NH₃
{
  const r = calculateNH3(1.0, 9.0, 25);
  assertApprox(r.fraction * 100, 36.2, 2.0, 'pH 9.0, 25°C → ~36% NH₃');
}
// pH 8.0, 30°C → ~7.43% NH₃ (Emerson original; Thurston 1979 gives ~8.3% with ionic strength)
{
  const r = calculateNH3(1.0, 8.0, 30);
  assertApprox(r.fraction * 100, 7.43, 0.1, 'pH 8.0, 30°C → ~7.43% NH₃ (Emerson 1975)');
}

console.log('\n  --- NH₃ концентрација ---');
// Ако TAN = 2.0 mg/L, pH 7.5, 28°C
{
  const r = calculateNH3(2.0, 7.5, 28);
  // pKa ≈ 9.158, fraction ≈ 1/(10^1.658 + 1) ≈ 0.0215
  // NH₃ ≈ 2.0 * 0.0215 ≈ 0.043
  assert(r.nh3 > 0.03 && r.nh3 < 0.06, `TAN=2.0, pH=7.5, 28°C → NH₃=${r.nh3} (очекувано ~0.04)`);
}

console.log('\n  --- Edge cases ---');
{
  const r = calculateNH3(0, 7.0, 25);
  assert(r.nh3 === 0, 'TAN=0 → NH₃=0');
}
{
  const r = calculateNH3(null, 7.0, 25);
  assert(r.nh3 === 0, 'TAN=null → NH₃=0');
}
{
  const r = calculateNH3(-1, 7.0, 25);
  assert(r.nh3 === 0, 'TAN=-1 → NH₃=0');
}
{
  const r = calculateNH3(1.0, null, 25);
  assert(r.nh3 === 0, 'pH=null → NH₃=0');
}

// ══════════════════════════════════════════════════════════════
// ТЕСТ 2: Z-Score и статистика
// ══════════════════════════════════════════════════════════════
section('КОМПОНЕНТА 2: Z-Score детекција');

console.log('\n  --- calcStats() ---');
{
  const s = calcStats([2, 4, 6, 8, 10]);
  assertApprox(s.mean, 6.0, 0.001, 'Mean of [2,4,6,8,10] = 6.0');
  // Variance = ((16+4+0+4+16)/5) = 8, StdDev = sqrt(8) ≈ 2.828
  assertApprox(s.stdDev, 2.828, 0.001, 'StdDev of [2,4,6,8,10] ≈ 2.828');
  assertApprox(s.median, 6.0, 0.001, 'Median of [2,4,6,8,10] = 6.0');
}
{
  const s = calcStats([1, 3, 5, 7]);
  assertApprox(s.mean, 4.0, 0.001, 'Mean of [1,3,5,7] = 4.0');
  assertApprox(s.median, 4.0, 0.001, 'Median of [1,3,5,7] = 4.0 (парен број елементи)');
}
{
  const s = calcStats([5, 5, 5, 5]);
  assertApprox(s.stdDev, 0, 0.001, 'StdDev of [5,5,5,5] = 0');
}
{
  const s = calcStats([]);
  assert(s.mean === 0, 'Empty array → mean=0');
}

console.log('\n  --- detectSpike() ---');
{
  // Стабилни вредности: 7.0 ± мало, па нагло 10.0
  const history = [7.0, 7.1, 6.9, 7.0, 7.1, 6.9, 7.0];
  const spike = detectSpike(10.0, history);
  assert(spike !== null, 'Нагла промена 7→10 детектирана');
  assert(spike.severity === 'critical', `Severity=${spike.severity} (очекувано critical, z=${spike.zScore})`);
  assert(spike.direction === 'high', 'Direction=high');
}
{
  const history = [7.0, 7.1, 6.9, 7.0, 7.1, 6.9, 7.0];
  const spike = detectSpike(7.05, history);
  assert(spike === null, 'Нормална вредност 7.05 → нема spike');
}
{
  const history = [7.0, 7.1, 6.9, 7.0, 7.1, 6.9, 7.0];
  const spike = detectSpike(4.0, history);
  assert(spike !== null, 'Нагла промена 7→4 детектирана (low)');
  assert(spike.direction === 'low', 'Direction=low');
}
{
  // Помалку од 7 readings → null
  const history = [7.0, 7.1, 6.9];
  const spike = detectSpike(10.0, history);
  assert(spike === null, 'Помалку од 7 readings → нема spike анализа');
}
{
  // StdDev = 0 → null (сите исти)
  const history = [7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0];
  const spike = detectSpike(7.5, history);
  assert(spike === null, 'StdDev=0 → нема spike (делење со 0)');
}

// ══════════════════════════════════════════════════════════════
// ТЕСТ 3: Линеарна регресија и Threshold Crossing
// ══════════════════════════════════════════════════════════════
section('КОМПОНЕНТА 3: Тренд предвидувач');

console.log('\n  --- linearRegression() ---');
{
  // Перфектна линија: y = 2x + 1 → slope=2, intercept=1, R²=1
  const r = linearRegression([1, 3, 5, 7, 9]);
  assertApprox(r.slope, 2.0, 0.001, 'Slope на [1,3,5,7,9] = 2.0');
  assertApprox(r.intercept, 1.0, 0.001, 'Intercept = 1.0');
  assertApprox(r.r2, 1.0, 0.01, 'R² = 1.0 (перфектна линија)');
}
{
  // Константна линија: slope=0
  const r = linearRegression([5, 5, 5, 5, 5]);
  assertApprox(r.slope, 0, 0.001, 'Slope на [5,5,5,5,5] = 0');
}
{
  // Опаѓачка линија: y = -1x + 10 → slope=-1
  const r = linearRegression([10, 9, 8, 7, 6]);
  assertApprox(r.slope, -1.0, 0.001, 'Slope на [10,9,8,7,6] = -1.0');
  assertApprox(r.r2, 1.0, 0.01, 'R² = 1.0');
}
{
  // Шумна линија — R² < 1
  const r = linearRegression([1, 4, 2, 5, 3, 6, 4]);
  assert(r.r2 < 1.0, `Шумна линија R²=${r.r2} < 1.0`);
  assert(r.slope > 0, `Шумна растечка линија slope=${r.slope} > 0`);
}
{
  // Еден елемент
  const r = linearRegression([5]);
  assertApprox(r.slope, 0, 0.001, 'Еден елемент → slope=0');
}

console.log('\n  --- predictThresholdCrossing() ---');
{
  // Вредност расте, max=10, сега=7, slope=1 → за 3 дена
  const r = predictThresholdCrossing(7, 1, { min: 0, max: 10 });
  assert(r.daysUntil === 3, `7 + 1/ден → max 10 за ${r.daysUntil} дена (очекувано 3)`);
  assert(r.direction === 'high', 'Direction=high');
}
{
  // Вредност паѓа, min=5, сега=8, slope=-0.5 → за 6 дена
  const r = predictThresholdCrossing(8, -0.5, { min: 5, max: null });
  assert(r.daysUntil === 6, `8 - 0.5/ден → min 5 за ${r.daysUntil} дена (очекувано 6)`);
  assert(r.direction === 'low', 'Direction=low');
}
{
  // Веќе надвор од нормата
  const r = predictThresholdCrossing(12, 1, { min: 0, max: 10 });
  assert(r.daysUntil === 0, 'Веќе надвор од нормата → daysUntil=0');
  assert(r.alreadyExceeded === true, 'alreadyExceeded=true');
}
{
  // slope=0 → null
  const r = predictThresholdCrossing(7, 0, { min: 0, max: 10 });
  assert(r.daysUntil === null, 'slope=0 → daysUntil=null');
}
{
  // Растечки но далеку од границата (>30 дена)
  const r = predictThresholdCrossing(7, 0.05, { min: 0, max: 10 });
  // (10-7)/0.05 = 60 дена > 30 → null
  assert(r.daysUntil === null, '60 дена до max → null (ограничување на 30 дена)');
}
{
  // Нема норми
  const r = predictThresholdCrossing(7, 1, null);
  assert(r.daysUntil === null, 'Нема норми → null');
}

// ══════════════════════════════════════════════════════════════
// ТЕСТ 4: Каузални ланци
// ══════════════════════════════════════════════════════════════
section('КОМПОНЕНТА 4: Каузални ланци');

console.log('\n  --- Ланец 1: pH drop → nitrite risk ---');
{
  const current = { ph: 6.3, temperature: 28, ammonium: 0.5, nitrites: 0.2, nitrates: 50, total_alkalinity: 80 };
  const trends = { ph: { slope: -0.05 } };
  const chains = evaluateCausalChains(current, trends, null, null);
  const found = chains.find(c => c.id === 'ph_drop_nitrite_rise');
  assert(found !== null, 'pH=6.3, slope=-0.05 → ланец активиран');
  assert(found.severity === 'critical', `Severity=${found.severity} (pH < 6.5 → critical)`);
}
{
  const current = { ph: 7.5, temperature: 28, ammonium: 0.5, nitrites: 0.2, nitrates: 50, total_alkalinity: 150 };
  const trends = { ph: { slope: 0.01 } };
  const chains = evaluateCausalChains(current, trends, null, null);
  const found = chains.find(c => c.id === 'ph_drop_nitrite_rise');
  assert(!found, 'pH=7.5, slope=+0.01 → ланец НЕ е активиран');
}

console.log('\n  --- Ланец 2: NH₃ toxicity ---');
{
  const nh3Result = { nh3: 0.08, fraction: 0.04 };
  const current = { ph: 8.0, temperature: 30, ammonium: 2.0, nitrites: 0, nitrates: 50, total_alkalinity: 150 };
  const chains = evaluateCausalChains(current, {}, nh3Result, null);
  const found = chains.find(c => c.id === 'nh3_toxicity');
  assert(found !== null, 'NH₃=0.08 > 0.05 → ланец активиран');
  assert(found.severity === 'critical', 'NH₃ > SAFE_LIMIT → critical');
}
{
  const nh3Result = { nh3: 0.01, fraction: 0.005 };
  const current = { ph: 7.0, temperature: 25, ammonium: 1.0 };
  const chains = evaluateCausalChains(current, {}, nh3Result, null);
  const found = chains.find(c => c.id === 'nh3_toxicity');
  assert(!found, 'NH₃=0.01 < WARNING_LIMIT → ланец НЕ е активиран');
}

console.log('\n  --- Ланец 3: Overfeeding cascade ---');
{
  const feedingData = { feedVsRecommended: 1.6 };
  const current = { ph: 7.5, temperature: 28, ammonium: 0.5 };
  const chains = evaluateCausalChains(current, {}, null, feedingData);
  const found = chains.find(c => c.id === 'overfeeding_cascade');
  assert(found !== null, 'feedVsRecommended=1.6 → ланец активиран');
  assert(found.severity === 'critical', '1.6 > 1.5 → critical');
}
{
  const feedingData = { feedVsRecommended: 1.3 };
  const current = { ph: 7.5, temperature: 28 };
  const chains = evaluateCausalChains(current, {}, null, feedingData);
  const found = chains.find(c => c.id === 'overfeeding_cascade');
  assert(found !== null, 'feedVsRecommended=1.3 → ланец активиран');
  assert(found.severity === 'warning', '1.3 (>1.2, <1.5) → warning');
}
{
  const feedingData = { feedVsRecommended: 0.9 };
  const current = { ph: 7.5, temperature: 28 };
  const chains = evaluateCausalChains(current, {}, null, feedingData);
  const found = chains.find(c => c.id === 'overfeeding_cascade');
  assert(!found, 'feedVsRecommended=0.9 → НЕ е активиран');
}

console.log('\n  --- Ланец 4: Temperature low ---');
{
  const current = { temperature: 16, ph: 7.5 };
  const chains = evaluateCausalChains(current, {}, null, null);
  const found = chains.find(c => c.id === 'temp_drop_growth');
  assert(found !== null, 'temp=16 → ланец активиран');
  assert(found.severity === 'critical', 'temp < 18 → critical');
}
{
  const current = { temperature: 22, ph: 7.5 };
  const chains = evaluateCausalChains(current, {}, null, null);
  const found = chains.find(c => c.id === 'temp_drop_growth');
  assert(found !== null, 'temp=22 → ланец активиран');
  assert(found.severity === 'warning', 'temp 22 (< 24, >= 18) → warning');
}
{
  const current = { temperature: 28, ph: 7.5 };
  const chains = evaluateCausalChains(current, {}, null, null);
  const found = chains.find(c => c.id === 'temp_drop_growth');
  assert(!found, 'temp=28 (оптимум) → НЕ е активиран');
}

console.log('\n  --- Ланец 5: Temperature high ---');
{
  const current = { temperature: 34, ph: 7.5 };
  const chains = evaluateCausalChains(current, {}, null, null);
  const found = chains.find(c => c.id === 'temp_too_high');
  assert(found !== null, 'temp=34 → ланец активиран');
  assert(found.severity === 'critical', 'temp > 33 → critical');
}

console.log('\n  --- Ланец 6: Nitrate accumulation ---');
{
  const current = { nitrates: 160, ph: 7.5, temperature: 28 };
  const trends = { nitrates: { slope: 5.0 } };
  const chains = evaluateCausalChains(current, trends, null, null);
  const found = chains.find(c => c.id === 'nitrate_accumulation');
  assert(found !== null, 'NO₃=160, slope=+5 → ланец активиран');
  assert(found.severity === 'critical', 'NO₃ > 150 → critical');
}
{
  const current = { nitrates: 80, ph: 7.5, temperature: 28 };
  const trends = { nitrates: { slope: 2.0 } };
  const chains = evaluateCausalChains(current, trends, null, null);
  const found = chains.find(c => c.id === 'nitrate_accumulation');
  assert(!found, 'NO₃=80 < 100 → НЕ е активиран');
}

console.log('\n  --- Ланец 7: Low alkalinity + pH drop ---');
{
  const current = { total_alkalinity: 40, ph: 7.0, temperature: 28 };
  const trends = { ph: { slope: -0.03 } };
  const chains = evaluateCausalChains(current, trends, null, null);
  const found = chains.find(c => c.id === 'low_alkalinity_ph_drop');
  assert(found !== null, 'Alk=40, pH slope=-0.03 → ланец активиран');
  assert(found.severity === 'critical', 'Alk < 50 → critical');
}

// ══════════════════════════════════════════════════════════════
// ТЕСТ 5: Препораки (generateRecommendations)
// ══════════════════════════════════════════════════════════════
section('КОМПОНЕНТА 5: Препораки');

// Helper: create minimal inputs
function makeRec(currentOverrides = {}, trendOverrides = {}, nh3 = null, feedData = null) {
  const current = {
    ph: 7.5, temperature: 28, total_alkalinity: 150,
    hardness: 100, nitrates: 30, nitrites: 0.1,
    total_chlorine: 0, ammonium: 0.3,
    ...currentOverrides,
  };
  const trends = { ...trendOverrides };
  return generateRecommendations(current, trends, nh3, [], [], [], {}, feedData);
}

console.log('\n  --- Правило 1: pH < 6.5 ---');
{
  const recs = makeRec({ ph: 6.3 });
  const found = recs.find(r => r.urgency === 'critical' && r.title.includes('pH'));
  assert(found !== null, 'pH=6.3 → критична препорака');
  assert(found.steps.length >= 3, `Има ${found.steps.length} чекори (очекувано ≥3)`);
}
{
  const recs = makeRec({ ph: 7.5 });
  const found = recs.find(r => r.title.includes('pH е критично'));
  assert(!found, 'pH=7.5 → НЕМА критична pH препорака');
}

console.log('\n  --- Правило 2: pH тренд паѓа ---');
{
  const recs = makeRec({ ph: 7.0 }, { ph: { slope: -0.08 } });
  const found = recs.find(r => r.title.includes('pH полека паѓа'));
  assert(found !== null, 'pH=7.0, slope=-0.08 → препорака за тренд');
}
{
  // pH < 6.5 → правило 1 е поважно, правило 2 треба да се активира
  // бидејќи условот е ph >= 6.5
  const recs = makeRec({ ph: 6.3 }, { ph: { slope: -0.08 } });
  const found = recs.find(r => r.title.includes('pH полека паѓа'));
  assert(!found, 'pH=6.3 < 6.5 → правило 2 НЕ се активира (правило 1 е активно)');
}

console.log('\n  --- Правило 3: NH₄ > 2.0 (ИТНО) ---');
{
  const recs = makeRec({ ammonium: 2.5 });
  const found = recs.find(r => r.urgency === 'critical' && r.title.includes('Амонијак'));
  assert(found !== null, 'NH₄=2.5 → критична препорака');
  assert(found.summary.includes('Стоп хранење'), 'Summary вклучува "Стоп хранење"');
}

console.log('\n  --- Правило 4: NH₄ > 1.0 (превентивно) ---');
{
  const recs = makeRec({ ammonium: 1.5 });
  const found = recs.find(r => r.urgency === 'high' && r.title.includes('Амонијак'));
  assert(found !== null, 'NH₄=1.5 → high urgency препорака');
}
{
  const recs = makeRec({ ammonium: 0.5 });
  const found = recs.find(r => r.title.includes('Амонијак'));
  assert(!found, 'NH₄=0.5 → НЕМА амонијак препорака');
}

console.log('\n  --- Правило 5: NH₃ токсичност ---');
{
  const nh3 = { nh3: 0.08, fraction: 0.04 };
  const recs = makeRec({ ph: 8.0 }, {}, nh3);
  const found = recs.find(r => r.title.includes('Токсичен амонијак'));
  assert(found !== null, 'NH₃=0.08 > 0.05 → препорака');
}
{
  const nh3 = { nh3: 0.01, fraction: 0.005 };
  const recs = makeRec({}, {}, nh3);
  const found = recs.find(r => r.title.includes('Токсичен амонијак'));
  assert(!found, 'NH₃=0.01 < 0.05 → НЕМА препорака');
}

console.log('\n  --- Правило 6: Нитрити > 0.5 ---');
{
  const recs = makeRec({ nitrites: 0.8 });
  const found = recs.find(r => r.title.includes('Нитрити'));
  assert(found !== null, 'NO₂=0.8 → препорака');
  assert(found.urgency === 'high', 'NO₂=0.8 (>0.5, ≤1.0) → high');
  // Проверка на формула за сол: targetCl = 0.8 * 6 = 4.8, salt = 4.8/0.6 = 8g per 1000L
  assert(found.summary.includes('8'), `Summary вклучува дозировка: "${found.summary}"`);
}
{
  const recs = makeRec({ nitrites: 1.5 });
  const found = recs.find(r => r.title.includes('Нитрити'));
  assert(found.urgency === 'critical', 'NO₂=1.5 > 1.0 → critical');
}
{
  const recs = makeRec({ nitrites: 0.3 });
  const found = recs.find(r => r.title.includes('Нитрити'));
  assert(!found, 'NO₂=0.3 < 0.5 → НЕМА препорака');
}

console.log('\n  --- Правило 7: Нитрати > 150 ---');
{
  const recs = makeRec({ nitrates: 200 });
  const found = recs.find(r => r.title.includes('Нитрати'));
  assert(found !== null, 'NO₃=200 → препорака');
}
{
  const recs = makeRec({ nitrates: 500 });
  const found = recs.find(r => r.title.includes('Нитрати'));
  assert(found.urgency === 'high', 'NO₃=500 > 400 → high');
}

console.log('\n  --- Правило 8: Температура < 24 ---');
{
  const recs = makeRec({ temperature: 15 });
  const found = recs.find(r => r.title.includes('ладна'));
  assert(found !== null, 'temp=15 → препорака');
  assert(found.urgency === 'critical', 'temp < 18 → critical');
}
{
  const recs = makeRec({ temperature: 22 });
  const found = recs.find(r => r.title.includes('ладна'));
  assert(found !== null, 'temp=22 → препорака');
  assert(found.urgency === 'medium', 'temp 22 (≥18, <24) → medium');
}
{
  const recs = makeRec({ temperature: 28 });
  const found = recs.find(r => r.title.includes('ладна'));
  assert(!found, 'temp=28 → НЕМА препорака');
}

console.log('\n  --- Правило 9: Температура > 32 ---');
{
  const recs = makeRec({ temperature: 34 });
  const found = recs.find(r => r.title.includes('претопла'));
  assert(found !== null, 'temp=34 → препорака');
  assert(found.urgency === 'critical', 'temp > 33 → critical');
}
{
  const recs = makeRec({ temperature: 32.5 });
  const found = recs.find(r => r.title.includes('претопла'));
  assert(found !== null, 'temp=32.5 → препорака');
  assert(found.urgency === 'high', 'temp 32.5 (>32, ≤33) → high');
}

console.log('\n  --- Правило 10: Преголемо хранење ---');
{
  const recs = makeRec({}, {}, null, { feedVsRecommended: 1.6 });
  const found = recs.find(r => r.title.includes('Хранење'));
  assert(found !== null, 'feed 160% → препорака');
  assert(found.urgency === 'high', 'feed > 1.5 → high');
}

console.log('\n  --- Правило 11: Алкалитет < 80 ---');
{
  const recs = makeRec({ total_alkalinity: 60 });
  const found = recs.find(r => r.title.includes('алкалитет'));
  assert(found !== null, 'alk=60 → препорака');
  // Дозировка: (100-60) * 1.68 = 67.2 → 67g
  assert(found.summary.includes('67'), `Summary вклучува дозировка: "${found.summary}"`);
}

console.log('\n  --- Правило 12: Тврдост > 300 ---');
{
  const recs = makeRec({ hardness: 350 });
  const found = recs.find(r => r.title.includes('Тврдост'));
  assert(found !== null, 'hardness=350 → препорака');
  assert(found.urgency === 'medium', 'hardness 350 (>300, ≤450) → medium');
}
{
  const recs = makeRec({ hardness: 500 });
  const found = recs.find(r => r.title.includes('Тврдост'));
  assert(found.urgency === 'high', 'hardness 500 > 450 → high');
}

// ══════════════════════════════════════════════════════════════
// ТЕСТ 6: Edge Cases и Stress Test
// ══════════════════════════════════════════════════════════════
section('EDGE CASES И STRESS TEST');

console.log('\n  --- Сите параметри нормални → 0 препораки ---');
{
  const recs = makeRec({
    ph: 7.5, temperature: 28, total_alkalinity: 150,
    hardness: 100, nitrates: 30, nitrites: 0.1,
    ammonium: 0.3,
  });
  assert(recs.length === 0, `Нормални вредности → ${recs.length} препораки (очекувано 0)`);
}

console.log('\n  --- Null вредности → нема crash ---');
{
  const recs = makeRec({
    ph: null, temperature: null, total_alkalinity: null,
    hardness: null, nitrates: null, nitrites: null,
    ammonium: null,
  });
  assert(Array.isArray(recs), 'Null вредности → враќа array без crash');
  assert(recs.length === 0, `Null вредности → ${recs.length} препораки (очекувано 0)`);
}

console.log('\n  --- Екстремни вредности ---');
{
  const recs = makeRec({ ph: 4.0, temperature: 5, ammonium: 10, nitrites: 5, nitrates: 1000, total_alkalinity: 10, hardness: 600 });
  assert(recs.length > 0, `Екстремни вредности → ${recs.length} препораки`);
  // Треба да има повеќе критични
  const criticalCount = recs.filter(r => r.urgency === 'critical').length;
  assert(criticalCount >= 2, `${criticalCount} критични препораки (очекувано ≥2)`);
}

console.log('\n  --- Сортирање по итност ---');
{
  const recs = makeRec({ ph: 6.0, ammonium: 3.0, nitrites: 2.0, temperature: 15, total_alkalinity: 30, hardness: 500 });
  if (recs.length >= 2) {
    const urgencyOrder = { critical: 0, high: 1, medium: 2, info: 3 };
    let sorted = true;
    for (let i = 1; i < recs.length; i++) {
      if ((urgencyOrder[recs[i].urgency] || 9) < (urgencyOrder[recs[i - 1].urgency] || 9)) {
        sorted = false;
        break;
      }
    }
    assert(sorted, 'Препораките се сортирани по итност (critical → high → medium)');
  }
}

console.log('\n  --- Калкулатор: NH₃ при типичен RAS сценарио ---');
{
  // Типичен RAS: pH 7.2, temp 28°C, TAN 0.5 mg/L
  const r = calculateNH3(0.5, 7.2, 28);
  // pKa ≈ 9.158, fraction ≈ 1/(10^1.958 + 1) ≈ 0.011
  // NH₃ ≈ 0.5 * 0.011 ≈ 0.0055
  assert(r.nh3 < NH3_WARNING_LIMIT, `Типичен RAS: NH₃=${r.nh3} < ${NH3_WARNING_LIMIT} (безбедно)`);
}
{
  // Ризичен сценарио: pH 8.5, temp 30°C, TAN 2.0 mg/L
  const r = calculateNH3(2.0, 8.5, 30);
  assert(r.nh3 > NH3_SAFE_LIMIT, `Ризичен: NH₃=${r.nh3} > ${NH3_SAFE_LIMIT} (ОПАСНО)`);
}

// ══════════════════════════════════════════════════════════════
// РЕЗУЛТАТИ
// ══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`  РЕЗУЛТАТИ: ${passed}/${totalTests} тестови поминале`);
if (failed > 0) {
  console.log(`  ❌ ${failed} тестови паднале:`);
  failures.forEach(f => console.log(f));
}
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);
