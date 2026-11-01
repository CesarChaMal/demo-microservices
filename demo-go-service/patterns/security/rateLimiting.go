// Package security holds the traffic-control patterns: Rate Limiting and
// the Token Bucket Rate Limiter.
package security

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

// RateLimiter is a fixed-window counter: each client (keyed by caller
// identity) gets at most limit requests per window.
type RateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
	allowed int
	denied  int
}

// NewRateLimiter allows limit requests per window per client.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{limit: limit, window: window, hits: map[string][]time.Time{}}
}

// Allow records a request for key and reports whether it fits the budget.
func (rl *RateLimiter) Allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-rl.window)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	recent := rl.hits[key][:0]
	for _, ts := range rl.hits[key] {
		if ts.After(cutoff) {
			recent = append(recent, ts)
		}
	}
	if len(recent) >= rl.limit {
		rl.hits[key] = recent
		rl.denied++
		return false
	}
	recent = append(recent, now)
	rl.hits[key] = recent
	rl.allowed++
	return true
}

// Stats reports limiter counters.
func (rl *RateLimiter) Stats() map[string]any {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return map[string]any{
		"limit":     rl.limit,
		"window":    rl.window.String(),
		"clients":   len(rl.hits),
		"allowed":   rl.allowed,
		"denied":    rl.denied,
	}
}

func (rl *RateLimiter) Name() string     { return "Rate Limiting" }
func (rl *RateLimiter) Category() string { return "security" }
func (rl *RateLimiter) Description() string {
	return "Fixed-window counter that caps requests per client per window, protecting the service from abuse."
}

func (rl *RateLimiter) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/rate-limiting", rl.handleDemo)
	r.Get("/rate-limited", rl.handleDemo)
}

func (rl *RateLimiter) handleDemo(w http.ResponseWriter, req *http.Request) {
	key := req.URL.Query().Get("client")
	if key == "" {
		key = "demo-client"
	}
	if !rl.Allow(key) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"pattern":  rl.Name(),
			"category": rl.Category(),
			"error":    "rate limit exceeded, slow down",
			"client":   key,
			"stats":    rl.Stats(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  rl.Name(),
		"category": rl.Category(),
		"client":   key,
		"allowed":  true,
		"stats":    rl.Stats(),
	})
}
