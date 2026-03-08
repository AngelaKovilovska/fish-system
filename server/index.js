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
      connectSrc: ["'self'"],
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve React app in production ──
if (IS_PROD) {
  const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');

  app.use(express.static(clientBuildPath, {
    maxAge: '1y',
    immutable: true,
  }));

  // SPA fallback — any non-API route returns index.html
  app.get('{*path}', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Run migrations on startup
async function runMigrations() {
  try {
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (file.endsWith('.sql')) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await pool.query(sql);
        console.log(`Migration applied: ${file}`);
      }
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
}

// ── Global error handler (не ликува чувствителни детали) ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Серверска грешка' });
});

async function start() {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${IS_PROD ? 'production' : 'development'}]`);
  });
}

start();
