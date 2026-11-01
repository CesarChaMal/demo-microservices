// Package broker is a demo-grade RabbitMQ client backing the messaging
// patterns (Message Producer, pattern 29).
//
// Behavior contract, kept deliberately small:
//
//   - NewFromEnv takes the value of RABBITMQ_URL. Empty or "disabled"
//     means "no broker" and every method degrades to a no-op — the
//     pattern falls back to its in-process buffer, so `go run` works
//     with zero infrastructure (the same fallback stance java takes
//     with MySQL -> H2).
//   - The connection is lazy: the first Publish/GetOne dials. After a
//     connection loss the next call re-dials, throttled to one attempt
//     per redialEvery so an absent broker cannot be hammered.
//   - One mutex guards conn+channel because amqp channels are not safe
//     for concurrent use. Demo-scale traffic makes this free.
//   - Stats() exposes enough state (mode, connected, last error, queue
//     depth) for the pattern's HTTP response to teach what the broker
//     is actually doing.
package broker

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// Message is the wire shape shared with the in-process transport.
type Message struct {
	Topic     string         `json:"topic"`
	Key       string         `json:"key"`
	Payload   map[string]any `json:"payload"`
	Timestamp string         `json:"timestamp"`
}

const (
	publishTimeout = 5 * time.Second
	redialEvery    = 5 * time.Second
)

// Broker owns one RabbitMQ connection used exclusively by its owning
// pattern. The zero value is not usable — call NewFromEnv.
type Broker struct {
	url string

	mu          sync.Mutex
	conn        *amqp.Connection
	ch          *amqp.Channel
	lastDial    time.Time
	lastErr     string
	connected   bool
	published   int
	consumed    int
	unavailable int // calls that failed because the broker was down
	queueReady  int // ready messages in the last declared queue
}

// NewFromEnv builds a Broker from the RABBITMQ_URL value. An empty or
// "disabled" url disables the broker entirely (in-process fallback).
func NewFromEnv(url string) *Broker {
	return &Broker{url: url}
}

// Enabled reports whether a broker URL was configured.
func (b *Broker) Enabled() bool {
	return b.url != "" && b.url != "disabled"
}

// Publish declares the topic as a durable queue and publishes the
// payload as a persistent JSON message. Returns false when the broker
// is unreachable — the caller surfaces that as backpressure, exactly
// like a full in-process buffer would.
func (b *Broker) Publish(m Message) bool {
	if !b.Enabled() {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.ensureChannelLocked() {
		b.unavailable++
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), publishTimeout)
	defer cancel()

	// Durable queue + persistent delivery: a broker restart must not
	// silently eat the demo's messages. QueueDeclare is idempotent.
	q, err := b.ch.QueueDeclare(m.Topic, true, false, false, false, nil)
	if err != nil {
		b.failLocked(err)
		return false
	}
	b.queueReady = q.Messages
	body, err := json.Marshal(m.Payload)
	if err != nil {
		b.failLocked(err)
		return false
	}
	err = b.ch.PublishWithContext(ctx, "", q.Name, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		MessageId:    m.Key,
		Timestamp:    time.Now().UTC(),
		Headers:      amqp.Table{"x-demo-key": m.Key},
		Body:         body,
	})
	if err != nil {
		b.failLocked(err)
		return false
	}
	b.published++
	return true
}

// GetOne fetches (and acks) at most one message from the topic queue —
// the consumer side of the demo. ok=false with a nil error just means
// the queue is empty.
func (b *Broker) GetOne(topic string) (Message, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.Enabled() || !b.ensureChannelLocked() {
		return Message{}, false
	}
	q, err := b.ch.QueueDeclare(topic, true, false, false, false, nil)
	if err != nil {
		b.failLocked(err)
		return Message{}, false
	}
	b.queueReady = q.Messages
	delivery, ok, err := b.ch.Get(q.Name, true) // autoAck: the demo drains
	if err != nil {
		b.failLocked(err)
		return Message{}, false
	}
	if !ok {
		return Message{}, false
	}
	var payload map[string]any
	_ = json.Unmarshal(delivery.Body, &payload) // malformed JSON -> nil payload, still consumed
	b.consumed++
	return Message{
		Topic:     topic,
		Key:       delivery.MessageId,
		Payload:   payload,
		Timestamp: delivery.Timestamp.UTC().Format(time.RFC3339Nano),
	}, true
}

// Close releases the channel and connection (best-effort).
func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.closeLocked()
}

// Stats reports transport state for the pattern's HTTP response.
// queueReady is the message count of the last declared queue — the
// "what is sitting in the broker" number the management UI also shows.
func (b *Broker) Stats() map[string]any {
	b.mu.Lock()
	defer b.mu.Unlock()
	return map[string]any{
		"url":          b.url,
		"connected":    b.connected,
		"last_error":   b.lastErr,
		"published":    b.published,
		"consumed":     b.consumed,
		"unavailable":  b.unavailable,
		"queue_ready":  b.queueReady,
	}
}

// ensureChannelLocked returns true when a live channel exists (dialing
// or re-dialing first if needed, throttled). Caller holds b.mu.
func (b *Broker) ensureChannelLocked() bool {
	if b.ch != nil && b.conn != nil && !b.conn.IsClosed() {
		return true
	}
	b.closeLocked()
	if time.Since(b.lastDial) < redialEvery {
		return false // recently failed — don't hammer a down broker
	}
	b.lastDial = time.Now()
	conn, err := amqp.Dial(b.url)
	if err != nil {
		b.failLocked(err)
		return false
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		b.failLocked(err)
		return false
	}
	b.conn, b.ch = conn, ch
	b.connected, b.lastErr = true, ""
	return true
}

func (b *Broker) failLocked(err error) {
	b.connected = false
	b.lastErr = err.Error()
	b.closeLocked()
}

func (b *Broker) closeLocked() {
	if b.ch != nil {
		_ = b.ch.Close()
	}
	if b.conn != nil {
		_ = b.conn.Close()
	}
	b.ch, b.conn = nil, nil
	b.connected = false
}
