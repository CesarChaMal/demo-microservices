"""
Canary Deployment Pattern Implementation
Traffic splitting with metrics and rollback capability
"""
import hashlib
import time
from typing import Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class CanaryMetrics:
    canary_requests: int = 0
    stable_requests: int = 0
    canary_errors: int = 0
    stable_errors: int = 0
    canary_response_times: list = None
    stable_response_times: list = None
    
    def __post_init__(self):
        if self.canary_response_times is None:
            self.canary_response_times = []
        if self.stable_response_times is None:
            self.stable_response_times = []

class CanaryDeployment:
    def __init__(self, canary_percentage: int = 10, max_error_rate: float = 0.05):
        self.canary_percentage = canary_percentage
        self.max_error_rate = max_error_rate
        self.metrics = CanaryMetrics()
        self.enabled = True
        self.auto_rollback = True
        self.rollback_threshold = 10  # Number of errors before rollback
    
    def should_use_canary(self, context: Optional[Dict[str, Any]] = None) -> bool:
        """Determine if request should use canary version"""
        if not self.enabled:
            return False
        
        # Check if we should rollback due to high error rate
        if self.auto_rollback and self._should_rollback():
            self.enabled = False
            return False
        
        if context and context.get('user_id'):
            # Consistent user-based routing
            user_id = str(context['user_id'])
            hash_value = int(hashlib.md5(f"canary:{user_id}".encode()).hexdigest(), 16) % 100
            return hash_value < self.canary_percentage
        
        # Random routing if no user context
        import random
        return random.randint(0, 99) < self.canary_percentage
    
    def process_request(self, data: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process request with canary deployment logic"""
        start_time = time.time()
        use_canary = self.should_use_canary(context)
        
        try:
            if use_canary:
                result = self._process_canary_version(data)
                self.metrics.canary_requests += 1
                response_time = time.time() - start_time
                self.metrics.canary_response_times.append(response_time)
                
                return {
                    **result,
                    'version': 'v2-canary',
                    'canary': True,
                    'response_time': response_time
                }
            else:
                result = self._process_stable_version(data)
                self.metrics.stable_requests += 1
                response_time = time.time() - start_time
                self.metrics.stable_response_times.append(response_time)
                
                return {
                    **result,
                    'version': 'v1-stable',
                    'canary': False,
                    'response_time': response_time
                }
        
        except Exception as e:
            if use_canary:
                self.metrics.canary_errors += 1
            else:
                self.metrics.stable_errors += 1
            
            # Return error response
            return {
                'error': str(e),
                'version': 'v2-canary' if use_canary else 'v1-stable',
                'canary': use_canary,
                'response_time': time.time() - start_time
            }
    
    def _process_canary_version(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process with canary (new) version"""
        value = data.get('value', 0)
        
        # Enhanced algorithm with additional features
        result = value * 3 + 1  # New calculation
        
        return {
            'result': result,
            'algorithm': 'enhanced-v2',
            'features': ['optimization', 'caching', 'validation']
        }
    
    def _process_stable_version(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process with stable (current) version"""
        value = data.get('value', 0)
        
        # Standard algorithm
        result = value * 2  # Current calculation
        
        return {
            'result': result,
            'algorithm': 'standard-v1',
            'features': ['basic']
        }
    
    def _should_rollback(self) -> bool:
        """Check if canary should be rolled back due to high error rate"""
        if self.metrics.canary_requests < 10:  # Need minimum requests
            return False
        
        canary_error_rate = self.metrics.canary_errors / self.metrics.canary_requests
        stable_error_rate = (self.metrics.stable_errors / self.metrics.stable_requests 
                           if self.metrics.stable_requests > 0 else 0)
        
        # Rollback if canary error rate is significantly higher
        return (canary_error_rate > self.max_error_rate or 
                canary_error_rate > stable_error_rate * 2)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get deployment metrics"""
        total_requests = self.metrics.canary_requests + self.metrics.stable_requests
        total_errors = self.metrics.canary_errors + self.metrics.stable_errors
        
        canary_error_rate = (self.metrics.canary_errors / self.metrics.canary_requests 
                           if self.metrics.canary_requests > 0 else 0)
        stable_error_rate = (self.metrics.stable_errors / self.metrics.stable_requests 
                           if self.metrics.stable_requests > 0 else 0)
        
        # Calculate average response times
        avg_canary_time = (sum(self.metrics.canary_response_times) / len(self.metrics.canary_response_times)
                          if self.metrics.canary_response_times else 0)
        avg_stable_time = (sum(self.metrics.stable_response_times) / len(self.metrics.stable_response_times)
                          if self.metrics.stable_response_times else 0)
        
        return {
            'canary_enabled': self.enabled,
            'canary_percentage': self.canary_percentage,
            'total_requests': total_requests,
            'canary_requests': self.metrics.canary_requests,
            'stable_requests': self.metrics.stable_requests,
            'canary_errors': self.metrics.canary_errors,
            'stable_errors': self.metrics.stable_errors,
            'canary_error_rate': canary_error_rate,
            'stable_error_rate': stable_error_rate,
            'avg_canary_response_time': avg_canary_time,
            'avg_stable_response_time': avg_stable_time,
            'should_rollback': self._should_rollback()
        }
    
    def set_canary_percentage(self, percentage: int):
        """Update canary traffic percentage"""
        self.canary_percentage = max(0, min(100, percentage))
    
    def enable_canary(self):
        """Enable canary deployment"""
        self.enabled = True
    
    def disable_canary(self):
        """Disable canary deployment (rollback)"""
        self.enabled = False
    
    def reset_metrics(self):
        """Reset all metrics"""
        self.metrics = CanaryMetrics()