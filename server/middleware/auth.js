const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

// Кеш за активни корисници — се чисти на секои 60 секунди
// Ова ја намалува DB оптовареноста (1 query на 60s наместо на секое барање)
const activeUserCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

async function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Не сте најавени' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
  } catch (err) {
    return res.status(401).json({ error: 'Невалиден токен' });
  }

  try {

    // Провери дали корисникот сè уште постои во базата
    // (заштита: ако админот го избрише корисникот, токенот веднаш е невалиден)
    const userId = decoded.id;
    const now = Date.now();
    const cached = activeUserCache.get(userId);

    let role = cached?.role;
    let pwChangedAt = cached?.pwChangedAt || 0;
    if (!cached || (now - cached.checkedAt) > CACHE_TTL_MS) {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (result.rows.length === 0 || result.rows[0].is_active === false) {
        activeUserCache.delete(userId);
        res.clearCookie('token');
        return res.status(401).json({ error: 'Корисникот не постои' });
      }
      role = result.rows[0].role;
      pwChangedAt = result.rows[0].password_changed_at ? new Date(result.rows[0].password_changed_at).getTime() : 0;
      activeUserCache.set(userId, { checkedAt: now, role, pwChangedAt });
    }

    // Најава направена пред последната промена на лозинка повеќе не важи (5 s толеранција за заокружување)
    if (pwChangedAt && decoded.iat && decoded.iat * 1000 < pwChangedAt - 5000) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Лозинката е променета. Најавете се повторно.' });
    }

    // Улогата се зема од базата, не од токенот — промена на улога важи веднаш, без повторна најава
    req.user = { ...decoded, role: role || decoded.role };
  } catch (err) {
    // Грешка во базата не е „невалидна најава“ — корисникот не смее да биде одјавен поради неа
    console.error('Auth check error:', err.message);
    return res.status(503).json({ error: 'Серверот моментално не е достапен. Обидете се повторно.' });
  }
  next();
}

// По промена/бришење на корисник: заборави го кешираниот запис за промената да важи веднаш
authMiddleware.invalidateUser = (userId) => { activeUserCache.delete(parseInt(userId)); };

module.exports = authMiddleware;
