package performance

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// streamItem is one element flowing through the stream.
type streamItem struct {
	Value     int    `json:"value"`
	Doubled   int    `json:"doubled"`
	EmittedAt string `json:"emitted_at"`
}

// ReactiveStreams processes data as it arrives instead of waiting for the
// whole batch: a publisher, a buffered channel (the non-blocking boundary)
// and a subscriber that transforms items incrementally.
type ReactiveStreams struct {
	mu        sync.Mutex
	buffer    chan int
	items     []streamItem
	emitted   int
	processed int
	dropped   int
	bufferSize int
}

// NewReactiveStreams wires publisher -> buffer -> subscriber.
func NewReactiveStreams(bufferSize int) *ReactiveStreams {
	rs := &ReactiveStreams{
		buffer:     make(chan int, bufferSize),
		bufferSize: bufferSize,
	}
	go rs.subscribe()
	return rs
}

// subscribe is the downstream consumer: transform items as they arrive.
func (rs *ReactiveStreams) subscribe() {
	for value := range rs.buffer {
		item := streamItem{
			Value:     value,
			Doubled:   value * 2,
			EmittedAt: time.Now().UTC().Format(time.RFC3339Nano),
		}
		rs.mu.Lock()
		rs.items = append(rs.items, item)
		if len(rs.items) > 64 {
			rs.items = rs.items[len(rs.items)-64:]
		}
		rs.processed++
		rs.mu.Unlock()
	}
}

// Publish pushes values downstream without ever blocking the caller; a full
// buffer applies backpressure (counted drops in this demo).
func (rs *ReactiveStreams) Publish(values ...int) int {
	accepted := 0
	for _, v := range values {
		select {
		case rs.buffer <- v:
			accepted++
			rs.mu.Lock()
			rs.emitted++
			rs.mu.Unlock()
		default:
			rs.mu.Lock()
			rs.dropped++
			rs.mu.Unlock()
		}
	}
	return accepted
}

// Stats reports stream flow.
func (rs *ReactiveStreams) Stats() map[string]any {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	return map[string]any{
		"emitted":   rs.emitted,
		"processed": rs.processed,
		"dropped":   rs.dropped,
		"buffered":  len(rs.buffer),
		"buffer_capacity": rs.bufferSize,
	}
}

// Snapshot returns recently processed items.
func (rs *ReactiveStreams) Snapshot() []streamItem {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	out := make([]streamItem, len(rs.items))
	copy(out, rs.items)
	return out
}

func (rs *ReactiveStreams) Name() string     { return "Reactive Streams" }
func (rs *ReactiveStreams) Category() string { return "performance" }
func (rs *ReactiveStreams) Description() string {
	return "Processes items as they flow through a buffered channel instead of batch-loading, with visible backpressure on overflow."
}

func (rs *ReactiveStreams) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/reactive-streams", rs.handleDemo)
}

func (rs *ReactiveStreams) handleDemo(w http.ResponseWriter, req *http.Request) {
	accepted := rs.Publish(1, 2, 3, 4, 5, 6, 7, 8)
	time.Sleep(5 * time.Millisecond) // let the subscriber drain
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  rs.Name(),
		"category": rs.Category(),
		"published": 8,
		"accepted": accepted,
		"recent_items": rs.Snapshot(),
		"stats":    rs.Stats(),
	})
}
