// Package architectural holds the structural patterns: CQRS.
package architectural

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

// command is a write-side intent.
type command struct {
	Type   string `json:"type"`
	Status string `json:"status"`
}

// readModel is the denormalized read-side projection.
type readModel struct {
	RequestID string  `json:"request_id"`
	Amount    float64 `json:"amount"`
	State     string  `json:"state"`
	UpdatedAt string  `json:"updated_at"`
}

// CQRS splits writes from reads: commands go to the write model (and are
// projected asynchronously), queries hit a denormalized read model tuned
// for the question being asked.
type CQRS struct {
	mu        sync.RWMutex
	writeLog  []command
	reads     map[string]readModel
	commandsHandled int
	queriesServed   int
	projectionLag   time.Duration // simulated projection delay
}

// NewCQRS builds the two models.
func NewCQRS() *CQRS {
	return &CQRS{reads: map[string]readModel{}, projectionLag: 25 * time.Millisecond}
}

// Handle routes a command to the write model and projects it to the read
// model (immediately here; the lag stands in for async projection).
func (c *CQRS) Handle(cmdType, requestID string, amount float64) command {
	time.Sleep(c.projectionLag) // async projection in real life

	c.mu.Lock()
	defer c.mu.Unlock()
	c.writeLog = append(c.writeLog, command{Type: cmdType, Status: "accepted"})
	c.commandsHandled++

	switch cmdType {
	case "SubmitRequest":
		c.reads[requestID] = readModel{RequestID: requestID, Amount: amount, State: "submitted", UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
	case "ApproveRequest":
		if rm, ok := c.reads[requestID]; ok {
			rm.State = "approved"
			rm.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			c.reads[requestID] = rm
		}
	}
	return command{Type: cmdType, Status: "accepted"}
}

// Query serves the read model for one request.
func (c *CQRS) Query(requestID string) (readModel, bool) {
	// Lock, not RLock: queriesServed++ is a write.
	c.mu.Lock()
	defer c.mu.Unlock()
	c.queriesServed++
	rm, ok := c.reads[requestID]
	return rm, ok
}

// Stats reports both sides.
func (c *CQRS) Stats() map[string]any {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return map[string]any{
		"commands_handled": c.commandsHandled,
		"queries_served":   c.queriesServed,
		"read_models":      len(c.reads),
		"projection_lag":   c.projectionLag.String(),
	}
}

func (c *CQRS) Name() string     { return "CQRS" }
func (c *CQRS) Category() string { return "architectural" }
func (c *CQRS) Description() string {
	return "Commands write to a write model and are projected into a denormalized read model that queries hit directly."
}

func (c *CQRS) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/cqrs", c.handleDemo)
	r.Post("/query/{requestId}", c.handleQuery)
}

func (c *CQRS) handleDemo(w http.ResponseWriter, req *http.Request) {
	requestID := req.URL.Query().Get("request_id")
	if requestID == "" {
		requestID = "req-1"
	}
	if _, ok := c.Query(requestID); !ok {
		c.Handle("SubmitRequest", requestID, 250)
	}
	rm, _ := c.Query(requestID)
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":    c.Name(),
		"category":   c.Category(),
		"read_model": rm,
		"stats":      c.Stats(),
		"note":       "POST /query/{requestId} reads the projection; commands go through Handle()",
	})
}

func (c *CQRS) handleQuery(w http.ResponseWriter, req *http.Request) {
	requestID := chi.URLParam(req, "requestId")
	rm, ok := c.Query(requestID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"pattern": c.Name(), "category": c.Category(),
			"error": "request not found in read model",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":    c.Name(),
		"category":   c.Category(),
		"read_model": rm,
		"stats":      c.Stats(),
	})
}
