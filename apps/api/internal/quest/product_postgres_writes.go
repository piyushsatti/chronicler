package quest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/delivery"
	"github.com/piyushsatti/chronicler/apps/api/internal/document"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/jobs"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func (p *ProductPostgres) lockLiveQuest(ctx context.Context, questID string, asOf time.Time) (questRowState, error) {
	uid, err := questUUID(questID)
	if err != nil {
		return questRowState{}, err
	}
	row, err := p.queries().ProductQuestLockByID(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return questRowState{}, nil
	}
	if err != nil {
		return questRowState{}, err
	}
	if row.DeletedAt.Valid {
		return questRowState{Row: row}, nil
	}
	before, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &questID, AsOf: asOf})
	if err != nil {
		return questRowState{}, err
	}
	owner := ""
	if before != nil {
		owner = before.DmId
	}
	return questRowState{
		Exists:    before != nil,
		SubjectID: questID,
		OwnerID:   owner,
		Before:    before,
		Row:       row,
	}, nil
}

type questRowState struct {
	Exists    bool
	SubjectID string
	OwnerID   string
	Before    *QuestView
	Row       dbgen.Quest
}

func baseQuestState(locked questRowState) (exists bool, subject, owner string, updatedAt *time.Time, before *QuestView) {
	if locked.Row.UpdatedAt.Valid {
		t := locked.Row.UpdatedAt.Time
		updatedAt = &t
	}
	return locked.Exists, locked.SubjectID, locked.OwnerID, updatedAt, locked.Before
}

func (p *ProductPostgres) LockCreateQuest(context.Context, CreateQuestSpec) (CreateQuestState, error) {
	return CreateQuestState{}, nil
}

func (p *ProductPostgres) StoreCreateQuest(ctx context.Context, write CreateQuestWrite) (QuestView, error) {
	spec := write.ValidatedInput.Input
	if write.Locked.SubjectID == "" {
		return QuestView{}, apierr.New(apierr.Internal, "quest id required")
	}
	if write.RevisionID == nil || strings.TrimSpace(*write.RevisionID) == "" {
		return QuestView{}, apierr.New(apierr.Internal, "quest brief document required")
	}
	publicID, err := questUUID(write.Locked.SubjectID)
	if err != nil {
		return QuestView{}, err
	}
	docPublicID, err := questUUID(strings.TrimSpace(*write.RevisionID))
	if err != nil {
		return QuestView{}, err
	}
	documentID, err := p.queries().ProductQuestDocumentInternalID(ctx, docPublicID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestView{}, apierr.New(apierr.NotFound, "quest brief not found")
		}
		return QuestView{}, err
	}
	dmPublic := write.ActorID
	if spec.DmId != nil && strings.TrimSpace(*spec.DmId) != "" {
		dmPublic = strings.TrimSpace(*spec.DmId)
	}
	dmID, err := p.internalMember(ctx, dmPublic)
	if err != nil {
		return QuestView{}, err
	}
	createdBy, err := p.internalMember(ctx, write.ActorID)
	if err != nil {
		return QuestView{}, err
	}
	var arcID pgtype.Int8
	if spec.ArcId != nil && strings.TrimSpace(*spec.ArcId) != "" {
		arcPublic, err := questUUID(strings.TrimSpace(*spec.ArcId))
		if err != nil {
			return QuestView{}, err
		}
		internalArc, err := p.queries().ProductQuestArcInternalID(ctx, arcPublic)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return QuestView{}, apierr.New(apierr.NotFound, "quest arc not found")
			}
			return QuestView{}, err
		}
		arcID = pgtype.Int8{Int64: internalArc, Valid: true}
	}
	kinds := spec.Kinds
	if len(kinds) == 0 {
		kinds = []string{"standard"}
	}
	shortCode := "Q" + strings.ReplaceAll(write.Locked.SubjectID, "-", "")[:8]
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	var apl pgtype.Int4
	if spec.Apl != nil {
		apl = pgtype.Int4{Int32: *spec.Apl, Valid: true}
	}
	var signup pgtype.Text
	if spec.SignupType != nil {
		signup = pgtype.Text{String: *spec.SignupType, Valid: true}
	}
	inserted, err := p.queries().ProductQuestInsert(ctx, dbgen.ProductQuestInsertParams{
		PublicID:      publicID,
		ShortCode:     shortCode,
		Kinds:         kinds,
		DmID:          dmID,
		ArcID:         arcID,
		ScheduledAt:   pgtype.Timestamptz{Time: spec.ScheduledAt.UTC(), Valid: true},
		DurationHours: spec.DurationHours,
		SlotsMax:      spec.SlotsMax,
		DocumentID:    documentID,
		Tags:          spec.Tags,
		Genres:        spec.Genres,
		Apl:           apl,
		SignupType:    signup,
		CreatedBy:     createdBy,
		At:            at,
	})
	if err != nil {
		return QuestView{}, err
	}
	if len(spec.RegionIds) > 0 {
		regionUUIDs := make([]pgtype.UUID, 0, len(spec.RegionIds))
		for _, id := range spec.RegionIds {
			uid, err := questUUID(id)
			if err != nil {
				return QuestView{}, err
			}
			regionUUIDs = append(regionUUIDs, uid)
		}
		regionRows, err := p.queries().ProductQuestRegionInternalIDs(ctx, regionUUIDs)
		if err != nil {
			return QuestView{}, err
		}
		if len(regionRows) != len(regionUUIDs) {
			return QuestView{}, apierr.New(apierr.NotFound, "region not found")
		}
		regionIDs := make([]int64, len(regionRows))
		for i, row := range regionRows {
			regionIDs[i] = row.ID
		}
		if _, err := p.queries().ProductQuestInsertRegions(ctx, dbgen.ProductQuestInsertRegionsParams{
			QuestID:   inserted.ID,
			RegionIds: regionIDs,
		}); err != nil {
			return QuestView{}, err
		}
	}
	if err := p.enqueueQuestDiscord(ctx, inserted.ID, write.Locked.SubjectID, inserted.DiscordDesiredRevision); err != nil {
		return QuestView{}, err
	}
	view, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &write.Locked.SubjectID, AsOf: write.At})
	if err != nil {
		return QuestView{}, err
	}
	if view == nil {
		return QuestView{}, fmt.Errorf("quest missing after create")
	}
	return *view, nil
}

