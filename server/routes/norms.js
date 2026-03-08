const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();

// GET /api/norms - list all norms
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM parameter_norms ORDER BY id');
    res.json({ norms: result.rows });
  } catch (err) {
    console.error('List norms error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/norms/:id - update norm (admin only)
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { min_value, max_value } = req.body;

    const result = await pool.query(
      'UPDATE parameter_norms SET min_value = $1, max_value = $2, updated_by = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
      [min_value, max_value, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Нормата не е пронајдена' });
    }

    res.json({ norm: result.rows[0] });
  } catch (err) {
    console.error('Update norm error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
