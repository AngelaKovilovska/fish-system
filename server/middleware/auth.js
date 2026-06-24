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

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    // Провери дали корисникот сè уште постои во базата
    // (заштита: ако админот го избрише корисникот, токенот веднаш е невалиден)
    const userId = decoded.id;
    const now = Date.now();
    const cached = activeUserCache.get(userId);

    if (!cached || (now - cached.checkedAt) > CACHE_TTL_MS) {
      const result = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (result.rows.length === 0) {
        activeUserCache.delete(userId);
        res.clearCookie('token');
        return res.status(401).json({ error: 'Корисникот не постои' });
      }
      activeUserCache.set(userId, { checkedAt: now });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Невалиден токен' });
  }
}

module.exports = authMiddleware;
