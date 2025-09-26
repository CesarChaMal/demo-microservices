"""
Specification Pattern Implementation
Encapsulates business rules and criteria
"""

from abc import ABC, abstractmethod
from typing import Any, Dict

class Specification(ABC):
    """Base specification class"""
    
    @abstractmethod
    def is_satisfied_by(self, candidate: Any) -> bool:
        pass
    
    def and_spec(self, other: 'Specification') -> 'AndSpecification':
        return AndSpecification(self, other)
    
    def or_spec(self, other: 'Specification') -> 'OrSpecification':
        return OrSpecification(self, other)
    
    def not_spec(self) -> 'NotSpecification':
        return NotSpecification(self)

class AndSpecification(Specification):
    def __init__(self, left: Specification, right: Specification):
        self.left = left
        self.right = right
    
    def is_satisfied_by(self, candidate: Any) -> bool:
        return self.left.is_satisfied_by(candidate) and self.right.is_satisfied_by(candidate)

class OrSpecification(Specification):
    def __init__(self, left: Specification, right: Specification):
        self.left = left
        self.right = right
    
    def is_satisfied_by(self, candidate: Any) -> bool:
        return self.left.is_satisfied_by(candidate) or self.right.is_satisfied_by(candidate)

class NotSpecification(Specification):
    def __init__(self, spec: Specification):
        self.spec = spec
    
    def is_satisfied_by(self, candidate: Any) -> bool:
        return not self.spec.is_satisfied_by(candidate)

class ActiveUserSpecification(Specification):
    def is_satisfied_by(self, user: Dict[str, Any]) -> bool:
        return user.get('active', False) is True

class PremiumUserSpecification(Specification):
    def is_satisfied_by(self, user: Dict[str, Any]) -> bool:
        return user.get('subscription_type') == 'premium'

class MinAgeSpecification(Specification):
    def __init__(self, min_age: int):
        self.min_age = min_age
    
    def is_satisfied_by(self, user: Dict[str, Any]) -> bool:
        return user.get('age', 0) >= self.min_age

class SpecificationService:
    """Service for managing business rule evaluations"""
    
    def __init__(self):
        self.metrics = {
            'evaluations': 0,
            'satisfied': 0,
            'not_satisfied': 0
        }
    
    def evaluate(self, specification: Specification, candidate: Any) -> bool:
        self.metrics['evaluations'] += 1
        result = specification.is_satisfied_by(candidate)
        
        if result:
            self.metrics['satisfied'] += 1
        else:
            self.metrics['not_satisfied'] += 1
        
        return result
    
    def filter_candidates(self, specification: Specification, candidates: list) -> list:
        return [c for c in candidates if self.evaluate(specification, c)]
    
    def get_stats(self) -> Dict[str, Any]:
        total = self.metrics['evaluations']
        return {
            'total_evaluations': total,
            'satisfied': self.metrics['satisfied'],
            'not_satisfied': self.metrics['not_satisfied'],
            'satisfaction_rate': (self.metrics['satisfied'] / total * 100) if total > 0 else 0
        }

# Global instances
specification_service = SpecificationService()
active_user_spec = ActiveUserSpecification()
premium_user_spec = PremiumUserSpecification()
adult_user_spec = MinAgeSpecification(18)