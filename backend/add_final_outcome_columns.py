#!/usr/bin/env python3
"""
Migration script to add final outcome tracking columns to inbound_events table
"""
import os
from sqlalchemy import create_engine, text

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:ZUzXgq<<5sivAc4fSeX|~c|#s~#C@monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com:5432/videomonitoring")

def run_migration():
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        print("Adding final outcome tracking columns to inbound_events table...")

        # Add new columns
        try:
            conn.execute(text("""
                ALTER TABLE inbound_events
                ADD COLUMN IF NOT EXISTS final_outcome VARCHAR,
                ADD COLUMN IF NOT EXISTS final_outcome_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS final_outcome_by INTEGER REFERENCES users(id),
                ADD COLUMN IF NOT EXISTS alarm_id INTEGER REFERENCES alarms(id),
                ADD COLUMN IF NOT EXISTS alarm_resolution VARCHAR,
                ADD COLUMN IF NOT EXISTS alarm_resolved_at TIMESTAMP;
            """))
            conn.commit()
            print("✓ Successfully added final outcome columns")

            # Create indexes
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_inbound_events_final_outcome ON inbound_events(final_outcome);
            """))
            conn.commit()
            print("✓ Successfully created indexes")

        except Exception as e:
            print(f"✗ Error during migration: {e}")
            conn.rollback()
            raise

    print("\n✓ Migration completed successfully!")

if __name__ == "__main__":
    run_migration()
