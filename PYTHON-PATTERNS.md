# Python Service - Microservices Patterns Implementation

**Total Patterns: 32**

## 1. Circuit Breaker Pattern

**Theory**: Prevents cascading failures by monitoring service calls and "opening" the circuit when failure rate exceeds threshold.

**Code**:
```python
import time
from enum import Enum

class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

class CircuitBreaker:
    def __init__(self, failure_threshold=5, timeout=60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitState.CLOSED

    def call(self, func, *args, **kwargs):
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.timeout:
                self.state = CircuitState.HALF_OPEN
            else:
                raise Exception("Circuit breaker is OPEN")

        try:
            result = func(*args, **kwargs)
            self.on_success()
            return result
        except Exception as e:
            self.on_failure()
            raise e

    def on_success(self):
        self.failure_count = 0
        self.state = CircuitState.CLOSED

    def on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
```

## 2. Retry Pattern

**Theory**: Automatically retries failed operations with configurable delays and maximum attempts.

**Code**:
```python
import time
import random
from functools import wraps

def retry_on_failure(max_attempts=3, delay=1, backoff=2, jitter=True):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        raise e
                    
                    wait_time = delay * (backoff ** attempt)
                    if jitter:
                        wait_time += random.uniform(0, wait_time * 0.1)
                    
                    time.sleep(wait_time)
            
        return wrapper
    return decorator

class RetryService:
    def custom_retry(self, operation, max_attempts=3, delay=1):
        for attempt in range(max_attempts):
            try:
                return operation()
            except Exception as e:
                if attempt == max_attempts - 1:
                    raise e
                time.sleep(delay * (2 ** attempt))
```

## 3. Bulkhead Pattern

**Theory**: Isolates resources to prevent one failing component from affecting others.

**Code**:
```python
import threading
import queue
from concurrent.futures import ThreadPoolExecutor

class BulkheadService:
    def __init__(self, max_concurrent=5, queue_size=100):
        self.max_concurrent = max_concurrent
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent)
        self.queue = queue.Queue(maxsize=queue_size)
        self.active_tasks = 0
        self.lock = threading.Lock()

    def execute(self, operation, *args, **kwargs):
        with self.lock:
            if self.active_tasks >= self.max_concurrent:
                raise Exception("Bulkhead capacity exceeded")
            self.active_tasks += 1

        try:
            future = self.executor.submit(operation, *args, **kwargs)
            return future.result()
        finally:
            with self.lock:
                self.active_tasks -= 1

    def get_stats(self):
        return {
            'active_tasks': self.active_tasks,
            'max_concurrent': self.max_concurrent
        }
```

## 4. Rate Limiting Pattern

**Theory**: Controls the rate of requests to prevent system overload.

**Code**:
```python
import time
import threading
from collections import defaultdict

class TokenBucketRateLimiter:
    def __init__(self, capacity=100, refill_rate=10):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity
        self.last_refill = time.time()
        self.lock = threading.Lock()

    def is_allowed(self, client_id=None):
        with self.lock:
            self._refill()
            
            if self.tokens >= 1:
                self.tokens -= 1
                return True
            return False

    def _refill(self):
        now = time.time()
        time_passed = now - self.last_refill
        tokens_to_add = time_passed * self.refill_rate
        
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now

class SlidingWindowRateLimiter:
    def __init__(self, window_size=60, max_requests=100):
        self.window_size = window_size
        self.max_requests = max_requests
        self.requests = defaultdict(list)
        self.lock = threading.Lock()

    def is_allowed(self, client_id):
        with self.lock:
            now = time.time()
            client_requests = self.requests[client_id]
            
            # Remove old requests
            client_requests[:] = [req_time for req_time in client_requests 
                                if now - req_time < self.window_size]
            
            if len(client_requests) < self.max_requests:
                client_requests.append(now)
                return True
            return False
```

## 5. Cache-Aside Pattern

**Theory**: Application manages cache directly, loading data on cache miss.

**Code**:
```python
import time
import threading
from typing import Any, Callable, Optional

class CacheAsideService:
    def __init__(self):
        self.cache = {}
        self.ttl = {}
        self.lock = threading.RLock()

    def get(self, key: str, data_loader: Callable = None, ttl: int = 300) -> Any:
        with self.lock:
            if self._is_valid(key):
                return self.cache[key]

            if data_loader:
                data = data_loader()
                self.set(key, data, ttl)
                return data
            
            return None

    def set(self, key: str, value: Any, ttl: int = 300):
        with self.lock:
            self.cache[key] = value
            self.ttl[key] = time.time() + ttl

    def _is_valid(self, key: str) -> bool:
        return key in self.cache and time.time() < self.ttl.get(key, 0)

    def invalidate(self, key: str):
        with self.lock:
            self.cache.pop(key, None)
            self.ttl.pop(key, None)

def cached(ttl=300):
    def decorator(func):
        cache_service = CacheAsideService()
        
        def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            return cache_service.get(cache_key, lambda: func(*args, **kwargs), ttl)
        
        return wrapper
    return decorator
```

## 6. Event Sourcing Pattern

**Theory**: Stores state changes as events, enabling audit trails and replay capabilities.

