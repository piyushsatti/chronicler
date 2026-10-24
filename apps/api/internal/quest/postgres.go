package quest

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
)

type pgRepo struct {
	q       *dbgen.Queries
	discord *DiscordRevisionWriter
}

func NewPostgresRepository(q *dbgen.Queries) Repository {
	return &pgRepo{
		q:       q,
		discord: NewDiscordRevisionWriter(q, jobs.NewEnqueuer(jobs.NewFromQueries(q))),
	}
}

func (p *pgRepo) Get(ctx context.Context, id string) (Quest, error) {
	row, err := p.questRow(ctx, id)
	if err != nil {
		return Quest{}, err
	}
	return mapQuestRow(row), nil
}

func (p *pgRepo) Save(ctx context.Context, q Quest) error {
	uid, err := db.ParseUUID(q.ID)
	if err != nil {
		return ErrNotFound
	}
	return p.q.SaveQuestStatus(ctx, dbgen.SaveQuestStatusParams{
		PublicID: uid,
		Status:   string(q.Status),
	})
}

func (p *pgRepo) Create(ctx context.Context, actorID string, spec CreateSpec) (Quest, error) {
	if spec.ShortCode == "" {
		return Quest{}, apierr.New(apierr.Invalid, "shortCode required")
	}
	if len(spec.Kinds) == 0 {
		return Quest{}, apierr.New(apierr.Invalid, "kinds required")
	}
	if spec.ScheduledAt.IsZero() {
		return Quest{}, apierr.New(apierr.Invalid, "scheduledAt required")
	}
	dmID, err := p.internalMember(ctx, actorID)
	if err != nil {
		return Quest{}, err
	}
	docID, err := p.internalDocument(ctx, spec.DocumentID)
	if err != nil {
		return Quest{}, err
	}
	slots := spec.SlotsMax
	if slots <= 0 {
		slots = 5
	}
	duration := spec.DurationHours
	if duration <= 0 {
		duration = 4
	}
	row, err := p.q.InsertQuest(ctx, dbgen.InsertQuestParams{
		ShortCode:     spec.ShortCode,
		Kinds:         spec.Kinds,
		DmID:          dmID,
		ScheduledAt:   pgtype.Timestamptz{Time: spec.ScheduledAt, Valid: true},
		DurationHours: duration,
		SlotsMax:      int32(slots),
		DocumentID:    docID,
		CreatedBy:     dmID,
	})
	if err != nil {
		return Quest{}, err
	}
	return Quest{
		ID:          db.UUIDString(row.PublicID),
		DMID:        actorID,
		Status:      Open,
		ScheduledAt: spec.ScheduledAt,
		SlotsMax:    slots,
	}, nil
}

func (p *pgRepo) SignUp(ctx context.Context, questID, memberID, characterID string) error {
	row, err := p.questRow(ctx, questID)
	if err != nil {
		return err
	}
	view := mapQuestView(row)
	if err := canSignUp(view); err != nil {
		return err
	}
	member, err := p.internalMember(ctx, memberID)
	if err != nil {
		return err
	}
	character, err := p.characterForOwner(ctx, characterID, memberID)
	if err != nil {
		return err
	}
	n, err := p.q.InsertQuestParticipant(ctx, dbgen.InsertQuestParticipantParams{
		QuestID: row.ID, MemberID: member, CharacterID: character,
	})
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrAlreadySignedUp
	}
	filled, err := p.q.IncrementQuestFilled(ctx, row.ID)
	if err != nil {
		return err
	}
	if filled.FilledCount >= filled.SlotsMax && Status(filled.Status) == Open {
		return p.q.MarkQuestFull(ctx, row.ID)
	}
	return nil
}

