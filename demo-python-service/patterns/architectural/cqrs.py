"""
CQRS Pattern Implementation
Command Query Responsibility Segregation
"""
import uuid
import time
from typing import Dict, Any, List
from dataclasses import dataclass

@dataclass
class Command:
    command_type: str
    payload: Dict[str, Any]
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        self.id = str(uuid.uuid4())
        self.timestamp = time.time()

@dataclass
class Query:
    query_type: str
    parameters: Dict[str, Any]
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        self.id = str(uuid.uuid4())

class CommandHandler:
    def __init__(self, cache_service=None):
        self.cache_service = cache_service or {}
        self.handlers = {
            'PROCESS_DATA': self._handle_process_data,
            'CACHE_RESULT': self._handle_cache_result,
            'UPDATE_STATISTICS': self._handle_update_statistics
        }
    
    def handle(self, command: Command):
        handler = self.handlers.get(command.command_type)
        if not handler:
            raise ValueError(f"No handler for command: {command.command_type}")
        return handler(command)
    
    def _handle_process_data(self, command: Command):
        value = command.payload.get('value')
        request_id = command.payload.get('request_id', str(uuid.uuid4()))
        
        result = value * 2  # Simple processing
        
        # Store in cache for queries
        if hasattr(self.cache_service, 'set'):
            self.cache_service.set(request_id, {
                'result': result,
                'processed_at': time.time(),
                'command_id': command.id
            })
        else:
            self.cache_service[request_id] = {
                'result': result,
                'processed_at': time.time(),
                'command_id': command.id
            }
        
        return {'request_id': request_id, 'result': result, 'status': 'PROCESSED'}
    
    def _handle_cache_result(self, command: Command):
        key = command.payload.get('key')
        value = command.payload.get('value')
        ttl = command.payload.get('ttl', 3600)
        
        if hasattr(self.cache_service, 'setex'):
            self.cache_service.setex(key, ttl, value)
        else:
            self.cache_service[key] = value
        
        return {'key': key, 'cached': True}
    
    def _handle_update_statistics(self, command: Command):
        stats_key = 'processing_stats'
        current_stats = self.cache_service.get(stats_key, {
            'total_processed': 0,
            'last_updated': time.time()
        })
        
        current_stats['total_processed'] += 1
        current_stats['last_updated'] = time.time()
        
        self.cache_service[stats_key] = current_stats
        return current_stats

class QueryHandler:
    def __init__(self, cache_service=None, read_model=None):
        self.cache_service = cache_service or {}
        self.read_model = read_model or {}
        self.handlers = {
            'GET_PROCESSED_DATA': self._handle_get_processed_data,
            'GET_STATISTICS': self._handle_get_statistics,
            'GET_ALL_RESULTS': self._handle_get_all_results
        }
    
    def handle(self, query: Query):
        handler = self.handlers.get(query.query_type)
        if not handler:
            raise ValueError(f"No handler for query: {query.query_type}")
        return handler(query)
    
    def _handle_get_processed_data(self, query: Query):
        request_id = query.parameters.get('request_id')
        if not request_id:
            raise ValueError("request_id is required")
        
        if hasattr(self.cache_service, 'get'):
            data = self.cache_service.get(request_id)
        else:
            data = self.cache_service.get(request_id)
        
        return data or {'error': 'Data not found'}
    
    def _handle_get_statistics(self, query: Query):
        stats_key = 'processing_stats'
        stats = self.cache_service.get(stats_key, {
            'total_processed': 0,
            'last_updated': None
        })
        
        return {
            'statistics': stats,
            'query_time': time.time()
        }
    
    def _handle_get_all_results(self, query: Query):
        limit = query.parameters.get('limit', 10)
        offset = query.parameters.get('offset', 0)
        
        # Simulate getting all results from read model
        all_results = []
        if hasattr(self.cache_service, 'keys'):
            keys = list(self.cache_service.keys())
            for key in keys[offset:offset + limit]:
                if key != 'processing_stats':
                    result = self.cache_service.get(key)
                    if result:
                        all_results.append({'id': key, **result})
        
        return {
            'results': all_results,
            'total': len(all_results),
            'limit': limit,
            'offset': offset
        }

class CQRSService:
    def __init__(self, cache_service=None):
        self.command_handler = CommandHandler(cache_service)
        self.query_handler = QueryHandler(cache_service)
    
    def execute_command(self, command_type: str, payload: Dict[str, Any]):
        command = Command(command_type=command_type, payload=payload)
        return self.command_handler.handle(command)
    
    def execute_query(self, query_type: str, parameters: Dict[str, Any]):
        query = Query(query_type=query_type, parameters=parameters)
        return self.query_handler.handle(query)