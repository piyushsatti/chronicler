package character

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func fillCharacterState(state *AdjustPcxpState, exists bool, subjectID, ownerID string, updatedAt *time.Time, before *CharacterView) {
	state.Exists, state.SubjectID, state.OwnerID, state.UpdatedAt, state.Before = exists, subjectID, ownerID, updatedAt, before
}

func (p *ProductPostgres) LockAdjustPcxp(ctx context.Context, spec AdjustPcxpSpec) (AdjustPcxpState, error) {
	var state AdjustPcxpState
	exists, subjectID, ownerID, updatedAt, before, err := p.baseCharacterLockState(ctx, spec.CharacterId)
	if err != nil {
		return state, err
	}
	fillCharacterState(&state, exists, subjectID, ownerID, updatedAt, before)
	if exists {
		sum, err := p.queries().CharacterProductSumProgression(ctx, mustUUID(spec.CharacterId))
		if err != nil {
			return state, err
		}
		state.LedgerSum = sum
	}
	return state, nil
}

func mustUUID(value string) pgtype.UUID {
	id, _ := characterProductID(value)
	return id
}

func (p *ProductPostgres) StoreAdjustPcxp(ctx context.Context, write AdjustPcxpWrite) (ProgressionEntryView, error) {
	if !write.Locked.Exists {
		return ProgressionEntryView{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return ProgressionEntryView{}, err
	}
	actorID, err := characterProductID(write.ActorID)
	if err != nil {
		return ProgressionEntryView{}, err
	}
	row, err := p.queries().CharacterProductAdjustPCXP(ctx, dbgen.CharacterProductAdjustPCXPParams{
		CharacterID: characterID, Amount: write.Input.Amount, Reason: "pcxp", Note: optionalCharacterText(&write.Input.Note),
		ActorID: actorID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return ProgressionEntryView{}, apierr.New(apierr.Conflict, "pcxp adjustment rejected")
	}
	if err != nil {
		return ProgressionEntryView{}, err
	}
	return ProgressionEntryView{
		Id: db.UUIDString(row.ID), CharacterId: db.UUIDString(row.CharacterID), Amount: int32Pointer(row.Amount),
		Kind: row.Kind, Note: characterTextPointer(row.Note), QuestId: characterUUIDPointer(row.QuestID),
		RecordedAt: row.RecordedAt.Time, RecordedBy: characterUUIDPointer(row.RecordedBy),
	}, nil
}

func (p *ProductPostgres) LockCreateCharacter(ctx context.Context, spec CreateCharacterSpec) (CreateCharacterState, error) {
	ids := make([]pgtype.UUID, 0, len(spec.Input.CatalogPickIds))
	for _, id := range spec.Input.CatalogPickIds {
		parsed, err := characterProductID(id)
		if err != nil {
			return CreateCharacterState{}, err
		}
		ids = append(ids, parsed)
	}
	valid, err := p.queries().CharacterProductValidateCreationReferences(ctx, dbgen.CharacterProductValidateCreationReferencesParams{BackstoryID: optionalUUIDArg(spec.Input.BackstoryId), RegionID: optionalUUIDArg(spec.Input.RegionId), CatalogIds: ids})
	if err != nil {
		return CreateCharacterState{}, err
	}
	if !valid.Valid || !valid.Bool {
		return CreateCharacterState{}, apierr.New(apierr.Invalid, "invalid character creation references")
	}
	return CreateCharacterState{CatalogIDs: spec.Input.CatalogPickIds}, nil
}

func (p *ProductPostgres) StoreCreateCharacter(ctx context.Context, write CreateCharacterWrite) (CharacterView, error) {
	in := write.ValidatedInput.Input
	if write.HistoryID == nil {
		return CharacterView{}, apierr.New(apierr.Internal, "character id required")
	}
	characterID, err := characterProductID(*write.HistoryID)
	if err != nil {
		return CharacterView{}, err
	}
	ownerID, err := characterProductID(write.ActorID)
	if err != nil {
		return CharacterView{}, err
	}
	shortCode := "C" + strings.ReplaceAll(*write.HistoryID, "-", "")[:8]
	if in.ShortCode != nil && *in.ShortCode != "" {
		shortCode = *in.ShortCode
	}
	id, err := p.queries().CharacterProductInsertCharacter(ctx, dbgen.CharacterProductInsertCharacterParams{
		CharacterID: characterID, ShortCode: shortCode, Name: in.Name, OwnerID: ownerID,
		Description: optionalCharacterText(in.Description), BackgroundText: optionalCharacterText(in.BackgroundText), DdbUrl: optionalCharacterText(in.DdbUrl), ImageUrl: optionalCharacterText(in.ImageUrl), At: pgTime(write.At),
		BackstoryID: optionalUUIDArg(in.BackstoryId), GuildID: optionalUUIDArg(in.GuildId), RegionID: optionalUUIDArg(in.RegionId),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CharacterView{}, apierr.New(apierr.Invalid, "invalid character creation references")
		}
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return CharacterView{}, apierr.New(apierr.Conflict, "character short code already exists")
		}
		return CharacterView{}, err
	}
	if len(in.CatalogPickIds) > 0 {
		picks := make([]pgtype.UUID, 0, len(in.CatalogPickIds))
		for _, pick := range in.CatalogPickIds {
			parsed, err := characterProductID(pick)
			if err != nil {
				return CharacterView{}, err
			}
			picks = append(picks, parsed)
		}
		if err := p.queries().CharacterProductReplaceCatalogPicks(ctx, dbgen.CharacterProductReplaceCatalogPicksParams{CharacterID: id, CatalogIds: picks}); err != nil {
			return CharacterView{}, err
		}
	}
	return p.reloadCharacter(ctx, db.UUIDString(id))
}

func optionalUUIDArg(value *string) pgtype.UUID {
	if value == nil {
		return pgtype.UUID{}
	}
	id, err := characterProductID(*value)
	if err != nil {
		return pgtype.UUID{}
	}
	return id
}

func (p *ProductPostgres) lockCharacterMutation(ctx context.Context, characterID string, dest any) error {
	exists, subjectID, ownerID, updatedAt, before, err := p.baseCharacterLockState(ctx, characterID)
	if err != nil {
		return err
	}
	switch state := dest.(type) {
	case *DeleteCharacterState:
		*state = DeleteCharacterState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *RetireCharacterState:
		*state = RetireCharacterState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *SubmitForVerificationState:
		*state = SubmitForVerificationState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *SetCharacterGuildState:
		*state = SetCharacterGuildState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *UpdateCharacterProfileState:
		*state = UpdateCharacterProfileState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *SyncCharacterDdbState:
		*state = SyncCharacterDdbState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *LogCharacterEventState:
		*state = LogCharacterEventState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *DeleteCharacterLogState:
		*state = DeleteCharacterLogState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *RestoreCharacterState:
		exists = before != nil && rowDeleted(before)
		*state = RestoreCharacterState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *DecideVerificationState:
		*state = DecideVerificationState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	case *UpsertDowntimeProjectState:
		*state = UpsertDowntimeProjectState{Exists: exists, SubjectID: subjectID, OwnerID: ownerID, UpdatedAt: updatedAt, Before: before}
	default:
		return apierr.New(apierr.Internal, "unsupported lock state")
	}
	return nil
}

func rowDeleted(view *CharacterView) bool { return view != nil }

func (p *ProductPostgres) LockDeleteCharacter(ctx context.Context, spec DeleteCharacterSpec) (DeleteCharacterState, error) {
	var state DeleteCharacterState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreDeleteCharacter(ctx context.Context, write DeleteCharacterWrite) (product.CommandReceipt, error) {
	if !write.Locked.Exists {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	actorID, err := characterProductID(write.ActorID)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	_, err = p.queries().CharacterProductDelete(ctx, dbgen.CharacterProductDeleteParams{
		CharacterID: characterID, ActorID: actorID, At: pgTime(write.At),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "character not found")
	}
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return product.CommandReceipt{}, nil
}

func (p *ProductPostgres) LockRestoreCharacter(ctx context.Context, spec RestoreCharacterSpec) (RestoreCharacterState, error) {
	var state RestoreCharacterState
	row, view, err := p.lockCharacterRow(ctx, spec.CharacterId)
	if err != nil {
		return state, err
	}
	if !row.PublicID.Valid || view == nil {
		return state, nil
	}
	updated := row.UpdatedAt.Time
	state = RestoreCharacterState{
		Exists: row.DeletedAt.Valid, SubjectID: db.UUIDString(row.PublicID), OwnerID: view.OwnerId,
		UpdatedAt: &updated, Before: view,
	}
	return state, nil
}

func (p *ProductPostgres) StoreRestoreCharacter(ctx context.Context, write RestoreCharacterWrite) (CharacterView, error) {
	if !write.Locked.Exists {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not deleted")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return CharacterView{}, err
	}
	_, err = p.queries().CharacterProductRestore(ctx, dbgen.CharacterProductRestoreParams{CharacterID: characterID, At: pgTime(write.At)})
	if errors.Is(err, pgx.ErrNoRows) {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not deleted")
	}
	if err != nil {
		return CharacterView{}, err
	}
	return p.reloadCharacter(ctx, write.Input.CharacterId)
}

func (p *ProductPostgres) LockRetireCharacter(ctx context.Context, spec RetireCharacterSpec) (RetireCharacterState, error) {
	var state RetireCharacterState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreRetireCharacter(ctx context.Context, write RetireCharacterWrite) (CharacterView, error) {
	if !write.Locked.Exists {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return CharacterView{}, err
	}
	_, err = p.queries().CharacterProductRetire(ctx, dbgen.CharacterProductRetireParams{
		CharacterID: characterID, ExpectedUpdatedAt: pgTime(write.Input.ExpectedUpdatedAt), At: pgTime(write.At),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return CharacterView{}, apierr.New(apierr.Conflict, "character retire rejected")
	}
	if err != nil {
		return CharacterView{}, err
	}
	return p.reloadCharacter(ctx, write.Input.CharacterId)
}

func (p *ProductPostgres) LockSubmitForVerification(ctx context.Context, spec SubmitForVerificationSpec) (SubmitForVerificationState, error) {
	var state SubmitForVerificationState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreSubmitForVerification(ctx context.Context, write SubmitForVerificationWrite) (CharacterView, error) {
	if !write.Locked.Exists {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return CharacterView{}, err
	}
	_, err = p.queries().CharacterProductSubmitForVerification(ctx, dbgen.CharacterProductSubmitForVerificationParams{
		At: pgTime(write.At), CharacterID: characterID, ExpectedUpdatedAt: pgTime(write.Input.ExpectedUpdatedAt),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return CharacterView{}, apierr.New(apierr.Conflict, "verification submit rejected")
	}
	if err != nil {
		return CharacterView{}, err
	}
	return p.reloadCharacter(ctx, write.Input.CharacterId)
}

func (p *ProductPostgres) LockSetCharacterGuild(ctx context.Context, spec SetCharacterGuildSpec) (SetCharacterGuildState, error) {
	var state SetCharacterGuildState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreSetCharacterGuild(ctx context.Context, write SetCharacterGuildWrite) (CharacterView, error) {
	if !write.Locked.Exists {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return CharacterView{}, err
	}
	at := pgTime(write.At)
	if write.Input.GuildId == nil {
		_, err = p.queries().CharacterProductClearGuild(ctx, dbgen.CharacterProductClearGuildParams{At: at, CharacterID: characterID})
	} else {
		guildID, idErr := characterProductID(*write.Input.GuildId)
		if idErr != nil {
			return CharacterView{}, idErr
		}
		_, err = p.queries().CharacterProductSetGuild(ctx, dbgen.CharacterProductSetGuildParams{At: at, CharacterID: characterID, GuildID: guildID})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return CharacterView{}, apierr.New(apierr.NotFound, "character or guild not found")
	}
	if err != nil {
		return CharacterView{}, err
	}
	return p.reloadCharacter(ctx, write.Input.CharacterId)
}

func (p *ProductPostgres) LockUpdateCharacterProfile(ctx context.Context, spec UpdateCharacterProfileSpec) (UpdateCharacterProfileState, error) {
	var state UpdateCharacterProfileState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreUpdateCharacterProfile(ctx context.Context, write UpdateCharacterProfileWrite) (CharacterView, error) {
	if !write.Locked.Exists {
		return CharacterView{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return CharacterView{}, err
	}
	in := write.ValidatedInput.Input
	var description, background pgtype.Text
	if in.Description.Set {
		description = optionalCharacterText(in.Description.Value)
	}
	if in.BackgroundText.Set {
		background = optionalCharacterText(in.BackgroundText.Value)
	}
	var image pgtype.Text
	if in.ImageUrl.Set {
		image = optionalCharacterText(in.ImageUrl.Value)
	}
	_, err = p.queries().CharacterProductUpdateCharacterProfile(ctx, dbgen.CharacterProductUpdateCharacterProfileParams{
		DescriptionSet: in.Description.Set, Description: description, BackgroundSet: in.BackgroundText.Set, BackgroundText: background,
		ImageUrlSet: in.ImageUrl.Set, ImageUrl: image, At: pgTime(write.At), CharacterID: characterID,
	})
	if err != nil {
		return CharacterView{}, err
	}
	return p.reloadCharacter(ctx, write.Input.CharacterId)
}

func (p *ProductPostgres) LockSyncCharacterDdb(ctx context.Context, spec SyncCharacterDdbSpec) (SyncCharacterDdbState, error) {
	var state SyncCharacterDdbState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreSyncCharacterDdb(ctx context.Context, write SyncCharacterDdbWrite) (DdbSyncReceipt, error) {
	if !write.Locked.Exists || write.Locked.Before == nil {
		return DdbSyncReceipt{}, apierr.New(apierr.NotFound, "character not found")
	}
	client := p.Ddb
	if client == nil {
		httpClient, err := NewProductionDdbHTTPClient()
		if err != nil {
			return DdbSyncReceipt{}, err
		}
		client, err = NewDdbClient(httpClient, func() time.Time { return write.At })
		if err != nil {
			return DdbSyncReceipt{}, err
		}
	}
	snapshot, _, fetchErr := client.Fetch(ctx, write.ValidatedInput.DdbUrl)
	receipt := DdbSyncReceipt{AttemptedAt: write.At, Character: *write.Locked.Before}
	if fetchErr != nil {
		code := string(DdbErrorUnavailable)
		if ddbErr, ok := fetchErr.(DdbError); ok {
			code = string(ddbErr.Code)
		}
		receipt.SafeError = &code
		receipt.Succeeded = false
		return receipt, nil
	}
	payload := snapshot.Payload
	if _, _, err := decodeStoredCharacterDDBMirror(write.Input.CharacterId, payload, pgTime(write.At)); err != nil {
		code := string(DdbErrorPayloadDrift)
		receipt.SafeError = &code
		return receipt, nil
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return DdbSyncReceipt{}, err
	}
	if err := p.queries().CharacterProductUpsertDdbMirror(ctx, dbgen.CharacterProductUpsertDdbMirrorParams{Payload: payload, At: pgTime(write.At), CharacterID: characterID}); err != nil {
		return DdbSyncReceipt{}, err
	}
	if _, err := p.queries().CharacterProductUpdateCharacterDdbUrl(ctx, dbgen.CharacterProductUpdateCharacterDdbUrlParams{DdbUrl: write.ValidatedInput.DdbUrl, At: pgTime(write.At), CharacterID: characterID}); err != nil {
		return DdbSyncReceipt{}, err
	}
	view, err := p.reloadCharacter(ctx, write.Input.CharacterId)
	if err != nil {
		return DdbSyncReceipt{}, err
	}
	receipt.Character = view
	receipt.Succeeded = true
	return receipt, nil
}

func (p *ProductPostgres) LockLogCharacterEvent(ctx context.Context, spec LogCharacterEventSpec) (LogCharacterEventState, error) {
	var state LogCharacterEventState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreLogCharacterEvent(ctx context.Context, write LogCharacterEventWrite) (CharacterLogView, error) {
	if !write.Locked.Exists {
		return CharacterLogView{}, apierr.New(apierr.NotFound, "character not found")
	}
	logID, err := characterProductID(*write.HistoryID)
	if err != nil {
		return CharacterLogView{}, err
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return CharacterLogView{}, err
	}
	actorID, err := characterProductID(write.ActorID)
	if err != nil {
		return CharacterLogView{}, err
	}
	var questID pgtype.UUID
	if write.Input.QuestId != nil {
		questID, err = characterProductID(*write.Input.QuestId)
		if err != nil {
			return CharacterLogView{}, err
		}
	}
	var id pgtype.UUID
	var body string
	var createdAt pgtype.Timestamptz
	err = p.DB.QueryRow(ctx, characterProductInsertCharacterLog,
		logID, write.Input.Body, pgTime(write.At), actorID, questID, characterID, questID,
	).Scan(&id, &body, &createdAt)
	if err != nil {
		return CharacterLogView{}, err
	}
	return CharacterLogView{
		Id: db.UUIDString(id), CharacterId: write.Input.CharacterId, Body: body, CreatedAt: createdAt.Time,
		CreatedBy: &write.ActorID, QuestId: write.Input.QuestId,
	}, nil
}

const characterProductInsertCharacterLog = `-- name: CharacterProductInsertCharacterLog :one
INSERT INTO character_logs (public_id, character_id, quest_id, body, created_at, created_by)
SELECT $1::uuid, character.id, quest.id, $2::text,
       $3::timestamptz, actor.id
FROM characters character
JOIN members actor ON actor.public_id = $4::uuid
LEFT JOIN quests quest ON quest.public_id = $5::uuid
WHERE character.public_id = $6::uuid
  AND character.deleted_at IS NULL
  AND ($7::uuid IS NULL OR quest.id IS NOT NULL)
RETURNING public_id AS id, body, created_at`

func (p *ProductPostgres) LockDeleteCharacterLog(ctx context.Context, spec DeleteCharacterLogSpec) (DeleteCharacterLogState, error) {
	var state DeleteCharacterLogState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreDeleteCharacterLog(ctx context.Context, write DeleteCharacterLogWrite) (product.CommandReceipt, error) {
	if !write.Locked.Exists {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	logID, err := characterProductID(write.Input.LogId)
	if err != nil {
		return product.CommandReceipt{}, err
	}
	var deleted pgtype.UUID
	err = p.DB.QueryRow(ctx, characterProductDeleteCharacterLog, characterID, logID).Scan(&deleted)
	if errors.Is(err, pgx.ErrNoRows) {
		return product.CommandReceipt{}, apierr.New(apierr.NotFound, "character log not found")
	}
	if err != nil {
		return product.CommandReceipt{}, err
	}
	return product.CommandReceipt{}, nil
}

const characterProductDeleteCharacterLog = `-- name: CharacterProductDeleteCharacterLog :one
DELETE FROM character_logs log
USING characters character
WHERE log.character_id = character.id
  AND character.public_id = $1::uuid
  AND log.public_id = $2::uuid
RETURNING log.public_id AS id`

func (p *ProductPostgres) LockDecideVerification(ctx context.Context, spec DecideVerificationSpec) (DecideVerificationState, error) {
	var state DecideVerificationState
	if err := p.lockCharacterMutation(ctx, spec.CharacterId, &state); err != nil {
		return state, err
	}
	if state.Before != nil && (state.Before.VerificationSubmittedAt == nil || !state.Before.VerificationSubmittedAt.Equal(spec.ExpectedSubmittedAt) || state.Before.Status != "pending_approval" || state.Before.VerificationStatus != CharacterReviewStatusPending) {
		return DecideVerificationState{}, apierr.New(apierr.Conflict, "verification submission token mismatch")
	}
	return state, nil
}

func (p *ProductPostgres) StoreDecideVerification(ctx context.Context, write DecideVerificationWrite) (member.VerificationView, error) {
	if !write.Locked.Exists {
		return member.VerificationView{}, apierr.New(apierr.NotFound, "character not found")
	}
	_, err := p.queries().CharacterProductApplyVerification(ctx, dbgen.CharacterProductApplyVerificationParams{Approved: write.Input.Verdict == member.VerificationVerdictApproved, At: pgTime(write.At), CharacterID: mustUUID(write.Input.CharacterId), SubmittedAt: pgTime(write.Input.ExpectedSubmittedAt)})
	if errors.Is(err, pgx.ErrNoRows) {
		return member.VerificationView{}, apierr.New(apierr.Conflict, "verification submission changed")
	}
	if err != nil {
		return member.VerificationView{}, err
	}
	return write.Assessment, nil
}

func (p *ProductPostgres) LockUpsertDowntimeProject(ctx context.Context, spec UpsertDowntimeProjectSpec) (UpsertDowntimeProjectState, error) {
	var state UpsertDowntimeProjectState
	return state, p.lockCharacterMutation(ctx, spec.CharacterId, &state)
}

func (p *ProductPostgres) StoreUpsertDowntimeProject(ctx context.Context, write UpsertDowntimeProjectWrite) (DowntimeProjectView, error) {
	if !write.Locked.Exists {
		return DowntimeProjectView{}, apierr.New(apierr.NotFound, "character not found")
	}
	characterID, err := characterProductID(write.Input.CharacterId)
	if err != nil {
		return DowntimeProjectView{}, err
	}
	in := write.ValidatedInput.Input
	at := pgTime(write.At)
	if in.Id == nil {
		row, err := p.queries().CharacterProductInsertDowntimeProject(ctx, dbgen.CharacterProductInsertDowntimeProjectParams{
			CharacterID: characterID, Name: in.Name, Target: pgInt4(in.Target), Goal: optionalCharacterText(in.Goal),
			Notes: optionalCharacterText(in.Notes), Progress: in.Progress, Status: in.Status, At: at,
		})
		if err != nil {
			return DowntimeProjectView{}, err
		}
		return mapDowntimeRow(row), nil
	}
	projectID, err := characterProductID(*in.Id)
	if err != nil {
		return DowntimeProjectView{}, err
	}
	row, err := p.queries().CharacterProductUpdateDowntimeProject(ctx, dbgen.CharacterProductUpdateDowntimeProjectParams{
		Name: in.Name, Target: pgInt4(in.Target), Goal: optionalCharacterText(in.Goal), Notes: optionalCharacterText(in.Notes),
		Progress: in.Progress, Status: in.Status, At: at, CharacterID: characterID, ProjectID: projectID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return DowntimeProjectView{}, apierr.New(apierr.NotFound, "downtime project not found")
	}
	if err != nil {
		return DowntimeProjectView{}, err
	}
	return mapDowntimeUpdateRow(row), nil
}

func pgInt4(value *int32) pgtype.Int4 {
	if value == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *value, Valid: true}
}

func mapDowntimeRow(row dbgen.CharacterProductInsertDowntimeProjectRow) DowntimeProjectView {
	return DowntimeProjectView{
		Id: db.UUIDString(row.ID), CharacterId: db.UUIDString(row.CharacterID), Name: row.Name,
		Target: int32PointerFromInt4(row.Target), Goal: characterTextPointer(row.Goal), Notes: characterTextPointer(row.Notes),
		Progress: row.Progress, Status: row.Status, UpdatedAt: row.UpdatedAt.Time,
	}
}

func mapDowntimeUpdateRow(row dbgen.CharacterProductUpdateDowntimeProjectRow) DowntimeProjectView {
	return DowntimeProjectView{
		Id: db.UUIDString(row.ID), CharacterId: db.UUIDString(row.CharacterID), Name: row.Name,
		Target: int32PointerFromInt4(row.Target), Goal: characterTextPointer(row.Goal), Notes: characterTextPointer(row.Notes),
		Progress: row.Progress, Status: row.Status, UpdatedAt: row.UpdatedAt.Time,
	}
}

func (p *ProductPostgres) LockCreateBackstory(_ context.Context, _ CreateBackstorySpec) (CreateBackstoryState, error) {
	return CreateBackstoryState{}, nil
}

func (p *ProductPostgres) StoreCreateBackstory(ctx context.Context, write CreateBackstoryWrite) (BackstoryView, error) {
	id, err := characterProductID(*write.HistoryID)
	if err != nil {
		return BackstoryView{}, err
	}
	in := write.ValidatedInput.Input
	var regionID pgtype.UUID
	if in.SourceRegionId != nil {
		regionID, err = characterProductID(*in.SourceRegionId)
		if err != nil {
			return BackstoryView{}, err
		}
	}
	var view BackstoryView
	err = p.DB.QueryRow(ctx, characterProductInsertBackstory,
		id, in.Name, in.Lore, in.Cohort, in.Retired, regionID, regionID,
	).Scan(&view.Id, &view.Name, &view.Lore, &view.Cohort, &view.Retired, &regionID)
	if err != nil {
		return BackstoryView{}, err
	}
	view.SourceRegionId = characterUUIDPointer(regionID)
	return view, nil
}

const characterProductInsertBackstory = `-- name: CharacterProductInsertBackstory :one
INSERT INTO backstories (public_id, name, lore, cohort, source_region_id, retired)
SELECT $1::uuid, $2::text, $3::text,
       $4::text, region.id, $5::bool
FROM (SELECT 1) AS seed
LEFT JOIN regions region ON region.public_id = $6::uuid
WHERE $7::uuid IS NULL OR region.id IS NOT NULL
RETURNING public_id AS id, name, lore, cohort, retired,
          (SELECT public_id FROM regions WHERE id = source_region_id) AS source_region_id`

func (p *ProductPostgres) LockUpdateBackstory(ctx context.Context, spec UpdateBackstorySpec) (UpdateBackstoryState, error) {
	id, err := characterProductID(spec.Id)
	if err != nil {
		return UpdateBackstoryState{}, err
	}
	row := p.DB.QueryRow(ctx, characterProductLockBackstory, id)
	var internal int64
	var public pgtype.UUID
	var name, lore, cohort string
	var regionInternal pgtype.Int8
	var retired bool
	if err := row.Scan(&internal, &public, &name, &lore, &cohort, &regionInternal, &retired); errors.Is(err, pgx.ErrNoRows) {
		return UpdateBackstoryState{}, nil
	} else if err != nil {
		return UpdateBackstoryState{}, err
	}
	before := BackstoryView{Id: db.UUIDString(public), Name: name, Lore: lore, Cohort: cohort, Retired: retired}
	return UpdateBackstoryState{Exists: true, SubjectID: before.Id, Before: &before}, nil
}

const characterProductLockBackstory = `-- name: CharacterProductLockBackstory :one
SELECT backstory.id, backstory.public_id, backstory.name, backstory.lore, backstory.cohort,
       backstory.source_region_id, backstory.retired
FROM backstories backstory
WHERE backstory.public_id = $1::uuid
FOR UPDATE`

func (p *ProductPostgres) StoreUpdateBackstory(ctx context.Context, write UpdateBackstoryWrite) (BackstoryView, error) {
	if !write.Locked.Exists {
		return BackstoryView{}, apierr.New(apierr.NotFound, "backstory not found")
	}
	in := write.ValidatedInput.Input
	id, err := characterProductID(write.Input.Id)
	if err != nil {
		return BackstoryView{}, err
	}
	var regionID pgtype.UUID
	if in.SourceRegionId != nil {
		regionID, err = characterProductID(*in.SourceRegionId)
		if err != nil {
			return BackstoryView{}, err
		}
	}
	var view BackstoryView
	err = p.DB.QueryRow(ctx, characterProductUpdateBackstory,
		in.Name, in.Lore, in.Cohort, regionID, regionID, in.Retired, id, regionID, regionID,
	).Scan(&view.Id, &view.Name, &view.Lore, &view.Cohort, &view.Retired, &regionID)
	if err != nil {
		return BackstoryView{}, err
	}
	view.SourceRegionId = characterUUIDPointer(regionID)
	return view, nil
}

const characterProductUpdateBackstory = `-- name: CharacterProductUpdateBackstory :one
UPDATE backstories backstory
SET name = $1::text,
    lore = $2::text,
    cohort = $3::text,
    source_region_id = CASE
        WHEN $4::uuid IS NULL THEN NULL
        ELSE (SELECT id FROM regions WHERE public_id = $5::uuid)
    END,
    retired = $6::bool
WHERE backstory.public_id = $7::uuid
  AND ($8::uuid IS NULL OR EXISTS (SELECT 1 FROM regions WHERE public_id = $9::uuid))
RETURNING backstory.public_id AS id, backstory.name, backstory.lore, backstory.cohort,
          backstory.retired,
          (SELECT public_id FROM regions WHERE id = backstory.source_region_id) AS source_region_id`

func (p *ProductPostgres) LockUpsertCreationCatalogEntry(ctx context.Context, spec UpsertCreationCatalogEntrySpec) (UpsertCreationCatalogEntryState, error) {
	if spec.Input.OptionId == nil {
		return UpsertCreationCatalogEntryState{}, nil
	}
	id, err := characterProductID(*spec.Input.OptionId)
	if err != nil {
		return UpsertCreationCatalogEntryState{}, err
	}
	row, err := p.queries().CharacterProductLockCreationCatalogEntry(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return UpsertCreationCatalogEntryState{}, nil
	}
	if err != nil {
		return UpsertCreationCatalogEntryState{}, err
	}
	before := CreationCatalogEntryView{
		Id: db.UUIDString(row.PublicID), Kind: row.Kind, Name: row.Name, Available: row.Available,
		Description: characterTextPointer(row.Description), Retired: row.Retired,
	}
	return UpsertCreationCatalogEntryState{Exists: true, SubjectID: before.Id, Before: &before}, nil
}

func (p *ProductPostgres) StoreUpsertCreationCatalogEntry(ctx context.Context, write UpsertCreationCatalogEntryWrite) (CreationCatalogEntryView, error) {
	in := write.ValidatedInput.Input
	var optionID, regionID pgtype.UUID
	if in.OptionId != nil {
		optionID, _ = characterProductID(*in.OptionId)
	}
	if in.IntroducedByRegionId != nil {
		regionID, _ = characterProductID(*in.IntroducedByRegionId)
	}
	row, err := p.queries().CharacterProductUpsertCreationCatalogEntry(ctx, dbgen.CharacterProductUpsertCreationCatalogEntryParams{
		RegionID: regionID, Kind: in.Kind, Name: in.Name, Available: in.Available,
		Description: optionalCharacterText(in.Description), Retired: in.Retired, OptionID: optionID,
	})
	if err != nil {
		return CreationCatalogEntryView{}, err
	}
	return CreationCatalogEntryView{
		Id: db.UUIDString(row.ID), Kind: row.Kind, Name: row.Name, Available: row.Available,
		Description: characterTextPointer(row.Description), Retired: row.Retired,
		IntroducedByRegionId: characterUUIDPointer(row.IntroducedByRegionID),
	}, nil
}

func (p *ProductPostgres) LockClaimQuestRewards(context.Context, ClaimQuestRewardsSpec) (ClaimQuestRewardsState, error) {
	return ClaimQuestRewardsState{}, apierr.New(apierr.Internal, "character product surface pending")
}

func (p *ProductPostgres) StoreClaimQuestRewards(context.Context, ClaimQuestRewardsWrite) (RewardClaimReceipt, error) {
	return RewardClaimReceipt{}, apierr.New(apierr.Internal, "character product surface pending")
}
