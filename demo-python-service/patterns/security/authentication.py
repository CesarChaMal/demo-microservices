"""
Authentication Pattern Implementation
Provides token-based authentication and authorization.
"""

import time
import jwt
import hashlib
from typing import Dict, Any, Optional

class AuthenticationService:
    """Simple JWT-based authentication"""
    
    def __init__(self, secret_key: str = None):
        import os
        self.secret_key = secret_key or os.getenv('JWT_SECRET', 'demo-secret-change-in-production')
        self.algorithm = "HS256"
    
    def generate_token(self, user_id: str, roles: list = None) -> str:
        """Generate JWT token"""
        payload = {
            'user_id': user_id,
            'roles': roles or [],
            'exp': time.time() + 3600,  # 1 hour
            'iat': time.time()
        }
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def validate_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Validate JWT token"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
    
    def has_role(self, token_payload: Dict[str, Any], required_role: str) -> bool:
        """Check if user has required role"""
        user_roles = token_payload.get('roles', [])
        return required_role in user_roles

def auth_required(roles: list = None):
    """Decorator for authentication"""
    def decorator(f):
        def wrapper(*args, **kwargs):
            from flask import request, jsonify, g
            
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({'error': 'Authentication required'}), 401
            
            token = auth_header[7:]
            auth_service = AuthenticationService()
            payload = auth_service.validate_token(token)
            
            if not payload:
                return jsonify({'error': 'Invalid token'}), 401
            
            if roles:
                for role in roles:
                    if not auth_service.has_role(payload, role):
                        return jsonify({'error': 'Insufficient permissions'}), 403
            
            g.user = payload
            return f(*args, **kwargs)
        return wrapper
    return decorator