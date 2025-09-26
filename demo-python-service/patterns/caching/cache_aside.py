import time
import json
import logging
import threading
from typing import Any, Optional, Callable, Dict, List
from dataclasses import dataclass, asdict
from abc import ABC, abstractmethod
import redis
from cachetools import TTLCache, LRUCache
import hashlib

logger = logging.getLogger(__name__)

@dataclass
class CacheEntry:
    value: Any
    timestamp: float
    ttl: Optional[float] = None
    hit_count: int = 0
    
    def is_expired(self) -> bool:
        if self.ttl is None:
            return False
        return time.time() - self.timestamp > self.ttl
    
    def increment_hit(self):
        self.hit_count += 1

class CacheAsideService:
    def __init__(self, redis_host: str = 'localhost', redis_port: int = 6379, default_ttl: int = 1800):
        self.default_ttl = default_ttl
        self.redis_client = None
        self.connected = False
        
        try:
            self.redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )
            self.redis_client.ping()
            self.connected = True
            logger.info("Redis connected successfully")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Using in-memory cache as fallback")
            self.connected = False
    
    def get(self, key: str, data_loader: Callable[[], Any], ttl: Optional[int] = None) -> Any:
        cache_ttl = ttl or self.default_ttl
        
        try:
            # Try Redis first
            if self.connected:
                cached_value = self.redis_client.get(key)
                if cached_value is not None:
                    return json.loads(cached_value)
            
            # Load from data source
            data = data_loader()
            if data is not None:
                # Store in cache
                if self.connected:
                    self.redis_client.setex(key, cache_ttl, json.dumps(data, default=str))
            
            return data
            
        except Exception as e:
            logger.error(f"Cache error for key {key}: {e}")
            # Fallback to data loader
            return data_loader()
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        cache_ttl = ttl or self.default_ttl
        
        try:
            if self.connected:
                self.redis_client.setex(key, cache_ttl, json.dumps(value, default=str))
                return True
        except Exception as e:
            logger.error(f"Cache set error for key {key}: {e}")
        
        return False
    
    def delete(self, key: str) -> bool:
        try:
            if self.connected:
                return bool(self.redis_client.delete(key))
        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {e}")
        
        return False
    
    def exists(self, key: str) -> bool:
        try:
            if self.connected:
                return bool(self.redis_client.exists(key))
        except Exception as e:
            logger.error(f"Cache exists check error for key {key}: {e}")
        
        return False

class MultiLevelCache:
    def __init__(self, l1_max_size: int = 1000, l1_ttl: int = 60, l2_ttl: int = 1800):
        # L1: In-memory cache (fast, small)
        self.l1_cache = TTLCache(maxsize=l1_max_size, ttl=l1_ttl)
        self.l1_lock = threading.RLock()
        
        # L2: Redis cache (slower, larger)
        self.l2_cache = CacheAsideService(default_ttl=l2_ttl)
        
        # Statistics
        self.stats = {
            'l1_hits': 0,
            'l1_misses': 0,
            'l2_hits': 0,
            'l2_misses': 0,
            'total_requests': 0
        }
        self.stats_lock = threading.Lock()
    
    def get(self, key: str, data_loader: Callable[[], Any], ttl: Optional[int] = None) -> Any:
        with self.stats_lock:
            self.stats['total_requests'] += 1
        
        # Check L1 cache first
        with self.l1_lock:
            if key in self.l1_cache:
                with self.stats_lock:
                    self.stats['l1_hits'] += 1
                return self.l1_cache[key]
        
        with self.stats_lock:
            self.stats['l1_misses'] += 1
        
        # Check L2 cache
        def l2_data_loader():
            with self.stats_lock:
                self.stats['l2_misses'] += 1
            data = data_loader()
            # Store in L1 cache
            if data is not None:
                with self.l1_lock:
                    self.l1_cache[key] = data
            return data
        
        result = self.l2_cache.get(key, l2_data_loader, ttl)
        
        if result is not None:
            with self.stats_lock:
                self.stats['l2_hits'] += 1
            # Store in L1 cache
            with self.l1_lock:
                self.l1_cache[key] = result
        
        return result
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        # Store in both levels
        with self.l1_lock:
            self.l1_cache[key] = value
        
        return self.l2_cache.set(key, value, ttl)
    
    def delete(self, key: str) -> bool:
        # Delete from both levels
        with self.l1_lock:
            self.l1_cache.pop(key, None)
        
        return self.l2_cache.delete(key)
    
    def get_stats(self) -> Dict[str, Any]:
        with self.stats_lock:
            total = self.stats['total_requests']
            l1_hit_rate = (self.stats['l1_hits'] / total * 100) if total > 0 else 0
            l2_hit_rate = (self.stats['l2_hits'] / total * 100) if total > 0 else 0
            
            return {
                **self.stats,
                'l1_hit_rate': round(l1_hit_rate, 2),
                'l2_hit_rate': round(l2_hit_rate, 2),
                'l1_size': len(self.l1_cache),
                'l1_max_size': self.l1_cache.maxsize
            }

