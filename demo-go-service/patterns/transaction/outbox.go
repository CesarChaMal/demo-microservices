package transaction

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// outboxMessage is a business event persisted with the transaction and not
// yet published to the broker.
type outboxMessage struct {
	ID        int           `json:"id"`
	Topic     string        `json:"topic"`
	Payload   map[string]any `json:"payload"`
	Created   string        `json:"created"`
	Published bool          `json:"published"`
	PublishedAt string      `json:"published_at,omitempty"`
}

// Outbox solves dual-write: the database change and the outgoing event are
// committed in ONE transaction (the event lands in an outbox table); a
// background dispatcher then relays outbox rows to the broker, so a crash
// between "save" and "publish" can never lose the event.
type Outbox struct {
	mu        sync.Mutex
	nextID    int
	rows      []outboxMessage
	dispatched int
	every     time.Duration
	stop      chan struct{}
	stopOnce  sync.Once
}

// NewOutbox starts the relay loop; call Close on shutdown.
func NewOutbox(dispatchEvery time.Duration) *Outbox {
	ob := &Outbox{every: dispatchEvery, stop: make(chan struct{})}
	go ob.loop()
	return ob
}

func (ob *Outbox) loop() {
	ticker := time.NewTicker(ob.every)
	defer ticker.Stop()
	for {
		select {
		case <-ob.stop:
			ob.Dispatch()
			return
		case <-ticker.C:
			ob.Dispatch()
		}
	}
}

// Save appends an event to the outbox in the same logical transaction as
// the business write (here: same mutex batch).
func (ob *Outbox) Save(topic string, payload map[string]any) int {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	ob.nextID++
	ob.rows = append(ob.rows, outboxMessage{
		ID: ob.nextID, Topic: topic, Payload: payload,
		Created: time.Now().UTC().Format(time.RFC3339Nano),
	})
	return ob.nextID
}

// Dispatch relays unpublished rows to "the broker".
func (ob *Outbox) Dispatch() int {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	sent := 0
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for i := range ob.rows {
		if !ob.rows[i].Published {
			ob.rows[i].Published = true
			ob.rows[i].PublishedAt = now
			ob.dispatched++
			sent++
		}
	}
	return sent
}

// Stats reports outbox state.
func (ob *Outbox) Stats() map[string]any {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	pending := 0
	for _, r := range ob.rows {
		if !r.Published {
			pending++
		}
	}
	return map[string]any{
		"saved":      len(ob.rows),
		"pending":    pending,
		"dispatched": ob.dispatched,
		"interval":   ob.every.String(),
	}
}

// Snapshot returns the outbox rows.
func (ob *Outbox) Snapshot() []outboxMessage {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	out := make([]outboxMessage, len(ob.rows))
	copy(out, ob.rows)
	return out
}

// Close stops the relay loop with a final dispatch.
func (ob *Outbox) Close() { ob.stopOnce.Do(func() { close(ob.stop) }) }

func (ob *Outbox) Name() string     { return "Outbox" }
func (ob *Outbox) Category() string { return "transaction" }
func (ob *Outbox) Description() string {
	return "The business write and its event commit together in one transaction; a relay publishes the outbox rows to the broker afterwards."
}

func (ob *Outbox) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/outbox", ob.handleDemo)
	r.Post("/transaction/outbox", ob.handleDemo)
}

func (ob *Outbox) handleDemo(w http.ResponseWriter, req *http.Request) {
	id := ob.Save("orders.events", map[string]any{
		"event": "order.created", "order_id": ob.nextID + 1,
		"saved_at": time.Now().UTC().Format(time.RFC3339),
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":      ob.Name(),
		"category":     ob.Category(),
		"outbox_id":    id,
		"atomic_with":  "business insert (same transaction)",
		"outbox":       ob.Snapshot(),
		"stats":        ob.Stats(),
		"note":         "the relay publishes pending rows every interval",
	})
}
