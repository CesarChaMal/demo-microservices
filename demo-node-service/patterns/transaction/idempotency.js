const crypto = require('crypto');

class IdempotencyService {
    constructor(ttl = 300000) { // 5 minutes default TTL
        this.cache = new Map();
        this.ttl = ttl;
    }

    generateKey(...args) {
        const data = JSON.stringify(args, null, 0);
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    async executeIdempotent(key, operation) {
        if (this.cache.has(key)) {
            const cached = this.cache.get(key);
            if (Date.now() - cached.timestamp < this.ttl) {
                return cached.result;
            }
            this.cache.delete(key);
        }

        const result = await operation();
        this.cache.set(key, {
            result,
            timestamp: Date.now()
        });

        // Auto cleanup after TTL
        setTimeout(() => this.cache.delete(key), this.ttl);
        
        return result;
    }

    invalidate(key) {
        return this.cache.delete(key);
    }

    getStats() {
        return {
            cachedEntries: this.cache.size,
            ttlMs: this.ttl
        };
    }
}

module.exports = { IdempotencyService };