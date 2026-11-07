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
	refs, err := p.resolveCreateQuestReferences(ctx, write)
	if err != nil {
		return QuestView{}, err
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
	voice, err := p.voiceChannelValue(ctx, spec.VoiceChannelId, nil)
	if err != nil {
		return QuestView{}, err
	}
	inserted, err := p.queries().ProductQuestInsert(ctx, dbgen.ProductQuestInsertParams{
		VoiceChannelID: voice,
		PublicID:       refs.PublicID,
		ShortCode:      shortCode,
		Kinds:          kinds,
		DmID:           refs.DMID,
		ArcID:          refs.ArcID,
		ScheduledAt:    pgtype.Timestamptz{Time: spec.ScheduledAt.UTC(), Valid: true},
		DurationHours:  spec.DurationHours,
		SlotsMax:       spec.SlotsMax,
		DocumentID:     refs.DocumentID,
		Tags:           spec.Tags,
		Genres:         spec.Genres,
		Apl:            apl,
		SignupType:     signup,
		CreatedBy:      refs.CreatedBy,
		At:             at,
	})
	if err != nil {
		return QuestView{}, err
	}
	if err := p.insertQuestRegions(ctx, inserted.ID, spec.RegionIds); err != nil {
		return QuestView{}, err
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

type questCreateReferences struct {
	PublicID                    pgtype.UUID
	DocumentID, DMID, CreatedBy int64
	ArcID                       pgtype.Int8
}

func (p *ProductPostgres) resolveCreateQuestReferences(ctx context.Context, write CreateQuestWrite) (questCreateReferences, error) {
	var refs questCreateReferences
	var err error
	refs.PublicID, err = questUUID(write.Locked.SubjectID)
	if err != nil {
		return refs, err
	}
	docID, err := questUUID(strings.TrimSpace(*write.RevisionID))
	if err != nil {
		return refs, err
	}
	refs.DocumentID, err = p.queries().ProductQuestDocumentInternalID(ctx, docID)
	if errors.Is(err, pgx.ErrNoRows) {
		return refs, apierr.New(apierr.NotFound, "quest brief not found")
	}
	if err != nil {
		return refs, err
	}
	dmPublic := write.ActorID
	if write.ValidatedInput.Input.DmId != nil && strings.TrimSpace(*write.ValidatedInput.Input.DmId) != "" {
		dmPublic = strings.TrimSpace(*write.ValidatedInput.Input.DmId)
	}
	refs.DMID, err = p.internalMember(ctx, dmPublic)
	if err != nil {
		return refs, err
	}
	refs.CreatedBy, err = p.internalMember(ctx, write.ActorID)
	if err != nil {
		return refs, err
	}
	refs.ArcID, err = p.internalQuestArcID(ctx, write.ValidatedInput.Input.ArcId)
	return refs, err
}

// voiceChannelValue checks a DM's voice channel pick against the admin list
// (site_settings discord_voice_channels). Clearing is always allowed, and so is
// keeping the value the quest already has, even if an admin has since removed
// it from the list.
func (p *ProductPostgres) voiceChannelValue(ctx context.Context, picked, current *string) (pgtype.Text, error) {
	if picked == nil || strings.TrimSpace(*picked) == "" {
		return pgtype.Text{}, nil
	}
	id := strings.TrimSpace(*picked)
	if current != nil && *current == id {
		return pgtype.Text{String: id, Valid: true}, nil
	}
	if !delivery.ValidSnowflake(id) {
		return pgtype.Text{}, apierr.New(apierr.Invalid, "voice channel must come from the Discord voice channel list")
	}
	payload, err := p.queries().DeliverySettingPayload(ctx, delivery.SettingVoiceChannels)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return pgtype.Text{}, err
	}
	for _, channel := range delivery.ParseVoiceChannels(payload) {
		if channel.ChannelID == id {
			return pgtype.Text{String: id, Valid: true}, nil
		}
	}
	return pgtype.Text{}, apierr.New(apierr.Invalid, "voice channel is not in the Discord voice channel list; ask an admin to add it")
}

func (p *ProductPostgres) internalQuestArcID(ctx context.Context, publicID *string) (pgtype.Int8, error) {
	if publicID == nil || strings.TrimSpace(*publicID) == "" {
		return pgtype.Int8{}, nil
	}
	id, err := questUUID(strings.TrimSpace(*publicID))
	if err != nil {
		return pgtype.Int8{}, err
	}
	internalID, err := p.queries().ProductQuestArcInternalID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return pgtype.Int8{}, apierr.New(apierr.NotFound, "quest arc not found")
	}
	if err != nil {
		return pgtype.Int8{}, err
	}
	return pgtype.Int8{Int64: internalID, Valid: true}, nil
}

