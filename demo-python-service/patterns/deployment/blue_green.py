import time
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class BlueGreenDeployment:
    def __init__(self):
        self.active_environment = 'blue'
        self.environments = {
            'blue': {
                'status': 'active',
                'version': 'v1.0',
                'healthy': True,
                'deployed_at': time.time(),
                'requests_served': 0
            },
            'green': {
                'status': 'standby',
                'version': 'v1.1',
                'healthy': False,
                'deployed_at': None,
                'requests_served': 0
            }
        }
        self.switch_history = []
        
    def deploy_to_standby(self, version: str) -> Dict[str, Any]:
        """Deploy new version to standby environment"""
        standby_env = 'green' if self.active_environment == 'blue' else 'blue'
        
        self.environments[standby_env].update({
            'version': version,
            'deployed_at': time.time(),
            'healthy': False,  # Will be set to True after health checks
            'requests_served': 0
        })
        
        logger.info(f"Deployed version {version} to {standby_env} environment")
        
        return {
            'environment': standby_env,
            'version': version,
            'status': 'deployed',
            'deployed_at': self.environments[standby_env]['deployed_at']
        }
        
    def switch_traffic(self) -> Dict[str, Any]:
        """Switch traffic from active to standby environment"""
        standby_env = 'green' if self.active_environment == 'blue' else 'blue'
        
        # Health check standby environment
        if not self.health_check(standby_env):
            raise Exception(f"Standby environment {standby_env} is not healthy")
            
        # Record switch
        switch_record = {
            'from_environment': self.active_environment,
            'to_environment': standby_env,
            'from_version': self.environments[self.active_environment]['version'],
            'to_version': self.environments[standby_env]['version'],
            'switched_at': time.time()
        }
        
        # Switch traffic
        self.environments[self.active_environment]['status'] = 'standby'
        self.environments[standby_env]['status'] = 'active'
        
        previous_active = self.active_environment
        self.active_environment = standby_env
        
        self.switch_history.append(switch_record)
        
        logger.info(f"Traffic switched from {previous_active} to {self.active_environment}")
        
        return {
            'previous_active': previous_active,
            'new_active': self.active_environment,
            'switched_at': switch_record['switched_at'],
            'version_change': {
                'from': switch_record['from_version'],
                'to': switch_record['to_version']
            }
        }
        
    def rollback(self) -> Dict[str, Any]:
        """Rollback to previous environment"""
        if not self.switch_history:
            raise Exception("No previous deployment to rollback to")
            
        last_switch = self.switch_history[-1]
        previous_env = last_switch['from_environment']
        
        # Ensure previous environment is healthy
        if not self.health_check(previous_env):
            raise Exception(f"Previous environment {previous_env} is not healthy for rollback")
            
        # Switch back
        self.environments[self.active_environment]['status'] = 'standby'
        self.environments[previous_env]['status'] = 'active'
        
        rollback_record = {
            'from_environment': self.active_environment,
            'to_environment': previous_env,
            'rolled_back_at': time.time(),
            'reason': 'manual_rollback'
        }
        
        self.active_environment = previous_env
        
        logger.info(f"Rolled back to {self.active_environment} environment")
        
        return rollback_record
        
    def health_check(self, environment: str) -> bool:
        """Check health of an environment"""
        try:
            env_config = self.environments.get(environment)
            if not env_config:
                return False
                
            # Simulate health check logic
            # In real implementation, this would check actual service health
            healthy = env_config.get('healthy', False)
            
            if healthy:
                logger.info(f"Environment {environment} is healthy")
            else:
                logger.warning(f"Environment {environment} is not healthy")
                
            return healthy
            
        except Exception as e:
            logger.error(f"Health check failed for {environment}: {e}")
            return False
            
    def set_environment_health(self, environment: str, healthy: bool):
        """Set health status of an environment (for testing/simulation)"""
        if environment in self.environments:
            self.environments[environment]['healthy'] = healthy
            logger.info(f"Set {environment} environment health to {healthy}")
            
    def process_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process request with current active environment"""
        active_env = self.environments[self.active_environment]
        active_env['requests_served'] += 1
        
        # Simulate different processing based on version
        version = active_env['version']
        value = request_data.get('value', 0)
        
        if version.startswith('v1.1'):
            # New version with enhanced processing
            result = value * 3
            algorithm = 'enhanced'
        else:
            # Original version
            result = value * 2
            algorithm = 'standard'
            
        return {
            'result': result,
            'algorithm': algorithm,
            'version': version,
            'environment': self.active_environment,
            'processed_at': time.time()
        }
        
    def get_status(self) -> Dict[str, Any]:
        """Get current deployment status"""
        return {
            'active_environment': self.active_environment,
            'environments': self.environments,
            'switch_history': self.switch_history[-5:],  # Last 5 switches
            'total_switches': len(self.switch_history)
        }