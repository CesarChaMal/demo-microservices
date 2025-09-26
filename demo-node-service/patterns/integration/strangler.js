/**
 * Strangler Fig Pattern Implementation
 * Gradually replace legacy systems by intercepting calls and routing them
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class StranglerFigProxy {
    constructor(options = {}) {
        this.legacyService = options.legacyService;
        this.modernService = options.modernService;
        this.routingRules = new Map();
        this.metrics = {
            legacyRequests: 0,
            modernRequests: 0,
            errors: 0,
            migrationPercentage: 0
        };
        this.featureFlags = options.featureFlags || new Map();
        this.defaultTimeout = options.timeout || 30000;
    }

    // Add routing rule for gradual migration
    addRoutingRule(path, config) {
        this.routingRules.set(path, {
            modernPercentage: config.modernPercentage || 0,
            userBasedRouting: config.userBasedRouting || false,
            pathTransformation: config.pathTransformation,
            dataTransformation: config.dataTransformation,
            fallbackToLegacy: config.fallbackToLegacy !== false,
            ...config
        });
    }

    // Determine which service to route to
    shouldUseModernService(path, context = {}) {
        const rule = this.routingRules.get(path);
        if (!rule) {
            return false; // Default to legacy if no rule
        }

        // Feature flag override
        const featureFlag = this.featureFlags.get(`modern-${path}`);
        if (featureFlag !== undefined) {
            return featureFlag;
        }

        // User-based routing (sticky sessions)
        if (rule.userBasedRouting && context.userId) {
            const hash = this.hashUserId(context.userId);
            return hash < rule.modernPercentage;
        }

        // Percentage-based routing
        return Math.random() * 100 < rule.modernPercentage;
    }

    // Hash user ID for consistent routing
    hashUserId(userId) {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            const char = userId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash) % 100;
    }

    // Main proxy method
    async proxy(path, method, data, headers = {}, context = {}) {
        const requestId = context.requestId || uuidv4();
        const startTime = Date.now();

        try {
            const useModern = this.shouldUseModernService(path, context);
            
            if (useModern) {
                return await this.callModernService(path, method, data, headers, context);
            } else {
                return await this.callLegacyService(path, method, data, headers, context);
            }
        } catch (error) {
            this.metrics.errors++;
            
            // Fallback logic
            const rule = this.routingRules.get(path);
            if (rule && rule.fallbackToLegacy && useModern) {
                console.log(`Modern service failed, falling back to legacy for ${path}`);
                return await this.callLegacyService(path, method, data, headers, context);
            }
            
            throw error;
        } finally {
            const duration = Date.now() - startTime;
            console.log(`Request ${requestId} completed in ${duration}ms`);
        }
    }

    // Call modern service
    async callModernService(path, method, data, headers, context) {
        this.metrics.modernRequests++;
        
        const rule = this.routingRules.get(path);
        let transformedPath = path;
        let transformedData = data;

        // Apply path transformation
        if (rule && rule.pathTransformation) {
            transformedPath = rule.pathTransformation(path);
        }

        // Apply data transformation
        if (rule && rule.dataTransformation && rule.dataTransformation.request) {
            transformedData = rule.dataTransformation.request(data);
        }

        const url = `${this.modernService.baseUrl}${transformedPath}`;
        const config = {
            method: method.toLowerCase(),
            url,
            data: transformedData,
            headers: {
                ...headers,
                'X-Request-ID': context.requestId,
                'X-Source': 'strangler-fig-modern'
            },
            timeout: this.defaultTimeout
        };

        const response = await axios(config);
        
        // Apply response transformation
        let responseData = response.data;
        if (rule && rule.dataTransformation && rule.dataTransformation.response) {
            responseData = rule.dataTransformation.response(responseData);
        }

        return {
            data: responseData,
            status: response.status,
            headers: response.headers,
            source: 'modern',
            service: this.modernService.name
        };
    }

    // Call legacy service
    async callLegacyService(path, method, data, headers, context) {
        this.metrics.legacyRequests++;

        const rule = this.routingRules.get(path);
        let transformedData = data;

        // Legacy systems might need different data format
        if (rule && rule.legacyDataTransformation) {
            transformedData = rule.legacyDataTransformation(data);
        }

        const url = `${this.legacyService.baseUrl}${path}`;
        const config = {
            method: method.toLowerCase(),
            url,
            data: transformedData,
            headers: {
                ...headers,
                'X-Request-ID': context.requestId,
                'X-Source': 'strangler-fig-legacy'
            },
            timeout: this.defaultTimeout
        };

        const response = await axios(config);

        return {
            data: response.data,
            status: response.status,
            headers: response.headers,
            source: 'legacy',
            service: this.legacyService.name
        };
    }

    // Update migration percentage for a path
    updateMigrationPercentage(path, percentage) {
        const rule = this.routingRules.get(path);
        if (rule) {
            rule.modernPercentage = Math.max(0, Math.min(100, percentage));
            this.updateOverallMigrationPercentage();
        }
    }

    // Calculate overall migration percentage
    updateOverallMigrationPercentage() {
        const rules = Array.from(this.routingRules.values());
        if (rules.length === 0) {
            this.metrics.migrationPercentage = 0;
            return;
        }

        const totalPercentage = rules.reduce((sum, rule) => sum + rule.modernPercentage, 0);
        this.metrics.migrationPercentage = totalPercentage / rules.length;
    }

    // Enable feature flag for complete migration
    enableModernService(path) {
        this.featureFlags.set(`modern-${path}`, true);
    }

    // Disable modern service (rollback)
    disableModernService(path) {
        this.featureFlags.set(`modern-${path}`, false);
    }

    // Get migration metrics
    getMetrics() {
        const total = this.metrics.legacyRequests + this.metrics.modernRequests;
        return {
            ...this.metrics,
            totalRequests: total,
            modernPercentage: total > 0 ? (this.metrics.modernRequests / total) * 100 : 0,
            legacyPercentage: total > 0 ? (this.metrics.legacyRequests / total) * 100 : 0,
            errorRate: total > 0 ? (this.metrics.errors / total) * 100 : 0,
            routes: Array.from(this.routingRules.entries()).map(([path, rule]) => ({
                path,
                modernPercentage: rule.modernPercentage,
                userBasedRouting: rule.userBasedRouting
            }))
        };
    }

    // Health check
    async healthCheck() {
        const health = {
            status: 'UP',
            legacy: { status: 'UNKNOWN' },
            modern: { status: 'UNKNOWN' },
            migration: this.metrics.migrationPercentage
        };

        try {
            // Check legacy service
            if (this.legacyService.healthCheck) {
                const legacyResponse = await axios.get(
                    `${this.legacyService.baseUrl}${this.legacyService.healthCheck}`,
                    { timeout: 5000 }
                );
                health.legacy.status = legacyResponse.status === 200 ? 'UP' : 'DOWN';
            }
        } catch (error) {
            health.legacy.status = 'DOWN';
            health.legacy.error = error.message;
        }

        try {
            // Check modern service
            if (this.modernService.healthCheck) {
                const modernResponse = await axios.get(
                    `${this.modernService.baseUrl}${this.modernService.healthCheck}`,
                    { timeout: 5000 }
                );
                health.modern.status = modernResponse.status === 200 ? 'UP' : 'DOWN';
            }
        } catch (error) {
            health.modern.status = 'DOWN';
            health.modern.error = error.message;
        }

        // Overall status
        if (health.legacy.status === 'DOWN' && health.modern.status === 'DOWN') {
            health.status = 'DOWN';
        } else if (health.legacy.status === 'DOWN' || health.modern.status === 'DOWN') {
            health.status = 'DEGRADED';
        }

        return health;
    }
}

// Express middleware for Strangler Fig pattern
function createStranglerMiddleware(stranglerProxy) {
    return async (req, res, next) => {
        try {
            const context = {
                requestId: req.headers['x-request-id'] || uuidv4(),
                userId: req.headers['x-user-id'],
                ip: req.ip
            };

            const result = await stranglerProxy.proxy(
                req.path,
                req.method,
                req.body,
                req.headers,
                context
            );

            // Set response headers
            Object.entries(result.headers || {}).forEach(([key, value]) => {
                if (!key.toLowerCase().startsWith('x-')) {
                    res.setHeader(key, value);
                }
            });

            res.setHeader('X-Source-Service', result.source);
            res.setHeader('X-Service-Name', result.service);
            res.status(result.status).json(result.data);

        } catch (error) {
            console.error('Strangler proxy error:', error);
            res.status(500).json({
                error: 'Proxy Error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    };
}

// Example configuration for microservices migration
class MicroserviceStranglerFig extends StranglerFigProxy {
    constructor() {
        super({
            legacyService: {
                name: 'legacy-monolith',
                baseUrl: 'http://legacy-service:8080',
                healthCheck: '/health'
            },
            modernService: {
                name: 'modern-microservice',
                baseUrl: 'http://modern-service:3000',
                healthCheck: '/health'
            },
            timeout: 30000
        });

        this.setupMigrationRules();
    }

    setupMigrationRules() {
        // User service migration - 25% to modern
        this.addRoutingRule('/api/users', {
            modernPercentage: 25,
            userBasedRouting: true,
            pathTransformation: (path) => path.replace('/api/users', '/users/v2'),
            dataTransformation: {
                request: (data) => ({
                    ...data,
                    version: '2.0',
                    migrated: true
                }),
                response: (data) => ({
                    ...data,
                    source: 'modern-service'
                })
            },
            fallbackToLegacy: true
        });

        // Order service migration - 50% to modern
        this.addRoutingRule('/api/orders', {
            modernPercentage: 50,
            userBasedRouting: false,
            pathTransformation: (path) => path.replace('/api/orders', '/orders'),
            legacyDataTransformation: (data) => ({
                // Legacy format
                order_data: data,
                legacy_format: true
            }),
            dataTransformation: {
                request: (data) => ({
                    // Modern format
                    orderData: data,
                    modernFormat: true
                })
            }
        });

        // Payment service - fully migrated
        this.addRoutingRule('/api/payments', {
            modernPercentage: 100,
            pathTransformation: (path) => path.replace('/api/payments', '/payments/v3')
        });

        // Admin endpoints - stay on legacy for now
        this.addRoutingRule('/api/admin', {
            modernPercentage: 0
        });
    }

    // Gradual migration plan
    async executeMigrationPlan() {
        const migrationSteps = [
            { path: '/api/users', percentage: 10, delay: 1000 },
            { path: '/api/users', percentage: 25, delay: 5000 },
            { path: '/api/orders', percentage: 25, delay: 3000 },
            { path: '/api/users', percentage: 50, delay: 5000 },
            { path: '/api/orders', percentage: 50, delay: 3000 },
            { path: '/api/users', percentage: 75, delay: 5000 },
            { path: '/api/orders', percentage: 75, delay: 3000 },
            { path: '/api/users', percentage: 100, delay: 5000 },
            { path: '/api/orders', percentage: 100, delay: 3000 }
        ];

        for (const step of migrationSteps) {
            console.log(`Migrating ${step.path} to ${step.percentage}%`);
            this.updateMigrationPercentage(step.path, step.percentage);
            
            // Wait and monitor
            await new Promise(resolve => setTimeout(resolve, step.delay));
            
            // Check health and metrics
            const health = await this.healthCheck();
            const metrics = this.getMetrics();
            
            console.log(`Health: ${health.status}, Error Rate: ${metrics.errorRate.toFixed(2)}%`);
            
            // Rollback if error rate is too high
            if (metrics.errorRate > 5) {
                console.log(`High error rate detected, rolling back ${step.path}`);
                this.updateMigrationPercentage(step.path, Math.max(0, step.percentage - 25));
                break;
            }
        }
    }
}

module.exports = {
    StranglerFigProxy,
    createStranglerMiddleware,
    MicroserviceStranglerFig
};