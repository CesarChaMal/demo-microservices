const EventEmitter = require('events');

class BlueGreenDeployment extends EventEmitter {
    constructor() {
        super();
        this.activeEnvironment = 'blue';
        this.environments = {
            blue: { status: 'active', version: 'v1.0', healthy: true, traffic: 100 },
            green: { status: 'standby', version: 'v1.1', healthy: false, traffic: 0 }
        };
        this.switchHistory = [];
    }

    async switchTraffic() {
        const standbyEnv = this.activeEnvironment === 'blue' ? 'green' : 'blue';
        
        // Health check standby environment
        const isHealthy = await this.healthCheck(standbyEnv);
        if (!isHealthy) {
            throw new Error(`Standby environment ${standbyEnv} is not healthy`);
        }

        // Record switch
        const switchRecord = {
            from: this.activeEnvironment,
            to: standbyEnv,
            timestamp: Date.now(),
            reason: 'manual_switch'
        };

        // Switch traffic
        this.environments[this.activeEnvironment].status = 'standby';
        this.environments[this.activeEnvironment].traffic = 0;
        this.environments[standbyEnv].status = 'active';
        this.environments[standbyEnv].traffic = 100;

        const previousActive = this.activeEnvironment;
        this.activeEnvironment = standbyEnv;
        
        this.switchHistory.push(switchRecord);
        this.emit('traffic-switched', switchRecord);

        return {
            previousActive,
            newActive: this.activeEnvironment,
            switchedAt: switchRecord.timestamp,
            environments: this.getStatus()
        };
    }

    async healthCheck(environment) {
        try {
            // Simulate health check with configurable health status
            const env = this.environments[environment];
            return env && env.healthy;
        } catch (error) {
            console.error(`Health check failed for ${environment}:`, error);
            return false;
        }
    }

    setEnvironmentHealth(environment, healthy) {
        if (this.environments[environment]) {
            this.environments[environment].healthy = healthy;
            this.emit('health-changed', { environment, healthy });
        }
    }

    getStatus() {
        return {
            activeEnvironment: this.activeEnvironment,
            environments: { ...this.environments },
            switchHistory: this.switchHistory.slice(-10) // Last 10 switches
        };
    }

    async rollback() {
        if (this.switchHistory.length === 0) {
            throw new Error('No previous deployment to rollback to');
        }

        const lastSwitch = this.switchHistory[this.switchHistory.length - 1];
        const rollbackTo = lastSwitch.from;

        // Health check rollback target
        const isHealthy = await this.healthCheck(rollbackTo);
        if (!isHealthy) {
            throw new Error(`Cannot rollback to unhealthy environment: ${rollbackTo}`);
        }

        return await this.switchTraffic();
    }

    getMetrics() {
        return {
            activeEnvironment: this.activeEnvironment,
            totalSwitches: this.switchHistory.length,
            lastSwitch: this.switchHistory[this.switchHistory.length - 1],
            environmentHealth: {
                blue: this.environments.blue.healthy,
                green: this.environments.green.healthy
            }
        };
    }
}

module.exports = BlueGreenDeployment;