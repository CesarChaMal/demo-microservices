import time
import threading
import logging
from enum import Enum
from typing import Callable, Any, Optional, Dict
from dataclasses import dataclass
from circuitbreaker import circuit
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

class CircuitBreakerState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

@dataclass
class CircuitBreakerStats:
    failure_count: int = 0
    success_count: int = 0
    total_requests: int = 0
    state: CircuitBreakerState = CircuitBreakerState.CLOSED
    last_failure_time: Optional[float] = None
    failure_rate: float = 0.0

class PythonCircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 30, expected_exception: type = Exception):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.stats = CircuitBreakerStats()
        self.lock = threading.Lock()
        
    def __call__(self, func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            with self.lock:
                if self.stats.state == CircuitBreakerState.OPEN:
                    if time.time() - self.stats.last_failure_time > self.recovery_timeout:
                        self.stats.state = CircuitBreakerState.HALF_OPEN
                        logger.info("Circuit breaker transitioning to HALF_OPEN")
                    else:
                        raise Exception("Circuit breaker is OPEN")
                
                try:
                    result = func(*args, **kwargs)
                    self._on_success()
                    return result
                except self.expected_exception as e:
                    self._on_failure()
                    raise e
                    
        return wrapper
    
    def _on_success(self):
        self.stats.success_count += 1
        self.stats.total_requests += 1
        
        if self.stats.state == CircuitBreakerState.HALF_OPEN:
            self.stats.state = CircuitBreakerState.CLOSED
            self.stats.failure_count = 0
            logger.info("Circuit breaker transitioning to CLOSED")
            
        self._update_failure_rate()
    
    def _on_failure(self):
        self.stats.failure_count += 1
        self.stats.total_requests += 1
        self.stats.last_failure_time = time.time()
        
        if self.stats.failure_count >= self.failure_threshold:
            self.stats.state = CircuitBreakerState.OPEN
            logger.warning("Circuit breaker transitioning to OPEN")
            
        self._update_failure_rate()
    
    def _update_failure_rate(self):
        if self.stats.total_requests > 0:
            self.stats.failure_rate = self.stats.failure_count / self.stats.total_requests
    
    def get_stats(self) -> Dict[str, Any]:
        return {
            'state': self.stats.state.value,
            'failure_count': self.stats.failure_count,
            'success_count': self.stats.success_count,
            'total_requests': self.stats.total_requests,
            'failure_rate': self.stats.failure_rate,
            'is_open': self.stats.state == CircuitBreakerState.OPEN,
            'is_closed': self.stats.state == CircuitBreakerState.CLOSED,
            'is_half_open': self.stats.state == CircuitBreakerState.HALF_OPEN
        }

class ExternalServiceClient:
    def __init__(self):
        self.java_service_breaker = PythonCircuitBreaker(
            failure_threshold=5,
            recovery_timeout=30,
            expected_exception=requests.RequestException
        )
        self.node_service_breaker = PythonCircuitBreaker(
            failure_threshold=3,
            recovery_timeout=20,
            expected_exception=requests.RequestException
        )
    
    @circuit(failure_threshold=5, recovery_timeout=30, expected_exception=requests.RequestException)
    def call_java_service(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            response = requests.post(
                'http://java-service:8080/calculate',
                json=data,
                timeout=5,
                headers={'Content-Type': 'application/json'}
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Java service call failed: {e}")
            return self._java_service_fallback(data, e)
    
    @circuit(failure_threshold=3, recovery_timeout=20, expected_exception=requests.RequestException)
    def call_node_service(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            response = requests.post(
                'http://node-service:3000/process',
                json=data,
                timeout=5,
                headers={'Content-Type': 'application/json'}
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Node service call failed: {e}")
            return self._node_service_fallback(data, e)
    
    def _java_service_fallback(self, data: Dict[str, Any], error: Exception) -> Dict[str, Any]:
        return {
            'result': data.get('value', 0) * 2,
            'source': 'fallback',
            'service': 'java-service',
            'error': str(error),
            'algorithm': 'fallback'
        }
    
    def _node_service_fallback(self, data: Dict[str, Any], error: Exception) -> Dict[str, Any]:
        return {
            'result': data.get('value', 0) * 2,
            'source': 'fallback',
            'service': 'node-service',
            'error': str(error),
            'pattern': 'circuit-breaker-fallback'
        }
    
    def get_circuit_breaker_stats(self) -> Dict[str, Any]:
        return {
            'java_service': self.java_service_breaker.get_stats() if hasattr(self.java_service_breaker, 'get_stats') else {'state': 'UNKNOWN'},
            'node_service': self.node_service_breaker.get_stats() if hasattr(self.node_service_breaker, 'get_stats') else {'state': 'UNKNOWN'}
        }

class RetryService:
    def __init__(self):
        self.max_attempts = 3
        self.base_delay = 1.0
        self.max_delay = 10.0
        self.backoff_multiplier = 2.0
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((requests.RequestException, ConnectionError))
    )
    def execute_with_retry(self, func: Callable, *args, **kwargs) -> Any:
        logger.info(f"Executing function with retry: {func.__name__}")
        return func(*args, **kwargs)
    
    def custom_retry(self, func: Callable, max_attempts: int = None, base_delay: float = None) -> Any:
        attempts = max_attempts or self.max_attempts
        delay = base_delay or self.base_delay
        
        for attempt in range(1, attempts + 1):
            try:
                logger.info(f"Attempt {attempt} of {attempts}")
                return func()
            except Exception as e:
                if attempt == attempts:
                    logger.error(f"All {attempts} attempts failed. Last error: {e}")
                    raise e
                
                wait_time = min(delay * (self.backoff_multiplier ** (attempt - 1)), self.max_delay)
                logger.warning(f"Attempt {attempt} failed: {e}. Retrying in {wait_time:.2f}s")
                time.sleep(wait_time)

class BulkheadService:
    def __init__(self, max_concurrent: int = 10):
        self.max_concurrent = max_concurrent
        self.semaphore = threading.Semaphore(max_concurrent)
        self.active_requests = 0
        self.total_requests = 0
        self.rejected_requests = 0
        self.lock = threading.Lock()
    
    def execute(self, func: Callable, *args, **kwargs) -> Any:
        with self.lock:
            self.total_requests += 1
        
        if not self.semaphore.acquire(blocking=False):
            with self.lock:
                self.rejected_requests += 1
            raise Exception("Bulkhead capacity exceeded")
        
        try:
            with self.lock:
                self.active_requests += 1
            
            result = func(*args, **kwargs)
            return result
        finally:
            with self.lock:
                self.active_requests -= 1
            self.semaphore.release()
    
    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'max_concurrent': self.max_concurrent,
                'active_requests': self.active_requests,
                'total_requests': self.total_requests,
                'rejected_requests': self.rejected_requests,
                'available_capacity': self.max_concurrent - self.active_requests
            }

class TimeoutService:
    @staticmethod
    def with_timeout(func: Callable, timeout_seconds: float, *args, **kwargs) -> Any:
        import signal
        
        def timeout_handler(signum, frame):
            raise TimeoutError(f"Operation timed out after {timeout_seconds} seconds")
        
        # Set the signal handler
        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(int(timeout_seconds))
        
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            signal.alarm(0)  # Cancel the alarm
            signal.signal(signal.SIGALRM, old_handler)  # Restore old handler

# Decorator-based implementations
def circuit_breaker(failure_threshold: int = 5, recovery_timeout: int = 30):
    def decorator(func: Callable) -> Callable:
        breaker = PythonCircuitBreaker(failure_threshold, recovery_timeout)
        return breaker(func)
    return decorator

def retry_on_failure(max_attempts: int = 3, base_delay: float = 1.0):
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            retry_service = RetryService()
            return retry_service.custom_retry(
                lambda: func(*args, **kwargs),
                max_attempts=max_attempts,
                base_delay=base_delay
            )
        return wrapper
    return decorator

def bulkhead(max_concurrent: int = 10):
    bulkhead_service = BulkheadService(max_concurrent)
    
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            return bulkhead_service.execute(func, *args, **kwargs)
        return wrapper
    return decorator

def timeout(seconds: float):
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            return TimeoutService.with_timeout(func, seconds, *args, **kwargs)
        return wrapper
    return decorator