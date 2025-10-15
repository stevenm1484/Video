#!/bin/bash
# Real-time monitoring script for Video Monitoring Dashboard
# Run with: bash monitoring.sh

echo "=================================================="
echo "Video Monitoring Dashboard - System Monitor"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_service() {
    local service=$1
    if systemctl is-active --quiet $service; then
        echo -e "${GREEN}✓${NC} $service is running"
        return 0
    else
        echo -e "${RED}✗${NC} $service is NOT running"
        return 1
    fi
}

check_port() {
    local port=$1
    local name=$2
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
        echo -e "${GREEN}✓${NC} $name (port $port) is listening"
        return 0
    elif ss -tuln 2>/dev/null | grep -q ":$port "; then
        echo -e "${GREEN}✓${NC} $name (port $port) is listening"
        return 0
    else
        echo -e "${RED}✗${NC} $name (port $port) is NOT listening"
        return 1
    fi
}

# Check services
echo "Service Status:"
echo "---------------"
check_service videomonitoring-backend
check_service nginx
echo ""

# Check ports
echo "Port Status:"
echo "------------"
check_port 8000 "Backend API"
check_port 80 "HTTP"
check_port 443 "HTTPS"
check_port 2525 "SMTP"
echo ""

# System resources
echo "System Resources:"
echo "-----------------"
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print "  " 100 - $1"%"}'

echo "Memory Usage:"
free -h | awk '/^Mem:/ {printf "  %s / %s (%.1f%%)\n", $3, $2, ($3/$2)*100}'

echo "Disk Usage:"
df -h / | awk 'NR==2 {printf "  %s / %s (%s)\n", $3, $2, $5}'
echo ""

# FFmpeg processes
echo "FFmpeg Processes:"
echo "-----------------"
FFMPEG_COUNT=$(ps aux | grep -c '[f]fmpeg')
if [ $FFMPEG_COUNT -eq 0 ]; then
    echo "  No active streams"
else
    echo "  $FFMPEG_COUNT active stream(s)"
    ps aux | grep '[f]fmpeg' | awk '{print "    PID:", $2, "CPU:", $3"%", "MEM:", $4"%"}'
fi
echo ""

# Recent logs
echo "Recent Errors (last 10):"
echo "------------------------"
if [ -f /var/log/videomonitoring/error.log ]; then
    tail -n 10 /var/log/videomonitoring/error.log | sed 's/^/  /'
else
    journalctl -u videomonitoring-backend -p err -n 10 --no-pager | sed 's/^/  /'
fi
echo ""

# Disk space check
echo "Storage Status:"
echo "---------------"
APP_DIR="/var/www/videomonitoring"
if [ -d "$APP_DIR/uploads" ]; then
    UPLOADS_SIZE=$(du -sh $APP_DIR/uploads 2>/dev/null | awk '{print $1}')
    echo "  Uploads: $UPLOADS_SIZE"
fi
if [ -d "$APP_DIR/streams" ]; then
    STREAMS_SIZE=$(du -sh $APP_DIR/streams 2>/dev/null | awk '{print $1}')
    echo "  Streams: $STREAMS_SIZE"
fi
if [ -f "$APP_DIR/backend/video_monitoring.db" ]; then
    DB_SIZE=$(du -sh $APP_DIR/backend/video_monitoring.db 2>/dev/null | awk '{print $1}')
    echo "  Database: $DB_SIZE"
fi
echo ""

# Summary
echo "=================================================="
echo "Quick Commands:"
echo "  View logs:    journalctl -u videomonitoring-backend -f"
echo "  Restart:      systemctl restart videomonitoring-backend"
echo "  Stop streams: systemctl restart videomonitoring-backend"
echo "=================================================="

