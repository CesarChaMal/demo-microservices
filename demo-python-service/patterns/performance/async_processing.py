"""
Async Processing and Performance Patterns Implementation
Handles long-running operations without blocking, provides reactive streams and backpressure handling.
"""

import asyncio
import time
import uuid
import threading
from typing import Dict, Any, List, Optional, Callable, AsyncGenerator
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, Future
from queue import Queue, Empty
import logging

logger = logging.getLogger(__name__)

@dataclass
class AsyncTask:
    task_id: str
    operation: Callable
    priority: int = 0
    created_at: float = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    status: str = 'pending'  # pending, running, completed, failed
    result: Any = None
    error: Optional[str] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()

class AsyncProcessor:
    """Handles asynchronous processing with thread pools and task management"""
    
    def __init__(self, max_workers: int = 5, max_queue_size: int = 100):
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.tasks = {}
        self.task_queue = Queue(maxsize=max_queue_size)
        self.max_queue_size = max_queue_size
        self.stats = {
            'total_tasks': 0,
            'completed_tasks': 0,
            'failed_tasks': 0,
            'active_tasks': 0
        }
        self._running = True
        self._worker_thread = threading.Thread(target=self._process_tasks, daemon=True)
        self._worker_thread.start()
    
    def submit_task(self, operation: Callable, priority: int = 0) -> str:
        """Submit task for async processing"""
        task_id = str(uuid.uuid4())
        task = AsyncTask(task_id=task_id, operation=operation, priority=priority)
        
        try:
            self.task_queue.put(task, block=False)
            self.tasks[task_id] = task
            self.stats['total_tasks'] += 1
            return task_id
        except:
            raise Exception("Task queue is full")
    
    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get status of specific task"""
        task = self.tasks.get(task_id)
        if not task:
            return None
        
        return {
            'task_id': task.task_id,
            'status': task.status,
            'priority': task.priority,
            'created_at': task.created_at,
            'started_at': task.started_at,
            'completed_at': task.completed_at,
            'duration': (task.completed_at - task.started_at) if task.started_at and task.completed_at else None,
            'result': task.result,
            'error': task.error
        }
    
    def _process_tasks(self):
        """Background worker to process tasks"""
        while self._running:
            try:
                task = self.task_queue.get(timeout=1)
                self._execute_task(task)
            except Empty:
                continue
            except Exception as e:
                logger.error(f"Task processing error: {str(e)}")
    
    def _execute_task(self, task: AsyncTask):
        """Execute individual task"""
        task.status = 'running'
        task.started_at = time.time()
        self.stats['active_tasks'] += 1
        
        try:
            future = self.executor.submit(task.operation)
            task.result = future.result()
            task.status = 'completed'
            task.completed_at = time.time()
            self.stats['completed_tasks'] += 1
        except Exception as e:
            task.status = 'failed'
            task.error = str(e)
            task.completed_at = time.time()
            self.stats['failed_tasks'] += 1
        finally:
            self.stats['active_tasks'] -= 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processor statistics"""
        return {
            **self.stats,
            'queue_size': self.task_queue.qsize(),
            'max_queue_size': self.max_queue_size,
            'success_rate': (self.stats['completed_tasks'] / self.stats['total_tasks'] * 100) if self.stats['total_tasks'] > 0 else 0
        }
    
    def shutdown(self):
        """Shutdown processor"""
        self._running = False
        self.executor.shutdown(wait=True)

class ReactiveStream:
    """Reactive stream implementation for data processing"""
    
    def __init__(self, data_source: AsyncGenerator):
        self.data_source = data_source
        self.operators = []
        self.subscribers = []
    
    @classmethod
    def from_iterable(cls, items: List[Any]):
        """Create stream from iterable"""
        async def generator():
            for item in items:
                yield item
        return cls(generator())
    
    @classmethod
    def interval(cls, seconds: float, count: Optional[int] = None):
        """Create stream that emits values at intervals"""
        async def generator():
            i = 0
            while count is None or i < count:
                yield i
                await asyncio.sleep(seconds)
                i += 1
        return cls(generator())
    
    def map(self, mapper: Callable):
        """Transform each element"""
        async def mapped_generator():
            async for item in self.data_source:
                yield mapper(item)
        return ReactiveStream(mapped_generator())
    
    def filter(self, predicate: Callable):
        """Filter elements based on predicate"""
        async def filtered_generator():
            async for item in self.data_source:
                if predicate(item):
                    yield item
        return ReactiveStream(filtered_generator())
    
    def take(self, count: int):
        """Take only first N elements"""
        async def take_generator():
            taken = 0
            async for item in self.data_source:
                if taken >= count:
                    break
                yield item
                taken += 1
        return ReactiveStream(take_generator())
    
    def buffer(self, size: int):
        """Buffer elements into batches"""
        async def buffer_generator():
            buffer = []
            async for item in self.data_source:
                buffer.append(item)
                if len(buffer) >= size:
                    yield buffer
                    buffer = []
            if buffer:
                yield buffer
        return ReactiveStream(buffer_generator())
    
    async def subscribe(self, observer: Dict[str, Callable]):
        """Subscribe to stream with observer callbacks"""
        try:
            async for item in self.data_source:
                if 'next' in observer:
                    observer['next'](item)
            
            if 'complete' in observer:
                observer['complete']()
        except Exception as e:
            if 'error' in observer:
                observer['error'](e)

