"""
Activity Tracking Service
Handles event counting, threshold warnings, and auto-snooze logic for billing purposes.
"""

import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models import VideoAccount, Camera, AlarmEvent
from email_service import EmailService
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ActivityTrackingService:
    """Service for tracking events and managing activity thresholds"""

    def __init__(self, db: Session):
        self.db = db
        self.email_service = EmailService()

    def increment_event_count(self, camera_id: int):
        """
        Increment event count for a camera and its account.
        Check thresholds and trigger warnings/auto-snooze as needed.

        Args:
            camera_id: ID of the camera that received an event
        """
        try:
            # Get camera and account
            camera = self.db.query(Camera).filter(Camera.id == camera_id).first()
            if not camera:
                logger.error(f"Camera {camera_id} not found")
                return

            account = self.db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                logger.error(f"Account {camera.account_id} not found")
                return

            # Increment counters
            camera.monthly_event_count = (camera.monthly_event_count or 0) + 1
            account.monthly_event_count = (account.monthly_event_count or 0) + 1

            logger.info(f"📊 Event count incremented: Camera {camera.name} ({camera.monthly_event_count}), Account {account.name} ({account.monthly_event_count})")

            # Check camera-level thresholds first (if camera has overrides)
            self._check_camera_thresholds(camera, account)

            # Check account-level thresholds
            self._check_account_thresholds(account)

            self.db.commit()

        except Exception as e:
            logger.error(f"Error incrementing event count: {e}")
            self.db.rollback()

    def _check_camera_thresholds(self, camera: Camera, account: VideoAccount):
        """Check if camera has reached its thresholds (if overrides are set)"""

        # Get effective thresholds (camera override or account default)
        warning_threshold = camera.activity_threshold_warning if camera.activity_threshold_warning is not None else account.activity_threshold_warning
        snooze_threshold = camera.activity_snooze_threshold if camera.activity_snooze_threshold is not None else account.activity_snooze_threshold

        # Check warning threshold
        if warning_threshold and camera.monthly_event_count >= warning_threshold:
            # Only send warning once per threshold breach
            if not camera.activity_last_warning_sent_at or camera.monthly_event_count == warning_threshold:
                self._send_warning_email(camera=camera, account=account)
                camera.activity_last_warning_sent_at = datetime.utcnow()
                logger.warning(f"⚠️  Camera {camera.name} reached warning threshold ({warning_threshold})")

        # Check snooze threshold
        if snooze_threshold and camera.monthly_event_count >= snooze_threshold:
            # Only auto-snooze if not already snoozed
            if not camera.activity_auto_snoozed_at:
                self._auto_snooze_camera(camera, account)
                camera.activity_auto_snoozed_at = datetime.utcnow()
                logger.warning(f"🔇 Camera {camera.name} auto-snoozed at threshold ({snooze_threshold})")

    def _check_account_thresholds(self, account: VideoAccount):
        """Check if account has reached its thresholds"""

        # Check warning threshold
        if account.activity_threshold_warning and account.monthly_event_count >= account.activity_threshold_warning:
            # Only send warning once per threshold breach
            if not account.activity_last_warning_sent_at or account.monthly_event_count == account.activity_threshold_warning:
                self._send_warning_email(account=account)
                account.activity_last_warning_sent_at = datetime.utcnow()
                logger.warning(f"⚠️  Account {account.name} reached warning threshold ({account.activity_threshold_warning})")

        # Check snooze threshold
        if account.activity_snooze_threshold and account.monthly_event_count >= account.activity_snooze_threshold:
            # Only auto-snooze if not already snoozed
            if not account.activity_auto_snoozed_at:
                self._auto_snooze_account(account)
                account.activity_auto_snoozed_at = datetime.utcnow()
                logger.warning(f"🔇 Account {account.name} auto-snoozed at threshold ({account.activity_snooze_threshold})")

    def _send_warning_email(self, account: VideoAccount, camera: Camera = None):
        """Send activity threshold warning email"""
        try:
            # Determine recipients (account, dealer, group, country levels)
            recipients = self._get_notification_recipients(account, email_type="activity_threshold_warning")

            if not recipients:
                logger.warning(f"No recipients found for activity threshold warning: {account.name}")
                return

            # Build email content
            if camera:
                subject = f"Activity Threshold Warning - Camera {camera.name} ({account.name})"
                body = f"""
Activity Threshold Warning

Camera: {camera.name}
Account: {account.name}
Account Number: {account.account_number}

Current Event Count: {camera.monthly_event_count}
Warning Threshold: {camera.activity_threshold_warning if camera.activity_threshold_warning else account.activity_threshold_warning}
Snooze Threshold: {camera.activity_snooze_threshold if camera.activity_snooze_threshold else account.activity_snooze_threshold}

This camera has reached its activity warning threshold for the current billing period.

To avoid automatic snoozing, please:
1. Review and adjust the thresholds if needed
2. Contact support if you need to increase limits

Billing Period: {account.activity_billing_period_start.strftime('%Y-%m-%d')} to present
"""
            else:
                subject = f"Activity Threshold Warning - {account.name}"
                body = f"""
Activity Threshold Warning

Account: {account.name}
Account Number: {account.account_number}

Current Event Count: {account.monthly_event_count}
Warning Threshold: {account.activity_threshold_warning}
Snooze Threshold: {account.activity_snooze_threshold}

This account has reached its activity warning threshold for the current billing period.

To avoid automatic snoozing, please:
1. Review and adjust the thresholds if needed
2. Contact support if you need to increase limits

Billing Period: {account.activity_billing_period_start.strftime('%Y-%m-%d')} to present
"""

            # Send to all recipients
            for recipient in recipients:
                self.email_service.send_email(
                    to_email=recipient,
                    subject=subject,
                    body=body
                )
                logger.info(f"📧 Activity warning sent to: {recipient}")

        except Exception as e:
            logger.error(f"Error sending activity warning email: {e}")

    def _auto_snooze_camera(self, camera: Camera, account: VideoAccount):
        """Automatically snooze a camera when threshold reached"""
        try:
            # Set snooze to indefinite (until manually unsnooze'd)
            camera.snoozed_until = datetime.max  # Far future date
            camera.snoozed_at = datetime.utcnow()
            camera.snoozed_by = None  # System-initiated

            # Send notification
            recipients = self._get_notification_recipients(account, email_type="activity_threshold_warning")

            subject = f"Camera Auto-Snoozed - {camera.name} ({account.name})"
            body = f"""
Camera Automatically Snoozed

Camera: {camera.name}
Account: {account.name}
Account Number: {account.account_number}

Event Count: {camera.monthly_event_count}
Snooze Threshold: {camera.activity_snooze_threshold if camera.activity_snooze_threshold else account.activity_snooze_threshold}

This camera has been automatically snoozed because it reached its activity threshold.

To unsnooze this camera:
1. Log into the dashboard
2. Navigate to the account/camera settings
3. Click "Unsnooze"
4. You must increase the thresholds to prevent immediate re-snoozing

Note: The camera will remain snoozed until manually reactivated with increased thresholds.
"""

            for recipient in recipients:
                self.email_service.send_email(
                    to_email=recipient,
                    subject=subject,
                    body=body
                )

            logger.info(f"🔇 Camera {camera.name} auto-snoozed and notifications sent")

        except Exception as e:
            logger.error(f"Error auto-snoozing camera: {e}")

    def _auto_snooze_account(self, account: VideoAccount):
        """Automatically snooze an entire account when threshold reached"""
        try:
            # Set snooze to indefinite (until manually unsnooze'd)
            account.snoozed_until = datetime.max  # Far future date
            account.snoozed_at = datetime.utcnow()
            account.snoozed_by = None  # System-initiated

            # Send notification
            recipients = self._get_notification_recipients(account, email_type="activity_threshold_warning")

            subject = f"Account Auto-Snoozed - {account.name}"
            body = f"""
Account Automatically Snoozed

Account: {account.name}
Account Number: {account.account_number}

Event Count: {account.monthly_event_count}
Snooze Threshold: {account.activity_snooze_threshold}

This account has been automatically snoozed because it reached its activity threshold.

All cameras under this account are now snoozed and will not generate new events.

To unsnooze this account:
1. Log into the dashboard
2. Navigate to the account settings
3. Click "Unsnooze"
4. You MUST increase both the warning and snooze thresholds to prevent immediate re-snoozing

Note: The account will remain snoozed until manually reactivated with increased thresholds.
"""

            for recipient in recipients:
                self.email_service.send_email(
                    to_email=recipient,
                    subject=subject,
                    body=body
                )

            logger.info(f"🔇 Account {account.name} auto-snoozed and notifications sent")

        except Exception as e:
            logger.error(f"Error auto-snoozing account: {e}")

    def _get_notification_recipients(self, account: VideoAccount, email_type: str = "activity_threshold_warning"):
        """Get email recipients at account, dealer, group, and country levels"""
        recipients = []

        try:
            # Account level
            if account.notification_emails:
                for email_config in account.notification_emails:
                    if isinstance(email_config, dict):
                        email = email_config.get("email")
                        types = email_config.get("type", "all").split("|")
                        if email and (email_type in types or "all" in types):
                            recipients.append(email)

            # Dealer level
            if account.dealer_id:
                from models import Dealer
                dealer = self.db.query(Dealer).filter(Dealer.id == account.dealer_id).first()
                if dealer and dealer.notification_emails:
                    for email_config in dealer.notification_emails:
                        if isinstance(email_config, dict):
                            email = email_config.get("email")
                            types = email_config.get("type", "all").split("|")
                            if email and (email_type in types or "all" in types):
                                recipients.append(email)

            # Group level
            if account.group_id:
                from models import Group
                group = self.db.query(Group).filter(Group.id == account.group_id).first()
                if group and group.notification_emails:
                    for email_config in group.notification_emails:
                        if isinstance(email_config, dict):
                            email = email_config.get("email")
                            types = email_config.get("type", "all").split("|")
                            if email and (email_type in types or "all" in types):
                                recipients.append(email)

                    # Country level (through group)
                    if group.country_id:
                        from models import Country
                        country = self.db.query(Country).filter(Country.id == group.country_id).first()
                        if country and country.notification_emails:
                            for email_config in country.notification_emails:
                                if isinstance(email_config, dict):
                                    email = email_config.get("email")
                                    types = email_config.get("type", "all").split("|")
                                    if email and (email_type in types or "all" in types):
                                        recipients.append(email)

        except Exception as e:
            logger.error(f"Error getting notification recipients: {e}")

        # Remove duplicates
        return list(set(recipients))

    def manual_unsnooze_camera(self, camera_id: int, new_warning_threshold: int = None, new_snooze_threshold: int = None):
        """
        Manually unsnooze a camera that was auto-snoozed.
        Requires new thresholds to be set higher than current count.
        """
        camera = self.db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            raise ValueError(f"Camera {camera_id} not found")

        if not camera.activity_auto_snoozed_at:
            raise ValueError("Camera was not auto-snoozed")

        # Validate new thresholds are higher than current count
        if new_warning_threshold and new_warning_threshold <= camera.monthly_event_count:
            raise ValueError(f"New warning threshold ({new_warning_threshold}) must be higher than current count ({camera.monthly_event_count})")

        if new_snooze_threshold and new_snooze_threshold <= camera.monthly_event_count:
            raise ValueError(f"New snooze threshold ({new_snooze_threshold}) must be higher than current count ({camera.monthly_event_count})")

        # Update thresholds if provided
        if new_warning_threshold:
            camera.activity_threshold_warning = new_warning_threshold
        if new_snooze_threshold:
            camera.activity_snooze_threshold = new_snooze_threshold

        # Unsnooze
        camera.snoozed_until = None
        camera.snoozed_at = None
        camera.snoozed_by = None
        camera.activity_auto_snoozed_at = None

        self.db.commit()
        logger.info(f"✅ Camera {camera.name} manually unsnoozed with new thresholds")

    def manual_unsnooze_account(self, account_id: int, new_warning_threshold: int = None, new_snooze_threshold: int = None):
        """
        Manually unsnooze an account that was auto-snoozed.
        Requires new thresholds to be set higher than current count.
        """
        account = self.db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
        if not account:
            raise ValueError(f"Account {account_id} not found")

        if not account.activity_auto_snoozed_at:
            raise ValueError("Account was not auto-snoozed")

        # Validate new thresholds are higher than current count
        if new_warning_threshold and new_warning_threshold <= account.monthly_event_count:
            raise ValueError(f"New warning threshold ({new_warning_threshold}) must be higher than current count ({account.monthly_event_count})")

        if new_snooze_threshold and new_snooze_threshold <= account.monthly_event_count:
            raise ValueError(f"New snooze threshold ({new_snooze_threshold}) must be higher than current count ({account.monthly_event_count})")

        # Update thresholds if provided
        if new_warning_threshold:
            account.activity_threshold_warning = new_warning_threshold
        if new_snooze_threshold:
            account.activity_snooze_threshold = new_snooze_threshold

        # Unsnooze
        account.snoozed_until = None
        account.snoozed_at = None
        account.snoozed_by = None
        account.activity_auto_snoozed_at = None

        self.db.commit()
        logger.info(f"✅ Account {account.name} manually unsnoozed with new thresholds")

    def reset_monthly_counters(self):
        """
        Reset all monthly event counters to zero.
        Called automatically at the start of each month.
        """
        try:
            # Reset all accounts
            accounts = self.db.query(VideoAccount).all()
            for account in accounts:
                account.monthly_event_count = 0
                account.activity_last_warning_sent_at = None
                account.activity_auto_snoozed_at = None
                account.activity_billing_period_end = datetime.utcnow()
                account.activity_billing_period_start = datetime.utcnow()

                # Un-snooze accounts that were auto-snoozed (new month = fresh start)
                if account.activity_auto_snoozed_at:
                    account.snoozed_until = None
                    account.snoozed_at = None
                    account.snoozed_by = None

            # Reset all cameras
            cameras = self.db.query(Camera).all()
            for camera in cameras:
                camera.monthly_event_count = 0
                camera.activity_last_warning_sent_at = None
                camera.activity_auto_snoozed_at = None

                # Un-snooze cameras that were auto-snoozed
                if camera.activity_auto_snoozed_at:
                    camera.snoozed_until = None
                    camera.snoozed_at = None
                    camera.snoozed_by = None

            self.db.commit()
            logger.info(f"✅ Monthly counters reset for {len(accounts)} accounts and {len(cameras)} cameras")

        except Exception as e:
            logger.error(f"Error resetting monthly counters: {e}")
            self.db.rollback()
