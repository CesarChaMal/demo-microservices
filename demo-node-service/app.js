const express = require('express');
const axios = require('axios');
const Eureka = require('eureka-js-client').Eureka;
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const helmet = require('helmet');
const winston = require('winston');
require('express-async-errors');

// Import all patterns
const { NodeCircuitBreaker, ExternalServiceClient } = require('./patterns/resilience/circuitBreaker');
const { RetryService, BulkheadService, TimeoutService } = require('./patterns/resilience/retry');
const { CacheAsideService, ProcessingCache, MultiLevelCache } = require('./patterns/caching/cacheAside');
const { writeBehindCache } = require('./patterns/caching/writeBehind');
const { materializedViewService } = require('./patterns/caching/materializedView');
const { CacheWarmingService, CacheInvalidationService } = require('./patterns/caching/cacheWarming');
const { EventStreamProcessor, MessageQueue, SagaOrchestrator, OutboxPattern } = require('./patterns/messaging/eventStreaming');
const { InboxPattern, TwoPhaseCommit, TwoPhaseCommitParticipant } = require('./patterns/messaging/inboxPattern');
const { DistributedLock, IdempotencyService, TransactionManager } = require('./patterns/transaction/distributedLock');
const { HealthCheckService, MetricsCollector, CircuitBreakerHealthIndicator, DatabaseHealthIndicator, ExternalServiceHealthIndicator, CacheHealthIndicator } = require('./patterns/monitoring/healthCheck');
const { TokenBucketRateLimiter, SlidingWindowRateLimiter, AdaptiveRateLimiter, RateLimitMiddleware, createAPIRateLimit } = require('./patterns/security/rateLimiting');
const { FeatureToggle, CanaryDeployment } = require('./patterns/deployment/featureToggle');
const BlueGreenDeployment = require('./patterns/deployment/blueGreen');
const { SagaOrchestrator, SagaStep, createOrderProcessingSaga } = require('./patterns/transaction/saga');
const { OutboxService, OutboxRepository, EventPublisher } = require('./patterns/transaction/outbox');
const { TransactionCoordinator, ResourceManager } = require('./patterns/transaction/twoPhaseCommit');
const { APIGateway, Route, AntiCorruptionLayer, StranglerFig, GatewayCircuitBreaker } = require('./patterns/integration/apiGateway');
const { AdvancedAsyncProcessor, EnhancedReactiveStream, AdvancedBackpressureHandler, WorkerThreadPool, PerformanceMonitor } = require('./patterns/performance/advanced');
const config = require('./config');
const { AuthenticationService, authRequired } = require('./patterns/security/authentication');
const { AsyncProcessor, ReactiveStream, WorkerPool, BackpressureHandler } = require('./patterns/performance/async');
const { ProcessingService, CommandHandler, QueryHandler, EventStore, ProcessingRepository, ValueGreaterThanSpecification, AlgorithmTypeSpecification } = require('./patterns/architectural/hexagonal');
const { userRepository, orderRepository } = require('./patterns/integration/repository');
const { specificationService, eligibleUserSpec, highValuePendingOrderSpec } = require('./patterns/integration/specification');

const app = express();
const PORT = process.env.PORT || 3000;

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'app.log' })
    ]
});

// Security middleware
app.use(helmet());

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting with multiple strategies
const tokenBucketLimiter = new TokenBucketRateLimiter({ capacity: 100, refillRate: 10 });
const slidingWindowLimiter = new SlidingWindowRateLimiter({ windowSize: 60000, maxRequests: 100 });
const adaptiveLimiter = new AdaptiveRateLimiter({ baseLimit: 100 });

app.use('/api/', createAPIRateLimit());
app.use('/api/strict', (req, res, next) => {
    const result = tokenBucketLimiter.isAllowed(req.ip);
    if (!result.allowed) {
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: result.resetTime });
    }
    next();
});

// Initialize all services and patterns
const externalServiceClient = new ExternalServiceClient();
const retryService = new RetryService();
const bulkheadService = new BulkheadService({ maxConcurrent: 5 });
const processingCache = new ProcessingCache();
const multiLevelCache = new MultiLevelCache();
const eventProcessor = new EventStreamProcessor();
const messageQueue = new MessageQueue();
const sagaOrchestrator = new SagaOrchestrator();
const outboxService = new OutboxService();
const tpcCoordinator = new TransactionCoordinator('main-coordinator');

