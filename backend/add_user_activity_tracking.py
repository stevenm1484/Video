#!/usr/bin/env python3
"""Add user activity tracking for login/logout and receiving status changes"""
import psycopg2

# Connection parameters
host = "monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com"
port = "5432"
dbname = "videomonitoring"
user = "postgres"
password = "ZUzXgq<<5sivAc4fSeX|~c|#s~#C"

print(f"Connecting to database {dbname} at {host}:{port}...")

conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
cur = conn.cursor()

try:
    print("Adding user activity tracking columns to users table...")

    # Add last_logout_at column
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMP;
    """)

    # Note: last_login_at and last_login_ip already exist in the users table

    print("Creating user_activity_log table for comprehensive activity tracking...")

    # Create user activity log table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_activity_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            username VARCHAR(255),
            action VARCHAR(50) NOT NULL,
            timestamp TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
            ip_address VARCHAR(45),
            details JSON,
            created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
        );
    """)

    # Add indexes for performance
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_activity_log_action ON user_activity_log(action);
        CREATE INDEX IF NOT EXISTS idx_user_activity_log_timestamp ON user_activity_log(timestamp);
    """)

    conn.commit()
    print("✓ Successfully added user activity tracking!")

    print("\nUser Activity Actions that will be tracked:")
    print("  - user_login: When user logs in")
    print("  - user_logout: When user logs out")
    print("  - receiving_enabled: When user starts receiving events")
    print("  - receiving_disabled: When user stops receiving events")
    print("  - receiving_auto_disabled: When system auto-disables (page refresh, tab blur, alarm view)")
    print("\nUser session metrics that can be calculated:")
    print("  - Login duration: last_logout_at - last_login_at")
    print("  - Active receiving time: Sum of (disabled_timestamp - enabled_timestamp)")
    print("  - Login frequency: Count of login actions per time period")
    print("  - Auto-disable events: Count of auto-disable actions (quality metric)")

except Exception as e:
    print(f"✗ Error: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()
