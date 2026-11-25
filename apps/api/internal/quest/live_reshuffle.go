package quest

import (
	"context"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
)

// Live reshuffle (#213, owner decisions 2026-11-25). On a Last Game Played quest the
// DM's fill by last played opens a live window, and the first player-list publish
// closes it. Inside the window:
//   - every seat the fill or a withdrawal promotion gives out is held: its
//     waitlist-promotion notice waits for publish;
//   - a later signup takes an open seat, or takes the lowest-priority held seat
//     when it ranks above that seat in Last Game Played order;
//   - DM picks and manual adds are never held, so they never move.
//   - marking the quest played without a published list also sends the held notices.
//
// Pattern: the seat-priority query stays the one specification of seat order. A
// signup re-applies it to the newcomer inside the signup transaction
// (desired-state reconciliation); no second ranking rule exists.

// LiveReshuffle reports an open live window: a Last Game Played quest that is still
// taking signups, filled by last played, with no player list published yet.
func (q QuestView) LiveReshuffle() bool {
	return q.liveWindow(false)
}

// liveWindow reports whether seats given out now are held. filling is true for the
// fill by last played itself, which opens the window when it is not yet open.
func (q QuestView) liveWindow(filling bool) bool {
	if q.SignupType == nil || *q.SignupType != lastGamePlayedSignup {
		return false
	}
	if q.Status != "open" && q.Status != "full" {
		return false
	}
	if q.PlayerListPublishedAt != nil {
		return false
	}
	return filling || q.LiveFillStartedAt != nil
}

// liveSignupSeat is what a live signup does to the seats.
type liveSignupSeat struct {
	Take bool   // the newcomer gets a seat
	Bump string // the held seat's character returned to the waitlist; empty when none
}

// seatOrderEntry is one row of the seat-priority order.
type seatOrderEntry struct {
	CharacterID string
	Status      string
	Held        bool
}

// planLiveSignupSeat places newcomer, already waitlisted, against ordered, the
// seat-priority order. An open seat is taken. Otherwise the newcomer takes the
// lowest-priority held seat only if the newcomer ranks above it.
func planLiveSignupSeat(ordered []seatOrderEntry, newcomer string, open int32) liveSignupSeat {
	at := -1
	for i, entry := range ordered {
		if entry.CharacterID == newcomer {
			at = i
			break
		}
	}
	if at < 0 || ordered[at].Status != "waitlisted" {
		return liveSignupSeat{}
	}
	if open > 0 {
		return liveSignupSeat{Take: true}
	}
	for i := len(ordered) - 1; i > at; i-- {
		if ordered[i].Status == "signed_up" && ordered[i].Held {
			return liveSignupSeat{Take: true, Bump: ordered[i].CharacterID}
		}
	}
	return liveSignupSeat{}
}

// placeLiveSignup applies planLiveSignupSeat to a signup that was just written as
// waitlisted. It returns whether the newcomer now holds a seat.
func (p *ProductPostgres) placeLiveSignup(ctx context.Context, write SignupForQuestWrite) (bool, error) {
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return false, err
	}
	rows, err := p.queries().ProductQuestSeatPriority(ctx, questID)
	if err != nil {
		return false, err
	}
	ordered := make([]seatOrderEntry, 0, len(rows))
	for _, row := range rows {
		ordered = append(ordered, seatOrderEntry{CharacterID: db.UUIDString(row.CharacterPublicID), Status: row.Status, Held: row.SeatNoticeHeld})
	}
	plan := planLiveSignupSeat(ordered, write.ValidatedInput.CharacterId, write.Locked.Before.SlotsMax-write.Locked.Before.FilledCount)
	if !plan.Take {
		return false, nil
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	if plan.Bump == "" {
		if _, err := p.queries().ProductQuestIncrementCapacity(ctx, dbgen.ProductQuestIncrementCapacityParams{Delta: 1, QuestID: write.Locked.QuestRowID}); err != nil {
			return false, err
		}
	} else if _, err := p.queries().ProductQuestDemoteHeldSeat(ctx, dbgen.ProductQuestDemoteHeldSeatParams{At: at, QuestID: questID, CharacterID: mustUUID(plan.Bump)}); err != nil {
		return false, err
	}
	promoted, err := p.queries().ProductQuestPromoteParticipants(ctx, dbgen.ProductQuestPromoteParticipantsParams{
		QuestID: questID, CharacterIds: []pgtype.UUID{mustUUID(write.ValidatedInput.CharacterId)}, At: at, DmPicked: false, SeatNoticeHeld: true,
	})
	if err != nil {
		return false, err
	}
	if len(promoted) != 1 {
		return false, apierr.New(apierr.Conflict, "signup participation changed")
	}
	return true, nil
}

// holdSelectedSeats reports whether seats a selection gives out are held. DM picks
// are never held. The fill by last played opens the live window if it is not open.
func (p *ProductPostgres) holdSelectedSeats(ctx context.Context, write SelectQuestParticipantsWrite, dmPicked bool) (bool, error) {
	before := write.Locked.Before
	filling := write.ValidatedInput.FillByLastGamePlayed
	if dmPicked || before == nil || !before.liveWindow(filling) {
		return false, nil
	}
	if filling && before.LiveFillStartedAt == nil {
		if err := p.queries().ProductQuestStartLiveFill(ctx, dbgen.ProductQuestStartLiveFillParams{At: pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}, QuestID: write.Locked.QuestRowID}); err != nil {
			return false, err
		}
	}
	return true, nil
}

// publishHeldSeats closes the live window at the first publish and releases the held seats.
func (p *ProductPostgres) publishHeldSeats(ctx context.Context, questID pgtype.UUID, at time.Time) ([]string, error) {
	if _, err := p.queries().ProductQuestMarkPlayerListPublished(ctx, dbgen.ProductQuestMarkPlayerListPublishedParams{At: pgtype.Timestamptz{Time: at.UTC(), Valid: true}, QuestID: questID}); err != nil {
		return nil, err
	}
	return p.releaseHeldSeats(ctx, questID)
}

// ReleaseHeldSeats releases the held seats of a quest the DM marked played without
// publishing a player list (owner decision 2026-11-25), so their notices still go out.
func (p *ProductPostgres) ReleaseHeldSeats(ctx context.Context, questID string) ([]string, error) {
	id, err := questUUID(questID)
	if err != nil {
		return nil, err
	}
	return p.releaseHeldSeats(ctx, id)
}

// releaseHeldSeats clears every held flag on the quest. It returns the characters
// still seated, sorted, whose held notice is now due.
func (p *ProductPostgres) releaseHeldSeats(ctx context.Context, questID pgtype.UUID) ([]string, error) {
	rows, err := p.queries().ProductQuestReleaseHeldSeats(ctx, questID)
	if err != nil {
		return nil, err
	}
	seated := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.Status == "signed_up" {
			seated = append(seated, db.UUIDString(row.CharacterID))
		}
	}
	sort.Strings(seated)
	return seated, nil
}

func timePtr(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	t := value.Time
	return &t
}
