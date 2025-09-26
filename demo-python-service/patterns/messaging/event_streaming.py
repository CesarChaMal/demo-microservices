import json
import time
import uuid
import logging
import threading
from typing import Dict, Any, List, Callable, Optional
from dataclasses import dataclass, asdict
from enum import Enum
from abc import ABC, abstractmethod
from kafka import KafkaProducer, KafkaConsumer
import pika
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

@dataclass
class DomainEvent:
    event_id: str
    event_type: str
    aggregate_id: str
    data: Dict[str, Any]
    timestamp: float
    version: int = 1
    source: str = 'python-service'
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class EventStreamProcessor:
    def __init__(self, kafka_servers: List[str] = None):
        self.kafka_servers = kafka_servers or ['localhost:9092']
        self.producer = None
        self.consumers = {}
        self.event_counts = defaultdict(int)
        self.local_handlers = defaultdict(list)
        self.connected = False
        self.lock = threading.Lock()
        
        self._connect()
    
    def _connect(self):
        try:
            self.producer = KafkaProducer(
                bootstrap_servers=self.kafka_servers,
                value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
                key_serializer=lambda k: k.encode('utf-8') if k else None,
                acks='all',
                retries=3,
                retry_backoff_ms=1000
            )
            self.connected = True
            logger.info("Kafka producer connected successfully")
        except Exception as e:
            logger.error(f"Failed to connect to Kafka: {e}")
            self.connected = False
    
    def publish_event(self, topic: str, event_type: str, data: Dict[str, Any], 
                     aggregate_id: str = None) -> DomainEvent:
        event = DomainEvent(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            aggregate_id=aggregate_id or str(uuid.uuid4()),
            data=data,
            timestamp=time.time()
        )
        
        # Publish to local handlers first
        self._publish_local(event)
        
        # Publish to Kafka if connected
        if self.connected and self.producer:
            try:
                future = self.producer.send(
                    topic,
                    key=event.event_id,
                    value=event.to_dict()
                )
                future.get(timeout=10)  # Wait for confirmation
                
                with self.lock:
                    self.event_counts[event_type] += 1
                
                logger.info(f"Published event {event.event_type} to topic {topic}")
            except Exception as e:
                logger.error(f"Failed to publish event to Kafka: {e}")
        
        return event
    
    def _publish_local(self, event: DomainEvent):
        handlers = self.local_handlers.get(event.event_type, [])
        for handler in handlers:
            try:
                handler(event)
            except Exception as e:
                logger.error(f"Local event handler failed: {e}")
    
    def subscribe_local(self, event_type: str, handler: Callable[[DomainEvent], None]):
        self.local_handlers[event_type].append(handler)
        logger.info(f"Registered local handler for event type: {event_type}")
    
    def subscribe_kafka(self, topics: List[str], group_id: str, 
                       handler: Callable[[DomainEvent], None]):
        if not self.connected:
            logger.warning("Cannot subscribe to Kafka - not connected")
            return
        
        def consume_messages():
            try:
                consumer = KafkaConsumer(
                    *topics,
                    bootstrap_servers=self.kafka_servers,
                    group_id=group_id,
                    value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                    auto_offset_reset='latest',
                    enable_auto_commit=True
                )
                
                self.consumers[group_id] = consumer
                logger.info(f"Started Kafka consumer for topics {topics} with group {group_id}")
                
                for message in consumer:
                    try:
                        event_data = message.value
                        event = DomainEvent(**event_data)
                        handler(event)
                        
                        with self.lock:
                            self.event_counts[event.event_type] += 1
                            
                    except Exception as e:
                        logger.error(f"Error processing Kafka message: {e}")
                        
            except Exception as e:
                logger.error(f"Kafka consumer error: {e}")
        
        # Start consumer in background thread
        consumer_thread = threading.Thread(target=consume_messages, daemon=True)
        consumer_thread.start()
    
    def get_event_stats(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'connected': self.connected,
                'event_counts': dict(self.event_counts),
                'active_consumers': len(self.consumers)
            }
    
    def disconnect(self):
        if self.producer:
            self.producer.close()
        
        for consumer in self.consumers.values():
            consumer.close()
        
        self.connected = False
        logger.info("Event stream processor disconnected")

class SagaStatus(Enum):
    STARTED = "STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    COMPENSATING = "COMPENSATING"
    COMPENSATED = "COMPENSATED"

@dataclass
class SagaStep:
    name: str
    execute: Callable[[Dict[str, Any]], Dict[str, Any]]
    compensate: Optional[Callable[[Dict[str, Any]], None]] = None

@dataclass
class SagaState:
    saga_id: str
    saga_type: str
    status: SagaStatus
    current_step: int
    context: Dict[str, Any]
    completed_steps: List[str]
    created_at: float
    updated_at: float
    error: Optional[str] = None

