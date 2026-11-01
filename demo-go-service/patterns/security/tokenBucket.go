package security

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// TokenBucket refills tokens at a steady rate and charges one per request:
// bursts up to the bucket size pass instantly, sustained traffic is capped
// at the refill rate.
type TokenBucket struct {
	mu       sync.Mutex
	capacity float64
	tokens   float64
	refill   float64 // tokens per second
	last     time.Time
	allowed  int
	denied   int
}

// NewTokenBucket builds a bucket of capacity tokens refilled at rate
// tokens/second.
func NewTokenBucket(capacity int, ratePerSecond float64) *TokenBucket {
	return &TokenBucket{
		capacity: float64(capacity),
		tokens:   float64(capacity),
		refill:   ratePerSecond,
		last:     time.Now(),
	}
}

// Take removes one token if available and reports whether the call passes.
func (tb *TokenBucket) Take() bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := time.Now()
	tb.tokens += now.Sub(tb.last).Seconds() * tb.refill
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}
	tb.last = now

	if tb.tokens < 1 {
		tb.denied++
		return false
	}
	tb.tokens--
	tb.allowed++
	return true
}

// Stats reports bucket state.
func (tb *TokenBucket) Stats() map[string]any {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	return map[string]any{
		"capacity":        tb.capacity,
		"tokens":          tb.tokens,
		"refill_per_sec":  tb.refill,
		"allowed":         tb.allowed,
		"denied":          tb.denied,
	}
}

func (tb *TokenBucket) Name() string     { return "Token Bucket Rate Limiter" }
func (tb *TokenBucket) Category() string { return "security" }
func (tb *TokenBucket) Description() string {
	return "Bucket of refillable tokens: bursts drain the bucket, sustained traffic is throttled to the refill rate."
}

func (tb *TokenBucket) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/token-bucket-rate-limiter", tb.handleDemo)
}

func (tb *TokenBucket) handleDemo(w http.ResponseWriter, req *http.Request) {
	if !tb.Take() {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"pattern":  tb.Name(),
			"category": tb.Category(),
			"error":    "no tokens available, try again after refill",
			"stats":    tb.Stats(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  tb.Name(),
		"category": tb.Category(),
		"allowed":  true,
		"stats":    tb.Stats(),
		"note":     "capacity 5, refill 1/s; burst 6 requests to see a 429",
	})
}
