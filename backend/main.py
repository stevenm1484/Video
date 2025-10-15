from dotenv import load_dotenv
import os

# Load environment variables from .env file BEFORE any other imports
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import text, func, case
from typing import List, Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

from database import get_db, engine, Base
from models import User, VideoAccount, Camera, Alarm, AlarmEvent, AccountClaim, Country, Group, Dealer, ActivityLog, UserActivityLog, CameraVitalSignsCheck, CameraVitalSignsStatus, Tool, ToolGroup, Apartment, Tenant
from schemas import (
    UserCreate, UserUpdate, UserResponse, Token,
    CountryCreate, CountryResponse,
    GroupCreate, GroupResponse,
    DealerCreate, DealerResponse,
    VideoAccountCreate, VideoAccountResponse,
    CameraCreate, CameraUpdate, CameraResponse,
    AlarmEventResponse, AlarmCreate, AlarmUpdate, AlarmResponse,
    TwoFactorSetupRequest, TwoFactorSetupResponse, TwoFactorVerifyRequest, IPWhitelistUpdate,
    SnoozeRequest, SnoozeResponse,
    EscalateRequest,
    VitalSignsCheckResponse, VitalSignsStatusResponse, VitalSignsSettingsUpdate,
    ToolCreate, ToolUpdate, ToolResponse,
    ToolGroupCreate, ToolGroupUpdate, ToolGroupResponse,
    ApartmentCreate, ApartmentUpdate, ApartmentResponse,
    TenantCreate, TenantUpdate, TenantResponse
)
from smtp_server import SMTPServer
from streaming_server import start_camera_stream, stop_camera_stream, is_camera_streaming, get_camera_stream_url, force_restart_camera_stream, capture_camera_snapshot, is_stream_ready
from two_factor_auth import two_factor_auth
from email_service import email_service
from sms_service import sms_service
from redis_coordinator import coordinator as redis_coordinator, set_redis_client as set_coordinator_redis
from vital_signs_service import VitalSignsService
from vital_signs_scheduler import vital_signs_scheduler
from ami_client import AMIClient
import asyncio
import json
import time
import hmac
import hashlib
import base64

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Video Monitoring Dashboard")

# Add validation error handler for debugging
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error on {request.method} {request.url}")
    logger.error(f"Validation errors: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )

# CORS configuration
# Allow origins from environment variable for production
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
origins_list = [origin.strip() for origin in allowed_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Redis for pub/sub across workers
import redis.asyncio as redis
import logging
import sys

# Configure logging to output to stdout
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)

logger = logging.getLogger(__name__)
redis_client = None

# Helper function to build RTSP URL with credentials
def build_rtsp_url_with_credentials(camera: Camera) -> str:
    """
    Build RTSP URL with embedded credentials if username/password are set.
    Handles various RTSP URL formats and inserts credentials properly.

    Args:
        camera: Camera object with rtsp_url, rtsp_username, rtsp_password

    Returns:
        RTSP URL with credentials embedded (if provided)
    """
    rtsp_url = camera.rtsp_url

    # If no credentials are set, return URL as-is
    if not camera.rtsp_username or not camera.rtsp_password:
        return rtsp_url

    # Parse the URL to inject credentials
    from urllib.parse import urlparse, urlunparse
    parsed = urlparse(rtsp_url)

    # If credentials already exist in URL, return as-is (don't duplicate)
    if parsed.username:
        return rtsp_url

    # Build netloc with credentials: username:password@host:port
    if parsed.port:
        netloc = f"{camera.rtsp_username}:{camera.rtsp_password}@{parsed.hostname}:{parsed.port}"
    else:
        netloc = f"{camera.rtsp_username}:{camera.rtsp_password}@{parsed.hostname}"

    # Reconstruct URL with credentials
    url_with_creds = urlunparse((
        parsed.scheme,
        netloc,
        parsed.path,
        parsed.params,
        parsed.query,
        parsed.fragment
    ))

    return url_with_creds

# WebSocket manager for real-time updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.alarm_viewers: Dict[WebSocket, dict] = {}  # {websocket: {"alarm_id": int, "account_id": int}}
        self.dashboard_viewers: set = set()  # Track connections viewing the dashboard
        self.pubsub = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.alarm_viewers:
            del self.alarm_viewers[websocket]
        if websocket in self.dashboard_viewers:
            self.dashboard_viewers.discard(websocket)

    def set_viewing_alarm(self, websocket: WebSocket, alarm_id: int, account_id: int):
        """Mark a connection as viewing a specific alarm"""
        self.alarm_viewers[websocket] = {"alarm_id": alarm_id, "account_id": account_id}
        # Remove from dashboard viewers when viewing an alarm
        self.dashboard_viewers.discard(websocket)
        logger.info(f"Connection now viewing alarm {alarm_id} for account {account_id}")

    def clear_viewing_alarm(self, websocket: WebSocket):
        """Clear alarm viewing status for a connection"""
        if websocket in self.alarm_viewers:
            del self.alarm_viewers[websocket]
            logger.info("Connection left alarm view")

    def set_on_dashboard(self, websocket: WebSocket):
        """Mark a connection as being on the dashboard"""
        self.dashboard_viewers.add(websocket)
        # Remove from alarm viewers when on dashboard
        if websocket in self.alarm_viewers:
            del self.alarm_viewers[websocket]
        logger.info("Connection is now on dashboard")

    def clear_from_dashboard(self, websocket: WebSocket):
        """Clear dashboard viewing status for a connection"""
        self.dashboard_viewers.discard(websocket)
        logger.info("Connection left dashboard")

    async def broadcast(self, message: dict):
        """Broadcast message via Redis pub/sub to all workers"""
        if redis_client:
            try:
                await redis_client.publish('websocket_events', json.dumps(message))
                logger.info(f"Published message to Redis: {message.get('type')}")
                # Don't send directly - let Redis listener handle it to avoid duplicates
                return
            except Exception as e:
                logger.error(f"Redis publish error: {e}")
                # Fall through to direct send if Redis fails

        # Send directly to local connections if Redis is not available
        await self._send_to_local_connections(message)

    async def _send_to_local_connections(self, message: dict):
        """Send message to WebSocket connections in this worker"""
        disconnected = []

        # List of message types that trigger dashboard updates
        dashboard_update_types = [
            'new_event', 'alarm_generated', 'event_dismissed',
            'alarm_resolved', 'alarm_reverted', 'event_escalated',
            'account_claimed', 'account_released'
        ]

        for connection in self.active_connections:
            try:
                msg_type = message.get("type")

                # Special handling for new_event messages
                if msg_type == "new_event":
                    # If user is viewing an alarm for this account, send to alarm page only
                    if connection in self.alarm_viewers:
                        viewer_info = self.alarm_viewers[connection]
                        if viewer_info.get("account_id") == message.get("account_id"):
                            logger.info(f"Sending new_event to alarm viewer for account {message.get('account_id')}")
                            await connection.send_json(message)
                            continue
                        else:
                            # Viewing a different account's alarm - don't send
                            continue
                    # If user is on dashboard, send it
                    elif connection in self.dashboard_viewers:
                        logger.info(f"Sending new_event to dashboard viewer")
                        await connection.send_json(message)
                        continue
                    else:
                        # User is neither on dashboard nor viewing alarm - don't send
                        continue

                # For other dashboard update messages, only send to dashboard viewers
                if msg_type in dashboard_update_types:
                    if connection in self.dashboard_viewers:
                        await connection.send_json(message)
                    else:
                        logger.info(f"Skipping {msg_type} broadcast - user not on dashboard")
                    continue

                # For all other message types (eyes_on updates, etc.), send to everyone
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

    async def start_listener(self):
        """Listen for Redis pub/sub messages with auto-reconnect"""
        while True:
            if not redis_client:
                await asyncio.sleep(5)
                continue

            try:
                self.pubsub = redis_client.pubsub()
                await self.pubsub.subscribe('websocket_events')
                logger.info("Redis listener subscribed to websocket_events")

                async for message in self.pubsub.listen():
                    if message['type'] == 'message':
                        try:
                            data = json.loads(message['data'])
                            await self._send_to_local_connections(data)
                        except Exception as e:
                            logger.error(f"Error processing Redis message: {e}")
            except asyncio.CancelledError:
                # Task was cancelled (during shutdown), exit gracefully
                logger.info("Redis listener cancelled, shutting down")
                break
            except Exception as e:
                logger.error(f"Redis listener error: {e}, reconnecting in 5 seconds...")
                try:
                    if self.pubsub:
                        await self.pubsub.close()
                except:
                    pass
                await asyncio.sleep(5)  # Wait before reconnecting

manager = ConnectionManager()

# Track last assigned user index for round-robin
last_assigned_user_index = 0

# Helper functions
async def assign_event_to_operator(account_id: int, db: Session):
    """
    Auto-assign pending events to available operators using round-robin.
    Returns the user_id if assigned, None if no operators available.

    Uses distributed lock to prevent race conditions in multi-worker environments.
    """
    global last_assigned_user_index

    logger.info(f"[AUTO-ASSIGN] Starting assignment for account {account_id}")

    # Use distributed lock to prevent multiple workers from assigning simultaneously
    async with redis_coordinator.distributed_lock(f"assign_event:{account_id}", timeout=10) as acquired:
        if not acquired:
            logger.warning(f"[AUTO-ASSIGN] Could not acquire lock for assigning account {account_id}")
            return None

        logger.info(f"[AUTO-ASSIGN] Lock acquired for account {account_id}")

        # Check if this account already has an active claim
        existing_claim = db.query(AccountClaim).filter(
            AccountClaim.account_id == account_id,
            AccountClaim.expires_at > datetime.utcnow()
        ).first()

        if existing_claim:
            # Account is already claimed, don't create duplicate
            logger.info(f"[AUTO-ASSIGN] Account {account_id} already claimed by user {existing_claim.user_id}")
            return existing_claim.user_id

        # Get all users who are in "receiving" mode
        # EXCLUDE user_escalate role - they only handle escalated items
        receiving_users = db.query(User).filter(
            User.is_receiving == True,
            User.is_active == True,
            User.role_type != "user_escalate"
        ).all()

        logger.info(f"[AUTO-ASSIGN] Found {len(receiving_users)} receiving users (excluding user_escalate)")

        if not receiving_users:
            logger.info(f"[AUTO-ASSIGN] No receiving operators available for account {account_id}")
            return None  # No one is receiving

        # Get all active claims to see who already has an event
        active_claims = db.query(AccountClaim).filter(
            AccountClaim.expires_at > datetime.utcnow()
        ).all()

        # Create a set of user IDs who already have active events
        busy_user_ids = {claim.user_id for claim in active_claims}

        # Filter to only available users (receiving AND not busy)
        available_users = [u for u in receiving_users if u.id not in busy_user_ids]

        if not available_users:
            return None  # All receiving users are busy

        # Use Redis for round-robin counter (shared across workers)
        counter_key = "assignment_counter"
        counter = await redis_coordinator.increment(counter_key)
        selected_index = counter % len(available_users)
        selected_user = available_users[selected_index]

        # Create account claim for this user
        claim = AccountClaim(
            account_id=account_id,
            user_id=selected_user.id,
            claimed_at=datetime.utcnow(),
            last_activity=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=30)
        )
        db.add(claim)
        db.commit()

        # Register claim in Redis for cross-worker visibility
        await redis_coordinator.set_with_ttl(
            f"claim:{account_id}",
            {"user_id": selected_user.id, "username": selected_user.username},
            1800  # 30 minutes
        )

        # Broadcast the assignment
        await manager.broadcast({
            "type": "event_auto_assigned",
            "account_id": account_id,
            "user_id": selected_user.id,
            "username": selected_user.username
        })

        logger.info(f"[AUTO-ASSIGN] Successfully assigned account {account_id} to user {selected_user.id} ({selected_user.username})")

        return selected_user.id

async def assign_escalated_event_to_escalate_user(account_id: int, db: Session):
    """
    Auto-assign escalated events to available user_escalate operators using round-robin.
    Returns the user_id if assigned, None if no operators available.

    Uses distributed lock to prevent race conditions in multi-worker environments.
    """
    logger.info(f"[AUTO-ASSIGN-ESCALATE] Starting assignment for account {account_id}")

    # Use distributed lock to prevent multiple workers from assigning simultaneously
    async with redis_coordinator.distributed_lock(f"assign_escalate:{account_id}", timeout=10) as acquired:
        if not acquired:
            logger.warning(f"[AUTO-ASSIGN-ESCALATE] Could not acquire lock for assigning account {account_id}")
            return None

        logger.info(f"[AUTO-ASSIGN-ESCALATE] Lock acquired for account {account_id}")

        # Check if this account already has an active claim
        existing_claim = db.query(AccountClaim).filter(
            AccountClaim.account_id == account_id,
            AccountClaim.expires_at > datetime.utcnow()
        ).first()

        if existing_claim:
            # Account is already claimed, don't create duplicate
            logger.info(f"[AUTO-ASSIGN-ESCALATE] Account {account_id} already claimed by user {existing_claim.user_id}")
            return existing_claim.user_id

        # Get all user_escalate users who are in "receiving" mode
        receiving_escalate_users = db.query(User).filter(
            User.is_receiving == True,
            User.is_active == True,
            User.role_type == "user_escalate"
        ).all()

        logger.info(f"[AUTO-ASSIGN-ESCALATE] Found {len(receiving_escalate_users)} receiving user_escalate users")

        if not receiving_escalate_users:
            logger.info(f"[AUTO-ASSIGN-ESCALATE] No receiving escalate operators available for account {account_id}")
            return None  # No one is receiving

        # Get all active claims to see who already has an event
        active_claims = db.query(AccountClaim).filter(
            AccountClaim.expires_at > datetime.utcnow()
        ).all()

        # Create a set of user IDs who already have active events
        busy_user_ids = {claim.user_id for claim in active_claims}

        # Filter to only available users (receiving AND not busy)
        available_users = [u for u in receiving_escalate_users if u.id not in busy_user_ids]

        if not available_users:
            logger.info(f"[AUTO-ASSIGN-ESCALATE] All escalate users are busy for account {account_id}")
            return None  # All receiving users are busy

        # Use Redis for round-robin counter (shared across workers)
        counter_key = "escalate_assignment_counter"
        counter = await redis_coordinator.increment(counter_key)
        selected_index = counter % len(available_users)
        selected_user = available_users[selected_index]

        # Create account claim for this user
        claim = AccountClaim(
            account_id=account_id,
            user_id=selected_user.id,
            claimed_at=datetime.utcnow(),
            last_activity=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=30)
        )
        db.add(claim)
        db.commit()

        # Register claim in Redis for cross-worker visibility
        await redis_coordinator.set_with_ttl(
            f"claim:{account_id}",
            {"user_id": selected_user.id, "username": selected_user.username},
            1800  # 30 minutes
        )

        # Broadcast the assignment
        await manager.broadcast({
            "type": "escalated_event_auto_assigned",
            "account_id": account_id,
            "user_id": selected_user.id,
            "username": selected_user.username
        })

        logger.info(f"[AUTO-ASSIGN-ESCALATE] Successfully assigned account {account_id} to user_escalate user {selected_user.id} ({selected_user.username})")

        return selected_user.id

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_accessible_account_ids(current_user: User, db: Session) -> List[int]:
    """
    Get list of account IDs that the current user has access to based on hierarchy.
    This enforces the same access control as /api/accounts endpoint.
    Returns empty list if user has no access, or None if user is super/country admin (access to all).
    """
    # Parse user's assigned IDs
    user_group_ids = current_user.group_ids if isinstance(current_user.group_ids, list) else (json.loads(current_user.group_ids) if current_user.group_ids else [])
    user_dealer_ids = current_user.dealer_ids if isinstance(current_user.dealer_ids, list) else (json.loads(current_user.dealer_ids) if current_user.dealer_ids else [])
    user_customer_ids = current_user.customer_ids if isinstance(current_user.customer_ids, list) else (json.loads(current_user.customer_ids) if current_user.customer_ids else [])

    # Super admin and country admin see all accounts
    if current_user.role in ["super_admin", "country_admin"] or current_user.access_level in ["super_admin", "country"]:
        return None  # None means access to all

    # Most specific - only show explicitly assigned customers
    if user_customer_ids:
        return user_customer_ids

    # Show all accounts in assigned dealers
    if user_dealer_ids:
        accounts = db.query(VideoAccount.id).filter(VideoAccount.dealer_id.in_(user_dealer_ids)).all()
        return [acc.id for acc in accounts]

    # Show all accounts in assigned groups
    if user_group_ids:
        accounts = db.query(VideoAccount.id).filter(VideoAccount.group_id.in_(user_group_ids)).all()
        return [acc.id for acc in accounts]

    # User has no assignments - return empty list
    return []

# ============================================================================
# Webhook Endpoints (Public - No Authentication Required)
# ============================================================================

async def poll_and_update_parking_slot(event_id: int, call_uniqueid: str):
    """
    Background task to poll AMI for parking slot and update event
    This runs asynchronously to avoid blocking the webhook response
    """
    from database import SessionLocal
    db = SessionLocal()

    try:
        logger.info(f"Polling AMI for parking slot (event_id={event_id}, uniqueid={call_uniqueid})")
        ami_client = AMIClient()

        found_slot = await ami_client.find_parking_slot_by_uniqueid(call_uniqueid, max_attempts=5, delay=1.0)

        if found_slot:
            logger.info(f"AMI polling found parking slot {found_slot} for event {event_id}")

            # Update event with parking slot
            event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
            if event:
                event.parked_slot = found_slot
                db.commit()

                # Broadcast update to WebSocket clients
                await manager.broadcast({
                    "type": "event_updated",
                    "event_id": event_id,
                    "parked_slot": found_slot
                })
                logger.info(f"Updated event {event_id} with parking slot {found_slot}")
            else:
                logger.error(f"Event {event_id} not found when updating parking slot")
        else:
            logger.error(f"Could not find parking slot for event {event_id} (uniqueid: {call_uniqueid})")

    except Exception as e:
        logger.error(f"Error in poll_and_update_parking_slot: {e}", exc_info=True)
    finally:
        db.close()

async def capture_call_event_video(event_id: int, camera_id: int):
    """
    Background task to capture 5-second video clip when call event is created
    This runs asynchronously to avoid blocking the webhook response
    """
    import subprocess
    from pathlib import Path
    from database import SessionLocal

    db = SessionLocal()

    try:
        # Get camera details
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            logger.error(f"Camera {camera_id} not found for video capture")
            return

        if not camera.rtsp_url:
            logger.warning(f"Camera {camera.name} has no RTSP URL configured - skipping video capture")
            return

        # Build authenticated RTSP URL
        rtsp_url = camera.rtsp_url
        if camera.rtsp_username and camera.rtsp_password:
            import urllib.parse
            parsed = urllib.parse.urlparse(rtsp_url)
            rtsp_url = f"{parsed.scheme}://{camera.rtsp_username}:{camera.rtsp_password}@{parsed.netloc}{parsed.path}"
            if parsed.query:
                rtsp_url += f"?{parsed.query}"
            if parsed.fragment:
                rtsp_url += f"#{parsed.fragment}"

        # Create unique filename for this video
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        dest_filename = f"call_event_{event_id}_{timestamp}.mp4"
        uploads_dir = Path("/mnt/media/uploads")
        dest_path = uploads_dir / dest_filename

        logger.info(f"Capturing 5-second video for call event {event_id} from camera {camera.name}")

        # Capture 5 seconds of video from RTSP stream
        try:
            cmd = [
                '/usr/local/bin/ffmpeg',
                '-rtsp_transport', 'tcp',
                '-i', rtsp_url,
                '-t', '5',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-c:a', 'aac',
                '-y',
                str(dest_path)
            ]

            # Run ffmpeg with timeout
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=15,
                text=True
            )

            if result.returncode != 0 or not dest_path.exists():
                logger.error(f"FFmpeg failed for event {event_id}: {result.stderr[:200]}")
                return

            logger.info(f"Successfully captured video for event {event_id}: {dest_filename}")

            # Update event with video path
            event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
            if event:
                # Add video to media_paths
                current_media = event.media_paths if isinstance(event.media_paths, list) else []
                current_media.append(f"uploads/{dest_filename}")
                event.media_paths = current_media
                flag_modified(event, "media_paths")  # Mark as modified for SQLAlchemy
                db.commit()

                # Broadcast update to WebSocket clients
                await manager.broadcast({
                    "type": "event_updated",
                    "event_id": event_id,
                    "media_paths": current_media
                })
                logger.info(f"Updated event {event_id} with video capture")
            else:
                logger.error(f"Event {event_id} not found when updating media_paths")

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout capturing video for event {event_id}")
        except Exception as e:
            logger.error(f"Video capture error for event {event_id}: {str(e)}")

    except Exception as e:
        logger.error(f"Error in capture_call_event_video: {e}", exc_info=True)
    finally:
        db.close()

async def retrieve_call_recording(event_id: int, uniqueid: str, call_timestamp: datetime):
    """
    Background task to retrieve call recording from PBX
    Waits for recording to be available, downloads it, and adds to event media
    """
    from recording_retrieval import RecordingRetrieval
    from database import SessionLocal

    db = SessionLocal()

    try:
        logger.info(f"Starting call recording retrieval for event {event_id}, uniqueid: {uniqueid}")

        # Initialize recording retrieval
        retrieval = RecordingRetrieval()

        # Wait up to 60 seconds for recording to be available and download it
        # Recordings may take 10-30 seconds to appear after call ends
        # If uniqueid doesn't match (due to parking), falls back to timestamp search
        local_path = await retrieval.retrieve_and_download(uniqueid, call_timestamp, max_wait=60)

        if not local_path:
            logger.warning(f"Could not retrieve recording for event {event_id}")
            return

        # Update event with recording path
        event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
        if event:
            # Add recording to media_paths
            current_media = event.media_paths if isinstance(event.media_paths, list) else []
            current_media.append(local_path)
            event.media_paths = current_media
            flag_modified(event, "media_paths")
            db.commit()

            # Broadcast update to WebSocket clients
            await manager.broadcast({
                "type": "event_updated",
                "event_id": event_id,
                "media_paths": current_media
            })
            logger.info(f"Added call recording to event {event_id}: {local_path}")
        else:
            logger.error(f"Event {event_id} not found when updating with recording")

    except Exception as e:
        logger.error(f"Error retrieving call recording for event {event_id}: {e}", exc_info=True)
    finally:
        db.close()