func (p *pgRepo) ListParticipants(ctx context.Context, questID string, status *string) ([]Participant, error) {
	uid, err := db.ParseUUID(questID)
	if err != nil {
		return nil, ErrNotFound
	}
	filter := ""
	if status != nil {
		filter = *status
	}
	rows, err := p.q.ListQuestParticipants(ctx, dbgen.ListQuestParticipantsParams{
		QuestID: uid,
		Status:  filter,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Participant, 0, len(rows))
	for _, row := range rows {
		out = append(out, Participant{
			QuestID:     db.UUIDString(row.QuestID),
			MemberID:    db.UUIDString(row.MemberID),
			CharacterID: db.UUIDString(row.CharacterID),
			Status:      row.Status,
			Manual:      row.Manual,
		})
	}
	return out, nil
}

func (p *pgRepo) RecordDesiredRevision(ctx context.Context, questID string) error {
	if p.discord == nil {
		return nil
	}
	return p.discord.RecordDesiredRevision(ctx, questID)
}

func (p *pgRepo) questRow(ctx context.Context, id string) (dbgen.GetQuestRow, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return dbgen.GetQuestRow{}, ErrNotFound
	}
	row, err := p.q.GetQuest(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbgen.GetQuestRow{}, ErrNotFound
		}
		return dbgen.GetQuestRow{}, err
	}
	return row, nil
}

func (p *pgRepo) internalMember(ctx context.Context, publicID string) (int64, error) {
	uid, err := db.ParseUUID(publicID)
	if err != nil {
		return 0, apierr.New(apierr.Invalid, "invalid member id")
	}
	id, err := p.q.MemberInternalID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, apierr.New(apierr.NotFound, "member not found")
		}
		return 0, err
	}
	return id, nil
}

func (p *pgRepo) internalCharacter(ctx context.Context, publicID string) (int64, error) {
	uid, err := db.ParseUUID(publicID)
	if err != nil {
		return 0, apierr.New(apierr.Invalid, "invalid character id")
	}
	id, err := p.q.CharacterInternalID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, apierr.New(apierr.NotFound, "character not found")
		}
		return 0, err
	}
	return id, nil
}

func (p *pgRepo) characterForOwner(ctx context.Context, characterPublicID, ownerPublicID string) (int64, error) {
	charUID, err := db.ParseUUID(characterPublicID)
	if err != nil {
		return 0, apierr.New(apierr.Invalid, "invalid character id")
	}
	ownerUID, err := db.ParseUUID(ownerPublicID)
	if err != nil {
		return 0, apierr.New(apierr.Invalid, "invalid member id")
	}
	id, err := p.q.CharacterInternalIDForOwner(ctx, dbgen.CharacterInternalIDForOwnerParams{
		PublicID: charUID,
		OwnerID:  ownerUID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if _, lookupErr := p.internalCharacter(ctx, characterPublicID); lookupErr != nil {
				return 0, lookupErr
			}
			return 0, ErrNotCharacterOwner
		}
		return 0, err
	}
	return id, nil
}

func (p *pgRepo) internalDocument(ctx context.Context, publicID string) (int64, error) {
	uid, err := db.ParseUUID(publicID)
	if err != nil {
		return 0, apierr.New(apierr.Invalid, "invalid document id")
	}
	id, err := p.q.DocumentInternalID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, apierr.New(apierr.NotFound, "document not found")
		}
		return 0, err
	}
	return id, nil
}

func mapQuestRow(row dbgen.GetQuestRow) Quest {
	var sched time.Time
	if row.ScheduledAt.Valid {
		sched = row.ScheduledAt.Time
	}
	return Quest{
		ID:          db.UUIDString(row.PublicID),
		DMID:        db.UUIDString(row.DmPublicID),
		Status:      Status(row.Status),
		ScheduledAt: sched,
		SlotsMax:    int(row.SlotsMax),
		FilledCount: int(row.FilledCount),
	}
}

// DiscordRevisionWriter bumps discord_desired_revision and enqueues the
// discord-lane job on the same queries, so a unit of work keeps both writes
// in one transaction.
type DiscordRevisionWriter struct {
	q    *dbgen.Queries
	jobs *jobs.Enqueuer
}

func NewDiscordRevisionWriter(q *dbgen.Queries, enqueuer *jobs.Enqueuer) *DiscordRevisionWriter {
	return &DiscordRevisionWriter{q: q, jobs: enqueuer}
}

