package quest

import (
	"context"
	"errors"
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

func (r *ReadModel) ByID(ctx context.Context, id string) (QuestView, error) {
	uid, err := db.ParseUUID(id)
	if err != nil {
		return QuestView{}, ErrNotFound
	}
	row, err := r.q.GetQuest(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestView{}, ErrNotFound
		}
		return QuestView{}, err
	}
	return mapQuestView(row), nil
}

func (r *ReadModel) ByShortCode(ctx context.Context, code string) (QuestView, error) {
	row, err := r.q.GetQuestByShortCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestView{}, ErrNotFound
		}
		return QuestView{}, err
	}
	return mapShortRow(row), nil
}

func (r *ReadModel) ListParticipants(ctx context.Context, questID string, status *string) ([]Participant, error) {
	repo := &pgRepo{q: r.q}
	return repo.ListParticipants(ctx, questID, status)
}

func (r *ReadModel) List(ctx context.Context, status *string, limit, offset int) ([]QuestView, int64, error) {
	filter := ""
	if status != nil {
		filter = *status
	}
	rows, err := r.q.ListQuests(ctx, dbgen.ListQuestsParams{
		Status:    filter,
		RowLimit:  int32(limit),
		RowOffset: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}
	total, err := r.q.CountQuests(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	out := make([]QuestView, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapListRow(row))
	}
	return out, total, nil
}

type QuestView struct {
	ID                     string
	ShortCode              string
	Status                 Status
	DMID                   string
	ScheduledAt            time.Time
	SlotsMax               int
	FilledCount            int
	DocumentID             string
	DiscordDesiredRevision int
	DiscordAppliedRevision int
}

func questView(publicID, dmID, documentID pgtype.UUID, shortCode, status string, scheduled pgtype.Timestamptz, filled, slots, desired, applied int32) QuestView {
	var at time.Time
	if scheduled.Valid {
		at = scheduled.Time
	}
	return QuestView{
		ID:                     db.UUIDString(publicID),
		ShortCode:              shortCode,
		Status:                 Status(status),
		DMID:                   db.UUIDString(dmID),
		ScheduledAt:            at,
		SlotsMax:               int(slots),
		FilledCount:            int(filled),
		DocumentID:             db.UUIDString(documentID),
		DiscordDesiredRevision: int(desired),
		DiscordAppliedRevision: int(applied),
	}
}

func mapQuestView(row dbgen.GetQuestRow) QuestView {
	return questView(row.PublicID, row.DmPublicID, row.DocumentPublicID, row.ShortCode, row.Status, row.ScheduledAt, row.FilledCount, row.SlotsMax, row.DiscordDesiredRevision, row.DiscordAppliedRevision)
}

func mapShortRow(row dbgen.GetQuestByShortCodeRow) QuestView {
	return questView(row.PublicID, row.DmPublicID, row.DocumentPublicID, row.ShortCode, row.Status, row.ScheduledAt, row.FilledCount, row.SlotsMax, row.DiscordDesiredRevision, row.DiscordAppliedRevision)
}

func mapListRow(row dbgen.ListQuestsRow) QuestView {
	return questView(row.PublicID, row.DmPublicID, row.DocumentPublicID, row.ShortCode, row.Status, row.ScheduledAt, row.FilledCount, row.SlotsMax, row.DiscordDesiredRevision, row.DiscordAppliedRevision)
}

// Queries exposes quest reads to GraphQL.
type Queries struct {
	Read           *ReadModel
	ParticipantsFn func(ctx context.Context, questID string, status *string) ([]Participant, error)
}

func (q Queries) Get(ctx context.Context, id, shortCode *string) (QuestView, error) {
	if q.Read == nil {
		return QuestView{}, ErrNotFound
	}
	if id != nil && *id != "" {
		return q.Read.ByID(ctx, *id)
	}
	if shortCode != nil && *shortCode != "" {
		return q.Read.ByShortCode(ctx, *shortCode)
	}
	return QuestView{}, ErrNotFound
}

func (q Queries) List(ctx context.Context, status *string, limit, offset int) ([]QuestView, int64, error) {
	if q.Read == nil {
		return nil, 0, nil
	}
	return q.Read.List(ctx, status, limit, offset)
}

func (q Queries) Participants(ctx context.Context, questID string, status *string) ([]Participant, error) {
	if q.ParticipantsFn == nil {
		return nil, nil
	}
	return q.ParticipantsFn(ctx, questID, status)
}
