require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const pool = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust proxy when behind nginx
if (IS_PROD) {
  app.set('trust proxy', 1);
}

// ── Security middleware ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: IS_PROD ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));

// Body size limit (заштита од DoS)
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Global API rate limiter (100 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Премногу барања. Обидете се повторно по малку.' },
});
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/norms', require('./routes/norms'));
app.use('/api/records', require('./routes/records'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/pool-measurements', require('./routes/poolMeasurements'));
app.use('/api/food-inventory', require('./routes/foodInventory'));
app.use('/api/meals', require('./routes/meals'));
app.use('/api/pool-fish-inventory', require('./routes/poolFishInventory'));
app.use('/api/ai', require('./routes/ai'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve React app in production ──
if (IS_PROD) {
  const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');

  // Set correct cache headers per file type
  app.use((req, res, next) => {
    if (/^\/(pwa-|apple-touch-icon|manifest\.webmanifest|sw\.js|workbox-|index\.html|registerSW)/.test(req.path)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
  });

  app.use(express.static(clientBuildPath, {
    maxAge: '1y',
    immutable: true,
    index: false,
    setHeaders: (res, filePath) => {
      if (/\/(pwa-|apple-touch-icon|manifest\.webmanifest|sw\.js|workbox-|index\.html|registerSW)/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  // SPA fallback — no cache on index.html
  app.get('{*path}', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Run migrations on startup
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith('.sql')) {
      try {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await pool.query(sql);
        console.log(`Migration applied: ${file}`);
      } catch (err) {
        // Log but continue — migrations must be idempotent
        console.error(`Migration ${file} note:`, err.message);
      }
    }
  }

  // Ensure UNIQUE constraint on pool_meals is dropped (multi-food support)
  try {
    const result = await pool.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'pool_meals'
        AND con.contype = 'u'
        AND nsp.nspname = 'public'
    `);
    for (const row of result.rows) {
      await pool.query(`ALTER TABLE pool_meals DROP CONSTRAINT "${row.conname}"`);
      console.log(`Dropped UNIQUE constraint: ${row.conname}`);
    }
  } catch (err) {
    // No constraint to drop or already dropped — safe to ignore
    if (err.code !== '42704') {
      console.error('Constraint cleanup note:', err.message);
    }
  }
}

// Auto-seed admin if no users exist
async function seedAdmin() {
  try {
    const existing = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(existing.rows[0].count) > 0) return;

    const bcrypt = require('bcryptjs');
    const email = process.env.ADMIN_EMAIL || 'admin@clario.mk';
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);

    await pool.query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
      [email, hashedPassword, process.env.ADMIN_NAME || 'Admin', 'admin']
    );
    console.log('Admin user created: ' + email);
  } catch (err) {
    console.error('Seed admin error:', err.message);
  }
}

// ── Global error handler (не ликува чувствителни детали) ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Серверска грешка' });
});

async function start() {
  await runMigrations();
  await seedAdmin();
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${IS_PROD ? 'production' : 'development'}]`);
  });

  // Graceful shutdown — close server and DB pool on termination signals
  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(async () => {
      try {
        await pool.end();
        console.log('Database pool closed.');
      } catch (err) {
        console.error('Error closing pool:', err.message);
      }
      process.exit(0);
    });
    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
