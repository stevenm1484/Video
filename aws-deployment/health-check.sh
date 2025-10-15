#!/bin/bash
# Health check script for Video Monitoring Dashboard
# Can be used with AWS Auto Scaling or load balancers
# Exit 0 = healthy, Exit 1 = unhealthy

set -e

# Configuration
API_URL="http://localhost:8000"
TIMEOUT=10

# Check if backend is responding
check_backend() {
    response=$(curl -s -w "\n%{http_code}" --max-time $TIMEOUT "$API_URL/api/users/me" 2>/dev/null || echo "000")
    http_code=$(echo "$response" | tail -n 1)
    
    # 200 (OK) or 401 (Unauthorized - means API is working but not authenticated)
    if [ "$http_code" = "200" ] || [ "$http_code" = "401" ]; then
        return 0
    else
        echo "Backend health check failed: HTTP $http_code"
        return 1
    fi
}

# Check if service is running
check_service() {
    if systemctl is-active --quiet videomonitoring-backend; then
        return 0
    else
        echo "Service is not running"
        return 1
    fi
}

# Check disk space (fail if > 90% full)
check_disk() {
    usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$usage" -gt 90 ]; then
        echo "Disk space critical: ${usage}% used"
        return 1
    fi
    return 0
}

# Check memory (fail if < 100MB free)
check_memory() {
    free_mem=$(free -m | awk 'NR==2 {print $7}')
    if [ "$free_mem" -lt 100 ]; then
        echo "Memory low: ${free_mem}MB available"
        return 1
    fi
    return 0
}

# Run all checks
FAILED=0

if ! check_service; then
    FAILED=1
fi

if ! check_backend; then
    FAILED=1
fi

if ! check_disk; then
    FAILED=1
fi

if ! check_memory; then
    FAILED=1
fi

# Exit with appropriate code
if [ $FAILED -eq 0 ]; then
    echo "All health checks passed"
    exit 0
else
    echo "Health check failed"
    exit 1
fi

