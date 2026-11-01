package messaging

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// inboxMessage is a received message awaiting processing.
type inboxMessage struct {
	ID        string         `json:"id"`
	Source    string         `json:"source"`
	Payload   map[string]any `json:"payload"`
	Received  string         `json:"received"`
	Status    string         `json:"status"` // pending | processed | duplicate
}

// Inbox deduplicates inbound messages: each message id is processed exactly
// once even if the producer retries delivery, which is the receive-side
// complement of the Outbox pattern.
type Inbox struct {
	mu       sync.Mutex
	messages map[string]*inboxMessage
	order    []string
	processed int
	duplicates int
}

// NewInbox builds an empty inbox.
func NewInbox() *Inbox {
	return &Inbox{messages: map[string]*inboxMessage{}}
}

// Receive records an inbound message. It reports status "duplicate" when the
// id was already delivered, and "pending"/"processed" otherwise.
func (in *Inbox) Receive(id, source string, payload map[string]any) string {
	in.mu.Lock()
	defer in.mu.Unlock()

	if existing, ok := in.messages[id]; ok {
		in.duplicates++
		existing.Status = "duplicate"
		return "duplicate"
	}
	msg := &inboxMessage{
		ID: id, Source: source, Payload: payload,
		Received: time.Now().UTC().Format(time.RFC3339),
		Status:   "pending",
	}
	in.messages[id] = msg
	in.order = append(in.order, id)

	// handler runs inline in the demo; in production this is a worker
	msg.Status = "processed"
	in.processed++
	return "processed"
}

// Stats reports inbox counters.
func (in *Inbox) Stats() map[string]any {
	in.mu.Lock()
	defer in.mu.Unlock()
	return map[string]any{
		"received":    len(in.messages),
		"processed":   in.processed,
		"duplicates":  in.duplicates,
	}
}

// Snapshot returns inbox messages in arrival order.
func (in *Inbox) Snapshot() []inboxMessage {
	in.mu.Lock()
	defer in.mu.Unlock()
	out := make([]inboxMessage, 0, len(in.order))
	for _, id := range in.order {
		out = append(out, *in.messages[id])
	}
	return out
}

func (in *Inbox) Name() string     { return "Inbox" }
func (in *Inbox) Category() string { return "messaging" }
func (in *Inbox) Description() string {
	return "Receive-side deduplication: each inbound message id is handled exactly once, even across redeliveries."
}

func (in *Inbox) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/inbox", in.handleDemo)
	r.Post("/inbox/message", in.handleDemo)
}

func (in *Inbox) handleDemo(w http.ResponseWriter, req *http.Request) {
	id := req.URL.Query().Get("id")
	if id == "" {
		id = time.Now().Format("20060102T150405.000")
	}
	status := in.Receive(id, "producer-service", map[string]any{"kind": "order.created"})
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":     in.Name(),
		"category":    in.Category(),
		"message_id":  id,
		"status":      status,
		"stats":       in.Stats(),
		"hint":        "resend the same ?id= to see the duplicate path",
	})
}
