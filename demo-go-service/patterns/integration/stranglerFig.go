package integration

import (
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
)

// errUntranslatable marks a legacy record the ACL refuses to translate.
type aclError string

func (e aclError) Error() string { return string(e) }

const errUntranslatable = aclError("acl: legacy record has no domain equivalent")

// epochToISO is a tiny helper (kept local to avoid a time import dance).
func epochToISO(ms int64) string {
	// delegate formatting through the shared time helper in apiGateway.go
	return formatEpochMillis(ms)
}

// routeOwner records which system currently serves a route.
type routeOwner struct {
	Route  string `json:"route"`
	ServedBy string `json:"served_by"` // legacy | new
	Hits   int    `json:"hits"`
}

// StranglerFig incrementally replaces a legacy system: routes migrate to
// the new implementation one at a time, the rest keep forwarding to the
// legacy backend, until the old system can be switched off.
type StranglerFig struct {
	mu     sync.Mutex
	routes map[string]*routeOwner
}

// NewStranglerFig starts with everything on the legacy system and one route
// already migrated.
func NewStranglerFig() *StranglerFig {
	sf := &StranglerFig{routes: map[string]*routeOwner{}}
	for _, r := range []string{"/orders", "/customers", "/inventory", "/reports"} {
		sf.routes[r] = &routeOwner{Route: r, ServedBy: "legacy"}
	}
	sf.routes["/orders"].ServedBy = "new" // first migrated route
	return sf
}

// Handle routes the call to whichever system owns the route now.
func (sf *StranglerFig) Handle(route string) string {
	sf.mu.Lock()
	defer sf.mu.Unlock()
	owner, ok := sf.routes[route]
	if !ok {
		return "unknown-route"
	}
	owner.Hits++
	return owner.ServedBy
}

// Migrate moves a route to the new implementation.
func (sf *StranglerFig) Migrate(route string) bool {
	sf.mu.Lock()
	defer sf.mu.Unlock()
	owner, ok := sf.routes[route]
	if !ok {
		return false
	}
	owner.ServedBy = "new"
	return true
}

// Snapshot lists route ownership.
func (sf *StranglerFig) Snapshot() []routeOwner {
	sf.mu.Lock()
	defer sf.mu.Unlock()
	out := make([]routeOwner, 0, len(sf.routes))
	for _, r := range sf.routes {
		out = append(out, *r)
	}
	return out
}

// Stats reports migration progress.
func (sf *StranglerFig) Stats() map[string]any {
	sf.mu.Lock()
	defer sf.mu.Unlock()
	total, migrated := len(sf.routes), 0
	for _, r := range sf.routes {
		if r.ServedBy == "new" {
			migrated++
		}
	}
	return map[string]any{"routes": total, "migrated": migrated}
}

func (sf *StranglerFig) Name() string     { return "Strangler Fig" }
func (sf *StranglerFig) Category() string { return "integration" }
func (sf *StranglerFig) Description() string {
	return "Routes migrate from a legacy system to its replacement one by one, with a facade forwarding the rest, until the legacy side is unused."
}

func (sf *StranglerFig) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/strangler-fig", sf.handleDemo)
	r.Post("/strangler/process", sf.handleDemo)
}

func (sf *StranglerFig) handleDemo(w http.ResponseWriter, req *http.Request) {
	route := req.URL.Query().Get("route")
	if route == "" {
		route = "/orders"
	}
	if req.URL.Query().Get("migrate") == "true" {
		sf.Migrate(route)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":    sf.Name(),
		"category":   sf.Category(),
		"requested":  route,
		"served_by":  sf.Handle(route),
		"routes":     sf.Snapshot(),
		"stats":      sf.Stats(),
		"hint":       "add ?migrate=true to move a route to the new system",
	})
}
