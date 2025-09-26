"""
Materialized View Pattern Implementation
Pre-computed views for complex queries
"""
import threading
import time
from typing import Dict, Any, List, Callable
import logging

logger = logging.getLogger(__name__)

class MaterializedViewService:
    def __init__(self):
        self.views: Dict[str, Dict[str, Any]] = {}
        self.refresh_intervals: Dict[str, int] = {}
        self.refresh_threads: Dict[str, threading.Thread] = {}
        self.metrics = {
            'view_hits': 0,
            'refreshes': 0,
            'refresh_errors': 0
        }
        
    def create_view(self, name: str, query_func: Callable, refresh_interval: int = 300):
        """Create materialized view with refresh function"""
        self.views[name] = {'data': None, 'last_refresh': 0, 'query_func': query_func}
        self.refresh_intervals[name] = refresh_interval
        
        # Initial refresh
        self._refresh_view(name)
        
        # Start refresh thread
        thread = threading.Thread(target=self._auto_refresh, args=(name,), daemon=True)
        thread.start()
        self.refresh_threads[name] = thread
        
        logger.info(f"Created materialized view: {name}")
        
    def get_view(self, name: str) -> Any:
        """Get materialized view data"""
        if name not in self.views:
            raise ValueError(f"View {name} not found")
            
        self.metrics['view_hits'] += 1
        return self.views[name]['data']
        
    def _refresh_view(self, name: str):
        """Refresh materialized view"""
        try:
            view = self.views[name]
            new_data = view['query_func']()
            view['data'] = new_data
            view['last_refresh'] = time.time()
            self.metrics['refreshes'] += 1
            logger.info(f"Refreshed materialized view: {name}")
        except Exception as e:
            self.metrics['refresh_errors'] += 1
            logger.error(f"Failed to refresh view {name}: {e}")
            
    def _auto_refresh(self, name: str):
        """Auto-refresh view in background"""
        while name in self.views:
            time.sleep(self.refresh_intervals[name])
            if name in self.views:  # Check again in case view was deleted
                self._refresh_view(name)
                
    def force_refresh(self, name: str):
        """Force immediate refresh of view"""
        if name in self.views:
            self._refresh_view(name)
            
    def delete_view(self, name: str):
        """Delete materialized view"""
        if name in self.views:
            del self.views[name]
            del self.refresh_intervals[name]
            if name in self.refresh_threads:
                del self.refresh_threads[name]
            logger.info(f"Deleted materialized view: {name}")
            
    def get_metrics(self) -> Dict[str, Any]:
        """Get materialized view metrics"""
        return {
            'total_views': len(self.views),
            'view_hits': self.metrics['view_hits'],
            'refreshes': self.metrics['refreshes'],
            'refresh_errors': self.metrics['refresh_errors'],
            'views': {name: {
                'last_refresh': view['last_refresh'],
                'has_data': view['data'] is not None
            } for name, view in self.views.items()}
        }

# Global instance
materialized_view_service = MaterializedViewService()

# Example views
def _sample_user_stats():
    """Sample query function for user statistics"""
    return {'total_users': 1000, 'active_users': 750, 'last_updated': time.time()}

def _sample_order_summary():
    """Sample query function for order summary"""
    return {'total_orders': 500, 'pending_orders': 25, 'last_updated': time.time()}

# Initialize sample views
materialized_view_service.create_view('user_stats', _sample_user_stats, 600)
materialized_view_service.create_view('order_summary', _sample_order_summary, 300)