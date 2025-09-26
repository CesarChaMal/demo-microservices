import redis
import uuid
import time
import threading
import logging
from typing import Optional, Callable, Any

logger = logging.getLogger(__name__)

class DistributedLock:
    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=0):
        self.client = redis.Redis(host=redis_host, port=redis_port, db=redis_db, decode_responses=True)
        self.lock_prefix = "distributed_lock:"
        
    def acquire_lock(self, lock_key: str, expiration_ms: int = 30000) -> Optional[str]:
        """Acquire a distributed lock with expiration"""
        lock_value = str(uuid.uuid4())
        full_key = f"{self.lock_prefix}{lock_key}"
        
        try:
            result = self.client.set(full_key, lock_value, px=expiration_ms, nx=True)
            if result:
                logger.info(f"Acquired lock: {lock_key}")
                return lock_value
            return None
        except Exception as e:
            logger.error(f"Failed to acquire lock {lock_key}: {e}")
            return None
    
    def release_lock(self, lock_key: str, lock_value: str) -> bool:
        """Release a distributed lock using Lua script for atomicity"""
        full_key = f"{self.lock_prefix}{lock_key}"
        
        # Lua script to ensure we only delete if we own the lock
        lua_script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        else
            return 0
        end
        """
        
        try:
            result = self.client.eval(lua_script, 1, full_key, lock_value)
            success = result == 1
            if success:
                logger.info(f"Released lock: {lock_key}")
            return success
        except Exception as e:
            logger.error(f"Failed to release lock {lock_key}: {e}")
            return False
    
    def execute_with_lock(self, lock_key: str, callback: Callable[[], Any], 
                         expiration_ms: int = 30000, timeout_ms: int = 5000) -> Any:
        """Execute a function with distributed lock protection"""
        start_time = time.time() * 1000
        
        while (time.time() * 1000 - start_time) < timeout_ms:
            lock_value = self.acquire_lock(lock_key, expiration_ms)
            if lock_value:
                try:
                    return callback()
                finally:
                    self.release_lock(lock_key, lock_value)
            
            # Wait before retry
            time.sleep(0.1)
        
        raise Exception(f"Failed to acquire lock within timeout: {lock_key}")
    
    def is_locked(self, lock_key: str) -> bool:
        """Check if a lock exists"""
        full_key = f"{self.lock_prefix}{lock_key}"
        try:
            return self.client.exists(full_key) > 0
        except Exception as e:
            logger.error(f"Failed to check lock status {lock_key}: {e}")
            return False
    
    def get_lock_info(self, lock_key: str) -> Optional[dict]:
        """Get information about a lock"""
        full_key = f"{self.lock_prefix}{lock_key}"
        try:
            value = self.client.get(full_key)
            if value:
                ttl = self.client.ttl(full_key)
                return {
                    'key': lock_key,
                    'value': value,
                    'ttl_seconds': ttl,
                    'exists': True
                }
            return {'key': lock_key, 'exists': False}
        except Exception as e:
            logger.error(f"Failed to get lock info {lock_key}: {e}")
            return None

# Global instance
distributed_lock = DistributedLock()

# Decorator for method-level locking
def with_distributed_lock(lock_key: str, expiration_ms: int = 30000, timeout_ms: int = 5000):
    def decorator(func):
        def wrapper(*args, **kwargs):
            return distributed_lock.execute_with_lock(
                lock_key, 
                lambda: func(*args, **kwargs),
                expiration_ms,
                timeout_ms
            )
        return wrapper
    return decorator