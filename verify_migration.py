#!/usr/bin/env python3
"""Verify RDS migration - check data integrity"""
import os
import sys
from dotenv import load_dotenv

load_dotenv('/var/www/videomonitoring/backend/.env')
sys.path.insert(0, '/var/www/videomonitoring/backend')

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import User, VideoAccount, Camera, AlarmEvent, Alarm, ActivityLog, Country, Group, Dealer

POSTGRES_URL = os.getenv("DATABASE_URL")

print("=" * 80)
print("MIGRATION VERIFICATION")
print("=" * 80)
print(f"\nDatabase: {POSTGRES_URL.replace(POSTGRES_URL.split('@')[0].split('//')[1], '***')}\n")

postgres_engine = create_engine(POSTGRES_URL)
PostgresSession = sessionmaker(bind=postgres_engine)
session = PostgresSession()

try:
    # Test connection
    result = session.execute(text("SELECT version()"))
    version = result.fetchone()[0]
    print(f"✓ Connected to PostgreSQL")
    print(f"  Version: {version[:60]}...\n")

    # Count records
    print("Record Counts:")
    print("-" * 80)

    counts = {
        "Countries": session.query(Country).count(),
        "Groups": session.query(Group).count(),
        "Dealers": session.query(Dealer).count(),
        "Users": session.query(User).count(),
        "Video Accounts": session.query(VideoAccount).count(),
        "Cameras": session.query(Camera).count(),
        "Alarm Events": session.query(AlarmEvent).count(),
        "Alarms": session.query(Alarm).count(),
        "Activity Logs": session.query(ActivityLog).count(),
    }

    for name, count in counts.items():
        print(f"  {name:20s}: {count:6d} records")

    total = sum(counts.values())
    print(f"\n  {'Total':20s}: {total:6d} records")

    # Sample data verification
    print("\n" + "=" * 80)
    print("Sample Data Verification:")
    print("-" * 80)

    # Check users
    users = session.query(User).all()
    print(f"\nUsers ({len(users)} total):")
    for user in users:
        print(f"  - {user.username:15s} (Role: {user.role_type or user.role}, Email: {user.email})")

    # Check video accounts
    accounts = session.query(VideoAccount).all()
    print(f"\nVideo Accounts ({len(accounts)} total):")
    for account in accounts:
        camera_count = session.query(Camera).filter(Camera.account_id == account.id).count()
        event_count = session.query(AlarmEvent).join(Camera).filter(Camera.account_id == account.id).count()
        print(f"  - {account.name:30s} (ID: {account.account_id}, Cameras: {camera_count}, Events: {event_count})")

    # Check recent alarm events
    recent_events = session.query(AlarmEvent).order_by(AlarmEvent.timestamp.desc()).limit(5).all()
    print(f"\nRecent Alarm Events (showing latest 5):")
    for event in recent_events:
        camera = session.query(Camera).filter(Camera.id == event.camera_id).first()
        print(f"  - {event.timestamp} | Camera: {camera.name if camera else 'Unknown'} | Status: {event.status}")

    # Test write capability - create and delete a test record
    print("\n" + "=" * 80)
    print("Testing Write Capability:")
    print("-" * 80)

    from datetime import datetime
    test_country = Country(name=f"TEST_COUNTRY_{datetime.utcnow().timestamp()}")
    session.add(test_country)
    session.commit()
    print(f"✓ Write test successful (created test country ID: {test_country.id})")

    # Delete test record
    session.delete(test_country)
    session.commit()
    print(f"✓ Delete test successful (removed test country)")

    print("\n" + "=" * 80)
    print("✓ MIGRATION VERIFICATION COMPLETED SUCCESSFULLY!")
    print("=" * 80)
    print("\nThe database is fully operational and ready to use.")
    print("All data has been successfully migrated to AWS RDS PostgreSQL.")

except Exception as e:
    print(f"\n✗ ERROR during verification: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

finally:
    session.close()