func (p *ProductPostgres) enqueueQuestDiscord(ctx context.Context, internalID int64, publicID string, desired int32) error {
	payload, err := json.Marshal(jobs.QuestDiscordPayload{
		ID:              internalID,
		PublicID:        publicID,
		DesiredRevision: int(desired),
	})
	if err != nil {
		return err
	}
	return p.queries().EnqueueJob(ctx, dbgen.EnqueueJobParams{
		JobKey:  jobs.QuestDiscordKey(publicID),
		Kind:    delivery.KindQuestDiscord,
		Lane:    "discord",
		Payload: payload,
	})
}

func (p *ProductPostgres) LockUpdateQuest(ctx context.Context, spec UpdateQuestSpec) (UpdateQuestState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.Id, spec.AsOf)
	if err != nil {
		return UpdateQuestState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	return UpdateQuestState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before}, nil
}

func (p *ProductPostgres) StoreUpdateQuest(ctx context.Context, write UpdateQuestWrite) (QuestView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	before := write.Locked.Before
	input := write.ValidatedInput.Input
	kinds, tags, genres := before.Kinds, before.Tags, before.Genres
	if input.Kinds.Set && input.Kinds.Value != nil {
		kinds = *input.Kinds.Value
	}
	if input.Tags.Set && input.Tags.Value != nil {
		tags = *input.Tags.Value
	}
	if input.Genres.Set && input.Genres.Value != nil {
		genres = *input.Genres.Value
	}
	scheduledAt := before.ScheduledAt
	if input.ScheduledAt.Set && input.ScheduledAt.Value != nil {
		scheduledAt = *input.ScheduledAt.Value
	}
	duration := before.DurationHours
	if input.DurationHours.Set && input.DurationHours.Value != nil {
		duration = *input.DurationHours.Value
	}
	slots := before.SlotsMax
	if input.SlotsMax.Set && input.SlotsMax.Value != nil {
		slots = *input.SlotsMax.Value
	}
	dmPublic := before.DmId
	if input.DmId.Set && input.DmId.Value != nil {
		dmPublic = *input.DmId.Value
	}
	dmID, err := p.internalMember(ctx, dmPublic)
	if err != nil {
		return QuestView{}, err
	}
	var arcID pgtype.Int8
	arcPublic := before.ArcId
	if input.ArcId.Set {
		arcPublic = input.ArcId.Value
	}
	if arcPublic != nil && strings.TrimSpace(*arcPublic) != "" {
		uid, err := questUUID(strings.TrimSpace(*arcPublic))
		if err != nil {
			return QuestView{}, err
		}
		internalArc, err := p.queries().ProductQuestArcInternalID(ctx, uid)
		if err != nil {
			return QuestView{}, err
		}
		arcID = pgtype.Int8{Int64: internalArc, Valid: true}
	}
	var apl pgtype.Int4
	if input.Apl.Set {
		if input.Apl.Value != nil {
			apl = pgtype.Int4{Int32: *input.Apl.Value, Valid: true}
		}
	} else if before.Apl != nil {
		apl = pgtype.Int4{Int32: *before.Apl, Valid: true}
	}
	var signup pgtype.Text
	if input.SignupType.Set {
		if input.SignupType.Value != nil {
			signup = pgtype.Text{String: *input.SignupType.Value, Valid: true}
		}
	} else if before.SignupType != nil {
		signup = pgtype.Text{String: *before.SignupType, Valid: true}
	}
	questID, err := questUUID(write.ValidatedInput.Id)
	if err != nil {
		return QuestView{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	updated, err := p.queries().ProductQuestUpdateMetadata(ctx, dbgen.ProductQuestUpdateMetadataParams{
		Kinds:             kinds,
		DmID:              dmID,
		ArcID:             arcID,
		ScheduledAt:       pgtype.Timestamptz{Time: scheduledAt.UTC(), Valid: true},
		DurationHours:     duration,
		SlotsMax:          slots,
		Tags:              tags,
		Genres:            genres,
		Apl:               apl,
		SignupType:        signup,
		At:                at,
		QuestID:           questID,
		ExpectedUpdatedAt: pgtype.Timestamptz{Time: input.ExpectedUpdatedAt.UTC(), Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestView{}, apierr.New(apierr.Conflict, "quest version conflict")
		}
		return QuestView{}, err
	}
	if input.RegionIds.Set {
		if err := p.queries().ProductQuestReplaceRegions(ctx, updated.ID); err != nil {
			return QuestView{}, err
		}
		regionValues := []string{}
		if input.RegionIds.Value != nil {
			regionValues = *input.RegionIds.Value
		}
		if len(regionValues) > 0 {
			regionUUIDs := make([]pgtype.UUID, 0, len(regionValues))
			for _, id := range regionValues {
				uid, err := questUUID(id)
				if err != nil {
					return QuestView{}, err
				}
				regionUUIDs = append(regionUUIDs, uid)
			}
			regionRows, err := p.queries().ProductQuestRegionInternalIDs(ctx, regionUUIDs)
			if err != nil {
				return QuestView{}, err
			}
			regionIDs := make([]int64, len(regionRows))
			for i, row := range regionRows {
				regionIDs[i] = row.ID
			}
			if _, err := p.queries().ProductQuestInsertRegions(ctx, dbgen.ProductQuestInsertRegionsParams{
				QuestID:   updated.ID,
				RegionIds: regionIDs,
			}); err != nil {
				return QuestView{}, err
			}
		}
	}
	bumped, err := p.queries().ProductQuestBumpDiscordDesired(ctx, dbgen.ProductQuestBumpDiscordDesiredParams{
		At: at, QuestID: questID,
	})
	if err != nil {
		return QuestView{}, err
	}
	if err := p.enqueueQuestDiscord(ctx, bumped.ID, write.ValidatedInput.Id, bumped.DiscordDesiredRevision); err != nil {
		return QuestView{}, err
	}
	view, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &write.ValidatedInput.Id, AsOf: write.At})
	if err != nil {
		return QuestView{}, err
	}
	if view == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	return *view, nil
}

func (p *ProductPostgres) LockTransitionQuestStatus(ctx context.Context, spec TransitionQuestStatusSpec) (TransitionQuestStatusState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.Id, spec.AsOf)
	if err != nil {
		return TransitionQuestStatusState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	return TransitionQuestStatusState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before}, nil
}

