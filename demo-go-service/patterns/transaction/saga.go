package transaction

import (
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
)

// sagaStep is one local transaction plus its compensation.
type sagaStep struct {
	Name         string `json:"name"`
	Action       string `json:"action"`
	Compensation string `json:"compensation"`
	Status       string `json:"status"` // pending | completed | compensated
}

// Saga runs a sequence of local transactions; if any step fails, the
// compensations of the already-completed steps run in reverse order — an
// eventually-consistent alternative to distributed 2PC.
type Saga struct {
	mu        sync.Mutex
	completed int
	rolledBack int
	steps     []sagaStep
	log       []string
}

// NewSaga builds an order saga with its compensation chain.
func NewSaga() *Saga {
	return &Saga{steps: []sagaStep{
		{Name: "create-order", Action: "INSERT order", Compensation: "DELETE order", Status: "pending"},
		{Name: "charge-payment", Action: "charge card", Compensation: "refund card", Status: "pending"},
		{Name: "reserve-inventory", Action: "decrement stock", Compensation: "restore stock", Status: "pending"},
		{Name: "schedule-shipping", Action: "book shipment", Compensation: "cancel shipment", Status: "pending"},
	}}
}

// Run executes the saga; failAt (1-based, 0 = none) fails that step and
// triggers compensating rollback.
func (s *Saga) Run(failAt int) ([]sagaStep, []string, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.log = []string{"saga: order-saga started"}
	for i := range s.steps {
		s.steps[i].Status = "pending"
	}

	var failedAt = -1
	for i := range s.steps {
		if failAt > 0 && i == failAt-1 {
			failedAt = i
			s.log = append(s.log, "step "+s.steps[i].Name+" -> FAILED")
			break
		}
		s.steps[i].Status = "completed"
		s.log = append(s.log, "step "+s.steps[i].Name+" -> "+s.steps[i].Action+" OK")
	}

	if failedAt == -1 {
		s.completed++
		s.log = append(s.log, "saga: completed")
		return s.snapshot(), s.log, "completed"
	}

	s.log = append(s.log, "saga: rolling back compensations in reverse order")
	for i := failedAt - 1; i >= 0; i-- {
		s.steps[i].Status = "compensated"
		s.log = append(s.log, "compensate "+s.steps[i].Name+" -> "+s.steps[i].Compensation)
	}
	s.rolledBack++
	s.log = append(s.log, "saga: rolled back")
	return s.snapshot(), s.log, "rolled-back"
}

func (s *Saga) snapshot() []sagaStep {
	out := make([]sagaStep, len(s.steps))
	copy(out, s.steps)
	return out
}

// Stats reports saga outcomes.
func (s *Saga) Stats() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{"completed": s.completed, "rolled_back": s.rolledBack}
}

func (s *Saga) Name() string     { return "Saga" }
func (s *Saga) Category() string { return "transaction" }
func (s *Saga) Description() string {
	return "Chains local transactions; a failed step triggers compensations in reverse order instead of a distributed lock."
}

func (s *Saga) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/saga", s.handleDemo)
	r.Post("/process-with-saga", s.handleDemo)
}

func (s *Saga) handleDemo(w http.ResponseWriter, req *http.Request) {
	failAt := 0
	if v := req.URL.Query().Get("fail_step"); v != "" {
		for _, c := range v {
			if c >= '0' && c <= '9' {
				failAt = failAt*10 + int(c-'0')
			}
		}
	}
	steps, log, outcome := s.Run(failAt)
	status := http.StatusOK
	if outcome != "completed" {
		status = http.StatusConflict
	}
	writeJSON(w, status, map[string]any{
		"pattern":  s.Name(),
		"category": s.Category(),
		"outcome":  outcome,
		"steps":    steps,
		"log":      log,
		"stats":    s.Stats(),
		"hint":     "pass ?fail_step=3 to watch compensation roll back steps 1-2",
	})
}
