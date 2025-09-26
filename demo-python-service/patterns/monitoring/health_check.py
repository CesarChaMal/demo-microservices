"""Health Check and Monitoring Patterns"""
import time
import threading
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum
import psutil
import redis
from prometheus_client import Counter, Histogram, Gauge, generate_latest

class HealthStatus(Enum):
    UP = "UP"
    DOWN = "DOWN"
    DEGRADED = "DEGRADED"

@dataclass
class HealthCheck:
    name: str
    status: HealthStatus
    details: Dict[str, Any]
    response_time: float

class HealthIndicator:
    def __init__(self, name: str):
        self.name = name
    
    def check_health(self) -> HealthCheck:
        """Override this method in subclasses"""
        raise NotImplementedError

class RedisHealthIndicator(HealthIndicator):
    def __init__(self, redis_host: str = 'localhost', redis_port: int = 6379):
        super().__init__("redis")
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
    
    def check_health(self) -> HealthCheck:
        start_time = time.time()
        try:
            # Test Redis connection
            self.redis_client.ping()
            info = self.redis_client.info()
            
            response_time = time.time() - start_time
            
            return HealthCheck(
                name=self.name,
                status=HealthStatus.UP,
                details={
                    "version": info.get("redis_version"),
                    "connected_clients": info.get("connected_clients"),
                    "used_memory": info.get("used_memory_human"),
                    "response_time_ms": round(response_time * 1000, 2)
                },
                response_time=response_time
            )
        except Exception as e:
            response_time = time.time() - start_time
            return HealthCheck(
                name=self.name,
                status=HealthStatus.DOWN,
                details={"error": str(e)},
                response_time=response_time
            )

class SystemHealthIndicator(HealthIndicator):
    def __init__(self):
        super().__init__("system")
    
    def check_health(self) -> HealthCheck:
        start_time = time.time()
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Determine status based on resource usage
            status = HealthStatus.UP
            if cpu_percent > 90 or memory.percent > 90 or disk.percent > 90:
                status = HealthStatus.DEGRADED
            
            response_time = time.time() - start_time
            
            return HealthCheck(
                name=self.name,
                status=status,
                details={
                    "cpu_percent": cpu_percent,
                    "memory_percent": memory.percent,
                    "disk_percent": disk.percent,
                    "available_memory_mb": round(memory.available / 1024 / 1024, 2)
                },
                response_time=response_time
            )
        except Exception as e:
            response_time = time.time() - start_time
            return HealthCheck(
                name=self.name,
                status=HealthStatus.DOWN,
                details={"error": str(e)},
                response_time=response_time
            )

class CircuitBreakerHealthIndicator(HealthIndicator):
    def __init__(self, circuit_breakers: Dict[str, Any]):
        super().__init__("circuit_breakers")
        self.circuit_breakers = circuit_breakers
    
    def check_health(self) -> HealthCheck:
        start_time = time.time()
        details = {}
        overall_status = HealthStatus.UP
        
        for name, cb in self.circuit_breakers.items():
            if hasattr(cb, 'state'):
                state = cb.state.name if hasattr(cb.state, 'name') else str(cb.state)
                details[f"{name}_state"] = state
                if state == "OPEN":
                    overall_status = HealthStatus.DEGRADED
        
        response_time = time.time() - start_time
        
        return HealthCheck(
            name=self.name,
            status=overall_status,
            details=details,
            response_time=response_time
        )

class HealthCheckService:
    def __init__(self):
        self.indicators: List[HealthIndicator] = []
        self.last_check_time = None
        self.cached_health = None
        self.cache_ttl = 30  # Cache health checks for 30 seconds
    
    def add_indicator(self, indicator: HealthIndicator):
        """Add health indicator"""
        self.indicators.append(indicator)
    
    def get_health(self, use_cache: bool = True) -> Dict[str, Any]:
        """Get overall health status"""
        now = time.time()
        
        # Use cache if available and not expired
        if (use_cache and self.cached_health and self.last_check_time and 
            now - self.last_check_time < self.cache_ttl):
            return self.cached_health
        
        health_checks = []
        overall_status = HealthStatus.UP
        total_response_time = 0
        
        # Run all health checks
        for indicator in self.indicators:
            try:
                check = indicator.check_health()
                health_checks.append(check)
                total_response_time += check.response_time
                
                # Determine overall status
                if check.status == HealthStatus.DOWN:
                    overall_status = HealthStatus.DOWN
                elif check.status == HealthStatus.DEGRADED and overall_status != HealthStatus.DOWN:
                    overall_status = HealthStatus.DEGRADED
                    
            except Exception as e:
                # If health check itself fails
                health_checks.append(HealthCheck(
                    name=indicator.name,
                    status=HealthStatus.DOWN,
                    details={"error": f"Health check failed: {str(e)}"},
                    response_time=0
                ))
                overall_status = HealthStatus.DOWN
        
        # Build response
        health_response = {
            "status": overall_status.value,
            "timestamp": now,
            "total_response_time_ms": round(total_response_time * 1000, 2),
            "checks": {
                check.name: {
                    "status": check.status.value,
                    "details": check.details,
                    "response_time_ms": round(check.response_time * 1000, 2)
                }
                for check in health_checks
            }
        }
        
        # Cache result
        self.cached_health = health_response
        self.last_check_time = now
        
        return health_response