func (p *ProductPostgres) StoreTransitionQuestStatus(ctx context.Context, write TransitionQuestStatusWrite) (QuestView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	from := write.Locked.Before.Status
	to := write.ValidatedInput.To
	if err := validateQuestTransition(from, to); err != nil {
		return QuestView{}, err
	}
	questID, err := questUUID(write.ValidatedInput.Id)
	if err != nil {
		return QuestView{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	if _, err := p.queries().ProductQuestSetStatus(ctx, dbgen.ProductQuestSetStatusParams{
		Status: to, At: at, QuestID: questID,
	}); err != nil {
		return QuestView{}, err
	}
	bumped, err := p.queries().ProductQuestBumpDiscordDesired(ctx, dbgen.ProductQuestBumpDiscordDesiredParams{
		At: at, QuestID: questID,
	})
	if err != nil {
		return QuestView{}, err
	}
	if err := p.enqueueQuestDiscord(ctx, bumped.ID, write.ValidatedInput.Id, bumped.DiscordDesiredRevision); err != nil {
		return QuestView{}, err
	}
	view, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &write.ValidatedInput.Id, AsOf: write.At})
	if err != nil {
		return QuestView{}, err
	}
	if view == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	return *view, nil
}

func validateQuestTransition(from, to string) error {
	switch to {
	case "played":
		if from != "open" && from != "full" {
			return apierr.New(apierr.Conflict, "invalid quest status transition")
		}
	case "cancelled":
		if from != "open" && from != "full" {
			return apierr.New(apierr.Conflict, "invalid quest status transition")
		}
	case "closed":
		return apierr.New(apierr.Conflict, "use closeQuest for closed status")
	default:
		return apierr.New(apierr.Invalid, "invalid quest status")
	}
	return nil
}

