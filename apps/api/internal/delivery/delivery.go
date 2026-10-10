package delivery

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

func parseQuestPayload(payload []byte) (string, int, error) {
	if len(payload) == 0 {
		return "", 0, ErrBadPayload
	}
	var body jobs.QuestDiscordPayload
	if err := json.Unmarshal(payload, &body); err != nil {
		return "", 0, ErrBadPayload
	}
	if body.PublicID == "" || body.DesiredRevision < 1 {
		return "", 0, ErrBadPayload
	}
	return body.PublicID, body.DesiredRevision, nil
}

const LaneDiscord = "discord"
const KindQuestDiscord = "quest_discord_delivery"

// DesiredStateWriter bumps discord_desired_revision and enqueues a coalesce job.
type DesiredStateWriter interface {
	RecordDesiredRevision(ctx context.Context, questID string) error
}

// DiscordSync applies the current desired Discord state for one quest.
type DiscordSync interface {
	SyncQuest(ctx context.Context, questID string, desiredRevision int) error
}

// Reconciler schedules a follow-up job when desired still leads applied.
type Reconciler interface {
	Reconcile(ctx context.Context, questPublicID string) error
}

// Handler processes claimed Discord delivery jobs.
type Handler struct {
	store     jobs.Store
	sync      DiscordSync
	reconcile Reconciler
}

func NewHandler(store jobs.Store, sync DiscordSync) *Handler {
	return &Handler{store: store, sync: sync}
}

func (h *Handler) WithReconciler(r Reconciler) *Handler {
	h.reconcile = r
	return h
}

func (h *Handler) ProcessOne(ctx context.Context) (bool, error) {
	job, err := h.store.ClaimOne(ctx, LaneDiscord)
	if err != nil {
		return false, err
	}
	if job.ID == "" {
		return false, nil
	}
	questID, desired, err := parseQuestPayload(job.Payload)
	if err != nil {
		_ = h.store.Fail(ctx, job.ID, jobs.Dead, err.Error())
		return true, nil
	}
	if err := h.sync.SyncQuest(ctx, questID, desired); err != nil {
		if job.Attempts+1 >= jobs.MaxAttempts {
			_ = h.store.Fail(ctx, job.ID, jobs.Dead, err.Error())
			return true, nil
		}
		_ = h.store.Retry(ctx, job.ID, jobs.Backoff(job.Attempts+1), err.Error())
		return true, nil
	}
	if err := h.store.Succeed(ctx, job.ID); err != nil {
		return true, err
	}
	if h.reconcile != nil {
		if err := h.reconcile.Reconcile(ctx, questID); err != nil {
			slog.ErrorContext(ctx, "discord reconcile failed", "job", job.ID, "quest", questID, "error", err)
		}
	}
	slog.InfoContext(ctx, "discord delivery succeeded", "job", job.ID, "quest", questID)
	return true, nil
}

// NoopSync is the P5 stand-in until Discord REST calls are wired.
type NoopSync struct{}

func (NoopSync) SyncQuest(context.Context, string, int) error { return nil }

// MemoryStore is an in-process job table for local worker runs.
type MemoryStore struct {
	Jobs []jobs.Job
}

func (m *MemoryStore) Enqueue(_ context.Context, job jobs.Job) error {
	if job.State == "" {
		job.State = jobs.Queued
	}
	m.Jobs = append(m.Jobs, job)
	return nil
}

func (m *MemoryStore) ClaimOne(_ context.Context, lane string) (jobs.Job, error) {
	now := time.Now()
	for i := range m.Jobs {
		j := &m.Jobs[i]
		if j.Lane == lane && (j.State == jobs.Queued || j.State == jobs.RetryWait) && !j.NextRunAt.After(now) {
			j.State = jobs.Running
			j.Attempts++
			return *j, nil
		}
	}
	return jobs.Job{}, nil
}

func (m *MemoryStore) Succeed(_ context.Context, id string) error {
	for i := range m.Jobs {
		if m.Jobs[i].ID == id {
			m.Jobs[i].State = jobs.Succeeded
			return nil
		}
	}
	return nil
}

func (m *MemoryStore) Retry(_ context.Context, id string, after time.Duration, reason string) error {
	for i := range m.Jobs {
		if m.Jobs[i].ID == id {
			m.Jobs[i].State = jobs.RetryWait
			m.Jobs[i].NextRunAt = time.Now().Add(after)
			return nil
		}
	}
	_ = reason
	return nil
}

func (m *MemoryStore) Fail(_ context.Context, id string, state jobs.State, reason string) error {
	for i := range m.Jobs {
		if m.Jobs[i].ID == id {
			m.Jobs[i].State = state
			return nil
		}
	}
	_ = reason
	return nil
}
