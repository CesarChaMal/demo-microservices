"""
Feature Toggle Pattern Implementation
Runtime feature control with rollout percentages
"""
import hashlib
import time
from typing import Dict, Any, Optional

class FeatureToggle:
    def __init__(self):
        self.features = {
            'new-algorithm': {
                'enabled': True,
                'rollout_percentage': 50,
                'description': 'Enhanced calculation algorithm'
            },
            'async-processing': {
                'enabled': True,
                'description': 'Asynchronous request processing'
            },
            'canary-deployment': {
                'enabled': True,
                'rollout_percentage': 10,
                'description': 'Canary deployment for new features'
            },
            'cache-optimization': {
                'enabled': False,
                'rollout_percentage': 25,
                'description': 'Advanced caching optimizations'
            },
            'enhanced-logging': {
                'enabled': True,
                'description': 'Detailed request logging'
            }
        }
        self.usage_stats = {}
    
    def is_enabled(self, feature_name: str, context: Optional[Dict[str, Any]] = None) -> bool:
        """Check if a feature is enabled for the given context"""
        feature = self.features.get(feature_name, {'enabled': False})
        
        if not feature.get('enabled', False):
            self._record_usage(feature_name, False, 'disabled')
            return False
        
        rollout_percentage = feature.get('rollout_percentage', 100)
        
        if rollout_percentage < 100 and context:
            # Use consistent hashing for user-based rollout
            user_id = context.get('user_id', context.get('request_id', ''))
            if user_id:
                hash_value = int(hashlib.md5(f"{feature_name}:{user_id}".encode()).hexdigest(), 16) % 100
                enabled = hash_value < rollout_percentage
                self._record_usage(feature_name, enabled, 'rollout')
                return enabled
        
        self._record_usage(feature_name, True, 'enabled')
        return True
    
    def enable_feature(self, feature_name: str, rollout_percentage: int = 100):
        """Enable a feature with optional rollout percentage"""
        if feature_name in self.features:
            self.features[feature_name]['enabled'] = True
            self.features[feature_name]['rollout_percentage'] = rollout_percentage
        else:
            self.features[feature_name] = {
                'enabled': True,
                'rollout_percentage': rollout_percentage,
                'description': f'Feature {feature_name}'
            }
    
    def disable_feature(self, feature_name: str):
        """Disable a feature"""
        if feature_name in self.features:
            self.features[feature_name]['enabled'] = False
    
    def set_rollout_percentage(self, feature_name: str, percentage: int):
        """Set rollout percentage for a feature"""
        if feature_name in self.features:
            self.features[feature_name]['rollout_percentage'] = max(0, min(100, percentage))
    
    def get_feature_status(self, feature_name: str) -> Dict[str, Any]:
        """Get detailed status of a feature"""
        feature = self.features.get(feature_name, {})
        stats = self.usage_stats.get(feature_name, {})
        
        return {
            'name': feature_name,
            'enabled': feature.get('enabled', False),
            'rollout_percentage': feature.get('rollout_percentage', 100),
            'description': feature.get('description', ''),
            'usage_stats': stats
        }
    
    def get_all_features(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all features"""
        return {name: self.get_feature_status(name) for name in self.features.keys()}
    
    def _record_usage(self, feature_name: str, enabled: bool, reason: str):
        """Record feature usage statistics"""
        if feature_name not in self.usage_stats:
            self.usage_stats[feature_name] = {
                'total_checks': 0,
                'enabled_count': 0,
                'disabled_count': 0,
                'last_checked': None,
                'reasons': {}
            }
        
        stats = self.usage_stats[feature_name]
        stats['total_checks'] += 1
        stats['last_checked'] = time.time()
        
        if enabled:
            stats['enabled_count'] += 1
        else:
            stats['disabled_count'] += 1
        
        stats['reasons'][reason] = stats['reasons'].get(reason, 0) + 1

class FeatureToggleService:
    def __init__(self):
        self.toggle = FeatureToggle()
    
    def process_with_features(self, data: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process data with feature toggles"""
        value = data.get('value', 0)
        result = value
        features_used = []
        
        # Check new algorithm feature
        if self.toggle.is_enabled('new-algorithm', context):
            result = value * 3  # Enhanced algorithm
            features_used.append('new-algorithm')
        else:
            result = value * 2  # Standard algorithm
        
        # Check async processing feature
        async_enabled = self.toggle.is_enabled('async-processing', context)
        if async_enabled:
            features_used.append('async-processing')
        
        # Check cache optimization feature
        cache_optimized = self.toggle.is_enabled('cache-optimization', context)
        if cache_optimized:
            features_used.append('cache-optimization')
        
        # Check enhanced logging feature
        enhanced_logging = self.toggle.is_enabled('enhanced-logging', context)
        
        response = {
            'result': result,
            'features_used': features_used,
            'async_processing': async_enabled,
            'cache_optimized': cache_optimized,
            'timestamp': time.time()
        }
        
        if enhanced_logging:
            response['debug_info'] = {
                'input_value': value,
                'processing_mode': 'enhanced' if 'new-algorithm' in features_used else 'standard',
                'context': context
            }
        
        return response