func (p *ProductPostgres) LockCloseQuest(ctx context.Context, spec CloseQuestSpec) (CloseQuestState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.Id, spec.AsOf)
	if err != nil {
		return CloseQuestState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	state := CloseQuestState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before}
	if !exists {
		return state, nil
	}
	rows, err := p.queries().ProductQuestClosureRoster(ctx, mustUUID(spec.Id))
	if err != nil {
		return CloseQuestState{}, err
	}
	for _, row := range rows {
		state.Roster = append(state.Roster, QuestParticipantView{CharacterId: row.CharacterID, Status: row.Status})
	}
	return state, nil
}

func (p *ProductPostgres) StoreCloseQuest(ctx context.Context, write CloseQuestWrite) (QuestView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if write.Locked.Before.Status != "played" {
		return QuestView{}, apierr.New(apierr.Conflict, "quest must be played before close")
	}
	questID, err := questUUID(write.ValidatedInput.Id)
	if err != nil {
		return QuestView{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return QuestView{}, err
	}
	for _, entry := range write.ValidatedInput.Input.Attendance {
		character, err := p.queries().ProductQuestCharacterInternal(ctx, mustUUID(entry.CharacterId))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return QuestView{}, apierr.New(apierr.NotFound, "participant not found")
			}
			return QuestView{}, err
		}
		if _, err := p.queries().ProductQuestUpdateParticipant(ctx, dbgen.ProductQuestUpdateParticipantParams{
			Status: entry.Status, Manual: true, At: at, QuestID: lockedRow.ID, CharacterID: character.ID,
		}); err != nil {
			return QuestView{}, err
		}
	}
	if lockedRow.FilledCount > 0 {
		if _, err := p.queries().ProductQuestIncrementCapacity(ctx, dbgen.ProductQuestIncrementCapacityParams{
			Delta: -lockedRow.FilledCount, At: at, QuestID: lockedRow.ID,
		}); err != nil {
			return QuestView{}, err
		}
	}
	if _, err := p.queries().ProductQuestSetStatus(ctx, dbgen.ProductQuestSetStatusParams{
		Status: "closed", At: at, QuestID: questID,
	}); err != nil {
		return QuestView{}, err
	}
	bumped, err := p.queries().ProductQuestBumpDiscordDesired(ctx, dbgen.ProductQuestBumpDiscordDesiredParams{
		At: at, QuestID: questID,
	})
	if err != nil {
		return QuestView{}, err
	}
	if err := p.enqueueQuestDiscord(ctx, bumped.ID, write.ValidatedInput.Id, bumped.DiscordDesiredRevision); err != nil {
		return QuestView{}, err
	}
	view, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &write.ValidatedInput.Id, AsOf: write.At})
	if err != nil {
		return QuestView{}, err
	}
	if view == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	return *view, nil
}

func mustUUID(value string) pgtype.UUID {
	id, err := db.ParseUUID(value)
	if err != nil {
		return pgtype.UUID{}
	}
	return id
}

func (p *ProductPostgres) LockDeleteQuest(ctx context.Context, spec DeleteQuestSpec) (DeleteQuestState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.QuestId, spec.AsOf)
	if err != nil {
		return DeleteQuestState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	return DeleteQuestState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before}, nil
}

func (p *ProductPostgres) StoreDeleteQuest(ctx context.Context, write DeleteQuestWrite) (product.CommandReceipt, error) {
	if !write.Locked.Exists {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "quest not found")
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	actor, err := p.internalMember(ctx, write.ActorID)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	if _, err := p.queries().ProductQuestSetDeleted(ctx, dbgen.ProductQuestSetDeletedParams{
		DeletedAt: at, DeletedBy: actor, At: at, QuestID: questID,
	}); err != nil {
		return product.CommandReceipt{}, err
	}
	return product.CommandReceipt{}, nil
}

