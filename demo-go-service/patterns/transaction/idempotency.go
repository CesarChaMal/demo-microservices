package transaction

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// storedResult caches the outcome of a previously processed request.
type storedResult struct {
	Response map[string]any `json:"response"`
	Created  time.Time      `json:"created"`
	Hits     int            `json:"hits"`
}

// IdempotencyStore replays the stored response for a repeated request id, so
// a client retry after a timeout cannot double-charge or double-create.
type IdempotencyStore struct {
	mu        sync.Mutex
	results   map[string]*storedResult
	ttl       time.Duration
	firstTime int
	replayed  int
	evicted   int
}

// NewIdempotencyStore remembers outcomes for ttl.
func NewIdempotencyStore(ttl time.Duration) *IdempotencyStore {
	return &IdempotencyStore{results: map[string]*storedResult{}, ttl: ttl}
}

// Execute runs fn only the first time key is seen; later calls with the same
// key get the original response without re-running the work.
func (is *IdempotencyStore) Execute(key string, fn func() map[string]any) (map[string]any, bool) {
	is.mu.Lock()
	defer is.mu.Unlock()

	now := time.Now()
	if r, ok := is.results[key]; ok {
		if now.Sub(r.Created) < is.ttl {
			r.Hits++
			is.replayed++
			copied := make(map[string]any, len(r.Response))
			for k, v := range r.Response {
				copied[k] = v
			}
			return copied, false
		}
		is.evicted++ // ttl exceeded: allow re-execution
		delete(is.results, key)
	}

	response := fn()
	is.results[key] = &storedResult{Response: response, Created: now}
	is.firstTime++
	return response, true
}

// Stats reports store counters.
func (is *IdempotencyStore) Stats() map[string]any {
	is.mu.Lock()
	defer is.mu.Unlock()
	return map[string]any{
		"stored_keys":  len(is.results),
		"ttl":          is.ttl.String(),
		"executed":     is.firstTime,
		"replayed":     is.replayed,
		"evicted":      is.evicted,
	}
}

func (is *IdempotencyStore) Name() string     { return "Idempotency" }
func (is *IdempotencyStore) Category() string { return "transaction" }
func (is *IdempotencyStore) Description() string {
	return "Repeats return the stored original response for the same idempotency key, making client retries side-effect free."
}

func (is *IdempotencyStore) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/idempotency", is.handleDemo)
}

func (is *IdempotencyStore) handleDemo(w http.ResponseWriter, req *http.Request) {
	key := req.URL.Query().Get("key")
	if key == "" {
		key = "default-payment"
	}
	executions := 0
	response, first := is.Execute(key, func() map[string]any {
		executions++
		return map[string]any{
			"charge_id": key, "amount": 42, "executions": executions,
			"charged_at": time.Now().UTC().Format(time.RFC3339),
		}
	})
	response["idempotent_replay"] = !first
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  is.Name(),
		"category": is.Category(),
		"key":      key,
		"result":   response,
		"stats":    is.Stats(),
		"hint":     "repeat ?key= to receive the cached response with executions still 1",
	})
}
