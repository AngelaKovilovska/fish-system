#!/bin/bash
# ═══════════════════════════════════════════════════════════
# CLARIO — Deployment Script
# ═══════════════════════════════════════════════════════════
# Usage: cd /opt/fish-system && bash deploy/deploy.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══ CLARIO — Deploying from $APP_DIR ═══"
echo ""

# 1. Install dependencies
echo "[1/5] Installing dependencies..."
cd "$APP_DIR/client" && npm ci --omit=dev 2>&1 | tail -1
cd "$APP_DIR/server" && npm ci 2>&1 | tail -1

# 2. Build client
echo "[2/5] Building React client..."
cd "$APP_DIR/client" && npm run build 2>&1 | tail -3

# 3. Verify database
echo "[3/5] Verifying database connection..."
cd "$APP_DIR/server" && node -e "
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT 1').then(() => {
    console.log('  Database OK');
    pool.end();
  }).catch(err => {
    console.error('  Database FAILED:', err.message);
    process.exit(1);
  });
"

# 4. Restart PM2
echo "[4/5] Restarting application..."
cd "$APP_DIR"
pm2 startOrRestart ecosystem.config.js --env production
pm2 save

# 5. Health check
echo "[5/5] Verifying health..."
sleep 3
if curl -sf http://localhost:3001/api/health > /dev/null; then
  echo "  Health check PASSED"
else
  echo "  Health check FAILED — check: pm2 logs fish-system"
  exit 1
fi

echo ""
echo "═══ Deployment complete! ═══"
