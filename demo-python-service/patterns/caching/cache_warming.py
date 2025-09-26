import threading
import time
from typing import Dict, Any, Callable, List
import logging

logger = logging.getLogger(__name__)

class CacheWarmingService:
    def __init__(self, cache):
        self.cache = cache
        self.warming_jobs = {}
        self.running = True
        
    def schedule_warming(self, key: str, data_loader: Callable, interval: int = 300):
        """Schedule periodic cache warming for a key"""
        def warming_worker():
            while key in self.warming_jobs and self.running:
                try:
                    data = data_loader()
                    self.cache.set(key, data)
                    logger.info(f"Cache warmed for key: {key}")
                except Exception as e:
                    logger.error(f"Cache warming failed for {key}: {e}")
                time.sleep(interval)
                
        thread = threading.Thread(target=warming_worker, daemon=True)
        self.warming_jobs[key] = thread
        thread.start()
        
    def warm_cache(self, cache_specs: List[Dict[str, Any]]):
        """Warm cache with multiple keys at once"""
        for spec in cache_specs:
            key = spec['key']
            data_loader = spec['data_loader']
            try:
                data = data_loader()
                self.cache.set(key, data)
                logger.info(f"Cache warmed for key: {key}")
            except Exception as e:
                logger.error(f"Failed to warm cache for {key}: {e}")
                
    def stop_warming(self, key: str):
        """Stop warming for a specific key"""
        if key in self.warming_jobs:
            del self.warming_jobs[key]
            
    def stop_all_warming(self):
        """Stop all warming jobs"""
        self.running = False
        self.warming_jobs.clear()

class CacheInvalidationService:
    def __init__(self, cache):
        self.cache = cache
        self.patterns = {}
        
    def register_pattern(self, pattern_name: str, key_pattern: str):
        """Register a pattern for cache invalidation"""
        self.patterns[pattern_name] = key_pattern
        
    def invalidate_by_pattern(self, pattern_name: str):
        """Invalidate cache entries matching a pattern"""
        if pattern_name not in self.patterns:
            return
            
        import re
        pattern = self.patterns[pattern_name]
        keys_to_invalidate = []
        
        # Get all cache keys and match pattern
        try:
            for key in self.cache.get_all_keys():
                if re.match(pattern, key):
                    keys_to_invalidate.append(key)
        except AttributeError:
            # Fallback if cache doesn't have get_all_keys
            logger.warning("Cache doesn't support get_all_keys, pattern invalidation limited")
            
        for key in keys_to_invalidate:
            self.cache.delete(key)
            logger.info(f"Invalidated cache key: {key}")
            
    def invalidate_by_prefix(self, prefix: str):
        """Invalidate all cache entries with a specific prefix"""
        keys_to_invalidate = []
        try:
            for key in self.cache.get_all_keys():
                if key.startswith(prefix):
                    keys_to_invalidate.append(key)
        except AttributeError:
            logger.warning("Cache doesn't support get_all_keys, prefix invalidation limited")
            
        for key in keys_to_invalidate:
            self.cache.delete(key)
            logger.info(f"Invalidated cache key: {key}")