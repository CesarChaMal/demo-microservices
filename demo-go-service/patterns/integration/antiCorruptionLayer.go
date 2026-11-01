package integration

import (
	"net/http"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
)

// legacyCustomer is the shape the (pretend) legacy system speaks: cryptic
// codes, flat name string, epoch millis.
type legacyCustomer struct {
	CustNo    string `json:"custNo"`
	FullName  string `json:"fullName"`
	CustCls   string `json:"custCls"` // "P" platinum, "G" gold, "S" standard
	EpochMs   int64  `json:"epochMs"`
}

// modernCustomer is our clean domain model.
type modernCustomer struct {
	ID        string `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Tier      string `json:"tier"`
	CreatedISO string `json:"created_iso"`
}

// AntiCorruptionLayer translates between a legacy contract and the domain
// model so legacy quirks (codes, flat names, epoch timestamps) never leak
// past the boundary.
type AntiCorruptionLayer struct {
	mu         sync.Mutex
	translated int
	rejected   int
}

// NewAntiCorruptionLayer builds the translating facade.
func NewAntiCorruptionLayer() *AntiCorruptionLayer { return &AntiCorruptionLayer{} }

// Translate converts a legacy record into the domain model.
func (acl *AntiCorruptionLayer) Translate(lc legacyCustomer) (modernCustomer, error) {
	acl.mu.Lock()
	defer acl.mu.Unlock()

	parts := strings.Fields(lc.FullName)
	if len(parts) < 2 {
		acl.rejected++
		return modernCustomer{}, errUntranslatable
	}
	tier := map[string]string{"P": "platinum", "G": "gold", "S": "standard"}[lc.CustCls]
	if tier == "" {
		acl.rejected++
		return modernCustomer{}, errUntranslatable
	}
	acl.translated++
	return modernCustomer{
		ID:         "cust-" + strings.TrimPrefix(lc.CustNo, "0"),
		FirstName:  parts[0],
		LastName:   strings.Join(parts[1:], " "),
		Tier:       tier,
		CreatedISO: epochToISO(lc.EpochMs),
	}, nil
}

// Stats reports translation counters.
func (acl *AntiCorruptionLayer) Stats() map[string]any {
	acl.mu.Lock()
	defer acl.mu.Unlock()
	return map[string]any{"translated": acl.translated, "rejected": acl.rejected}
}

func (acl *AntiCorruptionLayer) Name() string     { return "Anti-Corruption Layer" }
func (acl *AntiCorruptionLayer) Category() string { return "integration" }
func (acl *AntiCorruptionLayer) Description() string {
	return "A translating facade that converts a legacy contract into the domain model so foreign quirks stop at the boundary."
}

func (acl *AntiCorruptionLayer) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/anti-corruption-layer", acl.handleDemo)
}

func (acl *AntiCorruptionLayer) handleDemo(w http.ResponseWriter, req *http.Request) {
	legacy := legacyCustomer{
		CustNo:   "0001234",
		FullName: "Grace Hopper",
		CustCls:  "P",
		EpochMs:  1735689600000, // 2025-01-01T00:00:00Z
	}
	if q := req.URL.Query().Get("class"); q != "" {
		legacy.CustCls = q
	}
	modern, err := acl.Translate(legacy)
	body := map[string]any{
		"pattern":       acl.Name(),
		"category":      acl.Category(),
		"legacy_record": legacy,
		"domain_model":  modern,
		"stats":         acl.Stats(),
	}
	if err != nil {
		body["error"] = err.Error()
		writeJSON(w, http.StatusUnprocessableEntity, body)
		return
	}
	writeJSON(w, http.StatusOK, body)
}
