// ── Input validation helpers ──

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= 254;
}

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function isNumericOrNull(val) {
  if (val == null || val === '') return true;
  return !isNaN(Number(val));
}

function sanitizeString(str, maxLength = 500) {
  if (str == null) return null;
  return String(str).trim().slice(0, maxLength);
}

// Middleware factory: validate required date range in req.body
function requireDateRange(req, res, next) {
  const { from, to } = req.body;
  if (!from || !isValidDate(from)) {
    return res.status(400).json({ error: 'Невалиден формат за датум (од)' });
  }
  if (!to || !isValidDate(to)) {
    return res.status(400).json({ error: 'Невалиден формат за датум (до)' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'Почетниот датум мора да биде пред крајниот' });
  }
  next();
}

// Validate record date in body
function validateRecordBody(req, res, next) {
  const { date } = req.body;
  if (!date || !isValidDate(date)) {
    return res.status(400).json({ error: 'Невалиден формат за датум' });
  }

  // Validate water_control numeric fields if present
  const wc = req.body.water_control;
  if (wc) {
    const numericFields = ['temperature', 'ph', 'dissolved_oxygen', 'nitrates', 'nitrites', 'hardness', 'tds'];
    for (const field of numericFields) {
      if (wc[field] != null && wc[field] !== '' && isNaN(Number(wc[field]))) {
        return res.status(400).json({ error: `Невалидна вредност за ${field}` });
      }
    }
  }

  // Validate pool_feeding numeric fields if present
  const pf = req.body.pool_feeding;
  if (pf && Array.isArray(pf)) {
    for (const pool of pf) {
      const pfNumeric = ['pool_number', 'fish_count', 'avg_weight_gr', 'sold_count', 'dead_count', 'food_quantity_gr'];
      for (const field of pfNumeric) {
        if (!isNumericOrNull(pool[field])) {
          return res.status(400).json({ error: `Невалидна вредност за ${field} во хранење` });
        }
      }
    }
  }

  next();
}

module.exports = {
  isValidEmail,
  isValidDate,
  isNumericOrNull,
  sanitizeString,
  requireDateRange,
  validateRecordBody,
};
