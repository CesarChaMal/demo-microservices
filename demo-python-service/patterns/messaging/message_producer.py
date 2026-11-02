"""
Message Producer Pattern (#29 of the canonical 32).

Sibling implementations:
  - demo-go-service/patterns/messaging/messageProducer.go
  - demo-node-service/patterns/messaging/messageProducer.js
  - demo-java-service .../messaging/MessageProducer.java
Catalog entry: docs/PYTHON-PATTERNS.md "## 29. Message Producer Pattern"

In-memory producer with a bounded buffer: when the buffer is full the
message is DROPPED and counted, making backpressure visible in stats —
the same semantics as the Go implementation, without a broker dependency.
"""
import threading
import time
from collections import deque
from typing import Any, Dict, Optional


class ProducedMessage:
    """A single message waiting in the producer buffer."""

    def __init__(self, message_id: int, topic: str, key: str, payload: Dict[str, Any]):
        self.id = message_id
        self.topic = topic
        self.key = key
        self.payload = payload
        self.published_at = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'topic': self.topic,
            'key': self.key,
            'payload': self.payload,
            'published_at': self.published_at
        }


class MessageProducer:
    """Bounded-buffer producer; a full buffer drops the message and counts it."""

    def __init__(self, capacity: int = 64):
        self._lock = threading.Lock()
        self._buffer = deque()  # no maxlen: drops are explicit and counted, not silent
        self._capacity = capacity
        self._counter = 0
        self.published = 0
        self.consumed = 0
        self.dropped = 0
        self.topics: Dict[str, int] = {}

    def publish(self, topic: str, key: str, payload: Dict[str, Any]) -> bool:
        """Publish a message; returns False when the full buffer dropped it."""
        with self._lock:
            self._counter += 1
            if len(self._buffer) >= self._capacity:
                self.dropped += 1
                return False

            message = ProducedMessage(self._counter, topic, key, payload)
            self._buffer.append(message)
            self.published += 1
            self.topics[topic] = self.topics.get(topic, 0) + 1
            return True

    def consume(self) -> Optional[ProducedMessage]:
        """Consume one buffered message (FIFO). Returns None when empty."""
        with self._lock:
            if not self._buffer:
                return None
            self.consumed += 1
            return self._buffer.popleft()

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                'published': self.published,
                'consumed': self.consumed,
                'buffered': len(self._buffer),
                'buffer_capacity': self._capacity,
                'dropped': self.dropped,
                'topics': dict(self.topics)
            }


# Shared instance used by the /messaging/produce route in app.py
message_producer = MessageProducer()
