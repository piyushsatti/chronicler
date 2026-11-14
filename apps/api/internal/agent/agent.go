package agent

import (
	"context"
	"encoding/json"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/httpserver"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

type QuestionRequested struct {
	Version  int             `json:"version"`
	Type     string          `json:"type"`
	JobID    string          `json:"job_id"`
	Question string          `json:"question"`
	History  json.RawMessage `json:"history,omitempty"`
}
type QuestionResult struct {
	Version     int             `json:"version"`
	Type        string          `json:"type"`
	JobID       string          `json:"job_id"`
	Answer      string          `json:"answer,omitempty"`
	Sources     json.RawMessage `json:"sources,omitempty"`
	Message     string          `json:"message,omitempty"`
	Error       string          `json:"error,omitempty"`
	Diagnostics json.RawMessage `json:"diagnostics,omitempty"`
}
type ClaimedQuestion struct {
	QuestionRequested
	Lease              jobs.Lease `json:"lease"`
	QuestionDeadlineAt time.Time  `json:"question_deadline_at"`
}
type QuestionCompletion struct {
	QuestionResult
	LeaseToken string `json:"lease_token"`
}
type Service struct {
	secret         string
	store          Store
	inlineComplete bool
}

func New(secret string, store Store, inlineComplete bool) *Service {
	if store == nil {
		store = newMemoryStore(time.Now)
	}
	return &Service{secret, store, inlineComplete}
}
func (s *Service) Routes(mux httpserver.Router) {
	mux.HandleFunc("POST /v1/agent/questions", s.submit)
	mux.HandleFunc("POST /v1/agent/questions/claim", s.claim)
	mux.HandleFunc("GET /v1/agent/questions/{id}", s.get)
	mux.HandleFunc("POST /v1/agent/questions/{id}/complete", s.completeHTTP)
	mux.HandleFunc("POST /v1/agent/questions/{id}/renew", s.renew)
	mux.HandleFunc("POST /v1/agent/questions/{id}/retry", s.retry)
}
func (s *Service) authorize(r *http.Request) error {
	return httpserver.AuthorizeIngestSecret(r, s.secret)
}
func invalid(message string) error { return apierr.New(apierr.Invalid, message) }
func decode(r *http.Request, v any, limit int64) error {
	b, e := io.ReadAll(io.LimitReader(r.Body, limit+1))
	if e != nil || int64(len(b)) > limit {
		return invalid("body exceeds byte limit")
	}
	d := json.NewDecoder(strings.NewReader(string(b)))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		return invalid("invalid JSON body")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return invalid("one JSON object required")
	}
	return nil
}
func normalize(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var v any
	d := json.NewDecoder(strings.NewReader(string(raw)))
	d.UseNumber()
	if d.Decode(&v) != nil {
		return nil, invalid("invalid JSON value")
	}
	if !validJSONBNumbers(v) {
		return nil, invalid("JSON number exceeds PostgreSQL numeric storage limits")
	}
	b, e := json.Marshal(v)
	return b, e
}

// JSONB stores numbers as PostgreSQL numeric, not float64. Check the
// documented 131072 integer-digit and 16383 fractional-scale limits using
// decimal positions; never expand an exponent or round a coefficient.
func validJSONBNumber(n json.Number) bool {
	s := strings.TrimPrefix(string(n), "-")
	exponent := new(big.Int)
	if i := strings.IndexAny(s, "eE"); i >= 0 {
		if _, ok := exponent.SetString(s[i+1:], 10); !ok {
			return false
		}
		s = s[:i]
	}
	// PostgreSQL 16 rejects larger lexical exponents even for zero. The
	// boundary is independently exercised by the native JSONB admission test.
	if exponent.Cmp(big.NewInt(1073741823)) > 0 {
		return false
	}
	fraction := 0
	if i := strings.IndexByte(s, '.'); i >= 0 {
		fraction = len(s) - i - 1
		s = s[:i] + s[i+1:]
	}
	scale := new(big.Int).Sub(big.NewInt(int64(fraction)), exponent)
	if scale.Cmp(big.NewInt(16383)) > 0 {
		return false
	}
	significant := strings.TrimLeft(s, "0")
	if significant == "" {
		return true
	}
	integerDigits := new(big.Int).Add(big.NewInt(int64(len(significant)-fraction)), exponent)
	return integerDigits.Cmp(big.NewInt(131072)) <= 0
}
func validJSONBNumbers(v any) bool {
	switch x := v.(type) {
	case json.Number:
		return validJSONBNumber(x)
	case []any:
		for _, value := range x {
			if !validJSONBNumbers(value) {
				return false
			}
		}
	case map[string]any:
		for _, value := range x {
			if !validJSONBNumbers(value) {
				return false
			}
		}
	}
	return true
}
func validateRequest(q *QuestionRequested) error {
	if q.Version != 1 || q.Type != "question.requested" || strings.TrimSpace(q.Question) == "" || utf8.RuneCountInString(q.Question) > 600 {
		return invalid("invalid question")
	}
	if _, e := db.ParseUUID(q.JobID); e != nil {
		return invalid("job_id must be UUID")
	}
	raw, e := normalize(q.History)
	if e != nil {
		return e
	}
	q.History = raw
	if len(raw) == 0 {
		return nil
	}
	return validateQuestionHistory(raw)
}

