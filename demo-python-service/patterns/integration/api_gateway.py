"""
API Gateway Pattern Implementation
Provides centralized entry point for all client requests with routing, authentication, and cross-cutting concerns.
"""

import time
import uuid
import logging
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass
from flask import request
import requests

logger = logging.getLogger(__name__)

@dataclass
class Route:
    path_pattern: str
    target_service: str
    target_path: str
    methods: List[str]
    auth_required: bool = True
    rate_limit: Optional[int] = None
    timeout: int = 30

@dataclass
class GatewayRequest:
    path: str
    method: str
    headers: Dict[str, str]
    query_params: Dict[str, str]
    body: Any
    client_ip: str
    timestamp: float

class APIGateway:
    def __init__(self):
        self.routes = {}
        self.middleware = []
        self.service_registry = {
            'java-service': 'http://java-service:8080',
            'node-service': 'http://node-service:3000',
            'python-service': 'http://python-service:5001'
        }
        self.request_count = 0
        self.error_count = 0
        
    def add_route(self, route: Route):
        """Add a route to the gateway"""
        self.routes[route.path_pattern] = route
        
    def add_middleware(self, middleware_func: Callable):
        """Add middleware function"""
        self.middleware.append(middleware_func)
        
    def route_request(self, gateway_request: GatewayRequest) -> Dict[str, Any]:
        """Route request to appropriate service"""
        self.request_count += 1
        
        try:
            # Find matching route
            route = self._find_route(gateway_request.path, gateway_request.method)
            if not route:
                return self._error_response(404, "Route not found")
            
            # Apply middleware
            for middleware in self.middleware:
                result = middleware(gateway_request, route)
                if result:  # Middleware returned error response
                    return result
            
            # Forward request to target service
            return self._forward_request(gateway_request, route)
            
        except Exception as e:
            self.error_count += 1
            logger.error(f"Gateway error: {str(e)}")
            return self._error_response(500, "Internal gateway error")
    
    def _find_route(self, path: str, method: str) -> Optional[Route]:
        """Find matching route for path and method"""
        for pattern, route in self.routes.items():
            if self._path_matches(path, pattern) and method in route.methods:
                return route
        return None
    
    def _path_matches(self, path: str, pattern: str) -> bool:
        """Simple path matching (can be enhanced with regex)"""
        if pattern == path:
            return True
        if pattern.endswith('/**'):
            prefix = pattern[:-3]
            return path.startswith(prefix)
        return False
    
    def _forward_request(self, gateway_request: GatewayRequest, route: Route) -> Dict[str, Any]:
        """Forward request to target service"""
        target_url = self.service_registry.get(route.target_service)
        if not target_url:
            return self._error_response(503, "Service unavailable")
        
        # Build target URL
        target_path = route.target_path or gateway_request.path
        full_url = f"{target_url}{target_path}"
        
        # Prepare headers
        headers = dict(gateway_request.headers)
        headers['X-Gateway-Request-ID'] = str(uuid.uuid4())
        headers['X-Forwarded-For'] = gateway_request.client_ip
        
        try:
            # Make request to target service
            response = requests.request(
                method=gateway_request.method,
                url=full_url,
                headers=headers,
                params=gateway_request.query_params,
                json=gateway_request.body if gateway_request.method in ['POST', 'PUT', 'PATCH'] else None,
                timeout=route.timeout
            )
            
            return {
                'status_code': response.status_code,
                'headers': dict(response.headers),
                'body': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text,
                'gateway_metadata': {
                    'route': route.path_pattern,
                    'target_service': route.target_service,
                    'processing_time': time.time() - gateway_request.timestamp
                }
            }
            
        except requests.exceptions.Timeout:
            return self._error_response(504, "Gateway timeout")
        except requests.exceptions.ConnectionError:
            return self._error_response(503, "Service unavailable")
        except Exception as e:
            logger.error(f"Forward request error: {str(e)}")
            return self._error_response(500, "Gateway error")
    
    def _error_response(self, status_code: int, message: str) -> Dict[str, Any]:
        """Create error response"""
        return {
            'status_code': status_code,
            'headers': {'Content-Type': 'application/json'},
            'body': {
                'error': message,
                'timestamp': time.time(),
                'gateway': 'python-service'
            }
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get gateway statistics"""
        return {
            'total_requests': self.request_count,
            'error_count': self.error_count,
            'error_rate': (self.error_count / self.request_count * 100) if self.request_count > 0 else 0,
            'routes_count': len(self.routes),
            'services': list(self.service_registry.keys())
        }

# Middleware functions
def auth_middleware(gateway_request: GatewayRequest, route: Route) -> Optional[Dict[str, Any]]:
    """Authentication middleware"""
    if not route.auth_required:
        return None
    
    auth_header = gateway_request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return {
            'status_code': 401,
            'headers': {'Content-Type': 'application/json'},
            'body': {'error': 'Authentication required'}
        }
    
    # Simple token validation (enhance with JWT validation)
    token = auth_header[7:]  # Remove 'Bearer '
    if not token or len(token) < 10:
        return {
            'status_code': 401,
            'headers': {'Content-Type': 'application/json'},
            'body': {'error': 'Invalid token'}
        }
    
    return None

def rate_limit_middleware(gateway_request: GatewayRequest, route: Route) -> Optional[Dict[str, Any]]:
    """Rate limiting middleware"""
    if not route.rate_limit:
        return None
    
    # Simple rate limiting (enhance with Redis-based implementation)
    client_key = f"rate_limit:{gateway_request.client_ip}:{route.path_pattern}"
    # In production, use Redis with sliding window
    
    return None

def logging_middleware(gateway_request: GatewayRequest, route: Route) -> Optional[Dict[str, Any]]:
    """Request logging middleware"""
    logger.info(f"Gateway request: {gateway_request.method} {gateway_request.path} -> {route.target_service}")
    return None

# Anti-Corruption Layer Pattern
class AntiCorruptionLayer:
    """Translates between different domain models and external systems"""
    
    def __init__(self):
        self.translators = {}
    
    def add_translator(self, service_name: str, translator_func: Callable):
        """Add translator for specific service"""
        self.translators[service_name] = translator_func
    
    def translate_request(self, service_name: str, request_data: Any) -> Any:
        """Translate request to service-specific format"""
        translator = self.translators.get(service_name)
        if translator:
            return translator(request_data, 'request')
        return request_data
    
    def translate_response(self, service_name: str, response_data: Any) -> Any:
        """Translate response from service-specific format"""
        translator = self.translators.get(service_name)
        if translator:
            return translator(response_data, 'response')
        return response_data

# Legacy system translator
def legacy_translator(data: Any, direction: str) -> Any:
    """Translate between modern and legacy formats"""
    if direction == 'request':
        # Modern -> Legacy
        if isinstance(data, dict) and 'value' in data:
            return {
                'legacy_value': data['value'],
                'legacy_type': data.get('algorithm', 'default'),
                'legacy_timestamp': int(time.time())
            }
    else:
        # Legacy -> Modern
        if isinstance(data, dict) and 'legacy_result' in data:
            return {
                'result': data['legacy_result'],
                'algorithm': data.get('legacy_type', 'default'),
                'source': 'legacy-system'
            }
    return data

# Strangler Fig Pattern
class StranglerFig:
    """Gradually replace legacy system by intercepting and routing calls"""
    
    def __init__(self):
        self.legacy_client = None  # Legacy system client
        self.modern_client = None  # Modern system client
        self.migration_rules = {}
        
    def add_migration_rule(self, path_pattern: str, use_modern: bool, percentage: int = 100):
        """Add rule for migrating specific endpoints"""
        self.migration_rules[path_pattern] = {
            'use_modern': use_modern,
            'percentage': percentage
        }
    
    def route_request(self, path: str, request_data: Any) -> Any:
        """Route request to legacy or modern system based on rules"""
        rule = self._find_migration_rule(path)
        
        if rule and rule['use_modern']:
            if rule['percentage'] == 100 or self._should_use_modern(rule['percentage']):
                return self._call_modern_system(request_data)
        
        return self._call_legacy_system(request_data)
    
    def _find_migration_rule(self, path: str) -> Optional[Dict[str, Any]]:
        """Find migration rule for path"""
        for pattern, rule in self.migration_rules.items():
            if path.startswith(pattern):
                return rule
        return None
    
    def _should_use_modern(self, percentage: int) -> bool:
        """Determine if should use modern system based on percentage"""
        import random
        return random.randint(1, 100) <= percentage
    
    def _call_modern_system(self, request_data: Any) -> Any:
        """Call modern system"""
        # Implementation depends on modern system client
        return {'result': 'modern', 'data': request_data}
    
    def _call_legacy_system(self, request_data: Any) -> Any:
        """Call legacy system"""
        # Implementation depends on legacy system client
        return {'result': 'legacy', 'data': request_data}