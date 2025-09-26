"""
Repository Pattern Implementation
Provides abstraction layer for data access operations.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Generic, TypeVar
import uuid
import time

T = TypeVar('T')

class Repository(ABC, Generic[T]):
    """Abstract repository interface"""
    
    @abstractmethod
    def save(self, entity: T) -> T:
        pass
    
    @abstractmethod
    def find_by_id(self, entity_id: str) -> Optional[T]:
        pass
    
    @abstractmethod
    def find_all(self) -> List[T]:
        pass
    
    @abstractmethod
    def delete(self, entity_id: str) -> bool:
        pass

class ProcessedDataEntity:
    """Domain entity for processed data"""
    
    def __init__(self, request_id: str, value: int, result: int, algorithm: str):
        self.request_id = request_id
        self.value = value
        self.result = result
        self.algorithm = algorithm
        self.created_at = time.time()
        self.updated_at = time.time()

class InMemoryProcessedDataRepository(Repository[ProcessedDataEntity]):
    """In-memory implementation of processed data repository"""
    
    def __init__(self):
        self.data = {}
    
    def save(self, entity: ProcessedDataEntity) -> ProcessedDataEntity:
        entity.updated_at = time.time()
        self.data[entity.request_id] = entity
        return entity
    
    def find_by_id(self, entity_id: str) -> Optional[ProcessedDataEntity]:
        return self.data.get(entity_id)
    
    def find_all(self) -> List[ProcessedDataEntity]:
        return list(self.data.values())
    
    def delete(self, entity_id: str) -> bool:
        if entity_id in self.data:
            del self.data[entity_id]
            return True
        return False
    
    def find_by_algorithm(self, algorithm: str) -> List[ProcessedDataEntity]:
        return [entity for entity in self.data.values() if entity.algorithm == algorithm]

class Specification(ABC):
    """Specification pattern for complex queries"""
    
    @abstractmethod
    def is_satisfied_by(self, entity: Any) -> bool:
        pass

class ValueGreaterThanSpecification(Specification):
    """Specification for values greater than threshold"""
    
    def __init__(self, threshold: int):
        self.threshold = threshold
    
    def is_satisfied_by(self, entity: ProcessedDataEntity) -> bool:
        return entity.result > self.threshold

class AlgorithmSpecification(Specification):
    """Specification for specific algorithm"""
    
    def __init__(self, algorithm: str):
        self.algorithm = algorithm
    
    def is_satisfied_by(self, entity: ProcessedDataEntity) -> bool:
        return entity.algorithm == self.algorithm