class BackpressureHandler:
    """Handles backpressure in reactive streams"""
    
    def __init__(self, buffer_size: int = 1000, strategy: str = 'drop'):
        self.buffer_size = buffer_size
        self.strategy = strategy  # drop, block, error
        self.buffer = Queue(maxsize=buffer_size)
        self.dropped_count = 0
        self.blocked_count = 0
    
    def handle_item(self, item: Any) -> bool:
        """Handle item with backpressure strategy"""
        try:
            if self.strategy == 'drop':
                try:
                    self.buffer.put(item, block=False)
                    return True
                except:
                    self.dropped_count += 1
                    return False
            
            elif self.strategy == 'block':
                self.buffer.put(item, block=True)
                self.blocked_count += 1
                return True
            
            elif self.strategy == 'error':
                self.buffer.put(item, block=False)
                return True
            
        except Exception as e:
            if self.strategy == 'error':
                raise Exception(f"Backpressure buffer full: {str(e)}")
            return False
    
    def get_item(self, timeout: Optional[float] = None) -> Optional[Any]:
        """Get item from buffer"""
        try:
            return self.buffer.get(timeout=timeout)
        except Empty:
            return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get backpressure statistics"""
        return {
            'buffer_size': self.buffer.qsize(),
            'max_buffer_size': self.buffer_size,
            'dropped_count': self.dropped_count,
            'blocked_count': self.blocked_count,
            'strategy': self.strategy
        }

class WorkerPool:
    """Pool of workers for parallel processing"""
    
    def __init__(self, worker_count: int = 4, queue_size: int = 100):
        self.worker_count = worker_count
        self.work_queue = Queue(maxsize=queue_size)
        self.workers = []
        self.stats = {
            'processed_items': 0,
            'failed_items': 0,
            'active_workers': 0
        }
        self._running = True
        self._start_workers()
    
    def _start_workers(self):
        """Start worker threads"""
        for i in range(self.worker_count):
            worker = threading.Thread(target=self._worker_loop, args=(i,), daemon=True)
            worker.start()
            self.workers.append(worker)
    
    def _worker_loop(self, worker_id: int):
        """Worker thread loop"""
        while self._running:
            try:
                work_item = self.work_queue.get(timeout=1)
                self.stats['active_workers'] += 1
                
                try:
                    work_item['function'](*work_item['args'], **work_item['kwargs'])
                    self.stats['processed_items'] += 1
                except Exception as e:
                    self.stats['failed_items'] += 1
                    logger.error(f"Worker {worker_id} error: {str(e)}")
                finally:
                    self.stats['active_workers'] -= 1
                    
            except Empty:
                continue
            except Exception as e:
                logger.error(f"Worker {worker_id} loop error: {str(e)}")
    
    def submit_work(self, function: Callable, *args, **kwargs) -> bool:
        """Submit work to pool"""
        work_item = {
            'function': function,
            'args': args,
            'kwargs': kwargs
        }
        
        try:
            self.work_queue.put(work_item, block=False)
            return True
        except:
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get worker pool statistics"""
        return {
            **self.stats,
            'worker_count': self.worker_count,
            'queue_size': self.work_queue.qsize(),
            'success_rate': (self.stats['processed_items'] / (self.stats['processed_items'] + self.stats['failed_items']) * 100) if (self.stats['processed_items'] + self.stats['failed_items']) > 0 else 0
        }
    
    def shutdown(self):
        """Shutdown worker pool"""
        self._running = False
        for worker in self.workers:
            worker.join(timeout=5)

# Async context manager for resource management
class AsyncResourceManager:
    """Manages async resources with proper cleanup"""
    
    def __init__(self):
        self.resources = {}
        self.cleanup_tasks = []
    
    async def acquire_resource(self, resource_id: str, factory: Callable) -> Any:
        """Acquire resource asynchronously"""
        if resource_id not in self.resources:
            resource = await factory()
            self.resources[resource_id] = resource
        return self.resources[resource_id]
    
    async def release_resource(self, resource_id: str, cleanup_func: Optional[Callable] = None):
        """Release resource"""
        if resource_id in self.resources:
            resource = self.resources.pop(resource_id)
            if cleanup_func:
                await cleanup_func(resource)
    
    async def cleanup_all(self):
        """Cleanup all resources"""
        for cleanup_task in self.cleanup_tasks:
            try:
                await cleanup_task
            except Exception as e:
                logger.error(f"Cleanup error: {str(e)}")
        
        self.resources.clear()
        self.cleanup_tasks.clear()

# Performance monitoring
class PerformanceMonitor:
    """Monitors performance metrics for async operations"""
    
    def __init__(self):
        self.metrics = {
            'operation_times': {},
            'operation_counts': {},
            'error_counts': {}
        }
    
    def record_operation(self, operation_name: str, duration: float, success: bool = True):
        """Record operation metrics"""
        if operation_name not in self.metrics['operation_times']:
            self.metrics['operation_times'][operation_name] = []
            self.metrics['operation_counts'][operation_name] = 0
            self.metrics['error_counts'][operation_name] = 0
        
        self.metrics['operation_times'][operation_name].append(duration)
        self.metrics['operation_counts'][operation_name] += 1
        
        if not success:
            self.metrics['error_counts'][operation_name] += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get performance statistics"""
        stats = {}
        
        for operation in self.metrics['operation_times']:
            times = self.metrics['operation_times'][operation]
            if times:
                stats[operation] = {
                    'count': self.metrics['operation_counts'][operation],
                    'errors': self.metrics['error_counts'][operation],
                    'avg_time': sum(times) / len(times),
                    'min_time': min(times),
                    'max_time': max(times),
                    'error_rate': (self.metrics['error_counts'][operation] / self.metrics['operation_counts'][operation] * 100) if self.metrics['operation_counts'][operation] > 0 else 0
                }
        
        return stats