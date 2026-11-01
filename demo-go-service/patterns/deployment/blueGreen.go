package deployment

import (
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
)

// BlueGreen keeps two identical environments, blue and green, but only one
// receives live traffic at a time: deploy to the idle one, verify it, then
// flip the router — a release with near-zero downtime and an instant
// fallback (flip back).
type BlueGreen struct {
	mu        sync.Mutex
	active    string // "blue" or "green"
	versions  map[string]string
	switches  int
	lastSwitch string
}

// NewBlueGreen starts with blue active on the current version.
func NewBlueGreen() *BlueGreen {
	return &BlueGreen{
		active:   "blue",
		versions: map[string]string{"blue": "1.0.0", "green": "1.1.0-rc1"},
	}
}

// Route reports which environment serves traffic.
func (bg *BlueGreen) Route() string {
	bg.mu.Lock()
	defer bg.mu.Unlock()
	return bg.active
}

// Switch flips traffic to the other environment.
func (bg *BlueGreen) Switch() string {
	bg.mu.Lock()
	defer bg.mu.Unlock()
	if bg.active == "blue" {
		bg.active = "green"
	} else {
		bg.active = "blue"
	}
	bg.switches++
	return bg.active
}

// Stats reports both environments.
func (bg *BlueGreen) Stats() map[string]any {
	bg.mu.Lock()
	defer bg.mu.Unlock()
	return map[string]any{
		"active":       bg.active,
		"versions":     bg.versions,
		"switches":     bg.switches,
		"last_switch":  bg.lastSwitch,
		"idle":         other(bg.active),
	}
}

func other(env string) string {
	if env == "blue" {
		return "green"
	}
	return "blue"
}

func (bg *BlueGreen) Name() string     { return "Blue-Green Deployment" }
func (bg *BlueGreen) Category() string { return "deployment" }
func (bg *BlueGreen) Description() string {
	return "Two identical environments; deploy to the idle one, verify, then flip the router for a near-zero-downtime release with instant rollback."
}

func (bg *BlueGreen) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/blue-green-deployment", bg.handleDemo)
	r.Get("/deployment/blue-green", bg.handleDemo)
	r.Post("/deployment/blue-green/switch", bg.handleDemo)
}

func (bg *BlueGreen) handleDemo(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodPost || req.URL.Query().Get("switch") == "true" {
		// Switch() takes the lock itself, so call it first, then store the
		// result under a separate brief Lock (Stats reads lastSwitch locked).
		sw := bg.Switch()
		bg.mu.Lock()
		bg.lastSwitch = sw
		bg.mu.Unlock()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":    bg.Name(),
		"category":   bg.Category(),
		"serving":    bg.Route(),
		"serving_version": bg.versions[bg.Route()],
		"stats":      bg.Stats(),
		"hint":       "POST to this route (or ?switch=true) to flip blue <-> green",
	})
}
