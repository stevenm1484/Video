"""
Vital Signs Monitoring Service
Handles RTSP connectivity checks and image change detection for cameras
"""
import os
import cv2
import time
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any
from pathlib import Path
from sqlalchemy.orm import Session
from models import Camera, VideoAccount, CameraVitalSignsCheck, CameraVitalSignsStatus
import logging

logger = logging.getLogger(__name__)

# Directory to store camera snapshots on media drive
SNAPSHOTS_DIR = Path("/mnt/media/uploads/vital_signs_snapshots")
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

# Relative path for database storage (to match how other media is stored)
SNAPSHOTS_RELATIVE_DIR = "uploads/vital_signs_snapshots"


class VitalSignsService:
    """Service for monitoring camera vital signs"""

    def __init__(self, db: Session):
        self.db = db

    def get_effective_settings(self, camera: Camera, account: VideoAccount) -> Dict[str, Any]:
        """
        Get effective vital signs settings for a camera, considering overrides
        Returns dict with connectivity_enabled, image_change_enabled, and image_change_threshold
        """
        # Start with account defaults
        connectivity_enabled = account.vital_signs_connectivity_enabled
        image_change_enabled = account.vital_signs_image_change_enabled
        image_change_threshold = account.vital_signs_image_change_threshold

        # Apply camera overrides if set
        if camera.vital_signs_connectivity_enabled is not None:
            connectivity_enabled = camera.vital_signs_connectivity_enabled
        if camera.vital_signs_image_change_enabled is not None:
            image_change_enabled = camera.vital_signs_image_change_enabled
        if camera.vital_signs_image_change_threshold is not None:
            image_change_threshold = camera.vital_signs_image_change_threshold

        return {
            "connectivity_enabled": connectivity_enabled,
            "image_change_enabled": image_change_enabled,
            "image_change_threshold": image_change_threshold
        }

    def check_rtsp_connectivity(self, camera: Camera) -> Tuple[bool, Optional[str], Optional[int], Optional[str]]:
        """
        Test RTSP connection and capture an image
        Returns: (success, image_path, response_time_ms, error_message)
        """
        start_time = time.time()

        try:
            # Build RTSP URL with credentials if provided
            rtsp_url = camera.rtsp_url
            if camera.rtsp_username and camera.rtsp_password:
                # Insert credentials into RTSP URL
                # Format: rtsp://username:password@host:port/path
                if "://" in rtsp_url:
                    protocol, rest = rtsp_url.split("://", 1)
                    rtsp_url = f"{protocol}://{camera.rtsp_username}:{camera.rtsp_password}@{rest}"

            logger.info(f"Checking connectivity for camera {camera.id}: {camera.name}")

            # Open video capture
            cap = cv2.VideoCapture(rtsp_url)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer to get latest frame

            # Set timeout (3 seconds)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 3000)

            if not cap.isOpened():
                response_time = int((time.time() - start_time) * 1000)
                logger.warning(f"Camera {camera.id} failed to open stream")
                return False, None, response_time, "Failed to open RTSP stream"

            # Try to read a frame
            ret, frame = cap.read()
            response_time = int((time.time() - start_time) * 1000)

            if not ret or frame is None:
                cap.release()
                logger.warning(f"Camera {camera.id} failed to read frame")
                return False, None, response_time, "Failed to read frame from stream"

            # Save the captured image
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            image_filename = f"camera_{camera.id}_{timestamp}.jpg"

            # Full path for file operations
            full_path = SNAPSHOTS_DIR / image_filename

            # Relative path for database storage (matching other media paths)
            relative_path = f"{SNAPSHOTS_RELATIVE_DIR}/{image_filename}"

            cv2.imwrite(str(full_path), frame)

            cap.release()

            logger.info(f"Camera {camera.id} connectivity check successful ({response_time}ms)")
            # Return relative path for database storage
            return True, relative_path, response_time, None

        except Exception as e:
            response_time = int((time.time() - start_time) * 1000)
            error_msg = str(e)
            logger.error(f"Camera {camera.id} connectivity check error: {error_msg}")
            return False, None, response_time, error_msg

    def compare_images(self, image1_path: str, image2_path: str) -> Tuple[bool, int]:
        """
        Compare two images and calculate percentage difference
        Returns: (images_valid, difference_percentage)
        """
        try:
            # Convert relative paths to absolute paths if needed
            if not image1_path.startswith('/'):
                # Relative path like "uploads/vital_signs_snapshots/camera_1_20250112_123456.jpg"
                image1_path = f"/mnt/media/{image1_path}"
            if not image2_path.startswith('/'):
                image2_path = f"/mnt/media/{image2_path}"

            # Read images
            img1 = cv2.imread(image1_path)
            img2 = cv2.imread(image2_path)

            if img1 is None or img2 is None:
                logger.error(f"Failed to read images for comparison")
                return False, 0

            # Resize images to same size if needed
            if img1.shape != img2.shape:
                img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

            # Convert to grayscale
            gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

            # Calculate absolute difference
            diff = cv2.absdiff(gray1, gray2)

            # Calculate percentage of changed pixels (using threshold of 30 to ignore noise)
            threshold = 30
            _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)
            changed_pixels = np.count_nonzero(thresh)
            total_pixels = thresh.size

            difference_percentage = int((changed_pixels / total_pixels) * 100)

            logger.info(f"Image comparison: {difference_percentage}% difference")
            return True, difference_percentage

        except Exception as e:
            logger.error(f"Error comparing images: {e}")
            return False, 0

    def perform_connectivity_check(self, camera: Camera) -> CameraVitalSignsCheck:
        """
        Perform connectivity check on a camera and update status
        """
        # Perform RTSP connectivity check
        success, image_path, response_time, error_msg = self.check_rtsp_connectivity(camera)

        # Determine status
        status = "online" if success else "offline"
        if error_msg and "error" in error_msg.lower():
            status = "error"

        # Create check record
        check = CameraVitalSignsCheck(
            camera_id=camera.id,
            check_type="connectivity",
            check_time=datetime.utcnow(),
            connectivity_status=status,
            connectivity_response_time_ms=response_time,
            connectivity_error_message=error_msg,
            current_image_path=image_path
        )
        self.db.add(check)

        # Update or create status record
        status_record = self.db.query(CameraVitalSignsStatus).filter(
            CameraVitalSignsStatus.camera_id == camera.id
        ).first()

        if not status_record:
            status_record = CameraVitalSignsStatus(
                camera_id=camera.id,
                connectivity_status=status
            )
            self.db.add(status_record)

        # Update status record
        status_record.connectivity_status = status
        status_record.connectivity_last_check = datetime.utcnow()

        if success:
            status_record.connectivity_last_online = datetime.utcnow()
            status_record.connectivity_consecutive_failures = 0

            # Update camera's default image
            if image_path:
                camera.default_image_path = image_path
        else:
            status_record.connectivity_last_offline = datetime.utcnow()
            status_record.connectivity_consecutive_failures += 1

        self.db.commit()
        self.db.refresh(check)

        logger.info(f"Connectivity check completed for camera {camera.id}: {status}")
        return check

    def perform_image_change_check(self, camera: Camera, threshold: int) -> Optional[CameraVitalSignsCheck]:
        """
        Perform image change detection on a camera
        Requires previous image to exist
        """
        # Get previous image
        previous_image = camera.default_image_path

        if not previous_image:
            logger.warning(f"No previous image for camera {camera.id}, skipping image change check")
            return None

        # Convert relative path to absolute for existence check
        previous_image_full = previous_image
        if not previous_image.startswith('/'):
            previous_image_full = f"/mnt/media/{previous_image}"

        if not os.path.exists(previous_image_full):
            logger.warning(f"Previous image does not exist for camera {camera.id}: {previous_image_full}, skipping image change check")
            return None

        # Capture new image
        success, current_image, response_time, error_msg = self.check_rtsp_connectivity(camera)

        if not success or not current_image:
            logger.warning(f"Failed to capture image for camera {camera.id}: {error_msg}")
            return None

        # Compare images
        valid, difference_percentage = self.compare_images(previous_image, current_image)

        if not valid:
            logger.error(f"Failed to compare images for camera {camera.id}")
            return None

        # Determine if change is significant
        change_detected = difference_percentage >= threshold

        # Create check record
        check = CameraVitalSignsCheck(
            camera_id=camera.id,
            check_type="image_change",
            check_time=datetime.utcnow(),
            image_change_detected=change_detected,
            image_change_percentage=difference_percentage,
            previous_image_path=previous_image,
            current_image_path=current_image
        )
        self.db.add(check)

        # Update or create status record
        status_record = self.db.query(CameraVitalSignsStatus).filter(
            CameraVitalSignsStatus.camera_id == camera.id
        ).first()

        if not status_record:
            status_record = CameraVitalSignsStatus(
                camera_id=camera.id,
                image_change_status="normal"
            )
            self.db.add(status_record)

        # Update status record
        status_record.image_change_last_check = datetime.utcnow()
        status_record.image_change_percentage = difference_percentage

        if change_detected:
            status_record.image_change_status = "changed"
            status_record.image_change_last_changed = datetime.utcnow()
            logger.warning(f"Image change detected for camera {camera.id}: {difference_percentage}% (threshold: {threshold}%)")
        else:
            status_record.image_change_status = "normal"
            status_record.image_change_last_normal = datetime.utcnow()
            logger.info(f"No significant image change for camera {camera.id}: {difference_percentage}% (threshold: {threshold}%)")

        # Update camera's default image if no significant change
        if not change_detected:
            camera.default_image_path = current_image

        self.db.commit()
        self.db.refresh(check)

        return check

    def check_camera(self, camera_id: int, check_type: str = "both") -> Dict[str, Any]:
        """
        Perform vital signs check on a specific camera
        check_type: "connectivity", "image_change", or "both"
        """
        camera = self.db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            return {"error": "Camera not found"}

        account = self.db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
        if not account:
            return {"error": "Account not found"}

        settings = self.get_effective_settings(camera, account)
        results = {}

        # Perform connectivity check
        if check_type in ["connectivity", "both"] and settings["connectivity_enabled"]:
            check = self.perform_connectivity_check(camera)
            results["connectivity_check"] = {
                "status": check.connectivity_status,
                "response_time_ms": check.connectivity_response_time_ms,
                "error": check.connectivity_error_message
            }

        # Perform image change check
        if check_type in ["image_change", "both"] and settings["image_change_enabled"]:
            check = self.perform_image_change_check(camera, settings["image_change_threshold"])
            if check:
                results["image_change_check"] = {
                    "detected": check.image_change_detected,
                    "percentage": check.image_change_percentage,
                    "threshold": settings["image_change_threshold"]
                }

        return results

    def get_camera_status(self, camera_id: int) -> Optional[CameraVitalSignsStatus]:
        """Get current vital signs status for a camera"""
        return self.db.query(CameraVitalSignsStatus).filter(
            CameraVitalSignsStatus.camera_id == camera_id
        ).first()

    def get_camera_checks(self, camera_id: int, limit: int = 50) -> list:
        """Get recent vital signs checks for a camera"""
        return self.db.query(CameraVitalSignsCheck).filter(
            CameraVitalSignsCheck.camera_id == camera_id
        ).order_by(CameraVitalSignsCheck.check_time.desc()).limit(limit).all()
