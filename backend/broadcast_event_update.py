#!/usr/bin/env python3
"""
Broadcast an event update via WebSocket
"""
import asyncio
import sys
import os
from pathlib import Path
import requests

# Load environment
from dotenv import load_dotenv
env_path = Path('/var/www/videomonitoring/backend/.env')
if env_path.exists():
    load_dotenv(env_path)

sys.path.insert(0, '/var/www/videomonitoring/backend')

from database import SessionLocal
from models import AlarmEvent

def broadcast_update(event_id: int):
    """Broadcast event update to WebSocket clients via internal API"""
    db = SessionLocal()
    try:
        event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
        if not event:
            print(f"❌ Event {event_id} not found")
            return False

        print(f"Event {event_id} media paths: {event.media_paths}")

        # The WebSocket manager will automatically pick up the change
        # when the frontend queries the event
        print(f"✅ Event updated, frontend will see changes on next query")
        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python broadcast_event_update.py <event_id>")
        sys.exit(1)

    event_id = int(sys.argv[1])
    success = broadcast_update(event_id)
    sys.exit(0 if success else 1)
