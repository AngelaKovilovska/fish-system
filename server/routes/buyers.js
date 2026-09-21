const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/buyers - list all active buyers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM buyers WHERE is_active = true ORDER BY name'
    );
    res.json({ buyers: result.rows });
  } catch (err) {
    console.error('Get buyers error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// GET /api/buyers/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM buyers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Купувачот не е пронајден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get buyer error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/buyers - create new buyer
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, address, edb, contact_person, phone, email, is_individual } = req.body;
    if (!name) return res.status(400).json({ error: 'Потребно е име на купувач' });

    const result = await pool.query(
      `INSERT INTO buyers (name, address, edb, contact_person, phone, email, is_individual)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, address || null, edb || null, contact_person || null, phone || null, email || null, !!is_individual]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create buyer error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/buyers/:id - update buyer
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, address, edb, contact_person, phone, email, is_individual } = req.body;
    if (!name) return res.status(400).json({ error: 'Потребно е име на купувач' });

    const result = await pool.query(
      `UPDATE buyers SET name=$1, address=$2, edb=$3, contact_person=$4, phone=$5, email=$6, is_individual=$8, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, address || null, edb || null, contact_person || null, phone || null, email || null, req.params.id, !!is_individual]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Купувачот не е пронајден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update buyer error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// DELETE /api/buyers/:id - soft delete (deactivate)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE buyers SET is_active = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Купувачот е деактивиран' });
  } catch (err) {
    console.error('Delete buyer error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
