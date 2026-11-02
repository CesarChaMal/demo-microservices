/**
 * Message Producer Pattern (#29 of the canonical 32).
 *
 * Sibling implementations:
 *   - demo-go-service/patterns/messaging/messageProducer.go
 *   - demo-python-service/patterns/messaging/message_producer.py
 *   - demo-java-service .../messaging/MessageProducer.java
 * Catalog entry: docs/NODE-PATTERNS.md "## 29. Message Producer Pattern"
 *
 * In-memory producer with a bounded buffer: when the buffer is full the
 * message is DROPPED and counted, making backpressure visible in stats —
 * the same semantics as the Go implementation, without a broker dependency.
 */
class MessageProducer {
    constructor(capacity = 64) {
        this.capacity = capacity;
        this.buffer = [];
        this.topics = new Map(); // topic -> published count
        this.published = 0;
        this.consumed = 0;
        this.dropped = 0;
        this.counter = 0;
    }

    /**
     * Publish a message to a topic. Returns true if buffered, false if the
     * buffer was full and the message was dropped — a full buffer never
     * blocks the caller.
     */
    publish(topic, key, payload) {
        this.counter += 1;
        const message = {
            id: this.counter,
            topic,
            key,
            payload,
            publishedAt: Date.now()
        };

        if (this.buffer.length >= this.capacity) {
            this.dropped += 1;
            return false;
        }

        this.buffer.push(message);
        this.published += 1;
        this.topics.set(topic, (this.topics.get(topic) || 0) + 1);
        return true;
    }

    /** Consume one buffered message (FIFO). Returns null when empty. */
    consume() {
        const message = this.buffer.shift();
        if (message) {
            this.consumed += 1;
        }
        return message || null;
    }

    getStats() {
        return {
            published: this.published,
            consumed: this.consumed,
            buffered: this.buffer.length,
            bufferCapacity: this.capacity,
            dropped: this.dropped,
            topics: Object.fromEntries(this.topics)
        };
    }
}

const messageProducer = new MessageProducer();

module.exports = { MessageProducer, messageProducer };
