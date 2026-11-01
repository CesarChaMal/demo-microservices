package caching

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// CacheWarming preloads hot keys into the cache before traffic arrives (at
// startup or on a schedule) so the first requests don't all stampede the
// backing store.
type CacheWarming struct {
	mu       sync.Mutex
	store    map[string]any
	hotKeys  []string
	warmRuns int
	warmedAt time.Time
	warmMs   int64
	loads    int
}

// NewCacheWarming warms the given hot keys using workerCount parallel
// loaders.
func NewCacheWarming(hotKeys []string, workerCount int) *CacheWarming {
	cw := &CacheWarming{store: map[string]any{}, hotKeys: hotKeys}
	cw.warm(workerCount)
	return cw
}

// warm loads every hot key into the cache with a bounded worker pool.
func (cw *CacheWarming) warm(workerCount int) {
	started := time.Now()
	cw.mu.Lock()
	cw.warmRuns++
	cw.mu.Unlock()

	work := make(chan string)
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for key := range work {
				// simulate the slow backing-store read being preloaded
				time.Sleep(5 * time.Millisecond)
				cw.mu.Lock()
				cw.loads++
				cw.store[key] = "warmed:" + key
				cw.mu.Unlock()
			}
		}()
	}
	for _, k := range cw.hotKeys {
		work <- k
	}
	close(work)
	wg.Wait()

	cw.mu.Lock()
	cw.warmedAt = time.Now()
	cw.warmMs = time.Since(started).Milliseconds()
	cw.mu.Unlock()
}

// Rewarm re-runs the preload on demand.
func (cw *CacheWarming) Rewarm(workerCount int) { cw.warm(workerCount) }

// Get serves a warmed key.
func (cw *CacheWarming) Get(key string) (any, bool) {
	cw.mu.Lock()
	defer cw.mu.Unlock()
	v, ok := cw.store[key]
	return v, ok
}

// Stats reports warming state.
func (cw *CacheWarming) Stats() map[string]any {
	cw.mu.Lock()
	defer cw.mu.Unlock()
	return map[string]any{
		"hot_keys":   len(cw.hotKeys),
		"cached":     len(cw.store),
		"warm_runs":  cw.warmRuns,
		"loads":      cw.loads,
		"last_warm_ms": cw.warmMs,
		"warmed_at":  cw.warmedAt.Format(time.RFC3339),
	}
}

func (cw *CacheWarming) Name() string     { return "Cache Warming" }
func (cw *CacheWarming) Category() string { return "caching" }
func (cw *CacheWarming) Description() string {
	return "Preloads the cache with hot keys at startup so the first requests skip the slow backing store."
}

func (cw *CacheWarming) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/cache-warming", cw.handleDemo)
	r.Get("/cache/warm", cw.handleDemo)
}

func (cw *CacheWarming) handleDemo(w http.ResponseWriter, req *http.Request) {
	if req.URL.Query().Get("rewarm") == "true" {
		cw.Rewarm(4)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  cw.Name(),
		"category": cw.Category(),
		"stats":    cw.Stats(),
		"note":     "cache was warm before the first request; ?rewarm=true re-runs the preload",
	})
}