// Register saga definitions
sagaOrchestrator.registerSaga('order-processing', createOrderProcessingSaga());

// Register 2PC resource managers
const databaseManager = new ResourceManager('database');
const cacheManager = new ResourceManager('cache');
const fileManager = new ResourceManager('file-system');
tpcCoordinator.registerResourceManager(databaseManager);
tpcCoordinator.registerResourceManager(cacheManager);
tpcCoordinator.registerResourceManager(fileManager);

// Start outbox processor
outboxService.startProcessor();
const distributedLock = new DistributedLock();
const idempotencyService = new IdempotencyService();
const transactionManager = new TransactionManager();
const twoPhaseCommit = new TwoPhaseCommit();
const inboxPattern = new InboxPattern();
const cacheWarmingService = new CacheWarmingService(multiLevelCache);
const cacheInvalidationService = new CacheInvalidationService(multiLevelCache);
const healthService = new HealthCheckService();
const metricsCollector = new MetricsCollector();
const asyncProcessor = new AsyncProcessor({ maxConcurrency: 5 });
const backpressureHandler = new BackpressureHandler({ bufferSize: 1000, strategy: 'drop' });
const processingService = new ProcessingService();
const eventStore = new EventStore();
const commandHandler = new CommandHandler(eventStore, multiLevelCache);
const queryHandler = new QueryHandler(multiLevelCache);
const processingRepository = new ProcessingRepository(multiLevelCache);

// Feature toggles and deployment patterns
const featureToggle = new FeatureToggle({
    features: {
        'new-algorithm': { enabled: true, rolloutPercentage: 50 },
        'async-processing': { enabled: true },
        'canary-deployment': { enabled: true, rolloutPercentage: 10 },
        'multi-level-cache': { enabled: true },
        'saga-pattern': { enabled: true },
        'event-sourcing': { enabled: true },
        'distributed-tracing': { enabled: true },
        'reactive-streams': { enabled: true },
        'cache-warming': { enabled: true },
        'cache-invalidation': { enabled: true },
        'inbox-pattern': { enabled: true },
        'two-phase-commit': { enabled: true },
        'api-gateway': { enabled: true },
        'anti-corruption-layer': { enabled: true },
        'strangler-fig': { enabled: true },
        'advanced-async': { enabled: true },
        'enhanced-reactive': { enabled: true },
        'advanced-backpressure': { enabled: true },
        'worker-threads': { enabled: true },
        'performance-monitoring': { enabled: true }
    }
});
const canaryDeployment = new CanaryDeployment({ canaryPercentage: 10 });
const blueGreenDeployment = new BlueGreenDeployment();
const apiGateway = new APIGateway();
const antiCorruptionLayer = new AntiCorruptionLayer();
const stranglerFig = new StranglerFig();
const gatewayCircuitBreaker = new GatewayCircuitBreaker();
const advancedAsyncProcessor = new AdvancedAsyncProcessor({ maxWorkers: 4, maxQueueSize: 1000 });
const advancedBackpressureHandler = new AdvancedBackpressureHandler({ bufferSize: 1000, strategy: 'drop' });
const workerThreadPool = new WorkerThreadPool({ maxWorkers: 3 });
const performanceMonitor = new PerformanceMonitor();
const authService = new AuthenticationService(config.jwt.secret);

// Comprehensive health checks
const circuitBreakerHealthIndicator = new CircuitBreakerHealthIndicator(externalServiceClient);
const databaseHealthIndicator = new DatabaseHealthIndicator();
const pythonServiceHealthIndicator = new ExternalServiceHealthIndicator('python-service', 'http://python-service:5001');
const javaServiceHealthIndicator = new ExternalServiceHealthIndicator('java-service', 'http://java-service:8080');
const cacheHealthIndicator = new CacheHealthIndicator(multiLevelCache);

