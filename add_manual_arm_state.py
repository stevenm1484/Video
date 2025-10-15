#!/usr/bin/env python3
"""
Migration script to add manual_arm_state column to cameras table
"""
import sys
import os
sys.path.insert(0, '/var/www/videomonitoring/backend')
os.chdir('/var/www/videomonitoring/backend')

from database import SessionLocal, engine
from sqlalchemy import text

def add_manual_arm_state_column():
    """Add manual_arm_state column to cameras table if it doesn't exist"""
    db = SessionLocal()
    try:
        # Check if column exists
        result = db.execute(text("PRAGMA table_info(cameras)")).fetchall()
        columns = [col[1] for col in result]

        if 'manual_arm_state' not in columns:
            print("Adding manual_arm_state column to cameras table...")
            db.execute(text("ALTER TABLE cameras ADD COLUMN manual_arm_state BOOLEAN DEFAULT NULL"))
            db.commit()
            print("✓ Column added successfully")
        else:
            print("✓ Column already exists")
    except Exception as e:
        print(f"✗ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_manual_arm_state_column()