func (p *ProductPostgres) LockRestoreQuest(ctx context.Context, spec RestoreQuestSpec) (RestoreQuestState, error) {
	uid, err := questUUID(spec.QuestId)
	if err != nil {
		return RestoreQuestState{}, err
	}
	row, err := p.queries().ProductQuestLockByID(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return RestoreQuestState{}, nil
	}
	if err != nil {
		return RestoreQuestState{}, err
	}
	owner, err := p.queries().ProductQuestMemberPublicID(ctx, row.DmID)
	if err != nil {
		return RestoreQuestState{}, err
	}
	return RestoreQuestState{Exists: row.DeletedAt.Valid, SubjectID: spec.QuestId, OwnerID: db.UUIDString(owner)}, nil
}

func (p *ProductPostgres) StoreRestoreQuest(ctx context.Context, write RestoreQuestWrite) (QuestView, error) {
	if !write.Locked.Exists {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return QuestView{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	if _, err := p.queries().ProductQuestClearDeleted(ctx, dbgen.ProductQuestClearDeletedParams{
		At: at, QuestID: questID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
		}
		return QuestView{}, err
	}
	view, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &write.ValidatedInput.QuestId, AsOf: write.At})
	if err != nil {
		return QuestView{}, err
	}
	if view == nil {
		return QuestView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	return *view, nil
}

func (p *ProductPostgres) LockSignupForQuest(ctx context.Context, spec SignupForQuestSpec) (SignupForQuestState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.QuestId, spec.AsOf)
	if err != nil {
		return SignupForQuestState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	roster, err := p.readQuestRoster(ctx, spec.QuestId)
	if err != nil {
		return SignupForQuestState{}, err
	}
	return SignupForQuestState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before, Roster: roster}, nil
}

func (p *ProductPostgres) StoreSignupForQuest(ctx context.Context, write SignupForQuestWrite) (QuestParticipantView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return QuestParticipantView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if write.Locked.Character == nil || write.Locked.Character.OwnerID != write.ActorID {
		return QuestParticipantView{}, apierr.New(apierr.Forbidden, "character owner required")
	}
	if !eligibleQuestCharacter(*write.Locked.Character) {
		return QuestParticipantView{}, apierr.New(apierr.Conflict, "active approved character required")
	}
	previous := questParticipant(write.Locked.Roster, write.ValidatedInput.CharacterId)
	if previous != nil && previous.Status != "withdrawn" {
		return QuestParticipantView{}, apierr.New(apierr.Conflict, "already signed up for this quest")
	}
	status := write.Locked.Before.Status
	if status != "open" && status != "full" {
		return QuestParticipantView{}, apierr.New(apierr.Conflict, "quest not accepting signups")
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return QuestParticipantView{}, err
	}
	character, err := p.queries().ProductQuestCharacterInternal(ctx, mustUUID(write.ValidatedInput.CharacterId))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestParticipantView{}, apierr.New(apierr.NotFound, "character not found")
		}
		return QuestParticipantView{}, err
	}
	memberID, err := p.internalMember(ctx, db.UUIDString(character.OwnerPublicID))
	if err != nil {
		return QuestParticipantView{}, err
	}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return QuestParticipantView{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	participantStatus := "signed_up"
	if lockedRow.FilledCount >= lockedRow.SlotsMax || status == "full" {
		participantStatus = "waitlisted"
	}
	if previous != nil {
		if _, err := p.queries().ProductQuestRejoinParticipant(ctx, dbgen.ProductQuestRejoinParticipantParams{QuestID: lockedRow.ID, CharacterID: character.ID, Status: participantStatus, At: at}); err != nil {
			return QuestParticipantView{}, err
		}
	} else if _, err := p.queries().ProductQuestInsertParticipant(ctx, dbgen.ProductQuestInsertParticipantParams{
		QuestID: lockedRow.ID, MemberID: memberID, CharacterID: character.ID,
		Status: participantStatus, Manual: false, At: at,
	}); err != nil {
		return QuestParticipantView{}, err
	}
	if participantStatus == "signed_up" {
		if _, err := p.queries().ProductQuestIncrementCapacity(ctx, dbgen.ProductQuestIncrementCapacityParams{
			Delta: 1, At: at, QuestID: lockedRow.ID,
		}); err != nil {
			return QuestParticipantView{}, err
		}
	}
	bumped, err := p.queries().ProductQuestBumpDiscordDesired(ctx, dbgen.ProductQuestBumpDiscordDesiredParams{
		At: at, QuestID: questID,
	})
	if err != nil {
		return QuestParticipantView{}, err
	}
	if err := p.enqueueQuestDiscord(ctx, bumped.ID, write.ValidatedInput.QuestId, bumped.DiscordDesiredRevision); err != nil {
		return QuestParticipantView{}, err
	}
	return QuestParticipantView{
		QuestId:     write.ValidatedInput.QuestId,
		MemberId:    db.UUIDString(character.OwnerPublicID),
		CharacterId: write.ValidatedInput.CharacterId,
		Status:      participantStatus,
		CreatedAt:   write.At.UTC(),
		UpdatedAt:   write.At.UTC(),
	}, nil
}

