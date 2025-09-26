/**
 * CQRS Pattern Implementation
 * Command Query Responsibility Segregation
 */
const { v4: uuidv4 } = require('uuid');

class Command {
    constructor(commandType, payload, metadata = {}) {
        this.commandType = commandType;
        this.payload = payload;
        this.metadata = metadata;
        this.id = uuidv4();
        this.timestamp = Date.now();
    }
}

class Query {
    constructor(queryType, parameters, metadata = {}) {
        this.queryType = queryType;
        this.parameters = parameters;
        this.metadata = metadata;
        this.id = uuidv4();
    }
}

class CommandHandler {
    constructor(cacheService = new Map()) {
        this.cacheService = cacheService;
        this.handlers = {
            'PROCESS_DATA': this.handleProcessData.bind(this),
            'CACHE_RESULT': this.handleCacheResult.bind(this),
            'UPDATE_STATISTICS': this.handleUpdateStatistics.bind(this)
        };
    }

    async handle(command) {
        const handler = this.handlers[command.commandType];
        if (!handler) {
            throw new Error(`No handler for command: ${command.commandType}`);
        }
        return await handler(command);
    }

    async handleProcessData(command) {
        const { value, requestId = uuidv4() } = command.payload;
        const result = value * 2; // Simple processing

        // Store in cache for queries
        const cacheData = {
            result,
            processedAt: Date.now(),
            commandId: command.id
        };

        if (typeof this.cacheService.set === 'function') {
            await this.cacheService.set(requestId, JSON.stringify(cacheData));
        } else {
            this.cacheService.set(requestId, cacheData);
        }

        return { requestId, result, status: 'PROCESSED' };
    }

    async handleCacheResult(command) {
        const { key, value, ttl = 3600 } = command.payload;

        if (typeof this.cacheService.setex === 'function') {
            await this.cacheService.setex(key, ttl, JSON.stringify(value));
        } else {
            this.cacheService.set(key, value);
        }

        return { key, cached: true };
    }

    async handleUpdateStatistics(command) {
        const statsKey = 'processing_stats';
        let currentStats = this.cacheService.get(statsKey) || {
            totalProcessed: 0,
            lastUpdated: Date.now()
        };

        if (typeof currentStats === 'string') {
            currentStats = JSON.parse(currentStats);
        }

        currentStats.totalProcessed += 1;
        currentStats.lastUpdated = Date.now();

        this.cacheService.set(statsKey, currentStats);
        return currentStats;
    }
}

class QueryHandler {
    constructor(cacheService = new Map(), readModel = new Map()) {
        this.cacheService = cacheService;
        this.readModel = readModel;
        this.handlers = {
            'GET_PROCESSED_DATA': this.handleGetProcessedData.bind(this),
            'GET_STATISTICS': this.handleGetStatistics.bind(this),
            'GET_ALL_RESULTS': this.handleGetAllResults.bind(this)
        };
    }

    async handle(query) {
        const handler = this.handlers[query.queryType];
        if (!handler) {
            throw new Error(`No handler for query: ${query.queryType}`);
        }
        return await handler(query);
    }

    async handleGetProcessedData(query) {
        const { requestId } = query.parameters;
        if (!requestId) {
            throw new Error('requestId is required');
        }

        let data = this.cacheService.get(requestId);
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                // Data is not JSON, return as is
            }
        }

        return data || { error: 'Data not found' };
    }

    async handleGetStatistics(query) {
        const statsKey = 'processing_stats';
        let stats = this.cacheService.get(statsKey) || {
            totalProcessed: 0,
            lastUpdated: null
        };

        if (typeof stats === 'string') {
            try {
                stats = JSON.parse(stats);
            } catch (e) {
                stats = { totalProcessed: 0, lastUpdated: null };
            }
        }

        return {
            statistics: stats,
            queryTime: Date.now()
        };
    }

    async handleGetAllResults(query) {
        const { limit = 10, offset = 0 } = query.parameters;
        const allResults = [];

        if (this.cacheService instanceof Map) {
            const keys = Array.from(this.cacheService.keys())
                .filter(key => key !== 'processing_stats')
                .slice(offset, offset + limit);

            for (const key of keys) {
                const result = this.cacheService.get(key);
                if (result) {
                    allResults.push({ id: key, ...result });
                }
            }
        }

        return {
            results: allResults,
            total: allResults.length,
            limit,
            offset
        };
    }
}

class CQRSService {
    constructor(cacheService) {
        this.commandHandler = new CommandHandler(cacheService);
        this.queryHandler = new QueryHandler(cacheService);
    }

    async executeCommand(commandType, payload) {
        const command = new Command(commandType, payload);
        return await this.commandHandler.handle(command);
    }

    async executeQuery(queryType, parameters) {
        const query = new Query(queryType, parameters);
        return await this.queryHandler.handle(query);
    }
}

module.exports = {
    Command,
    Query,
    CommandHandler,
    QueryHandler,
    CQRSService
};