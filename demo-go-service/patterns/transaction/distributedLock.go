package transaction

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// lock holds the current owner and expiry of one named lock.
type lock struct {
	owner    string
	expires  time.Time
	acquired time.Time
}

// LockManager implements expiring distributed locks: mutual exclusion for
// critical sections across service instances, with TTLs so a crashed holder
// cannot deadlock the cluster.
type LockManager struct {
	mu        sync.Mutex
	locks     map[string]lock
	acquired  int
	rejected  int
	expired   int
	released  int
}

// NewLockManager builds an empty lock table.
func NewLockManager() *LockManager { return &LockManager{locks: map[string]lock{}} }

// Acquire tries to take the lock for owner with the given TTL. It fails if
// another live holder exists; an expired holder is evicted first.
func (lm *LockManager) Acquire(name, owner string, ttl time.Duration) bool {
	now := time.Now()
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if current, ok := lm.locks[name]; ok {
		if now.Before(current.expires) && current.owner != owner {
			lm.rejected++
			return false
		}
		if now.After(current.expires) {
			lm.expired++ // stale holder cleaned up
		}
	}
	lm.locks[name] = lock{owner: owner, expires: now.Add(ttl), acquired: now}
	lm.acquired++
	return true
}

// Release frees the lock if owner still holds it.
func (lm *LockManager) Release(name, owner string) bool {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	current, ok := lm.locks[name]
	if !ok || current.owner != owner {
		return false
	}
	delete(lm.locks, name)
	lm.released++
	return true
}

// Stats reports lock table counters.
func (lm *LockManager) Stats() map[string]any {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	held := make([]map[string]any, 0, len(lm.locks))
	for name, l := range lm.locks {
		held = append(held, map[string]any{
			"lock": name, "owner": l.owner,
			"expires_in_ms": time.Until(l.expires).Milliseconds(),
		})
	}
	return map[string]any{
		"held": lm.heldCount(), "acquired": lm.acquired,
		"rejected": lm.rejected, "expired": lm.expired, "released": lm.released,
		"locks": held,
	}
}

func (lm *LockManager) heldCount() int { return len(lm.locks) }

func (lm *LockManager) Name() string     { return "Distributed Lock" }
func (lm *LockManager) Category() string { return "transaction" }
func (lm *LockManager) Description() string {
	return "Expiring named locks give one instance at a time access to a critical section; TTLs prevent dead holders."
}

func (lm *LockManager) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/distributed-lock", lm.handleDemo)
}

func (lm *LockManager) handleDemo(w http.ResponseWriter, req *http.Request) {
	name := req.URL.Query().Get("lock")
	if name == "" {
		name = "inventory-restock"
	}
	// A rival holder grabbed the lock 5s ago with a 30s TTL, unless the
	// caller asks to acquire as that rival or release it first.
	action := req.URL.Query().Get("action")
	switch action {
	case "release":
		lm.Release(name, "worker-a")
	default:
		lm.Acquire(name, "worker-a", 30*time.Second)
	}
	granted := lm.Acquire(name, "worker-b", 10*time.Second)
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  lm.Name(),
		"category": lm.Category(),
		"lock":     name,
		"requester": "worker-b",
		"granted":  granted,
		"stats":    lm.Stats(),
		"hint":     "?action=release frees worker-a's lock so worker-b acquires it",
	})
}