**Code**:
```python
from dataclasses import dataclass, asdict
from typing import List, Dict, Any
import time
import uuid

@dataclass
class DomainEvent:
    event_id: str
    event_type: str
    aggregate_id: str
    data: Dict[str, Any]
    timestamp: float
    version: int = 0

class EventStore:
    def __init__(self):
        self.events: List[DomainEvent] = []
        self.snapshots: Dict[str, Any] = {}
        self.lock = threading.Lock()

    def append(self, event: DomainEvent) -> DomainEvent:
        with self.lock:
            event.version = len(self.events) + 1
            event.timestamp = time.time()
            self.events.append(event)
        return event

    def get_events(self, aggregate_id: str, from_version: int = 0) -> List[DomainEvent]:
        with self.lock:
            return [event for event in self.events 
                   if event.aggregate_id == aggregate_id and event.version > from_version]

    def replay(self, aggregate_id: str) -> Dict[str, Any]:
        events = self.get_events(aggregate_id)
        state = {}
        
        for event in events:
            state = self._apply_event(state, event)
        
        return state

    def _apply_event(self, state: Dict[str, Any], event: DomainEvent) -> Dict[str, Any]:
        # Apply event to state based on event type
        if event.event_type == 'DATA_PROCESSED':
            state.update(event.data)
        return state
```

## 7. CQRS Pattern

**Theory**: Separates read and write operations for better scalability and performance.

**Code**:
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict

@dataclass
class Command:
    command_type: str
    payload: Dict[str, Any]
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        self.id = str(uuid.uuid4())
        self.timestamp = time.time()

@dataclass
class Query:
    query_type: str
    parameters: Dict[str, Any]
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        self.id = str(uuid.uuid4())
        self.timestamp = time.time()

class CommandHandler:
    def __init__(self, event_store, cache):
        self.event_store = event_store
        self.cache = cache
        self.handlers = {
            'PROCESS_DATA': self._handle_process_data,
            'CACHE_RESULT': self._handle_cache_result
        }

    def handle(self, command: Command) -> Any:
        handler = self.handlers.get(command.command_type)
        if not handler:
            raise ValueError(f"No handler for command type: {command.command_type}")
        return handler(command)

    def _handle_process_data(self, command: Command):
        # Process the command and create events
        result = self._process_business_logic(command.payload)
        
        event = DomainEvent(
            event_id=str(uuid.uuid4()),
            event_type='DATA_PROCESSED',
            aggregate_id=command.id,
            data={'command': command.payload, 'result': result}
        )
        
        self.event_store.append(event)
        return result

class QueryHandler:
    def __init__(self, cache, read_model=None):
        self.cache = cache
        self.read_model = read_model
        self.handlers = {
            'GET_PROCESSED_DATA': self._handle_get_processed_data,
            'GET_STATISTICS': self._handle_get_statistics
        }

    def handle(self, query: Query) -> Any:
        handler = self.handlers.get(query.query_type)
        if not handler:
            raise ValueError(f"No handler for query type: {query.query_type}")
        return handler(query)
```

## 8. Saga Pattern

**Theory**: Manages distributed transactions across multiple services with compensation.

**Code**:
```python
from enum import Enum
from typing import List, Callable, Dict, Any

class SagaStatus(Enum):
    STARTED = "STARTED"
    COMPLETED = "COMPLETED"
    COMPENSATED = "COMPENSATED"
    FAILED = "FAILED"

@dataclass
class SagaStep:
    name: str
    execute: Callable
    compensate: Callable

class Saga:
    def __init__(self, saga_id: str, saga_type: str, context: Dict[str, Any]):
        self.saga_id = saga_id
        self.saga_type = saga_type
        self.context = context
        self.status = SagaStatus.STARTED
        self.current_step = 0
        self.completed_steps = []

class SagaOrchestrator:
    def __init__(self, event_processor=None):
        self.sagas: Dict[str, Saga] = {}
        self.saga_definitions: Dict[str, List[SagaStep]] = {}
        self.event_processor = event_processor

    def register_saga(self, saga_type: str, steps: List[SagaStep]):
        self.saga_definitions[saga_type] = steps

    def start_saga(self, saga_id: str, saga_type: str, context: Dict[str, Any]) -> Saga:
        saga = Saga(saga_id, saga_type, context)
        self.sagas[saga_id] = saga
        
        try:
            self._execute_saga(saga)
        except Exception as e:
            self._compensate_saga(saga)
            saga.status = SagaStatus.FAILED
        
        return saga

    def _execute_saga(self, saga: Saga):
        steps = self.saga_definitions.get(saga.saga_type, [])
        
        for i, step in enumerate(steps[saga.current_step:], saga.current_step):
            try:
                result = step.execute(saga.context)
                saga.context.update(result or {})
                saga.completed_steps.append(step.name)
                saga.current_step = i + 1
            except Exception as e:
                raise e
        
        saga.status = SagaStatus.COMPLETED

    def _compensate_saga(self, saga: Saga):
        steps = self.saga_definitions.get(saga.saga_type, [])
        
        # Compensate in reverse order
        for step_name in reversed(saga.completed_steps):
            step = next((s for s in steps if s.name == step_name), None)
            if step and step.compensate:
                try:
                    step.compensate(saga.context)
                except Exception as e:
                    print(f"Compensation failed for step {step_name}: {e}")
        
        saga.status = SagaStatus.COMPENSATED
```

## 9. Outbox Pattern

**Theory**: Ensures reliable event publishing by storing events in the same transaction as business data.

**Code**:
```python
import threading
import time
from dataclasses import dataclass
from typing import List, Dict, Any

@dataclass
class OutboxEvent:
    id: str
    aggregate_id: str
    event_type: str
    event_data: Dict[str, Any]
    timestamp: float
    processed: bool = False