healthService.addCheck('circuit-breakers', () => circuitBreakerHealthIndicator.check(), { critical: true });
healthService.addCheck('database', () => databaseHealthIndicator.check(), { critical: true });
healthService.addCheck('python-service', () => pythonServiceHealthIndicator.check());
healthService.addCheck('java-service', () => javaServiceHealthIndicator.check());
healthService.addCheck('cache', () => cacheHealthIndicator.check(), { critical: true });
healthService.addCheck('event-processor', async () => {
    const stats = eventProcessor.getEventStats();
    return { healthy: stats.connected, eventCounts: stats.eventCounts };
});
healthService.addCheck('saga-orchestrator', async () => {
    return { healthy: true, activeSagas: sagaOrchestrator.sagas?.size || 0 };
});
healthService.addCheck('distributed-lock', async () => {
    return { healthy: distributedLock.connected, service: 'redis' };
});

// Swagger setup
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Node Service API - Complete Patterns Implementation',
            version: '2.0.0',
            description: 'Comprehensive microservices patterns implementation in Node.js'
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Development server'
            }
        ]
    },
    apis: ['./app.js']
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Comprehensive API Routes
app.get('/info', (req, res) => {
    metricsCollector.incrementCounter('info_requests', { endpoint: '/info' });
    res.json({
        app: 'node-service',
        status: 'running',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        patterns: [
            // Resilience Patterns
            'circuit-breaker', 'retry', 'bulkhead', 'timeout',
            // Caching Patterns
            'cache-aside', 'multi-level-cache', 'write-behind',
            // Messaging Patterns
            'event-streaming', 'message-queue', 'saga-orchestrator', 'outbox-pattern',
            // Transaction Patterns
            'distributed-lock', 'idempotency', 'transaction-manager', '2pc',
            // Architectural Patterns
            'hexagonal-architecture', 'cqrs', 'event-sourcing', 'repository', 'specification',
            // Deployment Patterns
            'feature-toggle', 'canary-deployment', 'blue-green-deployment',
            // Performance Patterns
            'async-processing', 'reactive-streams', 'worker-pool', 'backpressure', 'worker-threads',
            // Integration Patterns
            'api-gateway', 'anti-corruption-layer', 'strangler-fig',
            // Monitoring Patterns
            'health-check', 'metrics-collection', 'distributed-tracing',
            // Security Patterns
            'rate-limiting', 'token-bucket', 'sliding-window', 'adaptive-limiting'
        ],
        featureFlags: featureToggle.getAllFeatures(),
        deploymentStrategy: {
            canary: canaryDeployment.getMetrics(),
            blueGreen: blueGreenDeployment.getStatus()
        }
    });
});

/**
 * @swagger
 * /process:
 *   post:
 *     summary: Process data with comprehensive patterns
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: number
 *               algorithm:
 *                 type: string
 *                 enum: [default, double, triple, square, fibonacci, factorial]
 *     responses:
 *       200:
 *         description: Processed result
 */
