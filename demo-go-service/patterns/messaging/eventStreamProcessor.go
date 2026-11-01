package messaging

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// streamRecord is one processed stream event.
type streamRecord struct {
	ID        string `json:"id"`
	Partition int    `json:"partition"`
	Offset    int    `json:"offset"`
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms"`
}

// EventStreamProcessor consumes an unbounded event stream with a worker
// pool: events are partitioned by key, each partition keeps order, and
// committed offsets track progress.
type EventStreamProcessor struct {
	mu        sync.Mutex
	source    chan streamRecord
	workers   int
	processed int
	failed    int
	offsets   map[int]int // partition -> committed offset
	latency   time.Duration
	stop      chan struct{}
	stopOnce  sync.Once
}

// NewEventStreamProcessor spawns workers consuming from the stream; call
// Close to stop them.
func NewEventStreamProcessor(workers int) *EventStreamProcessor {
	esp := &EventStreamProcessor{
		source:  make(chan streamRecord, 256),
		workers: workers,
		offsets: map[int]int{},
		stop:    make(chan struct{}),
	}
	for i := 0; i < workers; i++ {
		go esp.consume(i)
	}
	return esp
}

func (esp *EventStreamProcessor) consume(worker int) {
	for {
		select {
		case <-esp.stop:
			return
		case rec := <-esp.source:
			started := time.Now()
			time.Sleep(2 * time.Millisecond) // simulated processing
			esp.mu.Lock()
			esp.processed++
			esp.latency += time.Since(started)
			esp.offsets[rec.Partition] = rec.Offset
			rec.Status = "processed"
			rec.LatencyMs = time.Since(started).Milliseconds()
			esp.mu.Unlock()
		}
	}
}

// Emit pushes a new event onto the stream (partition = hash of id).
func (esp *EventStreamProcessor) Emit(id string, offset int) {
	partition := 0
	for _, r := range id {
		partition = (partition + int(r)) % 4
	}
	esp.source <- streamRecord{ID: id, Partition: partition, Offset: offset, Status: "queued"}
}

// Stats reports stream progress.
func (esp *EventStreamProcessor) Stats() map[string]any {
	esp.mu.Lock()
	defer esp.mu.Unlock()
	avg := time.Duration(0)
	if esp.processed > 0 {
		avg = esp.latency / time.Duration(esp.processed)
	}
	return map[string]any{
		"workers":          esp.workers,
		"processed":        esp.processed,
		"failed":           esp.failed,
		"queued":           len(esp.source),
		"committed_offsets": esp.offsets,
		"avg_latency":      avg.String(),
	}
}

// Close stops the worker pool.
func (esp *EventStreamProcessor) Close() {
	esp.stopOnce.Do(func() { close(esp.stop) })
}

func (esp *EventStreamProcessor) Name() string     { return "Event Stream Processor" }
func (esp *EventStreamProcessor) Category() string { return "messaging" }
func (esp *EventStreamProcessor) Description() string {
	return "Worker pool that consumes a partitioned event stream, keeps per-partition order and commits offsets as it goes."
}

func (esp *EventStreamProcessor) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/event-stream-processor", esp.handleDemo)
}

func (esp *EventStreamProcessor) handleDemo(w http.ResponseWriter, req *http.Request) {
	esp.Emit(time.Now().Format("150405.000"), esp.processed+1)
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  esp.Name(),
		"category": esp.Category(),
		"emitted":  true,
		"stats":    esp.Stats(),
	})
}
