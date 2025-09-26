const retry = require('async-retry');

class RetryService {
    constructor(options = {}) {
        this.defaultOptions = {
            retries: options.retries || 3,
            factor: options.factor || 2,
            minTimeout: options.minTimeout || 1000,
            maxTimeout: options.maxTimeout || 10000,
            randomize: options.randomize || true,
            ...options
        };
    }
    
    async executeWithRetry(fn, options = {}) {
        const retryOptions = { ...this.defaultOptions, ...options };
        
        return retry(async (bail, attempt) => {
            try {
                console.log(`Attempt ${attempt} of ${retryOptions.retries + 1}`);
                return await fn();
            } catch (error) {
                if (this.shouldNotRetry(error)) {
                    bail(error);
                    return;
                }
                
                console.log(`Attempt ${attempt} failed: ${error.message}`);
                throw error;
            }
        }, retryOptions);
    }
    
    shouldNotRetry(error) {
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
            return true;
        }
        return false;
    }
}

class CustomRetry {
    constructor(options = {}) {
        this.maxAttempts = options.maxAttempts || 3;
        this.baseDelay = options.baseDelay || 1000;
        this.maxDelay = options.maxDelay || 10000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
    }
    
    async execute(fn, context = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            try {
                return await fn(attempt, context);
            } catch (error) {
                lastError = error;
                
                if (attempt === this.maxAttempts) break;
                
                const delay = this.calculateDelay(attempt);
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }
    
    calculateDelay(attempt) {
        const exponentialDelay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
        const cappedDelay = Math.min(exponentialDelay, this.maxDelay);
        
        const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
        return Math.max(0, cappedDelay + jitter);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class BulkheadService {
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent || 10;
        this.queue = [];
        this.running = 0;
    }
    
    async execute(fn) {
        return new Promise((resolve, reject) => {
            const task = { fn, resolve, reject };
            
            if (this.running < this.maxConcurrent) {
                this.runTask(task);
            } else {
                this.queue.push(task);
            }
        });
    }
    
    async runTask(task) {
        this.running++;
        
        try {
            const result = await task.fn();
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            this.running--;
            
            if (this.queue.length > 0) {
                const nextTask = this.queue.shift();
                this.runTask(nextTask);
            }
        }
    }
    
    getStats() {
        return {
            running: this.running,
            queued: this.queue.length,
            maxConcurrent: this.maxConcurrent
        };
    }
}

class TimeoutService {
    static async withTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        });
        
        return Promise.race([promise, timeoutPromise]);
    }
    
    static createTimeoutWrapper(fn, timeoutMs) {
        return async (...args) => {
            return this.withTimeout(fn(...args), timeoutMs);
        };
    }
}

module.exports = { RetryService, CustomRetry, BulkheadService, TimeoutService };