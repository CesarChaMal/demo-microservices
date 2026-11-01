// Package deployment holds the release-strategy patterns: Feature Toggle,
// Canary Deployment and Blue-Green Deployment.
package deployment

import (
	"encoding/json"
	"hash/fnv"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
)

// writeJSON is the shared response helper for every patterns package.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// toggle is one named switch with a percentage rollout.
type toggle struct {
	Name       string `json:"name"`
	Enabled    bool   `json:"enabled"`
	Percentage int    `json:"percentage"`
	Hits       int    `json:"hits"`
}

// FeatureToggle turns behavior on and off at runtime without redeploying:
// kill switches, percentage rollouts and per-user bucketing.
type FeatureToggle struct {
	mu      sync.Mutex
	toggles map[string]*toggle
}

// NewFeatureToggle seeds the demo toggles.
func NewFeatureToggle() *FeatureToggle {
	return &FeatureToggle{toggles: map[string]*toggle{
		"new-checkout-flow": {Name: "new-checkout-flow", Enabled: true, Percentage: 50},
		"dark-mode":         {Name: "dark-mode", Enabled: true, Percentage: 100},
		"legacy-search":     {Name: "legacy-search", Enabled: false, Percentage: 0},
	}}
}

// IsActive evaluates a toggle for a user: enabled flag AND the user's bucket
// falls inside the rollout percentage.
func (ft *FeatureToggle) IsActive(name, userID string) (bool, string) {
	ft.mu.Lock()
	defer ft.mu.Unlock()

	t, ok := ft.toggles[name]
	if !ok {
		return false, "unknown-toggle"
	}
	t.Hits++
	if !t.Enabled {
		return false, "disabled"
	}
	bucket := bucketFor(name+"/"+userID, 100)
	if bucket < t.Percentage {
		return true, "enabled"
	}
	return false, "outside-rollout"
}

// Set changes a toggle's enabled/percentage configuration.
func (ft *FeatureToggle) Set(name string, enabled bool, percentage int) bool {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	t, ok := ft.toggles[name]
	if !ok {
		t = &toggle{Name: name}
		ft.toggles[name] = t
	}
	t.Enabled = enabled
	t.Percentage = percentage
	return true
}

// Snapshot lists toggles.
func (ft *FeatureToggle) Snapshot() []toggle {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	out := make([]toggle, 0, len(ft.toggles))
	for _, t := range ft.toggles {
		out = append(out, *t)
	}
	return out
}

// bucketFor hashes user+toggle into a stable 0..99 bucket.
func bucketFor(key string, modulo int) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	return int(h.Sum32() % uint32(modulo))
}

func (ft *FeatureToggle) Name() string     { return "Feature Toggle" }
func (ft *FeatureToggle) Category() string { return "deployment" }
func (ft *FeatureToggle) Description() string {
	return "Runtime switches with percentage rollouts let new behavior ship dark and be enabled, tuned or killed without a redeploy."
}

func (ft *FeatureToggle) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/feature-toggle", ft.handleDemo)
	r.Get("/features", ft.handleList)
	r.Post("/features/{name}/toggle", ft.handleToggle)
}

func (ft *FeatureToggle) handleDemo(w http.ResponseWriter, req *http.Request) {
	user := req.URL.Query().Get("user")
	if user == "" {
		user = "user-1"
	}
	active, reason := ft.IsActive("new-checkout-flow", user)
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern": ft.Name(), "category": ft.Category(),
		"user": user, "toggle": "new-checkout-flow",
		"active": active, "reason": reason,
		"all_toggles": ft.Snapshot(),
	})
}

func (ft *FeatureToggle) handleList(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern": ft.Name(), "category": ft.Category(),
		"features": ft.Snapshot(),
	})
}

func (ft *FeatureToggle) handleToggle(w http.ResponseWriter, req *http.Request) {
	name := chi.URLParam(req, "name")
	var body struct {
		Enabled    *bool `json:"enabled"`
		Percentage *int  `json:"percentage"`
	}
	_ = json.NewDecoder(req.Body).Decode(&body)
	current := map[string]*toggle{}
	ft.mu.Lock()
	for k, v := range ft.toggles {
		current[k] = v
	}
	ft.mu.Unlock()

	enabled := false
	percentage := 0
	if t, ok := current[name]; ok {
		enabled, percentage = t.Enabled, t.Percentage
	}
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	if body.Percentage != nil {
		percentage = *body.Percentage
	}
	ft.Set(name, enabled, percentage)
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern": ft.Name(), "category": ft.Category(),
		"updated": map[string]any{"name": name, "enabled": enabled, "percentage": percentage},
		"features": ft.Snapshot(),
	})
}
