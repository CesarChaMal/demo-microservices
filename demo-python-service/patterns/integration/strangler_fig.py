"""
Strangler Fig Pattern Implementation
Gradually replaces legacy system with new implementation
"""

import time
from typing import Dict, Any, Optional

class StranglerFigService:
    """Gradually migrates from legacy to new system"""
    
    def __init__(self):
        self.migration_percentage = 0
        self.metrics = {
            'legacy_calls': 0,
            'new_calls': 0,
            'total_calls': 0
        }
    
    def process_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Route request to legacy or new system based on migration percentage"""
        self.metrics['total_calls'] += 1
        
        # Simple routing based on percentage
        if (self.metrics['total_calls'] % 100) < self.migration_percentage:
            return self._new_system_process(request_data)
        else:
            return self._legacy_system_process(request_data)
    
    def _legacy_system_process(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Legacy system processing"""
        self.metrics['legacy_calls'] += 1
        time.sleep(0.1)  # Simulate slower legacy processing
        return {
            'result': request_data.get('value', 0) * 2,
            'source': 'legacy',
            'processing_time': 100
        }
    
    def _new_system_process(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """New system processing"""
        self.metrics['new_calls'] += 1
        time.sleep(0.05)  # Simulate faster new processing
        return {
            'result': request_data.get('value', 0) * 2,
            'source': 'new',
            'processing_time': 50
        }
    
    def set_migration_percentage(self, percentage: int):
        """Set percentage of traffic to route to new system"""
        self.migration_percentage = max(0, min(100, percentage))
    
    def get_stats(self) -> Dict[str, Any]:
        """Get migration statistics"""
        total = self.metrics['total_calls']
        return {
            'migration_percentage': self.migration_percentage,
            'total_calls': total,
            'legacy_calls': self.metrics['legacy_calls'],
            'new_calls': self.metrics['new_calls'],
            'legacy_percentage': (self.metrics['legacy_calls'] / total * 100) if total > 0 else 0,
            'new_percentage': (self.metrics['new_calls'] / total * 100) if total > 0 else 0
        }

# Global instance
strangler_fig_service = StranglerFigService()