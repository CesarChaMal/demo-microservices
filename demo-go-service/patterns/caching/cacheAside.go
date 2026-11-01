// Package caching holds the cache-management patterns: Cache-Aside,
// Write-Behind Cache, Materialized View and Cache Warming.
package caching

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

// entry is a cached value with an expiry.
type entry struct {
	value   any
	expires time.Time
}

func (e entry) expired(now time.Time) bool { return now.After(e.expires) }

// CacheAside keeps a read-through cache in front of a slow "database":
// reads hit the cache first, misses load from the source and backfill.
type CacheAside struct {
	mu      sync.RWMutex
	ttl     time.Duration
	store   map[string]entry
	hits    int
	misses  int
	writes  int
	evicted int
}

// NewCacheAside caches values for ttl.
func NewCacheAside(ttl time.Duration) *CacheAside {
	return &CacheAside{ttl: ttl, store: map[string]entry{}}
}

// Get returns the cached value, loading it via load on a miss (or expiry).
func (c *CacheAside) Get(key string, load func() any) any {
	now := time.Now()

	c.mu.RLock()
	if e, ok := c.store[key]; ok && !e.expired(now) {
		c.mu.RUnlock()
		c.mu.Lock()
		c.hits++
		c.mu.Unlock()
		return e.value
	}
	c.mu.RUnlock()

	// miss: load from the backing source, then backfill
	value := load()
	c.mu.Lock()
	c.misses++
	if _, exists := c.store[key]; exists {
		c.evicted++ // overwritten after expiry
	}
	c.store[key] = entry{value: value, expires: now.Add(c.ttl)}
	c.mu.Unlock()
	return value
}

// Set writes through to the cache only (the demo's backing store is the map).
func (c *CacheAside) Set(key string, value any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.writes++
	c.store[key] = entry{value: value, expires: time.Now().Add(c.ttl)}
}

// Stats reports cache effectiveness.
func (c *CacheAside) Stats() map[string]any {
	c.mu.RLock()
	defer c.mu.RUnlock()
	total := c.hits + c.misses
	ratio := 0.0
	if total > 0 {
		ratio = float64(c.hits) / float64(total)
	}
	return map[string]any{
		"size":         len(c.store),
		"ttl":          c.ttl.String(),
		"hits":         c.hits,
		"misses":       c.misses,
		"writes":       c.writes,
		"evictions":    c.evicted,
		"hit_ratio":    ratio,
	}
}

func (c *CacheAside) Name() string     { return "Cache-Aside" }
func (c *CacheAside) Category() string { return "caching" }
func (c *CacheAside) Description() string {
	return "Reads check the cache first and fall back to the source on a miss, backfilling the cache for the next reader."
}

func (c *CacheAside) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/cache-aside", c.handleDemo)
}

func (c *CacheAside) handleDemo(w http.ResponseWriter, req *http.Request) {
	key := req.URL.Query().Get("key")
	if key == "" {
		key = "user:42"
	}
	dbLoads := 0
	value := c.Get(key, func() any {
		dbLoads++
		return map[string]any{"id": key, "name": "loaded from backing store", "loaded_at": time.Now().Format(time.RFC3339)}
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  c.Name(),
		"category": c.Category(),
		"key":      key,
		"value":    value,
		"db_loads": dbLoads, // 1 on the first call, 0 while cached
		"stats":    c.Stats(),
		"hint":     "repeat the same ?key= twice and watch db_loads drop to 0",
	})
}