func (p *ProductPostgres) LockWithdrawFromQuest(ctx context.Context, spec WithdrawFromQuestSpec) (WithdrawFromQuestState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.QuestId, spec.AsOf)
	if err != nil {
		return WithdrawFromQuestState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	if _, err := p.queries().ProductQuestClosureRoster(ctx, mustUUID(spec.QuestId)); err != nil {
		return WithdrawFromQuestState{}, err
	}
	roster, err := p.readQuestRoster(ctx, spec.QuestId)
	if err != nil {
		return WithdrawFromQuestState{}, err
	}
	return WithdrawFromQuestState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before, Roster: roster}, nil
}

func (p *ProductPostgres) StoreWithdrawFromQuest(ctx context.Context, write WithdrawFromQuestWrite) (QuestParticipantView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return QuestParticipantView{}, apierr.New(apierr.NotFound, "quest not found")
	}
	if write.Locked.Character == nil || write.Locked.Character.OwnerID != write.ActorID {
		return QuestParticipantView{}, apierr.New(apierr.Forbidden, "character owner required")
	}
	if write.Locked.Before.Status != "open" && write.Locked.Before.Status != "full" {
		return QuestParticipantView{}, apierr.New(apierr.Conflict, "quest is not accepting withdrawals")
	}
	previous := questParticipant(write.Locked.Roster, write.ValidatedInput.CharacterId)
	if previous == nil {
		return QuestParticipantView{}, apierr.New(apierr.NotFound, "participant not found")
	}
	if previous.Status == "withdrawn" {
		return *previous, nil
	}
	if previous.Status != "signed_up" && previous.Status != "waitlisted" {
		return QuestParticipantView{}, apierr.New(apierr.Conflict, "participation is already final")
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return QuestParticipantView{}, err
	}
	character, err := p.queries().ProductQuestCharacterInternal(ctx, mustUUID(write.ValidatedInput.CharacterId))
	if errors.Is(err, pgx.ErrNoRows) {
		return QuestParticipantView{}, apierr.New(apierr.NotFound, "character not found")
	}
	if err != nil {
		return QuestParticipantView{}, err
	}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return QuestParticipantView{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	updated, err := p.queries().ProductQuestUpdateParticipant(ctx, dbgen.ProductQuestUpdateParticipantParams{
		Status: "withdrawn", Manual: false, At: at, QuestID: lockedRow.ID, CharacterID: character.ID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestParticipantView{}, apierr.New(apierr.NotFound, "participant not found")
		}
		return QuestParticipantView{}, err
	}
	_ = updated
	if previous.Status == "signed_up" {
		if _, err := p.queries().ProductQuestIncrementCapacity(ctx, dbgen.ProductQuestIncrementCapacityParams{
			Delta: -1, At: at, QuestID: lockedRow.ID,
		}); err != nil {
			return QuestParticipantView{}, err
		}
	}
	bumped, err := p.queries().ProductQuestBumpDiscordDesired(ctx, dbgen.ProductQuestBumpDiscordDesiredParams{At: at, QuestID: questID})
	if err != nil {
		return QuestParticipantView{}, err
	}
	if err := p.enqueueQuestDiscord(ctx, bumped.ID, write.ValidatedInput.QuestId, bumped.DiscordDesiredRevision); err != nil {
		return QuestParticipantView{}, err
	}
	result := *previous
	result.Status = "withdrawn"
	result.Manual = false
	result.UpdatedAt = write.At.UTC()
	return result, nil
}

func (p *ProductPostgres) LockSelectQuestParticipants(ctx context.Context, spec SelectQuestParticipantsSpec) (SelectQuestParticipantsState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.QuestId, spec.AsOf)
	if err != nil {
		return SelectQuestParticipantsState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	if _, err := p.queries().ProductQuestClosureRoster(ctx, mustUUID(spec.QuestId)); err != nil {
		return SelectQuestParticipantsState{}, err
	}
	roster, err := p.readQuestRoster(ctx, spec.QuestId)
	if err != nil {
		return SelectQuestParticipantsState{}, err
	}
	return SelectQuestParticipantsState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before, Roster: roster}, nil
}

