const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const { getPoolCounts } = require('../lib/poolFish');

const router = express.Router();

// GET /api/pool-fish-inventory - тековен број на риби по базен
// Пресметка во реално време: последно мерење − угинати − риби земени за преработка (види lib/poolFish.js)
router.get('/', authMiddleware, async (req, res) => {
  try {
    res.json({ inventory: await getPoolCounts(pool) });
  } catch (err) {
    console.error('Get pool fish inventory error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
