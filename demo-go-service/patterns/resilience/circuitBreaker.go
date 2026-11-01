// Package resilience holds the failure-isolation patterns: Circuit Breaker,
// Retry, Bulkhead and Timeout.
package resilience

import (
	"encoding/json"
	"errors"
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

// ErrCircuitOpen is returned while the breaker refuses calls.
var ErrCircuitOpen = errors.New("circuit breaker is open")

type circuitState string

const (
	stateClosed   circuitState = "closed"
	stateOpen     circuitState = "open"
	stateHalfOpen circuitState = "half-open"
)

// CircuitBreaker stops hammering a failing dependency: after N consecutive
// failures it opens for a cool-off window, then lets a half-open probe
// through before closing again.
type CircuitBreaker struct {
	mu               sync.Mutex
	failureThreshold int
	resetTimeout     time.Duration
	state            circuitState
	failures         int
	successes        int
	rejected         int
	lastStateChange  time.Time
}

// NewCircuitBreaker opens the breaker after failureThreshold consecutive
// failures and keeps it open for resetTimeout.
func NewCircuitBreaker(failureThreshold int, resetTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		failureThreshold: failureThreshold,
		resetTimeout:     resetTimeout,
		state:            stateClosed,
		lastStateChange:  time.Now(),
	}
}

// Call executes fn through the breaker, or fails fast with ErrCircuitOpen.
func (cb *CircuitBreaker) Call(fn func() error) error {
	cb.mu.Lock()
	if cb.state == stateOpen {
		if time.Since(cb.lastStateChange) >= cb.resetTimeout {
			cb.state = stateHalfOpen // allow a single probe call
		} else {
			cb.rejected++
			cb.mu.Unlock()
			return ErrCircuitOpen
		}
	}
	cb.mu.Unlock()

	err := fn()

	cb.mu.Lock()
	defer cb.mu.Unlock()
	if err == nil {
		cb.successes++
		cb.failures = 0
		if cb.state != stateClosed {
			cb.state = stateClosed
			cb.lastStateChange = time.Now()
		}
		return nil
	}
	cb.failures++
	if cb.state == stateHalfOpen || cb.failures >= cb.failureThreshold {
		cb.state = stateOpen
		cb.lastStateChange = time.Now()
	}
	return err
}

// Stats reports breaker state for /health and /metrics consumers.
func (cb *CircuitBreaker) Stats() map[string]any {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return map[string]any{
		"state":              string(cb.state),
		"failures":           cb.failures,
		"successes":          cb.successes,
		"rejected":           cb.rejected,
		"failure_threshold":  cb.failureThreshold,
		"reset_timeout_ms":   cb.resetTimeout.Milliseconds(),
	}
}

func (cb *CircuitBreaker) Name() string     { return "Circuit Breaker" }
func (cb *CircuitBreaker) Category() string { return "resilience" }
func (cb *CircuitBreaker) Description() string {
	return "Fails fast when a dependency keeps erroring; opens for a cool-off window, probes with a half-open call, then closes again."
}

// RegisterRoutes mounts the pattern demo endpoints: the uniform Go surface
// plus the python-style alias used by the sibling services.
func (cb *CircuitBreaker) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/circuit-breaker", cb.handleDemo)
	r.Post("/process-with-circuit-breaker", cb.handleDemo)
}

func (cb *CircuitBreaker) handleDemo(w http.ResponseWriter, req *http.Request) {
	fail := req.URL.Query().Get("fail") == "true"
	if req.Method == http.MethodPost {
		var body struct {
			Fail *bool `json:"fail"`
		}
		if err := json.NewDecoder(req.Body).Decode(&body); err == nil && body.Fail != nil {
			fail = *body.Fail
		}
	}

	outcome := "success"
	status := http.StatusOK
	if err := cb.Call(func() error {
		if fail {
			return errors.New("dependency unavailable")
		}
		return nil
	}); err != nil {
		status = http.StatusServiceUnavailable
		outcome = err.Error()
	}

	writeJSON(w, status, map[string]any{
		"pattern":    cb.Name(),
		"category":   cb.Category(),
		"outcome":    outcome,
		"stats":      cb.Stats(),
		"hint":       "pass ?fail=true (or body {\"fail\":true}) to trip the breaker",
	})
}
