/**
 * Write-Behind Caching Pattern Implementation
 * Asynchronously writes data to persistent storage
 */

class WriteBehindCache {
    constructor(flushInterval = 5000, batchSize = 10) {
        this.cache = new Map();
        this.dirtyKeys = new Set();
        this.flushInterval = flushInterval;
        this.batchSize = batchSize;
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            writes: 0,
            flushes: 0
        };
        
        // Start background writer
        this.flushTimer = setInterval(() => this._flushDirtyData(), this.flushInterval);
    }
    
    get(key) {
        if (this.cache.has(key)) {
            this.metrics.cacheHits++;
            return this.cache.get(key);
        }
        
        this.metrics.cacheMisses++;
        return null;
    }
    
    put(key, value) {
        this.cache.set(key, value);
        this.dirtyKeys.add(key);
        this.metrics.writes++;
        console.log(`Cached key: ${key}, marked dirty`);
    }
    
    async _flushDirtyData() {
        if (this.dirtyKeys.size === 0) return;
        
        const batch = Array.from(this.dirtyKeys).slice(0, this.batchSize);
        
        for (const key of batch) {
            if (this.cache.has(key)) {
                await this._writeToStorage(key, this.cache.get(key));
                this.dirtyKeys.delete(key);
            }
        }
        
        if (batch.length > 0) {
            this.metrics.flushes++;
            console.log(`Flushed ${batch.length} keys to storage`);
        }
    }
    
    async _writeToStorage(key, value) {
        // Simulate async write to persistent storage
        return new Promise(resolve => {
            setTimeout(() => {
                console.log(`Writing to storage: ${key} = ${JSON.stringify(value)}`);
                resolve();
            }, 10);
        });
    }
    
    async forceFlush() {
        await this._flushDirtyData();
    }
    
    getMetrics() {
        return {
            cacheSize: this.cache.size,
            dirtyKeys: this.dirtyKeys.size,
            cacheHits: this.metrics.cacheHits,
            cacheMisses: this.metrics.cacheMisses,
            writes: this.metrics.writes,
            flushes: this.metrics.flushes
        };
    }
    
    shutdown() {
        clearInterval(this.flushTimer);
        return this.forceFlush();
    }
}

// Global instance
const writeBehindCache = new WriteBehindCache();

module.exports = { WriteBehindCache, writeBehindCache };