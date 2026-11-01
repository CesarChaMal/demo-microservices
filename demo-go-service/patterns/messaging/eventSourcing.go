// Package messaging holds the event-driven patterns: Event Sourcing, Inbox,
// Message Producer and Event Stream Processor.
package messaging

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// writeJSON is the shared response helper for every patterns package.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// domainEvent is an immutable fact appended to the event log.
type domainEvent struct {
	Sequence  int    `json:"sequence"`
	Aggregate string `json:"aggregate"`
	Type      string `json:"type"`
	Payload   map[string]any `json:"payload"`
	Timestamp string `json:"timestamp"`
}

// EventStore persists state as an append-only log of events; current state
// is rebuilt by replaying the log, never by overwriting rows.
type EventStore struct {
	mu     sync.RWMutex
	log    []domainEvent
	byID   map[string][]int // aggregate ID -> positions in log
}

// NewEventStore builds an empty log.
func NewEventStore() *EventStore {
	return &EventStore{byID: map[string][]int{}}
}

// Append records an event for an aggregate and returns its sequence number.
func (es *EventStore) Append(aggregate, eventType string, payload map[string]any) int {
	es.mu.Lock()
	defer es.mu.Unlock()
	seq := len(es.log) + 1
	es.log = append(es.log, domainEvent{
		Sequence:  seq,
		Aggregate: aggregate,
		Type:      eventType,
		Payload:   payload,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	})
	es.byID[aggregate] = append(es.byID[aggregate], seq-1)
	return seq
}

// Events returns the full ordered log (newest optional).
func (es *EventStore) Events() []domainEvent {
	es.mu.RLock()
	defer es.mu.RUnlock()
	out := make([]domainEvent, len(es.log))
	copy(out, es.log)
	return out
}

// Replay rebuilds current state for one aggregate by folding its events.
func (es *EventStore) Replay(aggregate string) map[string]any {
	es.mu.RLock()
	positions := es.byID[aggregate]
	events := es.log
	es.mu.RUnlock()

	state := map[string]any{"aggregate": aggregate, "balance": 0, "status": "new"}
	for _, pos := range positions {
		e := events[pos]
		switch e.Type {
		case "AccountOpened":
			state["status"] = "open"
		case "MoneyDeposited":
			state["balance"] = state["balance"].(int) + e.Payload["amount"].(int)
		case "MoneyWithdrawn":
			state["balance"] = state["balance"].(int) - e.Payload["amount"].(int)
		case "AccountClosed":
			state["status"] = "closed"
		}
		state["last_event"] = e.Type
	}
	state["events_applied"] = len(positions)
	return state
}

// Stats reports log size.
func (es *EventStore) Stats() map[string]any {
	es.mu.RLock()
	defer es.mu.RUnlock()
	return map[string]any{
		"total_events": len(es.log),
		"aggregates":   len(es.byID),
	}
}

func (es *EventStore) Name() string     { return "Event Sourcing" }
func (es *EventStore) Category() string { return "messaging" }
func (es *EventStore) Description() string {
	return "Stores an append-only log of domain events and rebuilds current state by replaying it."
}

func (es *EventStore) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/event-sourcing", es.handleDemo)
	r.Get("/events", es.handleDemo)
}

func (es *EventStore) handleDemo(w http.ResponseWriter, req *http.Request) {
	id := req.URL.Query().Get("id")
	if id == "" {
		id = "account-1"
	}
	// Only seed the demo aggregate once, so the log grows visibly per call.
	if seen := func() bool { es.mu.RLock(); defer es.mu.RUnlock(); _, ok := es.byID[id]; return ok }(); !seen {
		es.Append(id, "AccountOpened", nil)
		es.Append(id, "MoneyDeposited", map[string]any{"amount": 100})
		es.Append(id, "MoneyWithdrawn", map[string]any{"amount": 30})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":         es.Name(),
		"category":        es.Category(),
		"aggregate":       id,
		"replayed_state":  es.Replay(id),
		"event_log":       es.Events(),
		"stats":           es.Stats(),
	})
}
