#!/usr/bin/env python3
"""Add comprehensive audit tracking columns to alarm_events and alarms tables"""
import psycopg2

# Direct connection parameters
host = "monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com"
port = "5432"
dbname = "videomonitoring"
user = "postgres"
password = "ZUzXgq<<5sivAc4fSeX|~c|#s~#C"

print(f"Connecting to database {dbname} at {host}:{port}...")

# Connect to database
conn = psycopg2.connect(
    host=host,
    port=port,
    dbname=dbname,
    user=user,
    password=password
)

cur = conn.cursor()

try:
    print("Adding audit tracking columns to alarm_events table...")

    # Claim/View tracking
    cur.execute("""
        ALTER TABLE alarm_events
        ADD COLUMN IF NOT EXISTS claimed_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS viewed_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS unheld_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS unheld_at TIMESTAMP;
    """)

    print("Adding audit tracking columns to alarms table...")

    # Alarm viewing and handling tracking
    cur.execute("""
        ALTER TABLE alarms
        ADD COLUMN IF NOT EXISTS viewed_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS unheld_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS unheld_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id);
    """)

    print("Creating alarm_audit_log table for comprehensive tracking...")

    # Create comprehensive audit log table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS alarm_audit_log (
            id SERIAL PRIMARY KEY,
            event_id INTEGER REFERENCES alarm_events(id),
            alarm_id INTEGER REFERENCES alarms(id),
            action VARCHAR(50) NOT NULL,
            user_id INTEGER REFERENCES users(id),
            username VARCHAR(255),
            timestamp TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
            details JSON,
            created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
        );
    """)

    # Add indexes for performance
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_alarm_audit_log_event_id ON alarm_audit_log(event_id);
        CREATE INDEX IF NOT EXISTS idx_alarm_audit_log_alarm_id ON alarm_audit_log(alarm_id);
        CREATE INDEX IF NOT EXISTS idx_alarm_audit_log_user_id ON alarm_audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_alarm_audit_log_timestamp ON alarm_audit_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_alarm_audit_log_action ON alarm_audit_log(action);
    """)

    conn.commit()
    print("✓ Successfully added audit tracking columns and tables!")

    # Show what actions we'll track
    print("\nAudit Actions that will be tracked:")
    print("  - event_received: When event arrives from camera")
    print("  - event_claimed: When operator claims/views event")
    print("  - event_viewed: When operator opens event detail")
    print("  - alarm_generated: When alarm is generated from event")
    print("  - alarm_viewed: When operator opens alarm detail screen")
    print("  - alarm_held: When alarm is put on hold")
    print("  - alarm_unheld: When alarm is taken off hold")
    print("  - alarm_resolved: When alarm is resolved")
    print("  - event_dismissed: When event is dismissed")
    print("  - event_escalated: When event is escalated")
    print("\nTime metrics that can be calculated:")
    print("  - Time to claim: viewed_at - timestamp")
    print("  - Time to resolve: resolved_at - created_at")
    print("  - Time on screen: resolved_at - viewed_at")
    print("  - Hold duration: unheld_at - held_at")
    print("  - Total handling time: resolved_at - claimed_at")

except Exception as e:
    print(f"✗ Error: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()