class OutboxService:
    def __init__(self):
        self.outbox_events: List[OutboxEvent] = []
        self.processing = False
        self.lock = threading.Lock()

    def save_event(self, aggregate_id: str, event_type: str, event_data: Dict[str, Any]) -> str:
        event = OutboxEvent(
            id=str(uuid.uuid4()),
            aggregate_id=aggregate_id,
            event_type=event_type,
            event_data=event_data,
            timestamp=time.time()
        )
        
        with self.lock:
            self.outbox_events.append(event)
        
        return event.id

    def start_processor(self):
        if self.processing:
            return
        
        self.processing = True
        
        def process_events():
            while self.processing:
                self._process_pending_events()
                time.sleep(5)  # Process every 5 seconds
        
        thread = threading.Thread(target=process_events, daemon=True)
        thread.start()

    def _process_pending_events(self):
        with self.lock:
            unprocessed = [e for e in self.outbox_events if not e.processed]
        
        for event in unprocessed:
            try:
                self._publish_event(event)
                event.processed = True
            except Exception as e:
                print(f"Failed to publish event {event.id}: {e}")

    def _publish_event(self, event: OutboxEvent):
        # Simulate event publishing
        print(f"Publishing event: {event.event_type} for aggregate {event.aggregate_id}")

    def get_stats(self) -> Dict[str, int]:
        with self.lock:
            total = len(self.outbox_events)
            processed = sum(1 for e in self.outbox_events if e.processed)
            return {
                'total_events': total,
                'processed_events': processed,
                'pending_events': total - processed
            }
```

## 10. Repository Pattern

**Theory**: Encapsulates data access logic and provides a uniform interface.

**Code**:
```python
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

@dataclass
class ProcessedDataEntity:
    request_id: str
    value: int
    result: int
    algorithm: str
    timestamp: float = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()

class Repository(ABC):
    @abstractmethod
    def save(self, entity: Any) -> Any:
        pass
    
    @abstractmethod
    def find_by_id(self, entity_id: str) -> Optional[Any]:
        pass
    
    @abstractmethod
    def find_all(self) -> List[Any]:
        pass
    
    @abstractmethod
    def delete(self, entity_id: str) -> bool:
        pass

class InMemoryProcessedDataRepository(Repository):
    def __init__(self):
        self.data: Dict[str, ProcessedDataEntity] = {}
        self.lock = threading.Lock()

    def save(self, entity: ProcessedDataEntity) -> ProcessedDataEntity:
        with self.lock:
            self.data[entity.request_id] = entity
        return entity

    def find_by_id(self, request_id: str) -> Optional[ProcessedDataEntity]:
        return self.data.get(request_id)

    def find_all(self) -> List[ProcessedDataEntity]:
        return list(self.data.values())

    def find_by_algorithm(self, algorithm: str) -> List[ProcessedDataEntity]:
        return [entity for entity in self.data.values() 
                if entity.algorithm == algorithm]

    def find_by_value_greater_than(self, threshold: int) -> List[ProcessedDataEntity]:
        return [entity for entity in self.data.values() 
                if entity.value > threshold]

    def delete(self, request_id: str) -> bool:
        with self.lock:
            return self.data.pop(request_id, None) is not None
```

## 11. Specification Pattern

**Theory**: Encapsulates business rules in reusable specification objects.

**Code**:
```python
from abc import ABC, abstractmethod
from typing import Any

class Specification(ABC):
    @abstractmethod
    def is_satisfied_by(self, entity: Any) -> bool:
        pass
    
    def and_specification(self, other: 'Specification') -> 'Specification':
        return AndSpecification(self, other)
    
    def or_specification(self, other: 'Specification') -> 'Specification':
        return OrSpecification(self, other)
    
    def not_specification(self) -> 'Specification':
        return NotSpecification(self)

class ValueGreaterThanSpecification(Specification):
    def __init__(self, threshold: int):
        self.threshold = threshold
    
    def is_satisfied_by(self, entity: ProcessedDataEntity) -> bool:
        return entity.value > self.threshold

class AlgorithmSpecification(Specification):
    def __init__(self, algorithm: str):
        self.algorithm = algorithm
    
    def is_satisfied_by(self, entity: ProcessedDataEntity) -> bool:
        return entity.algorithm == self.algorithm

class AndSpecification(Specification):
    def __init__(self, left: Specification, right: Specification):
        self.left = left
        self.right = right
    
    def is_satisfied_by(self, entity: Any) -> bool:
        return self.left.is_satisfied_by(entity) and self.right.is_satisfied_by(entity)

class OrSpecification(Specification):
    def __init__(self, left: Specification, right: Specification):
        self.left = left
        self.right = right
    
    def is_satisfied_by(self, entity: Any) -> bool:
        return self.left.is_satisfied_by(entity) or self.right.is_satisfied_by(entity)

class NotSpecification(Specification):
    def __init__(self, specification: Specification):
        self.specification = specification
    
    def is_satisfied_by(self, entity: Any) -> bool:
        return not self.specification.is_satisfied_by(entity)
```

## 12. Feature Toggle Pattern

**Theory**: Enables/disables features at runtime without code deployment.

**Code**:
```python
import os
from typing import Dict, Any, Optional

