"""
Hexagonal Architecture Pattern Implementation
Ports and Adapters pattern for clean architecture
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Any
import time

@dataclass
class ProcessingRequest:
    value: int
    algorithm: str = 'default'
    timestamp: float = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()

@dataclass
class ProcessingResult:
    result: int
    status: str
    algorithm: str
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

# Domain Port (Interface)
class ProcessingPort(ABC):
    @abstractmethod
    def process(self, request: ProcessingRequest) -> ProcessingResult:
        pass

# Domain Service (Core Business Logic)
class ProcessingService(ProcessingPort):
    def __init__(self):
        self.algorithms = {
            'default': lambda x: x * 2,
            'triple': lambda x: x * 3,
            'square': lambda x: x * x,
            'fibonacci': self._fibonacci,
            'factorial': self._factorial
        }
    
    def process(self, request: ProcessingRequest) -> ProcessingResult:
        self._validate(request)
        
        algorithm_func = self.algorithms.get(request.algorithm, self.algorithms['default'])
        result = algorithm_func(request.value)
        
        processing_time = time.time() - request.timestamp
        
        return ProcessingResult(
            result=result,
            status='SUCCESS',
            algorithm=request.algorithm,
            metadata={
                'processing_time': processing_time,
                'input_value': request.value,
                'processed_at': time.time()
            }
        )
    
    def _validate(self, request: ProcessingRequest):
        if request.value is None:
            raise ValueError("Value cannot be None")
        if not isinstance(request.value, int):
            raise ValueError("Value must be an integer")
        if request.value < 0:
            raise ValueError("Value must be non-negative")
    
    def _fibonacci(self, n):
        if n <= 1:
            return n
        return self._fibonacci(n-1) + self._fibonacci(n-2)
    
    def _factorial(self, n):
        if n <= 1:
            return 1
        return n * self._factorial(n-1)

# Adapter (Infrastructure)
class FlaskProcessingAdapter:
    def __init__(self, processing_service: ProcessingPort):
        self.processing_service = processing_service
    
    def handle_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            processing_request = ProcessingRequest(
                value=request_data.get('value'),
                algorithm=request_data.get('algorithm', 'default')
            )
            
            result = self.processing_service.process(processing_request)
            
            return {
                'result': result.result,
                'status': result.status,
                'algorithm': result.algorithm,
                'metadata': result.metadata
            }
        except Exception as e:
            return {
                'error': str(e),
                'status': 'ERROR',
                'algorithm': request_data.get('algorithm', 'unknown')
            }