// Package integration holds the boundary patterns: Repository,
// Specification, API Gateway, Anti-Corruption Layer and Strangler Fig.
package integration

import (
	"encoding/json"
	"net/http"
	"sort"
	"sync"

	"github.com/go-chi/chi/v5"
)

// writeJSON is the shared response helper for every patterns package.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// user is the aggregate the repository guards.
type user struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// UserRepository mediates between the domain and its persistence: callers
// speak in domain terms (Save/FindByID/FindByEmail) and never see storage
// details, so the backing store can change freely.
type UserRepository struct {
	mu      sync.Mutex
	rows    map[int]user
	nextID  int
	saves   int
	lookups int
	scans   int
}

// NewUserRepository seeds a few users.
func NewUserRepository() *UserRepository {
	return &UserRepository{
		rows: map[int]user{
			1: {ID: 1, Name: "Ada Lovelace", Email: "ada@example.com"},
			2: {ID: 2, Name: "Alan Turing", Email: "alan@example.com"},
		},
		nextID: 3,
	}
}

// Save inserts or updates a user (upsert semantics).
func (r *UserRepository) Save(u user) user {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.saves++
	if u.ID == 0 {
		u.ID = r.nextID
		r.nextID++
	}
	r.rows[u.ID] = u
	return u
}

// FindByID loads one aggregate by identity.
func (r *UserRepository) FindByID(id int) (user, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lookups++
	u, ok := r.rows[id]
	return u, ok
}

// FindByEmail scans the store (hidden behind the domain-facing method).
func (r *UserRepository) FindByEmail(email string) (user, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.scans++
	for _, u := range r.rows {
		if u.Email == email {
			return u, true
		}
	}
	return user{}, false
}

// All returns every aggregate ordered by id.
func (r *UserRepository) All() []user {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]user, 0, len(r.rows))
	for _, u := range r.rows {
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Stats reports repository counters.
func (r *UserRepository) Stats() map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	return map[string]any{
		"entities": len(r.rows), "saves": r.saves,
		"id_lookups": r.lookups, "email_scans": r.scans,
	}
}

func (r *UserRepository) Name() string     { return "Repository" }
func (r *UserRepository) Category() string { return "integration" }
func (r *UserRepository) Description() string {
	return "A collection-like interface over persistence, so the domain works with aggregates and stays storage-agnostic."
}

func (r *UserRepository) RegisterRoutes(rx chi.Router) {
	rx.Get("/api/patterns/repository", r.handleDemo)
	rx.Post("/repository/save", r.handleSave)
}

func (r *UserRepository) handleDemo(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":  r.Name(),
		"category": r.Category(),
		"users":    r.All(),
		"stats":    r.Stats(),
	})
}

func (r *UserRepository) handleSave(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"pattern": r.Name(), "category": r.Category(),
			"error": "body must be JSON with at least a \"name\" field",
		})
		return
	}
	saved := r.Save(user{Name: body.Name, Email: body.Email})
	writeJSON(w, http.StatusCreated, map[string]any{
		"pattern":  r.Name(),
		"category": r.Category(),
		"saved":    saved,
		"stats":    r.Stats(),
	})
}
