from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Any, Optional
import json
import uuid
import logging
import threading
import time
import os

logger = logging.getLogger(__name__)

@dataclass
class OutboxEvent:
    id: str
    aggregate_id: str
    event_type: str
    event_data: str
    created_at: datetime = field(default_factory=datetime.now)
    processed: bool = False
    processed_at: Optional[datetime] = None

class OutboxRepository:
    def __init__(self):
        self.events: Dict[str, OutboxEvent] = {}
        self.lock = threading.Lock()
        self.persistence_enabled = os.getenv('FLASK_ENV') == 'production'
    
    def save(self, event: OutboxEvent):
        with self.lock:
            self.events[event.id] = event
    
    def find_unprocessed(self) -> List[OutboxEvent]:
        with self.lock:
            return [event for event in self.events.values() if not event.processed]
    
    def mark_processed(self, event_id: str):
        with self.lock:
            if event_id in self.events:
                self.events[event_id].processed = True
                self.events[event_id].processed_at = datetime.now()

class EventPublisher:
    def __init__(self):
        self.subscribers: Dict[str, List[callable]] = {}
    
    def subscribe(self, event_type: str, handler: callable):
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(handler)
    
    def publish(self, event_type: str, event_data: Dict[str, Any]):
        if event_type in self.subscribers:
            for handler in self.subscribers[event_type]:
                try:
                    handler(event_data)
                    logger.info(f"Published event {event_type}")
                except Exception as e:
                    logger.error(f"Failed to publish event {event_type}: {e}")

class OutboxService:
    def __init__(self, repository: OutboxRepository, publisher: EventPublisher):
        self.repository = repository
        self.publisher = publisher
        self.running = False
        self.processor_thread = None
    
    def save_event(self, aggregate_id: str, event_type: str, event_data: Dict[str, Any]):
        event = OutboxEvent(
            id=str(uuid.uuid4()),
            aggregate_id=aggregate_id,
            event_type=event_type,
            event_data=json.dumps(event_data)
        )
        self.repository.save(event)
        logger.info(f"Saved outbox event {event.id}")
    
    def start_processor(self):
        if not self.running:
            self.running = True
            self.processor_thread = threading.Thread(target=self._process_events)
            self.processor_thread.daemon = True
            self.processor_thread.start()
            logger.info("Started outbox event processor")
    
    def stop_processor(self):
        self.running = False
        if self.processor_thread:
            self.processor_thread.join()
        logger.info("Stopped outbox event processor")
    
    def _process_events(self):
        while self.running:
            try:
                unprocessed_events = self.repository.find_unprocessed()
                for event in unprocessed_events:
                    try:
                        event_data = json.loads(event.event_data)
                        self.publisher.publish(event.event_type, event_data)
                        self.repository.mark_processed(event.id)
                        logger.info(f"Processed outbox event {event.id}")
                    except Exception as e:
                        logger.error(f"Failed to process event {event.id}: {e}")
                
                time.sleep(1)  # Poll every second
            except Exception as e:
                logger.error(f"Error in outbox processor: {e}")
                time.sleep(5)  # Wait longer on error

# Global instances
outbox_repository = OutboxRepository()
event_publisher = EventPublisher()
outbox_service = OutboxService(outbox_repository, event_publisher)

# Example event handlers
def handle_data_processed(event_data):
    logger.info(f"Handling data processed event: {event_data}")

def handle_order_created(event_data):
    logger.info(f"Handling order created event: {event_data}")

# Register event handlers
event_publisher.subscribe('data_processed', handle_data_processed)
event_publisher.subscribe('order_created', handle_order_created)