const EventEmitter = require('events');

class TimeoutService extends EventEmitter {
    constructor(defaultTimeout = 5000) {
        super();
        this.defaultTimeout = defaultTimeout;
        this.stats = {
            totalRequests: 0,
            timeoutRequests: 0,
            completedRequests: 0,
            averageResponseTime: 0
        };
    }

    async withTimeout(promise, timeoutMs = this.defaultTimeout, timeoutMessage = 'Operation timed out') {
        const startTime = Date.now();
        this.stats.totalRequests++;

        try {
            const result = await Promise.race([
                promise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
                )
            ]);

            const responseTime = Date.now() - startTime;
            this.stats.completedRequests++;
            this.updateAverageResponseTime(responseTime);
            
            this.emit('request-completed', { 
                responseTime, 
                timeoutMs,
                result 
            });

            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            if (error.message === timeoutMessage) {
                this.stats.timeoutRequests++;
                this.emit('request-timeout', { 
                    timeoutMs, 
                    actualTime: responseTime 
                });
            } else {
                this.emit('request-error', { 
                    error, 
                    responseTime 
                });
            }
            
            throw error;
        }
    }

    updateAverageResponseTime(responseTime) {
        if (this.stats.completedRequests === 1) {
            this.stats.averageResponseTime = responseTime;
        } else {
            this.stats.averageResponseTime = 
                (this.stats.averageResponseTime * (this.stats.completedRequests - 1) + responseTime) / 
                this.stats.completedRequests;
        }
    }

    // Utility method for HTTP requests
    async httpWithTimeout(requestFn, timeoutMs = this.defaultTimeout) {
        return this.withTimeout(
            requestFn(),
            timeoutMs,
            `HTTP request timed out after ${timeoutMs}ms`
        );
    }

    // Utility method for database operations
    async dbWithTimeout(dbOperation, timeoutMs = this.defaultTimeout) {
        return this.withTimeout(
            dbOperation(),
            timeoutMs,
            `Database operation timed out after ${timeoutMs}ms`
        );
    }

    getStats() {
        return {
            ...this.stats,
            defaultTimeout: this.defaultTimeout,
            timeoutRate: this.stats.totalRequests > 0 
                ? (this.stats.timeoutRequests / this.stats.totalRequests) * 100 
                : 0,
            successRate: this.stats.totalRequests > 0 
                ? (this.stats.completedRequests / this.stats.totalRequests) * 100 
                : 0
        };
    }

    reset() {
        this.stats = {
            totalRequests: 0,
            timeoutRequests: 0,
            completedRequests: 0,
            averageResponseTime: 0
        };
    }
}

// Utility function for one-off timeout operations
const withTimeout = (promise, timeoutMs, timeoutMessage = 'Operation timed out') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
        )
    ]);
};

module.exports = { TimeoutService, withTimeout };