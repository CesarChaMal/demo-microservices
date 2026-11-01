// Package monitoring holds the observability patterns: Health Check and
// Metrics Collection.
package monitoring

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

// CheckResult is the outcome of one named health probe.
type CheckResult struct {
	Name      string `json:"name"`
	Status    string `json:"status"` // UP | DOWN
	LatencyMs int64  `json:"latency_ms"`
	Detail    string `json:"detail,omitempty"`
}

// healthCheck is a named probe function.
type healthCheck func() error

// HealthRegistry aggregates named probes into an overall status: UP while
// every check passes, DOWN as soon as any fails — the liveness signal the
// compose healthcheck and Eureka status page consume.
type HealthRegistry struct {
	mu     sync.Mutex
	checks map[string]healthCheck
	lastResults []CheckResult
}

// NewHealthRegistry registers the built-in self check.
func NewHealthRegistry() *HealthRegistry {
	hr := &HealthRegistry{checks: map[string]healthCheck{}}
	hr.RegisterCheck("self", func() error { return nil })
	return hr
}

// RegisterCheck adds (or replaces) a named probe.
func (hr *HealthRegistry) RegisterCheck(name string, fn healthCheck) {
	hr.mu.Lock()
	defer hr.mu.Unlock()
	hr.checks[name] = fn
}

// Run executes every probe and returns overall status + results.
func (hr *HealthRegistry) Run() (string, []CheckResult) {
	hr.mu.Lock()
	checks := make(map[string]healthCheck, len(hr.checks))
	for k, v := range hr.checks {
		checks[k] = v
	}
	hr.mu.Unlock()

	overall := "UP"
	results := make([]CheckResult, 0, len(checks))
	for name, fn := range checks {
		started := time.Now()
		result := CheckResult{Name: name, Status: "UP"}
		if err := fn(); err != nil {
			result.Status = "DOWN"
			result.Detail = err.Error()
			overall = "DOWN"
		}
		result.LatencyMs = time.Since(started).Milliseconds()
		results = append(results, result)
	}

	hr.mu.Lock()
	hr.lastResults = results
	hr.mu.Unlock()
	return overall, results
}

// Snapshot returns the last run's results without re-probing.
func (hr *HealthRegistry) Snapshot() []CheckResult {
	hr.mu.Lock()
	defer hr.mu.Unlock()
	return hr.lastResults
}

func (hr *HealthRegistry) Name() string     { return "Health Check" }
func (hr *HealthRegistry) Category() string { return "monitoring" }
func (hr *HealthRegistry) Description() string {
	return "Named probes roll up into one overall UP/DOWN status that orchestrators and service discovery consume."
}

func (hr *HealthRegistry) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/health-check", hr.handleDemo)
}

func (hr *HealthRegistry) handleDemo(w http.ResponseWriter, req *http.Request) {
	status, results := hr.Run()
	httpStatus := http.StatusOK
	if status == "DOWN" {
		httpStatus = http.StatusServiceUnavailable
	}
	writeJSON(w, httpStatus, map[string]any{
		"pattern":  hr.Name(),
		"category": hr.Category(),
		"status":   status,
		"checks":   results,
	})
}
