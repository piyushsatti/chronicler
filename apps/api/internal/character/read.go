package character

import "time"

type ProgressionEntry struct {
	ID          string
	CharacterID string
	Delta       int
	Reason      string
	CreatedAt   time.Time
}

type LogEntry struct {
	ID          string
	CharacterID string
	QuestID     string
	Body        string
	CreatedAt   time.Time
}

type VerificationEntry struct {
	ID          string
	Decision    string
	DecidedBy   string
	Note        string
	CreatedAt   time.Time
}
