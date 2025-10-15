"""
Security utility functions for input validation and sanitization
"""
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Allowed file extensions for uploads
ALLOWED_MEDIA_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.mp4', '.avi', '.mov'}

def validate_rtsp_url(url: str) -> str:
    """
    Validate and sanitize RTSP URL to prevent command injection

    Args:
        url: RTSP URL to validate

    Returns:
        Sanitized URL

    Raises:
        ValueError: If URL is invalid or contains malicious content
    """
    if not url:
        raise ValueError("RTSP URL cannot be empty")

    try:
        parsed = urlparse(url)

        # Validate protocol
        if parsed.scheme not in ['rtsp', 'rtmp', 'http', 'https']:
            raise ValueError(f"Invalid protocol: {parsed.scheme}. Allowed: rtsp, rtmp, http, https")

        # Ensure netloc is present
        if not parsed.netloc:
            raise ValueError("Invalid URL: missing host/netloc")

        # Check for shell metacharacters in the main URL parts (not query string)
        # We check scheme, netloc, and path separately to allow & and ? in query parameters
        dangerous_chars = [';', '|', '`', '$', '(', ')', '<', '>', '\n', '\r']
        url_base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

        for char in dangerous_chars:
            if char in url_base:
                raise ValueError(f"Invalid character '{char}' in URL")

        # Include query parameters if present, but validate them
        # RTSP URLs often need query params like ?stream=0&channel=1
        if parsed.query:
            # Check query string for dangerous chars (but allow & and =)
            query_dangerous = [';', '|', '`', '$', '(', ')', '<', '>', '\n', '\r']
            for char in query_dangerous:
                if char in parsed.query:
                    raise ValueError(f"Invalid character '{char}' in URL query string")
            clean_url = f"{url_base}?{parsed.query}"
        else:
            clean_url = url_base

        logger.info(f"Validated RTSP URL: {parsed.scheme}://{parsed.netloc}{parsed.path[:20]}...")
        return clean_url

    except Exception as e:
        logger.error(f"RTSP URL validation failed: {e}")
        raise ValueError(f"Invalid RTSP URL format: {str(e)}")


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal attacks

    Args:
        filename: Original filename

    Returns:
        Sanitized filename

    Raises:
        ValueError: If filename is invalid or dangerous
    """
    if not filename:
        raise ValueError("Filename cannot be empty")

    # Remove any path components (keep only basename)
    filename = os.path.basename(filename)

    # Remove null bytes
    filename = filename.replace('\x00', '')

    # Remove path separators
    filename = filename.replace('/', '').replace('\\', '').replace('..', '')

    # Validate extension
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_MEDIA_EXTENSIONS:
        raise ValueError(f"Invalid file extension: {ext}. Allowed: {', '.join(ALLOWED_MEDIA_EXTENSIONS)}")

    # Validate filename isn't trying path traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise ValueError("Invalid filename: path traversal detected")

    # Ensure filename is reasonable length
    if len(filename) > 255:
        raise ValueError("Filename too long (max 255 characters)")

    # Remove any non-alphanumeric characters except .-_
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)

    return filename


def validate_file_path(filepath: Path, allowed_directory: Path) -> Path:
    """
    Validate that a file path is within an allowed directory

    Args:
        filepath: Path to validate
        allowed_directory: Directory that file must be within

    Returns:
        Resolved absolute path

    Raises:
        ValueError: If path is outside allowed directory
    """
    # Resolve to absolute paths
    filepath = filepath.resolve()
    allowed_directory = allowed_directory.resolve()

    # Check if file is within allowed directory
    try:
        filepath.relative_to(allowed_directory)
    except ValueError:
        raise ValueError(f"Path traversal detected: {filepath} is outside allowed directory {allowed_directory}")

    return filepath


def validate_sql_parameter(value: any, param_name: str) -> any:
    """
    Basic validation for SQL parameters to prevent injection

    Args:
        value: Parameter value
        param_name: Parameter name for error messages

    Returns:
        Validated value

    Raises:
        ValueError: If value contains suspicious patterns
    """
    if value is None:
        return value

    # Convert to string for checking
    value_str = str(value)

    # Check for SQL injection patterns
    dangerous_patterns = [
        '--', ';--', '/*', '*/', 'xp_', 'sp_', 'exec', 'execute',
        'union', 'select', 'insert', 'update', 'delete', 'drop', 'create'
    ]

    value_lower = value_str.lower()
    for pattern in dangerous_patterns:
        if pattern in value_lower:
            logger.warning(f"Suspicious SQL pattern '{pattern}' detected in {param_name}")
            raise ValueError(f"Invalid value for {param_name}: contains suspicious SQL pattern")

    return value