func (p *ProductPostgres) StoreSelectQuestParticipants(ctx context.Context, write SelectQuestParticipantsWrite) ([]QuestParticipantView, error) {
	if !write.Locked.Exists {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	ids := write.ValidatedInput.CharacterIds
	if err := validateQuestSelection(write.Locked, ids); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []QuestParticipantView{}, nil
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return nil, err
	}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return nil, err
	}
	if int32(len(ids)) > lockedRow.SlotsMax-lockedRow.FilledCount {
		return nil, apierr.New(apierr.Conflict, "quest capacity exceeded")
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	if _, err := p.queries().ProductQuestIncrementCapacity(ctx, dbgen.ProductQuestIncrementCapacityParams{Delta: int32(len(ids)), At: at, QuestID: lockedRow.ID}); err != nil {
		return nil, err
	}
	characterIDs := make([]pgtype.UUID, 0, len(ids))
	for _, id := range ids {
		characterIDs = append(characterIDs, mustUUID(id))
	}
	rows, err := p.queries().ProductQuestPromoteParticipants(ctx, dbgen.ProductQuestPromoteParticipantsParams{QuestID: questID, CharacterIds: characterIDs, At: at})
	if err != nil {
		return nil, err
	}
	if len(rows) != len(ids) {
		return nil, apierr.New(apierr.Conflict, "selected participation changed")
	}
	selected := make(map[string]QuestParticipantView, len(rows))
	for _, row := range rows {
		id := db.UUIDString(row.CharacterID)
		selected[id] = QuestParticipantView{QuestId: db.UUIDString(row.QuestID), CharacterId: id, MemberId: db.UUIDString(row.MemberID), CharacterName: row.CharacterName, MemberHandle: row.MemberHandle, MemberDisplayName: row.MemberDisplayName, MemberAvatarUrl: textPtr(row.MemberAvatarUrl), Status: row.Status, Manual: row.Manual, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}
	}
	result := make([]QuestParticipantView, 0, len(ids))
	for _, id := range ids {
		result = append(result, selected[id])
	}
	return result, nil
}

func (p *ProductPostgres) LockAttestQuestParticipation(ctx context.Context, spec AttestQuestParticipationSpec) (AttestQuestParticipationState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.QuestId, spec.AsOf)
	if err != nil {
		return AttestQuestParticipationState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	return AttestQuestParticipationState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before}, nil
}

func (p *ProductPostgres) StoreAttestQuestParticipation(ctx context.Context, write AttestQuestParticipationWrite) ([]QuestParticipantView, error) {
	if !write.Locked.Exists {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return nil, err
	}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return nil, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	out := make([]QuestParticipantView, 0, len(write.ValidatedInput.Entries))
	for _, entry := range write.ValidatedInput.Entries {
		if entry.Status != "played" && entry.Status != "no_show" {
			return nil, apierr.New(apierr.Invalid, "invalid attestation status")
		}
		character, err := p.queries().ProductQuestCharacterInternal(ctx, mustUUID(entry.CharacterId))
		if err != nil {
			return nil, apierr.New(apierr.NotFound, "participant not found")
		}
		if _, err := p.queries().ProductQuestUpdateParticipant(ctx, dbgen.ProductQuestUpdateParticipantParams{
			Status: entry.Status, Manual: true, At: at, QuestID: lockedRow.ID, CharacterID: character.ID,
		}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, apierr.New(apierr.NotFound, "participant not found")
			}
			return nil, err
		}
		out = append(out, QuestParticipantView{
			QuestId:     write.ValidatedInput.QuestId,
			MemberId:    db.UUIDString(character.OwnerPublicID),
			CharacterId: entry.CharacterId,
			Status:      entry.Status,
			Manual:      true,
			UpdatedAt:   write.At.UTC(),
		})
	}
	return out, nil
}

func (p *ProductPostgres) LockSetQuestHexes(ctx context.Context, spec SetQuestHexesSpec) (SetQuestHexesState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.QuestId, spec.AsOf)
	if err != nil {
		return SetQuestHexesState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	return SetQuestHexesState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before}, nil
}

