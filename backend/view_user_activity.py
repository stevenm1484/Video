#!/usr/bin/env python3
"""View user activity log for testing receiving state management"""
import psycopg2
from datetime import datetime, timedelta

# Connection parameters
host = "monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com"
port = "5432"
dbname = "videomonitoring"
user = "postgres"
password = "ZUzXgq<<5sivAc4fSeX|~c|#s~#C"

conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
cur = conn.cursor()

# Get recent user activity
print("=" * 80)
print("USER ACTIVITY LOG (Last 24 hours)")
print("=" * 80)

cur.execute("""
    SELECT
        id,
        timestamp,
        username,
        action,
        ip_address,
        details
    FROM user_activity_log
    WHERE timestamp > NOW() - INTERVAL '24 hours'
    ORDER BY timestamp DESC
    LIMIT 50
""")

rows = cur.fetchall()

if not rows:
    print("No user activity in the last 24 hours")
else:
    for row in rows:
        log_id, timestamp, username, action, ip_address, details = row
        print(f"\n[{timestamp}] {action.upper()}")
        print(f"  User: {username}")
        if ip_address:
            print(f"  IP: {ip_address}")
        if details:
            print(f"  Details: {details}")
        print(f"  ID: {log_id}")

# Get summary by action type
print("\n" + "=" * 80)
print("SUMMARY BY ACTION TYPE (Last 24 hours)")
print("=" * 80)

cur.execute("""
    SELECT
        action,
        COUNT(*) as count,
        COUNT(DISTINCT username) as unique_users
    FROM user_activity_log
    WHERE timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY action
    ORDER BY count DESC
""")

summary_rows = cur.fetchall()
for action, count, unique_users in summary_rows:
    print(f"{action:30s} | Count: {count:4d} | Unique Users: {unique_users}")

# Get user login sessions (login to logout pairs)
print("\n" + "=" * 80)
print("USER SESSIONS (Last 24 hours)")
print("=" * 80)

cur.execute("""
    WITH logins AS (
        SELECT
            id,
            username,
            timestamp as login_time,
            ip_address
        FROM user_activity_log
        WHERE action = 'user_login'
        AND timestamp > NOW() - INTERVAL '24 hours'
    ),
    logouts AS (
        SELECT
            username,
            timestamp as logout_time
        FROM user_activity_log
        WHERE action = 'user_logout'
        AND timestamp > NOW() - INTERVAL '24 hours'
    )
    SELECT
        l.username,
        l.login_time,
        (SELECT MIN(logout_time) FROM logouts WHERE username = l.username AND logout_time > l.login_time) as logout_time,
        l.ip_address
    FROM logins l
    ORDER BY l.login_time DESC
    LIMIT 20
""")

session_rows = cur.fetchall()
for username, login_time, logout_time, ip_address in session_rows:
    duration = "Still logged in"
    if logout_time:
        diff = logout_time - login_time
        minutes = int(diff.total_seconds() / 60)
        duration = f"{minutes} minutes"

    print(f"\n{username}")
    print(f"  Login:  {login_time}")
    if logout_time:
        print(f"  Logout: {logout_time}")
    print(f"  Duration: {duration}")
    print(f"  IP: {ip_address or 'N/A'}")

# Get receiving state changes
print("\n" + "=" * 80)
print("RECEIVING STATE CHANGES (Last 24 hours)")
print("=" * 80)

cur.execute("""
    SELECT
        timestamp,
        username,
        action,
        details
    FROM user_activity_log
    WHERE action IN ('receiving_enabled', 'receiving_disabled', 'receiving_auto_disabled')
    AND timestamp > NOW() - INTERVAL '24 hours'
    ORDER BY timestamp DESC
    LIMIT 50
""")

receiving_rows = cur.fetchall()
import json

for timestamp, username, action, details in receiving_rows:
    reason = ""
    try:
        details_dict = json.loads(details) if isinstance(details, str) else details
        if action == 'receiving_auto_disabled':
            reason_text = details_dict.get('reason', 'unknown')
            reason = f" | Auto-Disable Reason: {reason_text}"
        elif details_dict.get('manual_toggle'):
            reason = " | Manual Toggle"
    except:
        pass

    # Color code the state
    if action == 'receiving_enabled':
        state = "✓ ENABLED"
    elif action == 'receiving_disabled':
        state = "✗ DISABLED (Manual)"
    else:
        state = "✗ DISABLED (Auto)"

    print(f"[{timestamp}] {username:15s} | {state:25s}{reason}")

# Get summary of auto-disable reasons
print("\n" + "=" * 80)
print("AUTO-DISABLE REASONS SUMMARY (Last 24 hours)")
print("=" * 80)

cur.execute("""
    SELECT
        details->>'reason' as reason,
        COUNT(*) as count
    FROM user_activity_log
    WHERE action = 'receiving_auto_disabled'
    AND timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY details->>'reason'
    ORDER BY count DESC
""")

reason_rows = cur.fetchall()
if reason_rows:
    for reason, count in reason_rows:
        print(f"{reason or 'unknown':20s} | {count:4d} times")
else:
    print("No auto-disable events in the last 24 hours")

cur.close()
conn.close()

print("\n" + "=" * 80)
