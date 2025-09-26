// Domain Models
class ProcessingRequest {
    constructor(value, type = 'default') {
        this.value = value;
        this.type = type;
        this.timestamp = new Date();
    }
}

class ProcessingResult {
    constructor(result, status, algorithm, metadata = {}) {
        this.result = result;
        this.status = status;
        this.algorithm = algorithm;
        this.metadata = metadata;
        this.timestamp = new Date();
    }
}

// Domain Port (Interface)
class ProcessingPort {
    async process(request) {
        throw new Error('Method must be implemented');
    }
    
    async validate(request) {
        throw new Error('Method must be implemented');
    }
}

// Domain Service (Core Business Logic)
class ProcessingService extends ProcessingPort {
    constructor() {
        super();
        this.algorithms = new Map([
            ['double', (value) => value * 2],
            ['triple', (value) => value * 3],
            ['square', (value) => value * value],
            ['fibonacci', (value) => this.fibonacci(value)],
            ['factorial', (value) => this.factorial(value)]
        ]);
    }
    
    async process(request) {
        await this.validate(request);
        
        const algorithm = this.algorithms.get(request.type) || this.algorithms.get('double');
        const result = algorithm(request.value);
        
        return new ProcessingResult(
            result,
            'SUCCESS',
            request.type,
            {
                originalValue: request.value,
                processingTime: Date.now() - request.timestamp.getTime(),
                service: 'node-service'
            }
        );
    }
    
    async validate(request) {
        if (!request || typeof request.value !== 'number') {
            throw new Error('Invalid request: value must be a number');
        }
        
        if (request.value < 0) {
            throw new Error('Invalid request: value must be non-negative');
        }
        
        if (request.value > 1000000) {
            throw new Error('Invalid request: value too large');
        }
    }
    
    fibonacci(n) {
        if (n <= 1) return n;
        let a = 0, b = 1;
        for (let i = 2; i <= n; i++) {
            [a, b] = [b, a + b];
        }
        return b;
    }
    
    factorial(n) {
        if (n <= 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }
}

// CQRS Pattern Implementation
class Command {
    constructor(type, payload, metadata = {}) {
        this.type = type;
        this.payload = payload;
        this.metadata = metadata;
        this.id = require('uuid').v4();
        this.timestamp = new Date();
    }
}

class Query {
    constructor(type, parameters, metadata = {}) {
        this.type = type;
        this.parameters = parameters;
        this.metadata = metadata;
        this.id = require('uuid').v4();
        this.timestamp = new Date();
    }
}

class CommandHandler {
    constructor(eventStore, cache) {
        this.eventStore = eventStore;
        this.cache = cache;
        this.handlers = new Map();
        this.setupHandlers();
    }
    
    setupHandlers() {
        this.handlers.set('PROCESS_DATA', this.handleProcessData.bind(this));
        this.handlers.set('CACHE_RESULT', this.handleCacheResult.bind(this));
        this.handlers.set('INVALIDATE_CACHE', this.handleInvalidateCache.bind(this));
    }
    
    async handle(command) {
        const handler = this.handlers.get(command.type);
        if (!handler) {
            throw new Error(`No handler found for command type: ${command.type}`);
        }
        
        return await handler(command);
    }
    
    async handleProcessData(command) {
        const { value, type } = command.payload;
        const processingService = new ProcessingService();
        const request = new ProcessingRequest(value, type);
        
        const result = await processingService.process(request);
        
        if (this.eventStore) {
            await this.eventStore.append('DATA_PROCESSED', {
                commandId: command.id,
                request,
                result
            });
        }
        
        return result;
    }
    
    async handleCacheResult(command) {
        const { key, value, ttl } = command.payload;
        if (this.cache) {
            await this.cache.set(key, value, ttl);
        }
        return { cached: true, key };
    }
    
    async handleInvalidateCache(command) {
        const { pattern } = command.payload;
        if (this.cache) {
            await this.cache.delete(pattern);
        }
        return { invalidated: true, pattern };
    }
}

class QueryHandler {
    constructor(cache, readModel) {
        this.cache = cache;
        this.readModel = readModel;
        this.handlers = new Map();
        this.setupHandlers();
    }
    
    setupHandlers() {
        this.handlers.set('GET_PROCESSED_DATA', this.handleGetProcessedData.bind(this));
        this.handlers.set('GET_STATISTICS', this.handleGetStatistics.bind(this));
        this.handlers.set('GET_HISTORY', this.handleGetHistory.bind(this));
    }
    
    async handle(query) {
        const handler = this.handlers.get(query.type);
        if (!handler) {
            throw new Error(`No handler found for query type: ${query.type}`);
        }
        
        return await handler(query);
    }
    
