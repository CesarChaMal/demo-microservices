package caching

import (
	"net/http"
	"sort"
	"sync"

	"github.com/go-chi/chi/v5"
)

// order is the write-model event the view is built from.
type order struct {
	ID     string  `json:"id"`
	Region string  `json:"region"`
	Amount float64 `json:"amount"`
}

// MaterializedView keeps a precomputed read model (orders by region) so
// queries do not aggregate the whole write model on every request.
type MaterializedView struct {
	mu     sync.RWMutex
	orders []order
	byRegion map[string]float64 // region -> total amount (the view)
	rebuilds int
	sourceScans int
	viewReads   int
}

// NewMaterializedView seeds a few orders and builds the initial view.
func NewMaterializedView() *MaterializedView {
	mv := &MaterializedView{byRegion: map[string]float64{}, orders: []order{
		{ID: "o-1", Region: "eu", Amount: 120},
		{ID: "o-2", Region: "eu", Amount: 80},
		{ID: "o-3", Region: "us", Amount: 200},
	}}
	mv.rebuild()
	return mv
}

// rebuild recomputes the view from the write model.
func (mv *MaterializedView) rebuild() {
	mv.sourceScans += len(mv.orders)
	totals := map[string]float64{}
	for _, o := range mv.orders {
		totals[o.Region] += o.Amount
	}
	mv.byRegion = totals
	mv.rebuilds++
}

// Apply records a new order and refreshes the view.
func (mv *MaterializedView) Apply(o order) {
	mv.mu.Lock()
	defer mv.mu.Unlock()
	mv.orders = append(mv.orders, o)
	mv.rebuild()
}

// Totals reads the precomputed view: constant work, no aggregation.
func (mv *MaterializedView) Totals() map[string]float64 {
	// Lock, not RLock: viewReads++ is a write.
	mv.mu.Lock()
	defer mv.mu.Unlock()
	mv.viewReads++
	out := make(map[string]float64, len(mv.byRegion))
	for k, v := range mv.byRegion {
		out[k] = v
	}
	return out
}

// Stats reports view freshness counters.
func (mv *MaterializedView) Stats() map[string]any {
	mv.mu.RLock()
	defer mv.mu.RUnlock()
	return map[string]any{
		"orders":         len(mv.orders),
		"regions":        len(mv.byRegion),
		"rebuilds":       mv.rebuilds,
		"source_rows_scanned": mv.sourceScans,
		"view_reads":     mv.viewReads,
	}
}

func (mv *MaterializedView) Name() string     { return "Materialized View" }
func (mv *MaterializedView) Category() string { return "caching" }
func (mv *MaterializedView) Description() string {
	return "Keeps a precomputed read model updated on write, so reads avoid aggregating the full write model each time."
}

func (mv *MaterializedView) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/materialized-view", mv.handleDemo)
}

func (mv *MaterializedView) handleDemo(w http.ResponseWriter, req *http.Request) {
	totals := mv.Totals()
	regions := make([]string, 0, len(totals))
	for r := range totals {
		regions = append(regions, r)
	}
	sort.Strings(regions)

	views := make([]map[string]any, 0, len(regions))
	for _, r := range regions {
		views = append(views, map[string]any{"region": r, "total_amount": totals[r]})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  mv.Name(),
		"category": mv.Category(),
		"view":     views,
		"stats":    mv.Stats(),
	})
}
