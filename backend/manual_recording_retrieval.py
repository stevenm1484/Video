#!/usr/bin/env python3
"""
Manual script to trigger recording retrieval for a specific event
"""
import asyncio
import sys
import os
from datetime import datetime
from dateutil import parser as date_parser
from pathlib import Path

# Add the backend directory to path
sys.path.insert(0, '/var/www/videomonitoring/backend')

# Load environment variables from .env file
from dotenv import load_dotenv
env_path = Path('/var/www/videomonitoring/backend/.env')
if env_path.exists():
    load_dotenv(env_path)
else:
    print(f"Warning: .env file not found at {env_path}")
    # Set defaults
    if not os.getenv('DATABASE_URL'):
        os.environ['DATABASE_URL'] = 'postgresql://postgres:ZUzXgq<<5sivAc4fSeX|~c|#s~#C@monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com:5432/videomonitoring'

from recording_retrieval import RecordingRetrieval
from database import SessionLocal
from models import AlarmEvent
from sqlalchemy.orm.attributes import flag_modified

async def retrieve_recording_for_event(event_id: int, uniqueid: str, call_timestamp_str: str):
    """
    Manually retrieve a recording for an event
    """
    db = SessionLocal()

    try:
        # Parse the call timestamp
        call_timestamp = date_parser.parse(call_timestamp_str)
        print(f"Event ID: {event_id}")
        print(f"Uniqueid: {uniqueid}")
        print(f"Call timestamp: {call_timestamp}")

        # Initialize recording retrieval
        retrieval = RecordingRetrieval()

        # Try to retrieve the recording
        print("\nAttempting to retrieve recording...")
        local_path = await retrieval.retrieve_and_download(uniqueid, call_timestamp, max_wait=60)

        if not local_path:
            print("❌ Could not retrieve recording")
            return False

        print(f"✅ Successfully retrieved recording: {local_path}")

        # Update event with recording path
        event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
        if event:
            current_media = event.media_paths if isinstance(event.media_paths, list) else []
            current_media.append(local_path)
            event.media_paths = current_media
            flag_modified(event, "media_paths")
            db.commit()
            print(f"✅ Updated event {event_id} with recording path")
            return True
        else:
            print(f"❌ Event {event_id} not found")
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python manual_recording_retrieval.py <event_id> <uniqueid> <call_timestamp>")
        print("Example: python manual_recording_retrieval.py 484 't9glqus7f7kds9rfaa7obe7mbc2el7' '2025-10-16T18:30:59.875Z'")
        sys.exit(1)

    event_id = int(sys.argv[1])
    uniqueid = sys.argv[2]
    call_timestamp = sys.argv[3]

    success = asyncio.run(retrieve_recording_for_event(event_id, uniqueid, call_timestamp))
    sys.exit(0 if success else 1)