class WriteBehindCache:
    def __init__(self, flush_interval: int = 10, batch_size: int = 100):
        self.cache = CacheAsideService()
        self.write_buffer = {}
        self.flush_interval = flush_interval
        self.batch_size = batch_size
        self.buffer_lock = threading.Lock()
        self.running = True
        
        # Start background flush thread
        self.flush_thread = threading.Thread(target=self._flush_worker, daemon=True)
        self.flush_thread.start()
    
    def write(self, key: str, value: Any) -> None:
        # Write to cache immediately
        self.cache.set(key, value)
        
        # Buffer for database write
        with self.buffer_lock:
            self.write_buffer[key] = {
                'value': value,
                'timestamp': time.time()
            }
    
    def read(self, key: str, data_loader: Callable[[], Any]) -> Any:
        return self.cache.get(key, data_loader)
    
    def _flush_worker(self):
        while self.running:
            try:
                time.sleep(self.flush_interval)
                self._flush_buffer()
            except Exception as e:
                logger.error(f"Flush worker error: {e}")
    
    def _flush_buffer(self):
        if not self.write_buffer:
            return
        
        with self.buffer_lock:
            # Get batch to flush
            items_to_flush = dict(list(self.write_buffer.items())[:self.batch_size])
            
            # Remove from buffer
            for key in items_to_flush:
                self.write_buffer.pop(key, None)
        
        if items_to_flush:
            try:
                self._batch_write_to_database(items_to_flush)
                logger.info(f"Flushed {len(items_to_flush)} items to database")
            except Exception as e:
                logger.error(f"Failed to flush buffer: {e}")
                # Re-add failed items to buffer
                with self.buffer_lock:
                    self.write_buffer.update(items_to_flush)
    
    def _batch_write_to_database(self, items: Dict[str, Any]):
        # Simulate database batch write
        logger.info(f"Simulating database batch write for {len(items)} items")
        time.sleep(0.1)  # Simulate I/O delay
    
    def get_stats(self) -> Dict[str, Any]:
        with self.buffer_lock:
            return {
                'buffer_size': len(self.write_buffer),
                'flush_interval': self.flush_interval,
                'batch_size': self.batch_size,
                'running': self.running
            }
    
    def shutdown(self):
        self.running = False
        if self.flush_thread.is_alive():
            self.flush_thread.join(timeout=5)
        # Final flush
        self._flush_buffer()

class ProcessingCache:
    def __init__(self):
        self.cache = CacheAsideService()
    
    def get_processed_data(self, value: int) -> Dict[str, Any]:
        cache_key = f"processed:{value}"
        
        def data_loader():
            # Simulate expensive computation
            time.sleep(0.5)
            return {
                'result': value * 2,
                'computed': True,
                'timestamp': time.time(),
                'computed_by': 'python-service'
            }
        
        return self.cache.get(cache_key, data_loader, ttl=300)

class MaterializedViewCache:
    def __init__(self):
        self.cache = MultiLevelCache()
        self.refresh_interval = 60  # 1 minute
        self.last_refresh = 0
        self.lock = threading.Lock()
    
    def get_view(self, view_name: str, refresh_func: Callable[[], Any]) -> Any:
        cache_key = f"materialized_view:{view_name}"
        
        with self.lock:
            current_time = time.time()
            if current_time - self.last_refresh > self.refresh_interval:
                # Force refresh
                data = refresh_func()
                self.cache.set(cache_key, data, ttl=self.refresh_interval * 2)
                self.last_refresh = current_time
                return data
        
        # Try cache first
        def data_loader():
            with self.lock:
                self.last_refresh = time.time()
            return refresh_func()
        
        return self.cache.get(cache_key, data_loader, ttl=self.refresh_interval * 2)

class CacheWarmer:
    def __init__(self, cache: CacheAsideService):
        self.cache = cache
        self.warming_tasks = []
    
    def add_warming_task(self, key: str, data_loader: Callable[[], Any], ttl: Optional[int] = None):
        self.warming_tasks.append({
            'key': key,
            'data_loader': data_loader,
            'ttl': ttl
        })
    
    def warm_cache(self):
        logger.info(f"Starting cache warming for {len(self.warming_tasks)} tasks")
        
        for task in self.warming_tasks:
            try:
                if not self.cache.exists(task['key']):
                    data = task['data_loader']()
                    self.cache.set(task['key'], data, task['ttl'])
                    logger.info(f"Warmed cache for key: {task['key']}")
            except Exception as e:
                logger.error(f"Failed to warm cache for key {task['key']}: {e}")

# Decorators for easy cache usage
def cached(ttl: int = 1800, key_func: Optional[Callable] = None):
    cache_service = CacheAsideService()
    
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Default key generation
                key_parts = [func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
                cache_key = hashlib.md5(":".join(key_parts).encode()).hexdigest()
            
            def data_loader():
                return func(*args, **kwargs)
            
            return cache_service.get(cache_key, data_loader, ttl)
        
        return wrapper
    return decorator

def cache_invalidate(pattern: str):
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            # In a real implementation, you'd invalidate cache entries matching the pattern
            logger.info(f"Cache invalidation triggered for pattern: {pattern}")
            return result
        return wrapper
    return decorator