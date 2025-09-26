const CircuitBreaker = require('opossum');
const axios = require('axios');

class NodeCircuitBreaker {
    constructor(options = {}) {
        this.options = {
            timeout: options.timeout || 3000,
            errorThresholdPercentage: options.errorThresholdPercentage || 50,
            resetTimeout: options.resetTimeout || 30000,
            rollingCountTimeout: options.rollingCountTimeout || 10000,
            ...options
        };
        this.circuitBreakers = new Map();
    }
    
    createCircuitBreaker(name, asyncFunction, fallbackFunction) {
        const breaker = new CircuitBreaker(asyncFunction, this.options);
        
        if (fallbackFunction) {
            breaker.fallback(fallbackFunction);
        }
        
        breaker.on('open', () => console.log(`Circuit breaker ${name} opened`));
        breaker.on('halfOpen', () => console.log(`Circuit breaker ${name} half-opened`));
        breaker.on('close', () => console.log(`Circuit breaker ${name} closed`));
        breaker.on('fallback', (result) => console.log(`Circuit breaker ${name} fallback executed`));
        
        this.circuitBreakers.set(name, breaker);
        return breaker;
    }
    
    getStats(name) {
        const breaker = this.circuitBreakers.get(name);
        if (!breaker) return null;
        
        return {
            state: breaker.state,
            stats: breaker.stats,
            isOpen: breaker.opened,
            isClosed: breaker.closed,
            isHalfOpen: breaker.halfOpen
        };
    }
}

class ExternalServiceClient {
    constructor() {
        this.circuitBreakerManager = new NodeCircuitBreaker({
            timeout: 5000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000
        });
        
        this.pythonServiceBreaker = this.circuitBreakerManager.createCircuitBreaker(
            'python-service',
            this.callPythonService.bind(this),
            this.pythonServiceFallback.bind(this)
        );
        
        this.javaServiceBreaker = this.circuitBreakerManager.createCircuitBreaker(
            'java-service',
            this.callJavaService.bind(this),
            this.javaServiceFallback.bind(this)
        );
    }
    
    async callPythonService(data) {
        const response = await axios.post('http://python-service:5001/process', data, {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    }
    
    async callJavaService(data) {
        const response = await axios.post('http://java-service:8080/calculate', data, {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    }
    
    pythonServiceFallback(data) {
        return {
            result: data.value || 0,
            source: 'fallback',
            service: 'python-service',
            error: 'Service unavailable'
        };
    }
    
    javaServiceFallback(data) {
        return {
            result: (data.value || 0) * 2,
            source: 'fallback',
            service: 'java-service',
            error: 'Service unavailable'
        };
    }
    
    async processWithPythonService(data) {
        return await this.pythonServiceBreaker.fire(data);
    }
    
    async processWithJavaService(data) {
        return await this.javaServiceBreaker.fire(data);
    }
    
    getCircuitBreakerStats() {
        return {
            pythonService: this.circuitBreakerManager.getStats('python-service'),
            javaService: this.circuitBreakerManager.getStats('java-service')
        };
    }
}

module.exports = { NodeCircuitBreaker, ExternalServiceClient };