func (p *ProductPostgres) StoreSetQuestHexes(ctx context.Context, write SetQuestHexesWrite) ([]QuestHexView, error) {
	if !write.Locked.Exists {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if len(write.ValidatedInput.Hexes) > 100 {
		return nil, apierr.New(apierr.Invalid, "pointcrawl link limit exceeded")
	}
	seen := map[string]bool{}
	nodeUUIDs := make([]pgtype.UUID, 0, len(write.ValidatedInput.Hexes))
	roles := make([]string, 0, len(write.ValidatedInput.Hexes))
	for _, link := range write.ValidatedInput.Hexes {
		key := strings.TrimSpace(link.HexId) + "\x00" + strings.TrimSpace(link.Role)
		if seen[key] {
			return nil, apierr.New(apierr.Invalid, "duplicate pointcrawl link")
		}
		seen[key] = true
		uid, err := questUUID(link.HexId)
		if err != nil {
			return nil, err
		}
		nodeUUIDs = append(nodeUUIDs, uid)
		roles = append(roles, link.Role)
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return nil, err
	}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return nil, err
	}
	if err := p.queries().ProductQuestReplacePointcrawlLinks(ctx, lockedRow.ID); err != nil {
		return nil, err
	}
	if len(nodeUUIDs) > 0 {
		nodes, err := p.queries().ProductQuestNodeInternalIDs(ctx, nodeUUIDs)
		if err != nil {
			return nil, err
		}
		if len(nodes) != len(nodeUUIDs) {
			return nil, apierr.New(apierr.NotFound, "pointcrawl node not found")
		}
		nodeIDs := make([]int64, len(nodes))
		for i, node := range nodes {
			nodeIDs[i] = node.ID
		}
		if _, err := p.queries().ProductQuestInsertPointcrawlLinks(ctx, dbgen.ProductQuestInsertPointcrawlLinksParams{
			QuestID: lockedRow.ID, NodeIds: nodeIDs, Roles: roles,
		}); err != nil {
			return nil, err
		}
	}
	rows, err := p.queries().ProductQuestReadPointcrawlLinks(ctx, questID)
	if err != nil {
		return nil, err
	}
	out := make([]QuestHexView, 0, len(rows))
	for _, row := range rows {
		out = append(out, QuestHexView{HexId: row.NodeID, QuestId: row.QuestID, Role: row.Role})
	}
	return out, nil
}

func (p *ProductPostgres) LockSyncQuestDiscord(ctx context.Context, spec SyncQuestDiscordSpec) (SyncQuestDiscordState, error) {
	locked, err := p.lockLiveQuest(ctx, spec.QuestId, spec.AsOf)
	if err != nil {
		return SyncQuestDiscordState{}, err
	}
	exists, subject, owner, updatedAt, before := baseQuestState(locked)
	return SyncQuestDiscordState{Exists: exists, SubjectID: subject, OwnerID: owner, UpdatedAt: updatedAt, Before: before}, nil
}

func (p *ProductPostgres) StoreSyncQuestDiscord(ctx context.Context, write SyncQuestDiscordWrite) (DeliveryReceipt, error) {
	if !write.Locked.Exists {
		return DeliveryReceipt{}, apierr.New(apierr.NotFound, "quest not found")
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return DeliveryReceipt{}, err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	bumped, err := p.queries().ProductQuestBumpDiscordDesired(ctx, dbgen.ProductQuestBumpDiscordDesiredParams{
		At: at, QuestID: questID,
	})
	if err != nil {
		return DeliveryReceipt{}, err
	}
	if err := p.enqueueQuestDiscord(ctx, bumped.ID, write.ValidatedInput.QuestId, bumped.DiscordDesiredRevision); err != nil {
		return DeliveryReceipt{}, err
	}
	jobID, err := p.queries().ProductQuestQueuedJobID(ctx, jobs.QuestDiscordKey(write.ValidatedInput.QuestId))
	if err != nil {
		return DeliveryReceipt{}, err
	}
	return DeliveryReceipt{
		JobId:           db.UUIDString(jobID),
		DesiredRevision: bumped.DiscordDesiredRevision,
		AppliedRevision: bumped.DiscordAppliedRevision,
		DeliveryStatus:  "queued",
	}, nil
}

func (p *ProductPostgres) LockUpsertQuestSummary(ctx context.Context, spec UpsertQuestSummarySpec) (UpsertQuestSummaryState, error) {
	if len(spec.Input.QuestIds) == 0 {
		return UpsertQuestSummaryState{}, apierr.New(apierr.Invalid, "quest ids required")
	}
	// Document owns the sorted union of requested and retained linked Quest locks.
	return UpsertQuestSummaryState{SubjectID: strings.TrimSpace(spec.Input.QuestIds[0])}, nil
}

func (p *ProductPostgres) StoreUpsertQuestSummary(ctx context.Context, write UpsertQuestSummaryWrite) (document.DocumentView, error) {
	if write.ValidatedInput.Input.DocumentId == nil || strings.TrimSpace(*write.ValidatedInput.Input.DocumentId) == "" {
		return document.DocumentView{}, apierr.New(apierr.Internal, "summary document id required")
	}
	return document.DocumentView{
		Id:          strings.TrimSpace(*write.ValidatedInput.Input.DocumentId),
		Kind:        "summary",
		Title:       write.ValidatedInput.Input.Title,
		Status:      "draft",
		Visibility:  write.ValidatedInput.Input.Visibility,
		Frontmatter: write.ValidatedInput.Input.Frontmatter,
		UpdatedAt:   write.At.UTC(),
	}, nil
}
