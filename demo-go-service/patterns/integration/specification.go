package integration

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Specification encapsulates a business rule as a composable predicate, so
// querying logic stays in the domain instead of leaking into query strings.
type Specification func(user) bool

// And returns a spec satisfied only when both are.
func (s Specification) And(other Specification) Specification {
	return func(u user) bool { return s(u) && other(u) }
}

// Or returns a spec satisfied when either is.
func (s Specification) Or(other Specification) Specification {
	return func(u user) bool { return s(u) || other(u) }
}

// Not inverts a spec.
func (s Specification) Not() Specification {
	return func(u user) bool { return !s(u) }
}

// NameContains matches on a substring of the user's name.
func NameContains(sub string) Specification {
	return func(u user) bool { return strings.Contains(strings.ToLower(u.Name), strings.ToLower(sub)) }
}

// EmailDomain matches users whose email ends in the given domain.
func EmailDomain(domain string) Specification {
	return func(u user) bool { return strings.HasSuffix(strings.ToLower(u.Email), strings.ToLower(domain)) }
}

// SpecResult is one satisfied candidate.
type SpecResult struct {
	User  user `json:"user"`
	Satisfied bool `json:"satisfied_by_all"`
}

// SpecificationPattern demonstrates composing specs over the repository.
type SpecificationPattern struct {
	repo    *UserRepository
	evals   int
	matches int
}

// NewSpecificationPattern composes specs over the given repository.
func NewSpecificationPattern(repo *UserRepository) *SpecificationPattern {
	return &SpecificationPattern{repo: repo}
}

// Satisfying returns the users matching the composed spec.
func (sp *SpecificationPattern) Satisfying(spec Specification) []SpecResult {
	sp.evals++
	results := []SpecResult{}
	for _, u := range sp.repo.All() {
		if spec(u) {
			results = append(results, SpecResult{User: u, Satisfied: true})
			sp.matches++
		}
	}
	return results
}

// Stats reports evaluation counters.
func (sp *SpecificationPattern) Stats() map[string]any {
	return map[string]any{"spec_evaluations": sp.evals, "total_matches": sp.matches}
}

func (sp *SpecificationPattern) Name() string     { return "Specification" }
func (sp *SpecificationPattern) Category() string { return "integration" }
func (sp *SpecificationPattern) Description() string {
	return "Business rules as composable predicates (and/or/not) that select candidates without leaking query logic."
}

func (sp *SpecificationPattern) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/specification", sp.handleDemo)
}

func (sp *SpecificationPattern) handleDemo(w http.ResponseWriter, req *http.Request) {
	domain := req.URL.Query().Get("domain")
	if domain == "" {
		domain = "example.com"
	}
	spec := NameContains("a").And(EmailDomain(domain)) // composed business rule
	writeJSON(w, http.StatusOK, map[string]any{
		"pattern":      sp.Name(),
		"category":     sp.Category(),
		"specification": "NameContains(\"a\") AND EmailDomain(\"" + domain + "\")",
		"matches":      sp.Satisfying(spec),
		"stats":        sp.Stats(),
	})
}
