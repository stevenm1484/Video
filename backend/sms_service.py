import os
import logging
from typing import Optional
import requests

logger = logging.getLogger(__name__)

class SMSService:
    """SMS service using Telnyx API v2"""

    def __init__(self):
        self.api_key = os.getenv("TELNYX_API_KEY", "")
        self.from_number = os.getenv("TELNYX_FROM_NUMBER", "")  # Your Telnyx phone number
        self.api_url = "https://api.telnyx.com/v2/messages"

    def send_sms(self, to_number: str, message: str) -> bool:
        """
        Send an SMS via Telnyx API v2

        Args:
            to_number: Recipient phone number (E.164 format, e.g., +12345678900)
            message: SMS message text

        Returns:
            bool: True if SMS sent successfully, False otherwise
        """
        if not self.api_key or not self.from_number:
            logger.error("Telnyx credentials not configured")
            return False

        # Ensure phone number is in E.164 format
        if not to_number.startswith('+'):
            to_number = f'+{to_number}'

        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            payload = {
                "from": self.from_number,
                "to": to_number,
                "text": message
            }

            response = requests.post(self.api_url, headers=headers, json=payload)

            if response.status_code == 200:
                result = response.json()
                message_id = result.get("data", {}).get("id", "unknown")
                logger.info(f"SMS sent successfully to {to_number}, ID: {message_id}")
                return True
            else:
                logger.error(f"Telnyx API returned status {response.status_code}: {response.text}")
                return False

        except Exception as e:
            # Catch all exceptions including Telnyx API errors
            logger.error(f"Failed to send SMS to {to_number}: {str(e)}")
            return False

    def send_2fa_code(self, to_number: str, code: str, username: str) -> bool:
        """
        Send a 2FA verification code via SMS

        Args:
            to_number: Recipient phone number (E.164 format)
            code: 6-digit verification code
            username: Username for personalization

        Returns:
            bool: True if SMS sent successfully
        """
        message = f"Video Monitoring System\n\nHello {username},\n\nYour verification code is: {code}\n\nThis code expires in 5 minutes."

        return self.send_sms(to_number, message)

    def send_alarm_notification(
        self,
        to_number: str,
        account_name: str,
        camera_name: str,
        alarm_id: int
    ) -> bool:
        """
        Send an alarm notification via SMS

        Args:
            to_number: Recipient phone number (E.164 format)
            account_name: Name of the account
            camera_name: Name of the camera
            alarm_id: Alarm ID

        Returns:
            bool: True if SMS sent successfully
        """
        message = f"⚠️ ALARM ALERT\n\nAccount: {account_name}\nCamera: {camera_name}\nAlarm ID: #{alarm_id}\n\nCheck dashboard for details."

        return self.send_sms(to_number, message)

    def format_phone_number(self, phone: str) -> str:
        """
        Format phone number to E.164 format

        Args:
            phone: Phone number (various formats accepted)

        Returns:
            str: Phone number in E.164 format (e.g., +12345678900)
        """
        # Remove all non-digit characters
        digits = ''.join(filter(str.isdigit, phone))

        # If it doesn't start with country code, assume US (+1)
        if len(digits) == 10:
            return f'+1{digits}'
        elif len(digits) == 11 and digits.startswith('1'):
            return f'+{digits}'
        elif digits.startswith('+'):
            return digits
        else:
            # Assume it already has country code
            return f'+{digits}'

    def validate_phone_number(self, phone: str) -> bool:
        """
        Validate phone number format

        Args:
            phone: Phone number to validate

        Returns:
            bool: True if phone number is valid
        """
        try:
            formatted = self.format_phone_number(phone)
            # Basic validation: should be +[country code][number] with at least 10 digits
            return formatted.startswith('+') and len(formatted) >= 11
        except Exception:
            return False


# Singleton instance
sms_service = SMSService()
