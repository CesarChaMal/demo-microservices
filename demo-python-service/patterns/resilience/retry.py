"""Retry Pattern Implementation"""
import time
import random
from typing import Callable, Any, Optional
from retrying import retry

class RetryConfig:
    def __init__(self, max_attempts: int = 3, delay: float = 1.0, backoff_multiplier: float = 2.0):
        self.max_attempts = max_attempts
        self.delay = delay
        self.backoff_multiplier = backoff_multiplier

class RetryService:
    def __init__(self, config: RetryConfig = None):
        self.config = config or RetryConfig()
    
    def execute_with_retry(self, func: Callable, *args, **kwargs) -> Any:
        last_exception = None
        delay = self.config.delay
        
        for attempt in range(self.config.max_attempts):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.config.max_attempts - 1:
                    time.sleep(delay)
                    delay *= self.config.backoff_multiplier
        
        raise last_exception

# Decorator-based retry
@retry(stop_max_attempt_number=3, wait_exponential_multiplier=1000, wait_exponential_max=10000)
def unreliable_service_call(data):
    """Service call with exponential backoff retry"""
    if random.random() < 0.5:  # 50% failure rate
        raise Exception("Transient failure")
    return {"result": data["value"] * 2, "status": "success"}

# Advanced retry with custom conditions
def retry_if_connection_error(exception):
    """Return True if we should retry (in this case when it's a connection error)"""
    return isinstance(exception, (ConnectionError, TimeoutError))

@retry(retry_on_exception=retry_if_connection_error, stop_max_attempt_number=5, wait_fixed=2000)
def network_service_call(data):
    """Network call with retry on specific exceptions"""
    import requests
    try:
        response = requests.post("http://service/api", json=data, timeout=5)
        return response.json()
    except requests.exceptions.ConnectionError:
        raise ConnectionError("Network connection failed")
    except requests.exceptions.Timeout:
        raise TimeoutError("Request timeout")

class SmartRetryService:
    def __init__(self):
        self.retry_service = RetryService(RetryConfig(max_attempts=3, delay=1.0))
    
    def process_with_smart_retry(self, data):
        """Process data with intelligent retry logic"""
        def _process():
            # Simulate processing with potential failures
            if random.random() < 0.4:  # 40% failure rate
                raise Exception("Processing failed")
            return {"result": data["value"] * 3, "retried": True}
        
        try:
            return self.retry_service.execute_with_retry(_process)
        except Exception as e:
            return {"error": str(e), "result": data["value"], "retried": False}