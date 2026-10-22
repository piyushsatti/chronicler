package member

import (
	"context"
	"errors"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// Private notes (D6) live in member_settings.payload.private_notes as
// {"body": text, "updated_at": timestamptz}. Both operations are scoped to the
// caller by construction: neither takes a member id, so no other member or
// admin can address someone else's notes through the API.

const privateNotesMaxRunes = 10000

type PrivateNotesView struct {
	Body      string
	UpdatedAt *time.Time
}

// SetMyPrivateNotesResult is the command result, which runMemberCommand also
// stores as the idempotency receipt. It must never carry the body: receipts are
// kept indefinitely, so a body here would retain every saved version.
type SetMyPrivateNotesResult struct {
	UpdatedAt *time.Time `json:"updatedAt"`
}

type MyPrivateNotesSpec struct{}

type SetMyPrivateNotesSpec struct {
	Body string
}

type SetMyPrivateNotesState struct {
	Exists bool
}

type SetMyPrivateNotesWrite struct {
	ActorID string
	At      time.Time
	Body    string
}

func validatePrivateNotes(body string) error {
	if !utf8.ValidString(body) || utf8.RuneCountInString(body) > privateNotesMaxRunes {
		return apierr.New(apierr.Invalid, "private notes exceed 10,000 characters")
	}
	return nil
}

func (s ProductQueries) MyPrivateNotes(ctx context.Context, actor auth.Authority, spec MyPrivateNotesSpec) (PrivateNotesView, error) {
	if err := s.admit(ctx, actor, "Query.myPrivateNotes", actor.Claims().MemberID); err != nil {
		return PrivateNotesView{}, err
	}
	return s.Reads.Member.ReadMyPrivateNotes(ctx, actor, spec)
}

func (s ProductCommands) SetMyPrivateNotes(ctx context.Context, actor auth.Authority, spec SetMyPrivateNotesSpec, meta product.CommandMeta) (SetMyPrivateNotesResult, error) {
	if err := validatePrivateNotes(spec.Body); err != nil {
		return SetMyPrivateNotesResult{}, err
	}
	return runMemberCommand(ctx, s, actor, "setMyPrivateNotes", spec, meta, actor.Claims().MemberID, func(repos ProductCommandRepos, fresh auth.Authority, at time.Time) (SetMyPrivateNotesResult, error) {
		locked, err := repos.Member.LockSetMyPrivateNotes(ctx, fresh.Claims().MemberID)
		if err != nil {
			return SetMyPrivateNotesResult{}, err
		}
		if !locked.Exists {
			return SetMyPrivateNotesResult{}, apierr.New(apierr.NotFound, "member not found")
		}
		stored, err := repos.Member.StoreSetMyPrivateNotes(ctx, SetMyPrivateNotesWrite{ActorID: fresh.Claims().MemberID, At: at, Body: spec.Body})
		if err != nil {
			return SetMyPrivateNotesResult{}, err
		}
		return SetMyPrivateNotesResult{UpdatedAt: stored.UpdatedAt}, nil
	})
}

func privateNotesView(body string, updatedAt pgtype.Timestamptz) PrivateNotesView {
	view := PrivateNotesView{Body: body}
	if updatedAt.Valid {
		at := updatedAt.Time.UTC()
		view.UpdatedAt = &at
	}
	return view
}

func (p *ProductPostgres) ReadMyPrivateNotes(ctx context.Context, actor auth.Authority, _ MyPrivateNotesSpec) (PrivateNotesView, error) {
	id, err := actorID(actor)
	if err != nil {
		return PrivateNotesView{}, err
	}
	row, err := p.queries().ProductMemberPrivateNotes(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return PrivateNotesView{}, apierr.New(apierr.NotFound, "member not found")
	}
	if err != nil {
		return PrivateNotesView{}, err
	}
	return privateNotesView(row.Body, row.UpdatedAt), nil
}

func (p *ProductPostgres) LockSetMyPrivateNotes(ctx context.Context, actorID string) (SetMyPrivateNotesState, error) {
	id, err := productID(actorID)
	if err != nil {
		return SetMyPrivateNotesState{}, err
	}
	locked, err := p.queries().ProductLockMembers(ctx, []pgtype.UUID{id})
	if err != nil {
		return SetMyPrivateNotesState{}, err
	}
	return SetMyPrivateNotesState{Exists: len(locked) > 0}, nil
}

func (p *ProductPostgres) StoreSetMyPrivateNotes(ctx context.Context, write SetMyPrivateNotesWrite) (PrivateNotesView, error) {
	id, err := productID(write.ActorID)
	if err != nil {
		return PrivateNotesView{}, err
	}
	row, err := p.queries().ProductStorePrivateNotes(ctx, dbgen.ProductStorePrivateNotesParams{
		ActorID: id, Body: write.Body, At: pgtype.Timestamptz{Time: write.At, Valid: true},
	})
	if err != nil {
		return PrivateNotesView{}, err
	}
	return privateNotesView(row.Body, row.UpdatedAt), nil
}
