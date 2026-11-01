"""Seed tests for demo-python-service (run with: python -m pytest tests/ -q).

app.py is safe to import from tests: everything with external side effects
(Eureka registration, app.run) sits behind the `if __name__ == '__main__':`
guard, and the module-level calls that do run (structlog.configure, health
checks, saga registration) are pure in-memory wiring.
"""

import pytest

from app import ProcessingRequest, ProcessingService
from patterns.messaging.message_producer import MessageProducer, message_producer


# --- /process contract math (the x2 default shared across the repo) ---


def test_process_default_algorithm_doubles():
    result = ProcessingService().process(ProcessingRequest(value=21))
    assert result.result == 42
    assert result.status == 'SUCCESS'
    assert result.algorithm == 'default'


def test_process_double_algorithm():
    result = ProcessingService().process(ProcessingRequest(value=21, algorithm='double'))
    assert result.result == 42


def test_process_triple_and_square():
    service = ProcessingService()
    assert service.process(ProcessingRequest(value=21, algorithm='triple')).result == 63
    assert service.process(ProcessingRequest(value=21, algorithm='square')).result == 441
    assert service.process(ProcessingRequest(value=0, algorithm='double')).result == 0


@pytest.mark.parametrize('bad_value', [-1, 1_000_001, 'not-a-number', None])
def test_process_rejects_invalid_values(bad_value):
    with pytest.raises(ValueError):
        ProcessingService().process(ProcessingRequest(value=bad_value))


# --- Message Producer pattern (#29): bounded buffer, visible backpressure ---


def test_message_producer_fifo_and_stats():
    producer = MessageProducer(capacity=8)
    assert producer.publish('orders', 'k1', {'value': 1}) is True
    assert producer.publish('orders', 'k2', {'value': 2}) is True

    first = producer.consume()
    second = producer.consume()
    assert first.payload == {'value': 1}
    assert second.payload == {'value': 2}
    assert first.id < second.id

    stats = producer.get_stats()
    assert stats['published'] == 2
    assert stats['consumed'] == 2
    assert stats['buffered'] == 0
    assert stats['dropped'] == 0
    assert stats['buffer_capacity'] == 8
    assert stats['topics'] == {'orders': 2}


def test_message_producer_drops_when_full():
    producer = MessageProducer(capacity=2)
    assert producer.publish('t', 'k1', {}) is True
    assert producer.publish('t', 'k2', {}) is True
    assert producer.publish('t', 'k3', {}) is False  # dropped, not blocked
    assert producer.publish('t', 'k4', {}) is False

    stats = producer.get_stats()
    assert stats['dropped'] == 2
    assert stats['buffered'] == 2
    assert stats['published'] == 2


def test_message_producer_consume_empty_returns_none():
    assert MessageProducer().consume() is None


def test_message_producer_shared_singleton_wired():
    # The /messaging/produce route in app.py uses this exact instance.
    assert isinstance(message_producer, MessageProducer)
