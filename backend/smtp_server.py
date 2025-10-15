from aiosmtpd.controller import Controller
from aiosmtpd.smtp import SMTP
from email import message_from_bytes
from email.header import decode_header
import os
import asyncio
from datetime import datetime
import uuid
import pytz
from PIL import Image
import cv2
import numpy as np
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Camera, AlarmEvent, VideoAccount, ActivityLog
from pathlib import Path
import logging
import json as json_module
from security_utils import sanitize_filename, validate_file_path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get absolute path to uploads directory
# Use dedicated media volume for video storage
UPLOADS_DIR = Path("/mnt/media/uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

class CustomSMTPHandler:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    def is_camera_disarmed(self, camera, account):
        """Check if camera is currently disarmed based on manual state or schedule"""
        # Manual override takes precedence
        if camera.manual_arm_state is True:
            return False  # Manually armed
        if camera.manual_arm_state is False:
            return True  # Manually disarmed

        # Check schedule
        if not account or not account.disarm_schedules:
            return False  # No schedule = armed by default

        try:
            schedules = json_module.loads(account.disarm_schedules) if isinstance(account.disarm_schedules, str) else account.disarm_schedules
        except:
            return False

        # Find applicable schedule
        applicable_schedule = None
        for schedule in schedules:
            if schedule.get('cameraFilter') == 'all':
                applicable_schedule = schedule
                break
            elif schedule.get('cameraIds') and camera.id in schedule.get('cameraIds', []):
                applicable_schedule = schedule
                break

        if not applicable_schedule:
            return False  # No schedule applies = armed

        # Check if current time falls within any disarm period
        # Convert UTC time to account's timezone
        try:
            account_tz = pytz.timezone(account.timezone if account.timezone else 'UTC')
            now_utc = datetime.utcnow().replace(tzinfo=pytz.UTC)
            now = now_utc.astimezone(account_tz)
        except:
            # If timezone is invalid, fall back to UTC
            now = datetime.utcnow()

        current_day = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][now.weekday()]
        current_time = now.hour * 60 + now.minute  # minutes since midnight

        for period in applicable_schedule.get('periods', []):
            if current_day in period.get('days', []):
                start_time_str = period.get('start_time', '00:00')
                end_time_str = period.get('end_time', '23:59')

                start_hour, start_min = map(int, start_time_str.split(':'))
                end_hour, end_min = map(int, end_time_str.split(':'))

                start_time = start_hour * 60 + start_min
                end_time = end_hour * 60 + end_min

                if start_time <= current_time <= end_time:
                    return True  # Currently in disarm period

        return False  # Not in any disarm period = armed

    async def handle_DATA(self, server, session, envelope):
        print(f"[SMTP-DEBUG] Receiving message from: {envelope.mail_from}", flush=True)
        print(f"[SMTP-DEBUG] Message for: {envelope.rcpt_tos}", flush=True)
        logger.info(f"[SMTP] Receiving message from: {envelope.mail_from}")
        logger.info(f"[SMTP] Message for: {envelope.rcpt_tos}")

        # Find camera by SMTP email (before parsing message to save CPU)
        recipient_email = envelope.rcpt_tos[0] if envelope.rcpt_tos else None
        if not recipient_email:
            logger.warning("[SMTP] No recipient found")
            return '250 Message accepted for delivery'

        db = SessionLocal()
        try:  # SECURITY: Ensure database session is always closed
            camera = db.query(Camera).filter(Camera.smtp_email == recipient_email).first()
            if not camera:
                logger.warning(f"[SMTP] Camera not found for email: {recipient_email}")
                return '250 Message accepted for delivery'

            # Get account for snooze/disarm checking
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            now = datetime.utcnow()

            # OPTIMIZATION: Check disarm/snooze status BEFORE parsing email content
            # This prevents wasting CPU on parsing large emails with attachments that will be ignored

            # Check camera snooze
            if camera.snoozed_until and camera.snoozed_until > now:
                logger.info(f"[SMTP] Camera {camera.id} is snoozed until {camera.snoozed_until}, skipping event creation")

                # Create activity log for snoozed event
                activity_log = ActivityLog(
                    camera_id=camera.id,
                    account_id=camera.account_id,
                    timestamp=now,
                    event_type="snoozed",
                    resolution="snoozed",
                    user_id=camera.snoozed_by,
                    media_paths=json_module.dumps([]),  # No media saved for snoozed events
                    media_type="unknown",
                    notes=f"Event suppressed - camera snoozed until {camera.snoozed_until}"
                )
                db.add(activity_log)
                db.commit()

                return '250 Message accepted for delivery'

            # Check account snooze
            if account and account.snoozed_until and account.snoozed_until > now:
                logger.info(f"[SMTP] Account {account.id} is snoozed until {account.snoozed_until}, skipping event creation")

                # Create activity log for snoozed event
                activity_log = ActivityLog(
                    camera_id=camera.id,
                    account_id=camera.account_id,
                    timestamp=now,
                    event_type="snoozed",
                    resolution="snoozed",
                    user_id=account.snoozed_by,
                    media_paths=json_module.dumps([]),  # No media saved for snoozed events
                    media_type="unknown",
                    notes=f"Event suppressed - account snoozed until {account.snoozed_until}"
                )
                db.add(activity_log)
                db.commit()

                return '250 Message accepted for delivery'

            # Check if camera is disarmed
            if self.is_camera_disarmed(camera, account):
                logger.info(f"[SMTP] Camera {camera.id} is currently disarmed, skipping event creation")

                # Create activity log for disarmed event
                disarm_reason = "manually disarmed" if camera.manual_arm_state is False else "disarmed by schedule"
                activity_log = ActivityLog(
                    camera_id=camera.id,
                    account_id=camera.account_id,
                    timestamp=now,
                    event_type="disarmed",
                    resolution="disarmed",
                    user_id=None,
                    media_paths=json_module.dumps([]),  # No media saved for disarmed events
                    media_type="unknown",
                    notes=f"Event suppressed - camera {disarm_reason}"
                )
                db.add(activity_log)
                db.commit()

                return '250 Message accepted for delivery'

            # Camera is armed - parse email and process attachments
            msg = message_from_bytes(envelope.content)

            # Process attachments
            media_paths = []
            images = []
            
            for part in msg.walk():
                if part.get_content_maintype() == 'multipart':
                    continue
                if part.get('Content-Disposition') is None:
                    continue

                filename = part.get_filename()
                if not filename:
                    continue

                try:
                    # Decode filename if encoded
                    decoded = decode_header(filename)
                    if decoded[0][1]:
                        filename = decoded[0][0].decode(decoded[0][1])
                    else:
                        filename = decoded[0][0] if isinstance(decoded[0][0], str) else decoded[0][0].decode()

                    # SECURITY: Sanitize filename to prevent path traversal
                    filename = sanitize_filename(filename)

                except ValueError as e:
                    logger.warning(f"[SMTP] Invalid filename from camera {camera.id}: {e}")
                    continue
                except Exception as e:
                    logger.error(f"[SMTP] Error decoding filename: {e}")
                    continue

                # Save attachment with sanitized filename
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                unique_id = uuid.uuid4().hex[:8]
                ext = os.path.splitext(filename)[1].lower()
                new_filename = f"camera_{camera.id}_{timestamp}_{unique_id}{ext}"
                filepath = UPLOADS_DIR / new_filename

                try:
                    # SECURITY: Validate file path is within uploads directory
                    filepath = validate_file_path(filepath, UPLOADS_DIR)

                    with open(filepath, 'wb') as f:
                        f.write(part.get_payload(decode=True))

                    # Store relative path for frontend
                    relative_path = f"uploads/{new_filename}"
                    media_paths.append(relative_path)

                except ValueError as e:
                    logger.error(f"[SMTP] Path traversal attempt detected: {e}")
                    continue
                except Exception as e:
                    logger.error(f"[SMTP] Error saving attachment: {e}")
                    continue

                # Check if it's an image
                if ext.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
                    images.append(str(filepath))
            
            # If multiple images, create a video
            media_type = "image"
            if len(images) > 1:
                video_path = await self.create_video_from_images(images, camera.id)
                if video_path:
                    media_paths.append(video_path)
                    media_type = "video"
            elif len(images) == 0 and media_paths:
                # Check if we have video files
                for path in media_paths:
                    if os.path.splitext(path)[1].lower() in ['.mp4', '.avi', '.mov']:
                        media_type = "video"
                        break
            
            # Create alarm event
            event = AlarmEvent(
                camera_id=camera.id,
                media_type=media_type,
                media_paths=media_paths,
                status="pending"
            )
            db.add(event)
            db.commit()
            db.refresh(event)

            # Log audit action
            from audit_helper import log_audit_action
            log_audit_action(
                db=db,
                action="event_received",
                event_id=event.id,
                details={
                    "camera_id": camera.id,
                    "camera_name": camera.name,
                    "account_id": camera.account_id,
                    "media_type": media_type,
                    "media_count": len(media_paths)
                }
            )

            # Try to auto-assign to an available receiving operator
            # Note: Cannot call async auto-assignment from SMTP handler due to event loop issues
            # The assignment will happen when the frontend polls dashboard-items or via a background task
            print(f"[SMTP-DEBUG] Event {event.id} created, will be auto-assigned by main loop", flush=True)
            logger.info(f"[SMTP] Event {event.id} created for account {camera.account_id}")

            # Broadcast to WebSocket clients
            broadcast_data = {
                "type": "new_event",
                "event": {
                    "id": event.id,
                    "camera_id": event.camera_id,
                    "timestamp": event.timestamp.isoformat(),
                    "media_type": event.media_type,
                    "media_paths": event.media_paths,
                    "status": event.status
                }
            }
            logger.info(f"[SMTP] Broadcasting new event {event.id} to {len(self.websocket_manager.active_connections)} WebSocket clients")
            await self.websocket_manager.broadcast(broadcast_data)

            logger.info(f"[SMTP] Created alarm event {event.id} for camera {camera.id}")

        except asyncio.CancelledError:
            # Explicitly handle async cancellation
            logger.warning("[SMTP] Handler cancelled, rolling back database session")
            db.rollback()
            raise
        except Exception as e:
            # Log and rollback on any error
            logger.error(f"[SMTP] Error processing email: {e}")
            db.rollback()
        finally:
            # SECURITY: Always close database session to prevent connection leaks
            db.close()

        return '250 Message accepted for delivery'
    
    async def create_video_from_images(self, image_paths, camera_id):
        """Create a video from multiple images"""
        try:
            if not image_paths:
                return None
            
            # Read first image to get dimensions
            first_img = cv2.imread(image_paths[0])
            if first_img is None:
                return None
            
            height, width, layers = first_img.shape
            
            # Create video writer
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            video_filename = f"camera_{camera_id}_{timestamp}_combined.mp4"
            video_path = str(UPLOADS_DIR / video_filename)
            
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            fps = 1  # 1 frame per second (each image shown for 1 second)
            video = cv2.VideoWriter(video_path, fourcc, fps, (width, height))
            
            # Add each image to video
            for img_path in image_paths:
                img = cv2.imread(img_path)
                if img is not None:
                    # Resize if needed
                    if img.shape[:2] != (height, width):
                        img = cv2.resize(img, (width, height))
                    video.write(img)
            
            video.release()
            logger.info(f"[SMTP] Created video: {video_path}")
            # Return relative path for frontend
            video_filename = os.path.basename(video_path)
            return f"uploads/{video_filename}"

        except Exception as e:
            logger.error(f"[SMTP] Error creating video: {e}")
            return None