    async handleGetProcessedData(query) {
        const { requestId } = query.parameters;
        
        if (this.cache) {
            const cached = await this.cache.get(`processed:${requestId}`);
            if (cached) {
                return { ...cached, source: 'cache' };
            }
        }
        
        if (this.readModel) {
            const data = await this.readModel.getProcessedData(requestId);
            return { ...data, source: 'readModel' };
        }
        
        return null;
    }
    
    async handleGetStatistics(query) {
        const stats = {
            totalRequests: 0,
            successfulRequests: 0,
            averageProcessingTime: 0,
            algorithmUsage: {}
        };
        
        if (this.readModel) {
            return await this.readModel.getStatistics(query.parameters);
        }
        
        return stats;
    }
    
    async handleGetHistory(query) {
        const { limit = 10, offset = 0 } = query.parameters;
        
        if (this.readModel) {
            return await this.readModel.getHistory(limit, offset);
        }
        
        return [];
    }
}

// Event Sourcing Implementation
class EventStore {
    constructor() {
        this.events = [];
        this.snapshots = new Map();
    }
    
    async append(eventType, eventData) {
        const event = {
            id: require('uuid').v4(),
            type: eventType,
            data: eventData,
            timestamp: new Date(),
            version: this.events.length + 1
        };
        
        this.events.push(event);
        return event;
    }
    
    async getEvents(aggregateId, fromVersion = 0) {
        return this.events
            .filter(event => event.data.aggregateId === aggregateId)
            .filter(event => event.version > fromVersion);
    }
    
    async getAllEvents(fromVersion = 0) {
        return this.events.filter(event => event.version > fromVersion);
    }
    
    async createSnapshot(aggregateId, state) {
        this.snapshots.set(aggregateId, {
            aggregateId,
            state,
            version: this.events.length,
            timestamp: new Date()
        });
    }
    
    async getSnapshot(aggregateId) {
        return this.snapshots.get(aggregateId);
    }
    
    async replay(aggregateId, eventHandlers) {
        const snapshot = await this.getSnapshot(aggregateId);
        let state = snapshot ? snapshot.state : {};
        let fromVersion = snapshot ? snapshot.version : 0;
        
        const events = await this.getEvents(aggregateId, fromVersion);
        
        for (const event of events) {
            const handler = eventHandlers[event.type];
            if (handler) {
                state = await handler(state, event);
            }
        }
        
        return state;
    }
}

// Repository Pattern
class ProcessingRepository {
    constructor(storage) {
        this.storage = storage;
    }
    
    async save(entity) {
        const id = entity.id || require('uuid').v4();
        entity.id = id;
        entity.updatedAt = new Date();
        
        await this.storage.set(id, entity);
        return entity;
    }
    
    async findById(id) {
        return await this.storage.get(id);
    }
    
    async findByValue(value) {
        const allEntities = await this.storage.getAll();
        return allEntities.filter(entity => entity.value === value);
    }
    
    async findAll(limit = 100, offset = 0) {
        const allEntities = await this.storage.getAll();
        return allEntities.slice(offset, offset + limit);
    }
    
    async delete(id) {
        return await this.storage.delete(id);
    }
}

// Specification Pattern
class Specification {
    isSatisfiedBy(entity) {
        throw new Error('Method must be implemented');
    }
    
    and(other) {
        return new AndSpecification(this, other);
    }
    
    or(other) {
        return new OrSpecification(this, other);
    }
    
    not() {
        return new NotSpecification(this);
    }
}

class ValueGreaterThanSpecification extends Specification {
    constructor(threshold) {
        super();
        this.threshold = threshold;
    }
    
    isSatisfiedBy(entity) {
        return entity.value > this.threshold;
    }
}

class AlgorithmTypeSpecification extends Specification {
    constructor(algorithmType) {
        super();
        this.algorithmType = algorithmType;
    }
    
    isSatisfiedBy(entity) {
        return entity.type === this.algorithmType;
    }
}

class AndSpecification extends Specification {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }
    
    isSatisfiedBy(entity) {
        return this.left.isSatisfiedBy(entity) && this.right.isSatisfiedBy(entity);
    }
}

class OrSpecification extends Specification {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }
    
    isSatisfiedBy(entity) {
        return this.left.isSatisfiedBy(entity) || this.right.isSatisfiedBy(entity);
    }
}

class NotSpecification extends Specification {
    constructor(specification) {
        super();
        this.specification = specification;
    }
    
    isSatisfiedBy(entity) {
        return !this.specification.isSatisfiedBy(entity);
    }
}

module.exports = {
    ProcessingRequest,
    ProcessingResult,
    ProcessingPort,
    ProcessingService,
    Command,
    Query,
    CommandHandler,
    QueryHandler,
    EventStore,
    ProcessingRepository,
    Specification,
    ValueGreaterThanSpecification,
    AlgorithmTypeSpecification
};