func (w *DiscordRevisionWriter) RecordDesiredRevision(ctx context.Context, questID string) error {
	uid, err := db.ParseUUID(questID)
	if err != nil {
		return err
	}
	row, err := w.q.BumpQuestDiscordRevision(ctx, uid)
	if err != nil {
		return err
	}
	if w.jobs == nil {
		return nil
	}
	return w.jobs.EnqueueQuestDiscord(ctx, jobs.QuestDiscordPayload{
		ID:              row.ID,
		PublicID:        db.UUIDString(row.PublicID),
		DesiredRevision: int(row.DiscordDesiredRevision),
	})
}

type ReadModel struct {
	q *dbgen.Queries
}

func NewReadModel(q *dbgen.Queries) *ReadModel {
	return &ReadModel{q: q}
}

func (r *ReadModel) ByID(ctx context.Context, id string) (LegacyQuestView, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return LegacyQuestView{}, ErrNotFound
	}
	row, err := r.q.GetQuest(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LegacyQuestView{}, ErrNotFound
		}
		return LegacyQuestView{}, err
	}
	return mapQuestView(row), nil
}

func (r *ReadModel) ByShortCode(ctx context.Context, code string) (LegacyQuestView, error) {
	row, err := r.q.GetQuestByShortCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LegacyQuestView{}, ErrNotFound
		}
		return LegacyQuestView{}, err
	}
	return mapShortRow(row), nil
}

func (r *ReadModel) ListParticipants(ctx context.Context, questID string, status *string) ([]Participant, error) {
	repo := &pgRepo{q: r.q}
	return repo.ListParticipants(ctx, questID, status)
}

// ListOrder is internal to quest reads; it does not expose a public sort API.
type ListOrder uint8

const (
	OldestFirst ListOrder = iota
	NewestFirst
)

type ListFilter struct {
	Status, DisplayStatus      *string
	ScheduledFrom, ScheduledTo *time.Time
	Limit, Offset              int
	Order                      ListOrder
}

