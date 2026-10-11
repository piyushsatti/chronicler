package jobs

import (
	"context"
	"encoding/json"
	"strconv"
	"sync"
	"time"
)

type MemoryStore struct {
	mu   sync.Mutex
	Jobs []Job
	Now  func() time.Time
}

func (m *MemoryStore) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now()
}
func (m *MemoryStore) Enqueue(_ context.Context, j Job) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j.ID == "" {
		j.ID = strconv.Itoa(len(m.Jobs) + 1)
	}
	if j.State == "" {
		j.State = Queued
	}
	for i := range m.Jobs {
		old := &m.Jobs[i]
		if old.Key == j.Key {
			if old.State != Running {
				j.ID = old.ID
				j.PublicID = old.PublicID
				j.Token = old.Token
				*old = j
			}
			return nil
		}
	}
	m.Jobs = append(m.Jobs, j)
	return nil
}
func (m *MemoryStore) ClaimOne(ctx context.Context, lane string) (Job, error) {
	if e := ctx.Err(); e != nil {
		return Job{}, e
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.Jobs {
		j := &m.Jobs[i]
		if j.Lane != lane {
			continue
		}
		ok, e := j.Claim(m.now())
		if e != nil {
			return Job{}, e
		}
		if ok {
			return *j, nil
		}
	}
	return Job{}, nil
}
func (m *MemoryStore) mutate(ctx context.Context, r Receipt, fn func(*Job, int64, time.Time) error) error {
	if e := ctx.Err(); e != nil {
		return e
	}
	t, e := ParseToken(r.Token)
	if e != nil {
		return e
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.Jobs {
		j := &m.Jobs[i]
		if j.ID == r.ID {
			return fn(j, t, m.now())
		}
	}
	return ErrMissing
}
func (m *MemoryStore) Succeed(ctx context.Context, r Receipt) error {
	return m.mutate(ctx, r, func(j *Job, t int64, n time.Time) error {
		return j.Finish(t, n, "succeed", Succeeded, []byte(`{}`), 0, "")
	})
}
func (m *MemoryStore) Fail(ctx context.Context, r Receipt, state State, reason string) error {
	return m.mutate(ctx, r, func(j *Job, t int64, n time.Time) error {
		p, _ := json.Marshal(map[string]string{"reason": reason})
		return j.Finish(t, n, "fail", state, p, 0, reason)
	})
}
func (m *MemoryStore) Retry(ctx context.Context, r Receipt, after time.Duration, reason string) error {
	return m.mutate(ctx, r, func(j *Job, t int64, n time.Time) error {
		return j.Finish(t, n, "retry", RetryWait, nil, after, reason)
	})
}
func (m *MemoryStore) Renew(ctx context.Context, r Receipt) (out Lease, e error) {
	e = m.mutate(ctx, r, func(j *Job, t int64, n time.Time) error {
		if e := j.Renew(t, n); e != nil {
			return e
		}
		out = j.Lease(n)
		return nil
	})
	return
}
