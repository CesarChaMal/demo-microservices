const axios = require('axios');

class HealthCheckService {
    constructor() {
        this.checks = new Map();
        this.status = 'UP';
        this.lastCheck = null;
        this.checkInterval = 30000; // 30 seconds
        this.startPeriodicChecks();
    }
    
    addCheck(name, checkFunction, options = {}) {
        this.checks.set(name, {
            name,
            checkFunction,
            timeout: options.timeout || 5000,
            critical: options.critical || false,
            lastResult: null,
            lastCheck: null,
            failureCount: 0,
            maxFailures: options.maxFailures || 3
        });
    }
    
    async runCheck(name) {
        const check = this.checks.get(name);
        if (!check) {
            throw new Error(`Health check '${name}' not found`);
        }
        
        const startTime = Date.now();
        
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
            });
            
            const result = await Promise.race([
                check.checkFunction(),
                timeoutPromise
            ]);
            
            const duration = Date.now() - startTime;
            
            check.lastResult = {
                status: 'UP',
                duration,
                timestamp: new Date(),
                details: result || {}
            };
            
            check.failureCount = 0;
            check.lastCheck = new Date();
            
            return check.lastResult;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            check.failureCount++;
            check.lastResult = {
                status: 'DOWN',
                duration,
                timestamp: new Date(),
                error: error.message,
                details: {}
            };
            
            check.lastCheck = new Date();
            
            return check.lastResult;
        }
    }
    
    async runAllChecks() {
        const results = {};
        let overallStatus = 'UP';
        
        for (const [name, check] of this.checks) {
            const result = await this.runCheck(name);
            results[name] = result;
            
            if (result.status === 'DOWN') {
                if (check.critical || check.failureCount >= check.maxFailures) {
                    overallStatus = 'DOWN';
                } else if (overallStatus === 'UP') {
                    overallStatus = 'DEGRADED';
                }
            }
        }
        
        this.status = overallStatus;
        this.lastCheck = new Date();
        
        return {
            status: overallStatus,
            timestamp: this.lastCheck,
            checks: results,
            summary: this.getHealthSummary()
        };
    }
    
    getHealthSummary() {
        const checks = Array.from(this.checks.values());
        const upCount = checks.filter(c => c.lastResult?.status === 'UP').length;
        const downCount = checks.filter(c => c.lastResult?.status === 'DOWN').length;
        const unknownCount = checks.filter(c => !c.lastResult).length;
        
        return {
            total: checks.length,
            up: upCount,
            down: downCount,
            unknown: unknownCount
        };
    }
    
    startPeriodicChecks() {
        setInterval(async () => {
            try {
                await this.runAllChecks();
            } catch (error) {
                console.error('Periodic health check failed:', error);
            }
        }, this.checkInterval);
    }
    
    getStatus() {
        return {
            status: this.status,
            lastCheck: this.lastCheck,
            checks: Object.fromEntries(
                Array.from(this.checks.entries()).map(([name, check]) => [
                    name,
                    {
                        status: check.lastResult?.status || 'UNKNOWN',
                        lastCheck: check.lastCheck,
                        failureCount: check.failureCount,
                        critical: check.critical
                    }
                ])
            )
        };
    }
}

class CircuitBreakerHealthIndicator {
    constructor(circuitBreakerManager) {
        this.circuitBreakerManager = circuitBreakerManager;
    }
    
    async check() {
        const stats = this.circuitBreakerManager.getCircuitBreakerStats();
        const details = {};
        let overallHealthy = true;
        
        for (const [serviceName, stat] of Object.entries(stats)) {
            if (stat) {
                details[serviceName] = {
                    state: stat.state,
                    isOpen: stat.isOpen,
                    failureRate: stat.stats.failures / (stat.stats.failures + stat.stats.successes) * 100
                };
                
                if (stat.isOpen) {
                    overallHealthy = false;
                }
            }
        }
        
        return {
            healthy: overallHealthy,
            circuitBreakers: details
        };
    }
}

class DatabaseHealthIndicator {
    constructor(connectionPool) {
        this.connectionPool = connectionPool;
    }
    
