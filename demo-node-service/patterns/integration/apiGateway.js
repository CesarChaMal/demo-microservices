/**
 * API Gateway Pattern Implementation
 * Provides centralized entry point for all client requests with routing, authentication, and cross-cutting concerns.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class Route {
    constructor(pathPattern, targetService, targetPath, methods, options = {}) {
        this.pathPattern = pathPattern;
        this.targetService = targetService;
        this.targetPath = targetPath;
        this.methods = methods;
        this.authRequired = options.authRequired !== false;
        this.rateLimit = options.rateLimit;
        this.timeout = options.timeout || 30000;
        this.retries = options.retries || 0;
    }
}

class GatewayRequest {
    constructor(path, method, headers, queryParams, body, clientIp) {
        this.path = path;
        this.method = method;
        this.headers = headers;
        this.queryParams = queryParams;
        this.body = body;
        this.clientIp = clientIp;
        this.timestamp = Date.now();
        this.requestId = uuidv4();
    }
}

class APIGateway extends EventEmitter {
    constructor() {
        super();
        this.routes = new Map();
        this.middleware = [];
        this.serviceRegistry = {
            'java-service': 'http://java-service:8080',
            'node-service': 'http://node-service:3000',
            'python-service': 'http://python-service:5001'
        };
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            errorCount: 0,
            averageResponseTime: 0
        };
        this.rateLimitStore = new Map();
    }

    addRoute(route) {
        this.routes.set(route.pathPattern, route);
        this.emit('routeAdded', route);
    }

    addMiddleware(middlewareFunc) {
        this.middleware.push(middlewareFunc);
    }

    async routeRequest(gatewayRequest) {
        this.stats.totalRequests++;
        const startTime = Date.now();

        try {
            // Find matching route
            const route = this.findRoute(gatewayRequest.path, gatewayRequest.method);
            if (!route) {
                return this.errorResponse(404, 'Route not found');
            }

            // Apply middleware
            for (const middleware of this.middleware) {
                const result = await middleware(gatewayRequest, route);
                if (result) {
                    return result;
                }
            }

            // Forward request to target service
            const response = await this.forwardRequest(gatewayRequest, route);
            
            this.stats.successfulRequests++;
            this.updateAverageResponseTime(Date.now() - startTime);
            
            return response;

        } catch (error) {
            this.stats.errorCount++;
            this.emit('error', error, gatewayRequest);
            return this.errorResponse(500, 'Internal gateway error');
        }
    }

    findRoute(path, method) {
        for (const [pattern, route] of this.routes) {
            if (this.pathMatches(path, pattern) && route.methods.includes(method)) {
                return route;
            }
        }
        return null;
    }

    pathMatches(path, pattern) {
        if (pattern === path) return true;
        if (pattern.endsWith('/**')) {
            const prefix = pattern.slice(0, -3);
            return path.startsWith(prefix);
        }
        // Enhanced pattern matching with parameters
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');
        
        if (patternParts.length !== pathParts.length) return false;
        
        return patternParts.every((part, index) => {
            return part.startsWith(':') || part === pathParts[index];
        });
    }

    async forwardRequest(gatewayRequest, route) {
        const targetUrl = this.serviceRegistry[route.targetService];
        if (!targetUrl) {
            return this.errorResponse(503, 'Service unavailable');
        }

        const targetPath = route.targetPath || gatewayRequest.path;
        const fullUrl = `${targetUrl}${targetPath}`;

        // Prepare headers
        const headers = {
            ...gatewayRequest.headers,
            'X-Gateway-Request-ID': gatewayRequest.requestId,
            'X-Forwarded-For': gatewayRequest.clientIp,
            'X-Gateway-Timestamp': gatewayRequest.timestamp.toString()
        };

        const requestConfig = {
            method: gatewayRequest.method.toLowerCase(),
            url: fullUrl,
            headers,
            params: gatewayRequest.queryParams,
            timeout: route.timeout
        };

        if (['post', 'put', 'patch'].includes(requestConfig.method)) {
            requestConfig.data = gatewayRequest.body;
        }

        try {
            let response;
            let attempts = 0;
            const maxAttempts = route.retries + 1;

            while (attempts < maxAttempts) {
                try {
                    response = await axios(requestConfig);
                    break;
                } catch (error) {
                    attempts++;
                    if (attempts >= maxAttempts) throw error;
                    
                    // Exponential backoff
                    await this.delay(Math.pow(2, attempts) * 1000);
                }
            }

            return {
                statusCode: response.status,
                headers: response.headers,
                body: response.data,
                gatewayMetadata: {
                    route: route.pathPattern,
                    targetService: route.targetService,
                    processingTime: Date.now() - gatewayRequest.timestamp,
                    attempts
                }
            };

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                return this.errorResponse(504, 'Gateway timeout');
            } else if (error.code === 'ECONNREFUSED') {
                return this.errorResponse(503, 'Service unavailable');
            }
            throw error;
        }
    }

    errorResponse(statusCode, message) {
        return {
            statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: {
                error: message,
                timestamp: Date.now(),
                gateway: 'node-service'
            }
        };
    }

    updateAverageResponseTime(responseTime) {
        const totalTime = this.stats.averageResponseTime * (this.stats.successfulRequests - 1) + responseTime;
        this.stats.averageResponseTime = totalTime / this.stats.successfulRequests;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return {
            ...this.stats,
            routesCount: this.routes.size,
            services: Object.keys(this.serviceRegistry),
            errorRate: this.stats.totalRequests > 0 ? 
                (this.stats.errorCount / this.stats.totalRequests * 100) : 0
        };
    }
}

// Middleware functions
const authMiddleware = async (gatewayRequest, route) => {
    if (!route.authRequired) return null;

    const authHeader = gatewayRequest.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Authentication required' }
        };
    }

    const token = authHeader.slice(7);
    if (!token || token.length < 10) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Invalid token' }
        };
    }

    return null;
};

const rateLimitMiddleware = (gateway) => {
    return async (gatewayRequest, route) => {
        if (!route.rateLimit) return null;

        const key = `${gatewayRequest.clientIp}:${route.pathPattern}`;
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute window

        let requests = gateway.rateLimitStore.get(key) || [];
        requests = requests.filter(timestamp => timestamp > windowStart);

        if (requests.length >= route.rateLimit) {
            return {
                statusCode: 429,
                headers: { 
                    'Content-Type': 'application/json',
                    'X-RateLimit-Limit': route.rateLimit.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': Math.ceil((windowStart + 60000) / 1000).toString()
                },
                body: { error: 'Rate limit exceeded' }
            };
        }

        requests.push(now);
        gateway.rateLimitStore.set(key, requests);
        return null;
    };
};

const loggingMiddleware = async (gatewayRequest, route) => {
    console.log(`Gateway request: ${gatewayRequest.method} ${gatewayRequest.path} -> ${route.targetService}`);
    return null;
};

// Anti-Corruption Layer Pattern
class AntiCorruptionLayer {
    constructor() {
        this.translators = new Map();
    }

    addTranslator(serviceName, translatorFunc) {
        this.translators.set(serviceName, translatorFunc);
    }

    translateRequest(serviceName, requestData) {
        const translator = this.translators.get(serviceName);
        return translator ? translator(requestData, 'request') : requestData;
    }

    translateResponse(serviceName, responseData) {
        const translator = this.translators.get(serviceName);
        return translator ? translator(responseData, 'response') : responseData;
    }
}

// Legacy system translator
const legacyTranslator = (data, direction) => {
    if (direction === 'request') {
        // Modern -> Legacy
        if (data && typeof data === 'object' && 'value' in data) {
            return {
                legacy_value: data.value,
                legacy_type: data.algorithm || 'default',
                legacy_timestamp: Math.floor(Date.now() / 1000)
            };
        }
    } else {
        // Legacy -> Modern
        if (data && typeof data === 'object' && 'legacy_result' in data) {
            return {
                result: data.legacy_result,
                algorithm: data.legacy_type || 'default',
                source: 'legacy-system'
            };
        }
    }
    return data;
};

// Strangler Fig Pattern
class StranglerFig extends EventEmitter {
    constructor() {
        super();
        this.legacyClient = null;
        this.modernClient = null;
        this.migrationRules = new Map();
    }

    addMigrationRule(pathPattern, useModern, percentage = 100) {
        this.migrationRules.set(pathPattern, {
            useModern,
            percentage
        });
        this.emit('migrationRuleAdded', { pathPattern, useModern, percentage });
    }

    async routeRequest(path, requestData) {
        const rule = this.findMigrationRule(path);

        if (rule && rule.useModern) {
            if (rule.percentage === 100 || this.shouldUseModern(rule.percentage)) {
                return await this.callModernSystem(requestData);
            }
        }

        return await this.callLegacySystem(requestData);
    }

    findMigrationRule(path) {
        for (const [pattern, rule] of this.migrationRules) {
            if (path.startsWith(pattern)) {
                return rule;
            }
        }
        return null;
    }

    shouldUseModern(percentage) {
        return Math.random() * 100 <= percentage;
    }

    async callModernSystem(requestData) {
        // Implementation depends on modern system client
        return { result: 'modern', data: requestData, timestamp: Date.now() };
    }

    async callLegacySystem(requestData) {
        // Implementation depends on legacy system client
        return { result: 'legacy', data: requestData, timestamp: Date.now() };
    }

    getMigrationStats() {
        const stats = {};
        for (const [pattern, rule] of this.migrationRules) {
            stats[pattern] = {
                useModern: rule.useModern,
                percentage: rule.percentage
            };
        }
        return stats;
    }
}

// Circuit Breaker for Gateway
class GatewayCircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.monitoringPeriod = options.monitoringPeriod || 10000;
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
    }

    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= 3) {
                this.state = 'CLOSED';
            }
        }
    }

    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
            successCount: this.successCount
        };
    }
}

module.exports = {
    APIGateway,
    Route,
    GatewayRequest,
    AntiCorruptionLayer,
    StranglerFig,
    GatewayCircuitBreaker,
    authMiddleware,
    rateLimitMiddleware,
    loggingMiddleware,
    legacyTranslator
};