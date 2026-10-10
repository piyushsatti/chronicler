package quest

import (
	"context"
	"sync"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/uow"
)

type memoryStore struct {
	mu     sync.Mutex
	quests map[string]Quest
}

func (m *memoryStore) Get(_ context.Context, id string) (Quest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q, ok := m.quests[id]
	if !ok {
		return Quest{}, ErrNotFound
	}
	return q, nil
}

func (m *memoryStore) Save(_ context.Context, q Quest) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.quests[q.ID] = q
	return nil
}

func (m *memoryStore) SignUp(_ context.Context, _, _, _ string) error {
	return nil
}

func (m *memoryStore) ListParticipants(_ context.Context, _ string, _ *string) ([]Participant, error) {
	return nil, nil
}

func (m *memoryStore) Create(_ context.Context, actorID string, spec CreateSpec) (Quest, error) {
	q := Quest{
		ID: spec.ShortCode, DMID: actorID, Status: Open,
		ScheduledAt: spec.ScheduledAt, SlotsMax: spec.SlotsMax,
	}
	if q.ID == "" {
		q.ID = "quest"
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.quests == nil {
		m.quests = map[string]Quest{}
	}
	m.quests[q.ID] = q
	return q, nil
}

func (m *memoryStore) RecordDesiredRevision(context.Context, string) error { return nil }

type memoryUoW struct {
	store *memoryStore
}

func (u *memoryUoW) Do(ctx context.Context, fn func(Repository) error) error {
	return fn(u.store)
}

// MemoryRunner is a P1 stand-in that does not persist across process restarts.
func MemoryRunner() uow.Runner[Repository] {
	return &memoryUoW{store: &memoryStore{quests: map[string]Quest{}}}
}
