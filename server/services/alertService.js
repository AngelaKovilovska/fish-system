const pool = require('../db/connection');

// Filtration fields that generate alarms when false (not OK)
const FILTRATION_ALARM_FIELDS = [
  'bio_filter_level',
  'mechanical_filter',
  'circulation_pump',
  'thermo_pump',
  'aeration',
  'sieve_filter',
];

// Fish visual fields that generate alarms when false (not OK)
const FISH_ALARM_FIELDS = [
  'normal_swimming',
  'no_injuries',
  'no_infection',
  'normal_appetite',
  'no_dead',
];

async function checkAndCreateAlerts(dailyRecordId, waterData, filtrationData, fishVisualData) {
  const normsResult = await pool.query('SELECT * FROM parameter_norms');
  const norms = {};
  for (const norm of normsResult.rows) {
    norms[norm.parameter_name] = norm;
  }

  const parameterMap = {
    temperature: waterData.temperature,
    ph: waterData.ph,
    total_alkalinity: waterData.total_alkalinity,
    nitrates: waterData.nitrates,
    nitrites: waterData.nitrites,
    hardness: waterData.hardness,
    total_chlorine: waterData.total_chlorine,
    ammonium: waterData.ammonium,
  };

  const alerts = [];

  // Water parameters - check against norms
  for (const [param, value] of Object.entries(parameterMap)) {
    if (value == null) continue;
    const norm = norms[param];
    if (!norm) continue;

    const numValue = parseFloat(value);
    let outOfRange = false;

    if (norm.min_value != null && numValue < parseFloat(norm.min_value)) {
      outOfRange = true;
    }
    if (norm.max_value != null && numValue > parseFloat(norm.max_value)) {
      outOfRange = true;
    }

    if (outOfRange) {
      const result = await pool.query(
        'INSERT INTO alerts (daily_record_id, parameter_name, value, min_norm, max_norm) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [dailyRecordId, param, numValue, norm.min_value, norm.max_value]
      );
      alerts.push(result.rows[0]);
    }
  }

  // Foam in bio filter - alarm if 'yes'
  if (filtrationData && filtrationData.bio_filter_foam === 'yes') {
    const result = await pool.query(
      'INSERT INTO alerts (daily_record_id, parameter_name, value, min_norm, max_norm) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [dailyRecordId, 'bio_filter_foam', 1, null, null]
    );
    alerts.push(result.rows[0]);
  }

  // Filtration fields - alarm if false (not OK)
  if (filtrationData) {
    for (const field of FILTRATION_ALARM_FIELDS) {
      if (filtrationData[field] === false) {
        const result = await pool.query(
          'INSERT INTO alerts (daily_record_id, parameter_name, value, min_norm, max_norm) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [dailyRecordId, field, 0, null, null]
        );
        alerts.push(result.rows[0]);
      }
    }
  }

  // Fish visual fields - alarm if false (not OK)
  if (fishVisualData) {
    for (const field of FISH_ALARM_FIELDS) {
      if (fishVisualData[field] === false) {
        const result = await pool.query(
          'INSERT INTO alerts (daily_record_id, parameter_name, value, min_norm, max_norm) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [dailyRecordId, field, 0, null, null]
        );
        alerts.push(result.rows[0]);
      }
    }
  }

  return alerts;
}

module.exports = { checkAndCreateAlerts };
