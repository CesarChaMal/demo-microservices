package caching

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// pendingWrite is a dirty entry waiting to be flushed to the backing store.
type pendingWrite struct {
	key   string
	value any
}

// WriteBehindCache acknowledges writes immediately and persists them in the
// background on a fixed flush interval: callers never wait for the database,
// at the cost of a small data-loss window on crash.
type WriteBehindCache struct {
	mu        sync.Mutex
	cache     map[string]any
	pending   []pendingWrite
	flushed   int
	dropped   int
	stop      chan struct{}
	stopOnce  sync.Once
	flushEvery time.Duration
}

// NewWriteBehindCache starts the background flusher; call Close on shutdown.
func NewWriteBehindCache(flushEvery time.Duration) *WriteBehindCache {
	wb := &WriteBehindCache{
		cache:      map[string]any{},
		stop:       make(chan struct{}),
		flushEvery: flushEvery,
	}
	go wb.loop()
	return wb
}

func (wb *WriteBehindCache) loop() {
	ticker := time.NewTicker(wb.flushEvery)
	defer ticker.Stop()
	for {
		select {
		case <-wb.stop:
			wb.flush("shutdown")
			return
		case <-ticker.C:
			wb.flush("interval")
		}
	}
}

// flush drains the pending list into "the database" (a durable counter here).
func (wb *WriteBehindCache) flush(reason string) int {
	wb.mu.Lock()
	batch := wb.pending
	wb.pending = nil
	wb.mu.Unlock()

	// simulate a slow database write
	time.Sleep(10 * time.Millisecond)

	wb.mu.Lock()
	defer wb.mu.Unlock()
	wb.flushed += len(batch)
	_ = reason
	return len(batch)
}

// Set stores the value and acknowledges instantly; persistence is deferred.
func (wb *WriteBehindCache) Set(key string, value any) {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	wb.cache[key] = value
	wb.pending = append(wb.pending, pendingWrite{key: key, value: value})
	if len(wb.pending) > 1024 { // bound memory if the db stalls
		wb.pending = wb.pending[1:]
		wb.dropped++
	}
}

// Get reads the freshest value (possibly not yet persisted).
func (wb *WriteBehindCache) Get(key string) (any, bool) {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	v, ok := wb.cache[key]
	return v, ok
}

// Stats reports write-behind lag.
func (wb *WriteBehindCache) Stats() map[string]any {
	wb.mu.Lock()
	defer wb.mu.Unlock()
	return map[string]any{
		"cached_keys":   len(wb.cache),
		"pending_writes": len(wb.pending),
		"flushed_writes": wb.flushed,
		"dropped_writes": wb.dropped,
		"flush_every":    wb.flushEvery.String(),
	}
}

// Close stops the flusher and performs a final flush.
func (wb *WriteBehindCache) Close() {
	wb.stopOnce.Do(func() { close(wb.stop) })
}

func (wb *WriteBehindCache) Name() string     { return "Write-Behind Cache" }
func (wb *WriteBehindCache) Category() string { return "caching" }
func (wb *WriteBehindCache) Description() string {
	return "Writes return immediately and are persisted to the backing store in background batches, trading durability for latency."
}

func (wb *WriteBehindCache) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/write-behind-cache", wb.handleDemo)
}

func (wb *WriteBehindCache) handleDemo(w http.ResponseWriter, req *http.Request) {
	key := req.URL.Query().Get("key")
	if key == "" {
		key = "counter"
	}
	wb.Set(key, time.Now().Unix())
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":   wb.Name(),
		"category":  wb.Category(),
		"key":       key,
		"acknowledged_immediately": true,
		"stats":     wb.Stats(),
		"note":      "pending_writes drains on the next flush tick or at shutdown",
	})
}