class FeatureToggle:
    def __init__(self, features: Dict[str, Dict[str, Any]] = None):
        self.features = features or {}
        self._load_from_environment()

    def _load_from_environment(self):
        # Load feature flags from environment variables
        for key, value in os.environ.items():
            if key.startswith('FEATURE_'):
                feature_name = key[8:].lower().replace('_', '-')
                self.features[feature_name] = {
                    'enabled': value.lower() in ('true', '1', 'yes', 'on')
                }

    def is_enabled(self, feature_name: str, context: Optional[Dict[str, Any]] = None) -> bool:
        feature = self.features.get(feature_name, {'enabled': False})
        
        if not feature.get('enabled', False):
            return False
        
        # Check rollout percentage
        rollout_percentage = feature.get('rollout_percentage', 100)
        if rollout_percentage < 100 and context:
            user_id = context.get('user_id', '')
            hash_value = hash(feature_name + user_id) % 100
            return hash_value < rollout_percentage
        
        return True

    def enable_feature(self, feature_name: str):
        if feature_name not in self.features:
            self.features[feature_name] = {}
        self.features[feature_name]['enabled'] = True

    def disable_feature(self, feature_name: str):
        if feature_name not in self.features:
            self.features[feature_name] = {}
        self.features[feature_name]['enabled'] = False

    def get_all_features(self) -> Dict[str, Dict[str, Any]]:
        return self.features.copy()
```

## 13. Health Check Pattern

**Theory**: Provides endpoints to monitor service health and dependencies.

**Code**:
```python
import time
from typing import Dict, Any, Callable, Optional
from dataclasses import dataclass

@dataclass
class HealthCheckResult:
    healthy: bool
    details: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.details is None:
            self.details = {}

class HealthCheckService:
    def __init__(self):
        self.checks: Dict[str, Dict[str, Any]] = {}
        self.status = 'UP'
        self.last_check = None

    def add_check(self, name: str, check_func: Callable, critical: bool = False):
        self.checks[name] = {
            'function': check_func,
            'critical': critical,
            'last_result': None,
            'last_check': None
        }

    def run_all_checks(self) -> Dict[str, Any]:
        results = {}
        overall_status = 'UP'

        for name, check in self.checks.items():
            try:
                result = check['function']()
                check['last_result'] = result
                check['last_check'] = time.time()

                if isinstance(result, dict) and not result.get('healthy', True):
                    if check['critical']:
                        overall_status = 'DOWN'
                    elif overall_status == 'UP':
                        overall_status = 'DEGRADED'

                results[name] = result

            except Exception as e:
                error_result = {'healthy': False, 'error': str(e)}
                results[name] = error_result
                check['last_result'] = error_result
                check['last_check'] = time.time()

                if check['critical']:
                    overall_status = 'DOWN'
                elif overall_status == 'UP':
                    overall_status = 'DEGRADED'

        self.status = overall_status
        self.last_check = time.time()

        return {
            'status': overall_status,
            'timestamp': self.last_check,
            'checks': results
        }

# Example health check functions
def check_database() -> Dict[str, Any]:
    try:
        # Simulate database check
        return {'healthy': True, 'response_time': 0.05}
    except Exception as e:
        return {'healthy': False, 'error': str(e)}

def check_external_service() -> Dict[str, Any]:
    try:
        # Simulate external service check
        return {'healthy': True, 'status': 'available'}
    except Exception as e:
        return {'healthy': False, 'error': str(e)}
```

## 14. Metrics Collection Pattern

**Theory**: Collects and exposes application metrics for monitoring.

**Code**:
```python
import time
import threading
from collections import defaultdict
from typing import Dict, Any, Optional

class MetricsCollector:
    def __init__(self):
        self.counters: Dict[str, int] = defaultdict(int)
        self.gauges: Dict[str, Dict[str, Any]] = {}
        self.histograms: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'count': 0, 'sum': 0, 'buckets': defaultdict(int)
        })
        self.lock = threading.Lock()

    def increment_counter(self, name: str, labels: Optional[Dict[str, str]] = None, value: int = 1):
        key = self._create_key(name, labels)
        with self.lock:
            self.counters[key] += value

    def set_gauge(self, name: str, labels: Optional[Dict[str, str]] = None, value: float = 0):
        key = self._create_key(name, labels)
        with self.lock:
            self.gauges[key] = {'value': value, 'timestamp': time.time()}

    def record_histogram(self, name: str, labels: Optional[Dict[str, str]] = None, value: float = 0):
        key = self._create_key(name, labels)
        with self.lock:
            hist = self.histograms[key]
            hist['count'] += 1
            hist['sum'] += value

            # Simple bucketing
            buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
            for bucket in buckets:
                if value <= bucket:
                    hist['buckets'][bucket] += 1

    def _create_key(self, name: str, labels: Optional[Dict[str, str]] = None) -> str:
        if not labels:
            return name
        label_str = ','.join(f'{k}="{v}"' for k, v in sorted(labels.items()))
        return f'{name}{{{label_str}}}'

    def get_metrics(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'counters': dict(self.counters),
                'gauges': dict(self.gauges),
                'histograms': dict(self.histograms)
            }

    def get_prometheus_metrics(self) -> str:
        lines = []
        
        with self.lock:
            # Counters
            for key, value in self.counters.items():
                lines.append(f'{key} {value}')
            
            # Gauges
            for key, data in self.gauges.items():
                lines.append(f'{key} {data["value"]}')
            
            # Histograms
            for key, data in self.histograms.items():
                lines.append(f'{key}_count {data["count"]}')
                lines.append(f'{key}_sum {data["sum"]}')
                for bucket, count in data['buckets'].items():
                    lines.append(f'{key}_bucket{{le="{bucket}"}} {count}')
        
        return '\n'.join(lines)
```

## 15. Async Processing Pattern

**Theory**: Processes tasks asynchronously to improve responsiveness.

**Code**:
```python
import asyncio
import threading
import queue
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Callable, Any, Dict
from dataclasses import dataclass
import uuid

