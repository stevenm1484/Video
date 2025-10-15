import pyotp
import qrcode
import io
import base64
from datetime import datetime, timedelta
from typing import Optional, Tuple
import secrets
import ipaddress
import logging

logger = logging.getLogger(__name__)

class TwoFactorAuth:
    """Helper class for 2FA operations"""

    # Store temporary 2FA codes with expiration (in-memory for now)
    # Format: {user_id: {code: str, expires_at: datetime, method: str}}
    _temp_codes = {}

    @staticmethod
    def generate_totp_secret() -> str:
        """Generate a new TOTP secret"""
        return pyotp.random_base32()

    @staticmethod
    def generate_qr_code(secret: str, username: str, issuer: str = "Video Monitoring") -> str:
        """Generate QR code for TOTP setup (returns base64 encoded image)"""
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=username,
            issuer_name=issuer
        )

        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(provisioning_uri)
        qr.make(fit=True)

        # Convert to image
        img = qr.make_image(fill_color="black", back_color="white")

        # Convert to base64
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        return f"data:image/png;base64,{img_str}"

    @staticmethod
    def verify_totp_code(secret: str, code: str) -> bool:
        """Verify a TOTP code against a secret"""
        totp = pyotp.TOTP(secret)
        # Allow a window of 1 period (30 seconds) before and after
        return totp.verify(code, valid_window=1)

    @staticmethod
    def generate_random_code() -> str:
        """Generate a 6-digit random code for SMS/Email"""
        return ''.join([str(secrets.randbelow(10)) for _ in range(6)])

    @classmethod
    def store_temp_code(cls, user_id: int, code: str, method: str, expires_minutes: int = 5):
        """Store a temporary code for SMS/Email 2FA"""
        cls._temp_codes[user_id] = {
            'code': code,
            'expires_at': datetime.utcnow() + timedelta(minutes=expires_minutes),
            'method': method
        }
        logger.info(f"Stored temp 2FA code for user {user_id}, expires in {expires_minutes} minutes")

    @classmethod
    def verify_temp_code(cls, user_id: int, code: str) -> bool:
        """Verify a temporary code for SMS/Email 2FA"""
        if user_id not in cls._temp_codes:
            logger.warning(f"No temp code found for user {user_id}")
            return False

        stored_data = cls._temp_codes[user_id]

        # Check expiration
        if datetime.utcnow() > stored_data['expires_at']:
            logger.warning(f"Temp code expired for user {user_id}")
            del cls._temp_codes[user_id]
            return False

        # Check code
        if stored_data['code'] == code:
            logger.info(f"Temp code verified successfully for user {user_id}")
            # Remove code after successful verification
            del cls._temp_codes[user_id]
            return True

        logger.warning(f"Invalid temp code for user {user_id}")
        return False

    @staticmethod
    def check_ip_whitelist(client_ip: str, whitelist: list) -> bool:
        """Check if client IP is in the whitelist"""
        if not whitelist:
            return False

        try:
            client_addr = ipaddress.ip_address(client_ip)

            for allowed in whitelist:
                try:
                    # Try as network (CIDR notation)
                    if '/' in allowed:
                        network = ipaddress.ip_network(allowed, strict=False)
                        if client_addr in network:
                            return True
                    # Try as individual IP
                    else:
                        if client_addr == ipaddress.ip_address(allowed):
                            return True
                except ValueError:
                    logger.warning(f"Invalid IP/CIDR in whitelist: {allowed}")
                    continue

            return False
        except ValueError:
            logger.error(f"Invalid client IP format: {client_ip}")
            return False

    @staticmethod
    def validate_phone_number(phone: str) -> Tuple[bool, Optional[str]]:
        """
        Validate and format phone number to E.164 format
        Returns: (is_valid, formatted_phone)
        """
        if not phone:
            return False, None

        # Remove all non-digit characters
        digits = ''.join(filter(str.isdigit, phone))

        # Basic validation - should have at least 10 digits
        if len(digits) < 10:
            return False, None

        # Format to E.164
        if len(digits) == 10:
            # Assume US number
            formatted = f'+1{digits}'
        elif len(digits) == 11 and digits.startswith('1'):
            formatted = f'+{digits}'
        elif digits.startswith('+'):
            formatted = digits
        else:
            # Assume country code is included
            formatted = f'+{digits}'

        return True, formatted

# Singleton instance
two_factor_auth = TwoFactorAuth()
