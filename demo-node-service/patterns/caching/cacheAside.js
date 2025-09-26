const redis = require('redis');
const NodeCache = require('node-cache');

class CacheAsideService {
    constructor(options = {}) {
        this.client = redis.createClient({
            host: options.host || 'localhost',
            port: options.port || 6379,
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    return new Error('Redis server connection refused');
                }
                return Math.min(options.attempt * 100, 3000);
            }
        });
        
        this.defaultTTL = options.defaultTTL || 1800;
        this.connected = false;
        this.connect();
    }
    
    async connect() {
        try {
            await this.client.connect();
            this.connected = true;
            console.log('Redis connected successfully');
        } catch (error) {
            console.error('Redis connection failed:', error);
            this.connected = false;
        }
    }
    
    async get(key, dataLoader, ttl = this.defaultTTL) {
        try {
            if (!this.connected) {
                return await dataLoader();
            }
            
            const cachedValue = await this.client.get(key);
            if (cachedValue !== null) {
                return JSON.parse(cachedValue);
            }
            
            const data = await dataLoader();
            if (data !== null && data !== undefined) {
                await this.client.setEx(key, ttl, JSON.stringify(data));
            }
            
            return data;
        } catch (error) {
            console.error('Cache error, falling back to data loader:', error);
            return await dataLoader();
        }
    }
    
    async set(key, value, ttl = this.defaultTTL) {
        try {
            if (this.connected) {
                await this.client.setEx(key, ttl, JSON.stringify(value));
            }
        } catch (error) {
            console.error('Cache set error:', error);
        }
    }
    
    async delete(key) {
        try {
            if (this.connected) {
                await this.client.del(key);
            }
        } catch (error) {
            console.error('Cache delete error:', error);
        }
    }
}

class MultiLevelCache {
    constructor(options = {}) {
        this.l1Cache = new NodeCache({ 
            stdTTL: options.l1TTL || 60,
            maxKeys: options.l1MaxSize || 1000
        });
        this.l2Cache = new CacheAsideService(options);
    }
    
    async get(key, dataLoader, ttl) {
        const l1Value = this.l1Cache.get(key);
        if (l1Value !== undefined) {
            return l1Value;
        }
        
        const l2DataLoader = async () => {
            const data = await dataLoader();
            this.l1Cache.set(key, data);
            return data;
        };
        
        const result = await this.l2Cache.get(key, l2DataLoader, ttl);
        
        if (result !== null && result !== undefined) {
            this.l1Cache.set(key, result);
        }
        
        return result;
    }
    
    async set(key, value, ttl) {
        this.l1Cache.set(key, value);
        await this.l2Cache.set(key, value, ttl);
    }
    
    async delete(key) {
        this.l1Cache.del(key);
        await this.l2Cache.delete(key);
    }
    
    getStats() {
        return {
            l1Stats: this.l1Cache.getStats(),
            l1Keys: this.l1Cache.keys().length
        };
    }
}

class ProcessingCache {
    constructor() {
        this.cache = new CacheAsideService();
    }
    
    async getProcessedData(value) {
        const cacheKey = `processed:${value}`;
        
        const dataLoader = async () => {
            await this.sleep(500);
            return {
                result: value * 2,
                computed: true,
                timestamp: Date.now(),
                computedBy: 'node-service'
            };
        };
        
        return await this.cache.get(cacheKey, dataLoader, 300);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class WriteBehindCache {
    constructor(options = {}) {
        this.cache = new CacheAsideService(options);
        this.writeBuffer = new Map();
        this.flushInterval = options.flushInterval || 10000;
        this.batchSize = options.batchSize || 100;
        
        this.startFlushTimer();
    }
    
    async write(key, value) {
        await this.cache.set(key, value);
        this.writeBuffer.set(key, value);
    }
    
    async read(key, dataLoader) {
        return await this.cache.get(key, dataLoader);
    }
    
    startFlushTimer() {
        setInterval(() => {
            this.flushBuffer();
        }, this.flushInterval);
    }
    
    async flushBuffer() {
        if (this.writeBuffer.size === 0) return;
        
        const batch = new Map();
        let count = 0;
        
        for (const [key, value] of this.writeBuffer) {
            batch.set(key, value);
            this.writeBuffer.delete(key);
            
            if (++count >= this.batchSize) break;
        }
        
        try {
            await this.batchWriteToDatabase(batch);
            console.log(`Flushed ${batch.size} items to database`);
        } catch (error) {
            console.error('Failed to flush buffer:', error);
            for (const [key, value] of batch) {
                this.writeBuffer.set(key, value);
            }
        }
    }
    
    async batchWriteToDatabase(batch) {
        console.log('Simulating database batch write for', batch.size, 'items');
        await this.sleep(100);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getStats() {
        return {
            bufferSize: this.writeBuffer.size,
            flushInterval: this.flushInterval,
            batchSize: this.batchSize
        };
    }
}

module.exports = { CacheAsideService, MultiLevelCache, ProcessingCache, WriteBehindCache };