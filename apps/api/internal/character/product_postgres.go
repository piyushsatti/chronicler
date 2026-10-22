package character

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/member"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/db"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// ProductPostgres binds the Character product repositories to one caller-owned
// pgx executor. Transaction ownership remains with the caller's unit of work.
type ProductPostgres struct {
	DB  dbgen.DBTX
	Ddb DdbClient
}

func NewProductPostgres(executor dbgen.DBTX) (*ProductPostgres, error) {
	if executor == nil || (reflect.ValueOf(executor).Kind() == reflect.Pointer && reflect.ValueOf(executor).IsNil()) {
		return nil, fmt.Errorf("character database executor required")
	}
	return &ProductPostgres{DB: executor}, nil
}

func (p *ProductPostgres) queries() *dbgen.Queries { return dbgen.New(p.DB) }

func characterProductID(value string) (pgtype.UUID, error) {
	id, err := db.ParseUUID(value)
	if err != nil || db.UUIDString(id) != value {
		return pgtype.UUID{}, apierr.New(apierr.Invalid, "invalid character id")
	}
	return id, nil
}

func characterActorID(actor auth.Authority) (pgtype.UUID, error) {
	return characterProductID(actor.Claims().MemberID)
}

func optionalCharacterID(value *string) (pgtype.UUID, error) {
	if value == nil {
		return pgtype.UUID{}, nil
	}
	return characterProductID(*value)
}

