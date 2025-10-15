#!/bin/bash
# Automated backup script for Video Monitoring Dashboard
# Place in: /usr/local/bin/backup-videomonitoring.sh
# Add to crontab: 0 2 * * * /usr/local/bin/backup-videomonitoring.sh

set -e

# Configuration
APP_DIR="/var/www/videomonitoring"
BACKUP_DIR="/var/backups/videomonitoring"
S3_BUCKET=""  # Optional: s3://your-bucket-name/backups
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

echo "=================================================="
echo "Video Monitoring Backup - $(date)"
echo "=================================================="

# Backup database
echo "Backing up database..."
if [ -f "$APP_DIR/backend/video_monitoring.db" ]; then
    # SQLite backup
    sqlite3 $APP_DIR/backend/video_monitoring.db ".backup '$BACKUP_DIR/db_$DATE.db'"
    gzip $BACKUP_DIR/db_$DATE.db
    echo "✓ SQLite database backed up"
elif command -v pg_dump &> /dev/null; then
    # PostgreSQL backup
    pg_dump videomonitoring | gzip > $BACKUP_DIR/db_$DATE.sql.gz
    echo "✓ PostgreSQL database backed up"
else
    echo "⚠ No database found to backup"
fi

# Backup uploads (last 7 days only to save space)
echo "Backing up recent uploads..."
if [ -d "$APP_DIR/uploads" ]; then
    find $APP_DIR/uploads -mtime -7 -print0 | \
        tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz \
        --null -T - 2>/dev/null || echo "⚠ No recent uploads found"
    echo "✓ Uploads backed up"
fi

# Backup configuration
echo "Backing up configuration..."
tar -czf $BACKUP_DIR/config_$DATE.tar.gz \
    /etc/systemd/system/videomonitoring-*.service \
    /etc/nginx/sites-available/videomonitoring* \
    $APP_DIR/gunicorn.conf.py \
    2>/dev/null || echo "⚠ Some config files not found"
echo "✓ Configuration backed up"

# Calculate backup sizes
DB_SIZE=$(du -sh $BACKUP_DIR/db_$DATE.* 2>/dev/null | cut -f1 || echo "0")
UPLOADS_SIZE=$(du -sh $BACKUP_DIR/uploads_$DATE.* 2>/dev/null | cut -f1 || echo "0")
CONFIG_SIZE=$(du -sh $BACKUP_DIR/config_$DATE.* 2>/dev/null | cut -f1 || echo "0")

echo ""
echo "Backup sizes:"
echo "  Database: $DB_SIZE"
echo "  Uploads: $UPLOADS_SIZE"
echo "  Config: $CONFIG_SIZE"

# Upload to S3 (if configured)
if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
    echo ""
    echo "Uploading to S3..."
    aws s3 sync $BACKUP_DIR $S3_BUCKET/$(date +%Y/%m) \
        --exclude "*" \
        --include "*_$DATE.*" \
        --storage-class STANDARD_IA
    echo "✓ Uploaded to S3"
fi

# Remove old backups
echo ""
echo "Cleaning old backups (>$RETENTION_DAYS days)..."
find $BACKUP_DIR -name "*.db.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "✓ Old backups removed"

# Clean old stream files
echo ""
echo "Cleaning old stream segments..."
find $APP_DIR/streams -name "*.ts" -mtime +1 -delete 2>/dev/null || true
echo "✓ Old segments removed"

# Summary
echo ""
echo "=================================================="
echo "Backup completed successfully!"
echo "Location: $BACKUP_DIR"
echo "=================================================="

# Log backup completion
logger -t videomonitoring-backup "Backup completed: $DATE"

