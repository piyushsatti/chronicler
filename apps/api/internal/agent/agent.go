package agent

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"os"
	"sync"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
)

type QuestionRequested struct {
	Version  int             `json:"version"`
	Type     string          `json:"type"`
	JobID    string          `json:"job_id"`
	Question string          `json:"question"`
	History  json.RawMessage `json:"history"`
}

type QuestionResult struct {
	Version int             `json:"version"`
	Type    string          `json:"type"`
	JobID   string          `json:"job_id"`
	Answer  string          `json:"answer,omitempty"`
	Sources json.RawMessage `json:"sources,omitempty"`
	Error   string          `json:"error,omitempty"`
}

type job struct {
	req    QuestionRequested
	result *QuestionResult
	done   bool
}

type Service struct {
	secret         string
	store          Store
	inlineComplete bool
	mu             sync.Mutex
	mem            map[string]*job
}

func New(secret string, store Store) *Service {
	s := &Service{
		secret:         secret,
		mem:            map[string]*job{},
		inlineComplete: os.Getenv("AGENT_INLINE_COMPLETE") == "1",
	}
	if store == nil {
		s.store = &memoryStore{m: s.mem, mu: &s.mu}
	} else {
		s.store = store
	}
	return s
}

func (s *Service) Routes(mux httpserver.Router) {
	mux.HandleFunc("POST /v1/agent/questions", s.submit)
	mux.HandleFunc("GET /v1/agent/questions/{id}", s.get)
	mux.HandleFunc("POST /v1/agent/questions/{id}/complete", s.completeHTTP)
}

func (s *Service) authorize(r *http.Request) error {
	if s.secret == "" {
		return apierr.New(apierr.Forbidden, "ingest not configured")
	}
	got := r.Header.Get("X-Ingest-Secret")
	if subtle.ConstantTimeCompare([]byte(got), []byte(s.secret)) != 1 {
		return apierr.New(apierr.Unauthenticated, "invalid ingest secret")
	}
	return nil
}

func (s *Service) submit(w http.ResponseWriter, r *http.Request) {
	if err := s.authorize(r); err != nil {
		apierr.Write(w, r, err)
		return
	}
	var req QuestionRequested
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "invalid JSON body"))
		return
	}
	if req.Version != 1 || req.Type != "question.requested" || req.JobID == "" || req.Question == "" {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "version, type, job_id, and question required"))
		return
	}
	if err := s.store.Create(r.Context(), req); err != nil {
		apierr.Write(w, r, err)
		return
	}
	if s.inlineComplete {
		_ = s.Complete(r.Context(), QuestionResult{
			Version: 1, Type: "question.completed", JobID: req.JobID,
			Answer: "Inline agent stub.", Sources: json.RawMessage("[]"),
		})
	}
	w.WriteHeader(http.StatusAccepted)
}

func (s *Service) completeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := s.authorize(r); err != nil {
		apierr.Write(w, r, err)
		return
	}
	var result QuestionResult
	if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
		apierr.Write(w, r, apierr.New(apierr.Invalid, "invalid JSON body"))
		return
	}
	if result.JobID == "" {
		result.JobID = r.PathValue("id")
	}
	if err := s.Complete(r.Context(), result); err != nil {
		apierr.Write(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) get(w http.ResponseWriter, r *http.Request) {
	if err := s.authorize(r); err != nil {
		apierr.Write(w, r, err)
		return
	}
	id := r.PathValue("id")
	state, result, ok, err := s.store.Get(r.Context(), id)
	if err != nil {
		apierr.Write(w, r, err)
		return
	}
	if !ok {
		apierr.Write(w, r, apierr.New(apierr.NotFound, "question not found"))
		return
	}
	if state != "completed" {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if len(result) > 0 {
		_, _ = w.Write(result)
		return
	}
	s.mu.Lock()
	j, memOk := s.mem[id]
	s.mu.Unlock()
	if memOk && j.done && j.result != nil {
		_ = json.NewEncoder(w).Encode(j.result)
	}
}

func (s *Service) Complete(ctx context.Context, result QuestionResult) error {
	return s.store.Complete(ctx, result)
}

type memoryStore struct {
	m  map[string]*job
	mu *sync.Mutex
}

func (m *memoryStore) Create(_ context.Context, req QuestionRequested) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.m[req.JobID] = &job{req: req}
	return nil
}

func (m *memoryStore) Get(_ context.Context, jobID string) (string, json.RawMessage, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.m[jobID]
	if !ok {
		return "", nil, false, nil
	}
	if !j.done {
		return "queued", nil, true, nil
	}
	raw, _ := json.Marshal(j.result)
	return "completed", raw, true, nil
}

func (m *memoryStore) Complete(_ context.Context, result QuestionResult) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.m[result.JobID]
	if !ok {
		return apierr.New(apierr.NotFound, "question not found")
	}
	j.result = &result
	j.done = true
	return nil
}
