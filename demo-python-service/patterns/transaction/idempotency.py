import hashlib
import json
import time
import threading
from typing import Any, Callable, Dict, Optional

class IdempotencyService:
    def __init__(self, ttl: int = 300):  # 5 minutes default TTL
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.ttl = ttl
        self.lock = threading.Lock()

    def generate_key(self, *args, **kwargs) -> str:
        data = {'args': args, 'kwargs': kwargs}
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(json_str.encode()).hexdigest()

    def execute_idempotent(self, key: str, operation: Callable) -> Any:
        with self.lock:
            if key in self.cache:
                cached_entry = self.cache[key]
                if time.time() - cached_entry['timestamp'] < self.ttl:
                    return cached_entry['result']
                else:
                    del self.cache[key]

        result = operation()
        
        with self.lock:
            self.cache[key] = {
                'result': result,
                'timestamp': time.time()
            }
        
        return result

    def invalidate(self, key: str) -> bool:
        with self.lock:
            return self.cache.pop(key, None) is not None

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'cached_entries': len(self.cache),
                'ttl_seconds': self.ttl
            }