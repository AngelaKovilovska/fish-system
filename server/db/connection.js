const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enable SSL in production (Railway requires it)
  ...(process.env.NODE_ENV === 'production' && {
    ssl: { rejectUnauthorized: false },
  }),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err.message);
  // Don't crash on transient pool errors — let the app recover
});

module.exports = pool;
