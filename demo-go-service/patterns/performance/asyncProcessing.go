// Package performance holds the concurrency patterns: Async Processing and
// Reactive Streams.
package performance

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

// task is one unit of background work.
type task struct {
	ID        string  `json:"id"`
	Status    string  `json:"status"` // queued | running | completed
	Result    string  `json:"result,omitempty"`
	CreatedAt string  `json:"created_at"`
	Duration  float64 `json:"duration_ms"`
}

// AsyncProcessor offloads expensive work to a bounded worker pool and hands
// back a task id immediately: the HTTP request returns in microseconds, the
// result is polled later — threads freed, latency hidden.
type AsyncProcessor struct {
	mu       sync.Mutex
	tasks    map[string]*task
	queue    chan *task
	workers  int
	queued   int
	done     int
	stop     chan struct{}
	stopOnce sync.Once
}

// NewAsyncProcessor starts workerCount background workers; call Close on
// shutdown.
func NewAsyncProcessor(workerCount int) *AsyncProcessor {
	ap := &AsyncProcessor{
		tasks:   map[string]*task{},
		queue:   make(chan *task, 128),
		workers: workerCount,
		stop:    make(chan struct{}),
	}
	for i := 0; i < workerCount; i++ {
		go ap.worker()
	}
	return ap
}

func (ap *AsyncProcessor) worker() {
	for {
		select {
		case <-ap.stop:
			return
		case t := <-ap.queue:
			started := time.Now()
			time.Sleep(50 * time.Millisecond) // simulated heavy work
			ap.mu.Lock()
			t.Status = "completed"
			t.Result = "processed after " + time.Since(started).Round(time.Millisecond).String()
			t.Duration = float64(time.Since(started).Milliseconds())
			ap.done++
			ap.mu.Unlock()
		}
	}
}

// Submit enqueues a task and returns immediately.
func (ap *AsyncProcessor) Submit(id string) string {
	ap.mu.Lock()
	defer ap.mu.Unlock()
	ap.tasks[id] = &task{ID: id, Status: "queued", CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	ap.queued++
	go func() { ap.queue <- ap.tasks[id] }()
	return id
}

// Status reports one task.
func (ap *AsyncProcessor) Status(id string) (task, bool) {
	ap.mu.Lock()
	defer ap.mu.Unlock()
	t, ok := ap.tasks[id]
	if !ok {
		return task{}, false
	}
	return *t, true
}

// Stats reports pool state.
func (ap *AsyncProcessor) Stats() map[string]any {
	ap.mu.Lock()
	defer ap.mu.Unlock()
	return map[string]any{
		"workers": ap.workers, "queued": ap.queued,
		"completed": ap.done, "backlog": len(ap.queue),
	}
}

// Close stops the workers.
func (ap *AsyncProcessor) Close() { ap.stopOnce.Do(func() { close(ap.stop) }) }

func (ap *AsyncProcessor) Name() string     { return "Async Processing" }
func (ap *AsyncProcessor) Category() string { return "performance" }
func (ap *AsyncProcessor) Description() string {
	return "Heavy work goes to a bounded worker pool and the caller gets a task id to poll, so request threads are never blocked."
}

func (ap *AsyncProcessor) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/async-processing", ap.handleDemo)
	r.Post("/async/submit", ap.handleSubmit)
	r.Get("/async/status/{taskId}", ap.handleStatus)
}

func (ap *AsyncProcessor) handleDemo(w http.ResponseWriter, req *http.Request) {
	id := "task-" + time.Now().Format("150405.000")
	ap.Submit(id)
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  ap.Name(),
		"category": ap.Category(),
		"submitted": id,
		"stats":    ap.Stats(),
		"note":     "poll GET /async/status/" + id,
	})
}

func (ap *AsyncProcessor) handleSubmit(w http.ResponseWriter, req *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(req.Body).Decode(&body)
	if body.ID == "" {
		body.ID = "task-" + time.Now().Format("150405.000")
	}
	ap.Submit(body.ID)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"pattern": ap.Name(), "category": ap.Category(),
		"task_id": body.ID, "status": "queued",
		"poll": "/async/status/" + body.ID,
	})
}

func (ap *AsyncProcessor) handleStatus(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "taskId")
	t, ok := ap.Status(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"pattern": ap.Name(), "category": ap.Category(),
			"error": "unknown task id",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern": ap.Name(), "category": ap.Category(),
		"task": t, "stats": ap.Stats(),
	})
}