class MetricsService:
    def __init__(self):
        # Prometheus metrics
        self.request_count = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint', 'status'])
        self.request_duration = Histogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'endpoint'])
        self.active_connections = Gauge('active_connections', 'Active connections')
        self.processing_time = Histogram('processing_time_seconds', 'Processing time', ['operation'])
        
        # Custom metrics
        self.custom_metrics = {}
        self.start_time = time.time()
    
    def record_request(self, method: str, endpoint: str, status_code: int, duration: float):
        """Record HTTP request metrics"""
        self.request_count.labels(method=method, endpoint=endpoint, status=str(status_code)).inc()
        self.request_duration.labels(method=method, endpoint=endpoint).observe(duration)
    
    def record_processing_time(self, operation: str, duration: float):
        """Record processing time"""
        self.processing_time.labels(operation=operation).observe(duration)
    
    def set_active_connections(self, count: int):
        """Set active connections gauge"""
        self.active_connections.set(count)
    
    def increment_custom_metric(self, name: str, value: float = 1.0):
        """Increment custom metric"""
        if name not in self.custom_metrics:
            self.custom_metrics[name] = Counter(f'custom_{name}', f'Custom metric: {name}')
        self.custom_metrics[name].inc(value)
    
    def get_metrics(self) -> str:
        """Get Prometheus metrics"""
        return generate_latest().decode('utf-8')
    
    def get_application_metrics(self) -> Dict[str, Any]:
        """Get application-specific metrics"""
        uptime = time.time() - self.start_time
        return {
            "uptime_seconds": round(uptime, 2),
            "uptime_human": self._format_uptime(uptime),
            "custom_metrics": list(self.custom_metrics.keys())
        }
    
    def _format_uptime(self, seconds: float) -> str:
        """Format uptime in human readable format"""
        days = int(seconds // 86400)
        hours = int((seconds % 86400) // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{days}d {hours}h {minutes}m {secs}s"

class MaterializedViewService:
    def __init__(self, redis_host: str = 'localhost', redis_port: int = 6379):
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
        self.request_count = 0
        self.success_count = 0
        self.error_count = 0
        self._lock = threading.Lock()
        
        # Start background update thread
        self._start_background_update()
    
    def record_request(self, success: bool):
        """Record request for materialized view"""
        with self._lock:
            self.request_count += 1
            if success:
                self.success_count += 1
            else:
                self.error_count += 1
    
    def get_current_stats(self) -> Dict[str, Any]:
        """Get current statistics from materialized view"""
        try:
            stats = self.redis_client.hgetall("materialized:stats")
            if stats:
                return {
                    "total_requests": int(stats.get("total_requests", 0)),
                    "successful_requests": int(stats.get("successful_requests", 0)),
                    "error_requests": int(stats.get("error_requests", 0)),
                    "success_rate": float(stats.get("success_rate", 0.0)),
                    "last_updated": stats.get("last_updated")
                }
        except redis.RedisError:
            pass
        
        return {"error": "Stats not available"}
    
    def _start_background_update(self):
        """Start background thread to update materialized view"""
        def update_worker():
            while True:
                try:
                    with self._lock:
                        total = self.request_count
                        success = self.success_count
                        errors = self.error_count
                    
                    success_rate = (success / total * 100) if total > 0 else 0.0
                    
                    stats = {
                        "total_requests": total,
                        "successful_requests": success,
                        "error_requests": errors,
                        "success_rate": success_rate,
                        "last_updated": time.time()
                    }
                    
                    self.redis_client.hmset("materialized:stats", stats)
                    
                except Exception as e:
                    print(f"Error updating materialized view: {e}")
                
                time.sleep(60)  # Update every minute
        
        update_thread = threading.Thread(target=update_worker, daemon=True)
        update_thread.start()