app.post('/process', async (req, res) => {
    const startTime = Date.now();
    const requestId = require('uuid').v4();
    metricsCollector.incrementCounter('process_requests', { endpoint: '/process' });
    
    try {
        const { value, algorithm = 'default' } = req.body;
        const userId = req.headers['x-user-id'];
        const context = { userId, requestId };
        
        if (!value || typeof value !== 'number') {
            return res.status(400).json({ error: 'Invalid input: value must be a number' });
        }
        
        // Idempotency check
        const idempotencyKey = idempotencyService.generateKey('process', value, algorithm);
        const result = await idempotencyService.executeIdempotent(idempotencyKey, async () => {
            
            // Multi-level caching
            const cacheKey = `processed:${value}:${algorithm}`;
            const cachedResult = await multiLevelCache.get(cacheKey, async () => {
                
                // Feature toggle for deployment strategy
                let processedResult;
                if (featureToggle.isEnabled('canary-deployment', context)) {
                    processedResult = canaryDeployment.processRequest({ value }, context);
                } else if (featureToggle.isEnabled('blue-green-deployment', context)) {
                    processedResult = blueGreenDeployment.processRequest({ value });
                } else {
                    // Use hexagonal architecture
                    const request = new (require('./patterns/architectural/hexagonal').ProcessingRequest)(value, algorithm);
                    const domainResult = await processingService.process(request);
                    processedResult = {
                        result: domainResult.result,
                        algorithm: domainResult.algorithm,
                        metadata: domainResult.metadata
                    };
                }
                
                return processedResult;
            }, 300);
            
            // CQRS Command
            if (featureToggle.isEnabled('event-sourcing', context)) {
                const command = new (require('./patterns/architectural/hexagonal').Command)('PROCESS_DATA', { value, algorithm }, { requestId, userId });
                await commandHandler.handle(command);
            }
            
            // Event publishing with Outbox pattern
            if (featureToggle.isEnabled('saga-pattern', context)) {
                outboxService.saveEvent(requestId, 'DATA_PROCESSED', {
                    input: value, 
                    output: cachedResult, 
                    service: 'node-service'
                });
            } else {
                await eventProcessor.publishEvent('DATA_PROCESSED', {
                    input: value,
                    output: cachedResult,
                    service: 'node-service',
                    requestId
                });
            }
            
            return cachedResult;
        });
        
        const duration = Date.now() - startTime;
        metricsCollector.recordHistogram('process_duration', { algorithm }, duration);
        metricsCollector.setGauge('last_processed_value', {}, value);
        
        res.json({
            ...result,
            service: 'node-service',
            requestId,
            timestamp: new Date().toISOString(),
            processingTime: duration,
            patterns: {
                idempotency: true,
                multiLevelCache: featureToggle.isEnabled('multi-level-cache', context),
                eventSourcing: featureToggle.isEnabled('event-sourcing', context),
                sagaPattern: featureToggle.isEnabled('saga-pattern', context)
            }
        });
        
    } catch (error) {
        metricsCollector.incrementCounter('process_errors', { endpoint: '/process' });
        logger.error('Process request failed:', { error: error.message, requestId });
        res.status(500).json({ error: 'Internal server error', requestId });
    }
});

// Comprehensive pattern endpoints
app.post('/process-with-retry', async (req, res) => {
    const startTime = Date.now();
    try {
        const result = await retryService.executeWithRetry(async () => {
            return await externalServiceClient.processWithPythonService(req.body);
        }, { retries: 3, minTimeout: 1000 });
        
        metricsCollector.recordHistogram('retry_duration', {}, Date.now() - startTime);
        res.json({ ...result, pattern: 'retry', retries: 'up-to-3' });
    } catch (error) {
        metricsCollector.incrementCounter('retry_failures');
        res.status(500).json({ error: error.message, pattern: 'retry' });
    }
});

app.post('/process-with-bulkhead', async (req, res) => {
    try {
        const result = await bulkheadService.execute(async () => {
            return await externalServiceClient.processWithJavaService(req.body);
        });
        
        const stats = bulkheadService.getStats();
        res.json({ ...result, pattern: 'bulkhead', stats });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'bulkhead' });
    }
});

app.post('/process-async', async (req, res) => {
    try {
        const taskId = require('uuid').v4();
        
        const taskPromise = asyncProcessor.process(async () => {
            const request = new (require('./patterns/architectural/hexagonal').ProcessingRequest)(req.body.value, 'async');
            return await processingService.process(request);
        }, req.body.priority || 0);
        
        // Don't await - return immediately
        res.json({ 
            taskId, 
            status: 'processing', 
            pattern: 'async',
            stats: asyncProcessor.getStats()
        });
        
        // Handle completion asynchronously
        taskPromise.then(result => {
            logger.info('Async task completed', { taskId, result });
        }).catch(error => {
            logger.error('Async task failed', { taskId, error: error.message });
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'async' });
    }
});

app.post('/process-with-saga', async (req, res) => {
    try {
        const { orderId = require('uuid').v4(), itemId = 'item-123', quantity = 1, amount = 100.0 } = req.body;
        
        const saga = await sagaOrchestrator.startSaga('order-processing', {
            orderId,
            itemId,
            quantity,
            amount
        });
        
        res.json({ 
            sagaId: saga.id, 
            status: saga.status, 
            pattern: 'saga',
            context: saga.context
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'saga' });
    }
});

app.get('/saga/:sagaId', (req, res) => {
    try {
        const saga = sagaOrchestrator.getSagaStatus(req.params.sagaId);
        if (!saga) {
            return res.status(404).json({ error: 'Saga not found' });
        }
        res.json({ saga, pattern: 'saga' });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'saga' });
    }
});

