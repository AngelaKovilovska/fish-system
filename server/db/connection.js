const { Pool } = require('pg');

const sslConfig = process.env.NODE_ENV === 'production'
  ? process.env.DATABASE_CA_CERT
    ? { ssl: { ca: process.env.DATABASE_CA_CERT } }
    : { ssl: { rejectUnauthorized: false } }
  : {};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...sslConfig,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err.message);
  // Don't crash on transient pool errors — let the app recover
});

module.exports = pool;
