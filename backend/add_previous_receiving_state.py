#!/usr/bin/env python3
"""Add previous_receiving_state field to track state before auto-disable"""
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
    print("Adding previous_receiving_state column to users table...")

    # Add column to track what the receiving state was before auto-disable
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS previous_receiving_state BOOLEAN DEFAULT NULL;
    """)

    # Add comment to explain the field
    cur.execute("""
        COMMENT ON COLUMN users.previous_receiving_state IS
        'Tracks the receiving state before auto-disable (for active_event, alarm_navigation).
        NULL means no state to restore. Used to restore receiving state when user returns to dashboard.';
    """)

    conn.commit()
    print("✓ Successfully added previous_receiving_state field!")

    print("\nHow it works:")
    print("  1. When user has 'receiving=true' and we auto-disable due to active_event or alarm_navigation:")
    print("     - Set previous_receiving_state = true")
    print("     - Set is_receiving = false")
    print("  2. When user dismisses event or resolves alarm:")
    print("     - If previous_receiving_state = true, restore is_receiving = true")
    print("     - Set previous_receiving_state = NULL")
    print("  3. Page refresh and tab blur do NOT save state (they're different scenarios)")

except Exception as e:
    print(f"✗ Error: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()
