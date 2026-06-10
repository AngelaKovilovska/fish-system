const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { isValidEmail, sanitizeString } = require('../middleware/validate');

const router = express.Router();

// GET /api/users - list all users (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// POST /api/users - create user (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { email, full_name, password, role } = req.body;

    if (!email || !full_name || !password) {
      return res.status(400).json({ error: 'Пополнете ги сите полиња' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Невалиден формат на email' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Лозинката мора да има минимум 8 карактери' });
    }

    if (role && !['admin', 'operator'].includes(role)) {
      return res.status(400).json({ error: 'Невалидна улога' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email адресата веќе постои' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, full_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role, created_at',
      [email, full_name, password_hash, role || 'operator']
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// PUT /api/users/:id - update user (admin only)
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, role } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Невалиден формат на email' });
      }
      fields.push(`email = $${idx++}`); values.push(email);
    }
    if (full_name) { fields.push(`full_name = $${idx++}`); values.push(sanitizeString(full_name, 100)); }
    if (role && ['admin', 'operator'].includes(role)) { fields.push(`role = $${idx++}`); values.push(role); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Нема податоци за ажурирање' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, full_name, role`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Корисникот не е пронајден' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

// DELETE /api/users/:id - delete user (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Не може да го избришете сопствениот акаунт' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Корисникот е избришан' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Серверска грешка' });
  }
});

module.exports = router;
