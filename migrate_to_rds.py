#!/usr/bin/env python3
"""
Migrate SQLite database to AWS RDS PostgreSQL
This script will:
1. Initialize the schema in RDS
2. Export all data from SQLite
3. Import all data into RDS PostgreSQL
"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/var/www/videomonitoring/backend/.env')

# Add backend to path
sys.path.insert(0, '/var/www/videomonitoring/backend')

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from database import Base
from models import User, VideoAccount, Camera, AlarmEvent, Alarm, ActivityLog, AccountClaim, Country, Group, Dealer

# SQLite source database
SQLITE_URL = "sqlite:///./backend/video_monitoring.db"
# PostgreSQL target from .env
POSTGRES_URL = os.getenv("DATABASE_URL")

print("=" * 80)
print("DATABASE MIGRATION: SQLite → AWS RDS PostgreSQL")
print("=" * 80)
print(f"\nSource: {SQLITE_URL}")
print(f"Target: {POSTGRES_URL.replace(POSTGRES_URL.split('@')[0].split('//')[1], '***')}\n")

# Create engines
print("Connecting to databases...")
sqlite_engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
postgres_engine = create_engine(POSTGRES_URL)

# Create sessions
SqliteSession = sessionmaker(bind=sqlite_engine)
PostgresSession = sessionmaker(bind=postgres_engine)

sqlite_session = SqliteSession()
postgres_session = PostgresSession()

try:
    # Step 1: Create all tables in PostgreSQL
    print("\n[Step 1/3] Creating schema in RDS PostgreSQL...")
    Base.metadata.create_all(bind=postgres_engine)
    print("✓ Schema created successfully")

    # Step 2: Count records to migrate
    print("\n[Step 2/3] Analyzing data to migrate...")
    models_to_migrate = [
        (Country, "Countries"),
        (Group, "Groups"),
        (Dealer, "Dealers"),
        (User, "Users"),
        (VideoAccount, "Video Accounts"),
        (Camera, "Cameras"),
        (AlarmEvent, "Alarm Events"),
        (Alarm, "Alarms"),
        (ActivityLog, "Activity Logs"),
        (AccountClaim, "Account Claims"),
    ]

    migration_plan = []
    total_records = 0
    for model, name in models_to_migrate:
        count = sqlite_session.query(model).count()
        migration_plan.append((model, name, count))
        total_records += count
        print(f"  {name:20s}: {count:6d} records")

    print(f"\n  Total records to migrate: {total_records}")

    # Step 3: Migrate data
    print("\n[Step 3/3] Migrating data...")

    for model, name, count in migration_plan:
        if count == 0:
            print(f"  {name:20s}: Skipped (no data)")
            continue

        print(f"  {name:20s}: Migrating...", end="", flush=True)

        # Fetch all records from SQLite
        records = sqlite_session.query(model).all()

        # Convert to dictionaries to avoid session conflicts
        records_data = []
        for record in records:
            record_dict = {}
            for column in inspect(model).columns:
                record_dict[column.name] = getattr(record, column.name)
            records_data.append(record_dict)

        # Insert into PostgreSQL
        for record_dict in records_data:
            new_record = model(**record_dict)
            postgres_session.add(new_record)

        postgres_session.commit()
        print(f" ✓ {count} records")

    # Update sequences for auto-increment columns in PostgreSQL
    print("\n[Finalizing] Updating PostgreSQL sequences...")
    for model, name, count in migration_plan:
        if count > 0 and hasattr(model, 'id'):
            table_name = model.__tablename__
            sequence_name = f"{table_name}_id_seq"

            # Get max ID from table
            result = postgres_session.execute(text(f"SELECT MAX(id) FROM {table_name}"))
            max_id = result.fetchone()[0]

            if max_id:
                # Set sequence to max_id + 1
                postgres_session.execute(text(f"SELECT setval('{sequence_name}', {max_id})"))
                postgres_session.commit()
                print(f"  {table_name:20s}: Sequence set to {max_id + 1}")

    print("\n" + "=" * 80)
    print("✓ MIGRATION COMPLETED SUCCESSFULLY!")
    print("=" * 80)
    print(f"\nTotal records migrated: {total_records}")
    print("\nNext steps:")
    print("1. Verify the migration by testing the application")
    print("2. Update any systemd service files to use the new DATABASE_URL")
    print("3. Restart the application services")
    print("4. Keep the SQLite backup until you confirm everything works")
    print("=" * 80)

except Exception as e:
    print(f"\n\n✗ ERROR during migration: {e}")
    import traceback
    traceback.print_exc()
    postgres_session.rollback()
    sys.exit(1)

finally:
    sqlite_session.close()
    postgres_session.close()
