/**
 * Canary Deployment Pattern Implementation
 * Traffic splitting with metrics and rollback capability
 */
const crypto = require('crypto');

class CanaryMetrics {
    constructor() {
        this.canaryRequests = 0;
        this.stableRequests = 0;
        this.canaryErrors = 0;
        this.stableErrors = 0;
        this.canaryResponseTimes = [];
        this.stableResponseTimes = [];
    }

    reset() {
        this.canaryRequests = 0;
        this.stableRequests = 0;
        this.canaryErrors = 0;
        this.stableErrors = 0;
        this.canaryResponseTimes = [];
        this.stableResponseTimes = [];
    }
}

class CanaryDeployment {
    constructor(canaryPercentage = 10, maxErrorRate = 0.05) {
        this.canaryPercentage = canaryPercentage;
        this.maxErrorRate = maxErrorRate;
        this.metrics = new CanaryMetrics();
        this.enabled = true;
        this.autoRollback = true;
        this.rollbackThreshold = 10; // Number of errors before rollback
    }

    shouldUseCanary(context = {}) {
        if (!this.enabled) {
            return false;
        }

        // Check if we should rollback due to high error rate
        if (this.autoRollback && this._shouldRollback()) {
            this.enabled = false;
            console.log('Canary deployment disabled due to high error rate');
            return false;
        }

        if (context.userId) {
            // Consistent user-based routing
            const hash = crypto.createHash('md5')
                .update(`canary:${context.userId}`)
                .digest('hex');
            const hashValue = parseInt(hash.substring(0, 8), 16) % 100;
            return hashValue < this.canaryPercentage;
        }

        // Random routing if no user context
        return Math.floor(Math.random() * 100) < this.canaryPercentage;
    }

    async processRequest(data, context = {}) {
        const startTime = Date.now();
        const useCanary = this.shouldUseCanary(context);

        try {
            let result;
            if (useCanary) {
                result = await this._processCanaryVersion(data);
                this.metrics.canaryRequests++;
                const responseTime = Date.now() - startTime;
                this.metrics.canaryResponseTimes.push(responseTime);

                return {
                    ...result,
                    version: 'v2-canary',
                    canary: true,
                    responseTime
                };
            } else {
                result = await this._processStableVersion(data);
                this.metrics.stableRequests++;
                const responseTime = Date.now() - startTime;
                this.metrics.stableResponseTimes.push(responseTime);

                return {
                    ...result,
                    version: 'v1-stable',
                    canary: false,
                    responseTime
                };
            }
        } catch (error) {
            if (useCanary) {
                this.metrics.canaryErrors++;
            } else {
                this.metrics.stableErrors++;
            }

            // Return error response
            return {
                error: error.message,
                version: useCanary ? 'v2-canary' : 'v1-stable',
                canary: useCanary,
                responseTime: Date.now() - startTime
            };
        }
    }

    async _processCanaryVersion(data) {
        // Enhanced algorithm with additional features
        const value = data.value || 0;
        
        // Simulate some processing time
        await this._sleep(Math.random() * 50);
        
        // New calculation with enhancements
        const result = value * 3 + 1;

        return {
            result,
            algorithm: 'enhanced-v2',
            features: ['optimization', 'caching', 'validation'],
            enhancement: 'improved-performance'
        };
    }

    async _processStableVersion(data) {
        // Standard algorithm
        const value = data.value || 0;
        
        // Simulate some processing time
        await this._sleep(Math.random() * 30);
        
        // Current calculation
        const result = value * 2;

        return {
            result,
            algorithm: 'standard-v1',
            features: ['basic']
        };
    }

    _shouldRollback() {
        if (this.metrics.canaryRequests < 10) { // Need minimum requests
            return false;
        }

        const canaryErrorRate = this.metrics.canaryErrors / this.metrics.canaryRequests;
        const stableErrorRate = this.metrics.stableRequests > 0 
            ? this.metrics.stableErrors / this.metrics.stableRequests 
            : 0;

        // Rollback if canary error rate is significantly higher
        return canaryErrorRate > this.maxErrorRate || 
               canaryErrorRate > stableErrorRate * 2;
    }

    getMetrics() {
        const totalRequests = this.metrics.canaryRequests + this.metrics.stableRequests;
        const totalErrors = this.metrics.canaryErrors + this.metrics.stableErrors;

        const canaryErrorRate = this.metrics.canaryRequests > 0 
            ? this.metrics.canaryErrors / this.metrics.canaryRequests 
            : 0;
        const stableErrorRate = this.metrics.stableRequests > 0 
            ? this.metrics.stableErrors / this.metrics.stableRequests 
            : 0;

        // Calculate average response times
        const avgCanaryTime = this.metrics.canaryResponseTimes.length > 0
            ? this.metrics.canaryResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.canaryResponseTimes.length
            : 0;
        const avgStableTime = this.metrics.stableResponseTimes.length > 0
            ? this.metrics.stableResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.stableResponseTimes.length
            : 0;

        return {
            canaryEnabled: this.enabled,
            canaryPercentage: this.canaryPercentage,
            totalRequests,
            canaryRequests: this.metrics.canaryRequests,
            stableRequests: this.metrics.stableRequests,
            canaryErrors: this.metrics.canaryErrors,
            stableErrors: this.metrics.stableErrors,
            canaryErrorRate,
            stableErrorRate,
            avgCanaryResponseTime: avgCanaryTime,
            avgStableResponseTime: avgStableTime,
            shouldRollback: this._shouldRollback(),
            timestamp: Date.now()
        };
    }

    setCanaryPercentage(percentage) {
        this.canaryPercentage = Math.max(0, Math.min(100, percentage));
    }

    enableCanary() {
        this.enabled = true;
        console.log('Canary deployment enabled');
    }

    disableCanary() {
        this.enabled = false;
        console.log('Canary deployment disabled (rollback)');
    }

    resetMetrics() {
        this.metrics.reset();
        console.log('Canary metrics reset');
    }

    // Health check for canary deployment
    getHealthStatus() {
        const metrics = this.getMetrics();
        const isHealthy = !metrics.shouldRollback && metrics.canaryErrorRate <= this.maxErrorRate;

        return {
            healthy: isHealthy,
            status: this.enabled ? 'ACTIVE' : 'DISABLED',
            canaryPercentage: this.canaryPercentage,
            errorRate: metrics.canaryErrorRate,
            maxErrorRate: this.maxErrorRate,
            autoRollback: this.autoRollback,
            metrics: metrics
        };
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Middleware for Express.js
function canaryMiddleware(canaryDeployment) {
    return async (req, res, next) => {
        req.canaryDeployment = canaryDeployment;
        req.useCanary = canaryDeployment.shouldUseCanary({
            userId: req.headers['x-user-id'] || req.ip,
            requestId: req.headers['x-request-id']
        });
        next();
    };
}

module.exports = {
    CanaryDeployment,
    CanaryMetrics,
    canaryMiddleware
};