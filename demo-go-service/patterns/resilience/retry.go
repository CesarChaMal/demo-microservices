package resilience

import (
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// ErrRetriesExhausted is returned when every attempt failed.
var ErrRetriesExhausted = errors.New("retry: attempts exhausted")

// Retry retries a failing operation with exponential backoff plus jitter so
// concurrent clients don't stampede the dependency in lockstep.
type Retry struct {
	mu          sync.Mutex
	maxAttempts int
	initial     time.Duration
	max         time.Duration
	attempts    int
	succeeded   int
	exhausted   int
	totalSleep  time.Duration
}

// NewRetry backs off from initial to max between at most maxAttempts calls.
func NewRetry(maxAttempts int, initial, max time.Duration) *Retry {
	return &Retry{maxAttempts: maxAttempts, initial: initial, max: max}
}

// Execute runs fn until it succeeds or the attempts run out. fn receives the
// 1-based attempt number so demos can fail deterministically N times.
func (r *Retry) Execute(fn func(attempt int) error) error {
	delay := r.initial
	var err error
	for attempt := 1; attempt <= r.maxAttempts; attempt++ {
		r.mu.Lock()
		r.attempts++
		r.mu.Unlock()

		if err = fn(attempt); err == nil {
			r.mu.Lock()
			r.succeeded++
			r.mu.Unlock()
			return nil
		}
		if attempt == r.maxAttempts {
			break
		}
		// full jitter: sleep a random fraction of the current backoff
		sleep := time.Duration(rand.Int63n(int64(delay) + 1))
		time.Sleep(sleep)
		r.mu.Lock()
		r.totalSleep += sleep
		r.mu.Unlock()
		delay *= 2
		if delay > r.max {
			delay = r.max
		}
	}
	r.mu.Lock()
	r.exhausted++
	r.mu.Unlock()
	return errors.Join(ErrRetriesExhausted, err)
}

// Stats reports retry counters.
func (r *Retry) Stats() map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	return map[string]any{
		"max_attempts": r.maxAttempts,
		"attempts":     r.attempts,
		"succeeded":    r.succeeded,
		"exhausted":    r.exhausted,
		"total_sleep":  r.totalSleep.String(),
	}
}

func (r *Retry) Name() string     { return "Retry" }
func (r *Retry) Category() string { return "resilience" }
func (r *Retry) Description() string {
	return "Repeats a failing call with exponential backoff and jitter before giving up."
}

func (r *Retry) RegisterRoutes(rx chi.Router) {
	rx.Get("/api/patterns/retry", r.handleDemo)
	rx.Post("/process-with-retry", r.handleDemo)
}

func (r *Retry) handleDemo(w http.ResponseWriter, req *http.Request) {
	failures := 2
	if v := req.URL.Query().Get("failures"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			failures = n
		}
	}
	if req.Method == http.MethodPost {
		var body struct {
			Failures *int `json:"failures"`
		}
		if err := json.NewDecoder(req.Body).Decode(&body); err == nil && body.Failures != nil && *body.Failures >= 0 {
			failures = *body.Failures
		}
	}

	started := time.Now()
	err := r.Execute(func(attempt int) error {
		if attempt <= failures {
			return errors.New("transient failure on attempt " + strconv.Itoa(attempt))
		}
		return nil
	})

	response := map[string]any{
		"pattern":   r.Name(),
		"category":  r.Category(),
		"stats":     r.Stats(),
		"elapsed":   time.Since(started).String(),
		"failures":  failures,
	}
	if err != nil {
		response["outcome"] = err.Error()
		writeJSON(w, http.StatusServiceUnavailable, response)
		return
	}
	response["outcome"] = "succeeded after retries"
	writeJSON(w, http.StatusOK, response)
}