func optionalCharacterText(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func characterUUIDPointer(value pgtype.UUID) *string {
	if !value.Valid {
		return nil
	}
	result := db.UUIDString(value)
	return &result
}

func characterTextPointer(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}

func characterTimePointer(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	result := value.Time
	return &result
}

func characterVerificationStatus(value any) (CharacterReviewStatus, error) {
	status, ok := value.(string)
	if !ok {
		return "", fmt.Errorf("unexpected character verification status type %T", value)
	}
	switch status {
	case string(CharacterReviewStatusPending):
		return CharacterReviewStatusPending, nil
	case string(CharacterReviewStatusApproved):
		return CharacterReviewStatusApproved, nil
	case string(CharacterReviewStatusRejected):
		return CharacterReviewStatusRejected, nil
	case string(CharacterReviewStatusUnknown):
		return CharacterReviewStatusUnknown, nil
	default:
		return "", fmt.Errorf("unexpected character verification status %q", status)
	}
}

func decodeStoredCharacterDDBMirror(characterID string, payload []byte, syncedAt pgtype.Timestamptz) (*CharacterDDBMirrorView, []DDBProficiencyView, error) {
	proficiencies := []DDBProficiencyView{}
	if payload == nil {
		if syncedAt.Valid {
			return nil, nil, errors.New("character DDB mirror timestamp without payload")
		}
		return nil, proficiencies, nil
	}
	if !syncedAt.Valid {
		return nil, nil, errors.New("character DDB mirror payload without timestamp")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil || fields == nil || ensureJSONEOF(decoder) != nil {
		return nil, nil, errors.New("invalid stored character DDB mirror payload")
	}
	allowed := map[string]struct{}{
		"level": {}, "xp": {}, "armorClass": {}, "maxHp": {}, "species": {},
		"classes": {}, "background": {}, "proficiencies": {},
	}
	for key := range fields {
		if _, ok := allowed[key]; !ok {
			return nil, nil, fmt.Errorf("unknown stored character DDB mirror field %q", key)
		}
	}
	for key := range allowed {
		if _, ok := fields[key]; !ok {
			return nil, nil, fmt.Errorf("missing stored character DDB mirror field %q", key)
		}
	}
	level, err := storedDDBInt32(fields["level"], false)
	if err != nil || level == nil || *level < 1 || *level > 20 {
		return nil, nil, errors.New("invalid stored character DDB level")
	}
	xp, err := storedDDBInt32(fields["xp"], false)
	if err != nil || xp == nil || *xp < 0 {
		return nil, nil, errors.New("invalid stored character DDB XP")
	}
	armorClass, err := storedDDBInt32(fields["armorClass"], true)
	if err != nil || (armorClass != nil && *armorClass < 0) {
		return nil, nil, errors.New("invalid stored character DDB armor class")
	}
	maxHP, err := storedDDBInt32(fields["maxHp"], true)
	if err != nil || (maxHP != nil && *maxHP < 0) {
		return nil, nil, errors.New("invalid stored character DDB maximum HP")
	}
	species, err := storedDDBString(fields["species"], false)
	if err != nil {
		return nil, nil, errors.New("invalid stored character DDB species")
	}
	classes, err := storedDDBString(fields["classes"], false)
	if err != nil {
		return nil, nil, errors.New("invalid stored character DDB classes")
	}
	background, err := storedDDBString(fields["background"], true)
	if err != nil {
		return nil, nil, errors.New("invalid stored character DDB background")
	}
	var stored []struct {
		Kind string `json:"kind"`
		Name string `json:"name"`
	}
	proficiencyDecoder := json.NewDecoder(bytes.NewReader(fields["proficiencies"]))
	proficiencyDecoder.DisallowUnknownFields()
	if err := proficiencyDecoder.Decode(&stored); err != nil || stored == nil || ensureJSONEOF(proficiencyDecoder) != nil || len(stored) > ddbMaxProficiencies {
		return nil, nil, errors.New("invalid stored character DDB proficiencies")
	}
	seen := make(map[string]struct{}, len(stored))
	proficiencies = make([]DDBProficiencyView, 0, len(stored))
	for _, proficiency := range stored {
		if (proficiency.Kind != "proficiency" && proficiency.Kind != "language") || strings.TrimSpace(proficiency.Name) == "" || strings.TrimSpace(proficiency.Name) != proficiency.Name {
			return nil, nil, errors.New("invalid stored character DDB proficiency")
		}
		key := proficiency.Kind + "\x00" + proficiency.Name
		if _, ok := seen[key]; ok {
			return nil, nil, errors.New("duplicate stored character DDB proficiency")
		}
		seen[key] = struct{}{}
		proficiencies = append(proficiencies, DDBProficiencyView{Kind: proficiency.Kind, Name: proficiency.Name})
	}
	return &CharacterDDBMirrorView{
		ArmorClass: armorClass, Background: background, CharacterId: characterID,
		Classes: classes, Level: level, MaxHp: maxHP, Species: species,
		SyncedAt: characterTimePointer(syncedAt), Xp: xp,
	}, proficiencies, nil
}

func storedDDBInt32(raw json.RawMessage, nullable bool) (*int32, error) {
	if string(bytes.TrimSpace(raw)) == "null" {
		if nullable {
			return nil, nil
		}
		return nil, errors.New("unexpected null integer")
	}
	var value int32
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	return &value, nil
}

func storedDDBString(raw json.RawMessage, nullable bool) (*string, error) {
	if string(bytes.TrimSpace(raw)) == "null" {
		if nullable {
			return nil, nil
		}
		return nil, errors.New("unexpected null string")
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" {
		return nil, errors.New("invalid string")
	}
	return &value, nil
}

func mapProductCharacter(id pgtype.UUID, shortCode, name string, ownerID, backstoryID, guildID, regionID pgtype.UUID, status string, description, background, ddbURL, imageURL pgtype.Text, pcxp int32, createdAt, updatedAt, submittedAt pgtype.Timestamptz, verificationStatus any, ddbPayload []byte, ddbSyncedAt pgtype.Timestamptz) (CharacterView, error) {
	verification, err := characterVerificationStatus(verificationStatus)
	if err != nil {
		return CharacterView{}, err
	}
	ddbMirror, proficiencies, err := decodeStoredCharacterDDBMirror(db.UUIDString(id), ddbPayload, ddbSyncedAt)
	if err != nil {
		return CharacterView{}, err
	}
	return CharacterView{
		Description:             characterTextPointer(description),
		BackgroundText:          characterTextPointer(background),
		DdbUrl:                  characterTextPointer(ddbURL),
		ImageUrl:                characterTextPointer(imageURL),
		BackstoryId:             characterUUIDPointer(backstoryID),
		GuildId:                 characterUUIDPointer(guildID),
		Id:                      db.UUIDString(id),
		Name:                    name,
		OwnerId:                 db.UUIDString(ownerID),
		Pcxp:                    pcxp,
		DdbMirror:               ddbMirror,
		Proficiencies:           proficiencies,
		RegionId:                characterUUIDPointer(regionID),
		ShortCode:               shortCode,
		Status:                  status,
		CreatedAt:               createdAt.Time,
		UpdatedAt:               updatedAt.Time,
		VerificationStatus:      verification,
		VerificationSubmittedAt: characterTimePointer(submittedAt),
	}, nil
}

func mapAdminCharacterDirectory(row dbgen.CharacterProductAdminDirectoryRow) (AdminCharacterDirectoryEntryView, error) {
	verification, err := characterVerificationStatus(row.VerificationStatus)
	if err != nil {
		return AdminCharacterDirectoryEntryView{}, err
	}
	return AdminCharacterDirectoryEntryView{
		DdbUrl:                  characterTextPointer(row.DdbUrl),
		GuildId:                 characterUUIDPointer(row.GuildID),
		Id:                      db.UUIDString(row.ID),
		Name:                    row.Name,
		OwnerAvatarUrl:          characterTextPointer(row.OwnerAvatarUrl),
		OwnerDisplayName:        row.OwnerDisplayName,
		OwnerHandle:             row.OwnerHandle,
		OwnerId:                 db.UUIDString(row.OwnerID),
		RegionId:                characterUUIDPointer(row.RegionID),
		RegionName:              characterTextPointer(row.RegionName),
		ShortCode:               row.ShortCode,
		Status:                  row.Status,
		UpdatedAt:               row.UpdatedAt.Time,
		VerificationStatus:      string(verification),
		VerificationSubmittedAt: characterTimePointer(row.VerificationSubmittedAt),
	}, nil
}

func mapPendingCharacterDirectory(row dbgen.CharacterProductPendingVerificationDirectoryRow) (AdminCharacterDirectoryEntryView, error) {
	verification, err := characterVerificationStatus(row.VerificationStatus)
	if err != nil {
		return AdminCharacterDirectoryEntryView{}, err
	}
	return AdminCharacterDirectoryEntryView{
		DdbUrl:                  characterTextPointer(row.DdbUrl),
		GuildId:                 characterUUIDPointer(row.GuildID),
		Id:                      db.UUIDString(row.ID),
		Name:                    row.Name,
		OwnerAvatarUrl:          characterTextPointer(row.OwnerAvatarUrl),
		OwnerDisplayName:        row.OwnerDisplayName,
		OwnerHandle:             row.OwnerHandle,
		OwnerId:                 db.UUIDString(row.OwnerID),
		RegionId:                characterUUIDPointer(row.RegionID),
		RegionName:              characterTextPointer(row.RegionName),
		ShortCode:               row.ShortCode,
		Status:                  row.Status,
		UpdatedAt:               row.UpdatedAt.Time,
		VerificationStatus:      string(verification),
		VerificationSubmittedAt: characterTimePointer(row.VerificationSubmittedAt),
	}, nil
}

func (p *ProductPostgres) ReadCharacter(ctx context.Context, _ auth.Authority, spec CharacterSpec) (*CharacterView, error) {
	var row dbgen.CharacterProductByIDRow
	var err error
	if spec.Id != nil {
		id, parseErr := characterProductID(*spec.Id)
		if parseErr != nil {
			return nil, nil
		}
		row, err = p.queries().CharacterProductByID(ctx, id)
	} else if spec.ShortCode != nil {
		var short dbgen.CharacterProductByShortCodeRow
		short, err = p.queries().CharacterProductByShortCode(ctx, *spec.ShortCode)
		if err == nil {
			view, mapErr := mapProductCharacter(short.ID, short.ShortCode, short.Name, short.OwnerID, short.BackstoryID, short.GuildID, short.RegionID, short.Status, short.Description, short.BackgroundText, short.DdbUrl, short.ImageUrl, short.Pcxp, short.CreatedAt, short.UpdatedAt, short.VerificationSubmittedAt, short.VerificationStatus, short.DdbPayload, short.DdbSyncedAt)
			if mapErr != nil {
				return nil, mapErr
			}
			return &view, nil
		}
	} else {
		return nil, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	view, err := mapProductCharacter(row.ID, row.ShortCode, row.Name, row.OwnerID, row.BackstoryID, row.GuildID, row.RegionID, row.Status, row.Description, row.BackgroundText, row.DdbUrl, row.ImageUrl, row.Pcxp, row.CreatedAt, row.UpdatedAt, row.VerificationSubmittedAt, row.VerificationStatus, row.DdbPayload, row.DdbSyncedAt)
	if err != nil {
		return nil, err
	}
	return &view, nil
}

func (p *ProductPostgres) ReadCharacters(ctx context.Context, _ auth.Authority, spec CharactersSpec) (CharacterListResult, error) {
	arg := dbgen.CharacterProductListParams{RowLimit: spec.Limit, RowOffset: spec.Offset}
	if spec.Filters != nil {
		var err error
		if arg.OwnerID, err = optionalCharacterID(spec.Filters.OwnerId); err != nil {
			return CharacterListResult{}, err
		}
		if arg.RegionID, err = optionalCharacterID(spec.Filters.RegionId); err != nil {
			return CharacterListResult{}, err
		}
		if arg.GuildID, err = optionalCharacterID(spec.Filters.GuildId); err != nil {
			return CharacterListResult{}, err
		}
		arg.CharacterStatus = optionalCharacterText(spec.Filters.Status)
		arg.NamePrefix = optionalCharacterText(spec.Filters.NamePrefix)
	}
	rows, err := p.queries().CharacterProductList(ctx, arg)
	if err != nil {
		return CharacterListResult{}, err
	}
	totalArg := dbgen.CharacterProductCountParams{OwnerID: arg.OwnerID, RegionID: arg.RegionID, GuildID: arg.GuildID, CharacterStatus: arg.CharacterStatus, NamePrefix: arg.NamePrefix}
	total, err := p.queries().CharacterProductCount(ctx, totalArg)
	if err != nil {
		return CharacterListResult{}, err
	}
	out := CharacterListResult{Items: make([]CharacterView, 0, len(rows)), Total: total}
	for _, row := range rows {
		view, mapErr := mapProductCharacter(row.ID, row.ShortCode, row.Name, row.OwnerID, row.BackstoryID, row.GuildID, row.RegionID, row.Status, row.Description, row.BackgroundText, row.DdbUrl, row.ImageUrl, row.Pcxp, row.CreatedAt, row.UpdatedAt, row.VerificationSubmittedAt, row.VerificationStatus, row.DdbPayload, row.DdbSyncedAt)
		if mapErr != nil {
			return CharacterListResult{}, mapErr
		}
		out.Items = append(out.Items, view)
	}
	return out, nil
}

func (p *ProductPostgres) ReadMyCharacters(ctx context.Context, actor auth.Authority, spec MyCharactersSpec) (CharacterListResult, error) {
	ownerID, err := characterActorID(actor)
	if err != nil {
		return CharacterListResult{}, err
	}
	rows, err := p.queries().CharacterProductMyCharacters(ctx, dbgen.CharacterProductMyCharactersParams{OwnerID: ownerID, RowLimit: spec.Limit, RowOffset: spec.Offset})
	if err != nil {
		return CharacterListResult{}, err
	}
	total, err := p.queries().CharacterProductCountMyCharacters(ctx, ownerID)
	if err != nil {
		return CharacterListResult{}, err
	}
	out := CharacterListResult{Items: make([]CharacterView, 0, len(rows)), Total: total}
	for _, row := range rows {
		view, mapErr := mapProductCharacter(row.ID, row.ShortCode, row.Name, row.OwnerID, row.BackstoryID, row.GuildID, row.RegionID, row.Status, row.Description, row.BackgroundText, row.DdbUrl, row.ImageUrl, row.Pcxp, row.CreatedAt, row.UpdatedAt, row.VerificationSubmittedAt, row.VerificationStatus, row.DdbPayload, row.DdbSyncedAt)
		if mapErr != nil {
			return CharacterListResult{}, mapErr
		}
		out.Items = append(out.Items, view)
	}
	return out, nil
}

func (p *ProductPostgres) ReadAdminCharacterDirectory(ctx context.Context, _ auth.Authority, spec AdminCharacterDirectorySpec) (AdminCharacterDirectoryView, error) {
	arg := dbgen.CharacterProductAdminDirectoryParams{RowLimit: spec.Limit, RowOffset: spec.Offset}
	if spec.Filters != nil {
		arg.NamePrefix = optionalCharacterText(spec.Filters.NamePrefix)
		arg.CharacterStatus = optionalCharacterText(spec.Filters.Status)
		var err error
		arg.RegionID, err = optionalCharacterID(spec.Filters.RegionId)
		if err != nil {
			return AdminCharacterDirectoryView{}, err
		}
	}
	rows, err := p.queries().CharacterProductAdminDirectory(ctx, arg)
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	total, err := p.queries().CharacterProductCountAdminDirectory(ctx, dbgen.CharacterProductCountAdminDirectoryParams{NamePrefix: arg.NamePrefix, RegionID: arg.RegionID, CharacterStatus: arg.CharacterStatus})
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	out := AdminCharacterDirectoryView{Items: make([]AdminCharacterDirectoryEntryView, 0, len(rows)), Total: total}
	for _, row := range rows {
		entry, mapErr := mapAdminCharacterDirectory(row)
		if mapErr != nil {
			return AdminCharacterDirectoryView{}, mapErr
		}
		out.Items = append(out.Items, entry)
	}
	return out, nil
}

func (p *ProductPostgres) ReadPendingCharacterVerifications(ctx context.Context, _ auth.Authority, spec PendingCharacterVerificationsSpec) (AdminCharacterDirectoryView, error) {
	rows, err := p.queries().CharacterProductPendingVerificationDirectory(ctx, dbgen.CharacterProductPendingVerificationDirectoryParams{RowLimit: spec.Limit, RowOffset: spec.Offset})
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	total, err := p.queries().CharacterProductCountPendingVerifications(ctx)
	if err != nil {
		return AdminCharacterDirectoryView{}, err
	}
	out := AdminCharacterDirectoryView{Items: make([]AdminCharacterDirectoryEntryView, 0, len(rows)), Total: total}
	for _, row := range rows {
		entry, mapErr := mapPendingCharacterDirectory(row)
		if mapErr != nil {
			return AdminCharacterDirectoryView{}, mapErr
		}
		out.Items = append(out.Items, entry)
	}
	return out, nil
}

func (p *ProductPostgres) ReadCharacterProgression(ctx context.Context, _ auth.Authority, spec CharacterProgressionSpec) (ProgressionListResult, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return ProgressionListResult{}, err
	}
	rows, err := p.queries().CharacterProductListProgression(ctx, dbgen.CharacterProductListProgressionParams{CharacterID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset})
	if err != nil {
		return ProgressionListResult{}, err
	}
	total, err := p.queries().CharacterProductCountProgression(ctx, characterID)
	if err != nil {
		return ProgressionListResult{}, err
	}
	out := ProgressionListResult{Items: make([]ProgressionEntryView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, ProgressionEntryView{Amount: int32Pointer(row.Amount), CharacterId: db.UUIDString(row.CharacterID), Id: db.UUIDString(row.ID), Kind: row.Kind, Note: characterTextPointer(row.Note), QuestId: characterUUIDPointer(row.QuestID), RecordedAt: row.RecordedAt.Time, RecordedBy: characterUUIDPointer(row.RecordedBy)})
	}
	return out, nil
}

func (p *ProductPostgres) ReadCharacterVerificationHistory(ctx context.Context, _ auth.Authority, spec CharacterVerificationHistorySpec) (member.VerificationPage, error) {
	characterID, err := characterProductID(spec.CharacterId)
	if err != nil {
		return member.VerificationPage{}, err
	}
	rows, err := p.queries().CharacterProductListVerificationHistory(ctx, dbgen.CharacterProductListVerificationHistoryParams{CharacterID: characterID, RowLimit: spec.Limit, RowOffset: spec.Offset})
	if err != nil {
		return member.VerificationPage{}, err
	}
	total, err := p.queries().CharacterProductCountVerificationHistory(ctx, characterID)
	if err != nil {
		return member.VerificationPage{}, err
	}
	out := member.VerificationPage{Items: make([]member.VerificationView, 0, len(rows)), Total: total}
	for _, row := range rows {
		out.Items = append(out.Items, member.VerificationView{Id: db.UUIDString(row.ID), Note: characterTextPointer(row.Note), RecordedAt: row.CreatedAt.Time, TargetId: db.UUIDString(row.SubjectID), TargetType: row.SubjectType, Verdict: row.Decision, VerifiedBy: db.UUIDString(row.DecidedBy)})
	}
	return out, nil
}

func (p *ProductPostgres) ReadBatchCharacters(ctx context.Context, _ auth.Authority, keys []IDKey) ([]product.BatchResult[CharacterView], error) {
	out := make([]product.BatchResult[CharacterView], len(keys))
	ids := make([]pgtype.UUID, 0, len(keys))
	positions := make([]int, 0, len(keys))
	for i, key := range keys {
		id, err := characterProductID(key.ID)
		if err != nil {
			out[i].Err = err
			continue
		}
		ids = append(ids, id)
		positions = append(positions, i)
	}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.queries().CharacterProductBatchByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	rowIndex := 0
	for _, row := range rows {
		// The query preserves input order and duplicates, while omitting missing IDs.
		for rowIndex < len(positions) && keys[positions[rowIndex]].ID != db.UUIDString(row.ID) {
			rowIndex++
		}
		if rowIndex == len(positions) {
			break
		}
		view, mapErr := mapProductCharacter(row.ID, row.ShortCode, row.Name, row.OwnerID, row.BackstoryID, row.GuildID, row.RegionID, row.Status, row.Description, row.BackgroundText, row.DdbUrl, row.ImageUrl, row.Pcxp, row.CreatedAt, row.UpdatedAt, row.VerificationSubmittedAt, row.VerificationStatus, row.DdbPayload, row.DdbSyncedAt)
		if mapErr != nil {
			return nil, mapErr
		}
		out[positions[rowIndex]].Value = &view
		rowIndex++
	}
	return out, nil
}

func int32Pointer(value int32) *int32 { return &value }
