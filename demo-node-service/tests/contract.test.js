'use strict';

/**
 * Seed tests for demo-node-service (run with: node --test tests/).
 *
 * Scope note: these tests deliberately do NOT require('../app') — app.js
 * starts the HTTP server and the Eureka client at import time (the
 * app.listen() call is not guarded by a require.main check), so importing
 * it would bind port 3000 and phone Eureka from inside the test runner.
 * The x2 contract math is covered by the Python and Java seed tests
 * (ProcessingService); here we pin the pattern-module contracts and the
 * pattern catalog structure instead.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { MessageProducer, messageProducer } = require('../patterns/messaging/messageProducer');

test('messageProducer: publish buffers and consume drains FIFO', () => {
    const producer = new MessageProducer(8);
    assert.equal(producer.publish('orders', 'k1', { value: 1 }), true);
    assert.equal(producer.publish('orders', 'k2', { value: 2 }), true);
    assert.equal(producer.publish('orders', 'k3', { value: 3 }), true);

    const first = producer.consume();
    const second = producer.consume();
    assert.equal(first.payload.value, 1);
    assert.equal(second.payload.value, 2);
    assert.ok(first.id < second.id, 'ids are monotonic');

    const stats = producer.getStats();
    assert.equal(stats.published, 3);
    assert.equal(stats.consumed, 2);
    assert.equal(stats.buffered, 1);
    assert.equal(stats.dropped, 0);
    assert.equal(stats.topics.orders, 3);
});

test('messageProducer: a full buffer drops the message and counts it (visible backpressure)', () => {
    const producer = new MessageProducer(2);
    assert.equal(producer.publish('t', 'k1', {}), true);
    assert.equal(producer.publish('t', 'k2', {}), true);
    assert.equal(producer.publish('t', 'k3', {}), false, 'buffer full → message dropped');
    assert.equal(producer.publish('t', 'k4', {}), false);

    const stats = producer.getStats();
    assert.equal(stats.buffered, 2);
    assert.equal(stats.dropped, 2);
    assert.equal(stats.published, 2);
    assert.equal(stats.bufferCapacity, 2);
});

test('messageProducer: consume on an empty buffer returns null', () => {
    const producer = new MessageProducer(4);
    assert.equal(producer.consume(), null);
});

test('messageProducer: shared singleton is wired', () => {
    // The /messaging/produce route in app.js uses this exact instance.
    assert.ok(messageProducer instanceof MessageProducer);
});

test('pattern catalog: at least the 32 canonical pattern files are present', () => {
    const patternsDir = path.join(__dirname, '..', 'patterns');
    let files = 0;
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) files += 1;
        }
    };
    walk(patternsDir);
    assert.ok(files >= 32, `expected >= 32 pattern files under patterns/, found ${files}`);
});
