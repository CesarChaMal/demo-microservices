const EventEmitter = require('events');

class Semaphore {
    constructor(permits) {
        this.permits = permits;
        this.waitQueue = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            if (this.permits > 0) {
                this.permits--;
                resolve();
            } else {
                this.waitQueue.push(resolve);
            }
        });
    }

    release() {
        this.permits++;
        if (this.waitQueue.length > 0) {
            const resolve = this.waitQueue.shift();
            this.permits--;
            resolve();
        }
    }
}

class BulkheadService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.maxConcurrent = options.maxConcurrent || 10;
        this.maxWaitTime = options.maxWaitTime || 2000;
        this.semaphore = new Semaphore(this.maxConcurrent);
        
        this.stats = {
            activeRequests: 0,
            totalRequests: 0,
            rejectedRequests: 0,
            completedRequests: 0,
            averageWaitTime: 0
        };
    }

    async execute(fn, timeout = this.maxWaitTime) {
        const startTime = Date.now();
        this.stats.totalRequests++;

        try {
            // Wait for permit with timeout
            await Promise.race([
                this.semaphore.acquire(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Bulkhead capacity exceeded')), timeout)
                )
            ]);

            this.stats.activeRequests++;
            const waitTime = Date.now() - startTime;
            this.updateAverageWaitTime(waitTime);

            this.emit('request-started', { 
                activeRequests: this.stats.activeRequests,
                waitTime 
            });

            try {
                const result = await fn();
                this.stats.completedRequests++;
                this.emit('request-completed', { result });
                return result;
            } catch (error) {
                this.emit('request-failed', { error });
                throw error;
            }
        } catch (error) {
            this.stats.rejectedRequests++;
            this.emit('request-rejected', { error });
            throw error;
        } finally {
            if (this.stats.activeRequests > 0) {
                this.stats.activeRequests--;
                this.semaphore.release();
            }
        }
    }

    updateAverageWaitTime(waitTime) {
        const totalCompleted = this.stats.completedRequests + this.stats.rejectedRequests;
        if (totalCompleted === 0) {
            this.stats.averageWaitTime = waitTime;
        } else {
            this.stats.averageWaitTime = 
                (this.stats.averageWaitTime * (totalCompleted - 1) + waitTime) / totalCompleted;
        }
    }

    getStats() {
        return {
            ...this.stats,
            maxConcurrent: this.maxConcurrent,
            availablePermits: this.semaphore.permits,
            queueLength: this.semaphore.waitQueue.length,
            utilizationRate: (this.stats.activeRequests / this.maxConcurrent) * 100
        };
    }

    reset() {
        this.stats = {
            activeRequests: this.stats.activeRequests, // Keep active requests
            totalRequests: 0,
            rejectedRequests: 0,
            completedRequests: 0,
            averageWaitTime: 0
        };
    }
}

module.exports = { BulkheadService, Semaphore };