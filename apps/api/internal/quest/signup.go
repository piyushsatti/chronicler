package quest

import "github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"

var (
	ErrQuestFull         = apierr.New(apierr.Conflict, "quest has no open seats")
	ErrAlreadySignedUp   = apierr.New(apierr.Conflict, "already signed up for this quest")
	ErrQuestNotOpen      = apierr.New(apierr.Conflict, "quest is not open for signup")
	ErrNotCharacterOwner = apierr.New(apierr.Forbidden, "character does not belong to the signing member")
)

type Participant struct {
	QuestID     string
	MemberID    string
	CharacterID string
	Status      string
	Manual      bool
}

func canSignUp(q LegacyQuestView) error {
	switch q.Status {
	case Open, Full:
	default:
		return ErrQuestNotOpen
	}
	if q.FilledCount >= q.SlotsMax {
		return ErrQuestFull
	}
	return nil
}
