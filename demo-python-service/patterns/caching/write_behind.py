"""
Write-Behind Caching Pattern Implementation
Asynchronously writes data to persistent storage
"""
import threading
import time
import queue
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class WriteBehindCache:
    def __init__(self, flush_interval: int = 5, batch_size: int = 10):
        self.cache: Dict[str, Any] = {}
        self.dirty_keys: set = set()
        self.flush_interval = flush_interval
        self.batch_size = batch_size
        self.write_queue = queue.Queue()
        self.running = True
        self.metrics = {
            'cache_hits': 0,
            'cache_misses': 0,
            'writes': 0,
            'flushes': 0
        }
        
        # Start background writer
        self.writer_thread = threading.Thread(target=self._background_writer, daemon=True)
        self.writer_thread.start()
        
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if key in self.cache:
            self.metrics['cache_hits'] += 1
            return self.cache[key]
        
        self.metrics['cache_misses'] += 1
        # In real implementation, would load from persistent storage
        return None
        
    def put(self, key: str, value: Any):
        """Put value in cache and mark for write-behind"""
        self.cache[key] = value
        self.dirty_keys.add(key)
        self.metrics['writes'] += 1
        logger.debug(f"Cached key: {key}, marked dirty")
        
    def _background_writer(self):
        """Background thread to flush dirty data"""
        while self.running:
            try:
                time.sleep(self.flush_interval)
                self._flush_dirty_data()
            except Exception as e:
                logger.error(f"Write-behind flush error: {e}")
                
    def _flush_dirty_data(self):
        """Flush dirty data to persistent storage"""
        if not self.dirty_keys:
            return
            
        batch = list(self.dirty_keys)[:self.batch_size]
        
        for key in batch:
            if key in self.cache:
                # Simulate write to persistent storage
                self._write_to_storage(key, self.cache[key])
                self.dirty_keys.discard(key)
                
        if batch:
            self.metrics['flushes'] += 1
            logger.info(f"Flushed {len(batch)} keys to storage")
            
    def _write_to_storage(self, key: str, value: Any):
        """Simulate writing to persistent storage"""
        # In real implementation, would write to database
        logger.debug(f"Writing to storage: {key} = {value}")
        
    def force_flush(self):
        """Force immediate flush of all dirty data"""
        self._flush_dirty_data()
        
    def get_metrics(self) -> Dict[str, Any]:
        """Get cache metrics"""
        return {
            'cache_size': len(self.cache),
            'dirty_keys': len(self.dirty_keys),
            'cache_hits': self.metrics['cache_hits'],
            'cache_misses': self.metrics['cache_misses'],
            'writes': self.metrics['writes'],
            'flushes': self.metrics['flushes']
        }
        
    def shutdown(self):
        """Shutdown cache and flush remaining data"""
        self.running = False
        self.force_flush()
        if self.writer_thread.is_alive():
            self.writer_thread.join()

# Global instance
write_behind_cache = WriteBehindCache()