#!/usr/bin/env python3
"""Add held_by and held_at columns to alarm_events and alarms tables"""
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
    print("Adding held_by and held_at columns to alarm_events table...")
    cur.execute("""
        ALTER TABLE alarm_events
        ADD COLUMN IF NOT EXISTS held_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS held_at TIMESTAMP;
    """)

    print("Adding held_by and held_at columns to alarms table...")
    cur.execute("""
        ALTER TABLE alarms
        ADD COLUMN IF NOT EXISTS held_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS held_at TIMESTAMP;
    """)

    conn.commit()
    print("✓ Successfully added hold columns!")

except Exception as e:
    print(f"✗ Error: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()
