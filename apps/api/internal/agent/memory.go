package agent

import (
	"context"
	"encoding/json"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"sort"
	"sync"
	"time"
)

type memoryQuestion struct {
	req QuestionRequested
	job jobs.Job
}
type memoryStore struct {
	mu   sync.Mutex
	rows map[string]*memoryQuestion
	now  func() time.Time
}

func newMemoryStore(now func() time.Time) *memoryStore {
	return &memoryStore{rows: map[string]*memoryQuestion{}, now: now}
}
func (m *memoryStore) Create(_ context.Context, r QuestionRequested) error {
	if e := validateRequest(&r); e != nil {
		return e
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	b, _ := json.Marshal(r)
	if old := m.rows[r.JobID]; old != nil {
		a, _ := json.Marshal(old.req)
		if !jobs.EqualJSON(a, b) {
			return jobs.ErrLease
		}
		return nil
	}
	now := m.now()
	m.rows[r.JobID] = &memoryQuestion{r, jobs.Job{ID: r.JobID, PublicID: r.JobID, Kind: "agent_question", State: jobs.Queued, NextRunAt: now, QuestionDeadlineAt: now.Add(jobs.QuestionBudget)}}
	return nil
}
func (m *memoryStore) Get(_ context.Context, id string) (string, json.RawMessage, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.rows[id]
	if r == nil {
		return "", nil, false, nil
	}
	state := "queued"
	switch r.job.State {
	case jobs.Running:
		state = "claimed"
	case jobs.Succeeded:
		state = "answered"
	case jobs.Dead, jobs.RepairRequired, jobs.Cancelled:
		state = "failed"
	}
	return state, r.job.CompletionPayload, true, nil
}
func (m *memoryStore) Claim(_ context.Context) (ClaimedQuestion, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ids := make([]string, 0, len(m.rows))
	for id := range m.rows {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		a, b := m.rows[ids[i]].job, m.rows[ids[j]].job
		if a.NextRunAt.Equal(b.NextRunAt) {
			return ids[i] < ids[j]
		}
		return a.NextRunAt.Before(b.NextRunAt)
	})
	now := m.now()
	for _, id := range ids {
		r := m.rows[id]
		ok, e := r.job.Claim(now)
		if e != nil {
			return ClaimedQuestion{}, false, e
		}
		if ok {
			return ClaimedQuestion{r.req, r.job.Lease(now), r.job.QuestionDeadlineAt}, true, nil
		}
	}
	return ClaimedQuestion{}, false, nil
}
func (m *memoryStore) mutate(id, token string, fn func(*jobs.Job, int64, time.Time) error) error {
	t, e := jobs.ParseToken(token)
	if e != nil {
		return e
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.rows[id]
	if r == nil {
		return jobs.ErrMissing
	}
	now := m.now()
	if r.job.ExpireQuestion(now) {
		return jobs.ErrLease
	}
	return fn(&r.job, t, now)
}
func (m *memoryStore) Complete(_ context.Context, c QuestionCompletion) error {
	if e := validateCompletion(&c, c.JobID); e != nil {
		return e
	}
	b, _ := json.Marshal(c.QuestionResult)
	state, op := jobs.Succeeded, "succeed"
	if c.Type == "question.failed" {
		state, op = jobs.Dead, "fail"
	}
	return m.mutate(c.JobID, c.LeaseToken, func(j *jobs.Job, t int64, now time.Time) error { return j.Finish(t, now, op, state, b, 0, "") })
}
func (m *memoryStore) Renew(_ context.Context, id, token string) (out jobs.Lease, e error) {
	e = m.mutate(id, token, func(j *jobs.Job, t int64, now time.Time) error {
		if e := j.Renew(t, now); e != nil {
			return e
		}
		out = j.Lease(now)
		return nil
	})
	return
}
func (m *memoryStore) Retry(_ context.Context, id, token, reason string) error {
	return m.mutate(id, token, func(j *jobs.Job, t int64, now time.Time) error {
		return j.Finish(t, now, "retry", jobs.RetryWait, nil, jobs.Backoff(j.Attempts), reason)
	})
}
