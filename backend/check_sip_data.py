#!/usr/bin/env python3
"""
Check SIP data in users table
"""
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, username, full_name, sip_extension, sip_password
            FROM users
            ORDER BY id
            LIMIT 10
        """))

        print("\n=== Users SIP Configuration ===\n")
        print(f"{'ID':<5} {'Username':<20} {'Full Name':<25} {'SIP Ext':<10} {'SIP Pass Set':<12}")
        print("-" * 90)

        for row in result:
            has_password = "Yes" if row.sip_password else "No"
            sip_ext = row.sip_extension or "(not set)"
            print(f"{row.id:<5} {row.username:<20} {row.full_name:<25} {sip_ext:<10} {has_password:<12}")

        print("\n")

except Exception as e:
    print(f"Error: {e}")
    exit(1)
