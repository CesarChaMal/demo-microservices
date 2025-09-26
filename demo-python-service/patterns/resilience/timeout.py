"""
Timeout Pattern Implementation
Prevents operations from hanging indefinitely
"""
import time
import threading
import signal
from typing import Any, Callable, Optional
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

class TimeoutError(Exception):
    """Custom timeout exception"""
    pass

class TimeoutService:
    def __init__(self):
        self.metrics = {
            'executions': 0,
            'timeouts': 0,
            'successes': 0
        }
        
    def execute_with_timeout(self, func: Callable, timeout_seconds: float, *args, **kwargs) -> Any:
        """Execute function with timeout"""
        self.metrics['executions'] += 1
        
        result = [None]
        exception = [None]
        
        def target():
            try:
                result[0] = func(*args, **kwargs)
            except Exception as e:
                exception[0] = e
                
        thread = threading.Thread(target=target)
        thread.daemon = True
        thread.start()
        thread.join(timeout_seconds)
        
        if thread.is_alive():
            self.metrics['timeouts'] += 1
            logger.warning(f"Function timed out after {timeout_seconds}s")
            raise TimeoutError(f"Operation timed out after {timeout_seconds} seconds")
            
        if exception[0]:
            raise exception[0]
            
        self.metrics['successes'] += 1
        return result[0]
        
    @contextmanager
    def timeout_context(self, seconds: float):
        """Context manager for timeout operations"""
        def timeout_handler(signum, frame):
            raise TimeoutError(f"Operation timed out after {seconds} seconds")
            
        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(int(seconds))
        
        try:
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
            
    def get_metrics(self) -> dict:
        """Get timeout metrics"""
        return {
            'total_executions': self.metrics['executions'],
            'timeouts': self.metrics['timeouts'],
            'successes': self.metrics['successes'],
            'timeout_rate': self.metrics['timeouts'] / max(1, self.metrics['executions'])
        }

# Global instance
timeout_service = TimeoutService()