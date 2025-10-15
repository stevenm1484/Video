#!/usr/bin/env python3
"""View audit log entries from the database"""
import psycopg2
import json
from datetime import datetime

# Connection parameters
host = "monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com"
port = "5432"
dbname = "videomonitoring"
user = "postgres"
password = "ZUzXgq<<5sivAc4fSeX|~c|#s~#C"

conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
cur = conn.cursor()

print("\n" + "="*100)
print("RECENT AUDIT LOG ENTRIES (Last 20)")
print("="*100 + "\n")

cur.execute("""
    SELECT
        id,
        timestamp,
        action,
        username,
        user_id,
        event_id,
        alarm_id,
        details
    FROM alarm_audit_log
    ORDER BY timestamp DESC
    LIMIT 20
""")

rows = cur.fetchall()

for row in rows:
    id, timestamp, action, username, user_id, event_id, alarm_id, details = row
    print(f"[{timestamp}] {action}")
    print(f"  User: {username or 'System'} (ID: {user_id or 'N/A'})")
    print(f"  Event ID: {event_id or 'N/A'} | Alarm ID: {alarm_id or 'N/A'}")
    if details:
        print(f"  Details: {json.dumps(details, indent=2)}")
    print("-" * 100)

print("\n" + "="*100)
print("AUDIT TRAIL FOR MOST RECENT ALARM")
print("="*100 + "\n")

# Get most recent alarm
cur.execute("""
    SELECT id, event_id, created_at
    FROM alarms
    ORDER BY created_at DESC
    LIMIT 1
""")

alarm_row = cur.fetchone()
if alarm_row:
    alarm_id, event_id, created_at = alarm_row
    print(f"Alarm ID: {alarm_id} | Event ID: {event_id} | Created: {created_at}\n")

    # Get complete audit trail
    cur.execute("""
        SELECT
            timestamp,
            action,
            username,
            details
        FROM alarm_audit_log
        WHERE alarm_id = %s OR event_id = %s
        ORDER BY timestamp ASC
    """, (alarm_id, event_id))

    trail_rows = cur.fetchall()

    if trail_rows:
        for i, row in enumerate(trail_rows, 1):
            timestamp, action, username, details = row
            print(f"{i}. [{timestamp}] {action} by {username or 'System'}")
            if details:
                print(f"   Details: {json.dumps(details)}")
    else:
        print("No audit trail found")

    # Calculate time metrics
    print("\n" + "-"*100)
    print("TIME METRICS")
    print("-"*100 + "\n")

    cur.execute("""
        SELECT
            ae.timestamp as event_received,
            ae.claimed_at,
            ae.viewed_at as event_viewed,
            ae.escalated_at,
            a.created_at as alarm_created,
            a.viewed_at as alarm_viewed,
            a.resolved_at
        FROM alarms a
        JOIN alarm_events ae ON a.event_id = ae.id
        WHERE a.id = %s
    """, (alarm_id,))

    metrics = cur.fetchone()
    if metrics:
        event_received, claimed_at, event_viewed, escalated_at, alarm_created, alarm_viewed, resolved_at = metrics

        if event_received:
            print(f"Event Received: {event_received}")
        if claimed_at:
            seconds = (claimed_at - event_received).total_seconds()
            print(f"Time to Claim: {seconds:.1f} seconds ({seconds/60:.1f} minutes)")
        if escalated_at:
            seconds = (escalated_at - event_received).total_seconds()
            print(f"Time to Escalate: {seconds:.1f} seconds ({seconds/60:.1f} minutes)")
        if alarm_created:
            print(f"Alarm Created: {alarm_created}")
        if alarm_viewed:
            seconds = (alarm_viewed - alarm_created).total_seconds()
            print(f"Time to View Alarm: {seconds:.1f} seconds")
        if resolved_at:
            seconds_on_screen = (resolved_at - alarm_viewed).total_seconds() if alarm_viewed else 0
            total_seconds = (resolved_at - alarm_created).total_seconds()
            print(f"Time on Screen: {seconds_on_screen:.1f} seconds")
            print(f"Total Resolution Time: {total_seconds:.1f} seconds ({total_seconds/60:.1f} minutes)")
            print(f"End-to-End Time: {(resolved_at - event_received).total_seconds():.1f} seconds")

cur.close()
conn.close()

print("\n" + "="*100 + "\n")
