#!/usr/bin/env python3
import sqlite3

# Connect to the database
conn = sqlite3.connect('/var/www/videomonitoring/video_monitoring.db')
cursor = conn.cursor()

# Get current columns
cursor.execute("PRAGMA table_info(users)")
existing_columns = {row[1] for row in cursor.fetchall()}

print(f"Existing columns: {existing_columns}")

# Define all columns that should exist
required_columns = {
    'group_id': 'INTEGER',
    'dealer_id': 'INTEGER',
    'customer_id': 'INTEGER',
    'group_ids': 'TEXT',
    'dealer_ids': 'TEXT',
    'customer_ids': 'TEXT',
    'video_types': 'JSON DEFAULT "[]"',
    'country_ids': 'JSON DEFAULT "[]"',
    'access_level': 'VARCHAR DEFAULT "customer"',
    'role_type': 'VARCHAR DEFAULT "user"',
    'phone_number': 'TEXT',
    'two_factor_enabled': 'INTEGER DEFAULT 0',
    'two_factor_secret': 'TEXT',
    'two_factor_method': 'TEXT',
    'ip_whitelist': 'TEXT',
    'require_2fa_or_whitelist': 'INTEGER DEFAULT 0',
    'last_login_ip': 'TEXT',
    'last_login_at': 'TIMESTAMP'
}

# Add missing columns
for column_name, column_type in required_columns.items():
    if column_name not in existing_columns:
        try:
            sql = f'ALTER TABLE users ADD COLUMN {column_name} {column_type}'
            print(f"Adding column: {sql}")
            cursor.execute(sql)
            print(f"✓ Added {column_name}")
        except sqlite3.OperationalError as e:
            print(f"✗ Failed to add {column_name}: {e}")

# Also check video_accounts table
cursor.execute("PRAGMA table_info(video_accounts)")
existing_va_columns = {row[1] for row in cursor.fetchall()}

if 'disarm_schedules' not in existing_va_columns:
    try:
        cursor.execute('ALTER TABLE video_accounts ADD COLUMN disarm_schedules TEXT')
        print("✓ Added disarm_schedules to video_accounts")
    except sqlite3.OperationalError as e:
        print(f"✗ Failed to add disarm_schedules: {e}")

# Check cameras table
cursor.execute("PRAGMA table_info(cameras)")
existing_cam_columns = {row[1] for row in cursor.fetchall()}

if 'disarm_schedule_id' not in existing_cam_columns:
    try:
        cursor.execute('ALTER TABLE cameras ADD COLUMN disarm_schedule_id INTEGER')
        print("✓ Added disarm_schedule_id to cameras")
    except sqlite3.OperationalError as e:
        print(f"✗ Failed to add disarm_schedule_id: {e}")

# Commit changes
conn.commit()
conn.close()

print("\nMigration complete!")
