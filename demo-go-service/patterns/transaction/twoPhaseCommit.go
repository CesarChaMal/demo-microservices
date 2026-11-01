// Package transaction holds the consistency patterns: Two-Phase Commit,
// Distributed Lock, Idempotency, Outbox and Saga.
package transaction

import (
	"encoding/json"
	"errors"
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

// participant is one resource manager taking part in the protocol.
type participant struct {
	Name     string `json:"name"`
	Vote     string `json:"vote"` // yes | no
	Prepared bool   `json:"prepared"`
	Committed bool  `json:"committed"`
}

// TwoPhaseCommit coordinates an all-or-nothing commit across participants:
// a prepare round collects votes, and commit only happens if everyone voted
// yes (otherwise everything rolls back).
type TwoPhaseCommit struct {
	mu          sync.Mutex
	committed   int
	aborted     int
	lastTrace   []string
}

// NewTwoPhaseCommit builds a coordinator.
func NewTwoPhaseCommit() *TwoPhaseCommit { return &TwoPhaseCommit{} }

// ErrVoteRejected is returned when any participant voted no.
var ErrVoteRejected = errors.New("2pc: a participant voted to abort")

// Commit runs prepare/commit across the named participants. failAt (1-based
// index, 0 = none) makes that participant vote no, forcing a rollback.
func (t *TwoPhaseCommit) Commit(participantNames []string, failAt int) ([]participant, []string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	trace := []string{"phase-1: PREPARE (vote collection)"}

	participants := make([]participant, 0, len(participantNames))
	allYes := true
	for i, name := range participantNames {
		p := participant{Name: name}
		if failAt > 0 && i == failAt-1 {
			p.Vote = "no"
			allYes = false
			trace = append(trace, "  "+name+" -> VOTE-NO")
		} else {
			p.Vote = "yes"
			p.Prepared = true
			trace = append(trace, "  "+name+" -> VOTE-YES (locks acquired, redo log written)")
		}
		participants = append(participants, p)
	}

	if allYes {
		trace = append(trace, "phase-2: COMMIT (global commit broadcast)")
		for i := range participants {
			participants[i].Committed = true
			trace = append(trace, "  "+participants[i].Name+" -> COMMITTED")
		}
		t.committed++
		t.lastTrace = trace
		return participants, trace, nil
	}

	trace = append(trace, "phase-2: ROLLBACK (global abort broadcast)")
	for i := range participants {
		if participants[i].Prepared {
			trace = append(trace, "  "+participants[i].Name+" -> ROLLED BACK (locks released)")
		}
	}
	t.aborted++
	t.lastTrace = trace
	return participants, trace, ErrVoteRejected
}

// Stats reports coordinator counters.
func (t *TwoPhaseCommit) Stats() map[string]any {
	t.mu.Lock()
	defer t.mu.Unlock()
	return map[string]any{"committed": t.committed, "aborted": t.aborted}
}

func (t *TwoPhaseCommit) Name() string     { return "Two-Phase Commit" }
func (t *TwoPhaseCommit) Category() string { return "transaction" }
func (t *TwoPhaseCommit) Description() string {
	return "A prepare round collects votes from every participant; commit proceeds only if all voted yes, otherwise all roll back."
}

func (t *TwoPhaseCommit) RegisterRoutes(r chi.Router) {
	r.Get("/api/patterns/two-phase-commit", t.handleDemo)
	r.Post("/transaction/2pc", t.handleDemo)
}

func (t *TwoPhaseCommit) handleDemo(w http.ResponseWriter, req *http.Request) {
	failAt := 0
	if v := req.URL.Query().Get("fail_participant"); v != "" {
		for _, c := range v {
			if c >= '0' && c <= '9' {
				failAt = failAt*10 + int(c-'0')
			}
		}
	}
	participants, trace, err := t.Commit([]string{"orders-db", "inventory-db", "payments-db"}, failAt)
	body := map[string]any{
		"pattern":      t.Name(),
		"category":     t.Category(),
		"participants": participants,
		"trace":        trace,
		"stats":        t.Stats(),
	}
	if err != nil {
		body["outcome"] = "aborted"
		writeJSON(w, http.StatusConflict, body)
		return
	}
	body["outcome"] = "committed"
	writeJSON(w, http.StatusOK, body)
}
