#!/bin/bash
# ═══════════════════════════════════════════════════
# CLARIO Fish System — PostgreSQL Backup Script
# ═══════════════════════════════════════════════════
#
# Автоматски дневен бекап на базата fish_system.
#
# Поставување (cron — секој ден во 02:00):
#   crontab -e
#   0 2 * * * /Users/angelakovilovska/fish_system/server/scripts/backup.sh >> /Users/angelakovilovska/fish_system_backups/backup.log 2>&1
#
# Рачно извршување:
#   ./backup.sh
#
# Враќање од бекап:
#   gunzip -c /path/to/backup.sql.gz | psql fish_system

BACKUP_DIR="/Users/angelakovilovska/fish_system_backups"
DB_NAME="fish_system"

# PostgreSQL binaries path
export PATH="/opt/homebrew/Cellar/postgresql@17/17.9/bin:$PATH"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Креирај директориум ако не постои
mkdir -p "$BACKUP_DIR"

echo "[$TIMESTAMP] Почнувам бекап на $DB_NAME..."

# Креирај компресиран бекап
pg_dump "$DB_NAME" | gzip > "$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

if [ $? -eq 0 ]; then
    SIZE=$(ls -lh "$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz" | awk '{print $5}')
    echo "[$TIMESTAMP] ✓ Бекап успешен: ${DB_NAME}_${TIMESTAMP}.sql.gz ($SIZE)"
else
    echo "[$TIMESTAMP] ✗ ГРЕШКА: Бекап не успеа!" >&2
    exit 1
fi

# Избриши бекапи постари од 30 дена
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$TIMESTAMP] Избришани $DELETED стари бекап(и) (> ${RETENTION_DAYS} дена)"
fi

# Прикажи статистика
TOTAL=$(ls "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | wc -l)
echo "[$TIMESTAMP] Вкупно бекапи: $TOTAL"
