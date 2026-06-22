// One-time script to create admin user
// Usage: node scripts/seed-admin.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedAdmin() {
  try {
    const existing = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('Users already exist. Skipping.');
      process.exit(0);
    }

    const email = process.env.ADMIN_EMAIL || 'admin@clario.mk';
    if (!process.env.ADMIN_PASSWORD) {
      console.error('ADMIN_PASSWORD environment variable is required.');
      process.exit(1);
    }
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);

    await pool.query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
      [email, hashedPassword, process.env.ADMIN_NAME || 'Admin', 'admin']
    );

    console.log('Admin created: ' + email);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

seedAdmin();