@app.post("/api/inbound_call")
async def inbound_call_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Webhook endpoint for FreePBX inbound call notifications
    Receives call metadata when a call is parked and creates an alarm event
    """
    try:
        # Read raw request body
        body_bytes = await request.body()
        body_str = body_bytes.decode('utf-8')

        # Parse JSON payload
        try:
            payload = json.loads(body_str)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in webhook payload: {body_str[:200]}")
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        # Verify HMAC signature
        signature_header = request.headers.get("X-Signature", "")
        if not signature_header.startswith("sha256="):
            logger.error("Missing or invalid X-Signature header")
            raise HTTPException(status_code=401, detail="Missing or invalid signature")

        received_signature = signature_header[7:]  # Remove "sha256=" prefix
        shared_secret = os.getenv("WEBHOOK_SHARED_SECRET", "")

        if not shared_secret:
            logger.error("WEBHOOK_SHARED_SECRET not configured")
            raise HTTPException(status_code=500, detail="Webhook secret not configured")

        # Compute expected signature
        expected_signature_bytes = hmac.new(
            shared_secret.encode('utf-8'),
            body_bytes,
            hashlib.sha256
        ).digest()
        expected_signature = base64.b64encode(expected_signature_bytes).decode('utf-8')

        # Compare signatures (constant-time comparison)
        if not hmac.compare_digest(received_signature, expected_signature):
            logger.error(f"Signature mismatch. Expected: {expected_signature}, Received: {received_signature}")
            raise HTTPException(status_code=401, detail="Invalid signature")

        logger.info(f"Webhook signature verified successfully")

        # Extract call metadata
        caller_id_num = payload.get("caller_id_num", "")
        caller_id_name = payload.get("caller_id_name", "")
        call_uniqueid = payload.get("uniqueid", "")
        parked_slot = payload.get("parked_slot", "")
        parked_lot = payload.get("lot", "default")
        timeout_sec = payload.get("timeout_sec", 300)

        # Remove +1 prefix for matching
        lookup_number = caller_id_num.lstrip("+1") if caller_id_num.startswith("+1") else caller_id_num

        logger.info(f"Inbound call webhook: caller={caller_id_num} ({caller_id_name}), slot={parked_slot}, uniqueid={call_uniqueid}")
        logger.info(f"Looking up inbound_phone_number: {lookup_number}")

        # Logic: Check camera first, then account
        # 1. Try to find camera with matching inbound_phone_number
        camera = db.query(Camera).filter(Camera.inbound_phone_number == lookup_number).first()

        if camera:
            logger.info(f"Found camera match: {camera.name} (ID: {camera.id})")
        else:
            # 2. Try to find account with matching inbound_phone_number
            account = db.query(VideoAccount).filter(VideoAccount.inbound_phone_number == lookup_number).first()

            if account:
                # Use first camera from account (or camera with ID=1 if exists in account)
                cameras = db.query(Camera).filter(Camera.account_id == account.id).order_by(Camera.camera_number).all()
                if cameras:
                    camera = cameras[0]  # Use first camera
                    logger.info(f"Found account match: {account.name}, using camera: {camera.name} (ID: {camera.id})")
                else:
                    logger.error(f"Account {account.name} has no cameras")
                    raise HTTPException(status_code=404, detail=f"Account {account.name} has no cameras")
            else:
                # 3. No match found - use camera ID 1 as fallback
                camera = db.query(Camera).filter(Camera.id == 1).first()
                if not camera:
                    logger.error(f"No camera or account match for {lookup_number} and no fallback camera ID 1")
                    raise HTTPException(status_code=404, detail=f"No camera or account found for phone number {lookup_number}")
                logger.warning(f"No match for {lookup_number}, using fallback camera ID 1: {camera.name}")

        # Create alarm event with call metadata
        db_event = AlarmEvent(
            camera_id=camera.id,
            timestamp=datetime.utcnow(),
            media_type="call",  # Special type for phone-triggered events
            media_paths=[],  # No media files for call events
            status="pending",
            call_uniqueid=call_uniqueid,
            caller_id_num=caller_id_num,
            caller_id_name=caller_id_name,
            parked_slot=parked_slot,
            parked_lot=parked_lot,
            call_timeout_sec=timeout_sec,
            call_status="parked"
        )

        db.add(db_event)
        db.commit()
        db.refresh(db_event)

        logger.info(f"Created alarm event {db_event.id} for call from {caller_id_num}")

        # Start background task to poll AMI for parking slot (don't block webhook response)
        if call_uniqueid and not parked_slot:
            logger.info(f"Starting background task to poll AMI for parking slot (uniqueid: {call_uniqueid})")
            asyncio.create_task(poll_and_update_parking_slot(db_event.id, call_uniqueid))

        # Start background task to capture 5-second video from camera (don't block webhook response)
        logger.info(f"Starting background task to capture video for call event {db_event.id}")
        asyncio.create_task(capture_call_event_video(db_event.id, camera.id))

        # Start background task to retrieve call recording from PBX (don't block webhook response)
        if call_uniqueid:
            logger.info(f"Starting background task to retrieve call recording for event {db_event.id}")
            asyncio.create_task(retrieve_call_recording(db_event.id, call_uniqueid, db_event.timestamp))

        # Broadcast event to WebSocket clients
        try:
            # Fetch full event data with relationships
            event_data = db.query(AlarmEvent).filter(AlarmEvent.id == db_event.id).first()
            account = db.query(VideoAccount).join(Camera).filter(Camera.id == event_data.camera_id).first()

            event_dict = {
                "id": event_data.id,
                "camera_id": event_data.camera_id,
                "camera_name": camera.name,
                "account_id": account.account_id if account else None,
                "account_name": account.name if account else None,
                "timestamp": event_data.timestamp.isoformat() if event_data.timestamp else None,
                "media_type": event_data.media_type,
                "media_paths": event_data.media_paths if isinstance(event_data.media_paths, list) else [],
                "status": event_data.status,
                "call_uniqueid": event_data.call_uniqueid,
                "caller_id_num": event_data.caller_id_num,
                "caller_id_name": event_data.caller_id_name,
                "parked_slot": event_data.parked_slot,
                "call_status": event_data.call_status,
            }

            await manager.broadcast({
                "type": "new_event",
                "event": event_dict
            })
            logger.info(f"Broadcasted call event {db_event.id} via WebSocket")
        except Exception as e:
            logger.error(f"Error broadcasting event: {e}")

        return {
            "success": True,
            "message": "Call event created successfully",
            "event_id": db_event.id,
            "camera_id": camera.id,
            "camera_name": camera.name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing inbound call webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# ============================================================================
# Authentication endpoints
# ============================================================================

@app.post("/api/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db), request: Request = None):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Update last login IP
    client_ip = request.client.host if request else None
    user.last_login_ip = client_ip
    user.last_login_at = datetime.utcnow()
    db.commit()

    # Parse security requirements
    ip_whitelist = user.ip_whitelist if isinstance(user.ip_whitelist, list) else (json.loads(user.ip_whitelist) if user.ip_whitelist else [])
    has_ip_whitelist = ip_whitelist and len(ip_whitelist) > 0
    ip_whitelisted = has_ip_whitelist and client_ip and two_factor_auth.check_ip_whitelist(client_ip, ip_whitelist)

    logger.info(f"Login attempt for {user.username}: 2FA={user.two_factor_enabled}, method={user.two_factor_method}, require_whitelist={user.require_2fa_or_whitelist}, has_ips={has_ip_whitelist}")

    # Check security requirements
    # If BOTH require_2fa_or_whitelist (IP whitelist) AND two_factor_enabled are true,
    # user must satisfy BOTH conditions (but only if IP whitelist actually has entries)
    if user.require_2fa_or_whitelist and has_ip_whitelist and user.two_factor_enabled:
        # BOTH required - check IP whitelist first
        if not ip_whitelisted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Your IP address is not whitelisted. Please login from an authorized location.",
            )

        # IP is whitelisted, now require 2FA
        temp_token_expires = timedelta(minutes=5)
        temp_token = create_access_token(
            data={"sub": user.username, "temp": True}, expires_delta=temp_token_expires
        )

        # Generate and send 2FA code based on method
        if user.two_factor_method == 'sms':
            code = two_factor_auth.generate_random_code()
            two_factor_auth.store_temp_code(user.id, code, 'sms')
            sms_service.send_2fa_code(user.phone_number, code, user.username)
            logger.info(f"Sent SMS 2FA code to {user.username}")
        elif user.two_factor_method == 'email':
            code = two_factor_auth.generate_random_code()
            two_factor_auth.store_temp_code(user.id, code, 'email')
            email_service.send_2fa_code(user.email, code, user.username)
            logger.info(f"Sent email 2FA code to {user.username}")
        # TOTP doesn't need code generation - user uses authenticator app

        return {
            "access_token": "",
            "token_type": "bearer",
            "requires_2fa": True,
            "temp_token": temp_token
        }

    # Only IP whitelist required (and IP whitelist actually has entries)
    elif user.require_2fa_or_whitelist and has_ip_whitelist:
        if ip_whitelisted:
            logger.info(f"User {user.username} logged in from whitelisted IP: {client_ip}")
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": user.username}, expires_delta=access_token_expires
            )

            # Log user login activity
            from audit_helper import log_user_activity
            log_user_activity(
                db=db,
                action="user_login",
                user_id=user.id,
                username=user.username,
                ip_address=client_ip,
                details={"auth_method": "ip_whitelist"}
            )

            return {"access_token": access_token, "token_type": "bearer", "requires_2fa": False}
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Your IP address is not whitelisted. Please contact your administrator to add your IP address.",
            )

    # Only 2FA required
    elif user.two_factor_enabled:
        logger.info(f"Entering 2FA-only path for {user.username}")
        temp_token_expires = timedelta(minutes=5)
        temp_token = create_access_token(
            data={"sub": user.username, "temp": True}, expires_delta=temp_token_expires
        )

        # Generate and send 2FA code based on method
        logger.info(f"2FA required for {user.username}, method: {user.two_factor_method}")
        if user.two_factor_method == 'sms':
            code = two_factor_auth.generate_random_code()
            two_factor_auth.store_temp_code(user.id, code, 'sms')
            logger.info(f"Generated SMS code {code} for {user.username}")
            sms_service.send_2fa_code(user.phone_number, code, user.username)
            logger.info(f"Sent SMS 2FA code to {user.username} at {user.phone_number}")
        elif user.two_factor_method == 'email':
            code = two_factor_auth.generate_random_code()
            two_factor_auth.store_temp_code(user.id, code, 'email')
            logger.info(f"Generated email code {code} for {user.username}")
            result = email_service.send_2fa_code(user.email, code, user.username)
            logger.info(f"Sent email 2FA code to {user.username} at {user.email}, result: {result}")
        # TOTP doesn't need code generation - user uses authenticator app

        return {
            "access_token": "",
            "token_type": "bearer",
            "requires_2fa": True,
            "temp_token": temp_token
        }

    # No 2FA required - normal login
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    # Log user login activity
    from audit_helper import log_user_activity
    log_user_activity(
        db=db,
        action="user_login",
        user_id=user.id,
        username=user.username,
        ip_address=client_ip,
        details={"auth_method": "password_only"}
    )

    return {"access_token": access_token, "token_type": "bearer", "requires_2fa": False}

@app.post("/api/users", response_model=UserResponse)
async def create_user(user: UserCreate, current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    # Check if user already exists
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    # Check permissions - only admins can create users
    if current_user.role not in ["super_admin", "country_admin", "group_admin", "dealer_admin", "customer_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can create users")

    # Validate role permissions based on current user's role
    if current_user.role == "customer_admin":
        # Customer admin can only create customer_user
        if user.role not in ["customer_user"]:
            raise HTTPException(status_code=403, detail="Customer admins can only create customer users")
        # Must be in same customer
        if user.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Can only create users for your customer")

    elif current_user.role == "dealer_admin":
        # Dealer admin can create dealer users and customer admins/users
        if user.role not in ["dealer_user", "customer_admin", "customer_user"]:
            raise HTTPException(status_code=403, detail="Dealer admins can only create dealer and customer users")
        # Must be in same dealer
        if user.dealer_id != current_user.dealer_id and user.role.startswith("dealer"):
            raise HTTPException(status_code=403, detail="Can only create dealer users for your dealer")

    elif current_user.role == "group_admin":
        # Group admin can create group users, dealer admins/users, customer admins/users
        if user.role in ["super_admin", "country_admin"]:
            raise HTTPException(status_code=403, detail="Group admins cannot create super admins or country admins")
        # Must be in same group
        if user.group_id != current_user.group_id and user.role.startswith("group"):
            raise HTTPException(status_code=403, detail="Can only create group users for your group")

    # Super admin and country admin have no restrictions

    hashed_password = get_password_hash(user.password)

    # Auto-generate combined role from access_level + role_type for backward compatibility
    # If old 'role' field was provided (and not None), use it; otherwise generate from new fields
    if user.role is not None and user.role != "":
        combined_role = user.role
    else:
        combined_role = f"{user.access_level}_{user.role_type}"

    # Generate TOTP secret if admin enables TOTP for user
    totp_secret = None
    if user.two_factor_enabled and user.two_factor_method == 'totp':
        totp_secret = two_factor_auth.generate_totp_secret()

    db_user = User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password,
        access_level=user.access_level,
        role_type=user.role_type,
        role=combined_role,  # Combined format for backward compatibility
        group_id=user.group_id,
        dealer_id=user.dealer_id,
        customer_id=user.customer_id,
        country_ids=user.country_ids,
        group_ids=user.group_ids,
        dealer_ids=user.dealer_ids,
        customer_ids=user.customer_ids,
        video_types=user.video_types,
        is_active=True,
        # Security fields
        phone_number=user.phone_number,
        two_factor_enabled=user.two_factor_enabled,
        two_factor_method=user.two_factor_method,
        two_factor_secret=totp_secret,
        ip_whitelist=user.ip_whitelist,
        require_2fa_or_whitelist=user.require_2fa_or_whitelist,
        # SIP/PBX fields
        sip_extension=user.sip_extension,
        sip_password=user.sip_password,
        phone_dialing_enabled=user.phone_dialing_enabled
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/api/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

@app.put("/api/users/me/receiving-status")
async def toggle_receiving_status(
    is_receiving: bool,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Toggle the receiving status for the current user"""
    current_user.is_receiving = is_receiving
    db.commit()

    # Log user activity
    from audit_helper import log_user_activity
    action = "receiving_enabled" if is_receiving else "receiving_disabled"
    log_user_activity(
        db=db,
        action=action,
        user_id=current_user.id,
        username=current_user.username,
        ip_address=None,
        details={"manual_toggle": True}
    )

    # Broadcast the status change to all connected clients
    await manager.broadcast({
        "type": "operator_receiving_status_changed",
        "user_id": current_user.id,
        "username": current_user.username,
        "is_receiving": is_receiving
    })

    return {"is_receiving": is_receiving, "message": f"Receiving status set to {'ON' if is_receiving else 'OFF'}"}

