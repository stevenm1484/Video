#!/usr/bin/env python
"""
Migration script to add priority, RTSP auth, and allow_dismiss fields
Run this script to update existing database schema
"""

import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(env_path)

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine
from sqlalchemy import text

def run_migration():
    """Add new columns to video_accounts and cameras tables"""

    with engine.connect() as conn:
        print("Starting migration...")

        # Add columns to video_accounts table
        print("Adding columns to video_accounts table...")

        try:
            conn.execute(text("""
                ALTER TABLE video_accounts
                ADD COLUMN priority INTEGER DEFAULT 5
            """))
            conn.commit()
            print("  ✓ Added priority column to video_accounts")
        except Exception as e:
            print(f"  ⚠ priority column may already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE video_accounts
                ADD COLUMN allow_dismiss BOOLEAN DEFAULT TRUE
            """))
            conn.commit()
            print("  ✓ Added allow_dismiss column to video_accounts")
        except Exception as e:
            print(f"  ⚠ allow_dismiss column may already exist: {e}")

        # Add columns to cameras table
        print("Adding columns to cameras table...")

        try:
            conn.execute(text("""
                ALTER TABLE cameras
                ADD COLUMN rtsp_username VARCHAR
            """))
            conn.commit()
            print("  ✓ Added rtsp_username column to cameras")
        except Exception as e:
            print(f"  ⚠ rtsp_username column may already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE cameras
                ADD COLUMN rtsp_password VARCHAR
            """))
            conn.commit()
            print("  ✓ Added rtsp_password column to cameras")
        except Exception as e:
            print(f"  ⚠ rtsp_password column may already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE cameras
                ADD COLUMN priority INTEGER
            """))
            conn.commit()
            print("  ✓ Added priority column to cameras")
        except Exception as e:
            print(f"  ⚠ priority column may already exist: {e}")

        try:
            conn.execute(text("""
                ALTER TABLE cameras
                ADD COLUMN allow_dismiss BOOLEAN
            """))
            conn.commit()
            print("  ✓ Added allow_dismiss column to cameras")
        except Exception as e:
            print(f"  ⚠ allow_dismiss column may already exist: {e}")

        print("\nMigration completed successfully!")
        print("\nNew fields added:")
        print("  VideoAccount:")
        print("    - priority (INTEGER, default=5)")
        print("    - allow_dismiss (BOOLEAN, default=TRUE)")
        print("  Camera:")
        print("    - rtsp_username (VARCHAR, nullable)")
        print("    - rtsp_password (VARCHAR, nullable)")
        print("    - priority (INTEGER, nullable - uses account default if NULL)")
        print("    - allow_dismiss (BOOLEAN, nullable - uses account default if NULL)")

if __name__ == "__main__":
    run_migration()
