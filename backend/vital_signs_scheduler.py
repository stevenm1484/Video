"""
Vital Signs Scheduler
Runs periodic checks for camera connectivity and image changes
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Camera, VideoAccount, CameraVitalSignsStatus
from vital_signs_service import VitalSignsService
from vital_signs_notifications import VitalSignsNotificationService

logger = logging.getLogger(__name__)


class VitalSignsScheduler:
    """Scheduler for periodic vital signs checks"""

    def __init__(self):
        self.running = False
        self.connectivity_interval = 3600  # 1 hour in seconds
        self.image_change_interval = 43200  # 12 hours in seconds
        self.notification_service = VitalSignsNotificationService()

    async def start(self):
        """Start the scheduler with resilient error handling"""
        self.running = True
        logger.info("Vital Signs Scheduler started")

        # Start both periodic tasks with individual error handling
        # Using gather with return_exceptions=True prevents one task failure from crashing both
        try:
            results = await asyncio.gather(
                self.connectivity_check_loop(),
                self.image_change_check_loop(),
                return_exceptions=True
            )

            # Log any exceptions that occurred
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    task_name = ["connectivity_check_loop", "image_change_check_loop"][i]
                    logger.error(f"Vital Signs task {task_name} failed: {result}", exc_info=result)

        except Exception as e:
            logger.critical(f"Vital Signs Scheduler crashed unexpectedly: {e}", exc_info=True)
            # Don't re-raise - let the scheduler stop gracefully

    async def stop(self):
        """Stop the scheduler"""
        self.running = False
        logger.info("Vital Signs Scheduler stopped")

    async def connectivity_check_loop(self):
        """Run connectivity checks every hour"""
        while self.running:
            try:
                logger.info("Starting connectivity check cycle")
                await self.run_connectivity_checks()
                logger.info(f"Connectivity check cycle complete. Next run in {self.connectivity_interval} seconds")
            except Exception as e:
                logger.error(f"Error in connectivity check loop: {e}")

            # Wait for next interval
            await asyncio.sleep(self.connectivity_interval)

    async def image_change_check_loop(self):
        """Run image change checks every 12 hours"""
        while self.running:
            try:
                logger.info("Starting image change check cycle")
                await self.run_image_change_checks()
                logger.info(f"Image change check cycle complete. Next run in {self.image_change_interval} seconds")
            except Exception as e:
                logger.error(f"Error in image change check loop: {e}")

            # Wait for next interval
            await asyncio.sleep(self.image_change_interval)

    async def run_connectivity_checks(self):
        """Run connectivity checks on all enabled cameras"""
        db = SessionLocal()
        try:
            service = VitalSignsService(db)

            # Get all cameras with connectivity monitoring enabled
            cameras = self._get_cameras_with_connectivity_enabled(db)

            logger.info(f"Running connectivity checks on {len(cameras)} cameras")

            for camera in cameras:
                try:
                    # Perform connectivity check
                    check = service.perform_connectivity_check(camera)

                    # Check if alert needed
                    status = service.get_camera_status(camera.id)
                    if status and status.connectivity_status == "offline":
                        # Check if we need to send alert
                        if not status.connectivity_alert_sent or status.connectivity_consecutive_failures >= 3:
                            # Send alert
                            await self.notification_service.send_connectivity_alert(db, camera, status)
                            # Mark alert as sent
                            status.connectivity_alert_sent = True
                            status.connectivity_alert_sent_at = datetime.utcnow()
                            db.commit()

                    # If camera is back online, reset alert flag
                    if status and status.connectivity_status == "online" and status.connectivity_alert_sent:
                        # Send recovery notification
                        await self.notification_service.send_recovery_alert(db, camera, "connectivity")
                        status.connectivity_alert_sent = False
                        status.connectivity_alert_sent_at = None
                        db.commit()

                except Exception as e:
                    logger.error(f"Error checking camera {camera.id}: {e}")

        finally:
            db.close()

    async def run_image_change_checks(self):
        """Run image change checks on all enabled cameras"""
        db = SessionLocal()
        try:
            service = VitalSignsService(db)

            # Get all cameras with image change monitoring enabled
            cameras = self._get_cameras_with_image_change_enabled(db)

            logger.info(f"Running image change checks on {len(cameras)} cameras")

            for camera in cameras:
                try:
                    # Get threshold
                    account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
                    settings = service.get_effective_settings(camera, account)

                    # Perform image change check
                    check = service.perform_image_change_check(camera, settings["image_change_threshold"])

                    if check and check.image_change_detected:
                        # Get status
                        status = service.get_camera_status(camera.id)

                        # Send alert if not already sent
                        if status and not status.image_change_alert_sent:
                            # Pass the exact image paths from the check that triggered the alert
                            await self.notification_service.send_image_change_alert(
                                db, camera, status,
                                previous_image_path=check.previous_image_path,
                                current_image_path=check.current_image_path
                            )
                            # Mark alert as sent
                            status.image_change_alert_sent = True
                            status.image_change_alert_sent_at = datetime.utcnow()
                            db.commit()

                except Exception as e:
                    logger.error(f"Error checking image change for camera {camera.id}: {e}")

        finally:
            db.close()

    def _get_cameras_with_connectivity_enabled(self, db: Session) -> List[Camera]:
        """Get all cameras with connectivity monitoring enabled"""
        cameras = []

        # Get all cameras
        all_cameras = db.query(Camera).all()

        for camera in all_cameras:
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                continue

            # Check if connectivity is enabled (account or camera level)
            connectivity_enabled = account.vital_signs_connectivity_enabled
            if camera.vital_signs_connectivity_enabled is not None:
                connectivity_enabled = camera.vital_signs_connectivity_enabled

            if connectivity_enabled:
                cameras.append(camera)

        return cameras

    def _get_cameras_with_image_change_enabled(self, db: Session) -> List[Camera]:
        """Get all cameras with image change monitoring enabled"""
        cameras = []

        # Get all cameras
        all_cameras = db.query(Camera).all()

        for camera in all_cameras:
            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                continue

            # Check if image change is enabled (account or camera level)
            image_change_enabled = account.vital_signs_image_change_enabled
            if camera.vital_signs_image_change_enabled is not None:
                image_change_enabled = camera.vital_signs_image_change_enabled

            if image_change_enabled and camera.default_image_path:
                cameras.append(camera)

        return cameras

    async def run_manual_check(self, camera_id: int, check_type: str = "both"):
        """Run a manual check on a specific camera and send notifications if issues found"""
        db = SessionLocal()
        try:
            service = VitalSignsService(db)

            # Get camera and account
            camera = db.query(Camera).filter(Camera.id == camera_id).first()
            if not camera:
                return {"error": "Camera not found"}

            account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
            if not account:
                return {"error": "Account not found"}

            # Perform checks
            results = service.check_camera(camera_id, check_type)

            # Get updated status
            status = service.get_camera_status(camera_id)

            # Send notifications if issues detected or resolved
            if status:
                # Check connectivity issues
                if check_type in ["connectivity", "both"]:
                    if status.connectivity_status == "offline":
                        # Always send alert for manual checks if offline
                        await self.notification_service.send_connectivity_alert(db, camera, status)
                        # Mark alert as sent
                        status.connectivity_alert_sent = True
                        status.connectivity_alert_sent_at = datetime.utcnow()
                        db.commit()
                    elif status.connectivity_status == "online" and status.connectivity_alert_sent:
                        # Send recovery notification if camera was previously offline
                        await self.notification_service.send_recovery_alert(db, camera, "connectivity")
                        status.connectivity_alert_sent = False
                        status.connectivity_alert_sent_at = None
                        db.commit()

                # Check image change issues
                if check_type in ["image_change", "both"]:
                    if status.image_change_status == "changed":
                        # Get the latest image change check to pass exact image paths
                        from models import CameraVitalSignsCheck
                        latest_check = db.query(CameraVitalSignsCheck)\
                            .filter(CameraVitalSignsCheck.camera_id == camera_id)\
                            .filter(CameraVitalSignsCheck.check_type == 'image_change')\
                            .order_by(CameraVitalSignsCheck.check_time.desc())\
                            .first()

                        # Send alert for image change with exact image paths from the check
                        await self.notification_service.send_image_change_alert(
                            db, camera, status,
                            previous_image_path=latest_check.previous_image_path if latest_check else None,
                            current_image_path=latest_check.current_image_path if latest_check else None
                        )
                        # Mark alert as sent
                        status.image_change_alert_sent = True
                        status.image_change_alert_sent_at = datetime.utcnow()
                        db.commit()

            return results
        finally:
            db.close()


# Global scheduler instance
vital_signs_scheduler = VitalSignsScheduler()
