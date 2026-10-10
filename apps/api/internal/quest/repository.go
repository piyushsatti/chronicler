package quest

import "context"

// Repository loads and stores the quest aggregate inside one transaction.
// It never commits.
type Repository interface {
	Get(ctx context.Context, id string) (Quest, error)
	Save(ctx context.Context, q Quest) error
	Create(ctx context.Context, actorID string, spec CreateSpec) (Quest, error)
	SignUp(ctx context.Context, questID, memberID, characterID string) error
	ListParticipants(ctx context.Context, questID string, status *string) ([]Participant, error)
	// RecordDesiredRevision bumps discord_desired_revision and enqueues the
	// discord job. Implementations run it on the caller's transaction.
	RecordDesiredRevision(ctx context.Context, questID string) error
}
