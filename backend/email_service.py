import os
import requests
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """Email service using SMTP2GO API"""

    def __init__(self):
        self.api_key = os.getenv("SMTP2GO_API_KEY", "")
        self.api_url = os.getenv("SMTP2GO_API_URL", "https://api.smtp2go.com/v3/")
        self.from_email = os.getenv("SMTP2GO_FROM_EMAIL", "noreply@statewidecentralstation.com")
        self.from_name = os.getenv("SMTP2GO_FROM_NAME", "Video Monitoring System")

    def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[dict]] = None
    ) -> bool:
        """
        Send an email via SMTP2GO API

        Args:
            to_email: Recipient email address
            subject: Email subject
            body_text: Plain text email body
            body_html: Optional HTML email body
            cc: Optional list of CC recipients
            bcc: Optional list of BCC recipients

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        if not self.api_key:
            logger.error("SMTP2GO API key not configured")
            return False

        try:
            # Build the API payload
            payload = {
                "api_key": self.api_key,
                "to": [to_email],
                "sender": f"{self.from_name} <{self.from_email}>",
                "subject": subject,
                "text_body": body_text,
            }

            # Add HTML body if provided
            if body_html:
                payload["html_body"] = body_html

            # Add CC recipients if provided
            if cc:
                payload["cc"] = cc

            # Add BCC recipients if provided
            if bcc:
                payload["bcc"] = bcc

            # Add attachments if provided
            if attachments:
                payload["attachments"] = attachments

            # Make the API request
            response = requests.post(
                f"{self.api_url}email/send",
                json=payload,
                headers={"Content-Type": "application/json"}
            )

            # Check response
            if response.status_code == 200:
                result = response.json()
                if result.get("data", {}).get("succeeded", 0) > 0:
                    logger.info(f"Email sent successfully to {to_email}")
                    return True
                else:
                    logger.error(f"SMTP2GO API error: {result.get('data', {}).get('failed', [])}")
                    return False
            else:
                logger.error(f"SMTP2GO API returned status {response.status_code}: {response.text}")
                return False

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def send_2fa_code(self, to_email: str, code: str, username: str) -> bool:
        """
        Send a 2FA verification code via email

        Args:
            to_email: Recipient email address
            code: 6-digit verification code
            username: Username for personalization

        Returns:
            bool: True if email sent successfully
        """
        subject = "Your Video Monitoring Login Code"

        body_text = f"""
Hello {username},

Your verification code is: {code}

This code will expire in 5 minutes.

If you did not request this code, please ignore this email and contact your administrator.

Best regards,
Video Monitoring System
"""

        body_html = f"""
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 20px; border-radius: 10px 10px 0 0;">
        <h2 style="color: #3b82f6; margin: 0;">Video Monitoring System</h2>
    </div>
    <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="color: #334155; font-size: 16px;">Hello <strong>{username}</strong>,</p>
        <p style="color: #334155; font-size: 16px;">Your verification code is:</p>
        <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #3b82f6; letter-spacing: 8px;">{code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code will expire in 5 minutes.</p>
        <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
            If you did not request this code, please ignore this email and contact your administrator.
        </p>
    </div>
    <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        <p>Video Monitoring System - Secure Access</p>
    </div>
</body>
</html>
"""

        return self.send_email(to_email, subject, body_text, body_html)

    def send_alarm_notification(
        self,
        to_email: str,
        account_name: str,
        camera_name: str,
        alarm_id: int,
        timestamp: str,
        dashboard_url: str
    ) -> bool:
        """
        Send an alarm notification email

        Args:
            to_email: Recipient email address
            account_name: Name of the account
            camera_name: Name of the camera
            alarm_id: Alarm ID
            timestamp: Timestamp of the alarm
            dashboard_url: URL to the dashboard

        Returns:
            bool: True if email sent successfully
        """
        subject = f"⚠️ Alarm Alert - {account_name}"

        body_text = f"""
ALARM NOTIFICATION

Account: {account_name}
Camera: {camera_name}
Time: {timestamp}
Alarm ID: {alarm_id}

View in dashboard: {dashboard_url}

This is an automated notification from the Video Monitoring System.
"""

        body_html = f"""
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #ef4444; padding: 20px; border-radius: 10px 10px 0 0;">
        <h2 style="color: white; margin: 0;">⚠️ Alarm Alert</h2>
    </div>
    <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Account:</td>
                <td style="padding: 10px 0; color: #1e293b;">{account_name}</td>
            </tr>
            <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Camera:</td>
                <td style="padding: 10px 0; color: #1e293b;">{camera_name}</td>
            </tr>
            <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Time:</td>
                <td style="padding: 10px 0; color: #1e293b;">{timestamp}</td>
            </tr>
            <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Alarm ID:</td>
                <td style="padding: 10px 0; color: #1e293b;">#{alarm_id}</td>
            </tr>
        </table>
        <div style="margin-top: 30px; text-align: center;">
            <a href="{dashboard_url}" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                View in Dashboard
            </a>
        </div>
    </div>
    <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        <p>This is an automated notification from the Video Monitoring System.</p>
    </div>
</body>
</html>
"""

        return self.send_email(to_email, subject, body_text, body_html)


# Singleton instance
email_service = EmailService()
