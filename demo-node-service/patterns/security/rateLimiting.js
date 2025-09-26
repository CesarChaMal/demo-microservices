const rateLimit = require('express-rate-limit');
const Bottleneck = require('bottleneck');

class TokenBucketRateLimiter {
    constructor(options = {}) {
        this.capacity = options.capacity || 100;
        this.refillRate = options.refillRate || 10; // tokens per second
        this.buckets = new Map();
        this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
        
        this.startCleanup();
    }
    
    isAllowed(key, tokensRequested = 1) {
        const now = Date.now();
        let bucket = this.buckets.get(key);
        
        if (!bucket) {
            bucket = {
                tokens: this.capacity,
                lastRefill: now
            };
            this.buckets.set(key, bucket);
        }
        
        // Refill tokens based on time elapsed
        const timePassed = (now - bucket.lastRefill) / 1000;
        const tokensToAdd = Math.floor(timePassed * this.refillRate);
        
        if (tokensToAdd > 0) {
            bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
            bucket.lastRefill = now;
        }
        
        // Check if enough tokens available
        if (bucket.tokens >= tokensRequested) {
            bucket.tokens -= tokensRequested;
            return {
                allowed: true,
                remainingTokens: bucket.tokens,
                resetTime: null
            };
        }
        
        return {
            allowed: false,
            remainingTokens: bucket.tokens,
            resetTime: now + ((tokensRequested - bucket.tokens) / this.refillRate) * 1000
        };
    }
    
    startCleanup() {
        setInterval(() => {
            const now = Date.now();
            const maxAge = 5 * 60 * 1000; // 5 minutes
            
            for (const [key, bucket] of this.buckets) {
                if (now - bucket.lastRefill > maxAge) {
                    this.buckets.delete(key);
                }
            }
        }, this.cleanupInterval);
    }
    
    getStats() {
        return {
            activeBuckets: this.buckets.size,
            capacity: this.capacity,
            refillRate: this.refillRate
        };
    }
}

class SlidingWindowRateLimiter {
    constructor(options = {}) {
        this.windowSize = options.windowSize || 60000; // 1 minute
        this.maxRequests = options.maxRequests || 100;
        this.windows = new Map();
        this.cleanupInterval = options.cleanupInterval || 30000;
        
        this.startCleanup();
    }
    
    isAllowed(key) {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        let window = this.windows.get(key);
        if (!window) {
            window = [];
            this.windows.set(key, window);
        }
        
        // Remove old requests outside the window
        while (window.length > 0 && window[0] < windowStart) {
            window.shift();
        }
        
        // Check if limit exceeded
        if (window.length >= this.maxRequests) {
            return {
                allowed: false,
                requestCount: window.length,
                resetTime: window[0] + this.windowSize
            };
        }
        
        // Add current request
        window.push(now);
        
        return {
            allowed: true,
            requestCount: window.length,
            resetTime: null
        };
    }
    
    startCleanup() {
        setInterval(() => {
            const now = Date.now();
            const windowStart = now - this.windowSize;
            
            for (const [key, window] of this.windows) {
                // Remove old requests
                while (window.length > 0 && window[0] < windowStart) {
                    window.shift();
                }
                
                // Remove empty windows
                if (window.length === 0) {
                    this.windows.delete(key);
                }
            }
        }, this.cleanupInterval);
    }
    
    getStats() {
        return {
            activeWindows: this.windows.size,
            windowSize: this.windowSize,
            maxRequests: this.maxRequests
        };
    }
}

class AdaptiveRateLimiter {
    constructor(options = {}) {
        this.baseLimit = options.baseLimit || 100;
        this.maxLimit = options.maxLimit || 1000;
        this.minLimit = options.minLimit || 10;
        this.adjustmentFactor = options.adjustmentFactor || 0.1;
        this.errorThreshold = options.errorThreshold || 0.05; // 5%
        this.successThreshold = options.successThreshold || 0.95; // 95%
        
        this.currentLimit = this.baseLimit;
        this.requestCount = 0;
        this.errorCount = 0;
        this.windowStart = Date.now();
        this.windowSize = options.windowSize || 60000; // 1 minute
        
        this.rateLimiter = new TokenBucketRateLimiter({
            capacity: this.currentLimit,
            refillRate: this.currentLimit / 60 // per second
        });
        
        this.startAdaptation();
    }
    
    isAllowed(key, isError = false) {
        this.requestCount++;
        if (isError) {
            this.errorCount++;
        }
        
        return this.rateLimiter.isAllowed(key);
    }
    
    startAdaptation() {
        setInterval(() => {
            this.adaptLimit();
            this.resetWindow();
        }, this.windowSize);
    }
    
    adaptLimit() {
        if (this.requestCount === 0) return;
        
        const errorRate = this.errorCount / this.requestCount;
        const successRate = 1 - errorRate;
        
        if (errorRate > this.errorThreshold) {
            // Decrease limit due to high error rate
            this.currentLimit = Math.max(
                this.minLimit,
                Math.floor(this.currentLimit * (1 - this.adjustmentFactor))
            );
        } else if (successRate > this.successThreshold && this.currentLimit < this.maxLimit) {
            // Increase limit due to high success rate
            this.currentLimit = Math.min(
                this.maxLimit,
                Math.floor(this.currentLimit * (1 + this.adjustmentFactor))
            );
        }
        
        // Update rate limiter
        this.rateLimiter = new TokenBucketRateLimiter({
            capacity: this.currentLimit,
            refillRate: this.currentLimit / 60
        });
        
        console.log(`Adaptive rate limit adjusted to: ${this.currentLimit} (error rate: ${(errorRate * 100).toFixed(2)}%)`);
    }
    
