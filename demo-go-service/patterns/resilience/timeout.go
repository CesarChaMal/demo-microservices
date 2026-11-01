package resilience

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// Timeout bounds how long a call may take: the operation runs in its own
// context and the caller gets control back the moment the budget expires,
// whether the operation finished or not.
type Timeout struct {
	mu       sync.Mutex
	budget   time.Duration
	timedOut int
	ok       int
}

// NewTimeout gives every call the given budget.
func NewTimeout(budget time.Duration) *Timeout {
	return &Timeout{budget: budget}
}

// Execute runs fn under the timeout budget and returns
// context.DeadlineExceeded if it overran.
func (t *Timeout) Execute(fn func(ctx context.Context) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), t.budget)
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- fn(ctx) }()

	select {
	case err := <-done:
		t.mu.Lock()
		t.ok++
		t.mu.Unlock()
		return err
	case <-ctx.Done():
		t.mu.Lock()
		t.timedOut++
		t.mu.Unlock()
		return ctx.Err()
	}
}

// Stats reports timeout counters.
func (t *Timeout) Stats() map[string]any {
	t.mu.Lock()
	defer t.mu.Unlock()
	return map[string]any{
		"timeout_ms": t.budget.Milliseconds(),
		"completed":  t.ok,
		"timed_out":  t.timedOut,
	}
}

func (t *Timeout) Name() string     { return "Timeout" }
func (t *Timeout) Category() string { return "resilience" }
func (t *Timeout) Description() string {
	return "Bounds a call's runtime with a context deadline so a hung dependency cannot hold the caller forever."
}

func (t *Timeout) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/timeout", t.handleDemo)
}

func (t *Timeout) handleDemo(w http.ResponseWriter, req *http.Request) {
	// Default work (300ms) deliberately overruns the 200ms budget.
	work := 300 * time.Millisecond
	if v := req.URL.Query().Get("work_ms"); v != "" {
		if d, err := time.ParseDuration(v + "ms"); err == nil {
			work = d
		}
	}

	started := time.Now()
	err := t.Execute(func(ctx context.Context) error {
		select {
		case <-time.After(work):
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	})

	response := map[string]any{
		"pattern":     t.Name(),
		"category":    t.Category(),
		"work":        work.String(),
		"elapsed":     time.Since(started).String(),
		"stats":       t.Stats(),
	}
	if err != nil {
		response["outcome"] = err.Error()
	} else {
		response["outcome"] = "completed within budget"
	}
	writeJSON(w, http.StatusOK, response)
}
