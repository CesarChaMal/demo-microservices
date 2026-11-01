package messaging

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// producedMessage is a message sitting in the outbound topic buffer.
type producedMessage struct {
	Topic     string         `json:"topic"`
	Key       string         `json:"key"`
	Payload   map[string]any `json:"payload"`
	Timestamp string         `json:"timestamp"`
}

// MessageProducer publishes messages to in-process topics with optional
// publish confirmation: producers never block on consumers.
type MessageProducer struct {
	mu        sync.Mutex
	buffer    chan producedMessage
	topics    map[string]int
	published int
	dropped   int
}

// NewMessageProducer creates a producer with bufferSize of outbound slack.
func NewMessageProducer(bufferSize int) *MessageProducer {
	mp := &MessageProducer{
		buffer: make(chan producedMessage, bufferSize),
		topics: map[string]int{},
	}
	return mp
}

// Publish appends a message to its topic buffer; a full buffer means the
// consumer is too slow and the message is counted as dropped (backpressure
// made visible).
func (mp *MessageProducer) Publish(topic, key string, payload map[string]any) bool {
	msg := producedMessage{
		Topic: topic, Key: key, Payload: payload,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
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
func (mp *MessageProducer) Consume() (producedMessage, bool) {
	select {
	case m := <-mp.buffer:
		return m, true
	default:
		return producedMessage{}, false
	}
}

// Stats reports producer counters.
func (mp *MessageProducer) Stats() map[string]any {
	mp.mu.Lock()
	defer mp.mu.Unlock()
	return map[string]any{
		"published":      mp.published,
		"buffered":       len(mp.buffer),
		"buffer_capacity": cap(mp.buffer),
		"dropped":        mp.dropped,
		"topics":         mp.topics,
	}
}

func (mp *MessageProducer) Name() string     { return "Message Producer" }
func (mp *MessageProducer) Category() string { return "messaging" }
func (mp *MessageProducer) Description() string {
	return "Publishes messages to a topic buffer without blocking on consumers; overflow is dropped and counted as visible backpressure."
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
		"pattern":   mp.Name(),
		"category":  mp.Category(),
		"topic":     "orders",
		"key":       key,
		"published": ok,
		"stats":     mp.Stats(),
	})
}