class SMTPServer:
    def __init__(self, websocket_manager):
        self.handler = CustomSMTPHandler(websocket_manager)
        self.controller = None
        self.server_task = None

    async def start(self):
        """Start SMTP server in a separate thread to avoid blocking the event loop"""
        import threading
        import time

        def run_smtp():
            """Run SMTP server with retry logic for port binding"""
            max_retries = 5
            retry_delay = 2

            for attempt in range(max_retries):
                try:
                    self.controller = Controller(
                        self.handler,
                        hostname='0.0.0.0',
                        port=2525
                    )
                    self.controller.start()
                    logger.info("[SMTP] Server running on port 2525")
                    return
                except OSError as e:
                    if "Address already in use" in str(e) and attempt < max_retries - 1:
                        logger.warning(f"[SMTP] Port 2525 already in use, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    else:
                        logger.error(f"[SMTP] Failed to start server after {attempt + 1} attempts: {e}")
                        raise
                except Exception as e:
                    logger.error(f"[SMTP] Unexpected error starting server: {e}")
                    raise

        # Run SMTP server in a daemon thread
        smtp_thread = threading.Thread(target=run_smtp, daemon=True, name="SMTP-Server")
        smtp_thread.start()

        # Wait a moment for the server to start
        await asyncio.sleep(1.0)
        logger.info("[SMTP] Server started in background thread")

    async def stop(self):
        """Stop SMTP server gracefully"""
        if self.controller:
            try:
                self.controller.stop()
                logger.info("[SMTP] Server stopped gracefully")
            except Exception as e:
                logger.error(f"[SMTP] Error stopping server: {e}")
                # Continue anyway - don't let this block shutdown
