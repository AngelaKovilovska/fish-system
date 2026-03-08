#!/bin/bash
# ═══════════════════════════════════════════════════════════
# CLARIO — Initial VPS Setup (Ubuntu 24.04)
# ═══════════════════════════════════════════════════════════
# Usage: bash setup-server.sh your-domain.com
# Run ONCE on a fresh VPS as root

set -euo pipefail

DOMAIN=${1:-""}
if [ -z "$DOMAIN" ]; then
  echo "Usage: bash setup-server.sh your-domain.com"
  exit 1
fi

APP_DIR="/opt/fish-system"
DB_NAME="fish_system"
DB_USER="fishapp"
DB_PASS=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)

echo "═══ CLARIO — Setting up on $DOMAIN ═══"
echo ""

# 1. System updates
echo "[1/8] Updating system..."
apt update && apt upgrade -y

# 2. Install Node.js 20 LTS
echo "[2/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Install PostgreSQL
echo "[3/8] Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# 4. Create database and user
echo "[4/8] Setting up database..."
sudo -u postgres psql <<EOSQL
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOSQL

# 5. Install PM2
echo "[5/8] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root

# 6. Install nginx
echo "[6/8] Installing nginx..."
apt install -y nginx
systemctl enable nginx

# 7. Configure firewall
echo "[7/8] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# 8. Install certbot
echo "[8/8] Installing SSL tools..."
apt install -y certbot python3-certbot-nginx

# Create directories
mkdir -p "$APP_DIR"
mkdir -p /var/log/fish-system
mkdir -p /var/backups/fish-system

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "SETUP COMPLETE!"
echo ""
echo "Database credentials (SAVE THESE!):"
echo "  User: $DB_USER"
echo "  Password: $DB_PASS"
echo "  Database: $DB_NAME"
echo ""
echo "Next steps:"
echo ""
echo "1. Point DNS A record for $DOMAIN → this server's IP"
echo ""
echo "2. Copy project files to $APP_DIR (git clone or scp)"
echo ""
echo "3. Create $APP_DIR/server/.env:"
echo "   DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo "   JWT_SECRET=$JWT_SECRET"
echo "   PORT=3001"
echo "   NODE_ENV=production"
echo "   SMTP_HOST=smtp.gmail.com"
echo "   SMTP_PORT=587"
echo "   SMTP_USER=your-email@gmail.com"
echo "   SMTP_PASS=your-app-password"
echo "   EMAIL_FROM=your-email@gmail.com"
echo ""
echo "4. Configure nginx:"
echo "   cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/$DOMAIN"
echo "   sed -i 's/your-domain.com/$DOMAIN/g' /etc/nginx/sites-available/$DOMAIN"
echo "   ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/"
echo "   rm -f /etc/nginx/sites-enabled/default"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "5. Get SSL certificate:"
echo "   certbot --nginx -d $DOMAIN"
echo ""
echo "6. Deploy the app:"
echo "   cd $APP_DIR && bash deploy/deploy.sh"
echo ""
echo "7. Set up daily backup cron:"
echo "   crontab -e"
echo "   0 2 * * * $APP_DIR/server/scripts/backup.sh >> /var/log/fish-system/backup.log 2>&1"
echo "═══════════════════════════════════════════════════════════"