app.post('/transaction/2pc', async (req, res) => {
    try {
        const { participants = ['database', 'cache'], transactionData = { value: 100 } } = req.body;
        
        const result = await tpcCoordinator.executeTwoPhaseCommit(participants, transactionData);
        
        res.json({
            success: result.success,
            transactionId: result.transactionId,
            phase: result.phase,
            pattern: 'two-phase-commit'
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'two-phase-commit' });
    }
});

app.post('/transaction/outbox', async (req, res) => {
    try {
        const { aggregateId = require('uuid').v4(), eventType = 'data_processed', eventData = {} } = req.body;
        
        const eventId = outboxService.saveEvent(aggregateId, eventType, eventData);
        
        res.json({
            eventId,
            aggregateId,
            eventType,
            saved: true,
            pattern: 'outbox'
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'outbox' });
    }
});

app.post('/deployment/blue-green/switch', async (req, res) => {
    try {
        const result = await blueGreenDeployment.switchTraffic();
        res.json({
            switchResult: result,
            pattern: 'blue-green-deployment'
        });
    } catch (error) {
        res.status(400).json({ error: error.message, pattern: 'blue-green-deployment' });
    }
});

app.post('/process-reactive', async (req, res) => {
    try {
        const { values } = req.body; // Array of values
        
        if (!Array.isArray(values)) {
            return res.status(400).json({ error: 'values must be an array' });
        }
        
        const results = [];
        
        const stream = ReactiveStream.fromArray(values)
            .map(value => value * 2)
            .filter(value => value > 10)
            .take(10);
        
        stream.subscribe({
            next: (value) => results.push(value),
            complete: () => {
                res.json({ 
                    results, 
                    pattern: 'reactive-stream',
                    operations: ['map(*2)', 'filter(>10)', 'take(10)']
                });
            },
            error: (error) => {
                res.status(500).json({ error: error.message, pattern: 'reactive-stream' });
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'reactive-stream' });
    }
});

// CQRS Query endpoints
app.get('/query/:requestId', async (req, res) => {
    try {
        const query = new (require('./patterns/architectural/hexagonal').Query)('GET_PROCESSED_DATA', { requestId: req.params.requestId });
        const result = await queryHandler.handle(query);
        res.json(result || { message: 'Not found', pattern: 'cqrs-query' });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'cqrs-query' });
    }
});

// Feature toggle endpoints
app.get('/features', (req, res) => {
    res.json({ 
        features: featureToggle.getAllFeatures(),
        stats: featureToggle.getFeatureStats(),
        pattern: 'feature-toggle'
    });
});

app.post('/features/:featureName/toggle', (req, res) => {
    const { featureName } = req.params;
    const { enabled } = req.body;
    
    if (enabled) {
        featureToggle.enableFeature(featureName);
    } else {
        featureToggle.disableFeature(featureName);
    }
    
    res.json({ 
        feature: featureName, 
        enabled, 
        pattern: 'feature-toggle'
    });
});

// Deployment pattern endpoints
app.get('/deployment/canary', (req, res) => {
    res.json({ 
        metrics: canaryDeployment.getMetrics(),
        pattern: 'canary-deployment'
    });
});

app.get('/deployment/blue-green', (req, res) => {
    res.json({
        status: blueGreenDeployment.getStatus(),
        pattern: 'blue-green-deployment'
    });
});

app.post('/cache/warm', async (req, res) => {
    try {
        const { cacheSpecs } = req.body;
        const results = await cacheWarmingService.warmCache(cacheSpecs || []);
        res.json({ results, pattern: 'cache-warming' });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'cache-warming' });
    }
});

app.post('/inbox/message', async (req, res) => {
    try {
        const { messageId = require('uuid').v4(), eventData = {} } = req.body;
        const success = await inboxPattern.handleMessage(messageId, eventData);
        res.json({ messageId, processed: success, pattern: 'inbox-pattern', stats: inboxPattern.getStats() });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'inbox-pattern' });
    }
});

