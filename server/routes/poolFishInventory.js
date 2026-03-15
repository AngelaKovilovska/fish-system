const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/pool-fish-inventory - get current fish count per pool
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT pool_number, current_count, updated_at FROM pool_fish_inventory ORDER BY pool_number'
    );
    res.json({ inventory: result.rows });
  } catch (err) {
    console.error('Get pool fish inventory error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
