package messaging

import (
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"demo-go-service/internal/broker"
)

// producedMessage is a message sitting in the outbound topic buffer.
type producedMessage struct {
	Topic     string         `json:"topic"`
	Key       string         `json:"key"`
	Payload   map[string]any `json:"payload"`
	Timestamp string         `json:"timestamp"`
}

// MessageProducer publishes messages with optional publish confirmation:
// producers never block on consumers. Two transports, same contract:
//
//   - RABBITMQ_URL set (compose) -> a real RabbitMQ broker: the topic
//     becomes a durable queue, the payload a persistent JSON message,
//     and a down broker returns the same `false` a full buffer would
//     (backpressure is backpressure).
//   - RABBITMQ_URL unset (bare `go run`) -> the original in-process
//     bounded buffer, so the pattern demos with zero infrastructure.
type MessageProducer struct {
	mu        sync.Mutex
	buffer    chan producedMessage
	topics    map[string]int
	published int
	dropped   int

	transport string
	broker    *broker.Broker
}

// NewMessageProducer creates a producer with bufferSize of outbound
// slack. The transport is chosen from the environment: RABBITMQ_URL
// pointing at a broker enables RabbitMQ, anything else (or "disabled")
// keeps the in-process buffer.
func NewMessageProducer(bufferSize int) *MessageProducer {
	bz := broker.NewFromEnv(os.Getenv("RABBITMQ_URL"))
	transport := "in-process"
	if bz.Enabled() {
		transport = "rabbitmq"
	}
	return &MessageProducer{
		buffer:    make(chan producedMessage, bufferSize),
		topics:    map[string]int{},
		transport: transport,
		broker:    bz,
	}
}

// Publish appends a message to its topic. A false return means visible
// backpressure: on the in-process transport the buffer was full; on
// RabbitMQ the broker was unreachable (after retries) — either way the
// producer was told synchronously instead of blocking or losing the
// message silently.
func (mp *MessageProducer) Publish(topic, key string, payload map[string]any) bool {
	msg := producedMessage{
		Topic: topic, Key: key, Payload: payload,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if mp.transport == "rabbitmq" {
		ok := mp.broker.Publish(broker.Message(msg))
		mp.mu.Lock()
		if ok {
			mp.published++
			mp.topics[topic]++
		} else {
			mp.dropped++
		}
		mp.mu.Unlock()
		return ok
	}
	select {
	case mp.buffer <- msg:
		mp.mu.Lock()
		mp.published++
		mp.topics[topic]++
		mp.mu.Unlock()
		return true
	default:
		mp.mu.Lock()
		mp.dropped++
		mp.mu.Unlock()
		return false
	}
}

// Consume drains one message if available (the demo's consumer side).
// On the RabbitMQ transport the demo only publishes to the "orders"
// queue, so that is the queue drained here.
func (mp *MessageProducer) Consume() (producedMessage, bool) {
	if mp.transport == "rabbitmq" {
		if m, ok := mp.broker.GetOne("orders"); ok {
			return producedMessage(m), true
		}
		return producedMessage{}, false
	}
	select {
	case m := <-mp.buffer:
		return m, true
	default:
		return producedMessage{}, false
	}
}

// Stats reports producer counters plus, on the RabbitMQ transport, the
// broker-side state (connection, queue depth) the management UI shows.
func (mp *MessageProducer) Stats() map[string]any {
	mp.mu.Lock()
	defer mp.mu.Unlock()
	stats := map[string]any{
		"published":       mp.published,
		"buffered":        len(mp.buffer),
		"buffer_capacity": cap(mp.buffer),
		"dropped":         mp.dropped,
		"topics":          mp.topics,
	}
	if mp.transport == "rabbitmq" {
		stats["broker"] = mp.broker.Stats()
	}
	return stats
}

func (mp *MessageProducer) Name() string     { return "Message Producer" }
func (mp *MessageProducer) Category() string { return "messaging" }
func (mp *MessageProducer) Description() string {
	return "Publishes messages to a bounded topic (RabbitMQ when RABBITMQ_URL is set, an in-process buffer otherwise) without blocking on consumers; overflow or an unreachable broker is dropped and counted as visible backpressure."
}
func (mp *MessageProducer) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/message-producer", mp.handleDemo)
}

func (mp *MessageProducer) handleDemo(w http.ResponseWriter, req *http.Request) {
	key := req.URL.Query().Get("key")
	if key == "" {
		key = time.Now().Format("150405.000")
	}
	ok := mp.Publish("orders", key, map[string]any{"event": "order.created", "key": key})
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":    mp.Name(),
		"category":   mp.Category(),
		"transport":  mp.transport,
		"topic":      "orders",
		"key":        key,
		"published":  ok,
		"stats":      mp.Stats(),
	})
}
