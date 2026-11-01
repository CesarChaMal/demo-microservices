package resilience

import (
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// errBulkheadFull is returned when no slot freed up within the wait budget.
var errBulkheadFull = errors.New("bulkhead full: no capacity available")

// Bulkhead caps how many calls run concurrently so one saturated dependency
// cannot exhaust every worker: excess callers queue briefly, then get
// rejected instead of piling up.
type Bulkhead struct {
	mu          sync.Mutex
	semaphore   chan struct{}
	maxWait     time.Duration
	inFlight    int
	highWater   int
	rejected    int
	executed    int
	queueWaited time.Duration
}

// NewBulkhead allows capacity concurrent executions; hopeful callers wait up
// to maxWait for a slot before being rejected.
func NewBulkhead(capacity int, maxWait time.Duration) *Bulkhead {
	return &Bulkhead{
		semaphore: make(chan struct{}, capacity),
		maxWait:   maxWait,
	}
}

// Execute runs fn under the bulkhead's concurrency cap.
func (b *Bulkhead) Execute(fn func() error) error {
	b.mu.Lock()
	select { // fast path: a free slot right now
	case b.semaphore <- struct{}{}:
		b.inFlight++
		if b.inFlight > b.highWater {
			b.highWater = b.inFlight
		}
		b.mu.Unlock()
	default:
		b.mu.Unlock()

		started := time.Now()
		select {
		case b.semaphore <- struct{}{}:
			b.mu.Lock()
			b.inFlight++
			if b.inFlight > b.highWater {
				b.highWater = b.inFlight
			}
			b.queueWaited += time.Since(started)
			b.mu.Unlock()
		case <-time.After(b.maxWait):
			b.mu.Lock()
			b.rejected++
			b.mu.Unlock()
			return errBulkheadFull
		}
	}

	err := fn()

	b.mu.Lock()
	b.inFlight--
	b.executed++
	b.mu.Unlock()
	<-b.semaphore
	return err
}

// Stats reports bulkhead occupancy counters.
func (b *Bulkhead) Stats() map[string]any {
	b.mu.Lock()
	defer b.mu.Unlock()
	return map[string]any{
		"capacity":       cap(b.semaphore),
		"in_flight":      b.inFlight,
		"high_water":     b.highWater,
		"executed":       b.executed,
		"rejected":       b.rejected,
		"queued_wait":    b.queueWaited.String(),
		"max_wait_ms":    b.maxWait.Milliseconds(),
	}
}

func (b *Bulkhead) Name() string     { return "Bulkhead" }
func (b *Bulkhead) Category() string { return "resilience" }
func (b *Bulkhead) Description() string {
	return "Caps concurrent calls to a dependency; overflow queues briefly and is then rejected instead of dragging the caller down."
}

func (b *Bulkhead) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/bulkhead", b.handleDemo)
	r.Post("/process-with-bulkhead", b.handleDemo)
}

func (b *Bulkhead) handleDemo(w http.ResponseWriter, req *http.Request) {
	// Simulate three in-flight calls at once: one slot is held for the whole
	// demo duration, the next two contend for the remaining capacity.
	hold := 150 * time.Millisecond
	if v := req.URL.Query().Get("hold_ms"); v != "" {
		if d, err := time.ParseDuration(v + "ms"); err == nil {
			hold = d
		}
	}

	started := time.Now()
	err := b.Execute(func() error { // occupies one slot for `hold`
		time.Sleep(hold)
		return nil
	})
	outcome := "executed"
	if err != nil {
		outcome = err.Error()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  b.Name(),
		"category": b.Category(),
		"outcome":  outcome,
		"elapsed":  time.Since(started).String(),
		"stats":    b.Stats(),
		"note":     "capacity 3; hammer the endpoint concurrently to watch rejections",
	})
}
