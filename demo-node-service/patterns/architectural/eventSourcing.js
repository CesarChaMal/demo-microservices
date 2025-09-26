/**
 * Event Sourcing Pattern Implementation
 * Store all changes as events and replay to get current state
 */
const { v4: uuidv4 } = require('uuid');

class DomainEvent {
    constructor(eventType, aggregateId, data, version = 1) {
        this.eventId = uuidv4();
        this.eventType = eventType;
        this.aggregateId = aggregateId;
        this.data = data;
        this.timestamp = Date.now();
        this.version = version;
    }
}

class EventStore {
    constructor() {
        this.events = [];
        this.snapshots = new Map();
        this.eventHandlers = new Map();
    }

    append(event) {
        event.version = this.events.length + 1;
        this.events.push(event);
        console.log(`Event stored: ${event.eventType} for ${event.aggregateId}`);
        return event;
    }

    getEvents(aggregateId, fromVersion = 0) {
        return this.events.filter(event => 
            event.aggregateId === aggregateId && event.version > fromVersion
        );
    }

    getAllEvents() {
        return [...this.events];
    }

    saveSnapshot(aggregateId, state, version) {
        this.snapshots.set(aggregateId, {
            state: JSON.parse(JSON.stringify(state)),
            version,
            timestamp: Date.now()
        });
    }

    getSnapshot(aggregateId) {
        return this.snapshots.get(aggregateId);
    }

    replay(aggregateId, eventHandlers) {
        const snapshot = this.getSnapshot(aggregateId);
        let state = snapshot ? JSON.parse(JSON.stringify(snapshot.state)) : {};
        const fromVersion = snapshot ? snapshot.version : 0;

        const events = this.getEvents(aggregateId, fromVersion);
        
        for (const event of events) {
            const handler = eventHandlers[event.eventType];
            if (handler) {
                state = handler(state, event);
            }
        }

        return state;
    }

    // Temporal queries
    getStateAtTime(aggregateId, timestamp, eventHandlers) {
        const snapshot = this.getSnapshot(aggregateId);
        let state = snapshot ? JSON.parse(JSON.stringify(snapshot.state)) : {};
        const fromVersion = snapshot ? snapshot.version : 0;

        const events = this.getEvents(aggregateId, fromVersion)
            .filter(event => event.timestamp <= timestamp);

        for (const event of events) {
            const handler = eventHandlers[event.eventType];
            if (handler) {
                state = handler(state, event);
            }
        }

        return state;
    }

    getEventHistory(aggregateId) {
        return this.getEvents(aggregateId).map(event => ({
            eventId: event.eventId,
            eventType: event.eventType,
            timestamp: event.timestamp,
            version: event.version,
            data: event.data
        }));
    }
}

class ProcessingAggregate {
    constructor(aggregateId, eventStore) {
        this.aggregateId = aggregateId;
        this.eventStore = eventStore;
        this.state = {
            id: aggregateId,
            totalProcessed: 0,
            lastValue: null,
            lastResult: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.eventHandlers = {
            'DATA_PROCESSED': this.onDataProcessed.bind(this),
            'PROCESSING_FAILED': this.onProcessingFailed.bind(this),
            'AGGREGATE_CREATED': this.onAggregateCreated.bind(this)
        };
    }

    // Command methods
    processData(value) {
        try {
            const result = value * 2;
            const event = new DomainEvent('DATA_PROCESSED', this.aggregateId, {
                value,
                result,
                processedAt: Date.now()
            });
            
            this.eventStore.append(event);
            this.apply(event);
            
            return { success: true, result, eventId: event.eventId };
        } catch (error) {
            const event = new DomainEvent('PROCESSING_FAILED', this.aggregateId, {
                value,
                error: error.message,
                failedAt: Date.now()
            });
            
            this.eventStore.append(event);
            this.apply(event);
            
            throw error;
        }
    }

    // Event handlers
    onDataProcessed(state, event) {
        return {
            ...state,
            totalProcessed: state.totalProcessed + 1,
            lastValue: event.data.value,
            lastResult: event.data.result,
            updatedAt: event.timestamp
        };
    }

    onProcessingFailed(state, event) {
        return {
            ...state,
            lastError: event.data.error,
            updatedAt: event.timestamp
        };
    }

    onAggregateCreated(state, event) {
        return {
            ...state,
            createdAt: event.timestamp
        };
    }

    apply(event) {
        const handler = this.eventHandlers[event.eventType];
        if (handler) {
            this.state = handler(this.state, event);
        }
    }

    // Rebuild state from events
    rebuildFromEvents() {
        this.state = this.eventStore.replay(this.aggregateId, this.eventHandlers);
        return this.state;
    }

    getCurrentState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    getHistory() {
        return this.eventStore.getEventHistory(this.aggregateId);
    }

    createSnapshot() {
        this.eventStore.saveSnapshot(this.aggregateId, this.state, this.eventStore.events.length);
    }
}

class EventSourcingService {
    constructor() {
        this.eventStore = new EventStore();
        this.aggregates = new Map();
    }

