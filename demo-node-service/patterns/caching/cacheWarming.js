const EventEmitter = require('events');

class CacheWarmingService extends EventEmitter {
    constructor(cache) {
        super();
        this.cache = cache;
        this.warmingJobs = new Map();
        this.running = true;
    }
    
    scheduleWarming(key, dataLoader, interval = 300000) {
        if (this.warmingJobs.has(key)) {
            clearInterval(this.warmingJobs.get(key));
        }
        
        const warmingJob = setInterval(async () => {
            if (!this.running) return;
            
            try {
                const data = await dataLoader();
                await this.cache.set(key, data);
                this.emit('cacheWarmed', { key, data });
            } catch (error) {
                this.emit('cacheWarmingError', { key, error: error.message });
            }
        }, interval);
        
        this.warmingJobs.set(key, warmingJob);
    }
    
    async warmCache(cacheSpecs) {
        const promises = cacheSpecs.map(async ({ key, dataLoader }) => {
            try {
                const data = await dataLoader();
                await this.cache.set(key, data);
                return { key, success: true };
            } catch (error) {
                return { key, success: false, error: error.message };
            }
        });
        
        const results = await Promise.all(promises);
        this.emit('batchWarmingCompleted', results);
        return results;
    }
    
    stopWarming(key) {
        if (this.warmingJobs.has(key)) {
            clearInterval(this.warmingJobs.get(key));
            this.warmingJobs.delete(key);
        }
    }
    
    stopAllWarming() {
        this.running = false;
        for (const [key, job] of this.warmingJobs) {
            clearInterval(job);
        }
        this.warmingJobs.clear();
    }
    
    getWarmingStats() {
        return {
            activeJobs: this.warmingJobs.size,
            running: this.running
        };
    }
}

class CacheInvalidationService extends EventEmitter {
    constructor(cache) {
        super();
        this.cache = cache;
        this.patterns = new Map();
    }
    
    registerPattern(patternName, keyPattern) {
        this.patterns.set(patternName, new RegExp(keyPattern));
    }
    
    async invalidateByPattern(patternName) {
        const pattern = this.patterns.get(patternName);
        if (!pattern) {
            throw new Error(`Pattern ${patternName} not registered`);
        }
        
        const keysToInvalidate = [];
        
        try {
            const allKeys = await this.cache.getAllKeys();
            for (const key of allKeys) {
                if (pattern.test(key)) {
                    keysToInvalidate.push(key);
                }
            }
        } catch (error) {
            // Fallback if cache doesn't support getAllKeys
            console.warn('Cache does not support getAllKeys, pattern invalidation limited');
        }
        
        const results = await Promise.all(
            keysToInvalidate.map(async (key) => {
                try {
                    await this.cache.delete(key);
                    return { key, success: true };
                } catch (error) {
                    return { key, success: false, error: error.message };
                }
            })
        );
        
        this.emit('patternInvalidated', { pattern: patternName, results });
        return results;
    }
    
    async invalidateByPrefix(prefix) {
        const keysToInvalidate = [];
        
        try {
            const allKeys = await this.cache.getAllKeys();
            for (const key of allKeys) {
                if (key.startsWith(prefix)) {
                    keysToInvalidate.push(key);
                }
            }
        } catch (error) {
            console.warn('Cache does not support getAllKeys, prefix invalidation limited');
        }
        
        const results = await Promise.all(
            keysToInvalidate.map(async (key) => {
                try {
                    await this.cache.delete(key);
                    return { key, success: true };
                } catch (error) {
                    return { key, success: false, error: error.message };
                }
            })
        );
        
        this.emit('prefixInvalidated', { prefix, results });
        return results;
    }
    
    getInvalidationStats() {
        return {
            registeredPatterns: Array.from(this.patterns.keys())
        };
    }
}

module.exports = {
    CacheWarmingService,
    CacheInvalidationService
};