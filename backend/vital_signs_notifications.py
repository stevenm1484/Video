"""
Vital Signs Notification Service
Handles sending alerts when cameras go offline or images change significantly
"""
import logging
import os
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from models import Camera, VideoAccount, CameraVitalSignsStatus, AlarmEvent
from email_notification_service import get_notification_emails, get_hierarchy_info
from email_service import email_service
import pytz

logger = logging.getLogger(__name__)


class VitalSignsNotificationService:
    """Service for sending vital signs notifications"""

    def _format_timestamp_in_timezone(self, dt: datetime, timezone_str: str) -> str:
        """
        Format a UTC datetime in the specified timezone

        Args:
            dt: datetime object (assumed to be UTC)
            timezone_str: IANA timezone string (e.g., 'America/New_York')

        Returns:
            Formatted string like "Jan 12, 2025 3:45 PM EST"
        """
        if not dt:
            return 'Never'

        try:
            # Ensure dt is timezone-aware (UTC)
            if dt.tzinfo is None:
                dt = pytz.utc.localize(dt)

            # Convert to target timezone
            target_tz = pytz.timezone(timezone_str or 'UTC')
            local_dt = dt.astimezone(target_tz)

            # Format: "Jan 12, 2025 3:45 PM EST"
            return local_dt.strftime('%b %d, %Y %I:%M %p %Z')
        except Exception as e:
            logger.error(f"Error formatting timestamp in timezone {timezone_str}: {e}")
            # Fallback to UTC
            return dt.strftime('%b %d, %Y %I:%M %p UTC')

    async def send_connectivity_alert(self, db: Session, camera: Camera, status: CameraVitalSignsStatus):
        """
        Send alert when camera goes offline
        Creates an AlarmEvent to notify operators and sends email notifications
        Only creates ONE event when first detected, not on every subsequent check
        """
        try:
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                logger.error(f"No account found for camera {camera.id}")
                return

            logger.warning(f"Sending connectivity alert for camera {camera.id} ({camera.name})")

            # Check if this is the FIRST alert (not a re-check)
            # Only create event and send email on FIRST detection
            is_first_alert = not status.connectivity_alert_sent

            if is_first_alert:
                # Get all emails configured for vital signs notifications
                emails = get_notification_emails(db, account.id, 'vital_signs')

                if emails:
                    # Get hierarchy info for email content
                    hierarchy_info = get_hierarchy_info(db, account.id)

                    # Send HTML email notifications
                    subject = f"🔴 Camera Offline Alert - {camera.name}"
                    html_body = self._create_connectivity_alert_html(camera, account, status, hierarchy_info)

                    await self.send_html_email(emails, subject, html_body)
                    logger.info(f"Connectivity alert emails sent to {len(emails)} recipients")
                else:
                    logger.info(f"No email recipients configured for vital signs notifications on account {account.id}")

                # Create an alarm event for offline camera (ONLY ONCE)
                event = AlarmEvent(
                    camera_id=camera.id,
                    timestamp=datetime.utcnow(),
                    media_type="alert",  # "alert" indicates system-generated vital signs alert
                    media_paths=[],  # No media for system alerts
                    status="pending"
                )

                db.add(event)
                db.commit()

                logger.info(f"Connectivity alert event created for camera {camera.id}")
            else:
                logger.info(f"Connectivity alert already sent for camera {camera.id}, skipping duplicate event creation")

        except Exception as e:
            logger.error(f"Error sending connectivity alert for camera {camera.id}: {e}", exc_info=True)

    async def send_image_change_alert(self, db: Session, camera: Camera, status: CameraVitalSignsStatus):
        """
        Send alert when significant image change is detected (camera moved/blocked)
        Creates an AlarmEvent to notify operators and sends email with image comparison
        Only creates ONE event when first detected, not on every subsequent check
        """
        try:
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                logger.error(f"No account found for camera {camera.id}")
                return

            logger.warning(
                f"Sending image change alert for camera {camera.id} ({camera.name}). "
                f"Change: {status.image_change_percentage}%"
            )

            # Check if this is the FIRST alert (not a re-check)
            # Only create event and send email on FIRST detection
            is_first_alert = not status.image_change_alert_sent

            if is_first_alert:
                # Get all emails configured for vital signs notifications
                emails = get_notification_emails(db, account.id, 'vital_signs')

                if emails:
                    # Get hierarchy info for email content
                    hierarchy_info = get_hierarchy_info(db, account.id)

                    # Get image paths from camera's vital signs checks
                    from models import CameraVitalSignsCheck
                    latest_check = db.query(CameraVitalSignsCheck)\
                        .filter(CameraVitalSignsCheck.camera_id == camera.id)\
                        .filter(CameraVitalSignsCheck.check_type == 'image_change')\
                        .order_by(CameraVitalSignsCheck.check_time.desc())\
                        .first()

                    previous_image = None
                    current_image = None

                    if latest_check:
                        if latest_check.previous_image_path:
                            previous_image = latest_check.previous_image_path
                        if latest_check.current_image_path:
                            current_image = latest_check.current_image_path

                    # Send HTML email notifications with image comparison
                    subject = f"⚠️ Camera Image Change Alert - {camera.name}"
                    html_body = self._create_image_change_alert_html(
                        camera, account, status, hierarchy_info, previous_image, current_image
                    )

                    # Prepare image paths for attachments
                    image_paths = []
                    if previous_image:
                        image_paths.append(previous_image)
                    if current_image:
                        image_paths.append(current_image)

                    await self.send_html_email(emails, subject, html_body, image_paths=image_paths)
                    logger.info(f"Image change alert emails sent to {len(emails)} recipients")
                else:
                    logger.info(f"No email recipients configured for vital signs notifications on account {camera.id}")

                # Create an alarm event for image change (ONLY ONCE)
                event = AlarmEvent(
                    camera_id=camera.id,
                    timestamp=datetime.utcnow(),
                    media_type="alert",  # "alert" indicates system-generated vital signs alert
                    media_paths=[],  # No media for system alerts
                    status="pending"
                )

                db.add(event)
                db.commit()

                logger.info(f"Image change alert event created for camera {camera.id}")
            else:
                logger.info(f"Image change alert already sent for camera {camera.id}, skipping duplicate event creation")

        except Exception as e:
            logger.error(f"Error sending image change alert for camera {camera.id}: {e}", exc_info=True)

    async def send_recovery_alert(self, db: Session, camera: Camera, alert_type: str):
        """
        Send recovery notification when camera comes back online
        """
        try:
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                logger.error(f"No account found for camera {camera.id}")
                return

            logger.info(f"Sending recovery alert for camera {camera.id} ({camera.name}). Type: {alert_type}")

            # Get all emails configured for vital signs notifications
            emails = get_notification_emails(db, account.id, 'vital_signs')

            if emails:
                # Get hierarchy info for email content
                hierarchy_info = get_hierarchy_info(db, account.id)

                # Send HTML email notifications
                if alert_type == "connectivity":
                    subject = f"✅ Camera Back Online - {camera.name}"
                else:
                    subject = f"✅ Camera Recovery - {camera.name}"

                html_body = self._create_recovery_alert_html(camera, account, alert_type, hierarchy_info)

                await self.send_html_email(emails, subject, html_body)
                logger.info(f"Recovery alert emails sent to {len(emails)} recipients")
            else:
                logger.info(f"No email recipients configured for vital signs notifications on account {account.id}")

        except Exception as e:
            logger.error(f"Error sending recovery alert for camera {camera.id}: {e}", exc_info=True)

    async def send_html_email(
        self,
        to_emails: List[str],
        subject: str,
        html_body: str,
        image_paths: List[str] = None
    ):
        """
        Send HTML email with image attachments using SMTP2GO API

        Args:
            to_emails: List of recipient email addresses
            subject: Email subject
            html_body: HTML email body
            image_paths: List of image file paths to attach
        """
        try:
            # Generate plain text version from HTML (basic strip tags)
            import re
            import base64
            text_body = re.sub('<[^<]+?>', '', html_body)

            # Prepare attachments if image paths provided
            attachments = None
            if image_paths:
                attachments = []
                for i, img_path in enumerate(image_paths):
                    # Convert relative path to absolute
                    if not img_path.startswith('/'):
                        img_path = f"/mnt/media/{img_path}"

                    if os.path.exists(img_path):
                        with open(img_path, 'rb') as f:
                            img_data = f.read()
                            b64_data = base64.b64encode(img_data).decode('utf-8')

                            # Get filename from path
                            filename = os.path.basename(img_path)

                            attachments.append({
                                "filename": filename,
                                "fileblob": b64_data,
                                "mimetype": "image/jpeg"
                            })
                            logger.info(f"Added attachment: {filename} ({len(img_data)} bytes)")

            # Send to each recipient
            success_count = 0
            for email in to_emails:
                try:
                    if email_service.send_email(
                        to_email=email,
                        subject=subject,
                        body_text=text_body,
                        body_html=html_body,
                        attachments=attachments
                    ):
                        success_count += 1
                        logger.info(f"Email sent successfully to {email}")
                    else:
                        logger.error(f"Failed to send email to {email}")
                except Exception as e:
                    logger.error(f"Error sending email to {email}: {e}")

            if success_count > 0:
                logger.info(f"Successfully sent {success_count}/{len(to_emails)} emails")
            else:
                logger.error(f"Failed to send emails to all {len(to_emails)} recipients")

        except Exception as e:
            logger.error(f"Error in send_html_email: {e}", exc_info=True)

    def _create_connectivity_alert_html(
        self,
        camera: Camera,
        account: VideoAccount,
        status: CameraVitalSignsStatus,
        hierarchy_info: dict
    ) -> str:
        """Create HTML email for connectivity alert"""

        # Use account timezone for formatting
        timezone = account.timezone or 'UTC'
        last_check = self._format_timestamp_in_timezone(status.connectivity_last_check, timezone)
        last_online = self._format_timestamp_in_timezone(status.connectivity_last_online, timezone)
        current_time = self._format_timestamp_in_timezone(datetime.utcnow(), timezone)

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background: #dc2626;
                    color: white;
                    padding: 20px;
                    border-radius: 8px 8px 0 0;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 24px;
                }}
                .content {{
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    padding: 20px;
                    border-radius: 0 0 8px 8px;
                }}
                .info-section {{
                    background: white;
                    padding: 15px;
                    margin: 15px 0;
                    border-radius: 6px;
                    border-left: 4px solid #dc2626;
                }}
                .info-row {{
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #e5e7eb;
                }}
                .info-row:last-child {{
                    border-bottom: none;
                }}
                .label {{
                    font-weight: bold;
                    color: #6b7280;
                }}
                .value {{
                    color: #111827;
                }}
                .alert-status {{
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 10px 15px;
                    border-radius: 6px;
                    text-align: center;
                    font-weight: bold;
                    margin: 15px 0;
                }}
                .footer {{
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🔴 Camera Offline Alert</h1>
            </div>
            <div class="content">
                <div class="alert-status">
                    CAMERA CONNECTIVITY FAILURE DETECTED
                </div>

                <div class="info-section">
                    <h3 style="margin-top: 0;">Camera Information</h3>
                    <div class="info-row">
                        <span class="label">Camera Name:</span>
                        <span class="value">{camera.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Location:</span>
                        <span class="value">{camera.location or 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Status:</span>
                        <span class="value" style="color: #dc2626; font-weight: bold;">OFFLINE</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Consecutive Failures:</span>
                        <span class="value">{status.connectivity_consecutive_failures}</span>
                    </div>
                </div>

                <div class="info-section">
                    <h3 style="margin-top: 0;">Account Information</h3>
                    <div class="info-row">
                        <span class="label">Account Name:</span>
                        <span class="value">{hierarchy_info.get('account_name', 'N/A')}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Account Number:</span>
                        <span class="value">{hierarchy_info.get('account_number', 'N/A')}</span>
                    </div>
        """

        if hierarchy_info.get('dealer_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Dealer:</span>
                        <span class="value">{hierarchy_info['dealer_name']}</span>
                    </div>
            """

        if hierarchy_info.get('group_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Group:</span>
                        <span class="value">{hierarchy_info['group_name']}</span>
                    </div>
            """

        if hierarchy_info.get('country_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Country:</span>
                        <span class="value">{hierarchy_info['country_name']}</span>
                    </div>
            """

        html += f"""
                </div>

                <div class="info-section">
                    <h3 style="margin-top: 0;">Timeline</h3>
                    <div class="info-row">
                        <span class="label">Last Check:</span>
                        <span class="value">{last_check}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Last Online:</span>
                        <span class="value">{last_online}</span>
                    </div>
                </div>

                <div style="margin-top: 20px; padding: 15px; background: #fffbeb; border-radius: 6px; border-left: 4px solid #f59e0b;">
                    <strong>Action Required:</strong><br>
                    Please investigate the camera connectivity issue. Check camera power, network connection, and RTSP credentials.
                </div>
            </div>

            <div class="footer">
                <p>This is an automated notification from Video Monitoring System<br>
                Generated at {current_time}</p>
            </div>
        </body>
        </html>
        """

        return html

    def _image_to_base64(self, image_path: str, max_width: int = 300) -> Optional[str]:
        """
        Convert image file to base64 data URL with resizing for email compatibility

        Args:
            image_path: Path to image file
            max_width: Maximum width in pixels (default 400 for email compatibility)
        """
        try:
            # Convert relative path to absolute
            if not image_path.startswith('/'):
                image_path = f"/mnt/media/{image_path}"

            if not os.path.exists(image_path):
                logger.warning(f"Image not found: {image_path}")
                return None

            import base64
            import cv2

            # Read and resize image
            img = cv2.imread(image_path)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return None

            # Resize if too large
            height, width = img.shape[:2]
            if width > max_width:
                ratio = max_width / width
                new_width = max_width
                new_height = int(height * ratio)
                img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)

            # Encode as JPEG with aggressive compression for email
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 60]  # 60% quality for smaller size
            result, encoded_img = cv2.imencode('.jpg', img, encode_param)

            if not result:
                logger.error(f"Failed to encode image: {image_path}")
                return None

            # Convert to base64
            img_data = encoded_img.tobytes()
            b64_data = base64.b64encode(img_data).decode('utf-8')

            logger.info(f"Converted image to base64: {len(b64_data)} chars (resized to max {max_width}px width)")
            return f"data:image/jpeg;base64,{b64_data}"

        except Exception as e:
            logger.error(f"Error converting image to base64: {e}", exc_info=True)
            return None

    def _create_image_change_alert_html(
        self,
        camera: Camera,
        account: VideoAccount,
        status: CameraVitalSignsStatus,
        hierarchy_info: dict,
        previous_image_path: Optional[str] = None,
        current_image_path: Optional[str] = None
    ) -> str:
        """Create HTML email for image change alert with image comparison"""

        # Use account timezone for formatting
        timezone = account.timezone or 'UTC'
        last_check = self._format_timestamp_in_timezone(status.image_change_last_check, timezone)
        current_time = self._format_timestamp_in_timezone(datetime.utcnow(), timezone)
        change_pct = status.image_change_percentage or 0

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background: #f59e0b;
                    color: white;
                    padding: 20px;
                    border-radius: 8px 8px 0 0;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 24px;
                }}
                .content {{
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    padding: 20px;
                    border-radius: 0 0 8px 8px;
                }}
                .info-section {{
                    background: white;
                    padding: 15px;
                    margin: 15px 0;
                    border-radius: 6px;
                    border-left: 4px solid #f59e0b;
                }}
                .info-row {{
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #e5e7eb;
                }}
                .info-row:last-child {{
                    border-bottom: none;
                }}
                .label {{
                    font-weight: bold;
                    color: #6b7280;
                }}
                .value {{
                    color: #111827;
                }}
                .alert-status {{
                    background: #fef3c7;
                    color: #92400e;
                    padding: 10px 15px;
                    border-radius: 6px;
                    text-align: center;
                    font-weight: bold;
                    margin: 15px 0;
                }}
                .image-comparison {{
                    margin: 20px 0;
                }}
                .image-comparison h3 {{
                    margin-top: 0;
                    color: #6b7280;
                }}
                .image-container {{
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }}
                .image-box {{
                    flex: 1;
                    min-width: 250px;
                    text-align: center;
                }}
                .image-box img {{
                    max-width: 100%;
                    border: 2px solid #e5e7eb;
                    border-radius: 6px;
                }}
                .image-label {{
                    font-weight: bold;
                    margin: 10px 0;
                    color: #6b7280;
                }}
                .footer {{
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>⚠️ Camera Image Change Alert</h1>
            </div>
            <div class="content">
                <div class="alert-status">
                    SIGNIFICANT IMAGE CHANGE DETECTED - CAMERA MAY BE MOVED OR BLOCKED
                </div>

                <div class="info-section">
                    <h3 style="margin-top: 0;">Camera Information</h3>
                    <div class="info-row">
                        <span class="label">Camera Name:</span>
                        <span class="value">{camera.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Location:</span>
                        <span class="value">{camera.location or 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Change Detected:</span>
                        <span class="value" style="color: #f59e0b; font-weight: bold;">{change_pct}%</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Last Check:</span>
                        <span class="value">{last_check}</span>
                    </div>
                </div>

                <div class="info-section">
                    <h3 style="margin-top: 0;">Account Information</h3>
                    <div class="info-row">
                        <span class="label">Account Name:</span>
                        <span class="value">{hierarchy_info.get('account_name', 'N/A')}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Account Number:</span>
                        <span class="value">{hierarchy_info.get('account_number', 'N/A')}</span>
                    </div>
        """

        if hierarchy_info.get('dealer_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Dealer:</span>
                        <span class="value">{hierarchy_info['dealer_name']}</span>
                    </div>
            """

        if hierarchy_info.get('group_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Group:</span>
                        <span class="value">{hierarchy_info['group_name']}</span>
                    </div>
            """

        if hierarchy_info.get('country_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Country:</span>
                        <span class="value">{hierarchy_info['country_name']}</span>
                    </div>
            """

        html += f"""
                </div>

                <div style="margin-top: 20px; padding: 15px; background: #fffbeb; border-radius: 6px; border-left: 4px solid #f59e0b;">
                    <strong>⚠️ Image Comparison:</strong><br>
                    Two camera images are attached to this email showing the before and after views.
                    Please download and review the attached images to see the change detected.
                </div>

                <div style="margin-top: 20px; padding: 15px; background: #fffbeb; border-radius: 6px; border-left: 4px solid #f59e0b;">
                    <strong>Action Required:</strong><br>
                    The camera view has changed significantly ({change_pct}%). This could indicate the camera has been moved, blocked, or tampered with. Please verify the camera position and view.
                </div>
            </div>

            <div class="footer">
                <p>This is an automated notification from Video Monitoring System<br>
                Generated at {current_time}</p>
            </div>
        </body>
        </html>
        """

        return html

    def _create_recovery_alert_html(
        self,
        camera: Camera,
        account: VideoAccount,
        alert_type: str,
        hierarchy_info: dict
    ) -> str:
        """Create HTML email for camera recovery/restoration"""

        # Use account timezone for formatting
        timezone = account.timezone or 'UTC'
        current_time = self._format_timestamp_in_timezone(datetime.utcnow(), timezone)

        if alert_type == "connectivity":
            title = "✅ Camera Back Online"
            message = "CAMERA CONNECTIVITY RESTORED"
            description = "The camera has successfully reconnected and is now online."
        else:
            title = "✅ Camera Recovered"
            message = "CAMERA ISSUE RESOLVED"
            description = "The camera issue has been resolved and the camera is now functioning normally."

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background: #10b981;
                    color: white;
                    padding: 20px;
                    border-radius: 8px 8px 0 0;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 24px;
                }}
                .content {{
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    padding: 20px;
                    border-radius: 0 0 8px 8px;
                }}
                .info-section {{
                    background: white;
                    padding: 15px;
                    margin: 15px 0;
                    border-radius: 6px;
                    border-left: 4px solid #10b981;
                }}
                .info-row {{
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #e5e7eb;
                }}
                .info-row:last-child {{
                    border-bottom: none;
                }}
                .label {{
                    font-weight: bold;
                    color: #6b7280;
                }}
                .value {{
                    color: #111827;
                }}
                .alert-status {{
                    background: #d1fae5;
                    color: #065f46;
                    padding: 10px 15px;
                    border-radius: 6px;
                    text-align: center;
                    font-weight: bold;
                    margin: 15px 0;
                }}
                .footer {{
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{title}</h1>
            </div>
            <div class="content">
                <div class="alert-status">
                    {message}
                </div>

                <div class="info-section">
                    <h3 style="margin-top: 0;">Camera Information</h3>
                    <div class="info-row">
                        <span class="label">Camera Name:</span>
                        <span class="value">{camera.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Location:</span>
                        <span class="value">{camera.location or 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Status:</span>
                        <span class="value" style="color: #10b981; font-weight: bold;">ONLINE</span>
                    </div>
                </div>

                <div class="info-section">
                    <h3 style="margin-top: 0;">Account Information</h3>
                    <div class="info-row">
                        <span class="label">Account Name:</span>
                        <span class="value">{hierarchy_info.get('account_name', 'N/A')}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Account Number:</span>
                        <span class="value">{hierarchy_info.get('account_number', 'N/A')}</span>
                    </div>
        """

        if hierarchy_info.get('dealer_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Dealer:</span>
                        <span class="value">{hierarchy_info['dealer_name']}</span>
                    </div>
            """

        if hierarchy_info.get('group_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Group:</span>
                        <span class="value">{hierarchy_info['group_name']}</span>
                    </div>
            """

        if hierarchy_info.get('country_name'):
            html += f"""
                    <div class="info-row">
                        <span class="label">Country:</span>
                        <span class="value">{hierarchy_info['country_name']}</span>
                    </div>
            """

        html += f"""
                </div>

                <div style="margin-top: 20px; padding: 15px; background: #ecfdf5; border-radius: 6px; border-left: 4px solid #10b981;">
                    <strong>Good News!</strong><br>
                    {description}
                </div>
            </div>

            <div class="footer">
                <p>This is an automated notification from Video Monitoring System<br>
                Generated at {current_time}</p>
            </div>
        </body>
        </html>
        """

        return html