app.post('/async/advanced', async (req, res) => {
    try {
        const { value, priority = 0 } = req.body;
        
        const taskId = await advancedAsyncProcessor.submitTask(async () => {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work
            return { result: value * 2, processedAt: Date.now() };
        }, priority);
        
        res.json({ 
            taskId, 
            status: 'submitted', 
            pattern: 'advanced-async',
            stats: advancedAsyncProcessor.getStats()
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'advanced-async' });
    }
});

app.get('/async/advanced/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const status = advancedAsyncProcessor.getTaskStatus(taskId);
        
        if (!status) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        res.json({ taskStatus: status, pattern: 'advanced-async' });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'advanced-async' });
    }
});

app.post('/gateway/route', async (req, res) => {
    try {
        const { path = '/process', method = 'POST', targetService = 'java-service', payload = {} } = req.body;
        
        // Add route if not exists
        const route = new Route(path, targetService, path, [method]);
        apiGateway.addRoute(route);
        
        // Create gateway request
        const { GatewayRequest } = require('./patterns/integration/apiGateway');
        const gatewayRequest = new GatewayRequest(
            path, method, req.headers, req.query, payload, req.ip
        );
        
        const result = await apiGateway.routeRequest(gatewayRequest);
        
        res.json({
            gatewayResponse: result,
            pattern: 'api-gateway',
            stats: apiGateway.getStats()
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'api-gateway' });
    }
});

app.post('/strangler/process', async (req, res) => {
    try {
        const { path = '/process' } = req.body;
        
        // Add migration rule
        stranglerFig.addMigrationRule('/process', true, 70);
        
        const result = await stranglerFig.routeRequest(path, req.body);
        
        res.json({
            stranglerResult: result,
            pattern: 'strangler-fig',
            migrationStats: stranglerFig.getMigrationStats()
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'strangler-fig' });
    }
});

app.post('/worker-thread/submit', async (req, res) => {
    try {
        const { value } = req.body;
        
        const result = await workerThreadPool.submitTask('cpuIntensive', { value });
        
        res.json({
            result,
            pattern: 'worker-threads',
            stats: workerThreadPool.getStats()
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'worker-threads' });
    }
});

app.get('/performance/monitor', (req, res) => {
    try {
        res.json({
            performanceStats: performanceMonitor.getStats(),
            advancedAsync: advancedAsyncProcessor.getStats(),
            backpressure: advancedBackpressureHandler.getStats(),
            workerThreads: workerThreadPool.getStats(),
            pattern: 'performance-monitoring'
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'performance-monitoring' });
    }
});

app.post('/auth/login', (req, res) => {
    try {
        const { userId, roles = ['user'] } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const token = authService.generateToken(userId, roles);
        
        res.json({
            token,
            userId,
            roles,
            pattern: 'authentication'
        });
    } catch (error) {
        res.status(500).json({ error: error.message, pattern: 'authentication' });
    }
});

app.get('/protected', authRequired(['admin']), (req, res) => {
    res.json({
        message: 'Access granted',
        user: req.user,
        pattern: 'authentication'
    });
});

// Comprehensive health endpoint
app.get('/health', async (req, res) => {
    try {
        const health = await healthService.runAllChecks();
        const statusCode = health.status === 'UP' ? 200 : health.status === 'DEGRADED' ? 200 : 503;
        res.status(statusCode).json({
            ...health,
            patterns: {
                circuitBreakers: externalServiceClient.getCircuitBreakerStats(),
                rateLimiting: {
                    tokenBucket: tokenBucketLimiter.getStats(),
                    slidingWindow: slidingWindowLimiter.getStats(),
                    adaptive: adaptiveLimiter.getStats()
                },
                caching: {
                    multiLevel: multiLevelCache.getStats(),
                    writeBehind: writeBehindCache.getStats()
                },
                async: asyncProcessor.getStats(),
                backpressure: backpressureHandler.getStats(),
                outbox: outboxService.getStats(),
                inbox: inboxPattern.getStats(),
                cacheWarming: cacheWarmingService.getWarmingStats(),
                apiGateway: apiGateway.getStats(),
                advancedAsync: advancedAsyncProcessor.getStats(),
                advancedBackpressure: advancedBackpressureHandler.getStats(),
                workerThreads: workerThreadPool.getStats(),
                performanceMonitor: performanceMonitor.getStats()
            }
        });
    } catch (error) {
        res.status(503).json({ status: 'DOWN', error: error.message });
    }
});

