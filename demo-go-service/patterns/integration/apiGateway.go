package integration

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// upstream is one backend route the gateway can forward to.
type upstream struct {
	Path   string `json:"path"`
	Service string `json:"service"`
	URL    string `json:"url"`
}

// APIGateway is the single entry point that routes to backing services,
// aggregates their answers and applies cross-cutting concerns (here:
// routing, timeouts and a request log) so clients need not know the layout.
type APIGateway struct {
	mu        sync.Mutex
	http      *http.Client
	upstreams map[string]upstream
	routed    int
	failed    int
	log       []string
}

// NewAPIGateway registers the sibling services (compose hostnames).
func NewAPIGateway() *APIGateway {
	gw := &APIGateway{
		http:      &http.Client{Timeout: 3 * time.Second},
		upstreams: map[string]upstream{},
	}
	for _, u := range []upstream{
		{Path: "/java", Service: "java-service", URL: envOrDefault("JAVA_SERVICE_URL", "http://java-service:8080")},
		{Path: "/node", Service: "node-service", URL: envOrDefault("NODE_SERVICE_URL", "http://node-service:3000")},
		{Path: "/python", Service: "python-service", URL: envOrDefault("PYTHON_SERVICE_URL", "http://python-service:5001")},
	} {
		gw.upstreams[u.Path] = u
	}
	return gw
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// formatEpochMillis renders epoch milliseconds as RFC3339 (shared helper
// for the integration package's demos).
func formatEpochMillis(ms int64) string {
	return time.UnixMilli(ms).UTC().Format(time.RFC3339)
}

// Forward proxies a request to the chosen upstream and returns its JSON body.
func (gw *APIGateway) Forward(path string) (map[string]any, int, error) {
	gw.mu.Lock()
	up, ok := gw.upstreams[path]
	if ok {
		gw.routed++
	}
	gw.mu.Unlock()
	if !ok {
		return nil, http.StatusNotFound, fmt.Errorf("no upstream registered for %s", path)
	}

	target := up.URL + "/info"
	resp, err := gw.http.Get(target)
	if err != nil {
		gw.mu.Lock()
		gw.failed++
		gw.log = append(gw.log, up.Service+" -> unreachable: "+err.Error())
		gw.mu.Unlock()
		return nil, http.StatusBadGateway, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var payload map[string]any
	if len(body) > 0 {
		_ = json.Unmarshal(body, &payload)
	}
	gw.mu.Lock()
	gw.log = append(gw.log, fmt.Sprintf("%s -> %s %s", up.Service, "GET", resp.Status))
	if len(gw.log) > 50 {
		gw.log = gw.log[len(gw.log)-50:]
	}
	gw.mu.Unlock()

	if payload == nil {
		payload = map[string]any{"upstream_status": resp.Status}
	}
	return payload, resp.StatusCode, nil
}

// Stats reports gateway counters and routing table.
func (gw *APIGateway) Stats() map[string]any {
	gw.mu.Lock()
	defer gw.mu.Unlock()
	paths := make([]upstream, 0, len(gw.upstreams))
	for _, u := range gw.upstreams {
		paths = append(paths, u)
	}
	return map[string]any{
		"routed": gw.routed, "failed": gw.failed,
		"upstreams": paths, "recent": gw.log,
	}
}

func (gw *APIGateway) Name() string     { return "API Gateway" }
func (gw *APIGateway) Category() string { return "integration" }
func (gw *APIGateway) Description() string {
	return "Single entry point routing to backing services, applying cross-cutting concerns so clients stay decoupled from the layout."
}

func (gw *APIGateway) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/api-gateway", gw.handleDemo)
	r.Post("/gateway/route", gw.handleRoute)
}

func (gw *APIGateway) handleDemo(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern": gw.Name(),
		"category": gw.Category(),
		"stats":   gw.Stats(),
		"note":    "POST /gateway/route {\"path\":\"/node\"} proxies to a sibling /info",
	})
}

func (gw *APIGateway) handleRoute(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	_ = json.NewDecoder(req.Body).Decode(&body)
	if body.Path == "" {
		body.Path = req.URL.Query().Get("path")
	}
	payload, status, err := gw.Forward(body.Path)
	response := map[string]any{
		"pattern": gw.Name(), "category": gw.Category(),
		"requested_path": body.Path, "stats": gw.Stats(),
	}
	if err != nil {
		response["error"] = err.Error()
		writeJSON(w, status, response)
		return
	}
	response["upstream_response"] = payload
	writeJSON(w, status, response)
}
