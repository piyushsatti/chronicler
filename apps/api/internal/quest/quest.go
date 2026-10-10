// Package quest is the quest aggregate: its status rules, the commands that
// change it, and the routes that expose them.
package quest

import (
	"slices"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

type Status string

const (
	Open      Status = "open"
	Full      Status = "full"
	Played    Status = "played"
	Closed    Status = "closed"
	Cancelled Status = "cancelled"
)

func ParseStatus(s string) (Status, bool) {
	status := Status(s)
	switch status {
	case Open, Full, Played, Closed, Cancelled:
		return status, true
	}
	return "", false
}

// Closing is not a transition: it awards rewards and has its own command.
var transitions = map[Status][]Status{
	Open: {Full, Played, Cancelled},
	Full: {Open, Played, Cancelled},
}

var (
	ErrUseClose          = apierr.New(apierr.Conflict, "close a quest with the close command")
	ErrIllegalTransition = apierr.New(apierr.Conflict, "illegal status transition")
	ErrNotYetScheduled   = apierr.New(apierr.Conflict, "a quest cannot be played before it is scheduled")
	ErrNotFound          = apierr.New(apierr.NotFound, "quest not found")
	ErrNotQuestDM        = apierr.New(apierr.Forbidden, "only the quest's DM or an admin may do this")
)

type Quest struct {
	ID          string
	DMID        string
	Status      Status
	ScheduledAt time.Time
	SlotsMax    int
	FilledCount int
}

// CreateSpec is the wire input for a new quest. DocumentID is a public_id.
type CreateSpec struct {
	ShortCode     string
	Kinds         []string
	ScheduledAt   time.Time
	DurationHours float64
	SlotsMax      int
	DocumentID    string
}

func (q Quest) Transition(to Status, now time.Time) (Quest, error) {
	if to == Closed {
		return q, ErrUseClose
	}
	if !slices.Contains(transitions[q.Status], to) {
		return q, ErrIllegalTransition
	}
	if to == Played && now.Before(q.ScheduledAt) {
		return q, ErrNotYetScheduled
	}
	q.Status = to
	return q, nil
}
