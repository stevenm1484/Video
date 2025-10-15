#!/usr/bin/env python3
"""
Add activity tracking columns for billing and threshold management.
Adds columns to video_accounts and cameras tables for event counting and auto-snooze.
"""

import os
import sys
from sqlalchemy import create_engine, text, Column, Integer, DateTime, Boolean
from datetime import datetime

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:ZUzXgq<<5sivAc4fSeX|~c|#s~#C@monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com:5432/videomonitoring")

def add_columns():
    """Add activity tracking columns to video_accounts and cameras tables"""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        try:
            print("Adding activity tracking columns to video_accounts table...")

            # Add columns to video_accounts table
            account_columns = [
                "ALTER TABLE video_accounts ADD COLUMN IF NOT EXISTS monthly_event_count INTEGER DEFAULT 0",
                "ALTER TABLE video_accounts ADD COLUMN IF NOT EXISTS activity_threshold_warning INTEGER",  # NULL = no warning
                "ALTER TABLE video_accounts ADD COLUMN IF NOT EXISTS activity_snooze_threshold INTEGER",  # NULL = no auto-snooze
                "ALTER TABLE video_accounts ADD COLUMN IF NOT EXISTS activity_last_warning_sent_at TIMESTAMP",
                "ALTER TABLE video_accounts ADD COLUMN IF NOT EXISTS activity_auto_snoozed_at TIMESTAMP",  # When auto-snooze was triggered
                "ALTER TABLE video_accounts ADD COLUMN IF NOT EXISTS activity_billing_period_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP",  # Start of current billing period
                "ALTER TABLE video_accounts ADD COLUMN IF NOT EXISTS activity_billing_period_end TIMESTAMP",  # End of current billing period (for tracking)
            ]

            for sql in account_columns:
                conn.execute(text(sql))
                conn.commit()
                print(f"  ✓ {sql}")

            print("\nAdding activity tracking columns to cameras table...")

            # Add columns to cameras table (camera-level overrides)
            camera_columns = [
                "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS monthly_event_count INTEGER DEFAULT 0",
                "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS activity_threshold_warning INTEGER",  # NULL = use account setting
                "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS activity_snooze_threshold INTEGER",  # NULL = use account setting
                "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS activity_last_warning_sent_at TIMESTAMP",
                "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS activity_auto_snoozed_at TIMESTAMP",
            ]

            for sql in camera_columns:
                conn.execute(text(sql))
                conn.commit()
                print(f"  ✓ {sql}")

            print("\n✅ Activity tracking columns added successfully!")
            print("\nNew features enabled:")
            print("  - Monthly event counting per account and camera")
            print("  - Activity Threshold Warning: Send email alerts when threshold reached")
            print("  - Activity Auto-Snooze: Automatically snooze when threshold reached")
            print("  - Camera-level overrides available for both thresholds")
            print("  - Automatic monthly reset of counters")

        except Exception as e:
            print(f"❌ Error adding columns: {e}")
            conn.rollback()
            sys.exit(1)

if __name__ == "__main__":
    add_columns()
