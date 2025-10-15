"""
Secure Image Token Service
Generates temporary signed tokens for accessing camera images
"""
import os
import hmac
import hashlib
import time
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class ImageTokenService:
    """Service for generating and validating temporary image access tokens"""

    def __init__(self):
        # Use SECRET_KEY from environment for signing
        self.secret_key = os.getenv("SECRET_KEY", "change-this-secret-key-in-production")
        self.token_expiry = 3600  # 1 hour expiry for email links

    def generate_token(self, image_path: str) -> str:
        """
        Generate a signed token for accessing an image

        Args:
            image_path: Relative path like "uploads/vital_signs_snapshots/camera_5_20251012_195820.jpg"

        Returns:
            Signed token string
        """
        # Create payload: path + expiry timestamp
        expiry = int(time.time()) + self.token_expiry
        payload = f"{image_path}:{expiry}"

        # Create HMAC signature
        signature = hmac.new(
            self.secret_key.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

        # Return token as base64-encoded payload + signature
        import base64
        token_data = f"{payload}:{signature}"
        token = base64.urlsafe_b64encode(token_data.encode()).decode()

        return token

    def validate_token(self, token: str) -> Optional[str]:
        """
        Validate a token and return the image path if valid

        Args:
            token: Signed token string

        Returns:
            Image path if valid, None if invalid or expired
        """
        try:
            # Decode token
            import base64
            token_data = base64.urlsafe_b64decode(token.encode()).decode()

            # Parse payload and signature
            parts = token_data.rsplit(':', 1)
            if len(parts) != 2:
                logger.warning("Invalid token format")
                return None

            payload, signature = parts

            # Verify signature
            expected_signature = hmac.new(
                self.secret_key.encode(),
                payload.encode(),
                hashlib.sha256
            ).hexdigest()

            if not hmac.compare_digest(signature, expected_signature):
                logger.warning("Invalid token signature")
                return None

            # Parse payload
            payload_parts = payload.rsplit(':', 1)
            if len(payload_parts) != 2:
                logger.warning("Invalid payload format")
                return None

            image_path, expiry_str = payload_parts
            expiry = int(expiry_str)

            # Check expiry
            if time.time() > expiry:
                logger.warning("Token expired")
                return None

            return image_path

        except Exception as e:
            logger.error(f"Error validating token: {e}")
            return None


# Singleton instance
image_token_service = ImageTokenService()