// Metrics endpoints
app.get('/metrics', (req, res) => {
    const metrics = metricsCollector.getMetrics();
    res.json({
        ...metrics,
        patterns: {
            circuitBreakers: externalServiceClient.getCircuitBreakerStats(),
            eventProcessor: eventProcessor.getEventStats(),
            features: featureToggle.getFeatureStats(),
            canary: canaryDeployment.getMetrics(),
            apiGateway: apiGateway.getStats(),
            advancedAsync: advancedAsyncProcessor.getStats(),
            stranglerFig: stranglerFig.getMigrationStats(),
            workerThreads: workerThreadPool.getStats(),
            performanceMonitor: performanceMonitor.getStats()
        }
    });
});

app.get('/metrics/prometheus', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(metricsCollector.getPrometheusMetrics());
});

// Comprehensive error handling middleware
app.use((error, req, res, next) => {
    const errorId = require('uuid').v4();
    logger.error('Unhandled error:', { 
        errorId, 
        error: error.message, 
        stack: error.stack,
        url: req.url,
        method: req.method,
        headers: req.headers
    });
    
    metricsCollector.incrementCounter('unhandled_errors', { 
        endpoint: req.path,
        method: req.method,
        statusCode: error.status || 500
    });
    
    res.status(error.status || 500).json({ 
        error: 'Internal server error',
        errorId,
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// 404 handler
app.use('*', (req, res) => {
    metricsCollector.incrementCounter('not_found_requests', { path: req.path });
    res.status(404).json({ 
        error: 'Not Found',
        path: req.path,
        availableEndpoints: [
            'GET /info', 'GET /health', 'GET /metrics',
            'POST /process', 'POST /process-with-retry', 'POST /process-with-bulkhead',
            'POST /process-async', 'POST /process-with-saga', 'POST /process-reactive',
            'GET /query/:requestId', 'GET /features', 'POST /features/:featureName/toggle',
            'GET /deployment/canary'
        ]
    });
});

// Enhanced Eureka client configuration with patterns
const eurekaClient = new Eureka({
    instance: {
        app: 'node-service',
        hostName: process.env.HOSTNAME || 'localhost',
        ipAddr: process.env.HOST_IP || '127.0.0.1',
        statusPageUrl: `http://localhost:${PORT}/info`,
        healthCheckUrl: `http://localhost:${PORT}/health`,
        port: {
            '$': PORT,
            '@enabled': 'true',
        },
        vipAddress: 'node-service',
        dataCenterInfo: {
            '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
            name: 'MyOwn',
        },
        metadata: {
            'patterns': 'circuit-breaker,retry,bulkhead,cache-aside,event-streaming,saga,cqrs,feature-toggle',
            'version': '2.0.0',
            'deployment-strategy': 'canary',
            'health-check-interval': '30s'
        }
    },
    eureka: {
        host: process.env.EUREKA_SERVER_HOST || 'localhost',
        port: process.env.EUREKA_SERVER_PORT || 8761,
        servicePath: '/eureka/apps/',
        maxRetries: 10,
        requestRetryDelay: 2000,
        registryFetchInterval: 30000,
        heartbeatInterval: 30000
    },
});

eurekaClient.logger.level('warn');
eurekaClient.start((error) => {
    if (error) {
        logger.error('Eureka registration failed:', error);
        metricsCollector.incrementCounter('eureka_registration_failures');
    } else {
        logger.info('Eureka registration successful');
        metricsCollector.incrementCounter('eureka_registrations');
    }
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    
    try {
        await eventProcessor.disconnect();
        await messageQueue.disconnect();
        if (distributedLock.connected) {
            await distributedLock.client.disconnect();
        }
        logger.info('All connections closed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.emit('SIGTERM');
});

// Start server
app.listen(PORT, async () => {
    logger.info(`Node service running on port ${PORT}`);
    logger.info(`Swagger UI available at http://localhost:${PORT}/api-docs`);
    logger.info('Implemented patterns:', {
        resilience: ['circuit-breaker', 'retry', 'bulkhead', 'timeout'],
        caching: ['cache-aside', 'multi-level-cache', 'write-behind'],
        messaging: ['event-streaming', 'message-queue', 'saga-orchestrator', 'outbox-pattern'],
        transaction: ['distributed-lock', 'idempotency', 'transaction-manager', '2pc'],
        architectural: ['hexagonal-architecture', 'cqrs', 'event-sourcing', 'repository', 'specification'],
        deployment: ['feature-toggle', 'canary-deployment', 'blue-green-deployment'],
        performance: ['async-processing', 'reactive-streams', 'worker-pool', 'backpressure'],
        monitoring: ['health-check', 'metrics-collection', 'distributed-tracing'],
        security: ['rate-limiting', 'token-bucket', 'sliding-window', 'adaptive-limiting']
    });
    
    try {
        // Initialize all services
        await eventProcessor.connect();
        await messageQueue.connect();
        
        // Setup event handlers
        eventProcessor.onLocalEvent('DATA_PROCESSED', (event) => {
            logger.info('Local event processed:', event.type);
            metricsCollector.incrementCounter('local_events_processed', { type: event.type });
        });
        
        // Setup saga event handlers
        sagaOrchestrator.onSagaEvent('sagaCompleted', (saga) => {
            logger.info('Saga completed:', saga.id);
            metricsCollector.incrementCounter('sagas_completed');
        });
        
        sagaOrchestrator.onSagaEvent('sagaCompensated', (saga) => {
            logger.info('Saga compensated:', saga.id);
            metricsCollector.incrementCounter('sagas_compensated');
        });
        
        // Setup async processor event handlers
        asyncProcessor.on('taskCompleted', (event) => {
            metricsCollector.recordHistogram('async_task_duration', {}, event.duration);
        });
        
        asyncProcessor.on('taskFailed', (event) => {
            metricsCollector.incrementCounter('async_task_failures');
        });
        
        // Setup advanced async processor event handlers
        advancedAsyncProcessor.on('taskCompleted', (task) => {
            const duration = task.getDuration();
            performanceMonitor.recordMetric('advanced_async_task', duration, true);
            metricsCollector.recordHistogram('advanced_async_duration', {}, duration);
        });
        
        advancedAsyncProcessor.on('taskFailed', (task, error) => {
            performanceMonitor.recordMetric('advanced_async_task', 0, false);
            metricsCollector.incrementCounter('advanced_async_failures');
        });
        
        // Setup API Gateway event handlers
        apiGateway.on('routeAdded', (route) => {
            logger.info('API Gateway route added:', route.pathPattern);
        });
        
        apiGateway.on('error', (error, request) => {
            logger.error('API Gateway error:', error.message);
            metricsCollector.incrementCounter('gateway_errors');
        });
        
        // Setup Strangler Fig event handlers
        stranglerFig.on('migrationRuleAdded', (rule) => {
            logger.info('Migration rule added:', rule);
        });
        
        // Setup Worker Thread Pool event handlers
        workerThreadPool.on('taskCompleted', (stats) => {
            metricsCollector.incrementCounter('worker_thread_tasks_completed');
        });
        
        // Setup performance monitoring
        performanceMonitor.on('metricRecorded', (metric) => {
            if (metric.operationName === 'critical_operation' && metric.value > 5000) {
                logger.warn('Slow operation detected:', metric);
            }
        });
        
        logger.info('All services initialized successfully');
        
    } catch (error) {
        logger.error('Failed to initialize services:', error);
    }
});

// Export app and services for testing
module.exports = {
    app,
    services: {
        externalServiceClient,
        retryService,
        bulkheadService,
        processingCache,
        multiLevelCache,
        writeBehindCache,
        eventProcessor,
        messageQueue,
        sagaOrchestrator,
        outboxPattern,
        distributedLock,
        idempotencyService,
        transactionManager,
        twoPhaseCommit,
        inboxPattern,
        cacheWarmingService,
        cacheInvalidationService,
        healthService,
        metricsCollector,
        asyncProcessor,
        backpressureHandler,
        processingService,
        eventStore,
        commandHandler,
        queryHandler,
        processingRepository,
        featureToggle,
        canaryDeployment,
        blueGreenDeployment,
        tokenBucketLimiter,
        slidingWindowLimiter,
        adaptiveLimiter
    },
    eurekaClient
};