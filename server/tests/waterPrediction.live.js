/**
 * Live test — повикај го water-prediction моделот со реални податоци од базата
 *
 * Употреба:
 *   node server/tests/waterPrediction.live.js
 *
 * Потребно: DATABASE_URL во server/.env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { analyzeWaterPrediction } = require('../services/waterPrediction');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runLiveTest() {
  console.log('═'.repeat(60));
  console.log('  CLARIO — Live Water Prediction Test');
  console.log('═'.repeat(60));

  try {
    // 1. Проверка на конекција
    const dbCheck = await pool.query('SELECT NOW() as time, current_database() as db');
    console.log(`\n  📡 Конектиран на: ${dbCheck.rows[0].db}`);
    console.log(`  🕐 Серверско време: ${dbCheck.rows[0].time}`);

    // 2. Колку податоци имаме?
    const countRes = await pool.query(`
      SELECT COUNT(*) as total,
             MIN(dr.date) as first_date,
             MAX(dr.date) as last_date
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
    `);
    const { total, first_date, last_date } = countRes.rows[0];
    console.log(`  📊 Вкупно записи: ${total} (${first_date} — ${last_date})\n`);

    if (parseInt(total) === 0) {
      console.log('  ⚠️  Нема податоци за водата. Внесете барем 5-7 дневни чеклисти.');
      process.exit(0);
    }

    // 3. Покажи последните вредности
    const latestRes = await pool.query(`
      SELECT wc.temperature, wc.ph, wc.total_alkalinity, wc.hardness,
             wc.nitrates, wc.nitrites, wc.total_chlorine, wc.ammonium,
             dr.date
      FROM water_control wc
      JOIN daily_records dr ON wc.daily_record_id = dr.id
      ORDER BY dr.date DESC LIMIT 1
    `);
    const latest = latestRes.rows[0];
    console.log('  📋 Последни мерења:');
    console.log(`     Датум:       ${latest.date}`);
    console.log(`     Температура: ${latest.temperature ?? 'N/A'}°C`);
    console.log(`     pH:          ${latest.ph ?? 'N/A'}`);
    console.log(`     Алкалитет:   ${latest.total_alkalinity ?? 'N/A'} mg/L`);
    console.log(`     Тврдост:     ${latest.hardness ?? 'N/A'} mg/L`);
    console.log(`     Нитрати:     ${latest.nitrates ?? 'N/A'} mg/L`);
    console.log(`     Нитрити:     ${latest.nitrites ?? 'N/A'} mg/L`);
    console.log(`     Хлор:        ${latest.total_chlorine ?? 'N/A'} mg/L`);
    console.log(`     Амониум:     ${latest.ammonium ?? 'N/A'} mg/L`);

    // 4. Пушти го моделот
    console.log('\n' + '─'.repeat(60));
    console.log('  🧠 Резултат од моделот:');
    console.log('─'.repeat(60));

    const result = await analyzeWaterPrediction(pool);

    if (!result.hasData) {
      console.log(`  ⚠️  ${result.message}`);
      process.exit(0);
    }

    // Summary
    console.log(`\n  Анализирани параметри: ${result.summary.analyzedParameters}/${result.summary.totalParameters}`);
    console.log(`  Денови податоци:       ${result.summary.daysOfData}`);
    console.log(`  Стабилен систем:       ${result.isStable ? '✅ Да' : '⚠️ Не'}`);

    // NH₃
    if (result.nh3) {
      const status = result.nh3.isSafe ? '✅ Безбедно' : '🔴 ОПАСНО';
      console.log(`\n  🧪 NH₃ калкулатор:`);
      console.log(`     TAN=${result.nh3.tan} mg/L, pH=${result.nh3.ph}, T=${result.nh3.temperature}°C`);
      console.log(`     pKa=${result.nh3.pKa}, Фракција=${(result.nh3.fraction * 100).toFixed(3)}%`);
      console.log(`     NH₃=${result.nh3.nh3} mg/L (граница: ${result.nh3.safeLimit}) ${status}`);
    }

    // Warnings
    if (result.warnings.length > 0) {
      console.log(`\n  ⚠️  Предупредувања (${result.warnings.length}):`);
      result.warnings.forEach((w, i) => {
        const icon = w.severity === 'critical' ? '🔴' : '🟡';
        console.log(`     ${icon} ${w.message}`);
      });
    }

    // Causal chains
    if (result.causalChains.length > 0) {
      console.log(`\n  🔗 Каузални ланци (${result.causalChains.length}):`);
      result.causalChains.forEach(c => {
        const icon = c.severity === 'critical' ? '🔴' : '🟡';
        console.log(`     ${icon} ${c.title}`);
        console.log(`        ${c.message}`);
        console.log(`        Извор: ${c.source}`);
      });
    }

    // Recommendations
    if (result.recommendations.length > 0) {
      console.log(`\n  💡 Препораки (${result.recommendations.length}):`);
      result.recommendations.forEach((r, i) => {
        const icon = r.urgency === 'critical' ? '🔴' : r.urgency === 'high' ? '🟠' : '🔵';
        console.log(`\n     ${icon} [${r.urgency.toUpperCase()}] ${r.title}`);
        console.log(`        Резиме: ${r.summary}`);
        r.steps.forEach((s, j) => console.log(`        ${j + 1}. ${s}`));
        console.log(`        📚 ${r.source}`);
      });
    } else {
      console.log('\n  ✅ Нема препораки — сите параметри се во норма!');
    }

    // Trend analysis
    console.log(`\n  📈 Тренд анализа:`);
    for (const [param, data] of Object.entries(result.parameters)) {
      if (data.noData) continue;
      const trend = data.trend;
      if (!trend) {
        console.log(`     ${data.label}: ${data.currentValue}${data.unit} (нема доволно податоци за тренд)`);
        continue;
      }
      const arrow = trend.direction === 'rising' ? '↑' : trend.direction === 'falling' ? '↓' : '→';
      const sig = trend.isSignificant ? '' : ' (не е значаен)';
      let crossing = '';
      if (trend.crossing?.daysUntil != null && !trend.crossing.alreadyExceeded) {
        crossing = ` ⚠️ за ${trend.crossing.daysUntil} дена`;
      } else if (trend.crossing?.alreadyExceeded) {
        crossing = ' 🔴 НАДВОР ОД НОРМА';
      }
      console.log(`     ${data.label}: ${data.currentValue}${data.unit} ${arrow} slope=${trend.slope}/ден R²=${trend.r2}${sig}${crossing}`);
    }

    // Validation checks
    console.log('\n' + '─'.repeat(60));
    console.log('  🔍 Валидациски проверки:');
    console.log('─'.repeat(60));

    let issues = 0;

    // Check 1: NH₃ consistency
    if (result.nh3 && latest.ammonium && latest.ph && latest.temperature) {
      const manualNH3 = parseFloat(latest.ammonium) * result.nh3.fraction;
      const diff = Math.abs(manualNH3 - result.nh3.nh3);
      if (diff > 0.001) {
        console.log(`  ❌ NH₃ inconsistency: manual=${manualNH3.toFixed(4)}, model=${result.nh3.nh3}`);
        issues++;
      } else {
        console.log('  ✅ NH₃ пресметка е конзистентна');
      }
    }

    // Check 2: No contradictions in recommendations
    const hasStopFeeding = result.recommendations.some(r => r.summary?.includes('Стоп'));
    const hasIncreaseFeeding = result.recommendations.some(r => r.summary?.includes('Зголемете хранење'));
    if (hasStopFeeding && hasIncreaseFeeding) {
      console.log('  ❌ Контрадикција: и "стоп хранење" и "зголемете хранење"');
      issues++;
    } else {
      console.log('  ✅ Нема контрадикторни препораки');
    }

    // Check 3: Urgency ordering
    const urgencyOrder = { critical: 0, high: 1, medium: 2, info: 3 };
    let sortedOk = true;
    for (let i = 1; i < result.recommendations.length; i++) {
      if ((urgencyOrder[result.recommendations[i].urgency] || 9) < (urgencyOrder[result.recommendations[i - 1].urgency] || 9)) {
        sortedOk = false;
        break;
      }
    }
    if (sortedOk) {
      console.log('  ✅ Препораките се правилно сортирани по итност');
    } else {
      console.log('  ❌ Препораките НЕ се сортирани по итност');
      issues++;
    }

    // Check 4: All recommendations have required fields
    let fieldIssues = 0;
    result.recommendations.forEach((r, i) => {
      if (!r.urgency || !r.title || !r.summary || !r.steps || !r.source) {
        console.log(`  ❌ Препорака ${i + 1} нема задолжително поле`);
        fieldIssues++;
      }
      if (r.steps && r.steps.length === 0) {
        console.log(`  ❌ Препорака ${i + 1} нема чекори`);
        fieldIssues++;
      }
    });
    if (fieldIssues === 0) {
      console.log('  ✅ Сите препораки имаат комплетни полиња (urgency, title, summary, steps, source)');
    }
    issues += fieldIssues;

    // Check 5: Parameter values in expected ranges
    const ranges = {
      temperature: [0, 45],
      ph: [0, 14],
      total_alkalinity: [0, 1000],
      hardness: [0, 2000],
      nitrates: [0, 2000],
      nitrites: [0, 50],
      ammonium: [0, 50],
    };
    let rangeOk = true;
    for (const [param, [min, max]] of Object.entries(ranges)) {
      const val = result.parameters[param]?.currentValue;
      if (val !== null && val !== undefined && (val < min || val > max)) {
        console.log(`  ⚠️  ${param}=${val} е надвор од очекуван опсег [${min}-${max}]`);
        rangeOk = false;
      }
    }
    if (rangeOk) {
      console.log('  ✅ Сите параметри се во очекувани опсези');
    }

    console.log(`\n  Вкупно проблеми: ${issues}`);
    console.log('═'.repeat(60));

  } catch (err) {
    console.error('❌ Грешка:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

runLiveTest();
