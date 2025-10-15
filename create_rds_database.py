#!/usr/bin/env python3
"""Create videomonitoring database in RDS"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv('/var/www/videomonitoring/backend/.env')

# Connect to default postgres database
DATABASE_URL = os.getenv("DATABASE_URL")
# Replace database name with 'postgres' for initial connection
base_url = DATABASE_URL.rsplit('/', 1)[0] + '/postgres'

print("Connecting to default postgres database...")
try:
    engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        # Check if database exists
        result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname='videomonitoring'"))
        exists = result.fetchone()

        if exists:
            print("✓ Database 'videomonitoring' already exists")
        else:
            print("Creating database 'videomonitoring'...")
            conn.execute(text("CREATE DATABASE videomonitoring"))
            print("✓ Database 'videomonitoring' created successfully!")

except Exception as e:
    print(f"✗ Error: {e}")
    exit(1)
