"""
Rate limiting utilities for API endpoints
"""
import time
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import HTTPException
from typing import Dict, Tuple
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    """
    Simple in-memory rate limiter using token bucket algorithm
    For production, consider using Redis-based rate limiting
    """
    def __init__(self):
        # Store: {(endpoint, user_id): (token_count, last_refill_time)}
        self.buckets: Dict[Tuple[str, int], Tuple[int, float]] = defaultdict(lambda: (0, time.time()))
        self.cleanup_interval = 3600  # Clean up old entries every hour
        self.last_cleanup = time.time()

    def check_rate_limit(
        self,
        endpoint: str,
        user_id: int,
        max_requests: int,
        window_seconds: int
    ) -> bool:
        """
        Check if request is within rate limit

        Args:
            endpoint: Endpoint name
            user_id: User ID making the request
            max_requests: Maximum number of requests allowed
            window_seconds: Time window in seconds

        Returns:
            True if within limit, raises HTTPException if exceeded

        Raises:
            HTTPException: 429 Too Many Requests if rate limit exceeded
        """
        now = time.time()
        key = (endpoint, user_id)

        # Get current bucket state
        request_count, last_refill = self.buckets[key]

        # Calculate time passed since last refill
        time_passed = now - last_refill

        # Refill tokens based on time passed
        if time_passed >= window_seconds:
            # Full refill - window has passed
            request_count = 0
            last_refill = now

        # Check if we're within limit
        if request_count >= max_requests:
            # Calculate when limit will reset
            time_until_reset = window_seconds - time_passed
            logger.warning(
                f"Rate limit exceeded for user {user_id} on endpoint {endpoint}. "
                f"Current: {request_count}/{max_requests}, Reset in: {time_until_reset:.0f}s"
            )
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {int(time_until_reset)} seconds.",
                headers={"Retry-After": str(int(time_until_reset))}
            )

        # Increment request count
        request_count += 1
        self.buckets[key] = (request_count, last_refill)

        # Periodic cleanup of old entries
        if now - self.last_cleanup > self.cleanup_interval:
            self._cleanup_old_entries(now, window_seconds)

        return True

    def _cleanup_old_entries(self, current_time: float, max_window: int):
        """Remove entries older than max window"""
        keys_to_delete = []
        for key, (count, last_refill) in self.buckets.items():
            if current_time - last_refill > max_window * 2:  # Double window for safety
                keys_to_delete.append(key)

        for key in keys_to_delete:
            del self.buckets[key]

        self.last_cleanup = current_time
        if keys_to_delete:
            logger.info(f"Cleaned up {len(keys_to_delete)} old rate limit entries")

# Global rate limiter instance
rate_limiter = RateLimiter()

def rate_limit(max_requests: int, window_seconds: int):
    """
    Decorator for rate limiting FastAPI endpoints

    Usage:
        @app.post("/api/test/endpoint")
        @rate_limit(max_requests=3, window_seconds=300)  # 3 requests per 5 minutes
        async def test_endpoint(current_user: User = Depends(get_current_active_user)):
            ...

    Args:
        max_requests: Maximum number of requests allowed
        window_seconds: Time window in seconds
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Extract current_user from kwargs
            current_user = kwargs.get('current_user')
            if not current_user:
                # Try to find it in args (less reliable but fallback)
                for arg in args:
                    if hasattr(arg, 'id') and hasattr(arg, 'username'):
                        current_user = arg
                        break

            if current_user:
                endpoint_name = func.__name__
                rate_limiter.check_rate_limit(
                    endpoint=endpoint_name,
                    user_id=current_user.id,
                    max_requests=max_requests,
                    window_seconds=window_seconds
                )

            return await func(*args, **kwargs)

        # Preserve original function metadata
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper

    return decorator
