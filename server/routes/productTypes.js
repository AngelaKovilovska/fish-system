const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/product-types - list all active product types
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM product_types WHERE is_active = true ORDER BY sort_order, id'
    );
    res.json({ productTypes: result.rows });
  } catch (err) {
    console.error('Get product types error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/product-types - add new product type
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, name, price_per_unit } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Потребни се код и име' });

    // Check if an inactive type with this code exists — reactivate it
    const existing = await pool.query(
      'SELECT * FROM product_types WHERE UPPER(code) = $1 AND is_active = false',
      [code.toUpperCase()]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE product_types SET is_active = true, name = $1, price_per_unit = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [name, parseFloat(price_per_unit) || 0, existing.rows[0].id]
      );
    } else {
      const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_types');
      result = await pool.query(
        `INSERT INTO product_types (code, name, price_per_unit, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [code.toUpperCase(), name, parseFloat(price_per_unit) || 0, maxOrder.rows[0].next]
      );
    }

    // Create inventory record for the new type
    await pool.query(
      'INSERT INTO product_inventory (product_type_id, quantity_kg) VALUES ($1, 0) ON CONFLICT DO NOTHING',
      [result.rows[0].id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Веќе постои активен тип со тој код' });
    }
    console.error('Create product type error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/product-types/:id - update price or name
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, price_per_unit, code } = req.body;

    const result = await pool.query(
      `UPDATE product_types
       SET name = COALESCE($1, name),
           price_per_unit = COALESCE($2, price_per_unit),
           code = COALESCE($3, code),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name || null, price_per_unit != null ? parseFloat(price_per_unit) : null, code || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Типот не е пронајден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update product type error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// DELETE /api/product-types/:id - soft delete
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE product_types SET is_active = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Типот е деактивиран' });
  } catch (err) {
    console.error('Delete product type error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