class SagaOrchestrator:
    def __init__(self, event_processor: EventStreamProcessor):
        self.event_processor = event_processor
        self.sagas = {}
        self.saga_definitions = {}
        self.lock = threading.Lock()
        
        # Subscribe to saga events
        self.event_processor.subscribe_local('SAGA_STEP_COMPLETED', self._handle_step_completed)
        self.event_processor.subscribe_local('SAGA_STEP_FAILED', self._handle_step_failed)
    
    def register_saga(self, saga_type: str, steps: List[SagaStep]):
        self.saga_definitions[saga_type] = steps
        logger.info(f"Registered saga type: {saga_type} with {len(steps)} steps")
    
    def start_saga(self, saga_id: str, saga_type: str, initial_context: Dict[str, Any]) -> SagaState:
        if saga_type not in self.saga_definitions:
            raise ValueError(f"Unknown saga type: {saga_type}")
        
        saga_state = SagaState(
            saga_id=saga_id,
            saga_type=saga_type,
            status=SagaStatus.STARTED,
            current_step=0,
            context=initial_context,
            completed_steps=[],
            created_at=time.time(),
            updated_at=time.time()
        )
        
        with self.lock:
            self.sagas[saga_id] = saga_state
        
        # Start executing first step
        self._execute_next_step(saga_id)
        
        return saga_state
    
    def _execute_next_step(self, saga_id: str):
        with self.lock:
            saga = self.sagas.get(saga_id)
            if not saga:
                return
            
            steps = self.saga_definitions.get(saga.saga_type, [])
            if saga.current_step >= len(steps):
                # Saga completed
                saga.status = SagaStatus.COMPLETED
                saga.updated_at = time.time()
                self._publish_saga_event(saga, 'SAGA_COMPLETED')
                return
            
            step = steps[saga.current_step]
            saga.status = SagaStatus.IN_PROGRESS
            saga.updated_at = time.time()
        
        # Execute step
        try:
            result = step.execute(saga.context)
            saga.context.update(result)
            saga.completed_steps.append(step.name)
            saga.current_step += 1
            saga.updated_at = time.time()
            
            self._publish_saga_event(saga, 'SAGA_STEP_COMPLETED')
            
        except Exception as e:
            saga.status = SagaStatus.FAILED
            saga.error = str(e)
            saga.updated_at = time.time()
            
            self._publish_saga_event(saga, 'SAGA_STEP_FAILED')
            self._compensate_saga(saga_id)
    
    def _compensate_saga(self, saga_id: str):
        with self.lock:
            saga = self.sagas.get(saga_id)
            if not saga:
                return
            
            saga.status = SagaStatus.COMPENSATING
            saga.updated_at = time.time()
            
            steps = self.saga_definitions.get(saga.saga_type, [])
            
            # Execute compensation in reverse order
            for step_name in reversed(saga.completed_steps):
                step = next((s for s in steps if s.name == step_name), None)
                if step and step.compensate:
                    try:
                        step.compensate(saga.context)
                        logger.info(f"Compensated step {step_name} for saga {saga_id}")
                    except Exception as e:
                        logger.error(f"Compensation failed for step {step_name}: {e}")
            
            saga.status = SagaStatus.COMPENSATED
            saga.updated_at = time.time()
            self._publish_saga_event(saga, 'SAGA_COMPENSATED')
    
    def _handle_step_completed(self, event: DomainEvent):
        saga_id = event.data.get('saga_id')
        if saga_id:
            self._execute_next_step(saga_id)
    
    def _handle_step_failed(self, event: DomainEvent):
        saga_id = event.data.get('saga_id')
        if saga_id:
            self._compensate_saga(saga_id)
    
    def _publish_saga_event(self, saga: SagaState, event_type: str):
        self.event_processor.publish_event(
            'saga-events',
            event_type,
            {
                'saga_id': saga.saga_id,
                'saga_type': saga.saga_type,
                'status': saga.status.value,
                'current_step': saga.current_step,
                'context': saga.context
            },
            aggregate_id=saga.saga_id
        )
    
    def get_saga_status(self, saga_id: str) -> Optional[SagaState]:
        with self.lock:
            return self.sagas.get(saga_id)
    
    def get_all_sagas(self) -> List[SagaState]:
        with self.lock:
            return list(self.sagas.values())