    async check() {
        try {
            // Simulate database ping
            const startTime = Date.now();
            await this.simulateDatabasePing();
            const responseTime = Date.now() - startTime;
            
            return {
                healthy: true,
                responseTime,
                connections: {
                    active: 5,
                    idle: 3,
                    total: 8
                }
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
    
    async simulateDatabasePing() {
        // Simulate database connection check
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Simulate occasional failure
        if (Math.random() < 0.05) {
            throw new Error('Database connection failed');
        }
    }
}

class ExternalServiceHealthIndicator {
    constructor(serviceName, serviceUrl) {
        this.serviceName = serviceName;
        this.serviceUrl = serviceUrl;
    }
    
    async check() {
        try {
            const startTime = Date.now();
            const response = await axios.get(`${this.serviceUrl}/info`, {
                timeout: 3000
            });
            const responseTime = Date.now() - startTime;
            
            return {
                healthy: response.status === 200,
                responseTime,
                status: response.status,
                version: response.data?.version || 'unknown'
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                service: this.serviceName
            };
        }
    }
}

class CacheHealthIndicator {
    constructor(cacheService) {
        this.cacheService = cacheService;
    }
    
    async check() {
        try {
            const testKey = 'health-check-' + Date.now();
            const testValue = 'test-value';
            
            // Test write
            await this.cacheService.set(testKey, testValue, 10);
            
            // Test read
            const retrievedValue = await this.cacheService.get(testKey, () => null);
            
            // Cleanup
            await this.cacheService.delete(testKey);
            
            const isHealthy = retrievedValue === testValue;
            
            return {
                healthy: isHealthy,
                operations: {
                    write: true,
                    read: isHealthy,
                    delete: true
                }
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
}

class MetricsCollector {
    constructor() {
        this.metrics = new Map();
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
    }
    
    incrementCounter(name, labels = {}, value = 1) {
        const key = this.createKey(name, labels);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + value);
    }
    
    setGauge(name, labels = {}, value) {
        const key = this.createKey(name, labels);
        this.gauges.set(key, {
            value,
            timestamp: Date.now()
        });
    }
    
    recordHistogram(name, labels = {}, value) {
        const key = this.createKey(name, labels);
        const histogram = this.histograms.get(key) || {
            count: 0,
            sum: 0,
            buckets: new Map(),
            min: Infinity,
            max: -Infinity
        };
        
        histogram.count++;
        histogram.sum += value;
        histogram.min = Math.min(histogram.min, value);
        histogram.max = Math.max(histogram.max, value);
        
        // Add to buckets (simplified)
        const buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
        for (const bucket of buckets) {
            if (value <= bucket) {
                histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
            }
        }
        
        this.histograms.set(key, histogram);
    }
    
    createKey(name, labels) {
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return labelStr ? `${name}{${labelStr}}` : name;
    }
    
    getMetrics() {
        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: Object.fromEntries(
                Array.from(this.histograms.entries()).map(([key, hist]) => [
                    key,
                    {
                        count: hist.count,
                        sum: hist.sum,
                        avg: hist.count > 0 ? hist.sum / hist.count : 0,
                        min: hist.min === Infinity ? 0 : hist.min,
                        max: hist.max === -Infinity ? 0 : hist.max,
                        buckets: Object.fromEntries(hist.buckets)
                    }
                ])
            )
        };
    }
    
    getPrometheusMetrics() {
        let output = '';
        
        // Counters
        for (const [key, value] of this.counters) {
            output += `${key} ${value}\n`;
        }
        
        // Gauges
        for (const [key, data] of this.gauges) {
            output += `${key} ${data.value}\n`;
        }
        
        // Histograms
        for (const [key, hist] of this.histograms) {
            output += `${key}_count ${hist.count}\n`;
            output += `${key}_sum ${hist.sum}\n`;
            for (const [bucket, count] of hist.buckets) {
                output += `${key}_bucket{le="${bucket}"} ${count}\n`;
            }
        }
        
        return output;
    }
}

module.exports = {
    HealthCheckService,
    CircuitBreakerHealthIndicator,
    DatabaseHealthIndicator,
    ExternalServiceHealthIndicator,
    CacheHealthIndicator,
    MetricsCollector
};