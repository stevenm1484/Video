#!/usr/bin/env python3
"""
Migration script to add timezone column to video_accounts table
"""
import sys
import os
sys.path.insert(0, '/var/www/videomonitoring/backend')
os.chdir('/var/www/videomonitoring/backend')

from database import SessionLocal
from sqlalchemy import text

def add_timezone_column():
    """Add timezone column to video_accounts table if it doesn't exist"""
    db = SessionLocal()
    try:
        # Check if column exists
        result = db.execute(text("PRAGMA table_info(video_accounts)")).fetchall()
        columns = [col[1] for col in result]

        if 'timezone' not in columns:
            print("Adding timezone column to video_accounts table...")
            db.execute(text("ALTER TABLE video_accounts ADD COLUMN timezone VARCHAR DEFAULT 'UTC'"))
            db.commit()
            print("✓ Column added successfully")

            # Set Mrs Smith's account to Eastern timezone
            print("Setting Mrs Smith's timezone to America/New_York...")
            db.execute(text("UPDATE video_accounts SET timezone = 'America/New_York' WHERE name LIKE '%Smith%'"))
            db.commit()
            print("✓ Mrs Smith's timezone updated")
        else:
            print("✓ Column already exists")
    except Exception as e:
        print(f"✗ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_timezone_column()