func validateQuestionHistory(raw json.RawMessage) error {
	var h struct {
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
		Incomplete *bool `json:"incomplete"`
	}
	d := json.NewDecoder(strings.NewReader(string(raw)))
	d.DisallowUnknownFields()
	if d.Decode(&h) != nil || h.Messages == nil || h.Incomplete == nil || len(h.Messages) > 12 {
		return invalid("invalid history")
	}
	total := 0
	for _, m := range h.Messages {
		if (m.Role != "user" && m.Role != "assistant") || strings.TrimSpace(m.Content) == "" {
			return invalid("invalid history message")
		}
		total += len(m.Content)
	}
	if total > 8192 {
		return invalid("history exceeds byte limit")
	}
	return nil
}
func validateCompletion(c *QuestionCompletion, path string) error {
	if err := validateCompletionIdentity(c, path); err != nil {
		return err
	}
	if err := validateCompletionText(c); err != nil {
		return err
	}
	var e error
	c.Sources, e = normalize(c.Sources)
	if e != nil {
		return e
	}
	if len(c.Sources) == 0 {
		c.Sources = json.RawMessage(`[]`)
	}
	if err := validateCompletionSources(c.Sources); err != nil {
		return err
	}
	c.Diagnostics, e = normalize(c.Diagnostics)
	if e != nil {
		return e
	}
	return validateCompletionDiagnostics(c.Diagnostics)
}

func validateCompletionIdentity(c *QuestionCompletion, path string) error {
	if c.JobID != path || c.JobID == "" {
		return invalid("job_id must match path")
	}
	if _, e := db.ParseUUID(c.JobID); e != nil {
		return invalid("job_id must be UUID")
	}
	if _, e := jobs.ParseToken(c.LeaseToken); e != nil {
		return e
	}
	return nil
}

func validateCompletionText(c *QuestionCompletion) error {
	if c.Version != 1 || (c.Type != "question.completed" && c.Type != "question.failed") {
		return invalid("invalid result type/version")
	}
	if (c.Type == "question.completed" && strings.TrimSpace(c.Answer) == "") || (c.Type == "question.failed" && strings.TrimSpace(c.Message) == "") {
		return invalid("answer or failure message required")
	}
	if utf8.RuneCountInString(c.Answer) > 16000 || utf8.RuneCountInString(c.Message) > 1000 || utf8.RuneCountInString(c.Error) > 1000 {
		return invalid("result text exceeds limit")
	}
	return nil
}

func validateCompletionSources(raw json.RawMessage) error {
	var sources []map[string]any
	sourceDecoder := json.NewDecoder(strings.NewReader(string(raw)))
	sourceDecoder.UseNumber()
	if sourceDecoder.Decode(&sources) != nil || len(sources) > 100 {
		return invalid("invalid sources")
	}
	for _, v := range sources {
		if v == nil {
			return invalid("source must be object")
		}
	}
	return nil
}

