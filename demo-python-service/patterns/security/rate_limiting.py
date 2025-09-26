"""
Rate Limiting Pattern Implementation
Controls request rates to prevent abuse and ensure fair resource usage.
"""

import time
import threading
from typing import Dict, Any, Optional
from collections import defaultdict, deque

class TokenBucketRateLimiter:
    """Token bucket algorithm for rate limiting"""
    
    def __init__(self, capacity: int = 100, refill_rate: int = 10):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.buckets = {}
        self.lock = threading.Lock()
    
    def is_allowed(self, key: str) -> Dict[str, Any]:
        """Check if request is allowed"""
        with self.lock:
            now = time.time()
            
            if key not in self.buckets:
                self.buckets[key] = {
                    'tokens': self.capacity,
                    'last_refill': now
                }
            
            bucket = self.buckets[key]
            
            # Refill tokens
            time_passed = now - bucket['last_refill']
            tokens_to_add = time_passed * self.refill_rate
            bucket['tokens'] = min(self.capacity, bucket['tokens'] + tokens_to_add)
            bucket['last_refill'] = now
            
            # Check if request allowed
            if bucket['tokens'] >= 1:
                bucket['tokens'] -= 1
                return {'allowed': True, 'remaining': int(bucket['tokens'])}
            else:
                return {'allowed': False, 'reset_time': int(60 / self.refill_rate)}

class SlidingWindowRateLimiter:
    """Sliding window rate limiter"""
    
    def __init__(self, window_size: int = 60, max_requests: int = 100):
        self.window_size = window_size
        self.max_requests = max_requests
        self.windows = defaultdict(deque)
        self.lock = threading.Lock()
    
    def is_allowed(self, key: str) -> Dict[str, Any]:
        """Check if request is allowed"""
        with self.lock:
            now = time.time()
            window = self.windows[key]
            
            # Remove old requests
            while window and window[0] <= now - self.window_size:
                window.popleft()
            
            # Check if allowed
            if len(window) < self.max_requests:
                window.append(now)
                return {'allowed': True, 'remaining': self.max_requests - len(window)}
            else:
                return {'allowed': False, 'reset_time': int(window[0] + self.window_size - now)}

def rate_limit_middleware(limiter):
    """Flask middleware for rate limiting"""
    def decorator(f):
        def wrapper(*args, **kwargs):
            from flask import request, jsonify
            
            client_key = request.remote_addr
            result = limiter.is_allowed(client_key)
            
            if not result['allowed']:
                return jsonify({
                    'error': 'Rate limit exceeded',
                    'retry_after': result.get('reset_time', 60)
                }), 429
            
            return f(*args, **kwargs)
        return wrapper
    return decorator