@dataclass
class AsyncTask:
    id: str
    operation: Callable
    priority: int
    status: str
    created_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Any = None
    error: Optional[str] = None

class AsyncProcessor:
    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.tasks: Dict[str, AsyncTask] = {}
        self.task_queue = queue.PriorityQueue()
        self.lock = threading.Lock()

    def submit_task(self, operation: Callable, priority: int = 0) -> str:
        task_id = str(uuid.uuid4())
        
        task = AsyncTask(
            id=task_id,
            operation=operation,
            priority=priority,
            status='queued',
            created_at=time.time()
        )
        
        with self.lock:
            self.tasks[task_id] = task
        
        # Submit to thread pool
        future = self.executor.submit(self._execute_task, task_id)
        
        return task_id

    def _execute_task(self, task_id: str):
        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return
            
            task.status = 'running'
            task.started_at = time.time()

        try:
            result = task.operation()
            
            with self.lock:
                task.status = 'completed'
                task.completed_at = time.time()
                task.result = result
                
        except Exception as e:
            with self.lock:
                task.status = 'failed'
                task.completed_at = time.time()
                task.error = str(e)

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return None
            
            return {
                'id': task.id,
                'status': task.status,
                'created_at': task.created_at,
                'started_at': task.started_at,
                'completed_at': task.completed_at,
                'result': task.result,
                'error': task.error
            }

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            total = len(self.tasks)
            by_status = defaultdict(int)
            
            for task in self.tasks.values():
                by_status[task.status] += 1
            
            return {
                'total_tasks': total,
                'by_status': dict(by_status),
                'max_workers': self.max_workers
            }
```

## 16. Reactive Streams Pattern

**Theory**: Handles asynchronous data streams with backpressure support.

**Code**:
```python
from typing import Callable, Any, List, Optional
from abc import ABC, abstractmethod

class Observer(ABC):
    @abstractmethod
    def on_next(self, value: Any):
        pass
    
    @abstractmethod
    def on_error(self, error: Exception):
        pass
    
    @abstractmethod
    def on_complete(self):
        pass

class ReactiveStream:
    def __init__(self, source: Any):
        self.source = source
        self.operators = []

    @classmethod
    def from_iterable(cls, iterable):
        return cls(iterable)

    def map(self, mapper: Callable[[Any], Any]):
        self.operators.append(('map', mapper))
        return self

    def filter(self, predicate: Callable[[Any], bool]):
        self.operators.append(('filter', predicate))
        return self

    def take(self, count: int):
        self.operators.append(('take', count))
        return self

    def subscribe(self, observer: Observer):
        try:
            data = list(self.source) if hasattr(self.source, '__iter__') else [self.source]
            
            for op_type, op_func in self.operators:
                if op_type == 'map':
                    data = [op_func(item) for item in data]
                elif op_type == 'filter':
                    data = [item for item in data if op_func(item)]
                elif op_type == 'take':
                    data = data[:op_func]
            
            for item in data:
                observer.on_next(item)
            
            observer.on_complete()
            
        except Exception as e:
            observer.on_error(e)

class BackpressureHandler:
    def __init__(self, buffer_size: int = 1000, strategy: str = 'drop'):
        self.buffer_size = buffer_size
        self.strategy = strategy  # 'drop', 'block', 'latest'
        self.buffer = []
        self.lock = threading.Lock()

    def handle_item(self, item: Any) -> bool:
        with self.lock:
            if len(self.buffer) >= self.buffer_size:
                if self.strategy == 'drop':
                    return False  # Drop the item
                elif self.strategy == 'latest':
                    self.buffer.pop(0)  # Remove oldest
                elif self.strategy == 'block':
                    # In a real implementation, this would block
                    return False
            
            self.buffer.append(item)
            return True

    def get_next_item(self) -> Optional[Any]:
        with self.lock:
            return self.buffer.pop(0) if self.buffer else None

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'buffer_size': len(self.buffer),
                'max_buffer_size': self.buffer_size,
                'strategy': self.strategy
            }
```

## 17. API Gateway Pattern

**Theory**: Single entry point for client requests with routing and cross-cutting concerns.

**Code**:
```python
import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

@dataclass
class Route:
    path_pattern: str
    target_service: str
    target_path: str
    methods: List[str]
    middleware: List[Callable] = None

@dataclass
class GatewayRequest:
    path: str
    method: str
    headers: Dict[str, str]
    query_params: Dict[str, str]
    body: Any
    client_ip: str

class APIGateway:
    def __init__(self):
        self.routes: List[Route] = []
        self.middleware: List[Callable] = []

    def add_route(self, route: Route):
        self.routes.append(route)

    def add_middleware(self, middleware: Callable):
        self.middleware.append(middleware)

    async def route_request(self, request: GatewayRequest) -> Dict[str, Any]:
        # Find matching route
        route = self._find_route(request.path, request.method)
        if not route:
            raise Exception(f"No route found for {request.method} {request.path}")

        # Apply global middleware
        for middleware in self.middleware:
            request = await self._apply_middleware(middleware, request)

        # Apply route-specific middleware
        if route.middleware:
            for middleware in route.middleware:
                request = await self._apply_middleware(middleware, request)

        # Route to target service
        target_url = f"{route.target_service}{route.target_path}"
        response = await self._make_request(target_url, request)
        
        return response

    def _find_route(self, path: str, method: str) -> Optional[Route]:
        for route in self.routes:
            if method in route.methods and self._match_path(route.path_pattern, path):
                return route
        return None

    def _match_path(self, pattern: str, path: str) -> bool:
        # Simple pattern matching (in production, use more sophisticated routing)
        pattern_regex = pattern.replace('*', '.*').replace('{', '(?P<').replace('}', '>[^/]+)')
        return bool(re.match(f"^{pattern_regex}$", path))

    async def _apply_middleware(self, middleware: Callable, request: GatewayRequest) -> GatewayRequest:
        return await middleware(request) if asyncio.iscoroutinefunction(middleware) else middleware(request)

    async def _make_request(self, url: str, request: GatewayRequest) -> Dict[str, Any]:
        # Simulate HTTP request to target service
        return {
            'status': 200,
            'data': {'routed_to': url, 'original_path': request.path}
        }

    def get_stats(self) -> Dict[str, Any]:
        return {
            'total_routes': len(self.routes),
            'middleware_count': len(self.middleware)
        }