func (r *ReadModel) List(ctx context.Context, filter ListFilter) ([]LegacyQuestView, int64, error) {
	if r == nil || r.q == nil {
		return nil, 0, errors.New("quest read model is not configured")
	}
	if filter.Limit < math.MinInt32 || filter.Limit > math.MaxInt32 || filter.Offset < math.MinInt32 || filter.Offset > math.MaxInt32 {
		return nil, 0, errors.New("quest pagination exceeds database integer range")
	}
	if filter.Order != OldestFirst && filter.Order != NewestFirst {
		return nil, 0, errors.New("unknown quest list order")
	}
	machine, display, validStatus := questListStatuses(filter)
	if !validStatus {
		return []LegacyQuestView{}, 0, nil
	}
	var from, to pgtype.Timestamptz
	if filter.ScheduledFrom != nil {
		from = pgtype.Timestamptz{Time: *filter.ScheduledFrom, Valid: true}
	}
	if filter.ScheduledTo != nil {
		to = pgtype.Timestamptz{Time: *filter.ScheduledTo, Valid: true}
	}
	rows, err := r.q.ListQuests(ctx, dbgen.ListQuestsParams{
		MachineStatus: machine, DisplayStatus: display,
		ScheduledFrom: from, ScheduledTo: to,
		NewestFirst: filter.Order == NewestFirst,
		RowLimit:    int32(filter.Limit), RowOffset: int32(filter.Offset),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list quests: %w", err)
	}
	return mapQuestListRows(rows)
}

func questListStatuses(filter ListFilter) (pgtype.Text, pgtype.Text, bool) {
	var machine, display pgtype.Text
	if filter.Status != nil {
		status := strings.ToLower(*filter.Status)
		switch Status(status) {
		case Open, Full, Played, Closed, Cancelled:
			machine = pgtype.Text{String: status, Valid: true}
		default:
			return machine, display, false
		}
	}
	if filter.DisplayStatus != nil {
		display = pgtype.Text{String: strings.ToLower(*filter.DisplayStatus), Valid: true}
		// Legacy display filtering takes precedence, after machine validation.
		machine = pgtype.Text{}
	}
	return machine, display, true
}

func mapQuestListRows(rows []dbgen.ListQuestsRow) ([]LegacyQuestView, int64, error) {
	out := make([]LegacyQuestView, 0, len(rows))
	var total int64
	for _, row := range rows {
		total = row.Total
		// The count/page join yields one carrier when the page is empty.
		// Its defaults are never a quest or public identity.
		if row.HasItem {
			out = append(out, mapListRow(row))
		}
	}
	return out, total, nil
}

type LegacyQuestView struct {
	ID                     string
	ShortCode              string
	Status                 Status
	DisplayStatus          string
	DurationHours          float64
	DMID                   string
	ScheduledAt            time.Time
	SlotsMax               int
	FilledCount            int
	DocumentID             string
	DiscordDesiredRevision int
	DiscordAppliedRevision int
}

func questView(publicID, dmID, documentID pgtype.UUID, shortCode, status, displayStatus string, scheduled pgtype.Timestamptz, duration float64, filled, slots, desired, applied int32) LegacyQuestView {
	var at time.Time
	if scheduled.Valid {
		at = scheduled.Time
	}
	return LegacyQuestView{
		ID:                     db.UUIDString(publicID),
		ShortCode:              shortCode,
		Status:                 Status(status),
		DisplayStatus:          displayStatus,
		DurationHours:          duration,
		DMID:                   db.UUIDString(dmID),
		ScheduledAt:            at,
		SlotsMax:               int(slots),
		FilledCount:            int(filled),
		DocumentID:             db.UUIDString(documentID),
		DiscordDesiredRevision: int(desired),
		DiscordAppliedRevision: int(applied),
	}
}

func mapQuestView(row dbgen.GetQuestRow) LegacyQuestView {
	return questView(row.PublicID, row.DmPublicID, row.DocumentPublicID, row.ShortCode, row.Status, row.DisplayStatus, row.ScheduledAt, row.DurationHours, row.FilledCount, row.SlotsMax, row.DiscordDesiredRevision, row.DiscordAppliedRevision)
}

func mapShortRow(row dbgen.GetQuestByShortCodeRow) LegacyQuestView {
	return questView(row.PublicID, row.DmPublicID, row.DocumentPublicID, row.ShortCode, row.Status, row.DisplayStatus, row.ScheduledAt, row.DurationHours, row.FilledCount, row.SlotsMax, row.DiscordDesiredRevision, row.DiscordAppliedRevision)
}

func mapListRow(row dbgen.ListQuestsRow) LegacyQuestView {
	return questView(row.PublicID, row.DmPublicID, row.DocumentPublicID, row.ShortCode, row.Status, row.DisplayStatus, row.ScheduledAt, row.DurationHours, row.FilledCount, row.SlotsMax, row.DiscordDesiredRevision, row.DiscordAppliedRevision)
}

// Queries exposes quest reads to GraphQL.
type Queries struct {
	Read           *ReadModel
	ParticipantsFn func(ctx context.Context, questID string, status *string) ([]Participant, error)
}

func (q Queries) Get(ctx context.Context, id, shortCode *string) (LegacyQuestView, error) {
	if q.Read == nil {
		return LegacyQuestView{}, ErrNotFound
	}
	if id != nil && *id != "" {
		return q.Read.ByID(ctx, *id)
	}
	if shortCode != nil && *shortCode != "" {
		return q.Read.ByShortCode(ctx, *shortCode)
	}
	return LegacyQuestView{}, ErrNotFound
}

func (q Queries) List(ctx context.Context, filter ListFilter) ([]LegacyQuestView, int64, error) {
	return q.Read.List(ctx, filter)
}

func (q Queries) Participants(ctx context.Context, questID string, status *string) ([]Participant, error) {
	if q.ParticipantsFn == nil {
		return nil, nil
	}
	return q.ParticipantsFn(ctx, questID, status)
}