    getAggregate(aggregateId) {
        if (!this.aggregates.has(aggregateId)) {
            const aggregate = new ProcessingAggregate(aggregateId, this.eventStore);
            
            // Rebuild state from events if any exist
            const events = this.eventStore.getEvents(aggregateId);
            if (events.length > 0) {
                aggregate.rebuildFromEvents();
            } else {
                // Create new aggregate
                const createdEvent = new DomainEvent('AGGREGATE_CREATED', aggregateId, {
                    createdAt: Date.now()
                });
                this.eventStore.append(createdEvent);
                aggregate.apply(createdEvent);
            }
            
            this.aggregates.set(aggregateId, aggregate);
        }
        
        return this.aggregates.get(aggregateId);
    }

    processData(aggregateId, value) {
        const aggregate = this.getAggregate(aggregateId);
        return aggregate.processData(value);
    }

    getAggregateState(aggregateId) {
        const aggregate = this.getAggregate(aggregateId);
        return aggregate.getCurrentState();
    }

    getAggregateHistory(aggregateId) {
        const aggregate = this.getAggregate(aggregateId);
        return aggregate.getHistory();
    }

    getAllEvents() {
        return this.eventStore.getAllEvents();
    }

    // Temporal queries
    getStateAtTime(aggregateId, timestamp) {
        const aggregate = this.getAggregate(aggregateId);
        return this.eventStore.getStateAtTime(aggregateId, timestamp, aggregate.eventHandlers);
    }

    // Projections
    createProjection(projectionName, eventTypes, projectionHandler) {
        const projection = {};
        const relevantEvents = this.eventStore.getAllEvents()
            .filter(event => eventTypes.includes(event.eventType));

        for (const event of relevantEvents) {
            projectionHandler(projection, event);
        }

        return projection;
    }

    // Statistics projection
    getProcessingStatistics() {
        return this.createProjection('processing_stats', ['DATA_PROCESSED', 'PROCESSING_FAILED'], 
            (projection, event) => {
                if (!projection.totalEvents) projection.totalEvents = 0;
                if (!projection.successfulProcessing) projection.successfulProcessing = 0;
                if (!projection.failedProcessing) projection.failedProcessing = 0;
                if (!projection.totalValueProcessed) projection.totalValueProcessed = 0;

                projection.totalEvents++;

                if (event.eventType === 'DATA_PROCESSED') {
                    projection.successfulProcessing++;
                    projection.totalValueProcessed += event.data.value;
                } else if (event.eventType === 'PROCESSING_FAILED') {
                    projection.failedProcessing++;
                }

                projection.lastEventTime = event.timestamp;
            });
    }
}

module.exports = {
    DomainEvent,
    EventStore,
    ProcessingAggregate,
    EventSourcingService
};