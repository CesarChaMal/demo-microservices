const { Kafka } = require('kafkajs');
const EventEmitter = require('eventemitter3');

class EventStreamProcessor {
    constructor(options = {}) {
        this.kafka = new Kafka({
            clientId: options.clientId || 'node-service',
            brokers: options.brokers || ['localhost:9092']
        });
        
        this.producer = this.kafka.producer();
        this.consumer = this.kafka.consumer({ groupId: options.groupId || 'node-service-group' });
        this.eventCounts = new Map();
        this.localEventBus = new EventEmitter();
        this.connected = false;
    }
    
    async connect() {
        try {
            await this.producer.connect();
            await this.consumer.connect();
            this.connected = true;
            console.log('Kafka connected successfully');
        } catch (error) {
            console.error('Kafka connection failed:', error);
            this.connected = false;
        }
    }
    
    async publishEvent(eventType, data) {
        const event = {
            type: eventType,
            data: data,
            timestamp: Date.now(),
            source: 'node-service',
            id: require('uuid').v4()
        };
        
        this.localEventBus.emit(eventType, event);
        
        if (this.connected) {
            try {
                await this.producer.send({
                    topic: 'domain-events',
                    messages: [{
                        key: event.id,
                        value: JSON.stringify(event)
                    }]
                });
            } catch (error) {
                console.error('Failed to publish event to Kafka:', error);
            }
        }
        
        return event;
    }
    
    async subscribeToEvents(topics, handler) {
        if (!this.connected) {
            await this.connect();
        }
        
        await this.consumer.subscribe({ topics });
        
        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const event = JSON.parse(message.value.toString());
                    this.eventCounts.set(event.type, (this.eventCounts.get(event.type) || 0) + 1);
                    await handler(event, { topic, partition });
                } catch (error) {
                    console.error('Error processing event:', error);
                }
            }
        });
    }
    
    onLocalEvent(eventType, handler) {
        this.localEventBus.on(eventType, handler);
    }
    
    getEventStats() {
        return {
            eventCounts: Object.fromEntries(this.eventCounts),
            connected: this.connected
        };
    }
    
    async disconnect() {
        if (this.connected) {
            await this.producer.disconnect();
            await this.consumer.disconnect();
            this.connected = false;
        }
    }
}

class MessageQueue {
    constructor(options = {}) {
        this.amqp = require('amqplib');
        this.connection = null;
        this.channel = null;
        this.url = options.url || 'amqp://localhost';
        this.exchange = options.exchange || 'microservices.exchange';
        this.queues = new Map();
    }
    
    async connect() {
        try {
            this.connection = await this.amqp.connect(this.url);
            this.channel = await this.connection.createChannel();
            
            await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
            console.log('RabbitMQ connected successfully');
        } catch (error) {
            console.error('RabbitMQ connection failed:', error);
        }
    }
    
    async publishMessage(routingKey, message) {
        if (!this.channel) {
            await this.connect();
        }
        
        const messageBuffer = Buffer.from(JSON.stringify({
            ...message,
            timestamp: Date.now(),
            source: 'node-service'
        }));
        
        return this.channel.publish(this.exchange, routingKey, messageBuffer, {
            persistent: true
        });
    }
    
    async subscribeToQueue(queueName, routingKey, handler) {
        if (!this.channel) {
            await this.connect();
        }
        
        const queue = await this.channel.assertQueue(queueName, { durable: true });
        await this.channel.bindQueue(queue.queue, this.exchange, routingKey);
        
        this.queues.set(queueName, queue);
        
        await this.channel.consume(queue.queue, async (msg) => {
            if (msg) {
                try {
                    const message = JSON.parse(msg.content.toString());
                    await handler(message);
                    this.channel.ack(msg);
                } catch (error) {
                    console.error('Error processing message:', error);
                    this.channel.nack(msg, false, false);
                }
            }
        });
    }
    
    async disconnect() {
        if (this.connection) {
            await this.connection.close();
        }
    }
}

class SagaOrchestrator {
    constructor() {
        this.sagas = new Map();
        this.eventBus = new EventEmitter();
    }
    
    async startSaga(sagaId, steps) {
        const saga = {
            id: sagaId,
            steps: steps,
            currentStep: 0,
            status: 'STARTED',
            context: {},
            completedSteps: [],
            createdAt: new Date()
        };
        
        this.sagas.set(sagaId, saga);
        await this.executeNextStep(sagaId);
        return saga;
    }
    
    async executeNextStep(sagaId) {
        const saga = this.sagas.get(sagaId);
        if (!saga || saga.currentStep >= saga.steps.length) {
            if (saga) {
                saga.status = 'COMPLETED';
                this.eventBus.emit('sagaCompleted', saga);
            }
            return;
        }
        
        const step = saga.steps[saga.currentStep];
        saga.status = 'IN_PROGRESS';
        
        try {
            const result = await step.execute(saga.context);
            saga.context = { ...saga.context, ...result };
            saga.completedSteps.push(step.name);
            saga.currentStep++;
            
            await this.executeNextStep(sagaId);
        } catch (error) {
            saga.status = 'FAILED';
            saga.error = error.message;
            await this.compensate(sagaId);
        }
    }
    
    async compensate(sagaId) {
        const saga = this.sagas.get(sagaId);
        if (!saga) return;
        
        saga.status = 'COMPENSATING';
        
        for (let i = saga.completedSteps.length - 1; i >= 0; i--) {
            const stepName = saga.completedSteps[i];
            const step = saga.steps.find(s => s.name === stepName);
            
            if (step && step.compensate) {
                try {
                    await step.compensate(saga.context);
                } catch (error) {
                    console.error(`Compensation failed for step ${stepName}:`, error);
                }
            }
        }
        
        saga.status = 'COMPENSATED';
        this.eventBus.emit('sagaCompensated', saga);
    }
    
    getSagaStatus(sagaId) {
        return this.sagas.get(sagaId);
    }
    
    onSagaEvent(event, handler) {
        this.eventBus.on(event, handler);
    }
}

class OutboxPattern {
    constructor(options = {}) {
        this.outboxEvents = new Map();
        this.eventPublisher = options.eventPublisher;
        this.flushInterval = options.flushInterval || 5000;
        
        this.startProcessing();
    }
    
    async saveEvent(aggregateId, event) {
        const outboxEvent = {
            id: require('uuid').v4(),
            aggregateId,
            eventType: event.type,
            eventData: JSON.stringify(event),
            createdAt: new Date(),
            processed: false
        };
        
        this.outboxEvents.set(outboxEvent.id, outboxEvent);
        return outboxEvent;
    }
    
    startProcessing() {
        setInterval(async () => {
            await this.processOutboxEvents();
        }, this.flushInterval);
    }
    
    async processOutboxEvents() {
        const unprocessedEvents = Array.from(this.outboxEvents.values())
            .filter(event => !event.processed);
        
        for (const event of unprocessedEvents) {
            try {
                if (this.eventPublisher) {
                    await this.eventPublisher.publishEvent(event.eventType, JSON.parse(event.eventData));
                }
                event.processed = true;
            } catch (error) {
                console.error('Failed to publish outbox event:', error);
            }
        }
    }
    
    getStats() {
        const events = Array.from(this.outboxEvents.values());
        return {
            total: events.length,
            processed: events.filter(e => e.processed).length,
            pending: events.filter(e => !e.processed).length
        };
    }
}

module.exports = { EventStreamProcessor, MessageQueue, SagaOrchestrator, OutboxPattern };