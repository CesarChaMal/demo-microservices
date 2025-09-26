"""
Reactive Streams Pattern Implementation
Provides reactive programming capabilities for data stream processing.
"""

import asyncio
import time
from typing import Any, Callable, List, Optional, AsyncGenerator

class ReactiveStream:
    """Reactive stream for processing data"""
    
    def __init__(self, source: AsyncGenerator):
        self.source = source
        self.operators = []
    
    @classmethod
    async def from_iterable(cls, items: List[Any]):
        """Create stream from iterable"""
        async def generator():
            for item in items:
                yield item
        return cls(generator())
    
    @classmethod
    async def interval(cls, seconds: float, count: Optional[int] = None):
        """Create stream that emits at intervals"""
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
            async for item in self.source:
                yield mapper(item)
        return ReactiveStream(mapped_generator())
    
    def filter(self, predicate: Callable):
        """Filter elements"""
        async def filtered_generator():
            async for item in self.source:
                if predicate(item):
                    yield item
        return ReactiveStream(filtered_generator())
    
    def take(self, count: int):
        """Take first N elements"""
        async def take_generator():
            taken = 0
            async for item in self.source:
                if taken >= count:
                    break
                yield item
                taken += 1
        return ReactiveStream(take_generator())
    
    async def subscribe(self, observer: dict):
        """Subscribe to stream"""
        try:
            async for item in self.source:
                if 'next' in observer:
                    observer['next'](item)
            
            if 'complete' in observer:
                observer['complete']()
        except Exception as e:
            if 'error' in observer:
                observer['error'](e)