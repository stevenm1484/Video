#!/usr/bin/env python3
"""Update PostgreSQL sequences after migration"""
import os
import sys
from dotenv import load_dotenv

load_dotenv('/var/www/videomonitoring/backend/.env')
sys.path.insert(0, '/var/www/videomonitoring/backend')

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import User, VideoAccount, Camera, AlarmEvent, Alarm, ActivityLog, AccountClaim, Country, Group, Dealer

POSTGRES_URL = os.getenv("DATABASE_URL")
postgres_engine = create_engine(POSTGRES_URL)
PostgresSession = sessionmaker(bind=postgres_engine)
postgres_session = PostgresSession()

models_with_id = [
    (Country, "countries"),
    (Group, "groups"),
    (Dealer, "dealers"),
    (User, "users"),
    (VideoAccount, "video_accounts"),
    (Camera, "cameras"),
    (AlarmEvent, "alarm_events"),
    (Alarm, "alarms"),
    (ActivityLog, "activity_logs"),
    (AccountClaim, "account_claims"),
]

print("Updating PostgreSQL sequences...")
try:
    for model, table_name in models_with_id:
        count = postgres_session.query(model).count()
        if count > 0:
            sequence_name = f"{table_name}_id_seq"

            # Get max ID
            result = postgres_session.execute(text(f"SELECT MAX(id) FROM {table_name}"))
            max_id = result.fetchone()[0]

            if max_id:
                # Set sequence
                postgres_session.execute(text(f"SELECT setval('{sequence_name}', {max_id})"))
                postgres_session.commit()
                print(f"✓ {table_name:20s}: Sequence set to {max_id + 1}")

    print("\n✓ All sequences updated successfully!")

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    postgres_session.rollback()
    sys.exit(1)

finally:
    postgres_session.close()