func (p *ProductPostgres) insertQuestRegions(ctx context.Context, questID int64, regionIDs []string) error {
	if len(regionIDs) == 0 {
		return nil
	}
	uuids := make([]pgtype.UUID, 0, len(regionIDs))
	for _, id := range regionIDs {
		uid, err := questUUID(id)
		if err != nil {
			return err
		}
		uuids = append(uuids, uid)
	}
	rows, err := p.queries().ProductQuestRegionInternalIDs(ctx, uuids)
	if err != nil {
		return err
	}
	if len(rows) != len(uuids) {
		return apierr.New(apierr.NotFound, "region not found")
	}
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	_, err = p.queries().ProductQuestInsertRegions(ctx, dbgen.ProductQuestInsertRegionsParams{QuestID: questID, RegionIds: ids})
	return err
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
	input := write.ValidatedInput.Input
	values := mergeQuestUpdateValues(*write.Locked.Before, input)
	dmID, err := p.internalMember(ctx, values.dmPublic)
	if err != nil {
		return QuestView{}, err
	}
	arcID, err := p.internalQuestArcID(ctx, values.arcPublic)
	if err != nil {
		return QuestView{}, err
	}
	questID, err := questUUID(write.ValidatedInput.Id)
	if err != nil {
		return QuestView{}, err
	}
	voice := pgtype.Text{}
	if before := write.Locked.Before.VoiceChannelId; before != nil {
		voice = pgtype.Text{String: *before, Valid: true}
	}
	if input.VoiceChannelId.Set {
		voice, err = p.voiceChannelValue(ctx, input.VoiceChannelId.Value, write.Locked.Before.VoiceChannelId)
		if err != nil {
			return QuestView{}, err
		}
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	updated, err := p.queries().ProductQuestUpdateMetadata(ctx, dbgen.ProductQuestUpdateMetadataParams{
		VoiceChannelID:    voice,
		Kinds:             values.kinds,
		DmID:              dmID,
		ArcID:             arcID,
		ScheduledAt:       pgtype.Timestamptz{Time: values.scheduledAt.UTC(), Valid: true},
		DurationHours:     values.duration,
		SlotsMax:          values.slots,
		Tags:              values.tags,
		Genres:            values.genres,
		Apl:               values.apl,
		SignupType:        values.signup,
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
	if err := p.replaceQuestRegions(ctx, updated.ID, input.RegionIds); err != nil {
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
	return p.readUpdatedQuest(ctx, write.ValidatedInput.Id, write.At)
}

type questUpdateValues struct {
	kinds, tags, genres []string
	dmPublic            string
	arcPublic           *string
	scheduledAt         time.Time
	duration            float64
	slots               int32
	apl                 pgtype.Int4
	signup              pgtype.Text
}

func mergeQuestUpdateValues(before QuestView, input QuestEditFields) questUpdateValues {
	values := questUpdateValues{kinds: before.Kinds, tags: before.Tags, genres: before.Genres, dmPublic: before.DmId,
		arcPublic: before.ArcId, scheduledAt: before.ScheduledAt, duration: before.DurationHours, slots: before.SlotsMax}
	mergeQuestUpdateLists(&values, input)
	mergeQuestUpdateSchedule(&values, input)
	values.apl, values.signup = mergeQuestUpdateFlags(before, input)
	return values
}

func mergeQuestUpdateLists(values *questUpdateValues, input QuestEditFields) {
	if input.Kinds.Set && input.Kinds.Value != nil {
		values.kinds = *input.Kinds.Value
	}
	if input.Tags.Set && input.Tags.Value != nil {
		values.tags = *input.Tags.Value
	}
	if input.Genres.Set && input.Genres.Value != nil {
		values.genres = *input.Genres.Value
	}
	if input.DmId.Set && input.DmId.Value != nil {
		values.dmPublic = *input.DmId.Value
	}
	if input.ArcId.Set {
		values.arcPublic = input.ArcId.Value
	}
}

func mergeQuestUpdateSchedule(values *questUpdateValues, input QuestEditFields) {
	if input.ScheduledAt.Set && input.ScheduledAt.Value != nil {
		values.scheduledAt = *input.ScheduledAt.Value
	}
	if input.DurationHours.Set && input.DurationHours.Value != nil {
		values.duration = *input.DurationHours.Value
	}
	if input.SlotsMax.Set && input.SlotsMax.Value != nil {
		values.slots = *input.SlotsMax.Value
	}
}

func mergeQuestUpdateFlags(before QuestView, input QuestEditFields) (pgtype.Int4, pgtype.Text) {
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
	return apl, signup
}

func (p *ProductPostgres) replaceQuestRegions(ctx context.Context, questID int64, input product.Optional[[]string]) error {
	if !input.Set {
		return nil
	}
	if err := p.queries().ProductQuestReplaceRegions(ctx, questID); err != nil {
		return err
	}
	if input.Value == nil || len(*input.Value) == 0 {
		return nil
	}
	uuids := make([]pgtype.UUID, 0, len(*input.Value))
	for _, id := range *input.Value {
		uid, err := questUUID(id)
		if err != nil {
			return err
		}
		uuids = append(uuids, uid)
	}
	rows, err := p.queries().ProductQuestRegionInternalIDs(ctx, uuids)
	if err != nil {
		return err
	}
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	_, err = p.queries().ProductQuestInsertRegions(ctx, dbgen.ProductQuestInsertRegionsParams{QuestID: questID, RegionIds: ids})
	return err
}

func (p *ProductPostgres) readUpdatedQuest(ctx context.Context, id string, at time.Time) (QuestView, error) {
	view, err := p.ReadQuest(ctx, auth.Authority{}, QuestSpec{Id: &id, AsOf: at})
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
	if err := p.recordQuestAttendance(ctx, write.ValidatedInput.Input.Attendance, lockedRow.ID, at); err != nil {
		return QuestView{}, err
	}
	if lockedRow.FilledCount > 0 {
		if _, err := p.queries().ProductQuestIncrementCapacity(ctx, dbgen.ProductQuestIncrementCapacityParams{
			Delta: -lockedRow.FilledCount, QuestID: lockedRow.ID,
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

func (p *ProductPostgres) recordQuestAttendance(ctx context.Context, entries []ParticipationAttestationFields, questID int64, at pgtype.Timestamptz) error {
	for _, entry := range entries {
		character, err := p.queries().ProductQuestCharacterInternal(ctx, mustUUID(entry.CharacterId))
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.New(apierr.NotFound, "participant not found")
		}
		if err != nil {
			return err
		}
		if _, err := p.queries().ProductQuestUpdateParticipant(ctx, dbgen.ProductQuestUpdateParticipantParams{
			Status: entry.Status, Manual: true, At: at, QuestID: questID, CharacterID: character.ID,
		}); err != nil {
			return err
		}
	}
	return nil
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
	bumped, err := p.queries().ProductQuestBumpDiscordDesired(ctx, dbgen.ProductQuestBumpDiscordDesiredParams{
		QuestID: questID, At: at,
	})
	if err != nil {
		return product.CommandReceipt{}, err
	}
	if _, err := p.queries().ProductQuestSetDeleted(ctx, dbgen.ProductQuestSetDeletedParams{
		DeletedAt: at, DeletedBy: actor, At: at, QuestID: questID,
	}); err != nil {
		return product.CommandReceipt{}, err
	}
	if err := p.enqueueQuestDiscord(ctx, bumped.ID, write.ValidatedInput.QuestId, bumped.DiscordDesiredRevision); err != nil {
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

func (p *ProductPostgres) StoreSignupForQuest(ctx context.Context, write SignupForQuestWrite) (QuestParticipantView, string, error) {
	previous, err := validateQuestSignup(write)
	if err != nil {
		return QuestParticipantView{}, "", err
	}
	return p.storeQuestSignup(ctx, write, previous)
}

func (p *ProductPostgres) storeQuestSignup(ctx context.Context, write SignupForQuestWrite, previous *QuestParticipantView) (QuestParticipantView, string, error) {
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return QuestParticipantView{}, "", err
	}
	character, err := p.queries().ProductQuestCharacterInternal(ctx, mustUUID(write.ValidatedInput.CharacterId))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return QuestParticipantView{}, "", apierr.New(apierr.NotFound, "character not found")
		}
		return QuestParticipantView{}, "", err
	}
	memberID, err := p.internalMember(ctx, db.UUIDString(character.OwnerPublicID))
	if err != nil {
		return QuestParticipantView{}, "", err
	}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return QuestParticipantView{}, "", err
	}
	at := pgtype.Timestamptz{Time: write.At.UTC(), Valid: true}
	participantStatus := placeQuestSignup()
	if err := p.insertOrRejoinQuestParticipant(ctx, dbgen.ProductQuestInsertParticipantParams{
		QuestID: lockedRow.ID, MemberID: memberID, CharacterID: character.ID,
		Status: participantStatus, Manual: false, At: at,
	}, previous != nil); err != nil {
		return QuestParticipantView{}, "", err
	}
	// Signup never takes a seat, never bumps one, and never touches Discord.
	return QuestParticipantView{
		QuestId:     write.ValidatedInput.QuestId,
		MemberId:    db.UUIDString(character.OwnerPublicID),
		CharacterId: write.ValidatedInput.CharacterId,
		Status:      participantStatus,
		CreatedAt:   write.At.UTC(),
		UpdatedAt:   write.At.UTC(),
	}, "", nil
}

func (p *ProductPostgres) insertOrRejoinQuestParticipant(ctx context.Context, params dbgen.ProductQuestInsertParticipantParams, rejoining bool) error {
	if rejoining {
		_, err := p.queries().ProductQuestRejoinParticipant(ctx, dbgen.ProductQuestRejoinParticipantParams{
			QuestID: params.QuestID, CharacterID: params.CharacterID, Status: params.Status, At: params.At,
		})
		return err
	}
	_, err := p.queries().ProductQuestInsertParticipant(ctx, params)
	return err
}

func validateQuestSignup(write SignupForQuestWrite) (*QuestParticipantView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if write.Locked.Character == nil || write.Locked.Character.OwnerID != write.ActorID {
		return nil, apierr.New(apierr.Forbidden, "character owner required")
	}
	if write.Locked.OwnerID != "" && write.ActorID == write.Locked.OwnerID {
		return nil, apierr.New(apierr.Forbidden, "quest dm cannot sign up")
	}
	if !eligibleQuestCharacter(*write.Locked.Character) {
		return nil, apierr.New(apierr.Conflict, "active approved character required")
	}
	previous := questParticipant(write.Locked.Roster, write.ValidatedInput.CharacterId)
	if previous != nil && previous.Status != "withdrawn" {
		return nil, apierr.New(apierr.Conflict, "already signed up for this quest")
	}
	status := write.Locked.Before.Status
	if status != "open" && status != "full" {
		return nil, apierr.New(apierr.Conflict, "quest not accepting signups")
	}
	return previous, nil
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
	previous, err := validateQuestWithdrawalWrite(write)
	if err != nil {
		return QuestParticipantView{}, err
	}
	if previous.Status == "withdrawn" {
		return *previous, nil
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
			Delta: -1, QuestID: lockedRow.ID,
		}); err != nil {
			return QuestParticipantView{}, err
		}
	}
	// Withdrawals never touch Discord either.
	result := *previous
	result.Status = "withdrawn"
	result.Manual = false
	result.UpdatedAt = write.At.UTC()
	return result, nil
}

func validateQuestWithdrawalWrite(write WithdrawFromQuestWrite) (*QuestParticipantView, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return nil, apierr.New(apierr.NotFound, "quest not found")
	}
	if write.Locked.Character == nil || write.Locked.Character.OwnerID != write.ActorID {
		return nil, apierr.New(apierr.Forbidden, "character owner required")
	}
	if write.Locked.Before.Status != "open" && write.Locked.Before.Status != "full" {
		return nil, apierr.New(apierr.Conflict, "quest is not accepting withdrawals")
	}
	previous := questParticipant(write.Locked.Roster, write.ValidatedInput.CharacterId)
	if previous == nil {
		return nil, apierr.New(apierr.NotFound, "participant not found")
	}
	if previous.Status != "withdrawn" && previous.Status != "signed_up" && previous.Status != "waitlisted" {
		return nil, apierr.New(apierr.Conflict, "participation is already final")
	}
	return previous, nil
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
	if _, err := p.queries().ProductQuestIncrementCapacity(ctx, dbgen.ProductQuestIncrementCapacityParams{Delta: int32(len(ids)), QuestID: lockedRow.ID}); err != nil {
		return nil, err
	}
	characterIDs := make([]pgtype.UUID, 0, len(ids))
	for _, id := range ids {
		characterIDs = append(characterIDs, mustUUID(id))
	}
	rows, err := p.queries().ProductQuestPromoteParticipants(ctx, dbgen.ProductQuestPromoteParticipantsParams{QuestID: questID, CharacterIds: characterIDs, At: at, DmPicked: write.DMPicked})
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
	nodeUUIDs, roles, err := questHexWriteValues(write.ValidatedInput.Hexes)
	if err != nil {
		return nil, err
	}
	questID, err := questUUID(write.ValidatedInput.QuestId)
	if err != nil {
		return nil, err
	}
	lockedRow, err := p.queries().ProductQuestLockByID(ctx, questID)
	if err != nil {
		return nil, err
	}
	if err := p.storeQuestHexLinks(ctx, lockedRow.ID, nodeUUIDs, roles); err != nil {
		return nil, err
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

func questHexWriteValues(hexes []QuestHexFields) ([]pgtype.UUID, []string, error) {
	if len(hexes) > 100 {
		return nil, nil, apierr.New(apierr.Invalid, "pointcrawl link limit exceeded")
	}
	seen := map[string]bool{}
	nodeUUIDs := make([]pgtype.UUID, 0, len(hexes))
	roles := make([]string, 0, len(hexes))
	for _, link := range hexes {
		key := strings.TrimSpace(link.HexId) + "\x00" + strings.TrimSpace(link.Role)
		if seen[key] {
			return nil, nil, apierr.New(apierr.Invalid, "duplicate pointcrawl link")
		}
		seen[key] = true
		uid, err := questUUID(link.HexId)
		if err != nil {
			return nil, nil, err
		}
		nodeUUIDs = append(nodeUUIDs, uid)
		roles = append(roles, link.Role)
	}
	return nodeUUIDs, roles, nil
}

func (p *ProductPostgres) storeQuestHexLinks(ctx context.Context, questID int64, nodeUUIDs []pgtype.UUID, roles []string) error {
	if err := p.queries().ProductQuestReplacePointcrawlLinks(ctx, questID); err != nil {
		return err
	}
	if len(nodeUUIDs) > 0 {
		nodes, err := p.queries().ProductQuestNodeInternalIDs(ctx, nodeUUIDs)
		if err != nil {
			return err
		}
		if len(nodes) != len(nodeUUIDs) {
			return apierr.New(apierr.NotFound, "pointcrawl node not found")
		}
		nodeIDs := make([]int64, len(nodes))
		for i, node := range nodes {
			nodeIDs[i] = node.ID
		}
		if _, err := p.queries().ProductQuestInsertPointcrawlLinks(ctx, dbgen.ProductQuestInsertPointcrawlLinksParams{
			QuestID: questID, NodeIds: nodeIDs, Roles: roles,
		}); err != nil {
			return err
		}
	}
	return nil
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
