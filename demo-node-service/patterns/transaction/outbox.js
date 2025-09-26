const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class OutboxEvent {
    constructor(id, aggregateId, eventType, eventData) {
        this.id = id;
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.eventData = eventData;
        this.createdAt = Date.now();
        this.processed = false;
        this.processedAt = null;
        this.attempts = 0;
        this.lastAttempt = null;
    }
}

class OutboxRepository {
    constructor() {
        this.events = new Map();
        this.persistenceEnabled = process.env.NODE_ENV === 'production';
    }

    save(event) {
        this.events.set(event.id, event);
        return event;
    }

    findUnprocessed() {
        return Array.from(this.events.values()).filter(event => !event.processed);
    }

    markProcessed(eventId) {
        const event = this.events.get(eventId);
        if (event) {
            event.processed = true;
            event.processedAt = Date.now();
        }
    }

    incrementAttempts(eventId) {
        const event = this.events.get(eventId);
        if (event) {
            event.attempts++;
            event.lastAttempt = Date.now();
        }
    }

    getAll() {
        return Array.from(this.events.values());
    }
}

class EventPublisher extends EventEmitter {
    constructor() {
        super();
        this.subscribers = new Map();
    }

    subscribe(eventType, handler) {
        if (!this.subscribers.has(eventType)) {
            this.subscribers.set(eventType, []);
        }
        this.subscribers.get(eventType).push(handler);
    }

    async publish(eventType, eventData) {
        const handlers = this.subscribers.get(eventType) || [];
        
        for (const handler of handlers) {
            try {
                await handler(eventData);
                console.log(`Published event ${eventType}`);
            } catch (error) {
                console.error(`Failed to publish event ${eventType}:`, error);
                throw error;
            }
        }
    }
}

class OutboxService extends EventEmitter {
    constructor(repository = null, publisher = null) {
        super();
        this.repository = repository || new OutboxRepository();
        this.publisher = publisher || new EventPublisher();
        this.running = false;
        this.processingInterval = null;
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
    }

    saveEvent(aggregateId, eventType, eventData) {
        const event = new OutboxEvent(
            uuidv4(),
            aggregateId,
            eventType,
            eventData
        );
        
        this.repository.save(event);
        console.log(`Saved outbox event ${event.id}`);
        
        this.emit('event-saved', event);
        return event.id;
    }

    startProcessor(intervalMs = 1000) {
        if (this.running) return;
        
        this.running = true;
        this.processingInterval = setInterval(() => {
            this.processEvents().catch(error => {
                console.error('Error in outbox processor:', error);
            });
        }, intervalMs);
        
        console.log('Started outbox event processor');
        this.emit('processor-started');
    }

    stopProcessor() {
        if (!this.running) return;
        
        this.running = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        
        console.log('Stopped outbox event processor');
        this.emit('processor-stopped');
    }

    async processEvents() {
        const unprocessedEvents = this.repository.findUnprocessed();
        
        for (const event of unprocessedEvents) {
            // Skip events that have exceeded max retries
            if (event.attempts >= this.maxRetries) {
                console.warn(`Event ${event.id} exceeded max retries (${this.maxRetries})`);
                continue;
            }

            // Skip events that are in retry delay
            if (event.lastAttempt && (Date.now() - event.lastAttempt) < this.retryDelay) {
                continue;
            }

            try {
                await this.publisher.publish(event.eventType, event.eventData);
                this.repository.markProcessed(event.id);
                
                console.log(`Processed outbox event ${event.id}`);
                this.emit('event-processed', event);
                
            } catch (error) {
                this.repository.incrementAttempts(event.id);
                console.error(`Failed to process event ${event.id}:`, error);
                
                this.emit('event-failed', { event, error });
            }
        }
    }

    getStats() {
        const allEvents = this.repository.getAll();
        const processed = allEvents.filter(e => e.processed).length;
        const pending = allEvents.filter(e => !e.processed && e.attempts < this.maxRetries).length;
        const failed = allEvents.filter(e => !e.processed && e.attempts >= this.maxRetries).length;

        return {
            total: allEvents.length,
            processed,
            pending,
            failed,
            running: this.running
        };
    }

    // Manual retry for failed events
    async retryFailedEvents() {
        const failedEvents = this.repository.getAll().filter(e => 
            !e.processed && e.attempts >= this.maxRetries
        );

        for (const event of failedEvents) {
            event.attempts = 0; // Reset attempts
            event.lastAttempt = null;
        }

        console.log(`Reset ${failedEvents.length} failed events for retry`);
        return failedEvents.length;
    }
}

// Example event handlers
const handleDataProcessed = (eventData) => {
    console.log('Handling data processed event:', eventData);
};

const handleOrderCreated = (eventData) => {
    console.log('Handling order created event:', eventData);
};

module.exports = {
    OutboxService,
    OutboxRepository,
    EventPublisher,
    OutboxEvent,
    handleDataProcessed,
    handleOrderCreated
};