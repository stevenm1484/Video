#!/usr/bin/env python3
"""
Add SIP extension and password columns to users table
"""
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not found in environment")
    exit(1)

engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        # Add sip_extension column
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS sip_extension VARCHAR;
        """))

        # Add sip_password column
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS sip_password VARCHAR;
        """))

        conn.commit()
        print("✓ Successfully added sip_extension and sip_password columns to users table")

except Exception as e:
    print(f"Error adding columns: {e}")
    exit(1)