```

## 18. Distributed Lock Pattern

**Theory**: Coordinates access to shared resources across distributed systems.

**Code**:
```python
import time
import threading
from typing import Optional, Dict, Any
from contextlib import contextmanager

class DistributedLock:
    def __init__(self):
        self.locks: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()

    def acquire_lock(self, key: str, ttl: int = 30000) -> Optional[str]:
        lock_id = str(uuid.uuid4())
        expires_at = time.time() * 1000 + ttl  # Convert to milliseconds

        with self.lock:
            if key in self.locks:
                existing_lock = self.locks[key]
                if existing_lock['expires_at'] > time.time() * 1000:
                    return None  # Lock already held

            self.locks[key] = {
                'lock_id': lock_id,
                'expires_at': expires_at,
                'acquired_at': time.time() * 1000
            }

        return lock_id

    def release_lock(self, key: str, lock_id: str) -> bool:
        with self.lock:
            if key not in self.locks:
                return False
            
            lock_info = self.locks[key]
            if lock_info['lock_id'] == lock_id:
                del self.locks[key]
                return True
            
            return False

    @contextmanager
    def with_lock(self, key: str, ttl: int = 30000):
        lock_id = self.acquire_lock(key, ttl)
        if not lock_id:
            raise Exception(f"Could not acquire lock for key: {key}")
        
        try:
            yield lock_id
        finally:
            self.release_lock(key, lock_id)

    def is_locked(self, key: str) -> bool:
        with self.lock:
            if key not in self.locks:
                return False
            
            lock_info = self.locks[key]
            return lock_info['expires_at'] > time.time() * 1000

    def cleanup_expired_locks(self):
        current_time = time.time() * 1000
        
        with self.lock:
            expired_keys = [
                key for key, lock_info in self.locks.items()
                if lock_info['expires_at'] <= current_time
            ]
            
            for key in expired_keys:
                del self.locks[key]
        
        return len(expired_keys)
```

## 19. Idempotency Pattern

**Theory**: Ensures operations can be safely retried without side effects.

**Code**:
```python
import hashlib
import json
import time
from typing import Any, Callable, Dict, Optional

class IdempotencyService:
    def __init__(self, ttl: int = 300):  # 5 minutes default TTL
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.ttl = ttl
        self.lock = threading.Lock()

    def generate_key(self, *args, **kwargs) -> str:
        """Generate idempotency key from arguments"""
        data = {'args': args, 'kwargs': kwargs}
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(json_str.encode()).hexdigest()

    def execute_idempotent(self, key: str, operation: Callable) -> Any:
        """Execute operation idempotently"""
        with self.lock:
            # Check if result already exists and is not expired
            if key in self.cache:
                cached_entry = self.cache[key]
                if time.time() - cached_entry['timestamp'] < self.ttl:
                    return cached_entry['result']
                else:
                    # Remove expired entry
                    del self.cache[key]

        # Execute operation
        result = operation()
        
        # Cache the result
        with self.lock:
            self.cache[key] = {
                'result': result,
                'timestamp': time.time()
            }
        
        return result

    def invalidate(self, key: str) -> bool:
        """Manually invalidate a cached result"""
        with self.lock:
            return self.cache.pop(key, None) is not None

    def cleanup_expired(self) -> int:
        """Remove expired entries from cache"""
        current_time = time.time()
        expired_keys = []
        
        with self.lock:
            for key, entry in self.cache.items():
                if current_time - entry['timestamp'] >= self.ttl:
                    expired_keys.append(key)
            
            for key in expired_keys:
                del self.cache[key]
        
        return len(expired_keys)

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'cached_entries': len(self.cache),
                'ttl_seconds': self.ttl
            }

# Decorator for idempotent operations
def idempotent(ttl: int = 300):
    idempotency_service = IdempotencyService(ttl)
    
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            key = idempotency_service.generate_key(func.__name__, *args, **kwargs)
            return idempotency_service.execute_idempotent(key, lambda: func(*args, **kwargs))
        return wrapper
    return decorator
```

## 20. Materialized View Pattern

**Theory**: Pre-computed views of data for improved query performance.

**Code**:
```python
class MaterializedViewService:
    def __init__(self):
        self.views: Dict[str, Any] = {}
        self.lock = threading.Lock()

    def create_view(self, name: str, query_function: Callable, refresh_interval: int = 60):
        view = {
            'name': name,
            'query_function': query_function,
            'refresh_interval': refresh_interval,
            'data': None,
            'last_refresh': None
        }
        
        with self.lock:
            self.views[name] = view
        
        self.refresh_view(name)

    def get_view(self, name: str) -> Any:
        with self.lock:
            view = self.views.get(name)
            return view['data'] if view else None
