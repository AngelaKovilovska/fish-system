const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/alerts - list alerts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { from, to, acknowledged } = req.query;
    let query = `
      SELECT a.*, dr.date
      FROM alerts a
      JOIN daily_records dr ON a.daily_record_id = dr.id
    `;
    const params = [];
    const conditions = [];

    if (from) {
      params.push(from);
      conditions.push(`dr.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`dr.date <= $${params.length}`);
    }
    if (acknowledged !== undefined) {
      params.push(acknowledged === 'true');
      conditions.push(`a.acknowledged = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ alerts: result.rows });
  } catch (err) {
    console.error('List alerts error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/alerts/acknowledge-all — mark all unacknowledged alerts as read
// MUST be before /:id route so Express doesn't match "acknowledge-all" as :id
router.put('/acknowledge-all', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE alerts SET acknowledged = true WHERE acknowledged = false RETURNING id'
    );
    res.json({ acknowledged: result.rowCount });
  } catch (err) {
    console.error('Acknowledge all alerts error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/alerts/:id/acknowledge
router.put('/:id/acknowledge', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE alerts SET acknowledged = true WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Алармот не е пронајден' });
    }
    res.json({ alert: result.rows[0] });
  } catch (err) {
    console.error('Acknowledge alert error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