    resetWindow() {
        this.requestCount = 0;
        this.errorCount = 0;
        this.windowStart = Date.now();
    }
    
    getStats() {
        return {
            currentLimit: this.currentLimit,
            baseLimit: this.baseLimit,
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0
        };
    }
}

class DistributedRateLimiter {
    constructor(redisClient, options = {}) {
        this.redis = redisClient;
        this.keyPrefix = options.keyPrefix || 'rate_limit:';
        this.windowSize = options.windowSize || 60000; // 1 minute
        this.maxRequests = options.maxRequests || 100;
    }
    
    async isAllowed(key) {
        const redisKey = this.keyPrefix + key;
        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        try {
            // Use Redis sorted set to store timestamps
            const pipeline = this.redis.pipeline();
            
            // Remove old entries
            pipeline.zremrangebyscore(redisKey, 0, windowStart);
            
            // Count current entries
            pipeline.zcard(redisKey);
            
            // Add current request
            pipeline.zadd(redisKey, now, now);
            
            // Set expiration
            pipeline.expire(redisKey, Math.ceil(this.windowSize / 1000));
            
            const results = await pipeline.exec();
            const currentCount = results[1][1];
            
            if (currentCount >= this.maxRequests) {
                // Remove the request we just added since it's not allowed
                await this.redis.zrem(redisKey, now);
                
                return {
                    allowed: false,
                    requestCount: currentCount,
                    resetTime: now + this.windowSize
                };
            }
            
            return {
                allowed: true,
                requestCount: currentCount + 1,
                resetTime: null
            };
            
        } catch (error) {
            console.error('Distributed rate limiter error:', error);
            // Fallback to allow request if Redis is unavailable
            return {
                allowed: true,
                requestCount: 0,
                resetTime: null,
                fallback: true
            };
        }
    }
    
    async getStats(key) {
        const redisKey = this.keyPrefix + key;
        
        try {
            const count = await this.redis.zcard(redisKey);
            return {
                requestCount: count,
                maxRequests: this.maxRequests,
                windowSize: this.windowSize
            };
        } catch (error) {
            return {
                requestCount: 0,
                maxRequests: this.maxRequests,
                windowSize: this.windowSize,
                error: error.message
            };
        }
    }
}

class RateLimitMiddleware {
    constructor(rateLimiter, options = {}) {
        this.rateLimiter = rateLimiter;
        this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
        this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
        this.skipFailedRequests = options.skipFailedRequests || false;
    }
    
    defaultKeyGenerator(req) {
        return req.ip || req.connection.remoteAddress;
    }
    
    middleware() {
        return async (req, res, next) => {
            const key = this.keyGenerator(req);
            
            try {
                const result = await this.rateLimiter.isAllowed(key);
                
                // Set rate limit headers
                res.set({
                    'X-RateLimit-Limit': this.rateLimiter.maxRequests || this.rateLimiter.capacity,
                    'X-RateLimit-Remaining': Math.max(0, (this.rateLimiter.maxRequests || this.rateLimiter.capacity) - (result.requestCount || 0)),
                    'X-RateLimit-Reset': result.resetTime ? new Date(result.resetTime).toISOString() : ''
                });
                
                if (!result.allowed) {
                    return res.status(429).json({
                        error: 'Too Many Requests',
                        message: 'Rate limit exceeded',
                        retryAfter: result.resetTime ? Math.ceil((result.resetTime - Date.now()) / 1000) : 60
                    });
                }
                
                // Track response for adaptive rate limiting
                if (this.rateLimiter.isAllowed && typeof this.rateLimiter.isAllowed === 'function') {
                    const originalSend = res.send;
                    res.send = function(data) {
                        const isError = res.statusCode >= 400;
                        if (this.rateLimiter.adaptLimit) {
                            this.rateLimiter.isAllowed(key, isError);
                        }
                        return originalSend.call(this, data);
                    }.bind(this);
                }
                
                next();
                
            } catch (error) {
                console.error('Rate limiting error:', error);
                next(); // Allow request to proceed if rate limiting fails
            }
        };
    }
}

// Express rate limiting configurations
const createBasicRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            error: 'Too many requests',
            retryAfter: Math.ceil(windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false
    });
};

const createStrictRateLimit = () => {
    return rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // limit each IP to 5 requests per windowMs
        message: {
            error: 'Too many requests from this IP',
            retryAfter: 900 // 15 minutes
        }
    });
};

const createAPIRateLimit = () => {
    return rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 60, // 60 requests per minute
        keyGenerator: (req) => {
            return req.headers['x-api-key'] || req.ip;
        },
        skip: (req) => {
            // Skip rate limiting for health checks
            return req.path === '/health' || req.path === '/info';
        }
    });
};

module.exports = {
    TokenBucketRateLimiter,
    SlidingWindowRateLimiter,
    AdaptiveRateLimiter,
    DistributedRateLimiter,
    RateLimitMiddleware,
    createBasicRateLimit,
    createStrictRateLimit,
    createAPIRateLimit
};