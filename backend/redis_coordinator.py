"""
Redis-based coordination for multi-worker environments
Provides distributed locks and shared state management
"""
import asyncio
import logging
import json
from typing import Optional, Any
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

class RedisCoordinator:
    """Manages distributed coordination using Redis"""

    def __init__(self, redis_client=None):
        self.redis = redis_client

    def set_redis_client(self, redis_client):
        """Set or update the Redis client"""
        self.redis = redis_client

    @asynccontextmanager
    async def distributed_lock(self, lock_key: str, timeout: int = 10, blocking_timeout: int = 5):
        """
        Distributed lock using Redis

        Args:
            lock_key: Unique key for the lock
            timeout: How long the lock is valid (seconds)
            blocking_timeout: How long to wait to acquire lock (seconds)

        Usage:
            async with coordinator.distributed_lock("process_event_123"):
                # Critical section - only one worker executes this at a time
                pass
        """
        if not self.redis:
            # No Redis available, fall through (not ideal but allows degraded operation)
            logger.warning(f"Redis not available for lock: {lock_key}")
            yield False
            return

        lock_value = f"{asyncio.current_task().get_name()}"
        acquired = False

        try:
            # Try to acquire lock with timeout
            start_time = asyncio.get_event_loop().time()
            while True:
                # SETNX with expiry - atomic operation
                acquired = await self.redis.set(
                    lock_key,
                    lock_value,
                    ex=timeout,
                    nx=True  # Only set if not exists
                )

                if acquired:
                    logger.debug(f"Acquired lock: {lock_key}")
                    break

                # Check if we've exceeded blocking timeout
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed >= blocking_timeout:
                    logger.warning(f"Failed to acquire lock {lock_key} after {blocking_timeout}s")
                    yield False
                    return

                # Wait a bit before retrying
                await asyncio.sleep(0.1)

            yield True

        finally:
            # Release lock if we acquired it
            if acquired:
                try:
                    # Only delete if our value is still there (prevent deleting someone else's lock)
                    script = """
                    if redis.call("get", KEYS[1]) == ARGV[1] then
                        return redis.call("del", KEYS[1])
                    else
                        return 0
                    end
                    """
                    await self.redis.eval(script, 1, lock_key, lock_value)
                    logger.debug(f"Released lock: {lock_key}")
                except Exception as e:
                    logger.error(f"Error releasing lock {lock_key}: {e}")

    async def set_with_ttl(self, key: str, value: Any, ttl: int):
        """Set a key with TTL"""
        if not self.redis:
            return False
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            await self.redis.setex(key, ttl, str(value))
            return True
        except Exception as e:
            logger.error(f"Error setting Redis key {key}: {e}")
            return False

    async def get(self, key: str) -> Optional[str]:
        """Get a key value"""
        if not self.redis:
            return None
        try:
            return await self.redis.get(key)
        except Exception as e:
            logger.error(f"Error getting Redis key {key}: {e}")
            return None

    async def get_json(self, key: str) -> Optional[dict]:
        """Get a key value as JSON"""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except:
                return None
        return None

    async def delete(self, key: str):
        """Delete a key"""
        if not self.redis:
            return False
        try:
            await self.redis.delete(key)
            return True
        except Exception as e:
            logger.error(f"Error deleting Redis key {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        if not self.redis:
            return False
        try:
            result = await self.redis.exists(key)
            return bool(result)
        except Exception as e:
            logger.error(f"Error checking Redis key {key}: {e}")
            return False

    async def increment(self, key: str) -> int:
        """Atomically increment a counter"""
        if not self.redis:
            return 0
        try:
            return await self.redis.incr(key)
        except Exception as e:
            logger.error(f"Error incrementing Redis key {key}: {e}")
            return 0

    async def set_add(self, key: str, *values):
        """Add values to a set"""
        if not self.redis:
            return False
        try:
            await self.redis.sadd(key, *values)
            return True
        except Exception as e:
            logger.error(f"Error adding to Redis set {key}: {e}")
            return False

    async def set_members(self, key: str) -> set:
        """Get all members of a set"""
        if not self.redis:
            return set()
        try:
            return await self.redis.smembers(key)
        except Exception as e:
            logger.error(f"Error getting Redis set {key}: {e}")
            return set()

    async def set_remove(self, key: str, *values):
        """Remove values from a set"""
        if not self.redis:
            return False
        try:
            await self.redis.srem(key, *values)
            return True
        except Exception as e:
            logger.error(f"Error removing from Redis set {key}: {e}")
            return False

    async def hash_set(self, key: str, field: str, value: Any):
        """Set a hash field"""
        if not self.redis:
            return False
        try:
            await self.redis.hset(key, field, str(value))
            return True
        except Exception as e:
            logger.error(f"Error setting Redis hash {key}:{field}: {e}")
            return False

    async def hash_get(self, key: str, field: str) -> Optional[str]:
        """Get a hash field"""
        if not self.redis:
            return None
        try:
            return await self.redis.hget(key, field)
        except Exception as e:
            logger.error(f"Error getting Redis hash {key}:{field}: {e}")
            return None

    async def hash_delete(self, key: str, field: str):
        """Delete a hash field"""
        if not self.redis:
            return False
        try:
            await self.redis.hdel(key, field)
            return True
        except Exception as e:
            logger.error(f"Error deleting Redis hash {key}:{field}: {e}")
            return False

    async def hash_get_all(self, key: str) -> dict:
        """Get all fields in a hash"""
        if not self.redis:
            return {}
        try:
            return await self.redis.hgetall(key)
        except Exception as e:
            logger.error(f"Error getting all Redis hash {key}: {e}")
            return {}

    async def decrement(self, key: str) -> int:
        """Atomically decrement a counter"""
        if not self.redis:
            return 0
        try:
            return await self.redis.decr(key)
        except Exception as e:
            logger.error(f"Error decrementing Redis key {key}: {e}")
            return 0

# Global coordinator instance
coordinator = RedisCoordinator()

def set_redis_client(redis_client):
    """Set Redis client for the coordinator"""
    global coordinator
    coordinator.set_redis_client(redis_client)