@app.post("/api/users/me/logout")
async def logout_user(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    """Logout user and track activity"""
    # Update last logout timestamp
    current_user.last_logout_at = datetime.utcnow()

    # Set receiving to false on logout
    was_receiving = current_user.is_receiving
    current_user.is_receiving = False
    db.commit()

    # Log logout activity
    from audit_helper import log_user_activity
    client_ip = request.client.host if request else None
    log_user_activity(
        db=db,
        action="user_logout",
        user_id=current_user.id,
        username=current_user.username,
        ip_address=client_ip,
        details={"was_receiving": was_receiving}
    )

    # If was receiving, also log auto-disable
    if was_receiving:
        log_user_activity(
            db=db,
            action="receiving_auto_disabled",
            user_id=current_user.id,
            username=current_user.username,
            ip_address=client_ip,
            details={"reason": "logout"}
        )

    # Broadcast status change
    await manager.broadcast({
        "type": "operator_receiving_status_changed",
        "user_id": current_user.id,
        "username": current_user.username,
        "is_receiving": False
    })

    return {"message": "Logged out successfully"}

@app.post("/api/users/me/auto-disable-receiving")
async def auto_disable_receiving(
    reason: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    """Auto-disable receiving status (page refresh, tab blur, alarm navigation, active_event)"""
    was_receiving = current_user.is_receiving

    if was_receiving:
        # Save previous state for scenarios where we want to restore it
        # active_event and alarm_navigation should restore state when user returns
        # page_refresh and tab_blur should NOT restore (user intentionally left/refreshed)
        if reason in ['active_event', 'alarm_navigation']:
            current_user.previous_receiving_state = True

        current_user.is_receiving = False
        db.commit()

        # Log auto-disable activity
        from audit_helper import log_user_activity
        client_ip = request.client.host if request else None
        log_user_activity(
            db=db,
            action="receiving_auto_disabled",
            user_id=current_user.id,
            username=current_user.username,
            ip_address=client_ip,
            details={"reason": reason, "saved_state": reason in ['active_event', 'alarm_navigation']}
        )

        # Broadcast status change
        await manager.broadcast({
            "type": "operator_receiving_status_changed",
            "user_id": current_user.id,
            "username": current_user.username,
            "is_receiving": False
        })

    return {"was_receiving": was_receiving, "is_receiving": False, "reason": reason}

@app.post("/api/users/me/restore-receiving")
async def restore_receiving_state(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Restore receiving state from previous_receiving_state (used after dismissing events or resolving alarms)"""
    should_restore = current_user.previous_receiving_state == True

    if should_restore:
        current_user.is_receiving = True
        current_user.previous_receiving_state = None  # Clear the saved state
        db.commit()

        # Log the restoration
        from audit_helper import log_user_activity
        log_user_activity(
            db=db,
            action="receiving_enabled",
            user_id=current_user.id,
            username=current_user.username,
            ip_address=None,
            details={"auto_restored": True, "reason": "returned_to_dashboard"}
        )

        # Broadcast status change
        await manager.broadcast({
            "type": "operator_receiving_status_changed",
            "user_id": current_user.id,
            "username": current_user.username,
            "is_receiving": True
        })

        return {"restored": True, "is_receiving": True, "message": "Receiving status restored"}
    else:
        # No state to restore, just clear any stale value
        if current_user.previous_receiving_state is not None:
            current_user.previous_receiving_state = None
            db.commit()

        return {"restored": False, "is_receiving": current_user.is_receiving, "message": "No state to restore"}

@app.get("/api/users", response_model=List[UserResponse])
async def get_users(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get users based on current user's role and hierarchy"""
    if current_user.role not in ["super_admin", "country_admin", "group_admin", "dealer_admin", "customer_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can view users")

    # Super admin and country admin can see all users
    if current_user.role in ["super_admin", "country_admin"]:
        return db.query(User).all()

    # Group admin can see users in their group (excluding super_admins and country_admins)
    if current_user.role == "group_admin":
        if not current_user.group_id:
            return []  # Group admin must be assigned to a group
        return db.query(User).filter(
            User.group_id == current_user.group_id,
            User.role.notin_(["super_admin", "country_admin"])
        ).all()

    # Dealer admin can see users in their dealer (excluding super_admins, country_admins, and group admins)
    if current_user.role == "dealer_admin":
        if not current_user.dealer_id:
            return []  # Dealer admin must be assigned to a dealer
        return db.query(User).filter(
            User.dealer_id == current_user.dealer_id,
            User.role.notin_(["super_admin", "country_admin", "group_admin"])
        ).all()

    # Customer admin can see users in their customer only
    if current_user.role == "customer_admin":
        if not current_user.customer_id:
            return []  # Customer admin must be assigned to a customer
        return db.query(User).filter(
            User.customer_id == current_user.customer_id,
            User.role.notin_(["super_admin", "country_admin", "group_admin", "dealer_admin"])
        ).all()

    return []

@app.get("/api/users/status")
async def get_users_status(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get real-time status of all users with their active events"""
    # Get all users
    users = db.query(User).all()

    # Get all dashboard items to find active events
    from datetime import datetime, timedelta
    cutoff_time = datetime.utcnow() - timedelta(hours=24)

    # Get active events (claimed by users)
    active_events = db.query(AlarmEvent).filter(
        AlarmEvent.status.in_(['pending', 'escalated']),
        AlarmEvent.timestamp >= cutoff_time,
        AlarmEvent.claimed_by.isnot(None)
    ).all()

    # Build user status list
    user_status_list = []
    for user in users:
        # Find active event for this user
        active_event = next((e for e in active_events if e.claimed_by == user.id), None)

        # Get last activity and not receiving reason
        last_activity_log = db.query(UserActivityLog).filter(
            UserActivityLog.user_id == user.id
        ).order_by(UserActivityLog.timestamp.desc()).first()

        last_activity = None
        not_receiving_reason = None

        if last_activity_log:
            # Format timestamp
            time_diff = datetime.utcnow() - last_activity_log.timestamp
            if time_diff.total_seconds() < 60:
                last_activity = "Just now"
            elif time_diff.total_seconds() < 3600:
                minutes = int(time_diff.total_seconds() / 60)
                last_activity = f"{minutes}m ago"
            elif time_diff.total_seconds() < 86400:
                hours = int(time_diff.total_seconds() / 3600)
                last_activity = f"{hours}h ago"
            else:
                days = int(time_diff.total_seconds() / 86400)
                last_activity = f"{days}d ago"

        # Get the reason for not receiving if user is not receiving
        if not user.is_receiving:
            # Find the last receiving_auto_disabled or receiving_disabled action
            disabled_log = db.query(UserActivityLog).filter(
                UserActivityLog.user_id == user.id,
                UserActivityLog.action.in_(['receiving_auto_disabled', 'receiving_disabled'])
            ).order_by(UserActivityLog.timestamp.desc()).first()

            if disabled_log and disabled_log.details:
                reason = disabled_log.details.get('reason', 'Manual')
                # Format the reason to be more user-friendly
                reason_map = {
                    'page_refresh': 'Page Refresh',
                    'tab_blur': 'Tab Lost Focus',
                    'active_event': 'Has Active Event',
                    'alarm_navigation': 'Viewing Alarm',
                    'manual': 'Manual'
                }
                not_receiving_reason = reason_map.get(reason, reason.replace('_', ' ').title())
            else:
                not_receiving_reason = 'Manual'

        user_data = {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "is_receiving": user.is_receiving or False,
            "not_receiving_reason": not_receiving_reason,
            "active_event": None,
            "last_activity": last_activity
        }

        if active_event:
            # Get account info
            camera = db.query(Camera).filter(Camera.id == active_event.camera_id).first()
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first() if camera else None

            user_data["active_event"] = {
                "event_id": active_event.id,
                "account_number": account.account_number if account else "Unknown",
                "account_name": account.name if account else "Unknown"
            }

        user_status_list.append(user_data)

    return user_status_list

@app.put("/api/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update user - admins only"""
    logger.info(f"Updating user {user_id} with data: {user_update.model_dump()}")
    if current_user.role not in ["super_admin", "country_admin", "group_admin", "dealer_admin", "customer_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can update users")

    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent editing users above your level
    if current_user.role == "customer_admin":
        if db_user.role not in ["customer_user"] or db_user.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Cannot edit this user")
        # Can't change role or promote
        if user_update.role != "customer_user":
            raise HTTPException(status_code=403, detail="Cannot change user role")

    elif current_user.role == "dealer_admin":
        if db_user.role in ["super_admin", "country_admin", "group_admin"] or (db_user.dealer_id != current_user.dealer_id and db_user.role.startswith("dealer")):
            raise HTTPException(status_code=403, detail="Cannot edit this user")
        # Can't create super_admin, country_admin, or group_admin
        if user_update.role in ["super_admin", "country_admin", "group_admin"]:
            raise HTTPException(status_code=403, detail="Cannot assign this role")

    elif current_user.role == "group_admin":
        if db_user.role in ["super_admin", "country_admin"] or (db_user.group_id != current_user.group_id and db_user.role.startswith("group")):
            raise HTTPException(status_code=403, detail="Cannot edit this user")
        # Can't create super_admin or country_admin
        if user_update.role in ["super_admin", "country_admin"]:
            raise HTTPException(status_code=403, detail="Cannot assign super admin or country admin role")

    # Update fields
    db_user.username = user_update.username
    db_user.email = user_update.email
    db_user.full_name = user_update.full_name
    db_user.access_level = user_update.access_level
    db_user.role_type = user_update.role_type

    # Auto-generate combined role from access_level + role_type for backward compatibility
    # If old 'role' field was provided (and not None), use it; otherwise generate from new fields
    if user_update.role is not None and user_update.role != "":
        db_user.role = user_update.role
    else:
        # If access_level and role_type are the same (like super_admin), just use that value
        # Otherwise combine them with underscore
        if user_update.access_level == user_update.role_type:
            db_user.role = user_update.access_level
        else:
            db_user.role = f"{user_update.access_level}_{user_update.role_type}"

    db_user.group_id = user_update.group_id
    db_user.dealer_id = user_update.dealer_id
    db_user.customer_id = user_update.customer_id
    db_user.is_active = user_update.is_active

    # Update new array fields
    db_user.country_ids = user_update.country_ids
    db_user.group_ids = user_update.group_ids
    db_user.dealer_ids = user_update.dealer_ids
    db_user.customer_ids = user_update.customer_ids
    db_user.video_types = user_update.video_types

    # Update security fields
    db_user.phone_number = user_update.phone_number
    db_user.two_factor_enabled = user_update.two_factor_enabled
    db_user.two_factor_method = user_update.two_factor_method
    db_user.ip_whitelist = user_update.ip_whitelist
    db_user.require_2fa_or_whitelist = user_update.require_2fa_or_whitelist

    # Update SIP/PBX fields
    db_user.sip_extension = user_update.sip_extension
    # Only update SIP password if provided (don't overwrite with empty string)
    if user_update.sip_password:
        db_user.sip_password = user_update.sip_password
    db_user.phone_dialing_enabled = user_update.phone_dialing_enabled

    # Generate TOTP secret if admin enables TOTP for user (and no secret exists)
    if user_update.two_factor_enabled and user_update.two_factor_method == 'totp' and not db_user.two_factor_secret:
        db_user.two_factor_secret = two_factor_auth.generate_totp_secret()
    # Clear secret if 2FA is disabled or method changes from TOTP
    elif not user_update.two_factor_enabled or user_update.two_factor_method != 'totp':
        db_user.two_factor_secret = None

    # Mark JSON fields as modified so SQLAlchemy tracks the changes
    flag_modified(db_user, "country_ids")
    flag_modified(db_user, "group_ids")
    flag_modified(db_user, "dealer_ids")
    flag_modified(db_user, "customer_ids")
    flag_modified(db_user, "video_types")
    flag_modified(db_user, "ip_whitelist")

    # Update password if provided
    if user_update.password:
        db_user.hashed_password = get_password_hash(user_update.password)

    db.commit()
    db.refresh(db_user)
    return db_user

@app.delete("/api/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete user - admins only"""
    if current_user.role not in ["super_admin", "country_admin", "group_admin", "dealer_admin", "customer_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can delete users")

    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting users above your level
    if current_user.role == "customer_admin":
        if db_user.role not in ["customer_user"] or db_user.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Cannot delete this user")

    elif current_user.role == "dealer_admin":
        if db_user.role in ["super_admin", "country_admin", "group_admin"] or (db_user.dealer_id != current_user.dealer_id and db_user.role.startswith("dealer")):
            raise HTTPException(status_code=403, detail="Cannot delete this user")

    elif current_user.role == "group_admin":
        if db_user.role in ["super_admin", "country_admin"] or (db_user.group_id != current_user.group_id and db_user.role.startswith("group")):
            raise HTTPException(status_code=403, detail="Cannot delete this user")

    db.delete(db_user)
    db.commit()
    return {"message": "User deleted successfully"}

# Two-Factor Authentication endpoints
@app.post("/api/2fa/setup", response_model=TwoFactorSetupResponse)
async def setup_2fa(
    setup_request: TwoFactorSetupRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Setup 2FA for the current user"""
    method = setup_request.method

    if method not in ['sms', 'totp', 'email']:
        raise HTTPException(status_code=400, detail="Invalid 2FA method. Must be 'sms', 'totp', or 'email'")

    # Validate phone number for SMS
    if method == 'sms':
        if not setup_request.phone_number:
            raise HTTPException(status_code=400, detail="Phone number is required for SMS 2FA")

        is_valid, formatted_phone = two_factor_auth.validate_phone_number(setup_request.phone_number)
        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid phone number format")

        current_user.phone_number = formatted_phone

    # Generate TOTP secret for TOTP method
    if method == 'totp':
        secret = two_factor_auth.generate_totp_secret()
        current_user.two_factor_secret = secret

        # Generate QR code
        qr_code = two_factor_auth.generate_qr_code(secret, current_user.username)

        current_user.two_factor_method = 'totp'
        current_user.two_factor_enabled = True
        db.commit()

        return TwoFactorSetupResponse(
            message="TOTP 2FA enabled successfully. Scan the QR code with your authenticator app.",
            method='totp',
            qr_code=qr_code,
            secret=secret
        )

    # For SMS and Email, just enable the method
    current_user.two_factor_method = method
    current_user.two_factor_enabled = True
    db.commit()

    return TwoFactorSetupResponse(
        message=f"{method.upper()} 2FA enabled successfully",
        method=method
    )

@app.post("/api/2fa/verify")
async def verify_2fa(
    verify_request: TwoFactorVerifyRequest,
    db: Session = Depends(get_db)
):
    """Verify 2FA code and complete login"""
    if not verify_request.temp_token:
        raise HTTPException(status_code=400, detail="Temporary token is required")

    # Decode temp token to get username
    try:
        payload = jwt.decode(verify_request.temp_token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        is_temp = payload.get("temp", False)

        if not username or not is_temp:
            raise HTTPException(status_code=401, detail="Invalid temporary token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired temporary token")

    # Get user
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify code based on method
    code_valid = False

    if user.two_factor_method == 'totp':
        # Verify TOTP code
        if user.two_factor_secret:
            code_valid = two_factor_auth.verify_totp_code(user.two_factor_secret, verify_request.code)
    elif user.two_factor_method in ['sms', 'email']:
        # Verify temporary code
        code_valid = two_factor_auth.verify_temp_code(user.id, verify_request.code)

    if not code_valid:
        raise HTTPException(status_code=401, detail="Invalid verification code")

    # Generate real access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    logger.info(f"User {user.username} completed 2FA successfully")

    # Log user login activity
    from audit_helper import log_user_activity
    log_user_activity(
        db=db,
        action="user_login",
        user_id=user.id,
        username=user.username,
        ip_address=None,  # IP not available in 2FA verify endpoint
        details={"auth_method": f"2fa_{user.two_factor_method}"}
    )

    return {"access_token": access_token, "token_type": "bearer", "requires_2fa": False}

@app.post("/api/2fa/disable")
async def disable_2fa(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Disable 2FA for the current user"""
    current_user.two_factor_enabled = False
    current_user.two_factor_secret = None
    current_user.two_factor_method = None
    db.commit()

    logger.info(f"User {current_user.username} disabled 2FA")

    return {"message": "2FA disabled successfully"}

@app.put("/api/users/{user_id}/ip-whitelist", response_model=UserResponse)
async def update_ip_whitelist(
    user_id: int,
    whitelist_update: IPWhitelistUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update IP whitelist for a user - admins only"""
    if current_user.role not in ["super_admin", "country_admin", "group_admin", "dealer_admin", "customer_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can update IP whitelists")

    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update IP whitelist
    db_user.ip_whitelist = whitelist_update.ip_whitelist
    flag_modified(db_user, "ip_whitelist")
    db.commit()
    db.refresh(db_user)

    logger.info(f"Admin {current_user.username} updated IP whitelist for user {db_user.username}")

    return db_user

@app.put("/api/users/{user_id}/require-2fa", response_model=UserResponse)
async def update_require_2fa(
    user_id: int,
    require_2fa: bool,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Enable/disable 2FA requirement for a user - admins only"""
    if current_user.role not in ["super_admin", "country_admin", "group_admin", "dealer_admin", "customer_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can modify 2FA requirements")

    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update 2FA requirement
    db_user.require_2fa_or_whitelist = require_2fa
    db.commit()
    db.refresh(db_user)

    logger.info(f"Admin {current_user.username} set require_2fa_or_whitelist={require_2fa} for user {db_user.username}")

    return db_user

# Country endpoints
@app.post("/api/countries", response_model=CountryResponse)
async def create_country(
    country: CountryCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new country - super_admin only"""
    if current_user.role not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins can create countries")

    db_country = Country(
        name=country.name,
        address=country.address,
        phone=country.phone,
        website=country.website,
        notification_emails=country.notification_emails
    )
    db.add(db_country)
    db.commit()
    db.refresh(db_country)
    return db_country

@app.get("/api/countries", response_model=List[CountryResponse])
async def get_countries(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all countries"""
    return db.query(Country).all()

@app.put("/api/countries/{country_id}", response_model=CountryResponse)
async def update_country(
    country_id: int,
    country: CountryCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update country - super_admin only"""
    if current_user.role not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins can update countries")

    db_country = db.query(Country).filter(Country.id == country_id).first()
    if not db_country:
        raise HTTPException(status_code=404, detail="Country not found")

    db_country.name = country.name
    db_country.address = country.address
    db_country.phone = country.phone
    db_country.website = country.website
    db_country.notification_emails = country.notification_emails
    db.commit()
    db.refresh(db_country)
    return db_country

@app.delete("/api/countries/{country_id}")
async def delete_country(
    country_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete country - super_admin only"""
    if current_user.role not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins can delete countries")

    db_country = db.query(Country).filter(Country.id == country_id).first()
    if not db_country:
        raise HTTPException(status_code=404, detail="Country not found")

    db.delete(db_country)
    db.commit()
    return {"message": "Country deleted successfully"}

# Group endpoints
@app.post("/api/groups", response_model=GroupResponse)
async def create_group(
    group: GroupCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new group - super_admin only"""
    if current_user.role not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins can create groups")

    db_group = Group(
        name=group.name,
        country_id=group.country_id,
        address=group.address,
        phone=group.phone,
        website=group.website,
        notification_emails=group.notification_emails
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

@app.get("/api/groups", response_model=List[GroupResponse])
async def get_groups(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all groups"""
    return db.query(Group).all()

@app.put("/api/groups/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group: GroupCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update group - super_admin only"""
    if current_user.role not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins can update groups")

    db_group = db.query(Group).filter(Group.id == group_id).first()
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")

    db_group.name = group.name
    db_group.country_id = group.country_id
    db_group.address = group.address
    db_group.phone = group.phone
    db_group.website = group.website
    db_group.notification_emails = group.notification_emails
    db.commit()
    db.refresh(db_group)
    return db_group

@app.delete("/api/groups/{group_id}")
async def delete_group(
    group_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete group - super_admin only"""
    if current_user.role not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins can delete groups")

    db_group = db.query(Group).filter(Group.id == group_id).first()
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")

    db.delete(db_group)
    db.commit()
    return {"message": "Group deleted successfully"}

# Dealer endpoints
@app.post("/api/dealers", response_model=DealerResponse)
async def create_dealer(
    dealer: DealerCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new dealer - super_admin, country_admin, and group_admin only"""
    if current_user.role not in ["super_admin", "country_admin", "group_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins, country admins, and group admins can create dealers")

    db_dealer = Dealer(
        name=dealer.name,
        group_id=dealer.group_id,
        address=dealer.address,
        phone=dealer.phone,
        website=dealer.website,
        notification_emails=dealer.notification_emails
    )
    db.add(db_dealer)
    db.commit()
    db.refresh(db_dealer)
    return db_dealer

@app.get("/api/dealers", response_model=List[DealerResponse])
async def get_dealers(
    group_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all dealers, optionally filtered by group"""
    query = db.query(Dealer)
    if group_id:
        query = query.filter(Dealer.group_id == group_id)
    return query.all()

@app.put("/api/dealers/{dealer_id}", response_model=DealerResponse)
async def update_dealer(
    dealer_id: int,
    dealer: DealerCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update dealer - super_admin, country_admin, and group_admin only"""
    if current_user.role not in ["super_admin", "country_admin", "group_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins, country admins, and group admins can update dealers")

    db_dealer = db.query(Dealer).filter(Dealer.id == dealer_id).first()
    if not db_dealer:
        raise HTTPException(status_code=404, detail="Dealer not found")

    db_dealer.name = dealer.name
    db_dealer.group_id = dealer.group_id
    db_dealer.address = dealer.address
    db_dealer.phone = dealer.phone
    db_dealer.website = dealer.website
    db_dealer.notification_emails = dealer.notification_emails
    db.commit()
    db.refresh(db_dealer)
    return db_dealer

@app.delete("/api/dealers/{dealer_id}")
async def delete_dealer(
    dealer_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete dealer - super_admin, country_admin, and group_admin only"""
    if current_user.role not in ["super_admin", "country_admin", "group_admin"]:
        raise HTTPException(status_code=403, detail="Only super admins, country admins, and group admins can delete dealers")

    db_dealer = db.query(Dealer).filter(Dealer.id == dealer_id).first()
    if not db_dealer:
        raise HTTPException(status_code=404, detail="Dealer not found")

    db.delete(db_dealer)
    db.commit()
    return {"message": "Dealer deleted successfully"}


# Video Account endpoints
@app.post("/api/accounts", response_model=VideoAccountResponse)
async def create_account(
    account: VideoAccountCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    account_data = account.dict()

    # Auto-generate unique 8-digit account_id if not provided
    if not account_data.get('account_id'):
        import random
        # Generate random 8-digit ID and ensure it's unique
        while True:
            account_id = ''.join([str(random.randint(0, 9)) for _ in range(8)])
            existing = db.query(VideoAccount).filter(VideoAccount.account_id == account_id).first()
            if not existing:
                account_data['account_id'] = account_id
                break

    # Auto-assign group_id and dealer_id based on current user's role
    # If user has null values, they can manually set them (super_admin)
    # Otherwise, automatically inherit from the user's assignment
    if current_user.dealer_id and not account_data.get('dealer_id'):
        # User is assigned to a dealer - auto-assign this account to that dealer
        account_data['dealer_id'] = current_user.dealer_id

        # Also get the dealer's group_id and assign it
        dealer = db.query(Dealer).filter(Dealer.id == current_user.dealer_id).first()
        if dealer and not account_data.get('group_id'):
            account_data['group_id'] = dealer.group_id
    elif current_user.group_id and not account_data.get('group_id'):
        # User is assigned to a group (but no dealer) - auto-assign group
        account_data['group_id'] = current_user.group_id

    # If neither group_id nor dealer_id are set (super_admin with null values),
    # use whatever was provided in the request (could be null or manually selected)

    db_account = VideoAccount(**account_data)
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

@app.get("/api/accounts", response_model=List[VideoAccountResponse])
async def get_accounts(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get accounts based on user's hierarchy (groups, dealers, customers) and video type"""
    # Parse user's assigned IDs and video types
    user_group_ids = current_user.group_ids if isinstance(current_user.group_ids, list) else (json.loads(current_user.group_ids) if current_user.group_ids else [])
    user_dealer_ids = current_user.dealer_ids if isinstance(current_user.dealer_ids, list) else (json.loads(current_user.dealer_ids) if current_user.dealer_ids else [])
    user_customer_ids = current_user.customer_ids if isinstance(current_user.customer_ids, list) else (json.loads(current_user.customer_ids) if current_user.customer_ids else [])
    user_video_types = current_user.video_types if isinstance(current_user.video_types, list) else (json.loads(current_user.video_types) if current_user.video_types else [])

    # Build query based on user's assignments with priority logic
    # Priority: customers > dealers > groups
    # If user has specific customers, ONLY show those (ignore dealer/group)
    # If user has dealers (and no customers), show all accounts in those dealers
    # If user has only groups, show all accounts in those groups

    if current_user.role in ["super_admin", "country_admin"] or current_user.access_level in ["super_admin", "country"]:
        # Super admin and country admin see all - but filter by video type if specified
        accounts = db.query(VideoAccount).all()
    elif user_customer_ids:
        # Most specific - only show explicitly assigned customers
        accounts = db.query(VideoAccount).filter(VideoAccount.id.in_(user_customer_ids)).all()
    elif user_dealer_ids:
        # Show all accounts in assigned dealers
        accounts = db.query(VideoAccount).filter(VideoAccount.dealer_id.in_(user_dealer_ids)).all()
    elif user_group_ids:
        # Show all accounts in assigned groups
        accounts = db.query(VideoAccount).filter(VideoAccount.group_id.in_(user_group_ids)).all()
    else:
        # User has no assignments - return empty list
        return []

    # Apply video type filter if user has video_types specified
    # VIDEO TYPE OVERRIDE: If user has video_types set, ONLY show accounts matching those types
    if user_video_types and len(user_video_types) > 0:
        filtered_accounts = []
        for account in accounts:
            # If account has video_type=None (All Types), exclude it from restricted users
            # Only show accounts with explicit matching video types
            if account.video_type is not None and account.video_type in user_video_types:
                filtered_accounts.append(account)
        return filtered_accounts

    return accounts

@app.get("/api/accounts/{account_id}", response_model=VideoAccountResponse)
async def get_account(
    account_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account

@app.put("/api/accounts/{account_id}", response_model=VideoAccountResponse)
async def update_account(
    account_id: int,
    account: VideoAccountCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    db_account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Only update fields that were explicitly set (exclude defaults)
    update_data = account.model_dump(exclude_unset=True)

    # Convert disarm_schedules to JSON string if it's a list/dict
    if 'disarm_schedules' in update_data and update_data['disarm_schedules'] is not None:
        if not isinstance(update_data['disarm_schedules'], str):
            update_data['disarm_schedules'] = json.dumps(update_data['disarm_schedules'])

    for key, value in update_data.items():
        setattr(db_account, key, value)

    db.commit()
    db.refresh(db_account)
    return db_account

@app.delete("/api/accounts/{account_id}")
async def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    db_account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    db.delete(db_account)
    db.commit()
    return {"message": "Account deleted successfully"}

# Camera endpoints
@app.post("/api/cameras", response_model=CameraResponse)
async def create_camera(
    camera: CameraCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    camera_data = camera.dict()

    # Auto-generate camera_number if not provided
    if not camera_data.get('camera_number'):
        # Get the highest camera_number for this account
        max_camera = db.query(Camera).filter(
            Camera.account_id == camera_data['account_id']
        ).order_by(Camera.camera_number.desc()).first()

        camera_data['camera_number'] = (max_camera.camera_number + 1) if max_camera else 1

    # Generate unique SMTP email for camera
    import uuid
    smtp_email = f"camera-{uuid.uuid4().hex[:8]}@video.statewidecentralstation.com"

    db_camera = Camera(**camera_data, smtp_email=smtp_email)
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    return db_camera

@app.get("/api/cameras", response_model=List[CameraResponse])
async def get_cameras(
    account_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    query = db.query(Camera)
    if account_id:
        query = query.filter(Camera.account_id == account_id)
    return query.all()

@app.get("/api/cameras/account/{account_id}", response_model=List[CameraResponse])
async def get_cameras_by_account(
    account_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all cameras for a specific account"""
    return db.query(Camera).filter(Camera.account_id == account_id).all()

@app.put("/api/cameras/{camera_id}")
async def update_camera(
    camera_id: int,
    camera_update: CameraUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Check if RTSP URL is changing
    rtsp_url_changed = camera.rtsp_url != camera_update.rtsp_url

    # If RTSP URL changed and stream is active, stop it first
    if rtsp_url_changed and await is_camera_streaming(camera_id):
        await stop_camera_stream(camera_id)

    # Update camera fields (only update fields that are provided)
    update_data = camera_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(camera, key, value)

    db.commit()
    db.refresh(camera)

    # If RTSP URL or credentials changed, force restart stream for fresh live content
    if rtsp_url_changed and camera.rtsp_url:
        rtsp_url = build_rtsp_url_with_credentials(camera)
        await force_restart_camera_stream(camera_id, rtsp_url)

    return camera

@app.delete("/api/cameras/{camera_id}")
async def delete_camera(
    camera_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    db_camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Stop any active stream before deleting
    await stop_camera_stream(camera_id)
    
    db.delete(db_camera)
    db.commit()
    return {"message": "Camera deleted successfully"}

# Streaming endpoints
@app.post("/api/cameras/{camera_id}/start-stream")
async def start_camera_streaming(
    camera_id: int,
    quality: str = 'low',  # 'low', 'medium', or 'high'
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if not camera.rtsp_url:
        raise HTTPException(status_code=400, detail="Camera has no RTSP URL configured")

    # Validate quality parameter
    if quality not in ['low', 'medium', 'high']:
        quality = 'low'

    # Build RTSP URL with credentials if configured
    rtsp_url = build_rtsp_url_with_credentials(camera)

    # Add viewer tracking (reference counting)
    from streaming_server import add_stream_viewer, get_stream_viewer_count
    viewer_id = f"user_{current_user.id}"
    logger.info(f"[START-STREAM] Camera {camera_id}: Adding viewer {viewer_id}")
    viewer_count = await add_stream_viewer(camera_id, viewer_id)
    logger.info(f"[START-STREAM] Camera {camera_id}: Total viewers: {viewer_count}")

    # Check if stream is already active
    if await is_camera_streaming(camera_id):
        # Import health check function
        from streaming_server import is_stream_healthy as check_stream_health

        # Check if stream is healthy
        is_healthy = await check_stream_health(camera_id, max_age_seconds=10)
        if is_healthy:
            return {
                "message": "Stream already active and healthy",
                "stream_url": await get_camera_stream_url(camera_id),
                "viewer_count": viewer_count
            }
        else:
            # Stream exists but is frozen - force restart it
            logger.warning(f"Stream for camera {camera_id} is frozen, forcing restart...")
            success = await force_restart_camera_stream(camera_id, rtsp_url)
    else:
        # Start the stream with specified quality
        success = await start_camera_stream(camera_id, rtsp_url, quality)
    if success:
        # Wait for stream to be ready (playlist file created) - max 10 seconds
        max_wait = 10  # seconds
        wait_interval = 0.5  # seconds
        elapsed = 0
        stream_url = None

        while elapsed < max_wait:
            if await is_stream_ready(camera_id):
                stream_url = await get_camera_stream_url(camera_id)
                if stream_url:
                    break
            await asyncio.sleep(wait_interval)
            elapsed += wait_interval

        if stream_url:
            return {
                "message": "Stream started successfully",
                "stream_url": stream_url,
                "quality": quality,
                "viewer_count": viewer_count
            }
        else:
            # Stream started but playlist not ready yet - return without URL
            # Frontend should poll stream-status endpoint
            return {
                "message": "Stream starting, playlist not ready yet",
                "stream_url": None,
                "quality": quality,
                "viewer_count": viewer_count
            }
    else:
        raise HTTPException(status_code=500, detail="Failed to start stream")

@app.post("/api/cameras/{camera_id}/restart-stream")
async def restart_camera_streaming(
    camera_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Force restart camera stream for fresh live content"""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    if not camera.rtsp_url:
        raise HTTPException(status_code=400, detail="Camera has no RTSP URL configured")
    
    # Build RTSP URL with credentials if configured
    rtsp_url = build_rtsp_url_with_credentials(camera)

    # Force restart the stream
    success = await force_restart_camera_stream(camera_id, rtsp_url)
    if success:
        stream_url = await get_camera_stream_url(camera_id)
        return {"message": "Stream restarted successfully", "stream_url": stream_url}
    else:
        raise HTTPException(status_code=500, detail="Failed to restart stream")

@app.post("/api/cameras/{camera_id}/stop-stream")
async def stop_camera_streaming(
    camera_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Remove viewer tracking (reference counting)
    from streaming_server import remove_stream_viewer, should_stop_stream, get_stream_viewer_count
    viewer_id = f"user_{current_user.id}"
    logger.info(f"[STOP-STREAM] Camera {camera_id}: Removing viewer {viewer_id}")
    viewer_count = await remove_stream_viewer(camera_id, viewer_id)
    logger.info(f"[STOP-STREAM] Camera {camera_id}: Remaining viewers: {viewer_count}")

    # Check if we should actually stop the stream
    should_stop = await should_stop_stream(camera_id)
    logger.info(f"[STOP-STREAM] Camera {camera_id}: should_stop={should_stop}, viewer_count={viewer_count}")

    if should_stop and viewer_count == 0:
        # No viewers remain and grace period expired - actually stop the stream
        logger.info(f"[STOP-STREAM] Camera {camera_id}: Stopping stream (no viewers, grace expired)")
        success = await stop_camera_stream(camera_id)
        if success:
            return {
                "message": "Stream stopped successfully",
                "viewer_count": 0,
                "stopped": True
            }
        else:
            return {
                "message": "Stream was not active",
                "viewer_count": 0,
                "stopped": False
            }
    else:
        # Stream is still in use or within grace period - don't stop it
        logger.info(f"[STOP-STREAM] Camera {camera_id}: NOT stopping (viewers={viewer_count}, grace period active)")
        return {
            "message": f"Viewer removed, stream will continue for {viewer_count} other viewer(s)" if viewer_count > 0 else "Viewer removed, stream will stop in 30s if no new viewers",
            "viewer_count": viewer_count,
            "stopped": False
        }

@app.get("/api/cameras/{camera_id}/stream-status")
async def get_camera_stream_status(
    camera_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    is_active = await is_camera_streaming(camera_id)
    stream_url = await get_camera_stream_url(camera_id) if is_active else None

    return {
        "camera_id": camera_id,
        "is_streaming": is_active,
        "stream_url": stream_url,
        "rtsp_url": camera.rtsp_url
    }

@app.post("/api/cameras/{camera_id}/snapshot")
async def capture_snapshot(
    camera_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Capture a snapshot from the camera's RTSP stream"""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if not camera.rtsp_url:
        raise HTTPException(status_code=400, detail="Camera has no RTSP URL configured")

    # Build RTSP URL with credentials if configured
    rtsp_url = build_rtsp_url_with_credentials(camera)

    snapshot_path = await capture_camera_snapshot(camera_id, rtsp_url)

    if snapshot_path:
        return {
            "message": "Snapshot captured successfully",
            "snapshot_url": f"/{snapshot_path}"
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to capture snapshot")

# Snooze endpoints
@app.post("/api/cameras/{camera_id}/snooze", response_model=SnoozeResponse)
async def snooze_camera(
    camera_id: int,
    snooze_request: SnoozeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Snooze a camera to suppress alarm creation"""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Calculate snooze_until datetime
    if snooze_request.until_datetime:
        snoozed_until = snooze_request.until_datetime
    elif snooze_request.duration_minutes:
        snoozed_until = datetime.utcnow() + timedelta(minutes=snooze_request.duration_minutes)
    else:
        raise HTTPException(status_code=400, detail="Must provide either duration_minutes or until_datetime")

    # Update camera snooze fields
    camera.snoozed_until = snoozed_until
    camera.snoozed_by = current_user.id
    camera.snoozed_at = datetime.utcnow()

    db.commit()

    return SnoozeResponse(
        success=True,
        snoozed_until=snoozed_until,
        message=f"Camera snoozed until {snoozed_until.strftime('%Y-%m-%d %H:%M:%S')} UTC"
    )

@app.post("/api/cameras/{camera_id}/unsnooze", response_model=SnoozeResponse)
async def unsnooze_camera(
    camera_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Remove snooze from a camera"""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Clear snooze fields
    camera.snoozed_until = None
    camera.snoozed_by = None
    camera.snoozed_at = None

    db.commit()

    return SnoozeResponse(
        success=True,
        snoozed_until=None,
        message="Camera snooze removed"
    )

@app.post("/api/accounts/{account_id}/snooze", response_model=SnoozeResponse)
async def snooze_account(
    account_id: int,
    snooze_request: SnoozeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Snooze an account to suppress alarm creation for all its cameras"""
    account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Calculate snooze_until datetime
    if snooze_request.until_datetime:
        snoozed_until = snooze_request.until_datetime
    elif snooze_request.duration_minutes:
        snoozed_until = datetime.utcnow() + timedelta(minutes=snooze_request.duration_minutes)
    else:
        raise HTTPException(status_code=400, detail="Must provide either duration_minutes or until_datetime")

    # Update account snooze fields
    account.snoozed_until = snoozed_until
    account.snoozed_by = current_user.id
    account.snoozed_at = datetime.utcnow()

    db.commit()

    return SnoozeResponse(
        success=True,
        snoozed_until=snoozed_until,
        message=f"Account snoozed until {snoozed_until.strftime('%Y-%m-%d %H:%M:%S')} UTC"
    )

@app.post("/api/accounts/{account_id}/unsnooze", response_model=SnoozeResponse)
async def unsnooze_account(
    account_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Remove snooze from an account"""
    account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Clear snooze fields
    account.snoozed_until = None
    account.snoozed_by = None
    account.snoozed_at = None

    db.commit()

    return SnoozeResponse(
        success=True,
        snoozed_until=None,
        message="Account snooze removed"
    )

# Alarm Event endpoints
@app.get("/api/events", response_model=List[AlarmEventResponse])
async def get_events(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    query = db.query(AlarmEvent)
    if status:
        query = query.filter(AlarmEvent.status == status)
    return query.order_by(AlarmEvent.timestamp.desc()).all()

@app.get("/api/dashboard-items")
async def get_dashboard_items(
    show_all_holds: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get both pending events and active alarms grouped by account"""
    # Parse user's assigned IDs for filtering
    user_group_ids = current_user.group_ids if isinstance(current_user.group_ids, list) else (json.loads(current_user.group_ids) if current_user.group_ids else [])
    user_dealer_ids = current_user.dealer_ids if isinstance(current_user.dealer_ids, list) else (json.loads(current_user.dealer_ids) if current_user.dealer_ids else [])
    user_customer_ids = current_user.customer_ids if isinstance(current_user.customer_ids, list) else (json.loads(current_user.customer_ids) if current_user.customer_ids else [])
    user_video_types = current_user.video_types if isinstance(current_user.video_types, list) else (json.loads(current_user.video_types) if current_user.video_types else [])

    # Helper function to check if user has access to an account
    # Uses priority logic: customers > dealers > groups
    def user_has_access_to_account(account):
        if current_user.role in ["super_admin", "country_admin"]:
            return True

        # Priority-based access control
        if user_customer_ids:
            # Most specific - only check customer assignments
            return account.id in user_customer_ids
        elif user_dealer_ids:
            # Check dealer assignments
            return account.dealer_id in user_dealer_ids
        elif user_group_ids:
            # Check group assignments
            return account.group_id in user_group_ids

        return False

    # Helper function to check if user can see this camera's video type
    def user_can_see_video_type(camera, account):
        # If user has no video type restrictions (empty array), show all types
        if not user_video_types or len(user_video_types) == 0:
            return True

        # Determine the video type for this camera (camera override or account default)
        video_type = camera.video_type if camera.video_type is not None else account.video_type

        # VIDEO TYPE OVERRIDE: If user has video_types specified, they ONLY see matching types
        # If account/camera has video_type=None (All Types), it's NOT visible to restricted users
        # Only accounts with explicit matching video types are shown
        if video_type is None:
            # Account/camera is "All Types" - restricted users cannot see it
            return False

        # Check if the video type is in user's allowed types
        return video_type in user_video_types

    # Get all active account claims for filtering
    all_claims = db.query(AccountClaim).filter(
        AccountClaim.expires_at > datetime.utcnow()
    ).all()
    claimed_account_ids = {claim.account_id for claim in all_claims}

    # Map of user_id -> set of account_ids claimed by that user
    user_claimed_accounts = {}
    for claim in all_claims:
        if claim.user_id not in user_claimed_accounts:
            user_claimed_accounts[claim.user_id] = set()
        user_claimed_accounts[claim.user_id].add(claim.account_id)

    # Get account IDs claimed by current user
    current_user_claimed_accounts = user_claimed_accounts.get(current_user.id, set())

    # Get on_hold events (held by current user or all if show_all_holds is True)
    on_hold_query = db.query(AlarmEvent).join(Camera).filter(
        AlarmEvent.status == "on_hold"
    )
    if not show_all_holds:
        on_hold_query = on_hold_query.filter(AlarmEvent.held_by == current_user.id)
    on_hold_events = on_hold_query.all()

    # Get pending events (not yet converted to alarms or dismissed)
    # For userEscalate role: ALWAYS show escalated events that are NOT claimed (regardless of is_receiving)
    # For other roles: show pending events that are NOT claimed (unclaimed work available)
    if current_user.role_type == "user_escalate":
        # Show escalated events for accounts that are NOT claimed
        # These appear in "Pending" section for ALL escalate users to see
        pending_events_query = db.query(AlarmEvent).join(Camera).filter(
            AlarmEvent.status == "escalated"
        )
        if claimed_account_ids:
            pending_events_query = pending_events_query.filter(
                Camera.account_id.notin_(claimed_account_ids)
            )
        pending_events = pending_events_query.all()
    else:
        # For regular users: Show pending events that are NOT claimed by anyone
        # (Claimed pending events will show in Active section instead)
        pending_events_query = db.query(AlarmEvent).join(Camera).filter(
            AlarmEvent.status == "pending"
        )
        if claimed_account_ids:
            pending_events_query = pending_events_query.filter(
                Camera.account_id.notin_(claimed_account_ids)
            )
        pending_events = pending_events_query.all()

    # Get active alarms AND claimed pending events
    # For userEscalate role: ONLY show if is_receiving=True AND claimed by this user
    # For other roles: show active alarms + pending events claimed by this user
    if current_user.role_type == "user_escalate":
        if current_user.is_receiving:
            # Show escalated alarms where the account is claimed by this user
            if current_user_claimed_accounts:
                # Get all escalated alarms, then filter by account
                all_escalated_alarms = db.query(Alarm).filter(Alarm.status == "escalated").all()
                active_alarms = []
                for alarm in all_escalated_alarms:
                    # Get the event to find the account
                    event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
                    if event:
                        camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
                        if camera and camera.account_id in current_user_claimed_accounts:
                            active_alarms.append(alarm)
            else:
                active_alarms = []

            # Also show escalated events that are claimed by THIS user in the Active section
            # This allows auto-assigned escalated events to appear in Active without needing "Generate Alarm" button
            # ONLY show events that don't have an associated alarm yet (to avoid duplicates)
            if current_user_claimed_accounts:
                # Get all event IDs that already have alarms
                escalated_alarm_event_ids = {alarm.event_id for alarm in active_alarms}

                # Get escalated events for claimed accounts
                all_escalated_events = db.query(AlarmEvent).join(Camera).filter(
                    AlarmEvent.status == "escalated",
                    Camera.account_id.in_(current_user_claimed_accounts)
                ).all()

                # Filter out events that already have alarms
                claimed_pending_events = [e for e in all_escalated_events if e.id not in escalated_alarm_event_ids]
            else:
                claimed_pending_events = []
        else:
            # Not receiving - don't show any active alarms
            active_alarms = []
            claimed_pending_events = []
    else:
        # Regular users: show active alarms
        active_alarms = db.query(Alarm).filter(Alarm.status == "active").all()

        # Also show pending events that are claimed by THIS user in the Active section
        # This allows auto-assigned events to appear in Active without needing "Generate Alarm" button
        if current_user_claimed_accounts:
            claimed_pending_events = db.query(AlarmEvent).join(Camera).filter(
                AlarmEvent.status == "pending",
                Camera.account_id.in_(current_user_claimed_accounts)
            ).all()
        else:
            claimed_pending_events = []

    # Get all active account claims to show which accounts are being worked on
    # Only get claims that haven't expired
    claims = db.query(AccountClaim).filter(
        AccountClaim.expires_at > datetime.utcnow()
    ).all()
    claims_dict = {}
    for claim in claims:
        user = db.query(User).filter(User.id == claim.user_id).first()
        claims_dict[claim.account_id] = {
            "user_id": claim.user_id,
            "username": user.username if user else "Unknown",
            "claimed_at": claim.claimed_at.isoformat(),
            "expires_at": claim.expires_at.isoformat() if claim.expires_at else None
        }

    # Group all events/alarms by account
    account_groups = {}

    # Process pending events
    for event in pending_events:
        camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
        if not camera:
            continue

        account_id = camera.account_id
        account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()

        # Skip if user doesn't have access to this account
        if not account or not user_has_access_to_account(account):
            continue

        # Skip if user doesn't have access to this camera's video type
        if not user_can_see_video_type(camera, account):
            continue

        if account_id not in account_groups:
            account_groups[account_id] = {
                "account_id": account_id,
                "account_number": account.account_number if account else "N/A",
                "account_name": account.name if account else "N/A",
                "account_contacts": account.contacts if account else [],
                "account_timezone": account.timezone if account and account.timezone else "UTC",
                "events": [],
                "cameras": set(),
                "earliest_timestamp": event.timestamp,
                "latest_timestamp": event.timestamp,
                "total_media_count": 0,
                "claimed_by": claims_dict.get(account_id),
                "eyes_on_count": account.eyes_on_count if account else 1,
                "priority": account.priority if account and account.priority is not None else 5,
                "allow_dismiss": account.allow_dismiss if account and account.allow_dismiss is not None else True
            }

        media_paths = event.media_paths if isinstance(event.media_paths, list) else json.loads(event.media_paths)

        # Parse eyes_on_users
        eyes_on_users = event.eyes_on_users if isinstance(event.eyes_on_users, list) else (json.loads(event.eyes_on_users) if event.eyes_on_users else [])

        # Determine required eyes_on_count (camera override or account default)
        required_eyes_on = camera.eyes_on_count if camera.eyes_on_count is not None else account.eyes_on_count

        # Get alarm notes if this event has an associated alarm
        alarm_for_event = db.query(Alarm).filter(Alarm.event_id == event.id).first()
        event_notes = alarm_for_event.notes if alarm_for_event and alarm_for_event.notes else None

        event_data = {
            "id": event.id,
            "type": "event",
            "camera_id": event.camera_id,
            "camera_name": camera.name,
            "camera_location": camera.location,
            "camera_snoozed_until": camera.snoozed_until.isoformat() + 'Z' if camera.snoozed_until else None,
            "timestamp": event.timestamp.isoformat() + 'Z',
            "media_type": event.media_type or "video",
            "media_paths": media_paths,
            "media_count": len(media_paths),
            "status": event.status,
            "eyes_on_users": eyes_on_users,
            "eyes_on_current": len(eyes_on_users),
            "eyes_on_required": required_eyes_on,
            "notes": event_notes
        }

        account_groups[account_id]["events"].append(event_data)
        account_groups[account_id]["cameras"].add(camera.id)
        account_groups[account_id]["total_media_count"] += len(media_paths)

        # Update earliest/latest timestamps
        if event.timestamp < account_groups[account_id]["earliest_timestamp"]:
            account_groups[account_id]["earliest_timestamp"] = event.timestamp
        if event.timestamp > account_groups[account_id]["latest_timestamp"]:
            account_groups[account_id]["latest_timestamp"] = event.timestamp

    # Process on_hold events (similar to pending events but marked as on_hold)
    on_hold_groups = {}
    for event in on_hold_events:
        camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
        if not camera:
            continue

        account_id = camera.account_id
        account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()

        # Skip if user doesn't have access to this account
        if not account or not user_has_access_to_account(account):
            continue

        # Skip if user doesn't have access to this camera's video type
        if not user_can_see_video_type(camera, account):
            continue

        if account_id not in on_hold_groups:
            on_hold_groups[account_id] = {
                "account_id": account_id,
                "account_number": account.account_number if account else "N/A",
                "account_name": account.name if account else "N/A",
                "account_contacts": account.contacts if account else [],
                "account_timezone": account.timezone if account and account.timezone else "UTC",
                "events": [],
                "cameras": set(),
                "earliest_timestamp": event.timestamp,
                "latest_timestamp": event.timestamp,
                "total_media_count": 0,
                "claimed_by": None,  # On hold events are not claimed
                "eyes_on_count": account.eyes_on_count if account else 1,
                "priority": account.priority if account and account.priority is not None else 5,
                "allow_dismiss": account.allow_dismiss if account and account.allow_dismiss is not None else True,
                "on_hold": True  # Mark as on_hold group
            }

        media_paths = event.media_paths if isinstance(event.media_paths, list) else json.loads(event.media_paths)

        # Parse eyes_on_users
        eyes_on_users = event.eyes_on_users if isinstance(event.eyes_on_users, list) else (json.loads(event.eyes_on_users) if event.eyes_on_users else [])

        # Determine required eyes_on_count (camera override or account default)
        required_eyes_on = camera.eyes_on_count if camera.eyes_on_count is not None else account.eyes_on_count

        # Get alarm info if this event has an associated alarm
        alarm_for_event = db.query(Alarm).filter(Alarm.event_id == event.id).first()
        event_notes = alarm_for_event.notes if alarm_for_event and alarm_for_event.notes else None
        alarm_id = alarm_for_event.id if alarm_for_event else None

        event_data = {
            "id": event.id,
            "type": "alarm" if alarm_for_event else "event",
            "alarm_id": alarm_id,
            "camera_id": event.camera_id,
            "camera_name": camera.name,
            "camera_location": camera.location,
            "camera_snoozed_until": camera.snoozed_until.isoformat() + 'Z' if camera.snoozed_until else None,
            "timestamp": event.timestamp.isoformat() + 'Z',
            "media_type": event.media_type or "video",
            "media_paths": media_paths,
            "media_count": len(media_paths),
            "status": event.status,
            "alarm_status": alarm_for_event.status if alarm_for_event else None,
            "eyes_on_users": eyes_on_users,
            "eyes_on_current": len(eyes_on_users),
            "eyes_on_required": required_eyes_on,
            "notes": event_notes
        }

        on_hold_groups[account_id]["events"].append(event_data)
        on_hold_groups[account_id]["cameras"].add(camera.id)
        on_hold_groups[account_id]["total_media_count"] += len(media_paths)

        # Update earliest/latest timestamps
        if event.timestamp < on_hold_groups[account_id]["earliest_timestamp"]:
            on_hold_groups[account_id]["earliest_timestamp"] = event.timestamp
        if event.timestamp > on_hold_groups[account_id]["latest_timestamp"]:
            on_hold_groups[account_id]["latest_timestamp"] = event.timestamp

    # Process active alarms
    for alarm in active_alarms:
        event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
        if not event:
            continue

        camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
        if not camera:
            continue

        account_id = camera.account_id
        account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()

        # Skip if user doesn't have access to this account
        if not account or not user_has_access_to_account(account):
            continue

        # Skip if user doesn't have access to this camera's video type
        if not user_can_see_video_type(camera, account):
            continue

        if account_id not in account_groups:
            account_groups[account_id] = {
                "account_id": account_id,
                "account_number": account.account_number if account else "N/A",
                "account_name": account.name if account else "N/A",
                "account_contacts": account.contacts if account else [],
                "account_timezone": account.timezone if account and account.timezone else "UTC",
                "events": [],
                "cameras": set(),
                "earliest_timestamp": event.timestamp,
                "latest_timestamp": event.timestamp,
                "total_media_count": 0,
                "claimed_by": claims_dict.get(account_id),
                "eyes_on_count": account.eyes_on_count if account else 1,
                "priority": account.priority if account and account.priority is not None else 5,
                "allow_dismiss": account.allow_dismiss if account and account.allow_dismiss is not None else True
            }

        media_paths = event.media_paths if isinstance(event.media_paths, list) else json.loads(event.media_paths)

        # Parse eyes_on_users for alarm
        alarm_eyes_on_users = alarm.eyes_on_users if isinstance(alarm.eyes_on_users, list) else (json.loads(alarm.eyes_on_users) if alarm.eyes_on_users else [])

        # Determine required eyes_on_count (camera override or account default)
        required_eyes_on = camera.eyes_on_count if camera.eyes_on_count is not None else account.eyes_on_count

        event_data = {
            "id": event.id,
            "type": "alarm",
            "alarm_id": alarm.id,
            "camera_id": event.camera_id,
            "camera_name": camera.name,
            "camera_location": camera.location,
            "camera_snoozed_until": camera.snoozed_until.isoformat() + 'Z' if camera.snoozed_until else None,
            "timestamp": event.timestamp.isoformat() + 'Z',
            "media_type": event.media_type or "video",
            "media_paths": media_paths,
            "media_count": len(media_paths),
            "status": "active",
            "alarm_status": alarm.status,
            "eyes_on_users": alarm_eyes_on_users,
            "eyes_on_current": len(alarm_eyes_on_users),
            "eyes_on_required": required_eyes_on,
            "notes": alarm.notes
        }

        account_groups[account_id]["events"].append(event_data)
        account_groups[account_id]["cameras"].add(camera.id)
        account_groups[account_id]["total_media_count"] += len(media_paths)

        # Update earliest/latest timestamps
        if event.timestamp < account_groups[account_id]["earliest_timestamp"]:
            account_groups[account_id]["earliest_timestamp"] = event.timestamp
        if event.timestamp > account_groups[account_id]["latest_timestamp"]:
            account_groups[account_id]["latest_timestamp"] = event.timestamp

    # Process claimed pending events (for regular users in Active section)
    for event in claimed_pending_events:
        camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
        if not camera:
            continue

        account_id = camera.account_id
        account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()

        # Skip if user doesn't have access to this account
        if not account or not user_has_access_to_account(account):
            continue

        # Skip if user doesn't have access to this camera's video type
        if not user_can_see_video_type(camera, account):
            continue

        if account_id not in account_groups:
            account_groups[account_id] = {
                "account_id": account_id,
                "account_number": account.account_number if account else "N/A",
                "account_name": account.name if account else "N/A",
                "account_contacts": account.contacts if account else [],
                "account_timezone": account.timezone if account and account.timezone else "UTC",
                "events": [],
                "cameras": set(),
                "earliest_timestamp": event.timestamp,
                "latest_timestamp": event.timestamp,
                "total_media_count": 0,
                "claimed_by": claims_dict.get(account_id),
                "eyes_on_count": account.eyes_on_count if account else 1,
                "priority": account.priority if account and account.priority is not None else 5,
                "allow_dismiss": account.allow_dismiss if account and account.allow_dismiss is not None else True
            }

        media_paths = event.media_paths if isinstance(event.media_paths, list) else json.loads(event.media_paths)

        # Parse eyes_on_users
        eyes_on_users = event.eyes_on_users if isinstance(event.eyes_on_users, list) else (json.loads(event.eyes_on_users) if event.eyes_on_users else [])

        # Determine required eyes_on_count (camera override or account default)
        required_eyes_on = camera.eyes_on_count if camera.eyes_on_count is not None else account.eyes_on_count

        # Get alarm notes if this event has an associated alarm
        alarm_for_claimed_event = db.query(Alarm).filter(Alarm.event_id == event.id).first()
        claimed_event_notes = alarm_for_claimed_event.notes if alarm_for_claimed_event and alarm_for_claimed_event.notes else None

        event_data = {
            "id": event.id,
            "type": "event",  # Still an event (not converted to alarm yet)
            "camera_id": event.camera_id,
            "camera_name": camera.name,
            "camera_location": camera.location,
            "camera_snoozed_until": camera.snoozed_until.isoformat() + 'Z' if camera.snoozed_until else None,
            "timestamp": event.timestamp.isoformat() + 'Z',
            "media_type": event.media_type or "video",
            "media_paths": media_paths,
            "media_count": len(media_paths),
            "status": event.status,  # Will be "pending" or "escalated" but shown in Active section
            "eyes_on_users": eyes_on_users,
            "eyes_on_current": len(eyes_on_users),
            "eyes_on_required": required_eyes_on,
            "notes": claimed_event_notes
        }

        account_groups[account_id]["events"].append(event_data)
        account_groups[account_id]["cameras"].add(camera.id)
        account_groups[account_id]["total_media_count"] += len(media_paths)

        # Update earliest/latest timestamps
        if event.timestamp < account_groups[account_id]["earliest_timestamp"]:
            account_groups[account_id]["earliest_timestamp"] = event.timestamp
        if event.timestamp > account_groups[account_id]["latest_timestamp"]:
            account_groups[account_id]["latest_timestamp"] = event.timestamp

    # Convert to list and format properly
    dashboard_groups = []
    for account_id, group in account_groups.items():
        # Sort events within each group by timestamp
        group["events"].sort(key=lambda x: x["timestamp"])

        # Convert sets to counts
        group["camera_count"] = len(group["cameras"])
        group["event_count"] = len(group["events"])
        del group["cameras"]  # Remove the set, we only need the count

        # Convert timestamps to ISO strings
        group["earliest_timestamp"] = group["earliest_timestamp"].isoformat() + 'Z'
        group["latest_timestamp"] = group["latest_timestamp"].isoformat() + 'Z'

        dashboard_groups.append(group)

    # Convert on_hold groups to list
    on_hold_dashboard_groups = []
    for account_id, group in on_hold_groups.items():
        # Sort events within each group by timestamp
        group["events"].sort(key=lambda x: x["timestamp"])

        # Convert sets to counts
        group["camera_count"] = len(group["cameras"])
        group["event_count"] = len(group["events"])
        del group["cameras"]  # Remove the set, we only need the count

        # Convert timestamps to ISO strings
        group["earliest_timestamp"] = group["earliest_timestamp"].isoformat() + 'Z'
        group["latest_timestamp"] = group["latest_timestamp"].isoformat() + 'Z'

        on_hold_dashboard_groups.append(group)

    # Sort groups by earliest timestamp (oldest first to prioritize urgent alarms)
    dashboard_groups.sort(key=lambda x: x["earliest_timestamp"])
    on_hold_dashboard_groups.sort(key=lambda x: x["earliest_timestamp"])

    # Combine all groups and return
    # Return on_hold groups separately so frontend can display them in a separate column
    return dashboard_groups + on_hold_dashboard_groups

@app.put("/api/events/{event_id}/dismiss")
async def dismiss_event(
    event_id: int,
    resolution: str = "dismissed",
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Get camera to determine eyes_on_count
    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Get account
    account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Determine required eyes_on_count (camera override or account default)
    required_eyes_on = camera.eyes_on_count if camera.eyes_on_count is not None else account.eyes_on_count

    # Initialize eyes_on_users if not set
    if event.eyes_on_users is None:
        event.eyes_on_users = []

    # Add current user to eyes_on_users if not already present
    if current_user.id not in event.eyes_on_users:
        event.eyes_on_users.append(current_user.id)
        flag_modified(event, "eyes_on_users")  # Tell SQLAlchemy the JSON field changed

    # Check if we have enough eyes on this event
    eyes_on_count = len(event.eyes_on_users)

    # Admins, supervisors, and superadmins can override the eyes on requirement
    can_override = current_user.role in ['admin', 'supervisor', 'super_admin']

    if eyes_on_count >= required_eyes_on or can_override:
        # Enough users have reviewed - dismiss the event
        from audit_helper import log_audit_action
        now = datetime.utcnow()
        event.status = "dismissed"
        event.dismissed_by = current_user.id
        event.dismissed_at = now

        # If this is a call event with a parked slot, hang up the parked call
        if event.media_type == "call" and event.parked_slot:
            try:
                logger.info(f"Dismissing call event - hanging up parked call in slot {event.parked_slot}")
                # Use Asterisk AMI to hang up the parked call
                from ami_client import AMIClient
                ami = AMIClient()
                asyncio.create_task(ami.hangup_parked_call(event.parked_slot))
                logger.info(f"Hangup command sent for parking slot {event.parked_slot}")
            except Exception as e:
                logger.error(f"Failed to hang up parked call in slot {event.parked_slot}: {e}")
                # Don't fail the dismiss if hangup fails

        # Create activity log for dismissed event
        activity_log = ActivityLog(
            camera_id=event.camera_id,
            account_id=camera.account_id,
            timestamp=now,
            event_type="dismissed",
            resolution=resolution,
            user_id=current_user.id,
            media_paths=json.dumps(event.media_paths) if isinstance(event.media_paths, list) else event.media_paths,
            media_type=event.media_type,
            notes=f"Event dismissed by {current_user.username} - {resolution}"
        )
        db.add(activity_log)

        # Log event dismissal
        log_audit_action(
            db=db,
            action="event_dismissed",
            user_id=current_user.id,
            username=current_user.username,
            event_id=event_id,
            details={
                "resolution": resolution,
                "eyes_on_count": eyes_on_count,
                "required_eyes_on": required_eyes_on,
                "eyes_on_users": event.eyes_on_users
            }
        )

        db.commit()

        await manager.broadcast({
            "type": "event_dismissed",
            "event_id": event_id
        })

        return {
            "message": "Event dismissed successfully",
            "eyes_on_count": eyes_on_count,
            "required_eyes_on": required_eyes_on,
            "fully_dismissed": True
        }
    else:
        # Not enough eyes yet - save progress but keep pending
        db.commit()

        # Broadcast eyes on update
        await manager.broadcast({
            "type": "event_eyes_on_updated",
            "event_id": event_id,
            "eyes_on_current": eyes_on_count,
            "eyes_on_required": required_eyes_on
        })

        return {
            "message": f"Your review has been recorded. {required_eyes_on - eyes_on_count} more user(s) needed to dismiss.",
            "eyes_on_count": eyes_on_count,
            "required_eyes_on": required_eyes_on,
            "fully_dismissed": False
        }

@app.put("/api/events/{event_id}/escalate")
async def escalate_event(
    event_id: int,
    escalate_data: EscalateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Check if event is already escalated
    if event.status == "escalated":
        raise HTTPException(status_code=400, detail="Event is already escalated")

    # Check if event is dismissed
    if event.status == "dismissed":
        raise HTTPException(status_code=400, detail="Cannot escalate a dismissed event")

    # Get the camera and account to release any claims
    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if camera:
        account_id = camera.account_id
        # Release any existing claim on this account
        existing_claim = db.query(AccountClaim).filter(AccountClaim.account_id == account_id).first()
        if existing_claim:
            db.delete(existing_claim)

    # Mark event as escalated
    event.status = "escalated"
    event.escalated_by = current_user.id
    event.escalated_at = datetime.utcnow()

    # Check if an alarm already exists for this event
    existing_alarm = db.query(Alarm).filter(Alarm.event_id == event.id).first()

    if existing_alarm:
        # Update existing alarm to escalated status
        existing_alarm.status = "escalated"
        # Append escalation notes
        escalation_note = f"Escalated by {current_user.username} at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC"
        if escalate_data.notes:
            escalation_note += f"\nEscalation notes: {escalate_data.notes}"

        if not existing_alarm.notes:
            existing_alarm.notes = escalation_note
        else:
            existing_alarm.notes += f"\n\n{escalation_note}"
        alarm = existing_alarm
    else:
        # Create a new alarm for this event
        notes = f"Escalated by {current_user.username}"
        if escalate_data.notes:
            notes += f"\nEscalation notes: {escalate_data.notes}"

        alarm = Alarm(
            event_id=event.id,
            created_by=current_user.id,
            notes=notes,
            status="escalated"
        )
        db.add(alarm)

    db.commit()

    # Broadcast to all connected clients
    await manager.broadcast({
        "type": "event_escalated",
        "event_id": event_id
    })

    return {
        "message": "Event escalated successfully",
        "event_id": event_id,
        "alarm_id": alarm.id
    }

@app.put("/api/events/{event_id}/hold")
async def hold_event(
    event_id: int,
    hold_data: EscalateRequest,  # Reuse EscalateRequest schema for notes
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Check if event is already on hold
    if event.status == "on_hold":
        raise HTTPException(status_code=400, detail="Event is already on hold")

    # Check if event is dismissed
    if event.status == "dismissed":
        raise HTTPException(status_code=400, detail="Cannot hold a dismissed event")

    # Get the camera and account to release any claims
    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if camera:
        account_id = camera.account_id
        # Release any existing claim on this account
        existing_claim = db.query(AccountClaim).filter(AccountClaim.account_id == account_id).first()
        if existing_claim:
            db.delete(existing_claim)

    # Mark event as on_hold
    from audit_helper import log_audit_action
    now = datetime.utcnow()
    event.status = "on_hold"
    event.held_by = current_user.id
    event.held_at = now

    # Check if an alarm already exists for this event
    existing_alarm = db.query(Alarm).filter(Alarm.event_id == event.id).first()

    if existing_alarm:
        # Update existing alarm to on_hold status
        existing_alarm.status = "on_hold"
        existing_alarm.held_by = current_user.id
        existing_alarm.held_at = now

        # Append hold notes with timestamp
        hold_note = f"Put on hold by {current_user.username} at {now.strftime('%Y-%m-%d %H:%M:%S')} UTC"
        if hold_data.notes:
            hold_note += f"\nHold notes: {hold_data.notes}"

        if not existing_alarm.notes:
            existing_alarm.notes = hold_note
        else:
            existing_alarm.notes += f"\n\n{hold_note}"

        # Log alarm hold
        log_audit_action(
            db=db,
            action="alarm_held",
            user_id=current_user.id,
            username=current_user.username,
            event_id=event_id,
            alarm_id=existing_alarm.id,
            details={"notes": hold_data.notes if hold_data.notes else None}
        )

    # Log event hold
    log_audit_action(
        db=db,
        action="event_held",
        user_id=current_user.id,
        username=current_user.username,
        event_id=event_id,
        details={"notes": hold_data.notes if hold_data.notes else None}
    )

    db.commit()

    # Broadcast to all connected clients
    await manager.broadcast({
        "type": "event_held",
        "event_id": event_id
    })

    return {
        "message": "Event put on hold successfully",
        "event_id": event_id
    }

@app.put("/api/alarms/{alarm_id}/hold")
async def hold_alarm(
    alarm_id: int,
    hold_data: EscalateRequest,  # Reuse EscalateRequest schema for notes
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    # Check if alarm is already on hold
    if alarm.status == "on_hold":
        raise HTTPException(status_code=400, detail="Alarm is already on hold")

    # Check if alarm is resolved
    if alarm.status == "resolved":
        raise HTTPException(status_code=400, detail="Cannot hold a resolved alarm")

    # Get the event and camera to release any claims
    event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if camera:
        account_id = camera.account_id
        # Release any existing claim on this account
        existing_claim = db.query(AccountClaim).filter(AccountClaim.account_id == account_id).first()
        if existing_claim:
            db.delete(existing_claim)

    # Mark alarm and event as on_hold
    from audit_helper import log_audit_action
    now = datetime.utcnow()
    alarm.status = "on_hold"
    alarm.held_by = current_user.id
    alarm.held_at = now

    # Append hold notes with timestamp
    hold_note = f"Put on hold by {current_user.username} at {now.strftime('%Y-%m-%d %H:%M:%S')} UTC"
    if hold_data.notes:
        hold_note += f"\nHold notes: {hold_data.notes}"

    if not alarm.notes:
        alarm.notes = hold_note
    else:
        alarm.notes += f"\n\n{hold_note}"

    event.status = "on_hold"
    event.held_by = current_user.id
    event.held_at = now

    # Log alarm hold
    log_audit_action(
        db=db,
        action="alarm_held",
        user_id=current_user.id,
        username=current_user.username,
        event_id=alarm.event_id,
        alarm_id=alarm_id,
        details={"notes": hold_data.notes if hold_data.notes else None}
    )

    # Log event hold
    log_audit_action(
        db=db,
        action="event_held",
        user_id=current_user.id,
        username=current_user.username,
        event_id=alarm.event_id,
        details={"notes": hold_data.notes if hold_data.notes else None}
    )

    db.commit()

    # Broadcast to all connected clients
    await manager.broadcast({
        "type": "alarm_held",
        "alarm_id": alarm_id,
        "event_id": alarm.event_id
    })

    return {
        "message": "Alarm put on hold successfully",
        "alarm_id": alarm_id
    }

@app.put("/api/alarms/{alarm_id}/viewed")
async def mark_alarm_viewed(
    alarm_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Mark an alarm as viewed by the current user and log audit action"""
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    # Only update viewed_at timestamp if this is the first view
    from audit_helper import log_audit_action
    now = datetime.utcnow()

    if not alarm.viewed_at:
        alarm.viewed_by = current_user.id
        alarm.viewed_at = now

    # Also mark the event as viewed
    event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
    if event and not event.viewed_at:
        event.viewed_by = current_user.id
        event.viewed_at = now

    # Log audit action
    log_audit_action(
        db=db,
        action="alarm_viewed",
        user_id=current_user.id,
        username=current_user.username,
        event_id=alarm.event_id,
        alarm_id=alarm_id,
        details=None
    )

    db.commit()

    return {
        "message": "Alarm view tracked successfully",
        "alarm_id": alarm_id,
        "viewed_at": alarm.viewed_at.isoformat() if alarm.viewed_at else None
    }

@app.put("/api/events/{event_id}/unhold")
async def unhold_event(
    event_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Check if event is on hold
    if event.status != "on_hold":
        raise HTTPException(status_code=400, detail="Event is not on hold")

    # Get the camera and account to claim it
    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if camera:
        account_id = camera.account_id
        # Check if account is already claimed
        existing_claim = db.query(AccountClaim).filter(AccountClaim.account_id == account_id).first()
        if existing_claim:
            raise HTTPException(status_code=409, detail="Account is already claimed by another operator")

        # Create new claim
        new_claim = AccountClaim(
            account_id=account_id,
            user_id=current_user.id,
            claimed_at=datetime.utcnow(),
            last_activity=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=2)
        )
        db.add(new_claim)

    # Check if alarm exists and update it too
    from audit_helper import log_audit_action
    now = datetime.utcnow()
    existing_alarm = db.query(Alarm).filter(Alarm.event_id == event.id).first()
    if existing_alarm and existing_alarm.status == "on_hold":
        existing_alarm.status = "active"
        existing_alarm.unheld_by = current_user.id
        existing_alarm.unheld_at = now

        # Log alarm unhold
        log_audit_action(
            db=db,
            action="alarm_unheld",
            user_id=current_user.id,
            username=current_user.username,
            event_id=event_id,
            alarm_id=existing_alarm.id,
            details=None
        )

    # Mark event as pending (or alarm_generated if alarm exists)
    event.status = "alarm_generated" if existing_alarm else "pending"
    event.unheld_by = current_user.id
    event.unheld_at = now

    # Log event unhold
    log_audit_action(
        db=db,
        action="event_unheld",
        user_id=current_user.id,
        username=current_user.username,
        event_id=event_id,
        details=None
    )

    db.commit()

    # Broadcast to all connected clients
    await manager.broadcast({
        "type": "event_unheld",
        "event_id": event_id,
        "user_id": current_user.id
    })

    return {
        "message": "Event resumed successfully",
        "event_id": event_id
    }

@app.post("/api/events/{event_id}/generate-alarm", response_model=AlarmResponse)
async def generate_alarm(
    event_id: int,
    alarm_data: AlarmCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    event = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Get the camera to find the account
    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    account_id = camera.account_id

    # Automatically claim the account when generating an alarm
    existing_claim = db.query(AccountClaim).filter(AccountClaim.account_id == account_id).first()
    if existing_claim:
        # Update existing claim
        existing_claim.user_id = current_user.id
        existing_claim.last_activity = datetime.utcnow()
        existing_claim.expires_at = datetime.utcnow() + timedelta(minutes=30)
    else:
        # Create new claim
        claim = AccountClaim(
            account_id=account_id,
            user_id=current_user.id,
            claimed_at=datetime.utcnow(),
            last_activity=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=30)
        )
        db.add(claim)
    db.commit()

    # If this is a call event, the frontend WebRTC phone will dial the parking slot
    # No need to use AMI - let the browser phone handle it
    if event.media_type == "call" and event.call_status == "parked" and event.parked_slot:
        logger.info(f"Call event with parking slot {event.parked_slot} - frontend will initiate WebRTC dial")

    # Get all cameras for this account
    account_cameras = db.query(Camera).filter(Camera.account_id == account_id).all()
    camera_ids = [cam.id for cam in account_cameras]

    # Get all pending events for these cameras
    all_pending_events = db.query(AlarmEvent).filter(
        AlarmEvent.camera_id.in_(camera_ids),
        AlarmEvent.status == "pending"
    ).all()

    # Collect all event IDs
    all_event_ids = [evt.id for evt in all_pending_events]

    # Mark all events as alarm_generated and log escalation
    from audit_helper import log_audit_action
    now = datetime.utcnow()
    for evt in all_pending_events:
        evt.status = "alarm_generated"
        evt.escalated_by = current_user.id
        evt.escalated_at = now

        # Log event escalation
        log_audit_action(
            db=db,
            action="event_escalated",
            user_id=current_user.id,
            username=current_user.username,
            event_id=evt.id,
            details={
                "account_id": account_id,
                "camera_id": evt.camera_id
            }
        )

    # Create alarm with all related event IDs
    db_alarm = Alarm(
        event_id=event_id,  # Primary event that triggered the alarm
        created_by=current_user.id,
        created_at=now,
        notes=alarm_data.notes,
        status="active",
        related_event_ids=all_event_ids  # Store all related event IDs
    )
    db.add(db_alarm)
    db.commit()
    db.refresh(db_alarm)

    # Log alarm generation
    log_audit_action(
        db=db,
        action="alarm_generated",
        user_id=current_user.id,
        username=current_user.username,
        event_id=event_id,
        alarm_id=db_alarm.id,
        details={
            "account_id": account_id,
            "related_event_count": len(all_event_ids),
            "related_event_ids": all_event_ids
        }
    )

    # Broadcast account claim FIRST
    await manager.broadcast({
        "type": "account_claimed",
        "account_id": account_id,
        "user_id": current_user.id,
        "username": current_user.username
    })

    # Then broadcast alarm generation
    await manager.broadcast({
        "type": "alarm_generated",
        "event_id": event_id,
        "alarm_id": db_alarm.id,
        "account_id": account_id,
        "related_event_ids": all_event_ids,
        "alarm": {
            "id": event.id,
            "type": "alarm",
            "alarm_id": db_alarm.id,
            "camera_id": event.camera_id,
            "timestamp": event.timestamp.isoformat(),
            "media_type": event.media_type or "video",
            "media_paths": event.media_paths if isinstance(event.media_paths, list) else json.loads(event.media_paths),
            "status": "active",
            "alarm_status": db_alarm.status,
            "camera": {
                "id": camera.id,
                "name": camera.name,
                "location": camera.location,
                "account_id": camera.account_id
            } if camera else None
        }
    })

    return db_alarm

@app.get("/api/alarms", response_model=List[AlarmResponse])
async def get_alarms(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    return db.query(Alarm).order_by(Alarm.created_at.desc()).all()

@app.get("/api/alarms/{alarm_id}", response_model=AlarmResponse)
async def get_alarm_by_id(
    alarm_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a single alarm by ID"""
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return alarm

@app.get("/api/alarms/{alarm_id}/account-events")
async def get_alarm_account_events(
    alarm_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all events/alarms for the same account as the given alarm"""
    # Get the alarm
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    # Get the event associated with this alarm
    event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Get the camera to find the account
    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    account_id = camera.account_id

    # Get all cameras for this account
    account_cameras = db.query(Camera).filter(Camera.account_id == account_id).all()
    camera_ids = [cam.id for cam in account_cameras]

    # Get all events for these cameras from last 24 hours, limit to 100
    # Calculate 24 hours ago
    from datetime import datetime, timedelta
    twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)

    all_events = db.query(AlarmEvent).filter(
        AlarmEvent.camera_id.in_(camera_ids),
        AlarmEvent.timestamp >= twenty_four_hours_ago
    ).order_by(AlarmEvent.timestamp.desc()).limit(100).all()

    # Format response with alarm data if available
    result = []
    for evt in all_events:
        evt_camera = db.query(Camera).filter(Camera.id == evt.camera_id).first()
        evt_alarm = db.query(Alarm).filter(Alarm.event_id == evt.id).first()

        media_paths = evt.media_paths if isinstance(evt.media_paths, list) else json.loads(evt.media_paths)

        result.append({
            "event_id": evt.id,
            "alarm_id": evt_alarm.id if evt_alarm else None,
            "camera_id": evt.camera_id,
            "camera_name": evt_camera.name if evt_camera else "Unknown",
            "camera_location": evt_camera.location if evt_camera else None,
            "timestamp": evt.timestamp.isoformat(),
            "media_type": evt.media_type or "video",
            "media_paths": media_paths,
            "media_count": len(media_paths),
            "status": evt.status,
            "is_current_alarm": evt_alarm.id == alarm_id if evt_alarm else False
        })

    return result

@app.put("/api/alarms/{alarm_id}")
async def update_alarm(
    alarm_id: int,
    alarm_update: AlarmUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update alarm notes, resolution, and call logs"""
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    # Update fields if provided
    if alarm_update.notes is not None:
        alarm.notes = alarm_update.notes
    if alarm_update.resolution is not None:
        alarm.resolution = alarm_update.resolution
    if alarm_update.call_logs is not None:
        alarm.call_logs = alarm_update.call_logs
    if alarm_update.action_plan_state is not None:
        alarm.action_plan_state = alarm_update.action_plan_state

    db.commit()
    db.refresh(alarm)
    return alarm

@app.put("/api/alarms/{alarm_id}/resolve")
async def resolve_alarm(
    alarm_id: int,
    alarm_update: AlarmUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    # Get event and camera to determine eyes_on_count
    event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Determine required eyes_on_count (camera override or account default)
    required_eyes_on = camera.eyes_on_count if camera.eyes_on_count is not None else account.eyes_on_count

    # Initialize eyes_on_users if not set
    if alarm.eyes_on_users is None:
        alarm.eyes_on_users = []

    # Add current user to eyes_on_users if not already present
    if current_user.id not in alarm.eyes_on_users:
        alarm.eyes_on_users.append(current_user.id)
        flag_modified(alarm, "eyes_on_users")  # Tell SQLAlchemy the JSON field changed

    # Update notes and resolution if provided
    if alarm_update.notes is not None:
        alarm.notes = alarm_update.notes
    if alarm_update.resolution is not None:
        alarm.resolution = alarm_update.resolution
    if alarm_update.call_logs is not None:
        alarm.call_logs = alarm_update.call_logs

    # Check if we have enough eyes on this alarm
    eyes_on_count = len(alarm.eyes_on_users)

    # Admins, supervisors, and superadmins can override the eyes on requirement
    can_override = current_user.role in ['admin', 'supervisor', 'super_admin']

    if eyes_on_count >= required_eyes_on or can_override:
        # Enough users have reviewed - mark as resolved
        from audit_helper import log_audit_action
        now = datetime.utcnow()
        alarm.status = "resolved"
        alarm.resolved_by = current_user.id
        alarm.resolved_at = now

        # Get all related event IDs (if available)
        related_event_ids = alarm.related_event_ids if alarm.related_event_ids else [alarm.event_id]

        # Mark all related events as dismissed and log
        for event_id in related_event_ids:
            evt = db.query(AlarmEvent).filter(AlarmEvent.id == event_id).first()
            if evt:
                evt.status = "dismissed"
                evt.dismissed_by = current_user.id
                evt.dismissed_at = now

                # Log event dismissal
                log_audit_action(
                    db=db,
                    action="event_dismissed",
                    user_id=current_user.id,
                    username=current_user.username,
                    event_id=event_id,
                    details={
                        "resolution": alarm_update.resolution,
                        "via_alarm_resolution": True
                    }
                )

        # Log alarm resolution
        log_audit_action(
            db=db,
            action="alarm_resolved",
            user_id=current_user.id,
            username=current_user.username,
            event_id=alarm.event_id,
            alarm_id=alarm_id,
            details={
                "resolution": alarm_update.resolution,
                "eyes_on_count": eyes_on_count,
                "required_eyes_on": required_eyes_on,
                "eyes_on_users": alarm.eyes_on_users
            }
        )

        # Release the account claim when alarm is resolved
        existing_claim = db.query(AccountClaim).filter(AccountClaim.account_id == camera.account_id).first()
        if existing_claim:
            db.delete(existing_claim)

        db.commit()

        # Broadcast alarm resolution to remove it from dashboard
        await manager.broadcast({
            "type": "alarm_resolved",
            "alarm_id": alarm_id,
            "event_id": alarm.event_id,
            "related_event_ids": related_event_ids
        })

        return {
            "message": "Alarm resolved successfully",
            "eyes_on_count": eyes_on_count,
            "required_eyes_on": required_eyes_on,
            "fully_resolved": True
        }
    else:
        # Not enough eyes yet - save progress but keep active
        db.commit()
        db.refresh(alarm)

        # Broadcast partial resolution
        await manager.broadcast({
            "type": "alarm_eyes_on_updated",
            "alarm_id": alarm_id,
            "event_id": alarm.event_id,
            "eyes_on_current": eyes_on_count,
            "eyes_on_required": required_eyes_on
        })

        return {
            "message": f"Your review has been recorded. {required_eyes_on - eyes_on_count} more user(s) needed to fully resolve.",
            "eyes_on_count": eyes_on_count,
            "required_eyes_on": required_eyes_on,
            "fully_resolved": False
        }

@app.put("/api/alarms/{alarm_id}/revert-to-pending")
async def revert_alarm_to_pending(
    alarm_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Revert an active alarm back to pending event status"""
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    # Get the associated event
    event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Delete the alarm (revert to just being an event)
    db.delete(alarm)

    # Set event status back to pending
    event.status = "pending"
    db.commit()

    # Get camera info for broadcast
    camera = db.query(Camera).filter(Camera.id == event.camera_id).first()

    # Broadcast the revert action
    await manager.broadcast({
        "type": "alarm_reverted",
        "alarm_id": alarm_id,
        "event": {
            "id": event.id,
            "type": "event",
            "camera_id": event.camera_id,
            "timestamp": event.timestamp.isoformat(),
            "media_type": event.media_type or "video",
            "media_paths": event.media_paths if isinstance(event.media_paths, list) else json.loads(event.media_paths),
            "status": event.status,
            "camera": {
                "id": camera.id,
                "name": camera.name,
                "location": camera.location,
                "account_id": camera.account_id
            } if camera else None
        }
    })

    return {"message": "Alarm reverted to pending event"}

# Account Claim endpoints
@app.post("/api/accounts/{account_id}/claim")
async def claim_account(
    account_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Claim an account to work on its alarms"""
    # Check if account exists
    account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Check if account is already claimed by someone else
    existing_claim = db.query(AccountClaim).filter(AccountClaim.account_id == account_id).first()
    if existing_claim:
        if existing_claim.user_id != current_user.id:
            # Check if claim has expired
            if existing_claim.expires_at and existing_claim.expires_at > datetime.utcnow():
                claiming_user = db.query(User).filter(User.id == existing_claim.user_id).first()
                raise HTTPException(
                    status_code=409,
                    detail=f"Account is already claimed by {claiming_user.username if claiming_user else 'another user'}"
                )
            else:
                # Claim has expired, remove it
                db.delete(existing_claim)
                db.commit()
        else:
            # User already has this claim, just update the expiration
            existing_claim.last_activity = datetime.utcnow()
            existing_claim.expires_at = datetime.utcnow() + timedelta(minutes=30)
            db.commit()

            # Broadcast claim update
            await manager.broadcast({
                "type": "account_claimed",
                "account_id": account_id,
                "user_id": current_user.id,
                "username": current_user.username
            })

            return {"message": "Account claim renewed", "expires_at": existing_claim.expires_at.isoformat()}

    # Create new claim
    claim = AccountClaim(
        account_id=account_id,
        user_id=current_user.id,
        claimed_at=datetime.utcnow(),
        last_activity=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=30)
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)

    # Mark all pending events for this account as claimed and log audit action
    from audit_helper import log_audit_action
    pending_events = db.query(AlarmEvent).join(Camera).filter(
        Camera.account_id == account_id,
        AlarmEvent.status == "pending"
    ).all()

    now = datetime.utcnow()
    for event in pending_events:
        event.claimed_by = current_user.id
        event.claimed_at = now

        # Log audit action
        log_audit_action(
            db=db,
            action="event_claimed",
            user_id=current_user.id,
            username=current_user.username,
            event_id=event.id,
            details={
                "account_id": account_id,
                "account_name": account.name,
                "camera_id": event.camera_id
            }
        )

    db.commit()

    # Broadcast claim to other users
    await manager.broadcast({
        "type": "account_claimed",
        "account_id": account_id,
        "user_id": current_user.id,
        "username": current_user.username
    })

    return {"message": "Account claimed successfully", "expires_at": claim.expires_at.isoformat()}

@app.post("/api/accounts/{account_id}/release")
async def release_account(
    account_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Release an account claim"""
    claim = db.query(AccountClaim).filter(
        AccountClaim.account_id == account_id,
        AccountClaim.user_id == current_user.id
    ).first()

    if not claim:
        # No claim exists - this is fine (might have been released already during escalation)
        return {"message": "Account already released or was not claimed"}

    db.delete(claim)
    db.commit()

    # Broadcast release to other users
    await manager.broadcast({
        "type": "account_released",
        "account_id": account_id,
        "user_id": current_user.id
    })

    return {"message": "Account released successfully"}

@app.get("/api/account-claims")
async def get_account_claims(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all active account claims"""
    claims = db.query(AccountClaim).all()

    result = []
    for claim in claims:
        user = db.query(User).filter(User.id == claim.user_id).first()
        result.append({
            "account_id": claim.account_id,
            "user_id": claim.user_id,
            "username": user.username if user else "Unknown",
            "claimed_at": claim.claimed_at.isoformat(),
            "expires_at": claim.expires_at.isoformat() if claim.expires_at else None
        })

    return result

# History endpoint
@app.get("/api/history")
async def get_alarm_history(
    account_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get historical alarms AND activity logs (snoozed/dismissed events) with optional filters for account and date range, with pagination"""

    # Get accessible account IDs based on user hierarchy
    accessible_account_ids = get_accessible_account_ids(current_user, db)

    # If user has no access, return empty list
    if accessible_account_ids is not None and len(accessible_account_ids) == 0:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}

    # Build all history items from multiple sources
    all_history_items = []

    # 1. Query all alarms (both resolved and active)
    alarm_query = db.query(Alarm).join(AlarmEvent, Alarm.event_id == AlarmEvent.id).join(Camera, AlarmEvent.camera_id == Camera.id)

    # Apply hierarchy filter
    if accessible_account_ids is not None:  # None means super admin (access to all)
        alarm_query = alarm_query.filter(Camera.account_id.in_(accessible_account_ids))

    # Apply account filter if provided
    if account_id:
        alarm_query = alarm_query.filter(Camera.account_id == account_id)

    # Apply date filters if provided
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            alarm_query = alarm_query.filter(Alarm.created_at >= start_dt)
        except ValueError:
            pass  # Ignore invalid date format

    if end_date:
        try:
            # Add one day to end_date to include the entire end date
            end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
            alarm_query = alarm_query.filter(Alarm.created_at < end_dt)
        except ValueError:
            pass  # Ignore invalid date format

    # Get all matching alarms
    alarms = alarm_query.all()

    # Format alarm items
    for alarm in alarms:
        event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
        if event:
            camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
            if camera:
                account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()

                media_paths = event.media_paths if isinstance(event.media_paths, list) else json.loads(event.media_paths)
                call_logs = alarm.call_logs if isinstance(alarm.call_logs, list) else (json.loads(alarm.call_logs) if alarm.call_logs else [])
                action_plan_state = alarm.action_plan_state if isinstance(alarm.action_plan_state, dict) else (json.loads(alarm.action_plan_state) if alarm.action_plan_state else {})

                # Get operator name from created_by user
                operator_name = None
                if alarm.created_by:
                    operator = db.query(User).filter(User.id == alarm.created_by).first()
                    if operator:
                        operator_name = operator.full_name or operator.username

                all_history_items.append({
                    "id": f"alarm_{alarm.id}",
                    "alarm_id": alarm.id,
                    "event_id": event.id,
                    "timestamp": event.timestamp.isoformat() + 'Z',  # Add Z to indicate UTC
                    "sort_timestamp": event.timestamp,
                    "account_number": account.account_number if account else "N/A",
                    "account_name": account.name if account else "N/A",
                    "account_id": camera.account_id,
                    "account_timezone": account.timezone if account and account.timezone else "UTC",
                    "camera_id": camera.id,
                    "camera_name": camera.name,
                    "location": camera.location,
                    "operator_name": operator_name,
                    "media_type": event.media_type or "video",
                    "media_paths": media_paths,
                    "media_count": len(media_paths),
                    "status": alarm.status,
                    "notes": alarm.notes,
                    "resolution": alarm.resolution,
                    "call_logs": call_logs,
                    "action_plan_state": action_plan_state,
                    "action_plan": account.action_plan if account else None,
                    "created_at": alarm.created_at.isoformat(),
                    "resolved_at": alarm.resolved_at.isoformat() if alarm.resolved_at else None
                })

    # 2. Query all activity logs (snoozed and dismissed events)
    activity_query = db.query(ActivityLog)

    # Apply hierarchy filter
    if accessible_account_ids is not None:  # None means super admin (access to all)
        activity_query = activity_query.filter(ActivityLog.account_id.in_(accessible_account_ids))

    # Apply account filter if provided
    if account_id:
        activity_query = activity_query.filter(ActivityLog.account_id == account_id)

    # Apply date filters if provided
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            activity_query = activity_query.filter(ActivityLog.timestamp >= start_dt)
        except ValueError:
            pass

    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
            activity_query = activity_query.filter(ActivityLog.timestamp < end_dt)
        except ValueError:
            pass

    # Get all matching activity logs
    activity_logs = activity_query.all()

    # Format activity log items
    for log in activity_logs:
        camera = db.query(Camera).filter(Camera.id == log.camera_id).first()
        if camera:
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()

            media_paths = json.loads(log.media_paths) if log.media_paths and isinstance(log.media_paths, str) else (log.media_paths if log.media_paths else [])

            # Get operator name from user_id
            operator_name = None
            if log.user_id:
                operator = db.query(User).filter(User.id == log.user_id).first()
                if operator:
                    operator_name = operator.full_name or operator.username

            all_history_items.append({
                "id": f"activity_{log.id}",
                "alarm_id": None,
                "event_id": None,
                "timestamp": log.timestamp.isoformat() + 'Z',  # Add Z to indicate UTC
                "sort_timestamp": log.timestamp,
                "account_number": account.account_number if account else "N/A",
                "account_name": account.name if account else "N/A",
                "account_id": camera.account_id,
                "account_timezone": account.timezone if account and account.timezone else "UTC",
                "camera_id": camera.id,
                "camera_name": camera.name,
                "location": camera.location,
                "operator_name": operator_name,
                "media_type": log.media_type or "unknown",
                "media_paths": media_paths,
                "media_count": len(media_paths),
                "status": log.event_type,
                "notes": log.notes,
                "resolution": log.resolution,
                "call_logs": [],
                "action_plan_state": {},
                "action_plan": account.action_plan if account else None,
                "created_at": log.created_at.isoformat() + 'Z',  # Add Z to indicate UTC
                "resolved_at": None
            })

    # Sort all items by timestamp (descending)
    all_history_items.sort(key=lambda x: x["sort_timestamp"], reverse=True)

    # Calculate pagination
    total_count = len(all_history_items)
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
    page = max(1, min(page, total_pages))
    offset = (page - 1) * page_size

    # Paginate
    paginated_items = all_history_items[offset:offset + page_size]

    # Remove sort_timestamp from output
    for item in paginated_items:
        del item["sort_timestamp"]

    return {
        "items": paginated_items,
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "total_pages": total_pages
    }

# Test endpoints
@app.post("/api/test/simulate-alarm")
async def simulate_test_alarm(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Simulate an alarm event for testing - captures real 5-second video from Front Door camera

    SECURITY: Rate limited to 3 requests per 5 minutes per user
    """
    # SECURITY: Rate limiting to prevent abuse
    from rate_limiter import rate_limiter
    rate_limiter.check_rate_limit(
        endpoint="simulate_test_alarm",
        user_id=current_user.id,
        max_requests=100,  # Increased for testing
        window_seconds=300  # 5 minutes
    )
    import subprocess
    from pathlib import Path
    import traceback

    try:
        # Find the Front Door camera
        camera = db.query(Camera).filter(Camera.name == "Front Door").first()
        if not camera:
            raise HTTPException(status_code=404, detail="Front Door camera not found")

        if not camera.rtsp_url:
            raise HTTPException(status_code=400, detail="Camera has no RTSP URL configured")

        # Build authenticated RTSP URL
        rtsp_url = camera.rtsp_url
        if camera.rtsp_username and camera.rtsp_password:
            # Parse the URL and inject credentials
            import urllib.parse
            parsed = urllib.parse.urlparse(rtsp_url)
            # Rebuild URL with credentials
            rtsp_url = f"{parsed.scheme}://{camera.rtsp_username}:{camera.rtsp_password}@{parsed.netloc}{parsed.path}"
            if parsed.query:
                rtsp_url += f"?{parsed.query}"
            if parsed.fragment:
                rtsp_url += f"#{parsed.fragment}"

        # Create unique filename for this alarm
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        dest_filename = f"test_alarm_{timestamp}.mp4"
        dest_path = uploads_dir / dest_filename

        # Capture 5 seconds of video from RTSP stream
        try:
            cmd = [
                '/usr/local/bin/ffmpeg',
                '-rtsp_transport', 'tcp',
                '-i', rtsp_url,
                '-t', '5',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-c:a', 'aac',
                '-y',
                str(dest_path)
            ]

            # Run ffmpeg with timeout
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=15,
                text=True
            )

            if result.returncode != 0 or not dest_path.exists():
                logger.error(f"FFmpeg failed: {result.stderr}")
                raise Exception(f"FFmpeg failed: {result.stderr[:200]}")

        except subprocess.TimeoutExpired:
            logger.error("Timeout capturing video from camera")
            raise HTTPException(status_code=500, detail="Timeout capturing video from camera")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Video capture error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to capture video: {str(e)}")

        # Create alarm event
        db_event = AlarmEvent(
            camera_id=camera.id,
            timestamp=datetime.utcnow(),
            media_type="video",
            media_paths=[f"uploads/{dest_filename}"],  # Use list directly instead of JSON string
            status="pending"
        )
        db.add(db_event)
        db.commit()
        db.refresh(db_event)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in simulate_test_alarm: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    # Try to auto-assign to an available operator
    try:
        assigned_user_id = await assign_event_to_operator(camera.account_id, db)
    except Exception as e:
        logger.error(f"Auto-assignment failed for test alarm: {str(e)}")
        assigned_user_id = None

    # Broadcast to WebSocket clients
    await manager.broadcast({
        "type": "new_event",
        "event_id": db_event.id,
        "camera_id": db_event.camera_id,
        "camera_name": camera.name,
        "account_id": camera.account_id,  # Add account_id at root level for filtering
        "timestamp": db_event.timestamp.isoformat(),
        "media_paths": db_event.media_paths if isinstance(db_event.media_paths, list) else json.loads(db_event.media_paths),
        "media_type": db_event.media_type or "video",
        "event": {
            "id": db_event.id,
            "camera_id": db_event.camera_id,
            "timestamp": db_event.timestamp.isoformat(),
            "media_paths": db_event.media_paths if isinstance(db_event.media_paths, list) else json.loads(db_event.media_paths),
            "status": db_event.status,
            "camera": {
                "id": camera.id,
                "name": camera.name,
                "location": camera.location,
                "account_id": camera.account_id
            }
        }
    })

    return {
        "message": "Test alarm created successfully",
        "event_id": db_event.id,
        "camera_name": camera.name
    }

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "viewing_alarm":
                    # Client is viewing an alarm, mark it
                    alarm_id = message.get("alarm_id")
                    account_id = message.get("account_id")
                    if alarm_id and account_id:
                        manager.set_viewing_alarm(websocket, alarm_id, account_id)
                elif message.get("type") == "left_alarm":
                    # Client left alarm view
                    manager.clear_viewing_alarm(websocket)
                elif message.get("type") == "on_dashboard":
                    # Client is on the dashboard
                    manager.set_on_dashboard(websocket)
                elif message.get("type") == "left_dashboard":
                    # Client left the dashboard
                    manager.clear_from_dashboard(websocket)
            except json.JSONDecodeError:
                pass  # Ignore invalid JSON
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Serve uploaded files
# Get absolute paths for static file serving
import os
from pathlib import Path

# Get the project root directory (parent of backend)
project_root = Path(__file__).parent.parent
# Use dedicated media volume for video storage
uploads_dir = Path("/mnt/media/uploads")
streams_dir = Path("/mnt/media/streams")

# Debug: Print the actual paths being used
print(f"Project root: {project_root.resolve()}")
print(f"Uploads dir: {uploads_dir.resolve()}")
print(f"Streams dir: {streams_dir.resolve()}")
print(f"Streams exists: {streams_dir.exists()}")

# Create directories if they don't exist
uploads_dir.mkdir(exist_ok=True)
streams_dir.mkdir(exist_ok=True)

# Mount static files with absolute paths
# Note: /uploads is now protected by token-based access (see /api/secure-image endpoint)
app.mount("/streams", StaticFiles(directory=str(streams_dir)), name="streams")

# ==================== SECURE IMAGE ACCESS ====================

from image_token_service import image_token_service
from fastapi.responses import FileResponse

@app.get("/api/secure-image")
async def get_secure_image(token: str):
    """
    Serve images with temporary token-based authentication
    Tokens expire after 1 hour and are signed with HMAC
    """
    # Validate token and get image path
    image_path = image_token_service.validate_token(token)

    if not image_path:
        raise HTTPException(status_code=403, detail="Invalid or expired token")

    # Build full path
    full_path = Path("/mnt/media") / image_path

    # Security check: ensure path is within allowed directory
    if not str(full_path).startswith("/mnt/media/uploads/vital_signs_snapshots/"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if file exists
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    # Return file
    return FileResponse(
        str(full_path),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff"
        }
    )

# ==================== SYSTEM HEALTH MONITORING ====================

@app.get("/api/stream-monitor/stats")
async def get_stream_monitor_stats(
    current_user: User = Depends(get_current_active_user)
):
    """Get current stream monitoring statistics"""
    from streaming_server import stream_manager

    try:
        all_stats = stream_manager.get_all_streams_stats()

        # Calculate summary statistics
        total_streams = len(all_stats)
        healthy_streams = sum(1 for s in all_stats.values() if s.get("healthy"))
        total_cpu = sum(s.get("cpu_percent", 0) for s in all_stats.values())
        total_memory = sum(s.get("memory_mb", 0) for s in all_stats.values())

        return {
            "total_streams": total_streams,
            "healthy_streams": healthy_streams,
            "unhealthy_streams": total_streams - healthy_streams,
            "total_cpu_percent": round(total_cpu, 1),
            "total_memory_mb": round(total_memory, 1),
            "streams": all_stats,
            "monitor_config": {
                "check_interval_seconds": STREAM_MONITOR_INTERVAL,
                "max_cpu_percent": STREAM_MAX_CPU_PERCENT,
                "max_memory_mb": STREAM_MAX_MEMORY_MB,
                "max_age_seconds": STREAM_MAX_AGE_SECONDS
            }
        }
    except Exception as e:
        logger.error(f"Error getting stream monitor stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/system-health", response_model=dict)
async def get_system_health(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """
    Get comprehensive system health metrics
    Only accessible by super_admin users
    """
    # Check if user is super_admin
    if current_user.access_level not in ['super_admin', 'country'] or current_user.role_type not in ['admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="Access denied. Superadmin only.")

    try:
        import psutil
        import shutil
        from streaming_server import stream_manager
        from pathlib import Path

        health_data = {}

        # ===== CPU Metrics =====
        cpu_percent = psutil.cpu_percent(interval=1, percpu=True)
        health_data['cpu'] = {
            'cores': len(cpu_percent),
            'usage_per_core': [round(p, 2) for p in cpu_percent],
            'average_usage': round(sum(cpu_percent) / len(cpu_percent), 2),
            'load_average': [round(x / psutil.cpu_count() * 100, 2) for x in psutil.getloadavg()],
            'status': 'healthy' if sum(cpu_percent) / len(cpu_percent) < 80 else 'warning' if sum(cpu_percent) / len(cpu_percent) < 95 else 'critical'
        }

        # ===== GPU Metrics (NVIDIA) =====
        try:
            import subprocess
            # Try multiple common paths for nvidia-smi
            nvidia_smi_paths = ['/usr/bin/nvidia-smi', '/usr/local/bin/nvidia-smi', 'nvidia-smi']
            nvidia_smi_cmd = None

            for path in nvidia_smi_paths:
                try:
                    test_result = subprocess.run([path, '--version'], capture_output=True, timeout=2)
                    if test_result.returncode == 0:
                        nvidia_smi_cmd = path
                        break
                except (FileNotFoundError, subprocess.TimeoutExpired):
                    continue

            if nvidia_smi_cmd:
                nvidia_smi = subprocess.run(
                    [nvidia_smi_cmd, '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'],
                    capture_output=True, text=True, timeout=5
                )
                if nvidia_smi.returncode == 0:
                    gpu_data = nvidia_smi.stdout.strip().split(', ')
                    gpu_util = float(gpu_data[0])
                    gpu_mem_used = int(gpu_data[1])
                    gpu_mem_total = int(gpu_data[2])
                    gpu_temp = int(gpu_data[3])
                    health_data['gpu'] = {
                        'available': True,
                        'utilization': gpu_util,
                        'memory_used_mb': gpu_mem_used,
                        'memory_total_mb': gpu_mem_total,
                        'memory_percent': round((gpu_mem_used / gpu_mem_total) * 100, 2),
                        'temperature': gpu_temp,
                        'status': 'healthy' if gpu_util < 80 and gpu_temp < 80 else 'warning' if gpu_util < 95 and gpu_temp < 85 else 'critical'
                    }
                else:
                    health_data['gpu'] = {'available': False, 'reason': 'nvidia-smi query failed'}
            else:
                health_data['gpu'] = {'available': False, 'reason': 'nvidia-smi not found in any standard path'}
        except Exception as e:
            health_data['gpu'] = {'available': False, 'reason': str(e)}

        # ===== RAM Metrics =====
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        health_data['ram'] = {
            'total_gb': round(memory.total / (1024**3), 2),
            'used_gb': round(memory.used / (1024**3), 2),
            'available_gb': round(memory.available / (1024**3), 2),
            'percent': memory.percent,
            'swap_total_gb': round(swap.total / (1024**3), 2),
            'swap_used_gb': round(swap.used / (1024**3), 2),
            'swap_percent': swap.percent,
            'status': 'healthy' if memory.percent < 80 else 'warning' if memory.percent < 90 else 'critical'
        }

        # ===== Disk Metrics =====
        disks = []
        for partition in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    'device': partition.device,
                    'mountpoint': partition.mountpoint,
                    'fstype': partition.fstype,
                    'total_gb': round(usage.total / (1024**3), 2),
                    'used_gb': round(usage.used / (1024**3), 2),
                    'free_gb': round(usage.free / (1024**3), 2),
                    'percent': usage.percent,
                    'status': 'healthy' if usage.percent < 80 else 'warning' if usage.percent < 90 else 'critical'
                })
            except PermissionError:
                continue
        health_data['disks'] = disks

        # ===== Network Metrics =====
        net_io = psutil.net_io_counters()
        try:
            net_connections = len(psutil.net_connections())
        except (PermissionError, psutil.AccessDenied):
            net_connections = 0  # Requires elevated permissions
        health_data['network'] = {
            'bytes_sent_gb': round(net_io.bytes_sent / (1024**3), 2),
            'bytes_recv_gb': round(net_io.bytes_recv / (1024**3), 2),
            'packets_sent': net_io.packets_sent,
            'packets_recv': net_io.packets_recv,
            'errors_in': net_io.errin,
            'errors_out': net_io.errout,
            'drops_in': net_io.dropin,
            'drops_out': net_io.dropout,
            'active_connections': net_connections,
            'status': 'healthy' if net_io.errin + net_io.errout < 100 else 'warning'
        }

        # ===== FFmpeg Processes =====
        ffmpeg_procs = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'create_time']):
            try:
                if proc.info['name'] and 'ffmpeg' in proc.info['name'].lower():
                    runtime = datetime.now().timestamp() - proc.info['create_time']
                    ffmpeg_procs.append({
                        'pid': proc.info['pid'],
                        'cpu_percent': round(proc.info['cpu_percent'], 2),
                        'memory_mb': round(proc.info['memory_info'].rss / (1024**2), 2),
                        'runtime_seconds': round(runtime),
                        'runtime_formatted': str(timedelta(seconds=int(runtime)))
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        health_data['ffmpeg'] = {
            'active_processes': len(ffmpeg_procs),
            'processes': ffmpeg_procs,
            'status': 'healthy' if len(ffmpeg_procs) > 0 else 'warning'
        }

        # ===== Redis Status =====
        try:
            if redis_client:
                await redis_client.ping()
                health_data['redis'] = {
                    'status': 'connected',
                    'healthy': True
                }
            else:
                health_data['redis'] = {
                    'status': 'not_configured',
                    'healthy': False
                }
        except Exception as e:
            health_data['redis'] = {
                'status': 'error',
                'error': str(e),
                'healthy': False
            }

        # ===== Database Status =====
        try:
            # Test query using the injected db session
            db.execute(text("SELECT 1"))
            health_data['database'] = {
                'status': 'connected',
                'healthy': True
            }
        except Exception as e:
            health_data['database'] = {
                'status': 'error',
                'error': str(e),
                'healthy': False
            }

        # ===== Streaming Status =====
        active_streams = len(stream_manager.active_streams)
        health_data['streaming'] = {
            'active_streams': active_streams,
            'status': 'healthy' if active_streams >= 0 else 'warning'
        }

        # ===== SMTP Server Status =====
        smtp_running = False
        smtp_port = 2525
        try:
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('127.0.0.1', smtp_port))
            sock.close()
            smtp_running = (result == 0)
        except Exception as e:
            logger.warning(f"Error checking SMTP status: {e}")

        health_data['smtp'] = {
            'running': smtp_running,
            'port': smtp_port,
            'status': 'healthy' if smtp_running else 'critical',
            'message': 'SMTP server is accepting connections' if smtp_running else 'SMTP server is not running - cameras cannot send emails'
        }

        # ===== Overall System Status =====
        warnings = []
        criticals = []

        if health_data['cpu']['status'] == 'critical':
            criticals.append('CPU usage critical')
        elif health_data['cpu']['status'] == 'warning':
            warnings.append('CPU usage high')

        if health_data['ram']['status'] == 'critical':
            criticals.append('RAM usage critical')
        elif health_data['ram']['status'] == 'warning':
            warnings.append('RAM usage high')

        for disk in health_data['disks']:
            if disk['status'] == 'critical':
                criticals.append(f"Disk {disk['mountpoint']} critical")
            elif disk['status'] == 'warning':
                warnings.append(f"Disk {disk['mountpoint']} high")

        if health_data.get('gpu', {}).get('status') == 'critical':
            criticals.append('GPU usage/temperature critical')
        elif health_data.get('gpu', {}).get('status') == 'warning':
            warnings.append('GPU usage/temperature high')

        if not health_data['redis']['healthy']:
            warnings.append('Redis not connected')

        if not health_data['database']['healthy']:
            criticals.append('Database not connected')

        if not health_data['smtp']['running']:
            criticals.append('SMTP server not running')

        overall_status = 'critical' if criticals else 'warning' if warnings else 'healthy'

        health_data['overall'] = {
            'status': overall_status,
            'warnings': warnings,
            'criticals': criticals,
            'timestamp': datetime.now().isoformat()
        }

        return health_data

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error getting system health: {e}\n{error_details}")
        print(f"SYSTEM HEALTH ERROR: {e}\n{error_details}")
        raise HTTPException(status_code=500, detail=f"{str(e)}")

@app.post("/api/system-health/smtp/restart")
async def restart_smtp_server(current_user: User = Depends(get_current_active_user)):
    """
    Restart SMTP server
    Only accessible by super_admin users
    """
    # Check if user is super_admin
    if current_user.access_level not in ['super_admin', 'country'] or current_user.role_type not in ['admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="Access denied. Superadmin only.")

    global smtp_server

    try:
        # Stop existing SMTP server if running
        if smtp_server:
            try:
                await smtp_server.stop()
                logger.info("[SMTP] Stopped existing SMTP server")
            except Exception as e:
                logger.warning(f"[SMTP] Error stopping existing server: {e}")

        # Start new SMTP server
        smtp_server = SMTPServer(manager)
        asyncio.create_task(smtp_server.start())
        logger.info("[SMTP] Restarted SMTP server")

        # Send email notification about SMTP restart
        try:
            await email_service.send_alert_email(
                to_email="steven@statewidecs.com",
                subject="SMTP Server Restarted",
                body=f"The SMTP server was manually restarted at {datetime.now().isoformat()} UTC by user {current_user.username}."
            )
        except Exception as e:
            logger.error(f"Failed to send SMTP restart notification email: {e}")

        return {"message": "SMTP server restarted successfully", "status": "success"}

    except Exception as e:
        logger.error(f"Failed to restart SMTP server: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to restart SMTP server: {str(e)}")

# Start SMTP server
smtp_server = None
monitor_task = None

# Stream monitoring configuration
STREAM_MONITOR_INTERVAL = 30  # Check every 30 seconds
STREAM_MAX_CPU_PERCENT = 50  # Alert if CPU usage exceeds 50%
STREAM_MAX_MEMORY_MB = 500  # Alert if memory exceeds 500MB
STREAM_MAX_AGE_SECONDS = 15  # Restart if no segments for 15 seconds

async def auto_assign_task():
    """Background task to auto-assign pending events to receiving operators"""
    from database import SessionLocal
    from models import AlarmEvent, Camera, AccountClaim

    print("[AUTO-ASSIGN-TASK] Task starting...", flush=True)

    # Give the app time to fully start up
    await asyncio.sleep(5)
    print("[AUTO-ASSIGN-TASK] Starting main loop", flush=True)

    while True:
        try:
            db = SessionLocal()
            try:
                # Get all pending events that don't have an active claim
                pending_events = db.query(AlarmEvent).filter(AlarmEvent.status == "pending").all()

                if pending_events:
                    print(f"[AUTO-ASSIGN-TASK] Found {len(pending_events)} pending events to check", flush=True)

                for event in pending_events:
                    try:
                        # Get camera and account
                        camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
                        if not camera:
                            continue

                        account_id = camera.account_id

                        # Check if this account already has an active claim
                        existing_claim = db.query(AccountClaim).filter(
                            AccountClaim.account_id == account_id,
                            AccountClaim.expires_at > datetime.utcnow()
                        ).first()

                        if existing_claim:
                            # Already claimed, skip
                            continue

                        # Try to auto-assign
                        print(f"[AUTO-ASSIGN-TASK] Attempting to assign pending event {event.id} for account {account_id}", flush=True)
                        assigned_user_id = await assign_event_to_operator(account_id, db)
                        if assigned_user_id:
                            print(f"[AUTO-ASSIGN-TASK] Pending event {event.id} assigned to user {assigned_user_id}", flush=True)
                            logger.info(f"[AUTO-ASSIGN-TASK] Event {event.id} auto-assigned to user {assigned_user_id}")
                        else:
                            print(f"[AUTO-ASSIGN-TASK] No available users for pending event {event.id}", flush=True)

                    except Exception as e:
                        print(f"[AUTO-ASSIGN-TASK] Error processing pending event {event.id}: {e}", flush=True)
                        logger.error(f"[AUTO-ASSIGN-TASK] Error assigning event {event.id}: {e}")

                # Get all escalated events that don't have an active claim
                escalated_events = db.query(AlarmEvent).filter(AlarmEvent.status == "escalated").all()

                if escalated_events:
                    print(f"[AUTO-ASSIGN-TASK] Found {len(escalated_events)} escalated events to check", flush=True)

                for event in escalated_events:
                    try:
                        # Get camera and account
                        camera = db.query(Camera).filter(Camera.id == event.camera_id).first()
                        if not camera:
                            continue

                        account_id = camera.account_id

                        # Check if this account already has an active claim
                        existing_claim = db.query(AccountClaim).filter(
                            AccountClaim.account_id == account_id,
                            AccountClaim.expires_at > datetime.utcnow()
                        ).first()

                        if existing_claim:
                            # Already claimed, skip
                            continue

                        # Try to auto-assign to user_escalate users
                        print(f"[AUTO-ASSIGN-TASK] Attempting to assign escalated event {event.id} for account {account_id}", flush=True)
                        assigned_user_id = await assign_escalated_event_to_escalate_user(account_id, db)
                        if assigned_user_id:
                            print(f"[AUTO-ASSIGN-TASK] Escalated event {event.id} assigned to user_escalate user {assigned_user_id}", flush=True)
                            logger.info(f"[AUTO-ASSIGN-TASK] Escalated event {event.id} auto-assigned to user_escalate user {assigned_user_id}")
                        else:
                            print(f"[AUTO-ASSIGN-TASK] No available user_escalate users for escalated event {event.id}", flush=True)

                    except Exception as e:
                        print(f"[AUTO-ASSIGN-TASK] Error processing escalated event {event.id}: {e}", flush=True)
                        logger.error(f"[AUTO-ASSIGN-TASK] Error assigning escalated event {event.id}: {e}")

            except Exception as e:
                print(f"[AUTO-ASSIGN-TASK] Database error: {e}", flush=True)
                logger.error(f"[AUTO-ASSIGN-TASK] Database error: {e}")
            finally:
                db.close()

        except Exception as e:
            print(f"[AUTO-ASSIGN-TASK] Outer task error: {e}", flush=True)
            logger.error(f"[AUTO-ASSIGN-TASK] Task error: {e}")

        # Wait 2 seconds before next check
        await asyncio.sleep(2)

async def stream_monitor_task():
    """Background task to monitor and maintain stream health"""
    from streaming_server import stream_manager
    from database import SessionLocal
    from models import Camera

    logger.info("Stream monitor task started")

    while True:
        try:
            await asyncio.sleep(STREAM_MONITOR_INTERVAL)

            # Get all stream statistics
            all_stats = stream_manager.get_all_streams_stats()

            # Check for stale stream directories on disk (streams that died but left files)
            # This catches cases where FFmpeg crashed and was removed from active_streams
            from pathlib import Path
            streams_dir = Path("/mnt/media/streams")
            if streams_dir.exists():
                for camera_dir in streams_dir.iterdir():
                    if camera_dir.is_dir() and camera_dir.name.isdigit():
                        camera_id = int(camera_dir.name)

                        # Skip if this stream is already being monitored
                        if camera_id in all_stats:
                            continue

                        # Check if there's a stale playlist file
                        playlist_file = camera_dir / "playlist.m3u8"
                        if playlist_file.exists():
                            age = time.time() - playlist_file.stat().st_mtime
                            if age > 15:  # Playlist older than 15 seconds means stream is dead
                                logger.warning(f"Found stale stream directory for camera {camera_id} (playlist age: {age:.1f}s)")

                                # Try to restart the stream
                                db = SessionLocal()
                                try:
                                    camera = db.query(Camera).filter(Camera.id == camera_id).first()
                                    if camera and camera.rtsp_url:
                                        logger.info(f"Automatically restarting stale stream for camera {camera_id}")
                                        rtsp_url = build_rtsp_url_with_credentials(camera)
                                        # Force restart which cleans up old files
                                        stream_manager.force_restart_stream(camera_id, rtsp_url)
                                    else:
                                        # Camera not found or no RTSP URL - clean up the stale files
                                        logger.warning(f"Cannot restart camera {camera_id} - cleaning up stale files")
                                        stream_manager._cleanup_stream_files(camera_id)
                                finally:
                                    db.close()

            if not all_stats:
                # No active streams, just cleanup orphaned processes
                stream_manager.cleanup_all_orphaned_streams()
                continue

            logger.info(f"Monitoring {len(all_stats)} active streams")

            for camera_id, stats in all_stats.items():
                try:
                    if not stats.get("active"):
                        # Stream is not active but exists in active_streams
                        # This shouldn't happen, but clean it up
                        logger.warning(f"Camera {camera_id} marked as active but process is not running, cleaning up...")
                        stream_manager.stop_stream(camera_id)
                        continue

                    # Check if stream is healthy
                    if not stats.get("healthy"):
                        logger.warning(f"Camera {camera_id} stream is unhealthy - last update: {stats.get('last_update_age', 'N/A')}s ago")

                        # Get camera info to restart stream
                        db = SessionLocal()
                        try:
                            camera = db.query(Camera).filter(Camera.id == camera_id).first()
                            if camera and camera.rtsp_url:
                                logger.info(f"Automatically restarting unhealthy stream for camera {camera_id}")
                                rtsp_url = build_rtsp_url_with_credentials(camera)
                                # Use force restart which handles cleanup
                                stream_manager.force_restart_stream(camera_id, rtsp_url)
                            else:
                                logger.warning(f"Cannot restart stream for camera {camera_id} - camera not found or no RTSP URL")
                                stream_manager.stop_stream(camera_id)
                        finally:
                            db.close()
                        continue

                    # Check if stream should be stopped based on viewer count
                    from streaming_server import should_stop_stream, get_stream_viewer_count
                    viewer_count = await get_stream_viewer_count(camera_id)
                    should_stop = await should_stop_stream(camera_id)

                    if should_stop and viewer_count == 0:
                        logger.info(f"Camera {camera_id} has no viewers and grace period expired, stopping stream")
                        await stop_camera_stream(camera_id)
                        continue

                    # Check resource usage
                    cpu_percent = stats.get("cpu_percent", 0)
                    memory_mb = stats.get("memory_mb", 0)

                    # Refresh stream_active key in Redis (extend TTL for healthy streams)
                    await redis_coordinator.set_with_ttl(f"stream_active:{camera_id}", "1", 60)

                    # Store health stats in Redis for cross-worker visibility
                    health_data = {
                        "cpu_percent": cpu_percent,
                        "memory_mb": memory_mb,
                        "segment_count": stats.get("segment_count", 0),
                        "last_update_age": stats.get("last_update_age", 0),
                        "healthy": True,
                        "last_check": time.time()
                    }
                    await redis_coordinator.set_with_ttl(f"stream_health:{camera_id}", health_data, 90)

                    if cpu_percent > STREAM_MAX_CPU_PERCENT:
                        logger.warning(f"Camera {camera_id} stream using high CPU: {cpu_percent:.1f}% (PID: {stats.get('pid')})")

                    if memory_mb > STREAM_MAX_MEMORY_MB:
                        logger.warning(f"Camera {camera_id} stream using high memory: {memory_mb:.1f}MB (PID: {stats.get('pid')})")
                        # High memory might indicate a leak, restart the stream
                        logger.info(f"Restarting camera {camera_id} stream due to high memory usage")
                        db = SessionLocal()
                        try:
                            camera = db.query(Camera).filter(Camera.id == camera_id).first()
                            if camera and camera.rtsp_url:
                                rtsp_url = build_rtsp_url_with_credentials(camera)
                                stream_manager.force_restart_stream(camera_id, rtsp_url)
                        finally:
                            db.close()

                    # Log healthy stream stats
                    logger.debug(f"Camera {camera_id}: CPU {cpu_percent:.1f}%, Memory {memory_mb:.1f}MB, "
                               f"Segments: {stats.get('segment_count')}, Last update: {stats.get('last_update_age', 0):.1f}s ago")

                except Exception as e:
                    logger.error(f"Error monitoring camera {camera_id}: {e}")

            # Clean up any orphaned FFmpeg processes not in our tracking
            stream_manager.cleanup_all_orphaned_streams()

        except asyncio.CancelledError:
            logger.info("Stream monitor task cancelled")
            break
        except Exception as e:
            logger.error(f"Error in stream monitor task: {e}")
            # Continue monitoring even if there's an error
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    global smtp_server, redis_client, monitor_task

    # Initialize Redis connection
    try:
        redis_client = await redis.from_url("redis://localhost:6379", decode_responses=True)
        logger.info("Redis connection established")

        # Start Redis listener for this worker
        asyncio.create_task(manager.start_listener())
        logger.info("Redis pub/sub listener started")

        # Set Redis client in stream manager for cross-worker coordination
        from streaming_server import set_redis_client
        set_redis_client(redis_client)
        logger.info("Stream manager configured with Redis for multi-worker support")

        # Set Redis client in coordinator for distributed locks
        set_coordinator_redis(redis_client)
        logger.info("Redis coordinator initialized for distributed locking")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        logger.info("Continuing without Redis...")
        redis_client = None

    # Clean up any orphaned FFmpeg processes
    from streaming_server import stream_manager
    stream_manager.kill_all_ffmpeg_processes()

    # Start auto-assignment task
    try:
        auto_assign_bg_task = asyncio.create_task(auto_assign_task())
        logger.info("Auto-assignment task started")
    except Exception as e:
        logger.error(f"Failed to start auto-assignment task: {e}")

    # Start stream monitoring task
    try:
        monitor_task = asyncio.create_task(stream_monitor_task())
        logger.info("Stream monitoring task started")
    except Exception as e:
        logger.error(f"Failed to start stream monitor: {e}")

    # Start SMTP server (optional - may fail on some systems)
    try:
        smtp_server = SMTPServer(manager)
        asyncio.create_task(smtp_server.start())
        print("SMTP Server started on port 2525")
    except Exception as e:
        print(f"SMTP Server failed to start: {e}")
        print("Continuing without SMTP server...")
        smtp_server = None

    # Start Vital Signs Scheduler
    try:
        asyncio.create_task(vital_signs_scheduler.start())
        logger.info("Vital Signs Scheduler started")
    except Exception as e:
        logger.error(f"Failed to start Vital Signs Scheduler: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    global redis_client, monitor_task

    # Stop Vital Signs Scheduler
    try:
        await vital_signs_scheduler.stop()
        logger.info("Vital Signs Scheduler stopped")
    except Exception as e:
        logger.error(f"Error stopping Vital Signs Scheduler: {e}")

    # Cancel stream monitoring task
    if monitor_task and not monitor_task.done():
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            logger.info("Stream monitor task cancelled successfully")

    if smtp_server:
        await smtp_server.stop()

    # Close Redis connection
    if redis_client:
        await redis_client.close()
        print("Redis connection closed")

    # Stop all active streams
    from streaming_server import stream_manager
    stream_manager.stop_all_streams()
    print("All streams stopped")

# ===== REPORTS ENDPOINTS =====

@app.get("/api/reports/operator_login")
async def get_operator_login_report(
    operator_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Generate operator login/logout report - shows all user activity"""
    query = db.query(UserActivityLog)

    if operator_id:
        query = query.filter(UserActivityLog.user_id == operator_id)

    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.filter(UserActivityLog.timestamp >= start_dt)

    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.filter(UserActivityLog.timestamp < end_dt)

    logs = query.order_by(UserActivityLog.timestamp.desc()).all()

    rows = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        rows.append([
            user.full_name or user.username if user else 'Unknown',
            log.action.upper(),
            log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            log.details or '-'
        ])

    return {
        "headers": ["Operator", "Action", "Timestamp", "Details"],
        "rows": rows,
        "summary": {
            "Total Events": len(rows)
        }
    }

@app.get("/api/reports/operator_receiving")
async def get_operator_receiving_report(
    operator_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    detail_level: str = 'summary',
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Generate operator receiving status report"""
    query = db.query(UserActivityLog).filter(
        UserActivityLog.action.in_(['receiving_enabled', 'receiving_disabled', 'receiving_auto_disabled'])
    )

    if operator_id:
        query = query.filter(UserActivityLog.user_id == operator_id)

    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.filter(UserActivityLog.timestamp >= start_dt)

    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.filter(UserActivityLog.timestamp < end_dt)

    logs = query.order_by(UserActivityLog.user_id, UserActivityLog.timestamp).all()

    if detail_level == 'summary':
        # Calculate total receiving/not receiving time per operator
        user_stats = {}
        for log in logs:
            user = db.query(User).filter(User.id == log.user_id).first()
            username = user.full_name or user.username if user else 'Unknown'

            if username not in user_stats:
                user_stats[username] = {'receiving_time': 0, 'not_receiving_time': 0, 'last_action': None, 'last_timestamp': None}

            # Calculate time differences
            if user_stats[username]['last_timestamp']:
                time_diff = (log.timestamp - user_stats[username]['last_timestamp']).total_seconds() / 3600  # in hours
                if user_stats[username]['last_action'] == 'receiving_enabled':
                    user_stats[username]['receiving_time'] += time_diff
                elif user_stats[username]['last_action'] in ['receiving_disabled', 'receiving_auto_disabled']:
                    user_stats[username]['not_receiving_time'] += time_diff

            user_stats[username]['last_action'] = log.action
            user_stats[username]['last_timestamp'] = log.timestamp

        rows = []
        for username, stats in user_stats.items():
            total_time = stats['receiving_time'] + stats['not_receiving_time']
            receiving_pct = (stats['receiving_time'] / total_time * 100) if total_time > 0 else 0
            rows.append([
                username,
                f"{stats['receiving_time']:.2f}h",
                f"{stats['not_receiving_time']:.2f}h",
                f"{receiving_pct:.1f}%"
            ])

        return {
            "headers": ["Operator", "Receiving Time", "Not Receiving Time", "Receiving %"],
            "rows": rows,
            "summary": {}
        }
    else:
        # Detailed view
        rows = []
        for log in logs:
            user = db.query(User).filter(User.id == log.user_id).first()
            status = 'RECEIVING' if log.action == 'receiving_enabled' else 'NOT RECEIVING'
            rows.append([
                user.full_name or user.username if user else 'Unknown',
                status,
                log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                log.details or '-'
            ])

        return {
            "headers": ["Operator", "Status", "Timestamp", "Reason"],
            "rows": rows,
            "summary": {
                "Total Events": len(rows)
            }
        }

@app.get("/api/reports/avg_time_receive")
async def get_avg_time_receive_report(
    operator_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    priority: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Average time to receive alarm events"""
    # Get accessible account IDs based on user hierarchy
    accessible_account_ids = get_accessible_account_ids(current_user, db)

    # If user has no access, return empty report
    if accessible_account_ids is not None and len(accessible_account_ids) == 0:
        return {"headers": ["Event ID", "Camera", "Operator", "Status", "Priority", "Time to Receive"], "rows": [], "summary": {"Total Events": 0, "Average Time": "0.00 min"}}

    query = db.query(AlarmEvent).join(Camera, AlarmEvent.camera_id == Camera.id).filter(AlarmEvent.claimed_by.isnot(None))

    # Apply hierarchy filter
    if accessible_account_ids is not None:  # None means super admin (access to all)
        query = query.filter(Camera.account_id.in_(accessible_account_ids))

    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.filter(AlarmEvent.timestamp >= start_dt)

    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.filter(AlarmEvent.timestamp < end_dt)

    if event_type:
        if event_type == 'escalated':
            query = query.filter(AlarmEvent.status == 'escalated')
        elif event_type == 'alarm':
            query = query.join(Alarm).filter(Alarm.event_id == AlarmEvent.id)

    if priority:
        query = query.filter(AlarmEvent.priority == priority)

    events = query.all()

    rows = []
    total_time = 0
    count = 0

    for event in events:
        if operator_id and event.claimed_by != operator_id:
            continue

        if event.claimed_at:
            time_to_receive = (event.claimed_at - event.timestamp).total_seconds() / 60  # minutes
            user = db.query(User).filter(User.id == event.claimed_by).first()
            camera = db.query(Camera).filter(Camera.id == event.camera_id).first()

            rows.append([
                event.id,
                camera.name if camera else 'Unknown',
                user.full_name or user.username if user else 'Unknown',
                event.status.upper(),
                event.priority or 5,
                f"{time_to_receive:.2f} min"
            ])
            total_time += time_to_receive
            count += 1

    avg_time = total_time / count if count > 0 else 0

    return {
        "headers": ["Event ID", "Camera", "Operator", "Type", "Priority", "Time to Receive"],
        "rows": rows,
        "summary": {
            "Average Time": f"{avg_time:.2f} min",
            "Total Events": count
        }
    }

@app.get("/api/reports/avg_time_handle")
async def get_avg_time_handle_report(
    operator_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    priority: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Average time to handle/resolve alarms"""
    # Get accessible account IDs based on user hierarchy
    accessible_account_ids = get_accessible_account_ids(current_user, db)

    # If user has no access, return empty report
    if accessible_account_ids is not None and len(accessible_account_ids) == 0:
        return {"headers": ["Alarm ID", "Camera", "Operator", "Resolution", "Priority", "Handle Time"], "rows": [], "summary": {"Total Alarms": 0, "Average Handle Time": "0.00 min"}}

    query = db.query(Alarm).join(AlarmEvent, Alarm.event_id == AlarmEvent.id).join(Camera, AlarmEvent.camera_id == Camera.id)

    # Apply hierarchy filter
    if accessible_account_ids is not None:  # None means super admin (access to all)
        query = query.filter(Camera.account_id.in_(accessible_account_ids))

    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.filter(Alarm.created_at >= start_dt)

    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.filter(Alarm.created_at < end_dt)

    if operator_id:
        query = query.filter(Alarm.created_by == operator_id)

    alarms = query.all()

    rows = []
    total_time = 0
    count = 0

    for alarm in alarms:
        event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
        if not event:
            continue

        if priority and event.priority != priority:
            continue

        if alarm.resolved_at:
            handle_time = (alarm.resolved_at - alarm.created_at).total_seconds() / 60  # minutes
            user = db.query(User).filter(User.id == alarm.created_by).first()
            camera = db.query(Camera).filter(Camera.id == event.camera_id).first()

            rows.append([
                alarm.id,
                camera.name if camera else 'Unknown',
                user.full_name or user.username if user else 'Unknown',
                alarm.resolution or 'N/A',
                event.priority or 5,
                f"{handle_time:.2f} min"
            ])
            total_time += handle_time
            count += 1

    avg_time = total_time / count if count > 0 else 0

    return {
        "headers": ["Alarm ID", "Camera", "Operator", "Resolution", "Priority", "Handle Time"],
        "rows": rows,
        "summary": {
            "Average Time": f"{avg_time:.2f} min",
            "Total Alarms": count
        }
    }

@app.get("/api/reports/total_handle_time")
async def get_total_handle_time_report(
    operator_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    priority: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Total operator handle time"""
    # Get accessible account IDs based on user hierarchy
    accessible_account_ids = get_accessible_account_ids(current_user, db)

    # If user has no access, return empty report
    if accessible_account_ids is not None and len(accessible_account_ids) == 0:
        return {"headers": ["Operator", "Total Handle Time", "Alarm Count", "Average Time"], "rows": [], "summary": {}}

    query = db.query(Alarm).join(AlarmEvent, Alarm.event_id == AlarmEvent.id).join(Camera, AlarmEvent.camera_id == Camera.id)

    # Apply hierarchy filter
    if accessible_account_ids is not None:  # None means super admin (access to all)
        query = query.filter(Camera.account_id.in_(accessible_account_ids))

    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.filter(Alarm.created_at >= start_dt)

    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.filter(Alarm.created_at < end_dt)

    if operator_id:
        query = query.filter(Alarm.created_by == operator_id)

    alarms = query.all()

    operator_times = {}

    for alarm in alarms:
        event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
        if not event:
            continue

        if priority and event.priority != priority:
            continue

        user = db.query(User).filter(User.id == alarm.created_by).first()
        username = user.full_name or user.username if user else 'Unknown'

        if username not in operator_times:
            operator_times[username] = {'total_time': 0, 'alarm_count': 0}

        if alarm.resolved_at:
            handle_time = (alarm.resolved_at - alarm.created_at).total_seconds() / 3600  # hours
            operator_times[username]['total_time'] += handle_time

        operator_times[username]['alarm_count'] += 1

    rows = []
    for username, stats in operator_times.items():
        avg_time = stats['total_time'] / stats['alarm_count'] if stats['alarm_count'] > 0 else 0
        rows.append([
            username,
            stats['alarm_count'],
            f"{stats['total_time']:.2f}h",
            f"{avg_time:.2f}h"
        ])

    return {
        "headers": ["Operator", "Alarms Handled", "Total Time", "Avg per Alarm"],
        "rows": rows,
        "summary": {}
    }

@app.get("/api/reports/alarms_handled")
async def get_alarms_handled_report(
    operator_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    priority: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Alarms handled report with counts and breakdowns"""
    # Get accessible account IDs based on user hierarchy
    accessible_account_ids = get_accessible_account_ids(current_user, db)

    # If user has no access, return empty report
    if accessible_account_ids is not None and len(accessible_account_ids) == 0:
        return {"headers": ["Operator", "Total", "Resolved", "Active", "Video False", "Contacted"], "rows": [], "summary": {}}

    query = db.query(Alarm).join(AlarmEvent, Alarm.event_id == AlarmEvent.id).join(Camera, AlarmEvent.camera_id == Camera.id)

    # Apply hierarchy filter
    if accessible_account_ids is not None:  # None means super admin (access to all)
        query = query.filter(Camera.account_id.in_(accessible_account_ids))

    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.filter(Alarm.created_at >= start_dt)

    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.filter(Alarm.created_at < end_dt)

    if operator_id:
        query = query.filter(Alarm.created_by == operator_id)

    alarms = query.all()

    operator_stats = {}

    for alarm in alarms:
        event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
        if not event:
            continue

        if priority and event.priority != priority:
            continue

        user = db.query(User).filter(User.id == alarm.created_by).first()
        username = user.full_name or user.username if user else 'Unknown'

        if username not in operator_stats:
            operator_stats[username] = {
                'total': 0,
                'resolved': 0,
                'active': 0,
                'video_false': 0,
                'contacted': 0
            }

        operator_stats[username]['total'] += 1

        if alarm.status == 'resolved':
            operator_stats[username]['resolved'] += 1
        else:
            operator_stats[username]['active'] += 1

        if alarm.resolution == 'Video False':
            operator_stats[username]['video_false'] += 1
        elif alarm.resolution:
            operator_stats[username]['contacted'] += 1

    rows = []
    for username, stats in operator_stats.items():
        rows.append([
            username,
            stats['total'],
            stats['resolved'],
            stats['active'],
            stats['video_false'],
            stats['contacted']
        ])

    return {
        "headers": ["Operator", "Total", "Resolved", "Active", "Video False", "Contacted"],
        "rows": rows,
        "summary": {
            "Total Alarms": sum(s['total'] for s in operator_stats.values())
        }
    }

# PBX Configuration Endpoints
@app.get("/api/pbx/config")
async def get_pbx_config(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get PBX configuration for the current user.
    Returns WebSocket server, domain, and user extension info.
    """
    # Get PBX configuration from environment variables and user database fields
    pbx_config = {
        "wsServer": os.getenv("PBX_WS_SERVER", "pbx.example.com:8089"),
        "domain": os.getenv("PBX_DOMAIN", "pbx.example.com"),
        "userExtension": current_user.sip_extension or current_user.username,
        "displayName": current_user.full_name or current_user.username,
        "password": current_user.sip_password or ""  # User's SIP password from database
    }

    return pbx_config

@app.post("/api/pbx/call")
async def initiate_pbx_call(
    phone_number: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Initiate an outbound call via PBX.
    This endpoint can be used as a fallback if client-side JsSIP fails.
    """
    try:
        # In a real implementation, this would connect to Asterisk AMI
        # and initiate an originate call command
        # For now, we'll just log the request
        logger.info(f"Call initiated by {current_user.username} to {phone_number}")

        return {
            "success": True,
            "message": f"Call initiated to {phone_number}",
            "callId": f"call-{int(time.time())}"
        }
    except Exception as e:
        logger.error(f"Error initiating call: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate call")

@app.post("/api/pbx/hangup")
async def hangup_pbx_call(
    call_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Hangup an active call via PBX AMI.
    """
    try:
        logger.info(f"Call hangup requested by {current_user.username} for call {call_id}")

        return {
            "success": True,
            "message": "Call terminated"
        }
    except Exception as e:
        logger.error(f"Error hanging up call: {e}")
        raise HTTPException(status_code=500, detail="Failed to hangup call")

@app.post("/api/audit-log")
async def create_audit_log(
    action: str,
    alarm_id: Optional[int] = None,
    event_id: Optional[int] = None,
    details: Optional[dict] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Create an audit log entry for alarm/event actions.
    Used for tracking important actions like contact calls, escalations, etc.
    """
    try:
        audit_log = AlarmAuditLog(
            action=action,
            alarm_id=alarm_id,
            event_id=event_id,
            user_id=current_user.id,
            username=current_user.username,
            details=details,
            timestamp=datetime.utcnow()
        )

        db.add(audit_log)
        db.commit()
        db.refresh(audit_log)

        logger.info(f"Audit log created: {action} by {current_user.username} for alarm {alarm_id}")

        return {
            "success": True,
            "id": audit_log.id,
            "timestamp": audit_log.timestamp.isoformat()
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating audit log: {e}")
        raise HTTPException(status_code=500, detail="Failed to create audit log")

@app.get("/api/alarms/{alarm_id}/audit-logs")
async def get_alarm_audit_logs(
    alarm_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all audit log entries for a specific alarm.
    Returns chronological list of actions taken on the alarm.
    """
    try:
        logs = db.query(AlarmAuditLog).filter(
            AlarmAuditLog.alarm_id == alarm_id
        ).order_by(AlarmAuditLog.timestamp.desc()).all()

        return [
            {
                "id": log.id,
                "action": log.action,
                "user_id": log.user_id,
                "username": log.username,
                "timestamp": log.timestamp.isoformat(),
                "details": log.details
            }
            for log in logs
        ]
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")

# ==================== VITAL SIGNS MONITORING ENDPOINTS ====================

@app.get("/api/vital-signs/cameras/{camera_id}/status", response_model=VitalSignsStatusResponse)
async def get_camera_vital_signs_status(
    camera_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get current vital signs status for a camera"""
    try:
        status = db.query(CameraVitalSignsStatus).filter(
            CameraVitalSignsStatus.camera_id == camera_id
        ).first()

        if not status:
            raise HTTPException(status_code=404, detail="Vital signs status not found for this camera")

        return status
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching vital signs status: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch vital signs status")

@app.get("/api/vital-signs/cameras/{camera_id}/checks", response_model=List[VitalSignsCheckResponse])
async def get_camera_vital_signs_checks(
    camera_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get recent vital signs check history for a camera"""
    try:
        checks = db.query(CameraVitalSignsCheck).filter(
            CameraVitalSignsCheck.camera_id == camera_id
        ).order_by(CameraVitalSignsCheck.check_time.desc()).limit(limit).all()

        return checks
    except Exception as e:
        logger.error(f"Error fetching vital signs checks: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch vital signs checks")

@app.post("/api/vital-signs/cameras/{camera_id}/check")
async def trigger_camera_vital_signs_check(
    camera_id: int,
    check_type: str = "both",  # connectivity, image_change, or both
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Manually trigger a vital signs check on a camera"""
    try:
        # Verify camera exists
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")

        # Run check via scheduler
        results = await vital_signs_scheduler.run_manual_check(camera_id, check_type)

        return {
            "success": True,
            "camera_id": camera_id,
            "check_type": check_type,
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering vital signs check: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger vital signs check: {str(e)}")

@app.get("/api/vital-signs/status")
async def get_all_vital_signs_status(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get vital signs status grouped by account"""
    try:
        # Get accessible account IDs based on user hierarchy
        accessible_account_ids = get_accessible_account_ids(current_user, db)

        # If user has no access, return empty list
        if accessible_account_ids is not None and len(accessible_account_ids) == 0:
            return []

        # Get all cameras with their status, filtered by accessible accounts
        camera_query = db.query(Camera)
        if accessible_account_ids is not None:  # None means super admin (access to all)
            camera_query = camera_query.filter(Camera.account_id.in_(accessible_account_ids))
        cameras = camera_query.all()

        service = VitalSignsService(db)

        # Group cameras by account
        accounts_map = {}

        for camera in cameras:
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                continue

            status = db.query(CameraVitalSignsStatus).filter(
                CameraVitalSignsStatus.camera_id == camera.id
            ).first()

            # Get effective settings
            settings = service.get_effective_settings(camera, account)

            # Only include cameras that have at least one vital signs check enabled
            if not settings.get("connectivity_enabled") and not settings.get("image_change_enabled"):
                continue

            # Initialize account entry if needed
            if account.id not in accounts_map:
                accounts_map[account.id] = {
                    "account_id": account.id,
                    "account_name": account.name,
                    "timezone": account.timezone or "UTC",
                    "connectivity_enabled_count": 0,
                    "image_change_enabled_count": 0,
                    "connectivity_issues_count": 0,
                    "image_change_issues_count": 0,
                    "total_cameras": 0,
                    "cameras": []
                }

            # Count this camera
            accounts_map[account.id]["total_cameras"] += 1

            if settings.get("connectivity_enabled"):
                accounts_map[account.id]["connectivity_enabled_count"] += 1
                # Check if this camera has connectivity issues
                if status and status.connectivity_status in ["offline", "error"]:
                    accounts_map[account.id]["connectivity_issues_count"] += 1

            if settings.get("image_change_enabled"):
                accounts_map[account.id]["image_change_enabled_count"] += 1
                # Check if this camera has image change issues
                if status and status.image_change_status == "changed":
                    accounts_map[account.id]["image_change_issues_count"] += 1

            # Get latest image change check for image paths
            latest_check = None
            if status and status.image_change_status == "changed":
                latest_check = db.query(CameraVitalSignsCheck)\
                    .filter(CameraVitalSignsCheck.camera_id == camera.id)\
                    .filter(CameraVitalSignsCheck.check_type == 'image_change')\
                    .order_by(CameraVitalSignsCheck.check_time.desc())\
                    .first()

            # Add camera details
            accounts_map[account.id]["cameras"].append({
                "camera_id": camera.id,
                "camera_name": camera.name,
                "settings": settings,
                "status": {
                    "connectivity_status": status.connectivity_status if status else "unknown",
                    "connectivity_last_check": status.connectivity_last_check.isoformat() + 'Z' if status and status.connectivity_last_check else None,
                    "connectivity_consecutive_failures": status.connectivity_consecutive_failures if status else 0,
                    "image_change_status": status.image_change_status if status else "unknown",
                    "image_change_last_check": status.image_change_last_check.isoformat() + 'Z' if status and status.image_change_last_check else None,
                    "image_change_percentage": status.image_change_percentage if status else None,
                    "connectivity_alert_sent": status.connectivity_alert_sent if status else False,
                    "image_change_alert_sent": status.image_change_alert_sent if status else False,
                    "previous_image_path": latest_check.previous_image_path if latest_check else None,
                    "current_image_path": latest_check.current_image_path if latest_check else None,
                } if status else None
            })

        # Convert to list and sort by account name
        results = sorted(accounts_map.values(), key=lambda x: x["account_name"])

        return results
    except Exception as e:
        logger.error(f"Error fetching all vital signs status: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch vital signs status")

@app.patch("/api/vital-signs/accounts/{account_id}/settings")
async def update_account_vital_signs_settings(
    account_id: int,
    settings: VitalSignsSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update vital signs settings for an account"""
    try:
        account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        # Update settings
        if settings.vital_signs_connectivity_enabled is not None:
            account.vital_signs_connectivity_enabled = settings.vital_signs_connectivity_enabled
        if settings.vital_signs_image_change_enabled is not None:
            account.vital_signs_image_change_enabled = settings.vital_signs_image_change_enabled
        if settings.vital_signs_image_change_threshold is not None:
            account.vital_signs_image_change_threshold = settings.vital_signs_image_change_threshold

        db.commit()
        db.refresh(account)

        logger.info(f"Updated vital signs settings for account {account_id} by {current_user.username}")

        return {
            "success": True,
            "account_id": account_id,
            "settings": {
                "connectivity_enabled": account.vital_signs_connectivity_enabled,
                "image_change_enabled": account.vital_signs_image_change_enabled,
                "image_change_threshold": account.vital_signs_image_change_threshold
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating account vital signs settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to update vital signs settings")

@app.patch("/api/vital-signs/cameras/{camera_id}/settings")
async def update_camera_vital_signs_settings(
    camera_id: int,
    settings: VitalSignsSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update vital signs settings for a camera (overrides account settings)"""
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")

        # Update settings
        if settings.vital_signs_connectivity_enabled is not None:
            camera.vital_signs_connectivity_enabled = settings.vital_signs_connectivity_enabled
        if settings.vital_signs_image_change_enabled is not None:
            camera.vital_signs_image_change_enabled = settings.vital_signs_image_change_enabled
        if settings.vital_signs_image_change_threshold is not None:
            camera.vital_signs_image_change_threshold = settings.vital_signs_image_change_threshold

        db.commit()
        db.refresh(camera)

        logger.info(f"Updated vital signs settings for camera {camera_id} by {current_user.username}")

        return {
            "success": True,
            "camera_id": camera_id,
            "settings": {
                "connectivity_enabled": camera.vital_signs_connectivity_enabled,
                "image_change_enabled": camera.vital_signs_image_change_enabled,
                "image_change_threshold": camera.vital_signs_image_change_threshold
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating camera vital signs settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to update vital signs settings")

@app.get("/api/dashboard-stats")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get dashboard statistics including:
    - Vital signs (active accounts, cameras, snoozed cameras, 24h activity)
    - Top 10 most active accounts in last 24 hours
    - Inactive accounts (no events in last 7 days)
    """
    try:
        # Calculate time boundaries
        now = datetime.utcnow()
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)

        # Parse user's assigned IDs for filtering
        user_group_ids = current_user.group_ids if isinstance(current_user.group_ids, list) else (json.loads(current_user.group_ids) if current_user.group_ids else [])
        user_dealer_ids = current_user.dealer_ids if isinstance(current_user.dealer_ids, list) else (json.loads(current_user.dealer_ids) if current_user.dealer_ids else [])
        user_customer_ids = current_user.customer_ids if isinstance(current_user.customer_ids, list) else (json.loads(current_user.customer_ids) if current_user.customer_ids else [])

        # Helper function to check if user has access to an account
        def user_has_access_to_account(account):
            if current_user.role in ["super_admin", "country_admin"]:
                return True
            if user_customer_ids:
                return account.id in user_customer_ids
            elif user_dealer_ids:
                return account.dealer_id in user_dealer_ids
            elif user_group_ids:
                return account.group_id in user_group_ids
            return False

        # Get all accounts that user has access to
        all_accounts = db.query(VideoAccount).all()
        accessible_accounts = [acc for acc in all_accounts if user_has_access_to_account(acc)]
        accessible_account_ids = [acc.id for acc in accessible_accounts]

        # 1. Vital Signs Statistics
        # Active accounts (accounts with at least one camera)
        # Use distinct on just the ID to avoid JSON column issues
        active_accounts_count = db.query(VideoAccount.id).filter(
            VideoAccount.id.in_(accessible_account_ids)
        ).join(Camera).distinct().count() if accessible_account_ids else 0

        # Active cameras (all cameras in accessible accounts)
        active_cameras_count = db.query(Camera).filter(
            Camera.account_id.in_(accessible_account_ids)
        ).count() if accessible_account_ids else 0

        # Snoozed cameras (cameras with snoozed_until > now)
        snoozed_cameras_count = db.query(Camera).filter(
            Camera.account_id.in_(accessible_account_ids),
            Camera.snoozed_until > now
        ).count() if accessible_account_ids else 0

        # 24h activity (events + alarms in last 24 hours)
        activity_24h = 0
        if accessible_account_ids:
            # Count alarm events
            events_count = db.query(AlarmEvent).join(Camera).filter(
                Camera.account_id.in_(accessible_account_ids),
                AlarmEvent.timestamp >= last_24h
            ).count()
            activity_24h = events_count

        # 2. Top 10 Most Active Accounts (last 24 hours)
        top_active_accounts = []
        if accessible_account_ids:
            # Get event counts per account
            account_activity = db.query(
                Camera.account_id,
                VideoAccount.name,
                VideoAccount.account_number,
                func.count(AlarmEvent.id).label('event_count'),
                func.sum(case((AlarmEvent.status == 'alarm_generated', 1), else_=0)).label('alarm_count'),
                func.sum(case((AlarmEvent.status == 'dismissed', 1), else_=0)).label('dismissed_count')
            ).join(
                Camera, AlarmEvent.camera_id == Camera.id
            ).join(
                VideoAccount, Camera.account_id == VideoAccount.id
            ).filter(
                Camera.account_id.in_(accessible_account_ids),
                AlarmEvent.timestamp >= last_24h
            ).group_by(
                Camera.account_id, VideoAccount.name, VideoAccount.account_number
            ).order_by(
                text('event_count DESC')
            ).limit(10).all()

            for acc in account_activity:
                top_active_accounts.append({
                    "account_id": acc.account_id,
                    "account_name": acc.name,
                    "account_number": acc.account_number,
                    "total_events": acc.event_count,
                    "alarm_count": acc.alarm_count or 0,
                    "dismissed_count": acc.dismissed_count or 0
                })

        # 3. Inactive Accounts (no events in last 7 days)
        inactive_accounts = []
        if accessible_account_ids:
            for account in accessible_accounts:
                # Get last event for this account
                last_event = db.query(AlarmEvent).join(Camera).filter(
                    Camera.account_id == account.id
                ).order_by(AlarmEvent.timestamp.desc()).first()

                # Check if account has no events or last event was > 7 days ago
                if not last_event or last_event.timestamp < last_7d:
                    # Count cameras for this account
                    camera_count = db.query(Camera).filter(Camera.account_id == account.id).count()

                    # Calculate days inactive
                    if last_event:
                        days_inactive = (now - last_event.timestamp).days
                        last_event_date = last_event.timestamp.strftime('%Y-%m-%d')
                    else:
                        days_inactive = 999  # Never had an event
                        last_event_date = None

                    inactive_accounts.append({
                        "account_id": account.id,
                        "account_name": account.name,
                        "account_number": account.account_number,
                        "camera_count": camera_count,
                        "last_event_date": last_event_date,
                        "days_inactive": days_inactive
                    })

            # Sort by days inactive (descending)
            inactive_accounts.sort(key=lambda x: x['days_inactive'], reverse=True)

        return {
            "vital_signs": {
                "active_accounts": active_accounts_count,
                "active_cameras": active_cameras_count,
                "snoozed_cameras": snoozed_cameras_count,
                "activity_24h": activity_24h
            },
            "top_active_accounts": top_active_accounts,
            "inactive_accounts": inactive_accounts
        }

    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to load dashboard statistics")

# ==================== TOOLS API ENDPOINTS ====================

@app.get("/api/tools", response_model=List[ToolResponse])
async def get_tools(
    account_id: int = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all tools (optionally filtered by account_id)"""
    try:
        query = db.query(Tool)
        if account_id is not None:
            query = query.filter(Tool.account_id == account_id)
        tools = query.order_by(Tool.category, Tool.name).all()
        return tools
    except Exception as e:
        logger.error(f"Error getting tools: {e}")
        raise HTTPException(status_code=500, detail="Failed to load tools")

@app.post("/api/tools", response_model=ToolResponse)
async def create_tool(
    tool: ToolCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new tool"""
    try:
        # Create new tool
        db_tool = Tool(
            account_id=tool.account_id,
            name=tool.name,
            tool_type=tool.tool_type,
            description=tool.description,
            config=tool.config,
            category=tool.category,
            created_by=current_user.id
        )
        db.add(db_tool)
        db.commit()
        db.refresh(db_tool)
        logger.info(f"Tool created: {db_tool.name} (ID: {db_tool.id}) by user {current_user.username}")
        return db_tool
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating tool: {e}")
        raise HTTPException(status_code=500, detail="Failed to create tool")

@app.get("/api/tools/{tool_id}", response_model=ToolResponse)
async def get_tool(
    tool_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific tool by ID"""
    try:
        tool = db.query(Tool).filter(Tool.id == tool_id).first()
        if not tool:
            raise HTTPException(status_code=404, detail="Tool not found")
        return tool
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tool: {e}")
        raise HTTPException(status_code=500, detail="Failed to load tool")

@app.put("/api/tools/{tool_id}", response_model=ToolResponse)
async def update_tool(
    tool_id: int,
    tool: ToolUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a tool"""
    try:
        db_tool = db.query(Tool).filter(Tool.id == tool_id).first()
        if not db_tool:
            raise HTTPException(status_code=404, detail="Tool not found")

        # Update fields if provided
        if tool.name is not None:
            db_tool.name = tool.name
        if tool.tool_type is not None:
            db_tool.tool_type = tool.tool_type
        if tool.description is not None:
            db_tool.description = tool.description
        if tool.config is not None:
            db_tool.config = tool.config
        if tool.category is not None:
            db_tool.category = tool.category
        if tool.hide_in_alarm_view is not None:
            db_tool.hide_in_alarm_view = tool.hide_in_alarm_view

        db_tool.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_tool)
        logger.info(f"Tool updated: {db_tool.name} (ID: {db_tool.id}) by user {current_user.username}")
        return db_tool
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating tool: {e}")
        raise HTTPException(status_code=500, detail="Failed to update tool")

@app.delete("/api/tools/{tool_id}")
async def delete_tool(
    tool_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a tool"""
    try:
        db_tool = db.query(Tool).filter(Tool.id == tool_id).first()
        if not db_tool:
            raise HTTPException(status_code=404, detail="Tool not found")

        tool_name = db_tool.name
        db.delete(db_tool)
        db.commit()
        logger.info(f"Tool deleted: {tool_name} (ID: {tool_id}) by user {current_user.username}")
        return {"message": "Tool deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting tool: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete tool")

@app.post("/api/tools/{tool_id}/trigger")
async def trigger_tool(
    tool_id: int,
    relay_number: int = None,
    state: int = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Trigger a tool (execute its action)

    For CBW relays, relay_number can be passed as a query parameter to trigger a specific relay.
    If not provided, defaults to relay 1.
    For static mode relays, state can be 0 (OFF) or 1 (ON). If not provided, uses pulse mode behavior.
    """
    try:
        tool = db.query(Tool).filter(Tool.id == tool_id).first()
        if not tool:
            raise HTTPException(status_code=404, detail="Tool not found")

        logger.info(f"Triggering tool: {tool.name} (type: {tool.tool_type}) by user {current_user.username}")

        # Handle different tool types
        if tool.tool_type == "cbw_relay":
            # ControlByWeb relay trigger
            import httpx
            config = tool.config
            url = config.get("url")
            # Use relay_number from query param if provided, otherwise default to 1
            relay_num = relay_number if relay_number is not None else 1
            username = config.get("username")
            password = config.get("password")

            if not url:
                raise HTTPException(status_code=400, detail="Tool config missing 'url'")

            # Add default port 4998 if no port is specified
            if ':' not in url.split('//')[-1]:  # Check if port is in the host part
                url = f"{url.rstrip('/')}:4998"

            # Check if this relay should pulse or be static
            relays = config.get("relays", [])
            relay_config = next((r for r in relays if r.get("number") == relay_num), {})
            is_pulse = relay_config.get("pulse", False)
            pulse_duration_ms = relay_config.get("pulseDuration", 500)  # Default 500ms if not specified

            # Use raw socket (ControlByWeb uses HTTP/0.9)
            import socket
            from urllib.parse import urlparse

            parsed_url = urlparse(url)
            host = parsed_url.hostname
            port = parsed_url.port or 80

            try:
                # Determine action based on pulse mode and state parameter
                if is_pulse:
                    # Pulse mode: turn on, wait briefly, turn off
                    path = f"/state.xml?relay{relay_num}State=1"
                else:
                    # Static mode: use state parameter if provided, otherwise default to ON
                    relay_state = state if state is not None else 1
                    path = f"/state.xml?relay{relay_num}State={relay_state}"

                # Send request via socket
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(10)
                sock.connect((host, port))
                request = f"GET {path} HTTP/1.0\r\nHost: {host}\r\n\r\n"
                sock.sendall(request.encode('utf-8'))

                # Read response
                response_data = b""
                while True:
                    try:
                        chunk = sock.recv(4096)
                        if not chunk:
                            break
                        response_data += chunk
                    except socket.error:
                        break
                sock.close()

                # If pulse mode, wait for configured duration and turn off
                if is_pulse:
                    import asyncio
                    await asyncio.sleep(pulse_duration_ms / 1000.0)  # Convert ms to seconds

                    # Turn off the relay
                    path_off = f"/state.xml?relay{relay_num}State=0"
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(10)
                    sock.connect((host, port))
                    request_off = f"GET {path_off} HTTP/1.0\r\nHost: {host}\r\n\r\n"
                    sock.sendall(request_off.encode('utf-8'))

                    # Read response
                    while True:
                        try:
                            chunk = sock.recv(4096)
                            if not chunk:
                                break
                        except socket.error:
                            break
                    sock.close()

            except socket.timeout:
                logger.error(f"Timeout triggering tool {tool_id}")
                raise HTTPException(status_code=504, detail="Device timeout")
            except socket.error as e:
                logger.error(f"Socket error triggering tool {tool_id}: {e}")
                raise HTTPException(status_code=502, detail=f"Failed to connect to device: {str(e)}")

            # Determine message based on mode and state
            if is_pulse:
                pulse_duration_sec = pulse_duration_ms / 1000.0
                mode_text = f"pulsed ({pulse_duration_sec}s)"
                message = f"Relay {relay_num} pulsed for {pulse_duration_sec}s"
            else:
                relay_state = state if state is not None else 1
                mode_text = "turned ON" if relay_state == 1 else "turned OFF"
                message = f"Relay {relay_num} {mode_text}"

            logger.info(f"CBW Relay {mode_text} successfully: {tool.name} (relay {relay_num})")
            return {
                "success": True,
                "message": message,
                "tool_name": tool.name,
                "show_camera_grid": relay_config.get("showCameraGrid", False)
            }

        elif tool.tool_type == "webhook":
            # Webhook trigger
            import httpx
            config = tool.config
            url = config.get("url")
            method = config.get("method", "POST").upper()
            headers = config.get("headers", {})
            body = config.get("body", {})

            if not url:
                raise HTTPException(status_code=400, detail="Tool config missing 'url'")

            # Send HTTP request
            async with httpx.AsyncClient(timeout=30.0) as client:
                if method == "POST":
                    response = await client.post(url, json=body, headers=headers)
                elif method == "GET":
                    response = await client.get(url, headers=headers)
                elif method == "PUT":
                    response = await client.put(url, json=body, headers=headers)
                else:
                    raise HTTPException(status_code=400, detail=f"Unsupported HTTP method: {method}")

                response.raise_for_status()

            logger.info(f"Webhook triggered successfully: {tool.name}")
            return {
                "success": True,
                "message": "Webhook executed",
                "tool_name": tool.name,
                "status_code": response.status_code
            }

        elif tool.tool_type == "camera_view":
            # Camera view trigger - returns camera configuration for frontend to display
            config = tool.config
            view_type = config.get("view_type", "single")
            camera_ids = config.get("camera_ids", [])
            quality = config.get("quality", "medium")
            grid_columns = config.get("grid_columns", 2)

            if not camera_ids:
                raise HTTPException(status_code=400, detail="Tool config missing 'camera_ids'")

            # Validate cameras exist and belong to this account
            cameras = db.query(Camera).filter(
                Camera.id.in_(camera_ids),
                Camera.account_id == tool.account_id
            ).all()

            if len(cameras) != len(camera_ids):
                raise HTTPException(status_code=400, detail="One or more cameras not found or don't belong to this account")

            # Start streams for all cameras in the view
            from streaming_server import start_camera_stream, add_stream_viewer
            camera_data = []
            for camera in cameras:
                if camera.rtsp_url:
                    # Build RTSP URL with credentials
                    rtsp_url = build_rtsp_url_with_credentials(camera)
                    # Start stream for this camera (will use cached stream if already running)
                    await start_camera_stream(camera.id, rtsp_url, quality)
                    # Add a temporary viewer to keep the stream alive until frontend connects
                    # This prevents the stream from being shut down immediately due to "no viewers"
                    viewer_id = f"tool_{tool.id}_{camera.id}"
                    await add_stream_viewer(camera.id, viewer_id)
                    logger.info(f"Added temporary tool viewer for camera {camera.id} from tool {tool.id}")
                    camera_data.append({
                        "id": camera.id,
                        "name": camera.name,
                        "rtsp_url": camera.rtsp_url,  # Include rtsp_url so frontend knows camera has RTSP
                        "stream_url": f"/api/streams/{camera.id}/playlist.m3u8",
                        "inbound_phone_number": camera.inbound_phone_number,
                        "associated_tool_id": camera.associated_tool_id,
                        "associated_relay_number": camera.associated_relay_number,
                        "associated_actions": camera.associated_actions or []
                    })

            logger.info(f"Camera view tool triggered: {tool.name} (view_type: {view_type}, cameras: {camera_ids})")
            return {
                "success": True,
                "message": f"Camera view opened",
                "tool_name": tool.name,
                "tool_type": "camera_view",
                "view_config": {
                    "view_type": view_type,
                    "cameras": camera_data,
                    "quality": quality,
                    "grid_columns": grid_columns if view_type == "grid" else None
                }
            }

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported tool type: {tool.tool_type}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering tool {tool_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger tool: {str(e)}")

@app.get("/api/tools/{tool_id}/status")
async def get_tool_status(
    tool_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get status of all relays for a ControlByWeb tool"""
    try:
        tool = db.query(Tool).filter(Tool.id == tool_id).first()
        if not tool:
            raise HTTPException(status_code=404, detail="Tool not found")

        if tool.tool_type != "cbw_relay":
            raise HTTPException(status_code=400, detail="Status only available for ControlByWeb relays")

        import xml.etree.ElementTree as ET

        config = tool.config
        url = config.get("url")
        username = config.get("username")
        password = config.get("password")

        if not url:
            raise HTTPException(status_code=400, detail="Tool config missing 'url'")

        # Add default port 4998 if no port is specified
        if ':' not in url.split('//')[-1]:
            url = f"{url.rstrip('/')}:4998"

        # Build the state.xml URL
        state_url = f"{url.rstrip('/')}/state.xml"

        # Prepare auth if credentials provided
        auth = None
        if username and password:
            auth = (username, password)

        # Get relay states using raw socket (ControlByWeb uses HTTP/0.9 - no headers, just raw XML)
        import socket
        from urllib.parse import urlparse

        parsed_url = urlparse(state_url)
        host = parsed_url.hostname
        port = parsed_url.port or 80
        path = parsed_url.path or "/"

        try:
            # Create socket connection
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect((host, port))

            # Send HTTP request (device will respond with HTTP/0.9 - just XML, no headers)
            request = f"GET {path} HTTP/1.0\r\nHost: {host}\r\n\r\n"
            sock.sendall(request.encode('utf-8'))

            # Read all response data (device closes connection when done)
            xml_content = b""
            while True:
                try:
                    chunk = sock.recv(4096)
                    if not chunk:
                        break
                    xml_content += chunk
                except socket.error:
                    break

            sock.close()
            xml_content = xml_content.decode('utf-8')

        except socket.timeout:
            logger.error(f"Timeout connecting to device {tool_id}")
            raise HTTPException(status_code=504, detail="Device timeout - check if device is online")
        except socket.error as e:
            logger.error(f"Socket error getting tool status {tool_id}: {e}")
            raise HTTPException(status_code=502, detail=f"Failed to connect to device: {str(e)}")
        except Exception as e:
            logger.error(f"Error reading from device {tool_id}: {e}")
            raise HTTPException(status_code=502, detail=f"Failed to read from device: {str(e)}")

        # Parse XML response
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            logger.error(f"Failed to parse XML from {state_url}: {e}")
            logger.error(f"XML content: {xml_content[:500]}")
            raise HTTPException(status_code=502, detail="Invalid XML response from device")

        relay_states = {}

        # Extract relay states from XML
        for i in range(1, 9):  # Support up to 8 relays
            relay_elem = root.find(f'relay{i}state')
            if relay_elem is not None:
                relay_states[i] = relay_elem.text == '1'

        return {
            "success": True,
            "relay_states": relay_states
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tool status {tool_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get tool status: {str(e)}")

# ==================== TOOL GROUPS API ENDPOINTS ====================

@app.get("/api/tool-groups", response_model=List[ToolGroupResponse])
async def get_tool_groups(
    account_id: int = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all tool groups (optionally filtered by account_id)"""
    try:
        query = db.query(ToolGroup)
        if account_id is not None:
            query = query.filter(ToolGroup.account_id == account_id)
        tool_groups = query.order_by(ToolGroup.name).all()
        return tool_groups
    except Exception as e:
        logger.error(f"Error getting tool groups: {e}")
        raise HTTPException(status_code=500, detail="Failed to load tool groups")

@app.post("/api/tool-groups", response_model=ToolGroupResponse)
async def create_tool_group(
    tool_group: ToolGroupCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new tool group"""
    try:
        # Create new tool group
        db_tool_group = ToolGroup(
            account_id=tool_group.account_id,
            name=tool_group.name,
            description=tool_group.description,
            actions=tool_group.actions,
            created_by=current_user.id
        )
        db.add(db_tool_group)
        db.commit()
        db.refresh(db_tool_group)
        logger.info(f"Tool group created: {db_tool_group.name} (ID: {db_tool_group.id}) by user {current_user.username}")
        return db_tool_group
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating tool group: {e}")
        raise HTTPException(status_code=500, detail="Failed to create tool group")

@app.get("/api/tool-groups/{tool_group_id}", response_model=ToolGroupResponse)
async def get_tool_group(
    tool_group_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific tool group by ID"""
    try:
        tool_group = db.query(ToolGroup).filter(ToolGroup.id == tool_group_id).first()
        if not tool_group:
            raise HTTPException(status_code=404, detail="Tool group not found")
        return tool_group
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tool group: {e}")
        raise HTTPException(status_code=500, detail="Failed to load tool group")

@app.put("/api/tool-groups/{tool_group_id}", response_model=ToolGroupResponse)
async def update_tool_group(
    tool_group_id: int,
    tool_group: ToolGroupUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a tool group"""
    try:
        db_tool_group = db.query(ToolGroup).filter(ToolGroup.id == tool_group_id).first()
        if not db_tool_group:
            raise HTTPException(status_code=404, detail="Tool group not found")

        # Update fields if provided
        if tool_group.name is not None:
            db_tool_group.name = tool_group.name
        if tool_group.description is not None:
            db_tool_group.description = tool_group.description
        if tool_group.actions is not None:
            db_tool_group.actions = tool_group.actions

        db_tool_group.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_tool_group)
        logger.info(f"Tool group updated: {db_tool_group.name} (ID: {db_tool_group.id}) by user {current_user.username}")
        return db_tool_group
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating tool group: {e}")
        raise HTTPException(status_code=500, detail="Failed to update tool group")

@app.delete("/api/tool-groups/{tool_group_id}")
async def delete_tool_group(
    tool_group_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a tool group"""
    try:
        db_tool_group = db.query(ToolGroup).filter(ToolGroup.id == tool_group_id).first()
        if not db_tool_group:
            raise HTTPException(status_code=404, detail="Tool group not found")

        tool_group_name = db_tool_group.name
        db.delete(db_tool_group)
        db.commit()
        logger.info(f"Tool group deleted: {tool_group_name} (ID: {tool_group_id}) by user {current_user.username}")
        return {"message": "Tool group deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting tool group: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete tool group")

@app.post("/api/tool-groups/{tool_group_id}/execute")
async def execute_tool_group(
    tool_group_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Execute a tool group macro (sequence of tool actions)"""
    try:
        tool_group = db.query(ToolGroup).filter(ToolGroup.id == tool_group_id).first()
        if not tool_group:
            raise HTTPException(status_code=404, detail="Tool group not found")

        logger.info(f"Executing tool group: {tool_group.name} (ID: {tool_group_id}) by user {current_user.username}")

        actions = tool_group.actions
        if not actions:
            raise HTTPException(status_code=400, detail="Tool group has no actions defined")

        # Group actions by parallel_group
        # Actions with parallel_group = null are sequential, actions with same number run in parallel
        execution_plan = []
        sequential_actions = []
        parallel_groups = {}

        for action in actions:
            parallel_group = action.get("parallel_group")
            if parallel_group is None:
                sequential_actions.append(action)
            else:
                if parallel_group not in parallel_groups:
                    parallel_groups[parallel_group] = []
                parallel_groups[parallel_group].append(action)

        # Build execution plan: sequential actions stay in order, parallel groups are grouped together
        for action in actions:
            parallel_group = action.get("parallel_group")
            if parallel_group is None:
                # Sequential action
                execution_plan.append([action])
            else:
                # Check if we've already added this parallel group
                group_actions = parallel_groups[parallel_group]
                if group_actions and group_actions[0] == action:
                    # First action in this parallel group, add the entire group
                    execution_plan.append(group_actions)

        # Execute the plan
        results = []
        for step in execution_plan:
            # Execute all actions in this step (in parallel if multiple)
            step_tasks = []
            for action in step:
                task = execute_single_action(action, db, current_user)
                step_tasks.append(task)

            # Wait for all actions in this step to complete
            step_results = await asyncio.gather(*step_tasks, return_exceptions=True)

            # Check for errors
            for i, result in enumerate(step_results):
                if isinstance(result, Exception):
                    logger.error(f"Error executing action in tool group {tool_group_id}: {result}")
                    results.append({"success": False, "error": str(result), "action": step[i]})
                else:
                    results.append(result)

        logger.info(f"Tool group executed successfully: {tool_group.name}")
        return {
            "success": True,
            "message": f"Tool group '{tool_group.name}' executed",
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing tool group {tool_group_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute tool group: {str(e)}")

# Alias endpoint for consistency with tool trigger endpoint
@app.post("/api/tool-groups/{tool_group_id}/trigger")
async def trigger_tool_group(
    tool_group_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Trigger a tool group (alias for execute)"""
    return await execute_tool_group(tool_group_id, current_user, db)

async def execute_single_action(action: dict, db: Session, current_user: User):
    """Execute a single action from a tool group

    Tools are triggered immediately without waiting for completion.
    If duration is specified, we wait that amount AFTER triggering.
    This allows rapid sequential firing of tools.
    """
    action_type = action.get("type")
    tool_id = action.get("tool_id")
    duration = action.get("duration")  # milliseconds - additional wait time after trigger

    if action_type == "delay":
        # Simple delay action
        delay_ms = action.get("duration", 1000)
        await asyncio.sleep(delay_ms / 1000.0)
        return {"success": True, "action": "delay", "duration_ms": delay_ms}

    if not tool_id:
        raise ValueError(f"Action missing tool_id: {action}")

    # Get the tool
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise ValueError(f"Tool not found: {tool_id}")

    # Execute based on tool type
    if tool.tool_type == "cbw_relay" or action_type == "relay":
        relay_number = action.get("relay_number")
        state = action.get("state")  # For static relays

        # Trigger the relay WITHOUT waiting for pulse completion
        # Fire and forget - we'll let the relay handle its own pulse timing
        asyncio.create_task(trigger_tool_async(tool_id, relay_number, state, current_user, db))

        # If duration is specified, wait before allowing next action
        # Duration is ONLY additional wait time, not replacement for pulse wait
        if duration:
            await asyncio.sleep(duration / 1000.0)

        return {
            "success": True,
            "action": "relay",
            "tool_id": tool_id,
            "relay_number": relay_number,
            "fired_async": True
        }

    elif tool.tool_type == "camera_view" or action_type == "camera_view":
        # Camera view tools MUST return their config to the frontend
        # So we need to await the result, but still allow rapid triggering
        result = await trigger_tool(tool_id, None, None, current_user, db)

        # If duration is specified, wait before allowing next action
        if duration:
            await asyncio.sleep(duration / 1000.0)

        return {**result, "action": "camera_view", "tool_id": tool_id}

    elif tool.tool_type == "webhook" or action_type == "webhook":
        # Trigger webhook asynchronously
        asyncio.create_task(trigger_tool_async(tool_id, None, None, current_user, db))

        # Webhooks typically don't need duration wait, but support it if specified
        if duration:
            await asyncio.sleep(duration / 1000.0)

        return {
            "success": True,
            "action": "webhook",
            "tool_id": tool_id,
            "fired_async": True
        }

    else:
        raise ValueError(f"Unsupported action type: {action_type}")

async def trigger_tool_async(tool_id: int, relay_number: int, state: int, current_user: User, db: Session):
    """Async wrapper for triggering tools without blocking

    This allows tools to be fired rapidly in sequence without waiting for each to complete.
    Any errors are logged but don't block other tools from executing.
    """
    try:
        await trigger_tool(tool_id, relay_number, state, current_user, db)
    except Exception as e:
        logger.error(f"Async tool trigger failed for tool {tool_id}: {e}")

# ========================================
# APARTMENT & TENANT ENDPOINTS (for Video Doorman)
# ========================================

@app.get("/api/accounts/{account_id}/apartments", response_model=List[ApartmentResponse])
async def get_account_apartments(
    account_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all apartments for an account"""
    try:
        apartments = db.query(Apartment).filter(Apartment.account_id == account_id).all()
        return apartments
    except Exception as e:
        logger.error(f"Error fetching apartments for account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch apartments: {str(e)}")

@app.post("/api/apartments", response_model=ApartmentResponse)
async def create_apartment(
    apartment: ApartmentCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new apartment"""
    try:
        # Check if account exists
        account = db.query(VideoAccount).filter(VideoAccount.id == apartment.account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        # Check for duplicate apartment number in same account
        existing = db.query(Apartment).filter(
            Apartment.account_id == apartment.account_id,
            Apartment.apartment_number == apartment.apartment_number
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Apartment number already exists for this account")

        new_apartment = Apartment(**apartment.dict())
        db.add(new_apartment)
        db.commit()
        db.refresh(new_apartment)

        logger.info(f"Created apartment {new_apartment.apartment_number} for account {apartment.account_id}")
        return new_apartment
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating apartment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create apartment: {str(e)}")

@app.put("/api/apartments/{apartment_id}", response_model=ApartmentResponse)
async def update_apartment(
    apartment_id: int,
    apartment: ApartmentUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update an apartment"""
    try:
        db_apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
        if not db_apartment:
            raise HTTPException(status_code=404, detail="Apartment not found")

        # Check for duplicate apartment number if changing it
        if apartment.apartment_number and apartment.apartment_number != db_apartment.apartment_number:
            existing = db.query(Apartment).filter(
                Apartment.account_id == db_apartment.account_id,
                Apartment.apartment_number == apartment.apartment_number,
                Apartment.id != apartment_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Apartment number already exists for this account")

        for key, value in apartment.dict(exclude_unset=True).items():
            setattr(db_apartment, key, value)

        db.commit()
        db.refresh(db_apartment)

        logger.info(f"Updated apartment {apartment_id}")
        return db_apartment
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating apartment {apartment_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update apartment: {str(e)}")

@app.delete("/api/apartments/{apartment_id}")
async def delete_apartment(
    apartment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete an apartment and all its tenants"""
    try:
        apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
        if not apartment:
            raise HTTPException(status_code=404, detail="Apartment not found")

        db.delete(apartment)
        db.commit()

        logger.info(f"Deleted apartment {apartment_id}")
        return {"success": True, "message": "Apartment deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting apartment {apartment_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete apartment: {str(e)}")

@app.post("/api/tenants", response_model=TenantResponse)
async def create_tenant(
    tenant: TenantCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new tenant"""
    try:
        # Check if apartment exists
        apartment = db.query(Apartment).filter(Apartment.id == tenant.apartment_id).first()
        if not apartment:
            raise HTTPException(status_code=404, detail="Apartment not found")

        new_tenant = Tenant(**tenant.dict())
        db.add(new_tenant)
        db.commit()
        db.refresh(new_tenant)

        logger.info(f"Created tenant {new_tenant.name} for apartment {tenant.apartment_id}")
        return new_tenant
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating tenant: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create tenant: {str(e)}")

@app.put("/api/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    tenant: TenantUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a tenant"""
    try:
        db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not db_tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        for key, value in tenant.dict(exclude_unset=True).items():
            setattr(db_tenant, key, value)

        db.commit()
        db.refresh(db_tenant)

        logger.info(f"Updated tenant {tenant_id}")
        return db_tenant
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update tenant: {str(e)}")

@app.delete("/api/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a tenant"""
    try:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        db.delete(tenant)
        db.commit()

        logger.info(f"Deleted tenant {tenant_id}")
        return {"success": True, "message": "Tenant deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete tenant: {str(e)}")

@app.post("/api/tenants/notify")
async def notify_tenants(
    request: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Send notifications to selected tenants about package delivery or dry cleaning

    Request body:
    {
        "tenant_ids": [1, 2, 3],
        "notification_type": "Package Delivery" | "Dry Cleaning",
        "notes": "Optional additional notes",
        "account_id": 123,
        "alarm_id": 456
    }
    """
    try:
        tenant_ids = request.get("tenant_ids", [])
        notification_type = request.get("notification_type", "Package Delivery")
        notes = request.get("notes", "")
        account_id = request.get("account_id")
        alarm_id = request.get("alarm_id")

        if not tenant_ids:
            raise HTTPException(status_code=400, detail="No tenants selected")

        if not account_id:
            raise HTTPException(status_code=400, detail="Account ID is required")

        # Get account details
        account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        # Get tenants
        tenants = db.query(Tenant).filter(Tenant.id.in_(tenant_ids)).all()
        if not tenants:
            raise HTTPException(status_code=404, detail="No tenants found")

        # Build the notification message
        from datetime import datetime
        import pytz

        # Use account timezone or default to US/Eastern
        tz = pytz.timezone(account.timezone if account.timezone else 'US/Eastern')
        current_time = datetime.now(tz)
        formatted_date = current_time.strftime("%B %d, %Y")
        formatted_time = current_time.strftime("%I:%M %p %Z")

        # Build address string
        address_parts = []
        if account.address:
            address_parts.append(account.address)
        if account.city or account.state or account.zip_code:
            city_state_zip = []
            if account.city:
                city_state_zip.append(account.city)
            if account.state:
                city_state_zip.append(account.state)
            if account.zip_code:
                city_state_zip.append(account.zip_code)
            address_parts.append(' '.join(city_state_zip))

        full_address = ', '.join(address_parts) if address_parts else account.name

        # Message based on notification type
        if notification_type == "Package Delivery":
            message_text = f"We accepted a Package Delivery for your apartment."
        elif notification_type == "Dry Cleaning":
            message_text = f"We accepted Dry Cleaning for your apartment."
        else:
            message_text = f"We have a notification for your apartment."

        # Track success/failure
        sent_count = 0
        failed_count = 0
        results = []

        for tenant in tenants:
            tenant_result = {
                "tenant_id": tenant.id,
                "tenant_name": tenant.name,
                "email_sent": False,
                "sms_sent": False,
                "email_error": None,
                "sms_error": None
            }

            # Send Email if enabled
            if tenant.email and tenant.email_enabled:
                try:
                    # HTML Email Template
                    html_body = f"""
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }}
        .notification-box {{ background: white; padding: 20px; border-left: 4px solid #3b82f6; margin: 20px 0; border-radius: 4px; }}
        .info-table {{ width: 100%; margin: 20px 0; }}
        .info-table td {{ padding: 8px 0; }}
        .label {{ color: #64748b; font-weight: bold; width: 120px; }}
        .value {{ color: #1e293b; }}
        .message {{ font-size: 16px; color: #1e293b; margin: 20px 0; padding: 15px; background: #e0f2fe; border-radius: 6px; }}
        .notes {{ background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Video Doorman Notification</h1>
        </div>
        <div class="content">
            <p>Hello <strong>{tenant.name}</strong>,</p>

            <div class="message">
                {message_text}
            </div>

            <table class="info-table">
                <tr>
                    <td class="label">Property:</td>
                    <td class="value">{account.name}</td>
                </tr>
                <tr>
                    <td class="label">Address:</td>
                    <td class="value">{full_address}</td>
                </tr>
                <tr>
                    <td class="label">Date:</td>
                    <td class="value">{formatted_date}</td>
                </tr>
                <tr>
                    <td class="label">Time:</td>
                    <td class="value">{formatted_time}</td>
                </tr>
                <tr>
                    <td class="label">Type:</td>
                    <td class="value">{notification_type}</td>
                </tr>
            </table>

            {f'<div class="notes"><strong>Additional Notes:</strong><br>{notes}</div>' if notes else ''}

            <p style="margin-top: 30px;">Thank you,<br><strong>Video Doorman</strong></p>
        </div>
        <div class="footer">
            <p>This is an automated notification from Video Doorman</p>
        </div>
    </div>
</body>
</html>
"""

                    # Plain text version
                    text_body = f"""
Video Doorman Notification

Hello {tenant.name},

{message_text}

Property: {account.name}
Address: {full_address}
Date: {formatted_date}
Time: {formatted_time}
Type: {notification_type}

{f'Additional Notes: {notes}' if notes else ''}

Thank you,
Video Doorman

---
This is an automated notification from Video Doorman
"""

                    success = email_service.send_email(
                        to_email=tenant.email,
                        subject=f"Video Doorman - {notification_type}",
                        body_text=text_body,
                        body_html=html_body
                    )

                    if success:
                        tenant_result["email_sent"] = True
                        sent_count += 1
                    else:
                        tenant_result["email_error"] = "Failed to send email"
                        failed_count += 1

                except Exception as e:
                    logger.error(f"Error sending email to tenant {tenant.id}: {e}")
                    tenant_result["email_error"] = str(e)
                    failed_count += 1

            # Send SMS if enabled
            if tenant.phone_number and tenant.sms_enabled:
                try:
                    # Format phone number to E.164 format
                    formatted_phone = sms_service.format_phone_number(tenant.phone_number)

                    # Short SMS message
                    sms_message = f"Video Doorman: {message_text}\n\n{account.name}\n{formatted_date} at {formatted_time}\n\nThank you, Video Doorman"

                    if notes:
                        sms_message += f"\n\nNote: {notes[:100]}"  # Limit notes length for SMS

                    success = sms_service.send_sms(
                        to_number=formatted_phone,
                        message=sms_message
                    )

                    if success:
                        tenant_result["sms_sent"] = True
                        sent_count += 1
                    else:
                        tenant_result["sms_error"] = "Failed to send SMS"
                        failed_count += 1

                except Exception as e:
                    logger.error(f"Error sending SMS to tenant {tenant.id}: {e}")
                    tenant_result["sms_error"] = str(e)
                    failed_count += 1

            results.append(tenant_result)

        # Log the notification activity
        logger.info(f"Tenant notifications sent for alarm {alarm_id}: {sent_count} successful, {failed_count} failed")

        return {
            "success": True,
            "message": f"Sent {sent_count} notification(s) to {len(tenants)} tenant(s)",
            "sent_count": sent_count,
            "failed_count": failed_count,
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending tenant notifications: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send notifications: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
