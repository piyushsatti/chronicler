package quest

import "context"

type memoryRepo struct {
	quests    map[string]Quest
	saved     []Quest
	revisions []string
}

func (m *memoryRepo) Get(_ context.Context, id string) (Quest, error) {
	q, ok := m.quests[id]
	if !ok {
		return Quest{}, ErrNotFound
	}
	return q, nil
}

func (m *memoryRepo) Save(_ context.Context, q Quest) error {
	m.saved = append(m.saved, q)
	return nil
}

func (m *memoryRepo) SignUp(_ context.Context, _, _, _ string) error { return nil }

func (m *memoryRepo) ListParticipants(_ context.Context, _ string, _ *string) ([]Participant, error) {
	return nil, nil
}

func (m *memoryRepo) Create(_ context.Context, actorID string, spec CreateSpec) (Quest, error) {
	id := spec.ShortCode
	if id == "" {
		id = "quest"
	}
	q := Quest{ID: id, DMID: actorID, Status: Open, ScheduledAt: spec.ScheduledAt, SlotsMax: spec.SlotsMax}
	m.saved = append(m.saved, q)
	return q, nil
}

func (m *memoryRepo) RecordDesiredRevision(_ context.Context, id string) error {
	m.revisions = append(m.revisions, id)
	return nil
}

// memoryRunner stages saves and keeps them only when fn succeeds, the same
// commit-or-rollback contract the Postgres runner will have.
type memoryRunner struct {
	repo      *memoryRepo
	commits   int
	rollbacks int
}

func (r *memoryRunner) Do(_ context.Context, fn func(Repository) error) error {
	staged := &memoryRepo{quests: r.repo.quests}
	if err := fn(staged); err != nil {
		r.rollbacks++
		return err
	}
	for _, q := range staged.saved {
		r.repo.quests[q.ID] = q
	}
	r.repo.saved = append(r.repo.saved, staged.saved...)
	r.repo.revisions = append(r.repo.revisions, staged.revisions...)
	r.commits++
	return nil
}