func validateCompletionDiagnostics(raw json.RawMessage) error {
	if len(raw) > 16384 {
		return invalid("diagnostics exceed byte limit")
	}
	if len(raw) > 0 {
		var d map[string]any
		diagnosticDecoder := json.NewDecoder(strings.NewReader(string(raw)))
		diagnosticDecoder.UseNumber()
		if diagnosticDecoder.Decode(&d) != nil {
			return invalid("diagnostics must be object")
		}
	}
	return nil
}
func (s *Service) submit(w http.ResponseWriter, r *http.Request) {
	if e := s.authorize(r); e != nil {
		apierr.Write(w, r, e)
		return
	}
	var q QuestionRequested
	if e := decode(r, &q, 16384); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if e := validateRequest(&q); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if e := s.store.Create(r.Context(), q); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if s.inlineComplete {
		claimed, ok, e := s.store.Claim(r.Context())
		if e == nil && ok {
			c := QuestionCompletion{QuestionResult: QuestionResult{Version: 1, Type: "question.completed", JobID: claimed.JobID, Answer: "Inline agent stub.", Sources: json.RawMessage(`[]`)}, LeaseToken: claimed.Lease.Token}
			if e = s.store.Complete(r.Context(), c); e != nil {
				apierr.Write(w, r, e)
				return
			}
		}
	}
	w.WriteHeader(http.StatusAccepted)
}
func (s *Service) claim(w http.ResponseWriter, r *http.Request) {
	if e := s.authorize(r); e != nil {
		apierr.Write(w, r, e)
		return
	}
	var v struct {
		Protocol int `json:"lease_protocol"`
	}
	if e := decode(r, &v, 16384); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if v.Protocol != 1 {
		apierr.Write(w, r, invalid("lease_protocol 1 required"))
		return
	}
	q, ok, e := s.store.Claim(r.Context())
	if e != nil {
		apierr.Write(w, r, e)
		return
	}
	if !ok {
		w.WriteHeader(204)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(q)
}
func (s *Service) completeHTTP(w http.ResponseWriter, r *http.Request) {
	if e := s.authorize(r); e != nil {
		apierr.Write(w, r, e)
		return
	}
	var c QuestionCompletion
	if e := decode(r, &c, 65536); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if e := validateCompletion(&c, r.PathValue("id")); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if e := s.store.Complete(r.Context(), c); e != nil {
		apierr.Write(w, r, e)
		return
	}
	w.WriteHeader(204)
}
func (s *Service) get(w http.ResponseWriter, r *http.Request) {
	if e := s.authorize(r); e != nil {
		apierr.Write(w, r, e)
		return
	}
	state, result, ok, e := s.store.Get(r.Context(), r.PathValue("id"))
	if e != nil {
		apierr.Write(w, r, e)
		return
	}
	if !ok {
		apierr.Write(w, r, jobs.ErrMissing)
		return
	}
	if state != "answered" && state != "failed" {
		w.WriteHeader(202)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(result)
}
func (s *Service) renew(w http.ResponseWriter, r *http.Request) {
	if e := s.authorize(r); e != nil {
		apierr.Write(w, r, e)
		return
	}
	var v struct {
		Token string `json:"lease_token"`
	}
	if e := decode(r, &v, 16384); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if _, e := jobs.ParseToken(v.Token); e != nil {
		apierr.Write(w, r, e)
		return
	}
	lease, e := s.store.Renew(r.Context(), r.PathValue("id"), v.Token)
	if e != nil {
		apierr.Write(w, r, e)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(lease)
}
func (s *Service) retry(w http.ResponseWriter, r *http.Request) {
	if e := s.authorize(r); e != nil {
		apierr.Write(w, r, e)
		return
	}
	var v struct {
		Token  string `json:"lease_token"`
		Reason string `json:"reason"`
	}
	if e := decode(r, &v, 16384); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if _, e := jobs.ParseToken(v.Token); e != nil {
		apierr.Write(w, r, e)
		return
	}
	if v.Reason != "transient_error" && v.Reason != "worker_shutdown" {
		apierr.Write(w, r, invalid("invalid retry reason"))
		return
	}
	if e := s.store.Retry(r.Context(), r.PathValue("id"), v.Token, v.Reason); e != nil {
		apierr.Write(w, r, e)
		return
	}
	w.WriteHeader(204)
}
func (s *Service) Complete(ctx context.Context, c QuestionCompletion) error {
	return s.store.Complete(ctx, c)
}