```

## 21. Cache Warming Pattern

**Theory**: Proactively loads data into cache before it's requested.

**Code**:
```python
class CacheWarmingService:
    def __init__(self, cache):
        self.cache = cache

    def warm_cache(self, cache_specs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results = []
        for spec in cache_specs:
            try:
                data = spec['data_loader']()
                self.cache.set(spec['key'], data, spec.get('ttl', 300))
                results.append({'key': spec['key'], 'success': True})
            except Exception as e:
                results.append({'key': spec['key'], 'success': False, 'error': str(e)})
        return results
```

## 22. Blue-Green Deployment Pattern

**Theory**: Zero-downtime deployment by switching between two environments.

**Code**:
```python
class BlueGreenDeployment:
    def __init__(self):
        self.active_environment = 'blue'
        self.switch_in_progress = False
        self.environment_health = {'blue': True, 'green': True}

    def switch_traffic(self) -> str:
        if self.switch_in_progress:
            raise Exception('Switch already in progress')
        
        self.switch_in_progress = True
        previous_env = self.active_environment
        self.active_environment = 'green' if self.active_environment == 'blue' else 'blue'
        self.switch_in_progress = False
        
        return f'Switched from {previous_env} to {self.active_environment}'

    def get_status(self) -> Dict[str, Any]:
        return {
            'active_environment': self.active_environment,
            'switch_in_progress': self.switch_in_progress,
            'environment_health': self.environment_health
        }
```

## 23. Inbox Pattern

**Theory**: Ensures exactly-once message processing by tracking processed messages.

**Code**:
```python
class InboxPattern:
    def __init__(self):
        self.processed_messages: Dict[str, Any] = {}
        self.processed_count = 0
        self.lock = threading.Lock()

    def handle_message(self, message_id: str, event_data: Any) -> bool:
        with self.lock:
            if message_id in self.processed_messages:
                return False  # Already processed
            
            self.processed_messages[message_id] = event_data
            self.processed_count += 1
            return True

    def get_processed_count(self) -> int:
        return self.processed_count

    def get_pending_count(self) -> int:
        return 0  # Simplified implementation
```

## 24. Strangler Fig Pattern

**Theory**: Gradually replaces legacy systems by routing traffic to new implementations.

**Code**:
```python
class StranglerFig:
    def __init__(self):
        self.migration_rules: Dict[str, Dict[str, Any]] = {}
        self.migration_stats: Dict[str, Dict[str, int]] = {}

    def add_migration_rule(self, path: str, use_new_service: bool, percentage: int = 100):
        self.migration_rules[path] = {
            'use_new_service': use_new_service,
            'percentage': percentage
        }
        self.migration_stats[path] = {'new_service': 0, 'legacy_service': 0}

    def route_request(self, path: str, request_data: Any) -> Dict[str, Any]:
        rule = self.migration_rules.get(path, {'use_new_service': False})
        stats = self.migration_stats.get(path, {'new_service': 0, 'legacy_service': 0})
        
        if rule['use_new_service']:
            stats['new_service'] += 1
            return self._process_with_new_service(request_data)
        else:
            stats['legacy_service'] += 1
            return self._process_with_legacy_service(request_data)

    def _process_with_new_service(self, data: Any) -> Dict[str, Any]:
        return {'result': 'processed by new service', 'version': 'v2'}

    def _process_with_legacy_service(self, data: Any) -> Dict[str, Any]:
        return {'result': 'processed by legacy service', 'version': 'v1'}
```

## 25. Timeout Pattern

**Theory**: Prevents operations from running indefinitely by setting time limits.

**Code**:
```python
import asyncio
from typing import Callable, Any

class TimeoutService:
    async def execute_with_timeout(self, operation: Callable, timeout_seconds: float = 5.0) -> Any:
        try:
            return await asyncio.wait_for(operation(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            raise Exception(f'Operation timed out after {timeout_seconds} seconds')
```

## 26. Write-Behind Cache Pattern

**Theory**: Writes to cache immediately and persists to storage asynchronously.

**Code**:
```python
class WriteBehindCache:
    def __init__(self):
        self.cache: Dict[str, Any] = {}
        self.write_queue: List[Dict[str, Any]] = []
        self.processing = False
        self.lock = threading.Lock()

    def set(self, key: str, value: Any):
        with self.lock:
            self.cache[key] = value
            self.write_queue.append({
                'key': key,
                'value': value,
                'timestamp': time.time()
            })
        
        self._process_write_queue()

    def _process_write_queue(self):
        if self.processing:
            return
        
        self.processing = True
        threading.Thread(target=self._async_write, daemon=True).start()

    def _async_write(self):
        while self.write_queue:
            with self.lock:
                if not self.write_queue:
                    break
                item = self.write_queue.pop(0)
            
            try:
                self._persist_to_storage(item['key'], item['value'])
            except Exception as e:
                print(f'Write-behind failed: {e}')
        
        self.processing = False
```

## 27. Anti-Corruption Layer Pattern

**Theory**: Isolates domain model from external systems with translation layer.

**Code**:
```python
class AntiCorruptionLayer:
    def translate_from_external(self, external_data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            'id': external_data.get('external_id'),
            'name': external_data.get('display_name'),
            'status': self._map_status(external_data.get('state'))
        }

    def translate_to_external(self, domain_object: Dict[str, Any]) -> Dict[str, Any]:
        return {
            'external_id': domain_object.get('id'),
            'display_name': domain_object.get('name'),
            'state': self._map_to_external_status(domain_object.get('status'))
        }

    def _map_status(self, external_status: str) -> str:
        status_map = {
            'ACTIVE': 'active',
            'INACTIVE': 'inactive',
            'PENDING': 'pending'
        }
        return status_map.get(external_status, 'unknown')
```

## 28. Canary Deployment Pattern

**Theory**: Gradually rolls out changes to a subset of users.

**Code**:
```python
class CanaryDeployment:
    def __init__(self, canary_percentage: int = 10):
        self.canary_percentage = canary_percentage
        self.metrics = {
            'canary_requests': 0,
            'stable_requests': 0,
            'canary_errors': 0,
            'stable_errors': 0
        }

    def should_use_canary(self, context: Dict[str, Any] = None) -> bool:
        if context and context.get('user_id'):
            hash_value = hash(context['user_id']) % 100
            return hash_value < self.canary_percentage
        return False

    def process_request(self, data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        use_canary = self.should_use_canary(context)
        
        try:
            if use_canary:
                self.metrics['canary_requests'] += 1
                result = data.get('value', 0) * 3
                return {'result': result, 'version': 'v2-canary', 'canary': True}
            else:
                self.metrics['stable_requests'] += 1
                result = data.get('value', 0) * 2
                return {'result': result, 'version': 'v1-stable', 'canary': False}
        except Exception as e:
            if use_canary:
                self.metrics['canary_errors'] += 1
            else:
                self.metrics['stable_errors'] += 1
            raise e
```

## 29. Message Producer Pattern

**Theory**: Publishes messages to messaging systems for asynchronous communication.

**Code**:
```python
class MessageProducer:
    def __init__(self):
        self.topics: Dict[str, List[Callable]] = {}
        self.message_count = 0

    def publish_message(self, topic: str, message: Any):
        subscribers = self.topics.get(topic, [])
        
        for subscriber in subscribers:
            try:
                subscriber(message)
                self.message_count += 1
            except Exception as e:
                print(f'Message delivery failed: {e}')

    def subscribe(self, topic: str, callback: Callable):
        if topic not in self.topics:
            self.topics[topic] = []
        self.topics[topic].append(callback)

    def get_stats(self) -> Dict[str, Any]:
        return {
            'total_messages': self.message_count,
            'active_topics': len(self.topics)
        }
```

## 30. Event Stream Processor Pattern

**Theory**: Processes continuous streams of events in real-time.

**Code**:
```python
class EventStreamProcessor:
    def __init__(self):
        self.event_handlers: Dict[str, List[Callable]] = {}
        self.event_stats = {
            'connected': True,
            'event_counts': {}
        }

    def on_local_event(self, event_type: str, handler: Callable):
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
        self.event_handlers[event_type].append(handler)

    def publish_event(self, topic: str, event_type: str, event_data: Dict[str, Any], aggregate_id: str):
        event = {
            'id': str(uuid.uuid4()),
            'type': event_type,
            'data': event_data,
            'aggregate_id': aggregate_id,
            'timestamp': time.time()
        }

        handlers = self.event_handlers.get(event_type, [])
        for handler in handlers:
            try:
                handler(event)
                self.event_stats['event_counts'][event_type] = \
                    self.event_stats['event_counts'].get(event_type, 0) + 1
            except Exception as e:
                print(f'Event handler failed: {e}')
```

## 31. Token Bucket Rate Limiter Pattern

**Theory**: Controls request rate using token bucket algorithm.

**Code**:
```python
class TokenBucketRateLimiter:
    def __init__(self, capacity: int = 100, refill_rate: int = 10):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity
        self.last_refill = time.time()
        self.lock = threading.Lock()

    def is_allowed(self, client_id: str = None) -> bool:
        with self.lock:
            self._refill()
            
            if self.tokens >= 1:
                self.tokens -= 1
                return True
            return False

    def _refill(self):
        now = time.time()
        time_passed = now - self.last_refill
        tokens_to_add = time_passed * self.refill_rate
        
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now
```

## 32. Two-Phase Commit Pattern

**Theory**: Ensures atomicity across distributed transactions.

**Code**:
```python
class TwoPhaseCommitCoordinator:
    def __init__(self):
        self.participants: Dict[str, Any] = {}
        self.transactions: Dict[str, Dict[str, Any]] = {}

    def register_participant(self, participant_id: str, participant):
        self.participants[participant_id] = participant

    def execute_two_phase_commit(self, participant_ids: List[str], transaction_data: Any) -> Dict[str, Any]:
        transaction_id = str(uuid.uuid4())
        
        try:
            # Phase 1: Prepare
            prepare_results = []
            for participant_id in participant_ids:
                participant = self.participants.get(participant_id)
                if participant:
                    result = participant.prepare(transaction_id, transaction_data)
                    prepare_results.append(result)
                else:
                    prepare_results.append(False)
            
            all_prepared = all(prepare_results)
            
            if all_prepared:
                # Phase 2: Commit
                for participant_id in participant_ids:
                    participant = self.participants.get(participant_id)
                    if participant:
                        participant.commit(transaction_id)
                
                return {'success': True, 'transaction_id': transaction_id}
            else:
                # Abort
                for participant_id in participant_ids:
                    participant = self.participants.get(participant_id)
                    if participant:
                        participant.abort(transaction_id)
                
                return {'success': False, 'transaction_id': transaction_id}
                
        except Exception as e:
            return {'success': False, 'error': str(e), 'transaction_id': transaction_id}
```