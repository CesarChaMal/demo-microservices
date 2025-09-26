"""
Bulkhead Pattern Implementation
Isolates critical resources to prevent cascading failures
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Callable
import logging

logger = logging.getLogger(__name__)

class BulkheadService:
    def __init__(self):
        self.pools: Dict[str, ThreadPoolExecutor] = {}
        self.metrics = {
            'executions': 0,
            'failures': 0,
            'pool_usage': {}
        }
        
    def create_pool(self, name: str, max_workers: int = 5):
        """Create isolated thread pool"""
        self.pools[name] = ThreadPoolExecutor(max_workers=max_workers)
        self.metrics['pool_usage'][name] = {'active': 0, 'completed': 0}
        logger.info(f"Created bulkhead pool: {name} with {max_workers} workers")
        
    def execute(self, pool_name: str, func: Callable, *args, **kwargs):
        """Execute function in isolated pool"""
        if pool_name not in self.pools:
            raise ValueError(f"Pool {pool_name} not found")
            
        pool = self.pools[pool_name]
        self.metrics['executions'] += 1
        self.metrics['pool_usage'][pool_name]['active'] += 1
        
        try:
            future = pool.submit(func, *args, **kwargs)
            result = future.result(timeout=30)
            self.metrics['pool_usage'][pool_name]['completed'] += 1
            return result
        except Exception as e:
            self.metrics['failures'] += 1
            logger.error(f"Bulkhead execution failed in pool {pool_name}: {e}")
            raise
        finally:
            self.metrics['pool_usage'][pool_name]['active'] -= 1
            
    def get_metrics(self) -> Dict[str, Any]:
        """Get bulkhead metrics"""
        return {
            'total_executions': self.metrics['executions'],
            'total_failures': self.metrics['failures'],
            'pools': {name: {
                'active_tasks': usage['active'],
                'completed_tasks': usage['completed']
            } for name, usage in self.metrics['pool_usage'].items()}
        }
        
    def shutdown(self):
        """Shutdown all pools"""
        for name, pool in self.pools.items():
            pool.shutdown(wait=True)
            logger.info(f"Shutdown bulkhead pool: {name}")

# Global instance
bulkhead_service = BulkheadService()

# Initialize default pools
bulkhead_service.create_pool('critical', max_workers=3)
bulkhead_service.create_pool('normal', max_workers=5)
bulkhead_service.create_pool('background', max_workers=2)