class OutboxPattern:
    def __init__(self, event_processor: EventStreamProcessor, flush_interval: int = 5):
        self.event_processor = event_processor
        self.outbox_events = deque()
        self.flush_interval = flush_interval
        self.lock = threading.Lock()
        self.running = True
        
        # Start background processor
        self.processor_thread = threading.Thread(target=self._process_outbox, daemon=True)
        self.processor_thread.start()
    
    def save_event(self, aggregate_id: str, event_type: str, data: Dict[str, Any]) -> str:
        event_id = str(uuid.uuid4())
        outbox_event = {
            'id': event_id,
            'aggregate_id': aggregate_id,
            'event_type': event_type,
            'event_data': data,
            'created_at': time.time(),
            'processed': False
        }
        
        with self.lock:
            self.outbox_events.append(outbox_event)
        
        return event_id
    
    def _process_outbox(self):
        while self.running:
            try:
                time.sleep(self.flush_interval)
                self._flush_events()
            except Exception as e:
                logger.error(f"Outbox processor error: {e}")
    
    def _flush_events(self):
        events_to_process = []
        
        with self.lock:
            # Get unprocessed events
            while self.outbox_events:
                event = self.outbox_events.popleft()
                if not event['processed']:
                    events_to_process.append(event)
        
        for event in events_to_process:
            try:
                self.event_processor.publish_event(
                    'domain-events',
                    event['event_type'],
                    event['event_data'],
                    aggregate_id=event['aggregate_id']
                )
                event['processed'] = True
                logger.debug(f"Published outbox event {event['id']}")
                
            except Exception as e:
                logger.error(f"Failed to publish outbox event {event['id']}: {e}")
                # Re-add to queue for retry
                with self.lock:
                    self.outbox_events.appendleft(event)
    
    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            unprocessed = sum(1 for event in self.outbox_events if not event['processed'])
            return {
                'total_events': len(self.outbox_events),
                'unprocessed_events': unprocessed,
                'flush_interval': self.flush_interval,
                'running': self.running
            }
    
    def shutdown(self):
        self.running = False
        if self.processor_thread.is_alive():
            self.processor_thread.join(timeout=5)
        # Final flush
        self._flush_events()

class MessageQueue:
    def __init__(self, rabbitmq_url: str = 'amqp://localhost'):
        self.rabbitmq_url = rabbitmq_url
        self.connection = None
        self.channel = None
        self.connected = False
        self.exchange_name = 'microservices.exchange'
        
        self._connect()
    
    def _connect(self):
        try:
            self.connection = pika.BlockingConnection(
                pika.URLParameters(self.rabbitmq_url)
            )
            self.channel = self.connection.channel()
            
            # Declare exchange
            self.channel.exchange_declare(
                exchange=self.exchange_name,
                exchange_type='topic',
                durable=True
            )
            
            self.connected = True
            logger.info("RabbitMQ connected successfully")
            
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            self.connected = False
    
    def publish_message(self, routing_key: str, message: Dict[str, Any]) -> bool:
        if not self.connected:
            return False
        
        try:
            enhanced_message = {
                **message,
                'timestamp': time.time(),
                'source': 'python-service',
                'message_id': str(uuid.uuid4())
            }
            
            self.channel.basic_publish(
                exchange=self.exchange_name,
                routing_key=routing_key,
                body=json.dumps(enhanced_message, default=str),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Make message persistent
                    timestamp=int(time.time())
                )
            )
            
            logger.info(f"Published message to {routing_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish message: {e}")
            return False
    
    def subscribe_to_queue(self, queue_name: str, routing_key: str, 
                          handler: Callable[[Dict[str, Any]], None]):
        if not self.connected:
            logger.warning("Cannot subscribe - not connected to RabbitMQ")
            return
        
        def consume_messages():
            try:
                # Declare queue
                self.channel.queue_declare(queue=queue_name, durable=True)
                self.channel.queue_bind(
                    exchange=self.exchange_name,
                    queue=queue_name,
                    routing_key=routing_key
                )
                
                def callback(ch, method, properties, body):
                    try:
                        message = json.loads(body.decode('utf-8'))
                        handler(message)
                        ch.basic_ack(delivery_tag=method.delivery_tag)
                    except Exception as e:
                        logger.error(f"Message handler error: {e}")
                        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                
                self.channel.basic_consume(
                    queue=queue_name,
                    on_message_callback=callback
                )
                
                logger.info(f"Started consuming from queue {queue_name}")
                self.channel.start_consuming()
                
            except Exception as e:
                logger.error(f"Queue consumer error: {e}")
        
        # Start consumer in background thread
        consumer_thread = threading.Thread(target=consume_messages, daemon=True)
        consumer_thread.start()
    
    def disconnect(self):
        if self.connection and not self.connection.is_closed:
            self.connection.close()
        self.connected = False
        logger.info("RabbitMQ disconnected")

# Event-driven decorators
def event_handler(event_type: str, event_processor: EventStreamProcessor):
    def decorator(func: Callable[[DomainEvent], None]) -> Callable:
        event_processor.subscribe_local(event_type, func)
        return func
    return decorator

def publish_event(event_type: str, topic: str = 'domain-events'):
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            
            # Extract event processor from args or use global instance
            event_processor = getattr(args[0], 'event_processor', None) if args else None
            if event_processor:
                event_processor.publish_event(
                    topic,
                    event_type,
                    {'result': result, 'function': func.__name__}
                )
            
            return result
        return wrapper
    return decorator