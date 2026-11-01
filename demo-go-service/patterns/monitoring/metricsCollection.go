package monitoring

import (
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// MetricsCollection keeps counters, gauges and histograms in-process and
// snapshots them on demand — the shape /metrics serves: one collector, all
// subsystems reporting into it.
type MetricsCollector struct {
	mu         sync.Mutex
	counters   map[string]int64
	gauges     map[string]float64
	histograms map[string][]float64
	started    time.Time
}

// NewMetricsCollector builds an empty collector.
func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{
		counters:   map[string]int64{},
		gauges:     map[string]float64{},
		histograms: map[string][]float64{},
		started:    time.Now(),
	}
}

// IncrCounter atomically bumps a counter by delta.
func (m *MetricsCollector) IncrCounter(name string, delta int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.counters[name] += delta
}

// SetGauge records a point-in-time value.
func (m *MetricsCollector) SetGauge(name string, value float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gauges[name] = value
}

// Observe appends a duration sample to a histogram.
func (m *MetricsCollector) Observe(name string, d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.histograms[name] = append(m.histograms[name], float64(d.Microseconds())/1000.0)
	if len(m.histograms[name]) > 512 {
		m.histograms[name] = m.histograms[name][len(m.histograms[name])-512:]
	}
}

// Snapshot returns counters/gauges/histogram summaries (p50/p95/p99/count).
func (m *MetricsCollector) Snapshot() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()

	counters := make(map[string]int64, len(m.counters))
	for k, v := range m.counters {
		counters[k] = v
	}
	gauges := make(map[string]float64, len(m.gauges))
	for k, v := range m.gauges {
		gauges[k] = v
	}
	histograms := map[string]map[string]any{}
	for name, samples := range m.histograms {
		sorted := make([]float64, len(samples))
		copy(sorted, samples)
		sort.Float64s(sorted)
		pct := func(p float64) float64 {
			if len(sorted) == 0 {
				return 0
			}
			 idx := int(float64(len(sorted)-1) * p)
			 return sorted[idx]
		}
		sum := 0.0
		for _, s := range sorted {
			sum += s
		}
		histograms[name] = map[string]any{
			"count": len(sorted), "sum_ms": sum,
			"p50_ms": pct(0.50), "p95_ms": pct(0.95), "p99_ms": pct(0.99),
		}
	}
	return map[string]any{
		"counters":   counters,
		"gauges":     gauges,
		"histograms": histograms,
	}
}

// Uptime reports collector uptime.
func (m *MetricsCollector) Uptime() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return time.Since(m.started).Round(time.Millisecond).String()
}

func (m *MetricsCollector) Name() string     { return "Metrics Collection" }
func (m *MetricsCollector) Category() string { return "monitoring" }
func (m *MetricsCollector) Description() string {
	return "One in-process collector for counters, gauges and histograms, snapshot on demand — the source behind /metrics."
}

func (m *MetricsCollector) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/metrics-collection", m.handleDemo)
}

func (m *MetricsCollector) handleDemo(w http.ResponseWriter, req *http.Request) {
	m.IncrCounter("metrics_demo_requests", 1)
	m.SetGauge("metrics_demo_gauge", float64(time.Now().Nanosecond()%1000)/10.0)
	m.Observe("metrics_demo_latency", 2*time.Millisecond)
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  m.Name(),
		"category": m.Category(),
		"metrics":  m.Snapshot(),
		"uptime":   m.Uptime(),
		"note":     "the service /metrics endpoint serves a snapshot of this same collector",
	})
}
