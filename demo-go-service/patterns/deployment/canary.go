package deployment

import (
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
)

// Canary routes a small, growing slice of traffic to the new version and
// watches its error rate: if the canary misbehaves, traffic snaps back to
// stable without an outage.
type Canary struct {
	mu         sync.Mutex
	percentage int
	stableHits int
	canaryHits int
	canaryErrors int
	threshold  float64
	autoRolledBack bool
}

// NewCanary starts with a 10% canary slice and a 5% error threshold.
func NewCanary() *Canary {
	return &Canary{percentage: 10, threshold: 0.05}
}

// Route assigns one request to stable or canary based on the counter split.
func (c *Canary) Route() string {
	c.mu.Lock()
	defer c.mu.Unlock()

	total := c.stableHits + c.canaryHits
	if total == 0 || (c.canaryHits+1)*100/(total+1) <= c.percentage {
		c.canaryHits++
		return "canary"
	}
	c.stableHits++
	return "stable"
}

// RecordError simulates a failed canary request; crossing the threshold
// triggers an automatic rollback to 0%.
func (c *Canary) RecordError() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.canaryErrors++
	if c.canaryHits > 0 && float64(c.canaryErrors)/float64(c.canaryHits) > c.threshold {
		c.percentage = 0
		c.autoRolledBack = true
		return true
	}
	return false
}

// SetPercentage adjusts the canary slice (0-100).
func (c *Canary) SetPercentage(p int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if p < 0 {
		p = 0
	}
	if p > 100 {
		p = 100
	}
	c.percentage = p
}

// Stats reports the split.
func (c *Canary) Stats() map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	total := c.stableHits + c.canaryHits
	errorRate := 0.0
	if c.canaryHits > 0 {
		errorRate = float64(c.canaryErrors) / float64(c.canaryHits)
	}
	return map[string]any{
		"canary_percentage":  c.percentage,
		"stable_requests":    c.stableHits,
		"canary_requests":    c.canaryHits,
		"total_requests":     total,
		"canary_errors":      c.canaryErrors,
		"canary_error_rate":  errorRate,
		"rollback_threshold": c.threshold,
		"auto_rolled_back":   c.autoRolledBack,
	}
}

func (c *Canary) Name() string     { return "Canary Deployment" }
func (c *Canary) Category() string { return "deployment" }
func (c *Canary) Description() string {
	return "Shifts a small slice of live traffic to the new version and rolls back automatically when its error rate crosses the threshold."
}

func (c *Canary) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/canary-deployment", c.handleDemo)
	r.Get("/deployment/canary", c.handleDemo)
}

func (c *Canary) handleDemo(w http.ResponseWriter, req *http.Request) {
	if p := req.URL.Query().Get("percentage"); p != "" {
		n := 0
		for _, ch := range p {
			if ch >= '0' && ch <= '9' {
				n = n*10 + int(ch - '0')
			}
		}
		c.SetPercentage(n)
	}
	served := c.Route()
	if req.URL.Query().Get("error") == "true" {
		c.RecordError()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":   c.Name(),
		"category":  c.Category(),
		"served_by": served,
		"stats":     c.Stats(),
		"hint":      "?percentage=50 to widen the slice; ?error=true to force a rollback",
	})
}
